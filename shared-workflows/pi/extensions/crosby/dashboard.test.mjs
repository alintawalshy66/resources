import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCrosbyDashboard,
  getDashboardEventsPath,
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

function makeTempRunsRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "crosby-dashboard-test-"));
}

function readEventLines(eventsPath) {
  return fs
    .readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("Crosby dashboard renders loaded, in-progress, worker, and finalized task states", () => {
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#130",
          title: "First task",
          state: { name: "Ready to Build", type: "unstarted" },
        },
        {
          identifier: "#131",
          title: "Already done",
          state: { name: "Done", type: "completed" },
        },
      ],
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );

  assert.match(renderCrosbyDashboard(dashboard).join("\n"), /1\/2 done/);
  assert.match(renderCrosbyDashboard(dashboard).join("\n"), /☐ #130 First task/);
  assert.match(renderCrosbyDashboard(dashboard).join("\n"), /✅ #131 Already done/);

  markDashboardExecutionStarted(dashboard, {
    child: { identifier: "#130", title: "First task" },
    path: [{ identifier: "#130", title: "First task" }],
    cwd: "/repo",
    now: () => "2026-08-02T00:01:00.000Z",
  });
  markDashboardHerdrWorkerStarted(dashboard, {
    issueKey: "#130",
    paneId: "pane-123",
    agentName: "crosby-130",
    label: "Crosby #130",
    now: () => "2026-08-02T00:02:00.000Z",
  });

  const inProgress = renderCrosbyDashboard(dashboard).join("\n");
  assert.match(inProgress, /🔄 #130 First task — pane pane-123/);
  assert.match(inProgress, /1 in progress/);

  markDashboardExecutionFinalized(dashboard, {
    child: { identifier: "#130", title: "First task" },
    workerResult: { outcome: "done", summary: "Finished." },
    now: () => "2026-08-02T00:03:00.000Z",
  });

  const finalized = renderCrosbyDashboard(dashboard).join("\n");
  assert.match(finalized, /2\/2 done/);
  assert.match(finalized, /✅ #130 First task/);
});

test("Crosby dashboard reconciles refreshed GitHub queue while keeping discovered worker metadata", () => {
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#130",
          title: "First task",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );

  markDashboardHerdrWorkerStarted(dashboard, {
    issueKey: "#130",
    paneId: "pane-123",
    agentName: "crosby-130",
    label: "Crosby #130",
    now: () => "2026-08-02T00:02:00.000Z",
  });
  reconcileDashboardFromQueue(dashboard, {
    parent: { identifier: "#129", title: "Parent feature" },
    children: [
      {
        identifier: "#130",
        title: "First task renamed",
        state: { name: "Review", type: "started" },
      },
      {
        identifier: "#131",
        title: "Newly discovered task",
        state: { name: "Ready to Build", type: "unstarted" },
      },
    ],
  });

  const rendered = renderCrosbyDashboard(dashboard).join("\n");
  assert.match(rendered, /👀 #130 First task renamed — pane pane-123/);
  assert.match(rendered, /☐ #131 Newly discovered task/);
});

test("Crosby dashboard prioritizes unfinished work and only recent completed work when long", () => {
  const children = Array.from({ length: 18 }, (_, index) => {
    const issueNumber = 130 + index;
    const done = index < 10;
    return {
      identifier: `#${issueNumber}`,
      title: done ? `Completed task ${index}` : `Remaining task ${index}`,
      state: done
        ? { name: "Done", type: "completed" }
        : { name: "Ready to Build", type: "unstarted" },
    };
  });
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children,
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );

  for (let index = 0; index < 10; index += 1) {
    markDashboardExecutionFinalized(dashboard, {
      child: { identifier: `#${130 + index}`, title: `Completed task ${index}` },
      workerResult: { outcome: "done", summary: "Finished." },
      now: () => `2026-08-02T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
    });
  }

  const rendered = renderCrosbyDashboard(dashboard).join("\n");
  assert.match(rendered, /Progress: 10\/18 done, 8 left/);
  assert.match(rendered, /Latest completed:/);
  assert.match(rendered, /Left to complete \(8\):\n☐ #140 Remaining task 10/);
  assert.match(rendered, /☐ #147 Remaining task 17/);
  assert.match(rendered, /✅ #139 Completed task 9/);
  assert.doesNotMatch(rendered, /✅ #130 Completed task 0/);
});

test("Crosby dashboard marks current task and run fatal on command errors", () => {
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#130",
          title: "First task",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );
  markDashboardExecutionStarted(dashboard, {
    child: { identifier: "#130", title: "First task" },
    now: () => "2026-08-02T00:01:00.000Z",
  });

  markDashboardFatalError(dashboard, "Worker exploded", {
    now: () => "2026-08-02T00:02:00.000Z",
  });

  const rendered = renderCrosbyDashboard(dashboard).join("\n");
  assert.match(rendered, /❌ #130 First task/);
  assert.match(rendered, /Error: Worker exploded/);
});

test("Crosby dashboard records normalized one-line lifecycle events for started and finished outcomes", () => {
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#135",
          title: "Failure handling",
          state: { name: "Ready to Build", type: "unstarted" },
        },
        {
          identifier: "#136",
          title: "Review candidate",
          state: { name: "Ready to Build", type: "unstarted" },
        },
        {
          identifier: "#137",
          title: "Fatal candidate",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );

  markDashboardExecutionStarted(dashboard, {
    child: { identifier: "#135", title: "Failure handling" },
    now: () => "2026-08-02T00:00:01.000Z",
  });
  assert.equal(dashboard.lastEvent.message, "#135 started");

  markDashboardExecutionFinalized(dashboard, {
    child: { identifier: "#135", title: "Failure handling" },
    workerResult: { outcome: "done", summary: "Finished." },
    now: () => "2026-08-02T00:00:02.000Z",
  });
  assert.equal(dashboard.lastEvent.message, "#135 finished done");

  markDashboardExecutionFinalized(dashboard, {
    child: { identifier: "#136", title: "Review candidate" },
    workerResult: {
      outcome: "review",
      summary: "Needs human review.",
      requiredHumanAction: "Check the diff.",
      recoveryNotes: ["Inspect the branch."],
    },
    now: () => "2026-08-02T00:00:03.000Z",
  });
  assert.equal(dashboard.lastEvent.message, "#136 finished review");

  markDashboardExecutionFinalized(dashboard, {
    child: { identifier: "#137", title: "Fatal candidate" },
    workerResult: {
      outcome: "fatal",
      summary: "Worker crashed.",
      requiredHumanAction: "Restart worker.",
      recoveryNotes: ["Check logs."],
    },
    now: () => "2026-08-02T00:00:04.000Z",
  });
  assert.equal(dashboard.lastEvent.message, "#137 fatal");

  assert.deepEqual(
    dashboard.events.map((entry) => entry.message),
    [
      "#135 started",
      "#135 finished done",
      "#136 finished review",
      "#137 fatal",
    ],
  );

  const reviewTask = dashboard.tasks.find((task) => task.issueKey === "#136");
  assert.equal(reviewTask.requiredHumanAction, "Check the diff.");
  assert.deepEqual(reviewTask.recoveryNotes, ["Inspect the branch."]);

  const fatalTask = dashboard.tasks.find((task) => task.issueKey === "#137");
  assert.equal(fatalTask.requiredHumanAction, "Restart worker.");
  assert.deepEqual(fatalTask.recoveryNotes, ["Check logs."]);

  const rendered = renderCrosbyDashboard(dashboard).join("\n");
  assert.match(rendered, /Event log:/);
  assert.match(rendered, /- #135 started/);
  assert.match(rendered, /- #137 fatal/);
});

test("Crosby dashboard deduplicates a repeated finalized event for the same outcome", () => {
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#137",
          title: "Fatal candidate",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );

  const event = {
    child: { identifier: "#137", title: "Fatal candidate" },
    workerResult: { outcome: "fatal", summary: "Worker crashed." },
    now: () => "2026-08-02T00:00:01.000Z",
  };

  markDashboardExecutionFinalized(dashboard, event);
  markDashboardExecutionFinalized(dashboard, event);

  assert.equal(dashboard.events.length, 1);
  assert.equal(dashboard.events[0].message, "#137 fatal");
});

test("Crosby compact dashboard shows only parent state, last event, and dashboard pane", () => {
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#135",
          title: "Failure handling",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "test-run", now: () => "2026-08-02T00:00:00.000Z" },
  );

  const before = renderCrosbyCompactDashboard(dashboard);
  assert.deepEqual(before, [
    "Crosby #129: Parent feature",
    "Last: (no events yet)",
    "Dashboard: pane not open",
  ]);

  markDashboardExecutionStarted(dashboard, {
    child: { identifier: "#135", title: "Failure handling" },
    now: () => "2026-08-02T00:00:01.000Z",
  });
  markDashboardPaneOpened(dashboard, {
    paneId: "pane-42",
    now: () => "2026-08-02T00:00:02.000Z",
  });

  const after = renderCrosbyCompactDashboard(dashboard);
  assert.deepEqual(after, [
    "Crosby #129: Parent feature",
    "Last: #135 started",
    "Dashboard: pane pane-42",
  ]);
});

test("getDashboardEventsPath resolves the run-scoped events.jsonl path from runId", () => {
  const runsRoot = makeTempRunsRoot();
  const dashboard = createCrosbyDashboard(
    { parent: { identifier: "#129", title: "Parent" }, children: [] },
    { mode: "manual", runId: "run-abc", now: () => "2026-08-02T00:00:00.000Z" },
  );

  const eventsPath = getDashboardEventsPath(dashboard, { runsRoot });

  assert.equal(eventsPath, path.join(runsRoot, "run-abc", "events.jsonl"));
});

test("persistDashboardEvent appends the current dashboard state as one JSON line, creating parent dirs", () => {
  const runsRoot = makeTempRunsRoot();
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#130",
          title: "First task",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "run-persist", now: () => "2026-08-02T00:00:00.000Z" },
  );

  const eventsPath = persistDashboardEvent(dashboard, { runsRoot });

  assert.equal(eventsPath, path.join(runsRoot, "run-persist", "events.jsonl"));
  assert.ok(fs.existsSync(eventsPath));

  const lines = readEventLines(eventsPath);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].runId, "run-persist");
  assert.equal(lines[0].tasks[0].issueKey, "#130");
});

test("persistDashboardEvent is append-only across multiple mutations", () => {
  const runsRoot = makeTempRunsRoot();
  const dashboard = createCrosbyDashboard(
    {
      parent: { identifier: "#129", title: "Parent feature" },
      children: [
        {
          identifier: "#130",
          title: "First task",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    { mode: "manual", runId: "run-append", now: () => "2026-08-02T00:00:00.000Z" },
  );

  persistDashboardEvent(dashboard, { runsRoot });

  markDashboardExecutionStarted(dashboard, {
    child: { identifier: "#130", title: "First task" },
    now: () => "2026-08-02T00:00:01.000Z",
  });
  persistDashboardEvent(dashboard, { runsRoot });

  markDashboardHerdrWorkerStarted(dashboard, {
    issueKey: "#130",
    paneId: "pane-1",
    now: () => "2026-08-02T00:00:02.000Z",
  });
  persistDashboardEvent(dashboard, { runsRoot });

  markDashboardExecutionFinished(dashboard, {
    child: { identifier: "#130", title: "First task" },
    workerResult: { outcome: "done", summary: "ok" },
    now: () => "2026-08-02T00:00:03.000Z",
  });
  persistDashboardEvent(dashboard, { runsRoot });

  markDashboardExecutionFinalized(dashboard, {
    child: { identifier: "#130", title: "First task" },
    workerResult: { outcome: "done", summary: "ok" },
    now: () => "2026-08-02T00:00:04.000Z",
  });
  persistDashboardEvent(dashboard, { runsRoot });

  reconcileDashboardFromQueue(
    dashboard,
    { parent: { identifier: "#129", title: "Parent feature" }, children: [] },
    { now: () => "2026-08-02T00:00:05.000Z" },
  );
  persistDashboardEvent(dashboard, { runsRoot });

  markDashboardFatalError(dashboard, new Error("boom"), {
    now: () => "2026-08-02T00:00:06.000Z",
  });
  persistDashboardEvent(dashboard, { runsRoot });

  markDashboardPaneOpened(dashboard, {
    paneId: "pane-2",
    now: () => "2026-08-02T00:00:07.000Z",
  });
  const eventsPath = persistDashboardEvent(dashboard, { runsRoot });

  const lines = readEventLines(eventsPath);
  assert.equal(lines.length, 8);
  assert.equal(lines[0].updatedAt, "2026-08-02T00:00:00.000Z");
  assert.equal(lines[7].updatedAt, "2026-08-02T00:00:07.000Z");
  assert.equal(lines[7].dashboardPaneId, "pane-2");
});

test("persistDashboardEvent returns null when the dashboard has no runId", () => {
  const runsRoot = makeTempRunsRoot();
  const eventsPath = persistDashboardEvent({ tasks: [] }, { runsRoot });

  assert.equal(eventsPath, null);
});
