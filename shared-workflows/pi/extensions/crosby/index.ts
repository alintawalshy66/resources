import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiraTrackerAdapter } from "./jira.mjs";
import {
  createCrosbyDashboard,
  markDashboardExecutionFinalized,
  markDashboardExecutionFinished,
  markDashboardExecutionStarted,
  markDashboardFatalError,
  markDashboardHerdrWorkerStarted,
  markDashboardPaneOpened,
  persistDashboardEvent,
  reconcileDashboardFromQueue,
  renderCrosbyCompactDashboard,
  renderCrosbyDashboard,
} from "./dashboard.mjs";
import {
  assertNoLocalBranchCleanupRequired,
  buildPiWorkerExtraArgs,
  buildPiWorkerSessionName,
  fetchParentQueue,
  findExistingCrosbyDashboardPane,
  findExistingCrosbyWorkerAgent,
  mergeChecklistAndNativeIssueChildren,
  parseCrosbyCommandArgs,
  publishParentPullRequest,
  reviewParentPullRequest,
  runQueueExecution,
  runWatchMode,
} from "./lib-v2.mjs";

function getGhInvocation(args: string[]) {
  const configured = process.env.GH_BIN?.trim();
  return { command: configured || "gh", args };
}

function getGitInvocation(args: string[]) {
  const configured = process.env.GIT_BIN?.trim();
  return { command: configured || "git", args };
}

const DEFAULT_CROSBY_CLAUDE_MODEL =
  process.env.CROSBY_CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";
const DEFAULT_CROSBY_CLAUDE_EFFORT =
  process.env.CROSBY_CLAUDE_EFFORT?.trim() || "medium";

function updateCrosbyDashboardWidget(ctx: any, dashboard: any) {
  if (!dashboard || typeof ctx?.ui?.setWidget !== "function") return;
  try {
    ctx.ui.setWidget(
      "crosby-dashboard",
      renderCrosbyCompactDashboard(dashboard),
      { placement: "aboveEditor" },
    );
  } catch {
    // Dashboard rendering is best-effort and should never stop Crosby execution.
  }
}

function createCrosbyDashboardController(ctx: any, queue: any, mode: string) {
  let dashboard = createCrosbyDashboard(queue, { mode });
  updateCrosbyDashboardWidget(ctx, dashboard);
  persistDashboardEvent(dashboard);

  return {
    get dashboard() {
      return dashboard;
    },
    reset(nextQueue: any, nextMode = mode) {
      dashboard = createCrosbyDashboard(nextQueue, { mode: nextMode });
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
      return dashboard;
    },
    executionStarted(event: any) {
      markDashboardExecutionStarted(dashboard, event);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
    herdrWorkerStarted(event: any) {
      markDashboardHerdrWorkerStarted(dashboard, event);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
    dashboardPaneOpened(event: any) {
      markDashboardPaneOpened(dashboard, event);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
    executionFinished(event: any) {
      markDashboardExecutionFinished(dashboard, event);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
    executionFinalized(event: any) {
      markDashboardExecutionFinalized(dashboard, event);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
    queueRefreshed(queue: any) {
      reconcileDashboardFromQueue(dashboard, queue);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
    fatal(error: unknown) {
      markDashboardFatalError(dashboard, error);
      updateCrosbyDashboardWidget(ctx, dashboard);
      persistDashboardEvent(dashboard);
    },
  };
}

function getClaudeInvocation(args: string[]) {
  const configured = process.env.CLAUDE_BIN?.trim();
  return { command: configured || "claude", args };
}

const GITHUB_STATUS_LABELS = [
  "status:ready",
  "status:execute",
  "status:ready-to-build",
  "status:building",
  "status:review",
];

function normalizeIssueRef(issueRef: string | number | undefined | null) {
  const raw = String(issueRef ?? "").trim();
  if (!raw) return raw;

  const urlMatch = raw.match(/\/issues\/(\d+)(?:\b|$)/i);
  if (urlMatch) return urlMatch[1];

  const hashMatch = raw.match(/^#?(\d+)$/);
  if (hashMatch) return hashMatch[1];

  return raw;
}

function formatIssueViewRef(issueRef: string | number | undefined | null) {
  const raw = String(issueRef ?? "").trim();
  if (/^https?:\/\/[^\s]+\/issues\/\d+(?:\b|$)/i.test(raw)) return raw;
  return normalizeIssueRef(issueRef);
}

function formatIssueIdentifier(issue: any) {
  const number = issue?.number ?? normalizeIssueRef(issue?.identifier);
  return number ? `#${number}` : String(issue?.identifier ?? "UNKNOWN-ISSUE");
}

function getIssueLabelNames(issue: any) {
  const labels = issue?.labels;
  if (Array.isArray(labels)) {
    return labels
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean);
  }
  if (Array.isArray(labels?.nodes)) {
    return labels.nodes.map((label: any) => label?.name).filter(Boolean);
  }
  return [];
}

function getStatusNameFromGitHubIssue(issue: any) {
  if (String(issue?.state ?? "").toUpperCase() === "CLOSED") return "Done";

  const labels = getIssueLabelNames(issue).map((label: string) =>
    label.toLowerCase(),
  );
  if (labels.includes("status:execute")) return "Execute";
  if (labels.includes("status:building")) return "Building";
  if (labels.includes("status:ready-to-build")) return "Ready to Build";
  if (labels.includes("status:review")) return "Review";
  if (labels.includes("status:ready")) return "Ready";
  return "Unknown";
}

function getStatusTypeFromStatusName(statusName: string) {
  const normalized = statusName.toLowerCase();
  if (normalized === "done") return "completed";
  if (["building", "execute"].includes(normalized)) return "started";
  if (normalized === "review") return "review";
  return "unstarted";
}

function parseChildIssueRefs(body: string | undefined) {
  const refs: string[] = [];
  const seen = new Set<string>();
  const text = String(body ?? "");
  const childSectionMatch = text.match(
    /(?:^|\n)##\s+Child Issues\s*\n([\s\S]*?)(?=\n##\s+|$)/i,
  );
  const searchable = childSectionMatch?.[1] ?? "";

  for (const match of searchable.matchAll(/(?:^|[^\w/])#(\d+)\b/gm)) {
    const ref = match[1];
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

function parseParentIssueRef(body: string | undefined) {
  const match = String(body ?? "").match(/(?:^|\n)\s*Parent:\s*#?(\d+)\b/i);
  return match ? `#${match[1]}` : undefined;
}

function deriveBranchName(issue: any) {
  const body = String(issue?.body ?? "");
  const bodyMatch = body.match(/(?:^|\n)\s*Branch:\s*([^\n]+)\s*/i);
  if (bodyMatch?.[1]?.trim()) return bodyMatch[1].trim();

  const labelNames = getIssueLabelNames(issue);
  const branchLabel = labelNames.find((label: string) =>
    /^branch:/i.test(label),
  );
  if (branchLabel) return branchLabel.replace(/^branch:/i, "").trim();

  const slug = String(issue?.title ?? "issue")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const number = normalizeIssueRef(issue?.identifier ?? issue?.number);
  return `issue-${number}${slug ? `-${slug}` : ""}`;
}

function formatParentContextForSession(queue: any) {
  const parent = queue?.parent;
  const labels = getIssueLabelNames(parent);
  const milestone =
    parent?.milestone?.title ?? parent?.milestone?.name ?? "none";
  const children = Array.isArray(queue?.children) ? queue.children : [];
  const body = String(parent?.body ?? "").trim();

  return [
    `Crosby parent context loaded: ${parent?.identifier ?? "unknown"} — ${parent?.title ?? "Untitled"}`,
    "",
    `URL: ${parent?.url ?? "unknown"}`,
    `Status: ${parent?.state?.name ?? "unknown"}`,
    `Milestone: ${milestone}`,
    `Branch: ${parent?.branchName ?? "unknown"}`,
    `Labels: ${labels.length ? labels.join(", ") : "none"}`,
    "",
    "Parent body:",
    body || "(empty)",
    "",
    "Child queue:",
    ...(children.length
      ? children.map(
          (child: any) =>
            `- ${child.identifier} ${child.title} — ${child?.state?.name ?? "unknown"}`,
        )
      : ["- none"]),
  ].join("\n");
}

function toCrosbyIssue(githubIssue: any, children: any[] = []) {
  const statusName = getStatusNameFromGitHubIssue(githubIssue);
  const parentIdentifier = parseParentIssueRef(githubIssue?.body);
  const labels = getIssueLabelNames(githubIssue)
    .map((name: string) => ({ name }))
    .filter((label: any) => label.name);

  return {
    ...githubIssue,
    identifier: formatIssueIdentifier(githubIssue),
    number: githubIssue?.number,
    title: githubIssue?.title,
    description: githubIssue?.body,
    body: githubIssue?.body,
    url: githubIssue?.url,
    branchName: deriveBranchName(githubIssue),
    state: {
      name: statusName,
      type: getStatusTypeFromStatusName(statusName),
    },
    labels: { nodes: labels },
    milestone: githubIssue?.milestone,
    parent: parentIdentifier ? { identifier: parentIdentifier } : undefined,
    children,
    comments: {
      nodes: Array.isArray(githubIssue?.comments)
        ? githubIssue.comments
        : (githubIssue?.comments?.nodes ?? []),
    },
  };
}

const GITHUB_TRANSIENT_RETRY_DELAYS_MS = [500, 1500, 3000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGitHubCliFailure(details: string) {
  return /\b(eof|timeout|timed out|connection reset|connection refused|tls handshake timeout|temporary failure|service unavailable|502 bad gateway|503 service unavailable|504 gateway timeout)\b/i.test(
    details,
  );
}

async function execGhJson(
  pi: ExtensionAPI,
  args: string[],
  errorContext: string,
  options?: { cwd?: string },
) {
  const invocation = getGhInvocation(args);
  let lastDetails = "";

  for (
    let attempt = 0;
    attempt <= GITHUB_TRANSIENT_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    const result = await pi.exec(
      invocation.command,
      invocation.args,
      options?.cwd ? { cwd: options.cwd } : undefined,
    );

    if (result.code === 0) {
      try {
        return JSON.parse(result.stdout || "null");
      } catch (error) {
        throw new Error(
          `${errorContext}. Failed to parse GitHub CLI JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    lastDetails = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();

    const retryDelay = GITHUB_TRANSIENT_RETRY_DELAYS_MS[attempt];
    if (retryDelay === undefined || !isTransientGitHubCliFailure(lastDetails)) {
      throw new Error(
        lastDetails
          ? `${errorContext}. ${lastDetails}`
          : `${errorContext}. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
      );
    }

    await sleep(retryDelay);
  }

  throw new Error(
    lastDetails
      ? `${errorContext}. ${lastDetails}`
      : `${errorContext}. GitHub command: ${invocation.command}.`,
  );
}

async function loadNativeSubIssuesFromGitHub(pi: ExtensionAPI, issue: any) {
  if (!issue?.id) return [];

  const result = await execGhJson(
    pi,
    [
      "api",
      "graphql",
      "-f",
      `query=query($issueId: ID!) {
        node(id: $issueId) {
          ... on Issue {
            subIssues(first: 100) {
              nodes {
                number
                title
                body
                state
                labels(first: 100) { nodes { name } }
                milestone { title }
                url
                comments(first: 100) { nodes { body } }
              }
            }
          }
        }
      }`,
      "-f",
      `issueId=${issue.id}`,
    ],
    `Failed to load native GitHub sub-issues for ${formatIssueIdentifier(issue)}`,
  );

  return Array.isArray(result?.data?.node?.subIssues?.nodes)
    ? result.data.node.subIssues.nodes
    : [];
}

async function loadIssueFromGitHub(
  pi: ExtensionAPI,
  issueRef: string | number,
  options: { includeChildren?: boolean } = {},
) {
  const issueViewRef = formatIssueViewRef(issueRef);
  const issue = await execGhJson(
    pi,
    [
      "issue",
      "view",
      issueViewRef,
      "--json",
      "id,number,title,body,state,labels,milestone,url,comments",
    ],
    `Failed to load GitHub issue ${issueRef}`,
  );

  let children: any[] = [];
  if (options.includeChildren !== false) {
    const childRefs = parseChildIssueRefs(issue?.body).filter(
      (ref) => ref !== String(issue?.number),
    );
    const checklistChildren = await Promise.all(
      childRefs.map((ref) =>
        loadIssueFromGitHub(pi, ref, { includeChildren: false }),
      ),
    );
    const nativeChildren = (await loadNativeSubIssuesFromGitHub(pi, issue)).map(
      (child) => toCrosbyIssue(child, []),
    );

    children = mergeChecklistAndNativeIssueChildren(
      checklistChildren,
      nativeChildren,
      issue?.number,
    );
  }

  return toCrosbyIssue(issue, children);
}

async function loadIssuesByLabelFromGitHub(pi: ExtensionAPI, labels: string[]) {
  const args = [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,body,state,labels,milestone,url",
  ];
  for (const label of labels) {
    args.push("--label", label);
  }

  const issues = await execGhJson(
    pi,
    args,
    `Failed to load GitHub issues with labels ${labels.join(", ")}`,
  );
  return Promise.all(
    (Array.isArray(issues) ? issues : []).map((issue) =>
      loadIssueFromGitHub(pi, issue.number),
    ),
  );
}

async function loadExecuteParentQueuesFromGitHub(pi: ExtensionAPI) {
  const executeParents = await loadIssuesByLabelFromGitHub(pi, [
    "type:parent",
    "status:execute",
  ]);
  return Promise.all(
    executeParents.map((issue) =>
      fetchParentQueue(issue.identifier, (key) => loadIssueFromGitHub(pi, key)),
    ),
  );
}

function labelsForTargetState(state: string) {
  switch (String(state).toLowerCase().replace(/\s+/g, " ").trim()) {
    case "building":
    case "build":
      return { add: "status:building", close: false };
    case "review":
    case "in review":
      return { add: "status:review", close: false };
    case "execute":
      return { add: "status:execute", close: false };
    case "ready to build":
      return { add: "status:ready-to-build", close: false };
    case "ready":
      return { add: "status:ready", close: false };
    case "done":
      return { add: undefined, close: true };
    default:
      return { add: undefined, close: false };
  }
}

async function moveIssue(pi: ExtensionAPI, issueRef: string, state: string) {
  const normalizedRef = normalizeIssueRef(issueRef);
  const target = labelsForTargetState(state);

  if (target.close) {
    const invocation = getGhInvocation(["issue", "close", normalizedRef]);
    const result = await pi.exec(invocation.command, invocation.args);
    if (result.code !== 0) {
      const details = [result.stderr, result.stdout]
        .filter(Boolean)
        .join("\n")
        .trim();
      throw new Error(
        details
          ? `Failed to close GitHub issue ${issueRef}. ${details}`
          : `Failed to close GitHub issue ${issueRef}.`,
      );
    }
    return;
  }

  if (!target.add) return;

  const args = ["issue", "edit", normalizedRef, "--add-label", target.add];
  for (const statusLabel of GITHUB_STATUS_LABELS) {
    if (statusLabel !== target.add) {
      args.push("--remove-label", statusLabel);
    }
  }

  const invocation = getGhInvocation(args);
  const result = await pi.exec(invocation.command, invocation.args);
  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Failed to move GitHub issue ${issueRef} to ${state}. ${details}`
        : `Failed to move GitHub issue ${issueRef} to ${state}.`,
    );
  }
}

async function addIssueComment(
  pi: ExtensionAPI,
  issueRef: string,
  body: string,
) {
  const invocation = getGhInvocation([
    "issue",
    "comment",
    normalizeIssueRef(issueRef),
    "--body",
    body,
  ]);
  const result = await pi.exec(invocation.command, invocation.args);

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Failed to add GitHub issue comment to ${issueRef}. ${details}`
        : `Failed to add GitHub issue comment to ${issueRef}.`,
    );
  }
}

type CrosbyTrackerAdapter = {
  kind: "github" | "jira";
  fetchParentQueue: (issueRef: string) => Promise<any>;
  loadIssue: (issueRef: string) => Promise<any>;
  moveIssue: (issueRef: string, state: string) => Promise<void>;
  addComment: (issueRef: string, body: string) => Promise<void>;
};

function createGitHubTrackerAdapter(pi: ExtensionAPI): CrosbyTrackerAdapter {
  return {
    kind: "github",
    fetchParentQueue: (issueRef) =>
      fetchParentQueue(issueRef, (key) => loadIssueFromGitHub(pi, key)),
    loadIssue: (issueRef) => loadIssueFromGitHub(pi, issueRef),
    moveIssue: (issueRef, state) => moveIssue(pi, issueRef, state),
    addComment: (issueRef, body) => addIssueComment(pi, issueRef, body),
  };
}

const JIRA_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;
const JIRA_BROWSE_URL_PATTERN =
  /^https?:\/\/[^\s/]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#].*)?$/i;

function extractJiraIssueKey(issueRef: string) {
  const raw = String(issueRef ?? "").trim();
  if (JIRA_ISSUE_KEY_PATTERN.test(raw)) return raw;

  const browseUrlMatch = raw.match(JIRA_BROWSE_URL_PATTERN);
  return browseUrlMatch ? browseUrlMatch[1].toUpperCase() : null;
}

function selectTrackerAdapter(
  pi: ExtensionAPI,
  issueRef: string,
): {
  tracker: "github" | "jira";
  issueKey: string;
  adapter: CrosbyTrackerAdapter;
} {
  const jiraIssueKey = extractJiraIssueKey(issueRef);
  const tracker = jiraIssueKey ? "jira" : "github";

  return {
    tracker,
    issueKey: jiraIssueKey ?? String(issueRef ?? "").trim(),
    adapter:
      tracker === "jira"
        ? createJiraTrackerAdapter()
        : createGitHubTrackerAdapter(pi),
  };
}

async function getPullRequestForBranch(
  pi: ExtensionAPI,
  branchName: string | undefined,
  cwd: string,
  options?: { allowMissing?: boolean },
) {
  const invocation = getGhInvocation([
    "pr",
    "view",
    ...(branchName ? [branchName] : []),
    "--json",
    "number,url,body,headRefName",
  ]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    if (
      options?.allowMissing &&
      /no pull requests found for branch/i.test(details)
    ) {
      return null;
    }
    throw new Error(
      details
        ? `Failed to load pull request details for branch ${branchName ?? "current"}. ${details}`
        : `Failed to load pull request details for branch ${branchName ?? "current"}. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `Failed to parse pull request details for branch ${branchName ?? "current"}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function createPullRequest(
  pi: ExtensionAPI,
  title: string,
  body: string,
  branchName: string | undefined,
  cwd: string,
) {
  const invocation = getGhInvocation([
    "pr",
    "create",
    ...(branchName ? ["--head", branchName] : []),
    "--title",
    title,
    "--body",
    body,
  ]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Failed to create pull request for branch ${branchName ?? "current"}. ${details}`
        : `Failed to create pull request for branch ${branchName ?? "current"}. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  const pullRequest = await getPullRequestForBranch(pi, branchName, cwd, {
    allowMissing: false,
  });
  if (!pullRequest) {
    throw new Error(
      `Pull request creation reported success but no PR was found for branch ${branchName ?? "current"}.`,
    );
  }

  return pullRequest;
}

async function updatePullRequestBody(
  pi: ExtensionAPI,
  prNumber: number,
  body: string,
  cwd: string,
) {
  const invocation = getGhInvocation([
    "pr",
    "edit",
    String(prNumber),
    "--body",
    body,
  ]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Failed to update PR #${prNumber} description. ${details}`
        : `Failed to update PR #${prNumber} description. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }
}

async function addPullRequestComment(
  pi: ExtensionAPI,
  prNumber: number,
  body: string,
  cwd: string,
) {
  const invocation = getGhInvocation([
    "pr",
    "comment",
    String(prNumber),
    "--body",
    body,
  ]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Failed to add PR comment to #${prNumber}. ${details}`
        : `Failed to add PR comment to #${prNumber}. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }
}

async function readImplementationSummary(cwd: string) {
  const summaryPath = path.join(cwd, "implementation_summary.md");
  try {
    return await readFile(summaryPath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read implementation_summary.md from ${summaryPath}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function execGit(pi: ExtensionAPI, args: string[], cwd: string) {
  const invocation = getGitInvocation(args);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Git command failed in ${cwd}. ${details}`
        : `Git command failed in ${cwd}. Command: ${invocation.command} ${invocation.args.join(" ")}. Exit code: ${result.code}.`,
    );
  }

  return result;
}

async function isGitRepository(pi: ExtensionAPI, cwd: string) {
  const invocation = getGitInvocation(["rev-parse", "--is-inside-work-tree"]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });
  return result.code === 0 && result.stdout.trim() === "true";
}

async function getCurrentGitBranch(pi: ExtensionAPI, cwd: string) {
  const result = await execGit(pi, ["branch", "--show-current"], cwd);
  return result.stdout.trim();
}

async function hasLocalGitBranch(
  pi: ExtensionAPI,
  cwd: string,
  branchName: string,
) {
  const result = await execGit(pi, ["branch", "--list", branchName], cwd);
  return result.stdout.trim().length > 0;
}

async function hasRemoteGitBranch(
  pi: ExtensionAPI,
  cwd: string,
  branchName: string,
) {
  const result = await execGit(
    pi,
    ["branch", "-r", "--list", `origin/${branchName}`],
    cwd,
  );
  return result.stdout.trim().length > 0;
}

async function hasUncommittedGitChanges(pi: ExtensionAPI, cwd: string) {
  const result = await execGit(pi, ["status", "--short"], cwd);
  return result.stdout.trim().length > 0;
}

async function loadLocalBranchCleanupFacts(
  pi: ExtensionAPI,
  cwd: string,
  baseBranch = "main",
) {
  const branchList = await execGit(
    pi,
    [
      "for-each-ref",
      "--format=%(refname:short)%09%(upstream:short)%09%(committerdate:iso8601-strict)%09%(HEAD)",
      "refs/heads",
    ],
    cwd,
  );
  const currentBranch = await getCurrentGitBranch(pi, cwd);
  const merged = await execGit(
    pi,
    ["branch", "--merged", baseBranch, "--format=%(refname:short)"],
    cwd,
  );
  const mergedBranches = new Set(
    merged.stdout
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\*\s*/, ""))
      .filter(Boolean),
  );

  return Promise.all(
    branchList.stdout
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map(async (line) => {
        const [name = "", upstream = "", lastCommitDate = "", head = ""] =
          line.split("\t");
        const isCurrent = head.trim() === "*" || name === currentBranch;
        let ahead = null;
        if (isCurrent && name !== baseBranch) {
          try {
            const aheadResult = await execGit(
              pi,
              ["rev-list", "--count", `${baseBranch}..${name}`],
              cwd,
            );
            const parsedAhead = Number.parseInt(aheadResult.stdout.trim(), 10);
            ahead = Number.isFinite(parsedAhead) ? parsedAhead : null;
          } catch {
            ahead = null;
          }
        }

        return {
          name,
          upstream,
          lastCommitDate: lastCommitDate || null,
          current: isCurrent,
          merged: mergedBranches.has(name),
          ahead,
        };
      }),
  );
}

function getParentIssueNumber(parent: any) {
  const raw = String(parent?.identifier ?? parent?.number ?? "").trim();
  const match = raw.match(/\d+/);
  return match ? match[0] : null;
}

function isAllowedCrosbyRunBranch(branch: any, parent: any) {
  const branchName = String(branch?.name ?? "").trim();
  const parentBranchName = String(parent?.branchName ?? "").trim();

  if (branchName === "main") return true;
  if (parentBranchName && branchName === parentBranchName) return true;

  const parentNumber = getParentIssueNumber(parent);
  if (
    parentNumber &&
    branch?.merged === true &&
    branchName.startsWith(`crosby/${parentNumber}/`)
  ) {
    return true;
  }

  return false;
}

async function assertBranchCleanupPreflight(
  pi: ExtensionAPI,
  cwd: string | undefined,
  context: { parent?: any } = {},
) {
  if (!cwd) {
    throw new Error(
      "Cannot run Crosby branch cleanup preflight because no local project directory was resolved.",
    );
  }

  const parentBranchName = String(context.parent?.branchName ?? "").trim();
  const baseBranch = parentBranchName || "main";
  const branches = await loadLocalBranchCleanupFacts(pi, cwd, baseBranch);
  const blockingBranches = branches.filter(
    (branch) => !isAllowedCrosbyRunBranch(branch, context.parent),
  );
  assertNoLocalBranchCleanupRequired(blockingBranches, { baseBranch });
}

async function getGitRevision(pi: ExtensionAPI, cwd: string, revision: string) {
  const result = await execGit(pi, ["rev-parse", revision], cwd);
  return result.stdout.trim();
}

function getIssueNumber(issue: any) {
  return String(issue?.number ?? issue?.identifier ?? "").match(/\d+/)?.[0] ?? "issue";
}

function slugifyBranchPart(value: string | undefined | null, fallback = "work") {
  const slug = String(value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function deriveChildBranchName(parentIssue: any, childIssue: any) {
  const parentNumber = getIssueNumber(parentIssue);
  const childNumber = getIssueNumber(childIssue);
  return `crosby/${parentNumber}/${childNumber}-${slugifyBranchPart(childIssue?.title, "child")}`;
}

async function isGitAncestor(
  pi: ExtensionAPI,
  cwd: string,
  ancestor: string,
  descendant: string,
) {
  const invocation = getGitInvocation([
    "merge-base",
    "--is-ancestor",
    ancestor,
    descendant,
  ]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });
  if (result.code === 0) return true;
  if (result.code === 1) return false;

  const details = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  throw new Error(
    details
      ? `Git ancestry check failed in ${cwd}. ${details}`
      : `Git ancestry check failed in ${cwd}. Command: ${invocation.command} ${invocation.args.join(" ")}. Exit code: ${result.code}.`,
  );
}

async function snapshotGitState(pi: ExtensionAPI, cwd?: string) {
  if (!cwd) {
    return {
      available: false,
      diagnostic: "No local project directory was resolved before worker execution.",
    };
  }

  if (!(await isGitRepository(pi, cwd))) {
    return {
      available: false,
      cwd,
      diagnostic: `Resolved worker directory ${cwd} is not a git repository.`,
    };
  }

  return {
    available: true,
    cwd,
    branch: await getCurrentGitBranch(pi, cwd),
    head: await getGitRevision(pi, cwd, "HEAD"),
  };
}

async function hasCommittedWorkSince(
  pi: ExtensionAPI,
  cwd: string | undefined,
  before: any,
  parentIssue: any,
  expectedBranchName?: string,
) {
  if (!before?.available) {
    return {
      hasCommittedWork: false,
      diagnostic:
        before?.diagnostic ??
        "Crosby could not snapshot git state before worker execution.",
    };
  }

  if (!cwd) {
    return {
      hasCommittedWork: false,
      diagnostic: "No local project directory was resolved after worker execution.",
    };
  }

  if (!(await isGitRepository(pi, cwd))) {
    return {
      hasCommittedWork: false,
      diagnostic: `Resolved worker directory ${cwd} is not a git repository after worker execution.`,
    };
  }

  const currentBranch = await getCurrentGitBranch(pi, cwd);
  const currentHead = await getGitRevision(pi, cwd, "HEAD");
  const expectedBranch = String(
    expectedBranchName ?? parentIssue?.branchName ?? before.branch ?? "",
  ).trim();

  if (expectedBranch && currentBranch !== expectedBranch) {
    return {
      hasCommittedWork: false,
      diagnostic: `Worker finished on branch ${currentBranch || "(detached HEAD)"}, expected parent branch ${expectedBranch}.`,
    };
  }

  if (currentHead === before.head) {
    return {
      hasCommittedWork: false,
      diagnostic: `No new commit found on ${currentBranch || "(detached HEAD)"}; HEAD remained ${currentHead}.`,
    };
  }

  if (!(await isGitAncestor(pi, cwd, before.head, currentHead))) {
    return {
      hasCommittedWork: false,
      diagnostic: `HEAD changed from ${before.head} to ${currentHead}, but the new HEAD is not descended from the pre-worker snapshot on ${currentBranch || "(detached HEAD)"}.`,
    };
  }

  return {
    hasCommittedWork: true,
    diagnostic: `New commit ${currentHead} found on ${currentBranch || "(detached HEAD)"} after ${before.head}.`,
  };
}

async function assertCleanWorkingTree(
  pi: ExtensionAPI,
  cwd: string,
  command: "push" | "review",
) {
  if (!(await hasUncommittedGitChanges(pi, cwd))) return;

  throw new Error(
    `Cannot run /crosby ${command} in ${cwd} because the working tree has uncommitted changes. Recovery: commit, stash, or discard the local changes first, then rerun /crosby ${command}.`,
  );
}

async function pushGitBranch(
  pi: ExtensionAPI,
  cwd: string,
  branchName?: string,
) {
  const resolvedBranchName = String(branchName ?? "").trim();
  if (!resolvedBranchName) {
    throw new Error(
      "Cannot push the parent branch because no branch name could be resolved. Recovery: add a `Branch:` line or `branch:<name>` label to the parent issue, then rerun /crosby push.",
    );
  }

  await execGit(pi, ["push", "-u", "origin", resolvedBranchName], cwd);
}

async function prepareChildBranch(
  pi: ExtensionAPI,
  parentIssue: any,
  childIssue: any,
  cwd?: string,
) {
  const issueKey = childIssue?.identifier ?? "UNKNOWN-CHILD";
  const parentBranch = String(parentIssue?.branchName ?? "").trim();
  const childBranch = deriveChildBranchName(parentIssue, childIssue);

  if (!cwd) {
    throw new Error(
      `Cannot create child branch for ${issueKey} because no local project directory was resolved.`,
    );
  }
  if (!parentBranch) {
    throw new Error(
      `Cannot create child branch for ${issueKey} because parent ${parentIssue?.identifier ?? "UNKNOWN-PARENT"} has no branch name.`,
    );
  }
  if (await hasUncommittedGitChanges(pi, cwd)) {
    throw new Error(
      `Cannot create child branch ${childBranch} for ${issueKey} because ${cwd} has uncommitted changes.`,
    );
  }

  const currentBranch = await getCurrentGitBranch(pi, cwd);
  if (currentBranch !== parentBranch) {
    throw new Error(
      `Cannot create child branch ${childBranch} for ${issueKey}; expected to be on parent branch ${parentBranch}, found ${currentBranch || "(detached HEAD)"}.`,
    );
  }

  const parentHead = await getGitRevision(pi, cwd, "HEAD");
  if (await hasLocalGitBranch(pi, cwd, childBranch)) {
    await execGit(pi, ["checkout", childBranch], cwd);
    const childHead = await getGitRevision(pi, cwd, "HEAD");
    if (!(await isGitAncestor(pi, cwd, parentHead, childHead))) {
      throw new Error(
        `Existing child branch ${childBranch} does not descend from current parent HEAD ${parentHead}.`,
      );
    }
  } else {
    await execGit(pi, ["checkout", "-b", childBranch], cwd);
  }

  return { name: childBranch, parentBranch, parentHead };
}

async function runVerificationCommand(
  pi: ExtensionAPI,
  cwd: string | undefined,
  command: string,
) {
  if (!cwd) {
    throw new Error("No local project directory was resolved for verification.");
  }

  const result = await pi.exec("bash", ["-lc", command], { cwd });
  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Verification command failed: ${details}`
        : `Verification command failed with exit code ${result.code}.`,
    );
  }
}

async function mergeChildBranchIntoParent(
  pi: ExtensionAPI,
  parentIssue: any,
  childIssue: any,
  childBranchInfo: any,
  cwd?: string,
) {
  const issueKey = childIssue?.identifier ?? "UNKNOWN-CHILD";
  const parentBranch = String(
    childBranchInfo?.parentBranch ?? parentIssue?.branchName ?? "",
  ).trim();
  const childBranch = String(childBranchInfo?.name ?? "").trim();

  if (!cwd) {
    throw new Error(`Cannot merge ${issueKey} because no local project directory was resolved.`);
  }
  if (!parentBranch || !childBranch) {
    throw new Error(`Cannot merge ${issueKey} because parent or child branch name is missing.`);
  }
  if (await hasUncommittedGitChanges(pi, cwd)) {
    throw new Error(`Cannot merge ${childBranch} into ${parentBranch} because ${cwd} has uncommitted changes.`);
  }

  const childHead = await getGitRevision(pi, cwd, "HEAD");
  const currentBranch = await getCurrentGitBranch(pi, cwd);
  if (currentBranch !== childBranch) {
    throw new Error(
      `Cannot merge ${issueKey}; expected current branch ${childBranch}, found ${currentBranch || "(detached HEAD)"}.`,
    );
  }

  await execGit(pi, ["checkout", parentBranch], cwd);
  await execGit(pi, ["merge", "--ff-only", childBranch], cwd);

  const parentHead = await getGitRevision(pi, cwd, "HEAD");
  if (!(await isGitAncestor(pi, cwd, childHead, parentHead))) {
    throw new Error(
      `Merge verification failed: child HEAD ${childHead} is not contained in parent branch ${parentBranch}.`,
    );
  }
}

async function ensureParentBranch(
  pi: ExtensionAPI,
  parentIssue: any,
  cwd?: string,
) {
  const issueKey = parentIssue?.identifier ?? "UNKNOWN-PARENT";
  const branchName = String(parentIssue?.branchName ?? "").trim();

  if (!cwd) {
    throw new Error(
      `Cannot ensure the feature branch for ${issueKey} because no local project directory was resolved. Recovery: add a folder label matching the local repo, then rerun /crosby ${issueKey}.`,
    );
  }

  if (!branchName) {
    throw new Error(
      `Parent issue ${issueKey} is missing a branch name. Recovery: add a Branch: line or branch:<name> label to the parent GitHub issue, then rerun /crosby ${issueKey}.`,
    );
  }

  if (!(await isGitRepository(pi, cwd))) {
    throw new Error(
      `Resolved project directory ${cwd} for parent ${issueKey} is not a git repository. Recovery: point the issue label at the correct local repo folder, or initialize/clone the repo there, then rerun /crosby ${issueKey}.`,
    );
  }

  const currentBranch = await getCurrentGitBranch(pi, cwd);
  if (currentBranch === branchName) return;

  const dirty = await hasUncommittedGitChanges(pi, cwd);
  const hasLocalTarget = await hasLocalGitBranch(pi, cwd, branchName);
  if (dirty) {
    if (hasLocalTarget) {
      const currentRevision = await getGitRevision(pi, cwd, "HEAD");
      const targetRevision = await getGitRevision(pi, cwd, branchName);
      if (currentRevision === targetRevision) {
        await execGit(pi, ["checkout", branchName], cwd);
        return;
      }
    }

    throw new Error(
      `Cannot switch ${cwd} from branch ${currentBranch || "(detached HEAD)"} to ${branchName} for parent ${issueKey} because the working tree has uncommitted changes. Recovery: if these changes belong to this parent run and ${branchName} points at the same commit, run 'git switch ${branchName}' from ${cwd} and rerun /crosby ${issueKey}; otherwise commit, stash, or discard the local changes first.`,
    );
  }

  if (hasLocalTarget) {
    await execGit(pi, ["checkout", branchName], cwd);
  } else if (await hasRemoteGitBranch(pi, cwd, branchName)) {
    await execGit(
      pi,
      ["checkout", "-b", branchName, "--track", `origin/${branchName}`],
      cwd,
    );
  } else {
    await execGit(pi, ["checkout", "-b", branchName], cwd);
  }

  const verifiedBranch = await getCurrentGitBranch(pi, cwd);
  if (verifiedBranch !== branchName) {
    throw new Error(
      `Expected repo in ${cwd} to be on branch ${branchName} for ${issueKey}, but found ${verifiedBranch || "(detached HEAD)"}. Recovery: switch to ${branchName} manually, then rerun /crosby ${issueKey}.`,
    );
  }
}

async function runClaudeReviewWorker(
  pi: ExtensionAPI,
  prompt: string,
  cwd: string,
) {
  const schema = JSON.stringify({
    type: "object",
    additionalProperties: false,
    properties: {
      outcome: { type: "string", enum: ["clean", "fixed", "error"] },
      summary: { type: "string" },
      changes: { type: "array", items: { type: "string" } },
      tests: { type: "array", items: { type: "string" } },
      remainingConcerns: { type: "array", items: { type: "string" } },
      commits: { type: "array", items: { type: "string" } },
    },
    required: [
      "outcome",
      "summary",
      "changes",
      "tests",
      "remainingConcerns",
      "commits",
    ],
  });
  const invocation = getClaudeInvocation([
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--model",
    DEFAULT_CROSBY_CLAUDE_MODEL,
    "--effort",
    DEFAULT_CROSBY_CLAUDE_EFFORT,
    "--json-schema",
    schema,
    prompt,
  ]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Claude review worker failed. ${details}`
        : `Claude review worker failed. Claude command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  return result;
}

function getPiInvocation() {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");

  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args: [] };
  }

  return { command: "pi", args: [] };
}

function getHerdrInvocation(args: string[]) {
  const configured = process.env.HERDR_BIN?.trim();
  return { command: configured || "herdr", args };
}

function getNodeInvocation(args: string[]) {
  const configured = process.env.NODE_BIN?.trim();
  return { command: configured || "node", args };
}

function isInsideHerdr() {
  return process.env.HERDR_ENV === "1" && !!process.env.HERDR_PANE_ID;
}

function shouldOpenCrosbyDashboardPane() {
  const setting = String(process.env.CROSBY_DASHBOARD_PANE ?? "")
    .trim()
    .toLowerCase();
  if (["0", "false", "no", "off"].includes(setting)) return false;
  return isInsideHerdr();
}

function getDashboardRunnerScriptPath() {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "dashboard-runner.mjs",
  );
}

async function findExistingDashboardPane(pi: ExtensionAPI) {
  const args = ["pane", "list"];
  if (process.env.HERDR_WORKSPACE_ID) {
    args.push("--workspace", process.env.HERDR_WORKSPACE_ID);
  }
  const listed = await execHerdrJson(
    pi,
    args,
    "Failed to inspect Herdr panes for an existing Crosby dashboard",
  );
  return findExistingCrosbyDashboardPane(listed?.result?.panes, {
    tabId: process.env.HERDR_TAB_ID,
    workspaceId: process.env.HERDR_WORKSPACE_ID,
  });
}

async function startDashboardRunnerInPane(
  pi: ExtensionAPI,
  paneId: string,
  runId: string,
  options: { restart?: boolean } = {},
) {
  if (options.restart) {
    await execHerdr(pi, ["pane", "send-keys", paneId, "ctrl+c"], "Failed to stop existing Crosby dashboard runner").catch(() => {
      // The pane may already be idle; continue and start the new runner.
    });
  }

  const nodeInvocation = getNodeInvocation([
    getDashboardRunnerScriptPath(),
    "--run",
    runId,
  ]);
  await execHerdr(
    pi,
    [
      "pane",
      "run",
      paneId,
      nodeInvocation.command,
      ...nodeInvocation.args,
    ],
    "Failed to start Crosby dashboard runner in Herdr pane",
  );
}

async function openCrosbyDashboardPane(
  pi: ExtensionAPI,
  dashboardController: ReturnType<
    typeof createCrosbyDashboardController
  > | null,
) {
  if (!dashboardController) return;
  if (dashboardController.dashboard.dashboardPaneId) return;
  if (!shouldOpenCrosbyDashboardPane()) return;

  try {
    const existingPane = await findExistingDashboardPane(pi).catch(() => null);
    if (existingPane?.pane_id) {
      await startDashboardRunnerInPane(
        pi,
        existingPane.pane_id,
        dashboardController.dashboard.runId,
        { restart: true },
      );
      dashboardController.dashboardPaneOpened({ paneId: existingPane.pane_id });
      return;
    }

    const opened = await execHerdr(
      pi,
      [
        "pane",
        "split",
        process.env.HERDR_PANE_ID!,
        "--direction",
        "right",
        "--no-focus",
      ],
      "Failed to open Herdr dashboard pane for Crosby",
    );
    const paneId = parseHerdrPaneId(opened.stdout);
    if (!paneId) return;

    await execHerdr(
      pi,
      ["pane", "rename", paneId, "Crosby dashboard"],
      "Failed to label Herdr pane for Crosby",
    ).catch(() => {
      // Pane labeling is best-effort; keep the dashboard pane running even if rename fails.
    });

    await startDashboardRunnerInPane(
      pi,
      paneId,
      dashboardController.dashboard.runId,
    );

    dashboardController.dashboardPaneOpened({ paneId });
  } catch {
    // Dashboard pane creation is best-effort and must never stop Crosby execution.
  }
}

function shouldRunWorkersInHerdrPanes() {
  const setting = String(process.env.CROSBY_HERDR_PANES ?? "")
    .trim()
    .toLowerCase();
  if (["0", "false", "no", "off"].includes(setting)) return false;
  return process.env.HERDR_ENV === "1" && !!process.env.HERDR_PANE_ID;
}

function getHerdrWorkerLayout() {
  const setting = String(process.env.CROSBY_HERDR_LAYOUT ?? "tab")
    .trim()
    .toLowerCase();
  return setting === "pane" ? "pane" : "tab";
}

function parseHerdrPaneId(output: string) {
  try {
    const parsed = JSON.parse(output);
    const paneId =
      parsed?.result?.root_pane?.pane_id ??
      parsed?.result?.pane?.pane_id ??
      parsed?.root_pane?.pane_id ??
      parsed?.pane?.pane_id;
    return typeof paneId === "string" && paneId ? paneId : undefined;
  } catch {
    return undefined;
  }
}

async function openHerdrWorkerPane(
  pi: ExtensionAPI,
  label: string,
  cwd?: string,
) {
  if (getHerdrWorkerLayout() === "pane") {
    const splitArgs = [
      "pane",
      "split",
      process.env.HERDR_PANE_ID!,
      "--direction",
      "right",
      "--no-focus",
      ...(cwd ? ["--cwd", cwd] : []),
    ];
    return execHerdr(
      pi,
      splitArgs,
      "Failed to open Herdr pane for Crosby worker",
    );
  }

  const tabArgs = [
    "tab",
    "create",
    "--label",
    label,
    "--no-focus",
    ...(process.env.HERDR_WORKSPACE_ID
      ? ["--workspace", process.env.HERDR_WORKSPACE_ID]
      : []),
    ...(cwd ? ["--cwd", cwd] : []),
  ];
  return execHerdr(pi, tabArgs, "Failed to open Herdr tab for Crosby worker");
}

function makeHerdrAgentName(issueKey?: string | null) {
  const issuePart = String(issueKey ?? "worker")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  const suffix = Date.now().toString(36).slice(-8);
  return `crosby-${issuePart || "worker"}-${suffix}`.slice(0, 32);
}

function buildInteractiveWorkerPrompt(prompt: string, resultPath: string) {
  return [
    prompt,
    "",
    "Crosby interactive-pane result capture:",
    `- Before you finish, write the final structured JSON result to this exact file path using the write tool: ${resultPath}`,
    "- The file content must be the JSON object only, with no Markdown fences and no commentary.",
    "- The JSON object must still match the schema requested above.",
    "- After writing the file, also make your final assistant response the same JSON object only.",
  ].join("\n");
}

async function execHerdr(
  pi: ExtensionAPI,
  args: string[],
  errorContext: string,
) {
  const invocation = getHerdrInvocation(args);
  const result = await pi.exec(invocation.command, invocation.args);
  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `${errorContext}. ${details}`
        : `${errorContext}. Herdr command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }
  return result;
}

async function execHerdrJson(
  pi: ExtensionAPI,
  args: string[],
  errorContext: string,
) {
  const result = await execHerdr(pi, args, errorContext);
  try {
    return JSON.parse(result.stdout || "null");
  } catch (error) {
    throw new Error(
      `${errorContext}. Failed to parse Herdr JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function findExistingHerdrWorkerAgent(
  pi: ExtensionAPI,
  issueKey?: string | null,
  cwd?: string,
) {
  const listed = await execHerdrJson(
    pi,
    ["agent", "list"],
    "Failed to inspect existing Herdr agents for Crosby worker reuse",
  );
  return findExistingCrosbyWorkerAgent(listed?.result?.agents, issueKey, cwd);
}

function isHerdrPaneNotReadyForAgent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("agent_pane_busy") ||
    message.includes("not an available shell")
  );
}

async function startHerdrAgentWithRetry(
  pi: ExtensionAPI,
  args: string[],
  errorContext: string,
) {
  const attempts = 6;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await execHerdr(pi, args, errorContext);
    } catch (error) {
      lastError = error;
      if (!isHerdrPaneNotReadyForAgent(error) || attempt === attempts) {
        throw error;
      }
      await sleep(250 * attempt);
    }
  }

  throw lastError;
}

function formatIssuePath(path: any[] | undefined) {
  return (Array.isArray(path) ? path : [])
    .map((issue) => issue?.identifier)
    .filter(Boolean)
    .join(" > ");
}

function appendWorkerTranscript(pi: ExtensionAPI, event: any) {
  const pathText = formatIssuePath(event.path);
  pi.appendEntry("crosby-worker-transcript", {
    parentIssueKey: event.parent?.identifier ?? null,
    topLevelIssueKey: event.topLevelChild?.identifier ?? null,
    issueKey: event.child?.identifier ?? null,
    issuePath: pathText,
    outcome: event.workerResult?.outcome ?? null,
    recoveryNotes: event.workerResult?.recoveryNotes ?? [],
    cwd: event.cwd ?? null,
    stdout: event.rawWorkerResult?.stdout ?? "",
    stderr: event.rawWorkerResult?.stderr ?? "",
  });
}

async function runIsolatedWorker(
  pi: ExtensionAPI,
  prompt: string,
  opts: {
    cwd?: string;
    model?: string | null;
    effort?: string | null;
    issueKey?: string | null;
    onHerdrWorkerStarted?: (event: any) => void | Promise<void>;
  } = {},
) {
  if (shouldRunWorkersInHerdrPanes()) {
    return runIsolatedWorkerInHerdrPane(pi, prompt, opts);
  }

  const invocation = getPiInvocation();
  const sessionName = buildPiWorkerSessionName(opts.issueKey);
  const extraArgs = buildPiWorkerExtraArgs({ model: opts.model, effort: opts.effort });

  const result = await pi.exec(
    invocation.command,
    [
      ...invocation.args,
      ...extraArgs,
      "--name",
      sessionName,
      "--mode",
      "text",
      "-p",
      prompt,
    ],
    opts.cwd ? { cwd: opts.cwd } : undefined,
  );

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `Isolated worker failed. ${details}`
        : "Isolated worker failed before returning output.",
    );
  }

  return result;
}

async function runIsolatedWorkerInHerdrPane(
  pi: ExtensionAPI,
  prompt: string,
  opts: {
    cwd?: string;
    model?: string | null;
    effort?: string | null;
    issueKey?: string | null;
    onHerdrWorkerStarted?: (event: any) => void | Promise<void>;
  },
) {
  const sessionName = buildPiWorkerSessionName(opts.issueKey);
  const extraArgs = buildPiWorkerExtraArgs({ model: opts.model, effort: opts.effort });

  const workDir = await mkdtemp(path.join(os.tmpdir(), "crosby-worker-"));
  const promptPath = path.join(workDir, "prompt.md");
  const resultPath = path.join(workDir, "result.json");
  const stderrPath = path.join(workDir, "stderr.txt");
  const interactivePrompt = buildInteractiveWorkerPrompt(prompt, resultPath);
  await writeFile(promptPath, interactivePrompt, "utf8");
  const label = opts.issueKey ? `Crosby ${opts.issueKey}` : "Crosby worker";

  const existingAgent = await findExistingHerdrWorkerAgent(
    pi,
    opts.issueKey,
    opts.cwd,
  ).catch(() => null);
  if (existingAgent) {
    const target = existingAgent.name ?? existingAgent.pane_id;
    if (!target) {
      throw new Error(
        `Found an existing Crosby worker for ${opts.issueKey ?? "the issue"}, but it has no reusable Herdr target.`,
      );
    }

    if (String(existingAgent.agent_status ?? "") === "working") {
      await execHerdr(
        pi,
        ["agent", "wait", target],
        `Existing Crosby worker ${target} did not become ready for reuse`,
      );
    }

    if (typeof opts.onHerdrWorkerStarted === "function") {
      await opts.onHerdrWorkerStarted({
        issueKey: opts.issueKey ?? null,
        paneId: existingAgent.pane_id ?? null,
        agentName: existingAgent.name ?? null,
        label,
        cwd: opts.cwd ?? null,
        reused: true,
      });
    }

    await execHerdr(
      pi,
      ["agent", "prompt", target, interactivePrompt, "--wait"],
      `Failed to continue existing Crosby worker ${target}`,
    );

    let stdout = "";
    try {
      stdout = (await readFile(resultPath, "utf8")).trim();
    } catch {
      const transcript = await execHerdr(
        pi,
        [
          "agent",
          "read",
          target,
          "--source",
          "recent-unwrapped",
          "--lines",
          "200",
        ],
        "Failed to read reused interactive Pi worker transcript after missing result file",
      ).catch((error) => ({
        stdout: error instanceof Error ? error.message : String(error),
      }));
      throw new Error(
        `Reused interactive Pi worker ${target} did not write ${resultPath}. ` +
          `Recovery: inspect pane ${existingAgent.pane_id ?? target}, then write the final Crosby JSON result to ${resultPath} or rerun Crosby. ` +
          `Recent transcript:\n${transcript.stdout}`,
      );
    }

    return {
      stdout,
      stderr: await readFile(stderrPath, "utf8").catch(() => ""),
      code: 0,
      killed: false,
    };
  }

  const agentName = makeHerdrAgentName(opts.issueKey);
  const opened = await openHerdrWorkerPane(pi, label, opts.cwd);
  const paneId = parseHerdrPaneId(opened.stdout);
  if (!paneId) {
    throw new Error(
      "Failed to open Herdr worker terminal. Herdr did not return a pane id.",
    );
  }

  if (getHerdrWorkerLayout() === "pane") {
    try {
      await execHerdr(
        pi,
        ["pane", "rename", paneId, label],
        "Failed to label Herdr pane for Crosby worker",
      );
    } catch {
      // Pane labeling is best-effort; keep the worker running even if rename fails.
    }
  }

  await startHerdrAgentWithRetry(
    pi,
    [
      "agent",
      "start",
      agentName,
      "--kind",
      "pi",
      "--pane",
      paneId,
      "--",
      ...extraArgs,
      "--name",
      sessionName,
    ],
    "Failed to start interactive Pi worker in Herdr pane",
  );

  if (typeof opts.onHerdrWorkerStarted === "function") {
    await opts.onHerdrWorkerStarted({
      issueKey: opts.issueKey ?? null,
      paneId,
      agentName,
      label,
      cwd: opts.cwd ?? null,
    });
  }

  await execHerdr(
    pi,
    ["agent", "prompt", agentName, interactivePrompt, "--wait"],
    "Interactive Pi worker failed before settling",
  );

  let stdout = "";
  try {
    stdout = (await readFile(resultPath, "utf8")).trim();
  } catch {
    const transcript = await execHerdr(
      pi,
      [
        "agent",
        "read",
        agentName,
        "--source",
        "recent-unwrapped",
        "--lines",
        "200",
      ],
      "Failed to read interactive Pi worker transcript after missing result file",
    ).catch((error) => ({
      stdout: error instanceof Error ? error.message : String(error),
    }));
    throw new Error(
      `Interactive Pi worker in Herdr pane ${paneId} did not write ${resultPath}. ` +
        `Recovery: inspect pane ${paneId}, then write the final Crosby JSON result to ${resultPath} or rerun Crosby. ` +
        `Recent transcript:\n${transcript.stdout}`,
    );
  }

  return {
    stdout,
    stderr: await readFile(stderrPath, "utf8").catch(() => ""),
    code: 0,
    killed: false,
  };
}

export default function crosbyExtension(pi: ExtensionAPI) {
  pi.registerCommand("crosby", {
    description:
      "Execute parent child-work, watch Execute parents, or explicitly push/review a parent PR",
    handler: async (args, ctx) => {
      let dashboardController: ReturnType<
        typeof createCrosbyDashboardController
      > | null = null;
      try {
        const command = parseCrosbyCommandArgs(args);

        if (command.mode === "watch") {
          ctx.ui.notify(
            "Crosby watch mode started. Polling GitHub parent issues with status:execute every 60s.",
            "success",
          );
          await runWatchMode(
            {
              fetchExecuteParentQueues: () =>
                loadExecuteParentQueuesFromGitHub(pi),
              moveIssue: (targetIssueKey, state) =>
                moveIssue(pi, targetIssueKey, state),
              addComment: (targetIssueKey, body) =>
                addIssueComment(pi, targetIssueKey, body),
              runWorker: ({ prompt, cwd, model, effort, childIssueKey }) =>
                runIsolatedWorker(pi, prompt, {
                  cwd,
                  model,
                  effort,
                  issueKey: childIssueKey,
                  onHerdrWorkerStarted: (event) =>
                    dashboardController?.herdrWorkerStarted(event),
                }),
              ensureParentBranch: ({ parent, cwd }) =>
                ensureParentBranch(pi, parent, cwd),
              assertBranchCleanupPreflight: ({ parent, cwd }) =>
                assertBranchCleanupPreflight(pi, cwd, { parent }),
              prepareChildBranch: ({ parent, child, cwd }) =>
                prepareChildBranch(pi, parent, child, cwd),
              snapshotGitState: ({ cwd }) => snapshotGitState(pi, cwd),
              hasCommittedWorkSince: ({ cwd, before, parent, expectedBranchName }) =>
                hasCommittedWorkSince(pi, cwd, before, parent, expectedBranchName),
              runVerificationCommand: ({ cwd, command }) =>
                runVerificationCommand(pi, cwd, command),
              mergeChildBranchIntoParent: ({ parent, child, childBranch, cwd }) =>
                mergeChildBranchIntoParent(pi, parent, child, childBranch, cwd),
              refreshQueue: (parentIssueKey) =>
                fetchParentQueue(parentIssueKey, (key) =>
                  loadIssueFromGitHub(pi, key),
                ),
              loadIssue: (issueKey) => loadIssueFromGitHub(pi, issueKey),
              onQueueLoaded: (queue) => {
                if (!dashboardController) {
                  dashboardController = createCrosbyDashboardController(
                    ctx,
                    queue,
                    "watch",
                  );
                  void openCrosbyDashboardPane(pi, dashboardController);
                  return;
                }

                if (
                  dashboardController.dashboard.parentIssueKey ===
                  queue?.parent?.identifier
                ) {
                  dashboardController.queueRefreshed(queue);
                } else {
                  dashboardController.reset(queue, "watch");
                  void openCrosbyDashboardPane(pi, dashboardController);
                }
              },
              onQueueSelected: (queue) => {
                pi.appendEntry(
                  "crosby-parent-context",
                  formatParentContextForSession(queue),
                );
              },
              onExecutionStart: (event) => {
                dashboardController?.executionStarted(event);
                const pathText = formatIssuePath(event.path);
                ctx.ui.notify(
                  `Crosby starting ${event.child?.identifier ?? "issue"}${pathText ? ` (${pathText})` : ""}.`,
                  "success",
                );
                pi.appendEntry("crosby-worker-started", {
                  parentIssueKey: event.parent?.identifier ?? null,
                  topLevelIssueKey: event.topLevelChild?.identifier ?? null,
                  issueKey: event.child?.identifier ?? null,
                  issuePath: pathText,
                  cwd: event.cwd ?? null,
                });
              },
              onExecutionFinish: (event) => {
                dashboardController?.executionFinished(event);
                const pathText = formatIssuePath(event.path);
                ctx.ui.notify(
                  `Crosby finished ${event.child?.identifier ?? "issue"}: ${event.workerResult?.outcome ?? "unknown"}.`,
                  event.workerResult?.outcome === "fatal" ? "error" : "success",
                );
                appendWorkerTranscript(pi, event);
              },
              onExecutionFinalized: (event) => {
                dashboardController?.executionFinalized(event);
              },
              onParentFinalized: ({ finalSummary, testingSummary }) => {
                pi.appendEntry("crosby-final-human-summary", finalSummary);
                pi.appendEntry("crosby-final-testing-summary", testingSummary);
              },
              onQueueRefreshed: (queue) => {
                dashboardController?.queueRefreshed(queue);
              },
            },
            {
              pollIntervalMs: 60000,
              onCycle: async (cycle) => {
                for (const routingError of cycle.routingErrors ?? []) {
                  ctx.ui.notify(routingError.message, "error");
                }
                if (cycle.status === "processed") {
                  ctx.ui.notify(
                    `Processed ${cycle.issue.identifier} under ${cycle.parent?.identifier ?? "the active parent"}.`,
                    "success",
                  );
                  return;
                }
                if (cycle.status === "fatal") {
                  ctx.ui.notify(
                    cycle.errorMessage ??
                      `Worker failed for ${cycle.issue?.identifier ?? "the active issue"}.`,
                    "error",
                  );
                  return;
                }
                if (cycle.status === "error") {
                  dashboardController?.fatal(
                    cycle.errorMessage ?? "Crosby watch mode cycle failed.",
                  );
                  ctx.ui.notify(
                    cycle.errorMessage ?? "Crosby watch mode cycle failed.",
                    "error",
                  );
                }
              },
            },
          );
          return;
        }

        const trackerSelection = selectTrackerAdapter(pi, command.issueKey);
        const { issueKey, adapter: trackerAdapter } = trackerSelection;
        if (
          command.mode !== "parent" &&
          trackerSelection.tracker !== "github"
        ) {
          throw new Error(
            `Crosby ${command.mode} remains GitHub-only in v1. Recovery: use a GitHub issue reference for ${command.mode}, or run manual Jira execution with /crosby ${issueKey}.`,
          );
        }

        const queue = await trackerAdapter.fetchParentQueue(issueKey);

        if (command.mode === "push") {
          const pullRequest = await publishParentPullRequest(queue, [], {
            ensureParentBranch: ({ parent, cwd }) =>
              ensureParentBranch(pi, parent, cwd),
            assertCleanWorkingTree: ({ cwd }) =>
              assertCleanWorkingTree(pi, cwd, "push"),
            readImplementationSummary: ({ cwd }) =>
              readImplementationSummary(cwd),
            pushBranch: ({ branchName, cwd }) =>
              pushGitBranch(pi, cwd, branchName),
            getPullRequest: ({ branchName, cwd, allowMissing }) =>
              getPullRequestForBranch(pi, branchName, cwd, { allowMissing }),
            createPullRequest: ({ title, body, branchName, cwd }) =>
              createPullRequest(pi, title, body, branchName, cwd),
            updatePullRequest: ({ prNumber, body, cwd }) =>
              updatePullRequestBody(pi, prNumber, body, cwd),
            addParentComment: (targetIssueKey, body) =>
              addIssueComment(pi, targetIssueKey, body),
          });
          ctx.ui.notify(
            `Pushed ${queue.parent.identifier} and synced PR ${pullRequest?.url ?? ""}.`,
            "success",
          );
          return;
        }

        if (command.mode === "review") {
          const review = await reviewParentPullRequest(queue, [], {
            ensureParentBranch: ({ parent, cwd }) =>
              ensureParentBranch(pi, parent, cwd),
            assertCleanWorkingTree: ({ cwd }) =>
              assertCleanWorkingTree(pi, cwd, "review"),
            getPullRequest: ({ branchName, cwd, allowMissing }) =>
              getPullRequestForBranch(pi, branchName, cwd, { allowMissing }),
            readImplementationSummary: ({ cwd }) =>
              readImplementationSummary(cwd),
            updatePullRequest: ({ prNumber, body, cwd }) =>
              updatePullRequestBody(pi, prNumber, body, cwd),
            runClaudeReview: ({ prompt, cwd }) =>
              runClaudeReviewWorker(pi, prompt, cwd),
            addPullRequestComment: ({ prNumber, body, cwd }) =>
              addPullRequestComment(pi, prNumber, body, cwd),
            addParentComment: (targetIssueKey, body) =>
              addIssueComment(pi, targetIssueKey, body),
          });
          ctx.ui.notify(
            `Reviewed ${queue.parent.identifier}. PR: ${review.pullRequest?.url ?? "unknown"}.`,
            "success",
          );
          return;
        }

        pi.appendEntry(
          "crosby-parent-context",
          formatParentContextForSession(queue),
        );

        dashboardController = createCrosbyDashboardController(
          ctx,
          queue,
          "manual",
        );
        await openCrosbyDashboardPane(pi, dashboardController);

        const execution = await runQueueExecution(queue, {
          moveIssue: (targetIssueKey, state) =>
            trackerAdapter.moveIssue(targetIssueKey, state),
          addComment: (targetIssueKey, body) =>
            trackerAdapter.addComment(targetIssueKey, body),
          runWorker: ({ prompt, cwd, model, effort, childIssueKey }) =>
            runIsolatedWorker(pi, prompt, {
              cwd,
              model,
              effort,
              issueKey: childIssueKey,
              onHerdrWorkerStarted: (event) =>
                dashboardController?.herdrWorkerStarted(event),
            }),
          ensureParentBranch: ({ parent, cwd }) =>
            ensureParentBranch(pi, parent, cwd),
          assertBranchCleanupPreflight: ({ parent, cwd }) =>
            assertBranchCleanupPreflight(pi, cwd, { parent }),
          prepareChildBranch: ({ parent, child, cwd }) =>
            prepareChildBranch(pi, parent, child, cwd),
          snapshotGitState: ({ cwd }) => snapshotGitState(pi, cwd),
          hasCommittedWorkSince: ({ cwd, before, parent, expectedBranchName }) =>
            hasCommittedWorkSince(pi, cwd, before, parent, expectedBranchName),
          runVerificationCommand: ({ cwd, command }) =>
            runVerificationCommand(pi, cwd, command),
          mergeChildBranchIntoParent: ({ parent, child, childBranch, cwd }) =>
            mergeChildBranchIntoParent(pi, parent, child, childBranch, cwd),
          refreshQueue: (parentIssueKey) =>
            trackerAdapter.fetchParentQueue(parentIssueKey),
          loadIssue: (issueKey) => trackerAdapter.loadIssue(issueKey),
          onExecutionStart: (event) => {
            dashboardController?.executionStarted(event);
            const pathText = formatIssuePath(event.path);
            ctx.ui.notify(
              `Crosby starting ${event.child?.identifier ?? "issue"}${pathText ? ` (${pathText})` : ""}.`,
              "success",
            );
            pi.appendEntry("crosby-worker-started", {
              parentIssueKey: event.parent?.identifier ?? null,
              topLevelIssueKey: event.topLevelChild?.identifier ?? null,
              issueKey: event.child?.identifier ?? null,
              issuePath: pathText,
              cwd: event.cwd ?? null,
            });
          },
          onExecutionFinish: (event) => {
            dashboardController?.executionFinished(event);
            const pathText = formatIssuePath(event.path);
            ctx.ui.notify(
              `Crosby finished ${event.child?.identifier ?? "issue"}: ${event.workerResult?.outcome ?? "unknown"}.`,
              event.workerResult?.outcome === "fatal" ? "error" : "success",
            );
            appendWorkerTranscript(pi, event);
          },
          onExecutionFinalized: (event) => {
            dashboardController?.executionFinalized(event);
          },
          onParentFinalized: ({ finalSummary, testingSummary }) => {
            pi.appendEntry("crosby-final-human-summary", finalSummary);
            pi.appendEntry("crosby-final-testing-summary", testingSummary);
          },
          onQueueRefreshed: (refreshedQueue) => {
            dashboardController?.queueRefreshed(refreshedQueue);
          },
        });

        pi.appendEntry("crosby-queue-loaded", {
          issueKey,
          parentTitle: queue.parent.title,
          childCount: queue.children.length,
          childKeys: queue.children.map((child) => child.identifier),
          childStates: queue.children.map((child) => ({
            issueKey: child.identifier,
            stateName: child?.state?.name ?? null,
            stateType: child?.state?.type ?? null,
          })),
          completedChildKeys: execution.completedChildren.map(
            (entry) => entry.child.identifier,
          ),
          completedChildOutcomes: execution.completedChildren.map((entry) => ({
            issueKey: entry.child.identifier,
            outcome: entry.workerResult.outcome,
          })),
          movedParentToBuilding: execution.movedParentToBuilding,
          remainingByReason: execution.remainingByReason,
          loadedAt: new Date().toISOString(),
        });

        const lastExecution = execution.completedChildren.at(-1);
        const parentTransition = execution.movedParentToBuilding
          ? ` Parent ${queue.parent.identifier} moved to Building.`
          : "";
        const remaining = Object.keys(execution.remainingByReason).length
          ? ` Remaining: ${JSON.stringify(execution.remainingByReason)}.`
          : "";
        const message = !lastExecution
          ? `No runnable child issues remain under ${queue.parent.identifier}.${remaining}`
          : lastExecution.workerResult.outcome === "fatal"
            ? `${lastExecution.child.identifier} returned fatal outcome after ${execution.completedChildren.length} child run(s). Recovery: ${lastExecution.workerResult.recoveryNotes.join(" ")}.${parentTransition}`
            : `Processed ${execution.completedChildren.length} child issue(s) under ${queue.parent.identifier}.${parentTransition}${remaining}`;
        ctx.ui.notify(
          message,
          lastExecution?.workerResult.outcome === "fatal" ? "error" : "success",
        );
      } catch (error) {
        dashboardController?.fatal(error);
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });
}
