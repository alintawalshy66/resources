import test from "node:test";
import assert from "node:assert/strict";
import {
  createCrosbyDashboard,
  markDashboardExecutionFinalized,
  markDashboardExecutionStarted,
  markDashboardFatalError,
  markDashboardHerdrWorkerStarted,
  reconcileDashboardFromQueue,
  renderCrosbyDashboard,
} from "./dashboard.mjs";

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
