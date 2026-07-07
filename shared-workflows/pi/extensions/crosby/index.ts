import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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

function getLinearInvocation(args: string[]) {
  const configured = process.env.LINEAR_BIN?.trim();
  if (configured) {
    return { command: configured, args };
  }

  const appData = process.env.APPDATA;
  if (process.platform === "win32" && appData) {
    const runnerScript = path.join(appData, "npm", "node_modules", "@kyaukyuai", "linear-cli", "run-linear.js");
    if (existsSync(runnerScript)) {
      return { command: process.execPath, args: [runnerScript, ...args] };
    }
  }

  return { command: "linear", args };
}

function getGhInvocation(args: string[]) {
  const configured = process.env.GH_BIN?.trim();
  return { command: configured || "gh", args };
}

function getGitInvocation(args: string[]) {
  const configured = process.env.GIT_BIN?.trim();
  return { command: configured || "git", args };
}

// Intentionally do not force a Pi worker model here.
// Let isolated workers inherit normal Pi model resolution from the parent environment/session config.
const DEFAULT_CROSBY_CLAUDE_MODEL = process.env.CROSBY_CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";
const DEFAULT_CROSBY_CLAUDE_EFFORT = process.env.CROSBY_CLAUDE_EFFORT?.trim() || "medium";

function getClaudeInvocation(args: string[]) {
  const configured = process.env.CLAUDE_BIN?.trim();
  return { command: configured || "claude", args };
}

async function loadIssueLabelsFromLinear(pi: ExtensionAPI, issueKey: string) {
  const invocation = getLinearInvocation([
    "api",
    'query($id:String!){ issue(id:$id){ labels { nodes { name } } } }',
    "--variable",
    `id=${issueKey}`,
  ]);
  const result = await pi.exec(invocation.command, invocation.args);

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to load labels for ${issueKey} from Linear. ${details}`
        : `Failed to load labels for ${issueKey} from Linear. Linear command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  try {
    return JSON.parse(result.stdout)?.data?.issue?.labels ?? { nodes: [] };
  } catch (error) {
    throw new Error(
      `Failed to parse Linear label data for ${issueKey}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadIssueFromLinear(pi: ExtensionAPI, issueKey: string) {
  const invocation = getLinearInvocation(["issue", "view", issueKey, "--json"]);
  const result = await pi.exec(invocation.command, invocation.args);

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to load ${issueKey} from Linear. ${details}`
        : `Failed to load ${issueKey} from Linear. Linear command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  try {
    const issue = JSON.parse(result.stdout);
    const labelTargets = [issue, ...(Array.isArray(issue?.children) ? issue.children : [])].filter(
      (target) => target?.identifier && !target?.labels,
    );

    await Promise.all(
      labelTargets.map(async (target) => {
        target.labels = await loadIssueLabelsFromLinear(pi, target.identifier);
      }),
    );

    return issue;
  } catch (error) {
    throw new Error(
      `Failed to parse Linear queue data for ${issueKey}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadIssuesByStateFromLinear(pi: ExtensionAPI, stateName: string) {
  const invocation = getLinearInvocation([
    "api",
    `query($stateName:String!){ issues(filter: { state: { name: { eq: $stateName } } }) { nodes { identifier title priority state { name type } parent { identifier title } labels { nodes { name } } } } }`,
    "--variable",
    `stateName=${stateName}`,
  ]);
  const result = await pi.exec(invocation.command, invocation.args);

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to load ${stateName} issues from Linear. ${details}`
        : `Failed to load ${stateName} issues from Linear. Linear command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  try {
    const payload = JSON.parse(result.stdout);
    return payload?.data?.issues?.nodes ?? [];
  } catch (error) {
    throw new Error(
      `Failed to parse ${stateName} issue data from Linear: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadExecuteParentQueuesFromLinear(pi: ExtensionAPI) {
  const executeIssues = await loadIssuesByStateFromLinear(pi, "Execute");
  const executeParents = executeIssues.filter((issue) => issue?.identifier && !issue?.parent);
  return Promise.all(executeParents.map((issue) => fetchParentQueue(issue.identifier, (key) => loadIssueFromLinear(pi, key))));
}

function normalizeTargetState(state: string, issueKey?: string) {
  switch (state) {
    case "Building":
      return issueKey && /^COA-\d+$/i.test(issueKey) ? "Build" : "Building";
    case "Review":
      return "In Review";
    default:
      return state;
  }
}

async function moveIssue(pi: ExtensionAPI, issueKey: string, state: string) {
  const targetState = normalizeTargetState(state, issueKey);
  const invocation = getLinearInvocation(["issue", "move", issueKey, targetState]);
  const result = await pi.exec(invocation.command, invocation.args);

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to move ${issueKey} to ${targetState}. ${details}`
        : `Failed to move ${issueKey} to ${targetState}. Check Linear CLI authentication and try again.`,
    );
  }
}

async function addIssueComment(pi: ExtensionAPI, issueKey: string, body: string) {
  const invocation = getLinearInvocation(["issue", "comment", "add", issueKey, body]);
  const result = await pi.exec(invocation.command, invocation.args);

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to add comment to ${issueKey}. ${details}`
        : `Failed to add comment to ${issueKey}. Check Linear CLI authentication and try again.`,
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
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    if (options?.allowMissing && /no pull requests found for branch/i.test(details)) {
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

async function createPullRequest(pi: ExtensionAPI, title: string, body: string, branchName: string | undefined, cwd: string) {
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
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to create pull request for branch ${branchName ?? "current"}. ${details}`
        : `Failed to create pull request for branch ${branchName ?? "current"}. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }

  const pullRequest = await getPullRequestForBranch(pi, branchName, cwd, { allowMissing: false });
  if (!pullRequest) {
    throw new Error(`Pull request creation reported success but no PR was found for branch ${branchName ?? "current"}.`);
  }

  return pullRequest;
}

async function updatePullRequestBody(pi: ExtensionAPI, prNumber: number, body: string, cwd: string) {
  const invocation = getGhInvocation(["pr", "edit", String(prNumber), "--body", body]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      details
        ? `Failed to update PR #${prNumber} description. ${details}`
        : `Failed to update PR #${prNumber} description. GitHub command: ${invocation.command}. Exit code: ${result.code}.`,
    );
  }
}

async function addPullRequestComment(pi: ExtensionAPI, prNumber: number, body: string, cwd: string) {
  const invocation = getGhInvocation(["pr", "comment", String(prNumber), "--body", body]);
  const result = await pi.exec(invocation.command, invocation.args, { cwd });

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
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
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
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

async function hasLocalGitBranch(pi: ExtensionAPI, cwd: string, branchName: string) {
  const result = await execGit(pi, ["branch", "--list", branchName], cwd);
  return result.stdout.trim().length > 0;
}

async function hasRemoteGitBranch(pi: ExtensionAPI, cwd: string, branchName: string) {
  const result = await execGit(pi, ["branch", "-r", "--list", `origin/${branchName}`], cwd);
  return result.stdout.trim().length > 0;
}

async function hasUncommittedGitChanges(pi: ExtensionAPI, cwd: string) {
  const result = await execGit(pi, ["status", "--short"], cwd);
  return result.stdout.trim().length > 0;
}

async function assertCleanWorkingTree(pi: ExtensionAPI, cwd: string, command: "push" | "review") {
  if (!(await hasUncommittedGitChanges(pi, cwd))) return;

  throw new Error(
    `Cannot run /crosby ${command} in ${cwd} because the working tree has uncommitted changes. Recovery: commit, stash, or discard the local changes first, then rerun /crosby ${command}.`,
  );
}

async function pushGitBranch(pi: ExtensionAPI, cwd: string, branchName?: string) {
  const resolvedBranchName = String(branchName ?? "").trim();
  if (!resolvedBranchName) {
    throw new Error("Cannot push the parent branch because Linear did not provide a branch name. Recovery: set the parent branch name in Linear, then rerun /crosby push.");
  }

  await execGit(pi, ["push", "-u", "origin", resolvedBranchName], cwd);
}

async function ensureParentBranch(pi: ExtensionAPI, parentIssue: any, cwd?: string) {
  const issueKey = parentIssue?.identifier ?? "UNKNOWN-PARENT";
  const branchName = String(parentIssue?.branchName ?? "").trim();

  if (!cwd) {
    throw new Error(
      `Cannot ensure the feature branch for ${issueKey} because no local project directory was resolved. Recovery: add a folder label matching the local repo, then rerun /crosby ${issueKey}.`,
    );
  }

  if (!branchName) {
    throw new Error(
      `Parent issue ${issueKey} is missing a Linear branch name. Recovery: set the parent branch in Linear, then rerun /crosby ${issueKey}.`,
    );
  }

  if (!(await isGitRepository(pi, cwd))) {
    throw new Error(
      `Resolved project directory ${cwd} for parent ${issueKey} is not a git repository. Recovery: point the issue label at the correct local repo folder, or initialize/clone the repo there, then rerun /crosby ${issueKey}.`,
    );
  }

  const currentBranch = await getCurrentGitBranch(pi, cwd);
  if (currentBranch === branchName) return;

  if (await hasUncommittedGitChanges(pi, cwd)) {
    throw new Error(
      `Cannot switch ${cwd} from branch ${currentBranch || "(detached HEAD)"} to ${branchName} for parent ${issueKey} because the working tree has uncommitted changes. Recovery: commit, stash, or discard the local changes in ${cwd}, then rerun /crosby ${issueKey}.`,
    );
  }

  if (await hasLocalGitBranch(pi, cwd, branchName)) {
    await execGit(pi, ["checkout", branchName], cwd);
  } else if (await hasRemoteGitBranch(pi, cwd, branchName)) {
    await execGit(pi, ["checkout", "-b", branchName, "--track", `origin/${branchName}`], cwd);
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

async function runClaudeReviewWorker(pi: ExtensionAPI, prompt: string, cwd: string) {
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
    required: ["outcome", "summary", "changes", "tests", "remainingConcerns", "commits"],
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
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
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

async function runIsolatedWorker(pi: ExtensionAPI, prompt: string, cwd?: string) {
  const invocation = getPiInvocation();
  const result = await pi.exec(
    invocation.command,
    [...invocation.args, "--mode", "text", "-p", "--no-session", prompt],
    cwd ? { cwd } : undefined,
  );

  if (result.code !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
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
    description: "Execute parent child-work, watch Execute parents, or explicitly push/review a parent PR",
    handler: async (args, ctx) => {
      try {
        const command = parseCrosbyCommandArgs(args);

        if (command.mode === "watch") {
          ctx.ui.notify("Crosby watch mode started. Polling parent issues in Execute every 60s.", "success");
          await runWatchMode(
            {
              fetchExecuteParentQueues: () => loadExecuteParentQueuesFromLinear(pi),
              moveIssue: (targetIssueKey, state) => moveIssue(pi, targetIssueKey, state),
              addComment: (targetIssueKey, body) => addIssueComment(pi, targetIssueKey, body),
              runWorker: ({ prompt, cwd }) => runIsolatedWorker(pi, prompt, cwd),
              ensureParentBranch: ({ parent, cwd }) => ensureParentBranch(pi, parent, cwd),
              refreshQueue: (parentIssueKey) => fetchParentQueue(parentIssueKey, (key) => loadIssueFromLinear(pi, key)),
              loadIssue: (issueKey) => loadIssueFromLinear(pi, issueKey),
              onExecutionStart: (event) => {
                const pathText = formatIssuePath(event.path);
                ctx.ui.notify(`Crosby starting ${event.child?.identifier ?? "issue"}${pathText ? ` (${pathText})` : ""}.`, "success");
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
                ctx.ui.notify(`Crosby finished ${event.child?.identifier ?? "issue"}: ${event.workerResult?.outcome ?? "unknown"}.`, event.workerResult?.outcome === "fatal" ? "error" : "success");
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
                  ctx.ui.notify(`Processed ${cycle.issue.identifier} under ${cycle.parent?.identifier ?? "the active parent"}.`, "success");
                  return;
                }
                if (cycle.status === "fatal") {
                  ctx.ui.notify(cycle.errorMessage ?? `Worker failed for ${cycle.issue?.identifier ?? "the active issue"}.`, "error");
                  return;
                }
                if (cycle.status === "error") {
                  ctx.ui.notify(cycle.errorMessage ?? "Crosby watch mode cycle failed.", "error");
                }
              },
            },
          );
          return;
        }

        const issueKey = command.issueKey;
        const queue = await fetchParentQueue(issueKey, (key) => loadIssueFromLinear(pi, key));

        if (command.mode === "push") {
          const pullRequest = await publishParentPullRequest(queue, [], {
            ensureParentBranch: ({ parent, cwd }) => ensureParentBranch(pi, parent, cwd),
            assertCleanWorkingTree: ({ cwd }) => assertCleanWorkingTree(pi, cwd, "push"),
            readImplementationSummary: ({ cwd }) => readImplementationSummary(cwd),
            pushBranch: ({ branchName, cwd }) => pushGitBranch(pi, cwd, branchName),
            getPullRequest: ({ branchName, cwd, allowMissing }) => getPullRequestForBranch(pi, branchName, cwd, { allowMissing }),
            createPullRequest: ({ title, body, branchName, cwd }) => createPullRequest(pi, title, body, branchName, cwd),
            updatePullRequest: ({ prNumber, body, cwd }) => updatePullRequestBody(pi, prNumber, body, cwd),
            addParentComment: (targetIssueKey, body) => addIssueComment(pi, targetIssueKey, body),
          });
          ctx.ui.notify(`Pushed ${queue.parent.identifier} and synced PR ${pullRequest?.url ?? ""}.`, "success");
          return;
        }

        if (command.mode === "review") {
          const review = await reviewParentPullRequest(queue, [], {
            ensureParentBranch: ({ parent, cwd }) => ensureParentBranch(pi, parent, cwd),
            assertCleanWorkingTree: ({ cwd }) => assertCleanWorkingTree(pi, cwd, "review"),
            getPullRequest: ({ branchName, cwd, allowMissing }) => getPullRequestForBranch(pi, branchName, cwd, { allowMissing }),
            readImplementationSummary: ({ cwd }) => readImplementationSummary(cwd),
            updatePullRequest: ({ prNumber, body, cwd }) => updatePullRequestBody(pi, prNumber, body, cwd),
            runClaudeReview: ({ prompt, cwd }) => runClaudeReviewWorker(pi, prompt, cwd),
            addPullRequestComment: ({ prNumber, body, cwd }) => addPullRequestComment(pi, prNumber, body, cwd),
            addParentComment: (targetIssueKey, body) => addIssueComment(pi, targetIssueKey, body),
          });
          ctx.ui.notify(`Reviewed ${queue.parent.identifier}. PR: ${review.pullRequest?.url ?? "unknown"}.`, "success");
          return;
        }

        const execution = await runQueueExecution(queue, {
          moveIssue: (targetIssueKey, state) => moveIssue(pi, targetIssueKey, state),
          addComment: (targetIssueKey, body) => addIssueComment(pi, targetIssueKey, body),
          runWorker: ({ prompt, cwd }) => runIsolatedWorker(pi, prompt, cwd),
          ensureParentBranch: ({ parent, cwd }) => ensureParentBranch(pi, parent, cwd),
          refreshQueue: (parentIssueKey) => fetchParentQueue(parentIssueKey, (key) => loadIssueFromLinear(pi, key)),
          loadIssue: (issueKey) => loadIssueFromLinear(pi, issueKey),
          onExecutionStart: (event) => {
            const pathText = formatIssuePath(event.path);
            ctx.ui.notify(`Crosby starting ${event.child?.identifier ?? "issue"}${pathText ? ` (${pathText})` : ""}.`, "success");
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
            ctx.ui.notify(`Crosby finished ${event.child?.identifier ?? "issue"}: ${event.workerResult?.outcome ?? "unknown"}.`, event.workerResult?.outcome === "fatal" ? "error" : "success");
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
          completedChildKeys: execution.completedChildren.map((entry) => entry.child.identifier),
          completedChildOutcomes: execution.completedChildren.map((entry) => ({
            issueKey: entry.child.identifier,
            outcome: entry.workerResult.outcome,
          })),
          movedParentToBuilding: execution.movedParentToBuilding,
          remainingByReason: execution.remainingByReason,
          loadedAt: new Date().toISOString(),
        });

        const lastExecution = execution.completedChildren.at(-1);
        const parentTransition = execution.movedParentToBuilding ? ` Parent ${queue.parent.identifier} moved to Building.` : "";
        const remaining = Object.keys(execution.remainingByReason).length
          ? ` Remaining: ${JSON.stringify(execution.remainingByReason)}.`
          : "";
        const message =
          !lastExecution
            ? `No runnable child issues remain under ${queue.parent.identifier}.${remaining}`
            : lastExecution.workerResult.outcome === "fatal"
              ? `${lastExecution.child.identifier} returned fatal outcome after ${execution.completedChildren.length} child run(s). Recovery: ${lastExecution.workerResult.recoveryNotes.join(" ")}.${parentTransition}`
              : `Processed ${execution.completedChildren.length} child issue(s) under ${queue.parent.identifier}.${parentTransition}${remaining}`;
        ctx.ui.notify(message, lastExecution?.workerResult.outcome === "fatal" ? "error" : "success");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
