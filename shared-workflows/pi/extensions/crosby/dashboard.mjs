import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyChildIssues,
  formatLifecycleFinishedEvent,
  formatLifecycleStartedEvent,
} from "./lib-v2.mjs";

const STATUS_ICONS = {
  queued: "☐",
  not_ready: "…",
  blocked: "⏸",
  in_progress: "🔄",
  finishing: "⌛",
  done: "✅",
  review: "👀",
  fatal: "❌",
  skipped: "↷",
  unknown: "?",
};

function nowISOString(options = {}) {
  return typeof options.now === "function"
    ? options.now()
    : new Date().toISOString();
}

function getIssueKey(issueOrKey) {
  if (typeof issueOrKey === "string") return issueOrKey;
  return String(issueOrKey?.identifier ?? issueOrKey?.number ?? "").trim();
}

function getIssueTitle(issue, fallback = "Untitled task") {
  return String(issue?.title ?? fallback).trim() || fallback;
}

function normalizeStateName(issue) {
  return String(issue?.state?.name ?? issue?.state ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStateType(issue) {
  return String(issue?.state?.type ?? "")
    .toLowerCase()
    .trim();
}

function statusFromIssue(issue, reason) {
  const stateName = normalizeStateName(issue);
  const stateType = normalizeStateType(issue);
  const closed = String(issue?.state ?? "").toUpperCase() === "CLOSED";

  if (closed || stateName === "done" || stateType === "completed") return "done";
  if (stateName === "review" || stateName === "in review") return "review";
  if (
    ["building", "build", "execute"].includes(stateName) ||
    stateType === "started"
  ) {
    return "in_progress";
  }

  if (reason === "done") return "done";
  if (reason === "review") return "review";
  if (reason === "blocked") return "blocked";
  if (reason === "not-ready") return "not_ready";
  if (reason === "building") return "in_progress";
  if (reason) return "skipped";

  if (stateName.includes("ready") && stateName.includes("build")) return "queued";
  if (stateName === "ready") return "queued";
  if (!stateName && !stateType) return "unknown";
  return "queued";
}

function buildReasonByIssue(children) {
  const classification = classifyChildIssues(children);
  const reasonByIssue = new Map();
  for (const entry of classification.nonRunnable ?? []) {
    const issueKey = getIssueKey(entry.child);
    if (issueKey) reasonByIssue.set(issueKey, entry.reason);
  }
  return reasonByIssue;
}

function createTaskFromIssue(issue, reason, previous = {}) {
  const issueKey = getIssueKey(issue);
  return {
    issueKey,
    title: getIssueTitle(issue, previous.title),
    status: statusFromIssue(issue, reason),
    stateName: issue?.state?.name ?? previous.stateName ?? null,
    reason: reason ?? previous.reason ?? null,
    path: previous.path ?? null,
    cwd: previous.cwd ?? null,
    workerPaneId: previous.workerPaneId ?? null,
    workerAgentName: previous.workerAgentName ?? null,
    workerLabel: previous.workerLabel ?? null,
    outcome: previous.outcome ?? null,
    summary: previous.summary ?? null,
    startedAt: previous.startedAt ?? null,
    finishedAt: previous.finishedAt ?? null,
    updatedAt: previous.updatedAt ?? null,
    discovered: previous.discovered ?? false,
  };
}

function formatIssuePath(path) {
  const keys = (Array.isArray(path) ? path : [])
    .map((issue) => getIssueKey(issue))
    .filter(Boolean);
  return keys.length > 0 ? keys.join(" > ") : null;
}

function findTask(dashboard, issueKey) {
  return dashboard.tasks.find((task) => task.issueKey === issueKey) ?? null;
}

function upsertTask(dashboard, issue, options = {}) {
  const issueKey = getIssueKey(issue ?? options.issueKey);
  if (!issueKey) return null;

  const existing = findTask(dashboard, issueKey);
  if (existing) {
    if (issue?.title) existing.title = getIssueTitle(issue, existing.title);
    return existing;
  }

  const task = {
    issueKey,
    title: getIssueTitle(issue, options.title ?? issueKey),
    status: options.status ?? statusFromIssue(issue),
    stateName: issue?.state?.name ?? null,
    reason: options.reason ?? null,
    path: options.path ?? null,
    cwd: options.cwd ?? null,
    workerPaneId: null,
    workerAgentName: null,
    workerLabel: null,
    outcome: null,
    summary: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: null,
    discovered: options.discovered ?? true,
  };
  dashboard.tasks.push(task);
  return task;
}

function touchDashboard(dashboard, options = {}) {
  dashboard.updatedAt = nowISOString(options);
}

const EVENT_LOG_LIMIT = 50;

function pushLifecycleEvent(dashboard, message, options = {}) {
  if (!message) return;
  if (dashboard.lastEvent?.message === message) return;
  const entry = { message, timestamp: nowISOString(options) };
  dashboard.events.push(entry);
  if (dashboard.events.length > EVENT_LOG_LIMIT) {
    dashboard.events.splice(0, dashboard.events.length - EVENT_LOG_LIMIT);
  }
  dashboard.lastEvent = entry;
}

export function createCrosbyDashboard(queue, options = {}) {
  const children = Array.isArray(queue?.children) ? queue.children : [];
  const reasonByIssue = buildReasonByIssue(children);
  const timestamp = nowISOString(options);

  return {
    runId: options.runId ?? `crosby-${Date.now().toString(36)}`,
    mode: options.mode ?? "manual",
    parentIssueKey: getIssueKey(queue?.parent) || "UNKNOWN-PARENT",
    parentTitle: getIssueTitle(queue?.parent, "Crosby parent"),
    tasks: children.map((child) =>
      createTaskFromIssue(child, reasonByIssue.get(getIssueKey(child))),
    ),
    currentIssueKey: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    fatalError: null,
    events: [],
    lastEvent: null,
    dashboardPaneId: options.dashboardPaneId ?? null,
  };
}

export function reconcileDashboardFromQueue(dashboard, queue, options = {}) {
  if (!dashboard || !queue) return dashboard;

  dashboard.parentIssueKey = getIssueKey(queue.parent) || dashboard.parentIssueKey;
  dashboard.parentTitle = getIssueTitle(queue.parent, dashboard.parentTitle);

  const children = Array.isArray(queue.children) ? queue.children : [];
  const reasonByIssue = buildReasonByIssue(children);
  const knownTasks = new Map(dashboard.tasks.map((task) => [task.issueKey, task]));
  const nextTasks = [];

  for (const child of children) {
    const issueKey = getIssueKey(child);
    if (!issueKey) continue;
    const previous = knownTasks.get(issueKey) ?? {};
    nextTasks.push(createTaskFromIssue(child, reasonByIssue.get(issueKey), previous));
    knownTasks.delete(issueKey);
  }

  for (const task of dashboard.tasks) {
    if (knownTasks.has(task.issueKey) && task.discovered) {
      nextTasks.push(task);
    }
  }

  dashboard.tasks = nextTasks;
  touchDashboard(dashboard, options);
  return dashboard;
}

export function markDashboardExecutionStarted(dashboard, event = {}) {
  if (!dashboard) return dashboard;
  const timestamp = nowISOString(event);
  const child = event.child ?? event.issue;
  const topLevelChild = event.topLevelChild;
  const path = formatIssuePath(event.path);

  const topLevelKey = getIssueKey(topLevelChild);
  const childKey = getIssueKey(child);
  const keysToMark = [...new Set([topLevelKey, childKey].filter(Boolean))];

  for (const issueKey of keysToMark) {
    const issue = issueKey === topLevelKey ? topLevelChild : child;
    const task = upsertTask(dashboard, issue ?? issueKey, {
      status: "in_progress",
      path,
      cwd: event.cwd ?? null,
      discovered: issueKey !== topLevelKey || !findTask(dashboard, issueKey),
    });
    if (!task) continue;
    task.status = "in_progress";
    task.path = path ?? task.path;
    task.cwd = event.cwd ?? task.cwd;
    task.startedAt ??= timestamp;
    task.updatedAt = timestamp;
  }

  dashboard.currentIssueKey = childKey || topLevelKey || dashboard.currentIssueKey;
  if (childKey) {
    pushLifecycleEvent(dashboard, formatLifecycleStartedEvent(childKey), event);
  }
  touchDashboard(dashboard, event);
  return dashboard;
}

export function markDashboardHerdrWorkerStarted(dashboard, event = {}) {
  if (!dashboard) return dashboard;
  const issueKey = getIssueKey(event.issueKey ?? event.child);
  if (!issueKey) return dashboard;

  const task = upsertTask(dashboard, { identifier: issueKey, title: event.title }, {
    status: "in_progress",
  });
  task.status = "in_progress";
  task.workerPaneId = event.paneId ?? task.workerPaneId;
  task.workerAgentName = event.agentName ?? task.workerAgentName;
  task.workerLabel = event.label ?? task.workerLabel;
  task.updatedAt = nowISOString(event);
  dashboard.currentIssueKey = issueKey;
  touchDashboard(dashboard, event);
  return dashboard;
}

export function markDashboardExecutionFinished(dashboard, event = {}) {
  if (!dashboard) return dashboard;
  const outcome = event.workerResult?.outcome;
  if (outcome === "fatal") {
    return markDashboardExecutionFinalized(dashboard, event);
  }

  const issueKey = getIssueKey(event.child ?? event.issue);
  const task = issueKey ? upsertTask(dashboard, event.child ?? issueKey) : null;
  if (task) {
    task.outcome = outcome ?? task.outcome;
    task.summary = event.workerResult?.summary ?? task.summary;
    task.status = "finishing";
    task.updatedAt = nowISOString(event);
  }
  touchDashboard(dashboard, event);
  return dashboard;
}

export function markDashboardExecutionFinalized(dashboard, event = {}) {
  if (!dashboard) return dashboard;
  const timestamp = nowISOString(event);
  const outcome = event.workerResult?.outcome;
  const status =
    outcome === "done" ? "done" : outcome === "review" ? "review" : "fatal";
  const child = event.child ?? event.issue;
  const issueKey = getIssueKey(child);
  const task = issueKey ? upsertTask(dashboard, child ?? issueKey) : null;

  if (task) {
    task.status = status;
    task.outcome = outcome ?? status;
    task.summary = event.workerResult?.summary ?? task.summary;
    task.requiredHumanAction =
      event.workerResult?.requiredHumanAction ?? task.requiredHumanAction ?? null;
    task.recoveryNotes = event.workerResult?.recoveryNotes ?? task.recoveryNotes ?? null;
    task.finishedAt = timestamp;
    task.updatedAt = timestamp;
  }

  if (issueKey && outcome) {
    pushLifecycleEvent(dashboard, formatLifecycleFinishedEvent(issueKey, outcome), event);
  }

  if (status === "fatal") {
    dashboard.fatalError =
      event.workerResult?.requiredHumanAction ||
      event.workerResult?.summary ||
      dashboard.fatalError;
  }

  if (dashboard.currentIssueKey === issueKey) {
    dashboard.currentIssueKey = null;
  }

  touchDashboard(dashboard, event);
  return dashboard;
}

export function markDashboardFatalError(dashboard, error, options = {}) {
  if (!dashboard) return dashboard;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  dashboard.fatalError = message;

  const currentTask = dashboard.currentIssueKey
    ? findTask(dashboard, dashboard.currentIssueKey)
    : dashboard.tasks.find((task) => task.status === "in_progress");
  if (currentTask) {
    currentTask.status = "fatal";
    currentTask.outcome = "fatal";
    currentTask.summary = message;
    currentTask.finishedAt = nowISOString(options);
    currentTask.updatedAt = currentTask.finishedAt;
  }

  touchDashboard(dashboard, options);
  return dashboard;
}

export function markDashboardPaneOpened(dashboard, event = {}) {
  if (!dashboard) return dashboard;
  dashboard.dashboardPaneId = event.paneId ?? dashboard.dashboardPaneId;
  touchDashboard(dashboard, event);
  return dashboard;
}

export function getCrosbyRunsRoot(options = {}) {
  return options.runsRoot ?? path.join(os.homedir(), ".pi", "agent", "crosby", "runs");
}

export function getDashboardEventsPath(dashboard, options = {}) {
  if (!dashboard?.runId) return null;
  if (options.eventsPath) return options.eventsPath;
  return path.join(getCrosbyRunsRoot(options), dashboard.runId, "events.jsonl");
}

/**
 * Append the current dashboard state as one JSON line to the run's events.jsonl
 * file so a separate terminal process (dashboard-runner.mjs) can tail it.
 * Append-only, best-effort: persistence failures never interrupt dashboard updates.
 */
export function persistDashboardEvent(dashboard, options = {}) {
  const eventsPath = getDashboardEventsPath(dashboard, options);
  if (!eventsPath) return null;
  try {
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(eventsPath, `${JSON.stringify(dashboard)}\n`, { flag: "a" });
  } catch {
    // Persistence is best-effort and must never stop Crosby execution.
  }
  return eventsPath;
}

function formatElapsed(startedAt, finishedAt) {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m${seconds}s` : `${minutes}m`;
}

function renderTask(task) {
  const icon = STATUS_ICONS[task.status] ?? STATUS_ICONS.unknown;
  const worker = task.workerPaneId ? ` — pane ${task.workerPaneId}` : "";
  const path = task.path && task.path !== task.issueKey ? ` [${task.path}]` : "";
  const reason = task.status === "blocked" && task.reason ? ` (${task.reason})` : "";
  const elapsed =
    task.status === "in_progress"
      ? formatElapsed(task.startedAt)
      : task.finishedAt && task.startedAt
        ? formatElapsed(task.startedAt, task.finishedAt)
        : null;
  const elapsedText = elapsed ? ` ${elapsed}` : "";
  return `${icon} ${task.issueKey} ${task.title}${worker}${path}${reason}${elapsedText}`;
}

const DASHBOARD_TASK_LINE_BUDGET = 14;
const LATEST_COMPLETED_WHEN_TRUNCATED = 3;

function isCompletedTask(task) {
  return task.status === "done";
}

function compareMostRecentTask(a, b) {
  const aTime = Date.parse(a.finishedAt ?? a.updatedAt ?? a.startedAt ?? "");
  const bTime = Date.parse(b.finishedAt ?? b.updatedAt ?? b.startedAt ?? "");
  const safeA = Number.isFinite(aTime) ? aTime : 0;
  const safeB = Number.isFinite(bTime) ? bTime : 0;
  return safeB - safeA;
}

function taskSortIndex(tasks) {
  return new Map(tasks.map((task, index) => [task.issueKey, index]));
}

function renderPrioritizedTasks(tasks) {
  if (tasks.length <= DASHBOARD_TASK_LINE_BUDGET) return tasks.map(renderTask);

  const originalIndex = taskSortIndex(tasks);
  const remaining = tasks.filter((task) => !isCompletedTask(task));
  const completed = tasks.filter(isCompletedTask);
  const lines = [];
  const visibleCompleted = [...completed]
    .sort(compareMostRecentTask)
    .slice(0, LATEST_COMPLETED_WHEN_TRUNCATED)
    .sort(
      (a, b) =>
        (originalIndex.get(a.issueKey) ?? 0) -
        (originalIndex.get(b.issueKey) ?? 0),
    );

  if (visibleCompleted.length > 0) {
    lines.push(
      `Latest completed: ${visibleCompleted.map(renderTask).join(" · ")}`,
    );
    if (completed.length > visibleCompleted.length) {
      lines.push(`… ${completed.length - visibleCompleted.length} older completed hidden`);
    }
  }

  lines.push(`Left to complete (${remaining.length}):`, ...remaining.map(renderTask));
  return lines;
}

export function renderCrosbyDashboard(dashboard) {
  if (!dashboard) return [];
  const total = dashboard.tasks.length;
  const done = dashboard.tasks.filter((task) => task.status === "done").length;
  const inProgress = dashboard.tasks.filter(
    (task) => task.status === "in_progress",
  ).length;
  const review = dashboard.tasks.filter((task) => task.status === "review").length;
  const fatal = dashboard.tasks.filter((task) => task.status === "fatal").length;
  const blocked = dashboard.tasks.filter(
    (task) => task.status === "blocked" || task.status === "not_ready",
  ).length;

  const summaryParts = [`${done}/${total} done`, `${total - done} left`];
  if (inProgress) summaryParts.push(`${inProgress} in progress`);
  if (review) summaryParts.push(`${review} in review`);
  if (fatal) summaryParts.push(`${fatal} fatal`);
  if (blocked) summaryParts.push(`${blocked} blocked/not ready`);

  const lines = [
    `Crosby ${dashboard.parentIssueKey}: ${dashboard.parentTitle}`,
    `Progress: ${summaryParts.join(", ")}`,
  ];

  if (dashboard.fatalError) {
    lines.push(`Error: ${dashboard.fatalError}`);
  }

  lines.push("", ...renderPrioritizedTasks(dashboard.tasks));

  const events = Array.isArray(dashboard.events) ? dashboard.events : [];
  if (events.length > 0) {
    lines.push("", "Event log:", ...events.map((entry) => `- ${entry.message}`));
  }

  return lines;
}

export function renderCrosbyCompactDashboard(dashboard) {
  if (!dashboard) return [];
  const stateLine = `Crosby ${dashboard.parentIssueKey}: ${dashboard.parentTitle}`;
  const lastLine = dashboard.lastEvent
    ? `Last: ${dashboard.lastEvent.message}`
    : "Last: (no events yet)";
  const paneLine = dashboard.dashboardPaneId
    ? `Dashboard: pane ${dashboard.dashboardPaneId}`
    : "Dashboard: pane not open";

  const lines = [stateLine, lastLine, paneLine];
  if (dashboard.fatalError) {
    lines.push(`Error: ${dashboard.fatalError}`);
  }
  return lines;
}
