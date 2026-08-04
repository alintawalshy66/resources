import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createCrosbyDashboard, persistDashboardEvent } from "./dashboard.mjs";
import {
  parseDashboardRunnerArgs,
  readLatestDashboardState,
  renderDashboardFromEventsPath,
  resolveDashboardEventsPath,
  runDashboardRunner,
  watchDashboardEventsPath,
} from "./dashboard-runner.mjs";

const RUNNER_SCRIPT_PATH = fileURLToPath(
  new URL("./dashboard-runner.mjs", import.meta.url),
);

function makeTempRunsRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "crosby-runner-test-"));
}

function fabricateEventsLog(runsRoot, runId, states) {
  const eventsPath = path.join(runsRoot, runId, "events.jsonl");
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  for (const state of states) {
    fs.appendFileSync(eventsPath, `${JSON.stringify(state)}\n`);
  }
  return eventsPath;
}

test("parseDashboardRunnerArgs reads --run, --events-path, and --once", () => {
  assert.deepEqual(parseDashboardRunnerArgs(["--run", "run-1"]), {
    run: "run-1",
    eventsPath: null,
    once: false,
  });
  assert.deepEqual(parseDashboardRunnerArgs(["--events-path", "/tmp/events.jsonl"]), {
    run: null,
    eventsPath: "/tmp/events.jsonl",
    once: false,
  });
  assert.deepEqual(parseDashboardRunnerArgs(["--run", "run-1", "--once"]), {
    run: "run-1",
    eventsPath: null,
    once: true,
  });
});

test("resolveDashboardEventsPath prefers --events-path over --run", () => {
  const runsRoot = makeTempRunsRoot();
  const resolved = resolveDashboardEventsPath(
    { run: "run-1", eventsPath: "/explicit/events.jsonl", once: false },
    { runsRoot },
  );
  assert.equal(resolved, "/explicit/events.jsonl");
});

test("resolveDashboardEventsPath builds the path from --run under runsRoot", () => {
  const runsRoot = makeTempRunsRoot();
  const resolved = resolveDashboardEventsPath(
    { run: "run-1", eventsPath: null, once: false },
    { runsRoot },
  );
  assert.equal(resolved, path.join(runsRoot, "run-1", "events.jsonl"));
});

test("resolveDashboardEventsPath defaults to the most recently modified run directory", async () => {
  const runsRoot = makeTempRunsRoot();
  fs.mkdirSync(path.join(runsRoot, "run-old"), { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 15));
  fs.mkdirSync(path.join(runsRoot, "run-new"), { recursive: true });

  const resolved = resolveDashboardEventsPath({ run: null, eventsPath: null, once: false }, { runsRoot });

  assert.equal(resolved, path.join(runsRoot, "run-new", "events.jsonl"));
});

test("resolveDashboardEventsPath returns null when no run directories exist", () => {
  const runsRoot = makeTempRunsRoot();
  const resolved = resolveDashboardEventsPath({ run: null, eventsPath: null, once: false }, { runsRoot });
  assert.equal(resolved, null);
});

test("readLatestDashboardState replays a fabricated event log and returns the last state", () => {
  const runsRoot = makeTempRunsRoot();
  const first = { runId: "run-1", parentIssueKey: "#1", parentTitle: "P", tasks: [], events: [] };
  const second = { ...first, currentIssueKey: "#2" };
  const eventsPath = fabricateEventsLog(runsRoot, "run-1", [first, second]);

  const state = readLatestDashboardState(eventsPath);

  assert.deepEqual(state, second);
});

test("readLatestDashboardState returns null when the file does not exist", () => {
  const state = readLatestDashboardState("/nonexistent/events.jsonl");
  assert.equal(state, null);
});

test("renderDashboardFromEventsPath uses dashboard.mjs's renderCrosbyDashboard against a fabricated log", () => {
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
    { mode: "manual", runId: "run-render", now: () => "2026-08-02T00:00:00.000Z" },
  );
  const eventsPath = persistDashboardEvent(dashboard, { runsRoot });

  const lines = renderDashboardFromEventsPath(eventsPath);

  assert.match(lines.join("\n"), /Crosby #129: Parent feature/);
  assert.match(lines.join("\n"), /☐ #130 First task/);
});

test("renderDashboardFromEventsPath reports missing state without throwing", () => {
  const lines = renderDashboardFromEventsPath("/nonexistent/events.jsonl");
  assert.match(lines.join("\n"), /No dashboard state found/);
});

test("--once renders current state and exits without watching", async () => {
  const runsRoot = makeTempRunsRoot();
  const dashboard = createCrosbyDashboard(
    { parent: { identifier: "#129", title: "Parent" }, children: [] },
    { mode: "manual", runId: "run-once", now: () => "2026-08-02T00:00:00.000Z" },
  );
  persistDashboardEvent(dashboard, { runsRoot });

  const writes = [];
  const result = await runDashboardRunner(["--run", "run-once", "--once"], {
    runsRoot,
    write: (text) => writes.push(text),
  });

  assert.equal(result.stop, null);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /Crosby #129: Parent/);
});

test("watch mode reprints when the events file gains new appended lines", async () => {
  const runsRoot = makeTempRunsRoot();
  const dashboard = createCrosbyDashboard(
    { parent: { identifier: "#129", title: "Parent" }, children: [] },
    { mode: "manual", runId: "run-watch", now: () => "2026-08-02T00:00:00.000Z" },
  );
  const eventsPath = persistDashboardEvent(dashboard, { runsRoot });

  const writes = [];
  const stop = watchDashboardEventsPath(eventsPath, {
    intervalMs: 10,
    write: (text) => writes.push(text),
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(writes.length, 1);

  dashboard.currentIssueKey = "#130";
  dashboard.updatedAt = "2026-08-02T00:00:01.000Z";
  fs.appendFileSync(eventsPath, `${JSON.stringify(dashboard)}\n`);

  await new Promise((resolve) => setTimeout(resolve, 60));
  stop();

  assert.ok(writes.length >= 2, `expected at least 2 writes, got ${writes.length}`);
});

test("runDashboardRunner reports when no Crosby run exists", async () => {
  const runsRoot = makeTempRunsRoot();
  const writes = [];

  const result = await runDashboardRunner(["--once"], {
    runsRoot,
    write: (text) => writes.push(text),
  });

  assert.equal(result.eventsPath, null);
  assert.match(writes[0], /No Crosby run found/);
});

test("CLI watch mode stays alive and reprints on appended events instead of exiting after the first render", async () => {
  const runsRoot = makeTempRunsRoot();
  const dashboard = createCrosbyDashboard(
    { parent: { identifier: "#129", title: "Parent" }, children: [] },
    { mode: "manual", runId: "run-cli-watch", now: () => "2026-08-02T00:00:00.000Z" },
  );
  const eventsPath = persistDashboardEvent(dashboard, { runsRoot });

  const child = spawn(process.execPath, [
    RUNNER_SCRIPT_PATH,
    "--events-path",
    eventsPath,
  ]);

  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  // Give the CLI process time to render once, then confirm it has not
  // exited on its own (regression: an unref'd interval timer let the
  // process exit immediately after the first render, so the dashboard
  // pane never reflected later run updates).
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(child.exitCode, null, "CLI watch process should still be running");

  dashboard.currentIssueKey = "#130";
  dashboard.updatedAt = "2026-08-02T00:00:01.000Z";
  fs.appendFileSync(eventsPath, `${JSON.stringify(dashboard)}\n`);

  await new Promise((resolve) => setTimeout(resolve, 300));
  child.kill();

  const renders = stdout.split("Crosby #129").filter((chunk) => chunk.trim().length > 0);
  assert.ok(
    renders.length >= 2,
    `expected the CLI to reprint after the appended event, got ${renders.length} render(s): ${stdout}`,
  );
});
