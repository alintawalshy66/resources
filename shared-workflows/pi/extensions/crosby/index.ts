import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchParentQueue,
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

function toCrosbyIssue(githubIssue: any, children: any[] = []) {
  const statusName = getStatusNameFromGitHubIssue(githubIssue);
  const parentIdentifier = parseParentIssueRef(githubIssue?.body);
  const labels = (Array.isArray(githubIssue?.labels) ? githubIssue.labels : [])
    .map((label: any) => ({
      name: typeof label === "string" ? label : label?.name,
    }))
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

async function execGhJson(
  pi: ExtensionAPI,
  args: string[],
  errorContext: string,
  options?: { cwd?: string },
) {
  const invocation = getGhInvocation(args);
  const result = await pi.exec(
    invocation.command,
    invocation.args,
    options?.cwd ? { cwd: options.cwd } : undefined,
  );

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      details
        ? `${errorContext}. ${details}`
        : `${errorContext}. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  try {
    return JSON.parse(result.stdout || "null");
  } catch (error) {
    throw new Error(
      `${errorContext}. Failed to parse GitHub CLI JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadIssueFromGitHub(
  pi: ExtensionAPI,
  issueRef: string | number,
  options: { includeChildren?: boolean } = {},
) {
  const normalizedRef = normalizeIssueRef(issueRef);
  const issue = await execGhJson(
    pi,
    [
      "issue",
      "view",
      normalizedRef,
      "--json",
      "number,title,body,state,labels,milestone,url,comments",
    ],
    `Failed to load GitHub issue ${issueRef}`,
  );

  let children: any[] = [];
  if (options.includeChildren !== false) {
    const childRefs = parseChildIssueRefs(issue?.body).filter(
      (ref) => ref !== String(issue?.number),
    );
    children = await Promise.all(
      childRefs.map((ref) =>
        loadIssueFromGitHub(pi, ref, { includeChildren: false }),
      ),
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

async function getGitRevision(pi: ExtensionAPI, cwd: string, revision: string) {
  const result = await execGit(pi, ["rev-parse", revision], cwd);
  return result.stdout.trim();
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
  cwd?: string,
) {
  const invocation = getPiInvocation();
  const result = await pi.exec(
    invocation.command,
    [...invocation.args, "--mode", "text", "-p", "--no-session", prompt],
    cwd ? { cwd } : undefined,
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

export default function crosbyExtension(pi: ExtensionAPI) {
  pi.registerCommand("crosby", {
    description:
      "Execute parent child-work, watch Execute parents, or explicitly push/review a parent PR",
    handler: async (args, ctx) => {
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
              runWorker: ({ prompt, cwd }) =>
                runIsolatedWorker(pi, prompt, cwd),
              ensureParentBranch: ({ parent, cwd }) =>
                ensureParentBranch(pi, parent, cwd),
              refreshQueue: (parentIssueKey) =>
                fetchParentQueue(parentIssueKey, (key) =>
                  loadIssueFromGitHub(pi, key),
                ),
              loadIssue: (issueKey) => loadIssueFromGitHub(pi, issueKey),
              onExecutionStart: (event) => {
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
                const pathText = formatIssuePath(event.path);
                ctx.ui.notify(
                  `Crosby finished ${event.child?.identifier ?? "issue"}: ${event.workerResult?.outcome ?? "unknown"}.`,
                  event.workerResult?.outcome === "fatal" ? "error" : "success",
                );
                appendWorkerTranscript(pi, event);
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

        const issueKey = command.issueKey;
        const queue = await fetchParentQueue(issueKey, (key) =>
          loadIssueFromGitHub(pi, key),
        );

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

        const execution = await runQueueExecution(queue, {
          moveIssue: (targetIssueKey, state) =>
            moveIssue(pi, targetIssueKey, state),
          addComment: (targetIssueKey, body) =>
            addIssueComment(pi, targetIssueKey, body),
          runWorker: ({ prompt, cwd }) => runIsolatedWorker(pi, prompt, cwd),
          ensureParentBranch: ({ parent, cwd }) =>
            ensureParentBranch(pi, parent, cwd),
          refreshQueue: (parentIssueKey) =>
            fetchParentQueue(parentIssueKey, (key) =>
              loadIssueFromGitHub(pi, key),
            ),
          loadIssue: (issueKey) => loadIssueFromGitHub(pi, issueKey),
          onExecutionStart: (event) => {
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
            const pathText = formatIssuePath(event.path);
            ctx.ui.notify(
              `Crosby finished ${event.child?.identifier ?? "issue"}: ${event.workerResult?.outcome ?? "unknown"}.`,
              event.workerResult?.outcome === "fatal" ? "error" : "success",
            );
            appendWorkerTranscript(pi, event);
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
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });
}
