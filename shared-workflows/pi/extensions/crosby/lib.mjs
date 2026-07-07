import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_DOCUMENTS_ROOT = "C:\\Users\\camer\\Documents";

export function parseSingleIssueKeyArg(args) {
  const tokens = String(args ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 1) return tokens[0];
  if (tokens.length === 0) {
    throw new Error("Usage: /crosby <PARENT-ISSUE-KEY>");
  }

  throw new Error(
    "/crosby accepts exactly one issue key. Recovery: rerun /crosby with a single parent issue key, e.g. /crosby COA-116.",
  );
}

export function parseCrosbyCommandArgs(args) {
  const tokens = String(args ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 1 && tokens[0] === "--watch") {
    return { mode: "watch" };
  }

  if (tokens.includes("--watch")) {
    throw new Error("/crosby --watch does not accept an issue key. Recovery: run /crosby --watch by itself.");
  }

  if (tokens.length === 1) {
    return { mode: "parent", issueKey: tokens[0] };
  }

  if (tokens.length === 0) {
    throw new Error("Usage: /crosby <PARENT-ISSUE-KEY> | /crosby --watch");
  }

  throw new Error(
    "/crosby accepts exactly one parent issue key or the --watch flag. Recovery: rerun /crosby COA-116 or /crosby --watch.",
  );
}

export function loadParentQueueFromIssue(issue) {
  const children = Array.isArray(issue?.children) ? issue.children : [];

  if (issue?.parent) {
    throw new Error(
      `/crosby requires a parent issue with child execution issues. ${issue.identifier} is a child of ${issue.parent.identifier}. Recovery: rerun /crosby with the parent issue key.`,
    );
  }

  if (children.length === 0) {
    throw new Error(
      `/crosby requires a parent issue with child execution issues. ${issue?.identifier ?? "The supplied issue"} has no child issues. Recovery: add child execution issues first, then rerun /crosby.`,
    );
  }

  return {
    parent: issue,
    children,
  };
}

function getStateName(child) {
  return String(child?.state?.name ?? "Unknown").trim();
}

function getStateType(child) {
  return String(child?.state?.type ?? "").trim().toLowerCase();
}

function getPriorityRank(child) {
  return Number.isFinite(child?.priority) ? child.priority : Number.MAX_SAFE_INTEGER;
}

function compareIssueKeys(a, b) {
  return String(a.identifier ?? "").localeCompare(String(b.identifier ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareChildren(a, b) {
  const priorityDiff = getPriorityRank(a) - getPriorityRank(b);
  return priorityDiff !== 0 ? priorityDiff : compareIssueKeys(a, b);
}

function getIssueLabelNames(issue) {
  const labels = issue?.labels;

  if (Array.isArray(labels)) {
    return labels.map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean);
  }

  if (Array.isArray(labels?.nodes)) {
    return labels.nodes.map((label) => label?.name).filter(Boolean);
  }

  return [];
}

export function resolveIssueWorkingDirectory(issue, options = {}) {
  const documentsRoot = options.documentsRoot ?? DEFAULT_DOCUMENTS_ROOT;
  const projectsRoot = options.projectsRoot ?? path.join(documentsRoot, "projects");
  const folderExists = typeof options.folderExists === "function" ? options.folderExists : existsSync;
  const labelNames = getIssueLabelNames(issue);
  const checkedPaths = [];

  for (const label of labelNames) {
    const directPath = path.join(documentsRoot, label);
    checkedPaths.push(directPath);
    if (folderExists(directPath)) {
      return { label, cwd: directPath };
    }

    const projectsPath = path.join(projectsRoot, label);
    checkedPaths.push(projectsPath);
    if (folderExists(projectsPath)) {
      return { label, cwd: projectsPath };
    }
  }

  const issueKey = issue?.identifier ?? "UNKNOWN-ISSUE";
  const labelsSummary = labelNames.length > 0 ? labelNames.join(", ") : "none";
  const checkedSummary = checkedPaths.length > 0 ? checkedPaths.join(", ") : `${documentsRoot}/*`;
  throw new Error(
    `No folder label on ${issueKey} matched a local project directory. Labels checked: ${labelsSummary}. Paths checked: ${checkedSummary}. Recovery: add a label matching a local folder such as 'coachcw' or 'tools'.`,
  );
}

function hasUnresolvedBlockers(child) {
  const blockedBy = Array.isArray(child?.relations?.blockedBy) ? child.relations.blockedBy : [];
  return blockedBy.some((blocker) => blocker?.state?.name !== "Done");
}

function getNonRunnableReason(child) {
  if (hasUnresolvedBlockers(child)) return "blocked";

  const stateName = getStateName(child).toLowerCase().replace(/\s+/g, " ").trim();
  const stateType = getStateType(child);

  if (stateName === "done") return "done";
  if (stateName === "review" || stateName === "in review") return "review";
  if (stateName === "building" || stateName === "build") return null;
  if (stateName === "execute") return "building";
  if (stateName.includes("ready") && stateName.includes("build")) return null;
  if (stateName === "backlog") return "not-ready";

  if (stateType === "unstarted" || stateType === "backlog") return "not-ready";
  if (stateType === "started") return "building";
  if (stateType === "completed") return "done";
  if (stateType === "canceled") return "done";

  return "not-ready";
}

function getBuildingChildren(children) {
  return (Array.isArray(children) ? children : [])
    .filter((child) => {
      const stateName = getStateName(child).toLowerCase();
      const stateType = getStateType(child);
      return ["building", "build", "execute"].includes(stateName) || stateType === "started";
    })
    .sort(compareIssueKeys);
}

function buildConcurrentSupervisorError(queue, buildingChildren = getBuildingChildren(queue?.children)) {
  const buildingIssueKeys = buildingChildren.map((child) => child.identifier);
  const buildingSuffix = buildingIssueKeys.length > 0 ? ` Active Building child issues: ${buildingIssueKeys.join(", ")}.` : "";

  return new Error(
    `Another active supervisor run is already in progress for ${queue?.parent?.identifier ?? "the supplied parent"}.${buildingSuffix} Recovery: wait for the active run to finish or clear the stuck Building child in Linear, then rerun /crosby ${queue?.parent?.identifier ?? "PARENT-ISSUE-KEY"}.`,
  );
}

function assertNoConcurrentSupervisor(queue) {
  const buildingChildren = getBuildingChildren(queue?.children);
  if (buildingChildren.length > 1) {
    throw buildConcurrentSupervisorError(queue, buildingChildren);
  }
}

function orderRunnableChildren(runnable) {
  const childMap = new Map(runnable.map((child) => [child.identifier, child]));
  const indegree = new Map(runnable.map((child) => [child.identifier, 0]));
  const outgoing = new Map(runnable.map((child) => [child.identifier, []]));

  for (const child of runnable) {
    const blockedChildren = Array.isArray(child?.relations?.blocks) ? child.relations.blocks : [];
    for (const blocked of blockedChildren) {
      if (!childMap.has(blocked?.identifier)) continue;
      outgoing.get(child.identifier).push(blocked.identifier);
      indegree.set(blocked.identifier, indegree.get(blocked.identifier) + 1);
    }
  }

  const ready = runnable.filter((child) => indegree.get(child.identifier) === 0).sort(compareChildren);
  const ordered = [];

  while (ready.length > 0) {
    const next = ready.shift();
    ordered.push(next);

    for (const blockedIdentifier of outgoing.get(next.identifier)) {
      indegree.set(blockedIdentifier, indegree.get(blockedIdentifier) - 1);
      if (indegree.get(blockedIdentifier) === 0) {
        ready.push(childMap.get(blockedIdentifier));
        ready.sort(compareChildren);
      }
    }
  }

  if (ordered.length !== runnable.length) {
    const remaining = runnable
      .filter((child) => !ordered.some((orderedChild) => orderedChild.identifier === child.identifier))
      .sort(compareChildren);
    ordered.push(...remaining);
  }

  return ordered;
}

export function classifyChildIssues(children) {
  const runnable = [];
  const nonRunnable = [];

  for (const child of Array.isArray(children) ? children : []) {
    const reason = getNonRunnableReason(child);
    if (reason === null) {
      runnable.push(child);
      continue;
    }

    nonRunnable.push({ child, reason });
  }

  nonRunnable.sort((a, b) => compareIssueKeys(a.child, b.child));

  const reasonSummary = nonRunnable.reduce((summary, entry) => {
    summary[entry.reason] ??= [];
    summary[entry.reason].push(entry.child.identifier);
    return summary;
  }, {});

  return {
    runnable: orderRunnableChildren(runnable),
    nonRunnable,
    reasonSummary,
  };
}

export function selectNextExecuteIssue(issues) {
  const executeIssues = (Array.isArray(issues) ? issues : [])
    .filter((issue) => getStateName(issue).toLowerCase() === "execute" && issue?.parent)
    .sort(compareChildren);

  return executeIssues[0] ?? null;
}

export function buildRalphLoopPrompt(child) {
  const issueKey = child?.identifier ?? "UNKNOWN-ISSUE";
  const serializedChild = JSON.stringify(child, null, 2);
  const mayBeContainer = Array.isArray(child?.children) && child.children.length > 0;

  if (mayBeContainer) {
    return [
      `Continue Crosby execution for container issue ${issueKey}.`,
      "",
      "Execution notes:",
      `- Linear CLI is available and authenticated in this environment for ${issueKey}.`,
      `- Do not claim you cannot access Linear unless running 'linear issue view ${issueKey} --json' actually fails in this worker.`,
      `- First refresh the issue with 'linear issue view ${issueKey} --json'.`,
      "- Crosby may already have moved this container issue to Build/Building before launching this worker; that state is valid and means this is an explicit resume/continuation, not a fresh ralph-loop start.",
      "- This issue has child issues, so treat it as a container/parent queue instead of invoking the ralph-loop hard guard on the container itself.",
      "- Execute the next unblocked child issue under this container that is in Ready to Build, using the same TDD discipline as ralph-loop for that leaf issue.",
      "- If a nested child also has children, descend to its next unblocked Ready to Build child until you reach an executable leaf issue.",
      "- Move the executable leaf issue through Build/Building to Done when complete, or In Review if human action is required.",
      `- When all direct children of ${issueKey} are Done, return outcome done for ${issueKey}. If runnable children remain, continue within this worker until the ${issueKey} child queue is exhausted or human action is required.`,
      "- A preloaded issue snapshot is included below so you have immediate context even before refreshing.",
      "",
      "Preloaded issue snapshot:",
      serializedChild,
      "",
      "Return JSON only with this schema for the container issue:",
      '{"issueKey":"ISSUE-KEY","issueTitle":"Issue title","outcome":"done|review|fatal","summary":"Concise summary","changes":["key change"],"tests":["test or verification run"],"requiredHumanAction":"Required for review/fatal outcomes","recoveryNotes":["Required for review/fatal outcomes"]}',
    ].join("\n");
  }

  return [
    `Continue Crosby execution for issue ${issueKey}.`,
    "",
    "Execution notes:",
    `- Linear CLI is available and authenticated in this environment for ${issueKey}.`,
    `- Do not claim you cannot access Linear unless running 'linear issue view ${issueKey} --json' actually fails in this worker.`,
    `- First refresh the issue with 'linear issue view ${issueKey} --json'.`,
    "- The parent queue snapshot may be shallow and omit this issue's children, so do not assume this is a leaf issue from the preloaded snapshot alone.",
    "- If the refreshed issue has child issues, treat it as a container/parent queue: Build/Building is a valid resume state, find its next unblocked Ready to Build child, and continue through its child queue until exhausted or human action is required.",
    "- Only if the refreshed issue has no children, execute it as a leaf issue using ralph-loop/TDD discipline.",
    "- If Crosby already moved this issue to Build/Building before launching this worker, treat that as an explicit resume and proceed; do not fail solely because the current state is Build/Building.",
    "- A preloaded issue snapshot is included below so you have immediate context even before refreshing.",
    "",
    "Preloaded issue snapshot:",
    serializedChild,
    "",
    "Return JSON only with this schema:",
    '{"issueKey":"ISSUE-KEY","issueTitle":"Issue title","outcome":"done|review|fatal","summary":"Concise summary","changes":["key change"],"tests":["test or verification run"],"requiredHumanAction":"Required for review/fatal outcomes","recoveryNotes":["Required for review/fatal outcomes"]}',
  ].join("\n");
}

function formatBulletList(entries, fallback = "- None.") {
  return Array.isArray(entries) && entries.length > 0 ? entries.map((entry) => `- ${entry}`).join("\n") : fallback;
}

function getOutcomeStateLabel(outcome) {
  if (outcome === "done") return "Done";
  if (outcome === "review") return "Review";
  return "Fatal";
}

export function buildParentProgressComment(execution) {
  const followUpNotes =
    execution.workerResult.outcome === "review"
      ? [execution.workerResult.requiredHumanAction, ...(execution.workerResult.recoveryNotes ?? [])]
      : execution.workerResult.recoveryNotes ?? [];

  return [
    `${execution.child.identifier} — ${execution.child.title}`,
    "",
    `Status: ${getOutcomeStateLabel(execution.workerResult.outcome)}`,
    "",
    `Summary: ${execution.workerResult.summary}`,
    "",
    "Key changes:",
    formatBulletList(execution.workerResult.changes),
    "",
    "Tests/verifications:",
    formatBulletList(execution.workerResult.tests),
    "",
    "Follow-up notes / risks:",
    formatBulletList(followUpNotes),
  ].join("\n");
}

function collectSectionBullets(lines, headingPattern) {
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start === -1) return [];

  const bullets = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (bullets.length > 0) break;
      continue;
    }
    if (/^[A-Za-z][A-Za-z /-]*:\s*$/.test(trimmed)) break;
    if (trimmed.startsWith("- ")) {
      bullets.push(trimmed.slice(2));
    }
  }

  return bullets;
}

function summarizeChildFromExistingProgressComment(child, commentBody) {
  const lines = String(commentBody ?? "").split(/\r?\n/);
  const statusLine = lines.find((line) => /^Status:/i.test(line.trim()));
  const summaryLine = lines.find((line) => /^Summary:/i.test(line.trim()));

  return {
    identifier: child.identifier,
    title: child.title,
    status: statusLine ? statusLine.replace(/^Status:\s*/i, "").trim() : child?.state?.name ?? "Done",
    summary: summaryLine ? summaryLine.replace(/^Summary:\s*/i, "").trim() : "See earlier parent progress comment.",
    changes: collectSectionBullets(lines, /^Key changes:/i),
    tests: collectSectionBullets(lines, /^Tests(?:\/verifications(?: run)?)?:/i),
    followUp: collectSectionBullets(lines, /^Follow-up notes(?: \/ risks)?:/i),
  };
}

function summarizeChildForFinalComment(child, completedChildren, parentComments) {
  const currentRunEntry = completedChildren.find((entry) => entry.child.identifier === child.identifier);
  if (currentRunEntry) {
    const workerResult = currentRunEntry.workerResult;
    return {
      identifier: child.identifier,
      title: child.title,
      status: getOutcomeStateLabel(workerResult.outcome),
      summary: workerResult.summary,
      changes: workerResult.changes,
      tests: workerResult.tests,
      followUp:
        workerResult.outcome === "review"
          ? [workerResult.requiredHumanAction, ...(workerResult.recoveryNotes ?? [])]
          : workerResult.recoveryNotes ?? [],
    };
  }

  const matchingComment = (Array.isArray(parentComments) ? parentComments : []).find((comment) =>
    String(comment?.body ?? "").includes(child.identifier),
  );

  return summarizeChildFromExistingProgressComment(child, matchingComment?.body ?? "");
}

function areAllChildrenDone(children) {
  return Array.isArray(children) && children.length > 0 && children.every((child) => child?.state?.name === "Done");
}

export function buildFinalParentSummary(queue, completedChildren = []) {
  const parentComments = queue?.parent?.comments?.nodes ?? [];
  const completedSummaries = (Array.isArray(queue?.children) ? queue.children : [])
    .filter((child) => child?.state?.name === "Done")
    .sort(compareIssueKeys)
    .map((child) => summarizeChildForFinalComment(child, completedChildren, parentComments));

  const verificationLines = [...new Set(completedSummaries.flatMap((summary) => summary.tests).filter(Boolean))];
  const followUpLines = [...new Set(completedSummaries.flatMap((summary) => summary.followUp).filter(Boolean))];

  return [
    `${queue.parent.identifier} — ${queue.parent.title} final summary`,
    "",
    "Completed child outcomes:",
    ...completedSummaries.flatMap((summary) => [
      `- ${summary.identifier} — ${summary.title} (${summary.status})`,
      `  Summary: ${summary.summary}`,
      `  Key changes: ${summary.changes.length > 0 ? summary.changes.join("; ") : "See earlier parent progress comment."}`,
      `  Tests/verifications: ${summary.tests.length > 0 ? summary.tests.join("; ") : "See earlier parent progress comment."}`,
      `  Follow-up notes: ${summary.followUp.length > 0 ? summary.followUp.join("; ") : "None."}`,
    ]),
    "",
    "Verification rollup:",
    formatBulletList(verificationLines),
    "",
    "Follow-up notes / risks:",
    formatBulletList(followUpLines),
  ].join("\n");
}

async function reportChildOutcomeToParent(queue, execution, addComment) {
  try {
    await addComment(queue.parent.identifier, buildParentProgressComment(execution));
  } catch (error) {
    throw new Error(
      `Failed to post required parent progress comment for ${execution.child.identifier} after finalizing ${getOutcomeStateLabel(execution.workerResult.outcome)}. Recovery: add the parent progress comment on ${queue.parent.identifier}, then rerun /crosby ${queue.parent.identifier}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function finalizeParentIfComplete(queue, completedChildren, operations) {
  if (!areAllChildrenDone(queue?.children)) return;

  if (typeof operations.finalizeParentCompletion === "function") {
    await operations.finalizeParentCompletion(queue, completedChildren);
    return;
  }

  const finalSummary = buildFinalParentSummary(queue, completedChildren);

  try {
    await operations.addComment(queue.parent.identifier, finalSummary);
  } catch (error) {
    throw new Error(
      `Failed to post final parent summary comment for ${queue.parent.identifier}. Recovery: add the consolidated summary comment, then rerun /crosby ${queue.parent.identifier}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await operations.moveIssue(queue.parent.identifier, "Review");
  } catch (error) {
    throw new Error(
      `Failed to move parent issue ${queue.parent.identifier} to In Review after all children reached Done. Recovery: move the parent to In Review after confirming the final summary comment, then rerun /crosby ${queue.parent.identifier}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseStructuredWorkerResult(workerResult, child) {
  const rawOutput = String(workerResult?.stdout ?? "").trim();
  if (!rawOutput) {
    throw new Error(`Structured worker result missing for ${child.identifier}. Recovery: rerun the child worker and ensure it returns JSON only.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error(
      `Structured worker result invalid for ${child.identifier}. Recovery: worker output must be valid JSON with the required fields.`,
    );
  }

  const requiredString = ["issueKey", "issueTitle", "outcome", "summary"];
  for (const field of requiredString) {
    if (typeof parsed?.[field] !== "string" || parsed[field].trim() === "") {
      throw new Error(`Structured worker result missing required field '${field}' for ${child.identifier}.`);
    }
  }

  if (!Array.isArray(parsed?.changes) || parsed.changes.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`Structured worker result missing required field 'changes' for ${child.identifier}.`);
  }

  if (!Array.isArray(parsed?.tests) || parsed.tests.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`Structured worker result missing required field 'tests' for ${child.identifier}.`);
  }

  if (!["done", "review", "fatal"].includes(parsed.outcome)) {
    throw new Error(`Structured worker result has invalid outcome '${parsed.outcome}' for ${child.identifier}.`);
  }

  if (parsed.issueKey !== child.identifier) {
    throw new Error(`Structured worker result issue key mismatch for ${child.identifier}.`);
  }

  if (parsed.issueTitle !== child.title) {
    throw new Error(`Structured worker result issue title mismatch for ${child.identifier}.`);
  }

  if (["review", "fatal"].includes(parsed.outcome)) {
    if (typeof parsed.requiredHumanAction !== "string" || parsed.requiredHumanAction.trim() === "") {
      throw new Error(`Structured worker result missing requiredHumanAction for ${child.identifier} ${parsed.outcome} outcome.`);
    }

    if (
      !Array.isArray(parsed.recoveryNotes) ||
      parsed.recoveryNotes.length === 0 ||
      parsed.recoveryNotes.some((entry) => typeof entry !== "string" || entry.trim() === "")
    ) {
      throw new Error(`Structured worker result missing recoveryNotes for ${child.identifier} ${parsed.outcome} outcome.`);
    }
  }

  return parsed;
}

export function summarizeRemainingChildren(classification) {
  return Object.entries(classification?.reasonSummary ?? {}).reduce((summary, [reason, issueKeys]) => {
    if (reason === "done") return summary;
    summary[reason] = issueKeys;
    return summary;
  }, {});
}

export function selectNextRunnableChild(queue) {
  const classification = classifyChildIssues(queue?.children ?? []);
  const child = classification.runnable[0];

  if (!child) {
    const remainingByReason = summarizeRemainingChildren(classification);
    const suffix = Object.keys(remainingByReason).length ? ` Remaining children: ${JSON.stringify(remainingByReason)}.` : "";
    throw new Error(
      `/crosby found no runnable child issues under ${queue?.parent?.identifier ?? "the supplied parent"}.${suffix}`,
    );
  }

  return {
    child,
    classification,
  };
}

async function resolveExecutableIssuePath(queue, operations, ancestors = []) {
  const classification = classifyChildIssues(queue?.children ?? []);

  for (const candidate of classification.runnable) {
    const fullIssue = typeof operations.loadIssue === "function" ? await operations.loadIssue(candidate.identifier) : candidate;
    const executable = fullIssue ?? candidate;
    const path = [...ancestors, executable];
    const children = Array.isArray(executable?.children) ? executable.children : [];

    if (children.length === 0) {
      return { child: executable, classification, path };
    }

    try {
      return await resolveExecutableIssuePath({ parent: executable, children }, operations, path);
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).includes("found no runnable executable leaf")) {
        throw error;
      }
    }
  }

  const remainingByReason = summarizeRemainingChildren(classification);
  const suffix = Object.keys(remainingByReason).length ? ` Remaining children: ${JSON.stringify(remainingByReason)}.` : "";
  throw new Error(
    `/crosby found no runnable executable leaf under ${queue?.parent?.identifier ?? "the supplied parent"}.${suffix}`,
  );
}

async function finalizeCompletedContainers(path, operations) {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const container = typeof operations.loadIssue === "function" ? await operations.loadIssue(path[index].identifier) : path[index];
    if (areAllChildrenDone(container?.children)) {
      await operations.moveIssue(container.identifier, "Done");
    }
  }
}

function getExecutionRoutingTarget(queue, child) {
  if (getIssueLabelNames(child).length > 0) return child;
  if (getIssueLabelNames(queue?.parent).length > 0) return queue.parent;
  return null;
}

export async function runSingleChildExecution(queue, operations) {
  const { child, classification, path } = await resolveExecutableIssuePath(queue, operations);
  const topLevelChild = path[0] ?? child;
  const routingTarget = getExecutionRoutingTarget(queue, topLevelChild);
  const routing = routingTarget ? resolveIssueWorkingDirectory(routingTarget, operations.routing) : null;

  if (typeof operations.ensureParentBranch === "function") {
    await operations.ensureParentBranch({
      parent: queue.parent,
      child: topLevelChild,
      cwd: routing?.cwd,
    });
  }

  for (const issue of path) {
    try {
      await operations.moveIssue(issue.identifier, "Building");
    } catch (error) {
      if (typeof operations.refreshQueue === "function") {
        const refreshedQueue = await operations.refreshQueue(queue.parent.identifier);
        const refreshedChild = (refreshedQueue?.children ?? []).find((entry) => entry?.identifier === issue.identifier);
        if (refreshedChild?.state?.name === "Building") {
          throw buildConcurrentSupervisorError(refreshedQueue);
        }
      }

      throw new Error(
        `Failed to move issue ${issue.identifier} to Building. Recovery: inspect the issue state in Linear, then rerun /crosby ${queue.parent.identifier}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (typeof operations.onExecutionStart === "function") {
    await operations.onExecutionStart({
      parent: queue.parent,
      child,
      topLevelChild,
      path,
      cwd: routing?.cwd,
    });
  }

  const movedParentToBuilding = !["Building", "Build", "Execute"].includes(queue?.parent?.state?.name);
  if (movedParentToBuilding) {
    try {
      await operations.moveIssue(queue.parent.identifier, "Building");
    } catch (error) {
      throw new Error(
        `Failed to move parent issue ${queue.parent.identifier} to Building after claiming ${child.identifier}. Recovery: fix the parent workflow state in Linear before worker launch, then rerun /crosby ${queue.parent.identifier}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const workerPrompt = buildRalphLoopPrompt(child);
  const rawWorkerResult = await operations.runWorker({
    parentIssueKey: queue.parent.identifier,
    childIssueKey: child.identifier,
    prompt: workerPrompt,
    cwd: routing?.cwd,
  });
  const workerResult = parseStructuredWorkerResult(rawWorkerResult, child);

  if (typeof operations.onExecutionFinish === "function") {
    await operations.onExecutionFinish({
      parent: queue.parent,
      child,
      topLevelChild,
      path,
      cwd: routing?.cwd,
      rawWorkerResult,
      workerResult,
    });
  }

  if (workerResult.outcome === "done") {
    await operations.moveIssue(child.identifier, "Done");
    await finalizeCompletedContainers(path, operations);
  }

  if (workerResult.outcome === "review") {
    await operations.moveIssue(child.identifier, "In Review");
  }

  return {
    child,
    topLevelChild,
    path,
    classification,
    movedParentToBuilding,
    workerPrompt,
    workerResult,
  };
}

export async function runQueueExecution(initialQueue, operations) {
  const completedChildren = [];
  let queue = initialQueue;
  let movedParentToBuilding = false;

  while (true) {
    assertNoConcurrentSupervisor(queue);
    const classification = classifyChildIssues(queue?.children ?? []);
    if (classification.runnable.length === 0) {
      return {
        parent: queue.parent,
        completedChildren,
        movedParentToBuilding,
        finalClassification: classification,
        remainingByReason: summarizeRemainingChildren(classification),
      };
    }

    const execution = await runSingleChildExecution(queue, {
      moveIssue: operations.moveIssue,
      runWorker: operations.runWorker,
      refreshQueue: operations.refreshQueue,
      loadIssue: operations.loadIssue,
      onExecutionStart: operations.onExecutionStart,
      onExecutionFinish: operations.onExecutionFinish,
      ensureParentBranch: operations.ensureParentBranch,
      routing: operations.routing,
    });
    completedChildren.push(execution);
    movedParentToBuilding ||= execution.movedParentToBuilding;

    if (execution.workerResult.outcome === "fatal") {
      return {
        parent: queue.parent,
        completedChildren,
        movedParentToBuilding,
        finalClassification: classification,
        remainingByReason: summarizeRemainingChildren(classification),
      };
    }

    await reportChildOutcomeToParent(queue, execution, operations.addComment);
    queue = await operations.refreshQueue(queue.parent.identifier);
    await finalizeParentIfComplete(queue, completedChildren, operations);
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLocalDateKey(now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runWatchCycle(operations) {
  const fetchedExecuteParentQueues = await operations.fetchExecuteParentQueues();
  const executeParentQueues = (Array.isArray(fetchedExecuteParentQueues) ? fetchedExecuteParentQueues : [])
    .filter((queue) => queue?.parent && getStateName(queue.parent).toLowerCase() === "execute")
    .sort((a, b) => compareChildren(a.parent, b.parent));
  const routingErrors = [];

  for (const queue of executeParentQueues) {
    if (getBuildingChildren(queue?.children).length > 0) {
      continue;
    }

    const classification = classifyChildIssues(queue?.children ?? []);
    const child = classification.runnable[0] ?? null;
    if (!child) {
      continue;
    }

    const routingTarget = getExecutionRoutingTarget(queue, child);
    if (routingTarget) {
      try {
        resolveIssueWorkingDirectory(routingTarget, operations.routing);
      } catch (error) {
        routingErrors.push({
          issue: queue.parent,
          child,
          message: getErrorMessage(error),
        });
        continue;
      }
    }

    const execution = await runSingleChildExecution(queue, {
      moveIssue: operations.moveIssue,
      runWorker: operations.runWorker,
      refreshQueue: operations.refreshQueue,
      loadIssue: operations.loadIssue,
      onExecutionStart: operations.onExecutionStart,
      onExecutionFinish: operations.onExecutionFinish,
      ensureParentBranch: operations.ensureParentBranch,
      routing: operations.routing,
    });

    if (execution.workerResult.outcome === "fatal") {
      return {
        status: "fatal",
        parent: queue.parent,
        issue: execution.child,
        workerPrompt: execution.workerPrompt,
        workerResult: execution.workerResult,
        routingErrors,
        errorMessage: `Watch mode worker returned fatal outcome for ${execution.child.identifier}. Recovery: ${execution.workerResult.recoveryNotes.join(" ")}`,
      };
    }

    await reportChildOutcomeToParent(queue, execution, operations.addComment);
    const refreshedQueue = await operations.refreshQueue(queue.parent.identifier);
    await finalizeParentIfComplete(refreshedQueue, [execution], operations);

    return {
      status: "processed",
      parent: queue.parent,
      issue: execution.child,
      workerPrompt: execution.workerPrompt,
      workerResult: execution.workerResult,
      routingErrors,
    };
  }

  return {
    status: routingErrors.length > 0 ? "skipped" : "idle",
    parent: null,
    issue: null,
    workerPrompt: null,
    workerResult: null,
    routingErrors,
  };
}

export async function runWatchMode(operations, options = {}) {
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) ? Math.max(0, options.pollIntervalMs) : 60000;
  const maxCycles = Number.isFinite(options.maxCycles) ? Math.max(0, options.maxCycles) : Number.POSITIVE_INFINITY;
  const sleep = operations.sleep ?? defaultSleep;
  const getNow = typeof options.getNow === "function" ? options.getNow : () => new Date();
  const cycles = [];

  for (let cycleIndex = 0; cycleIndex < maxCycles; cycleIndex += 1) {
    const now = getNow();
    let cycle;

    try {
      cycle = {
        ...(await runWatchCycle(operations)),
        timestamp: now.toISOString(),
      };
    } catch (error) {
      cycle = {
        status: "error",
        parent: null,
        issue: null,
        workerPrompt: null,
        workerResult: null,
        routingErrors: [],
        timestamp: now.toISOString(),
        errorMessage: getErrorMessage(error),
      };
    }

    cycles.push(cycle);

    if (typeof options.onCycle === "function") {
      await options.onCycle(cycle, cycleIndex);
    }

    if (cycleIndex + 1 < maxCycles) {
      await sleep(pollIntervalMs);
    }
  }

  return {
    pollIntervalMs,
    cycles,
  };
}

export async function fetchParentQueue(issueKey, loadIssue) {
  const issue = await loadIssue(issueKey);
  return loadParentQueueFromIssue(issue);
}
