import test from "node:test";
import assert from "node:assert/strict";
import { parseCrosbyCommandArgs, publishParentPullRequest, reviewParentPullRequest, runWatchCycle, runWatchMode } from "./lib-v2.mjs";

test("runWatchCycle keeps fatal worker issues in Build and does not move them to review", async () => {
  const moved = [];
  const result = await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "COA-129",
          title: "Symphony",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "COA-135",
            title: "Failure handling and daemon resilience",
            state: { name: "Ready to Build", type: "unstarted" },
          },
        ],
      },
    ],
    moveIssue: async (issueKey, state) => moved.push([issueKey, state]),
    runWorker: async () => ({
      stdout: JSON.stringify({
        issueKey: "COA-135",
        issueTitle: "Failure handling and daemon resilience",
        outcome: "fatal",
        summary: "Worker failed safely.",
        changes: ["Logged the failure"],
        tests: ["Simulated worker failure"],
        requiredHumanAction: "Inspect the worker failure.",
        recoveryNotes: ["Fix the worker, then rerun watch mode."],
      }),
    }),
  });

  assert.equal(result.status, "fatal");
  assert.deepEqual(moved, [["COA-135", "Building"]]);
  assert.equal(result.workerResult.outcome, "fatal");
});

test("runWatchMode continues polling after a fatal worker result", async () => {
  const moved = [];
  let cycleCount = 0;

  const result = await runWatchMode(
    {
      fetchExecuteParentQueues: async () => {
        cycleCount += 1;
        return cycleCount === 1
          ? [
              {
                parent: { identifier: "COA-129", title: "Symphony", state: { name: "Execute", type: "started" } },
                children: [
                  {
                    identifier: "COA-135",
                    title: "Failure handling and daemon resilience",
                    state: { name: "Ready to Build", type: "unstarted" },
                  },
                ],
              },
            ]
          : [
              {
                parent: { identifier: "COA-129", title: "Symphony", state: { name: "Execute", type: "started" } },
                children: [
                  {
                    identifier: "COA-136",
                    title: "Next issue",
                    state: { name: "Ready to Build", type: "unstarted" },
                  },
                ],
              },
            ];
      },
      moveIssue: async (issueKey, state) => moved.push([issueKey, state]),
      runWorker: async ({ childIssueKey }) => ({
        stdout: JSON.stringify(
          childIssueKey === "COA-135"
            ? {
                issueKey: "COA-135",
                issueTitle: "Failure handling and daemon resilience",
                outcome: "fatal",
                summary: "Worker failed safely.",
                changes: ["Logged the failure"],
                tests: ["Simulated worker failure"],
                requiredHumanAction: "Inspect the worker failure.",
                recoveryNotes: ["Fix the worker, then rerun watch mode."],
              }
            : {
                issueKey: "COA-136",
                issueTitle: "Next issue",
                outcome: "done",
                summary: "Worker succeeded.",
                changes: ["Completed the issue"],
                tests: ["Simulated worker success"],
              },
        ),
      }),
      addComment: async () => {},
      refreshQueue: async () => ({
        parent: { identifier: "COA-129", title: "Symphony", state: { name: "Building", type: "started" } },
        children: [{ identifier: "COA-136", title: "Next issue", state: { name: "Done", type: "completed" } }],
      }),
      sleep: async () => {},
    },
    {
      maxCycles: 2,
      pollIntervalMs: 0,
      getNow: (() => {
        const timestamps = [new Date("2026-05-04T00:02:00Z"), new Date("2026-05-04T08:00:00Z")];
        let index = 0;
        return () => timestamps[index++] ?? timestamps[timestamps.length - 1];
      })(),
    },
  );

  assert.equal(result.cycles.length, 2);
  assert.equal(result.cycles[0].status, "fatal");
  assert.equal(result.cycles[1].status, "processed");
  assert.deepEqual(moved, [
    ["COA-135", "Building"],
    ["COA-136", "Building"],
    ["COA-136", "Done"],
    ["COA-129", "Review"],
  ]);
});

test("parseCrosbyCommandArgs supports push and review commands", async () => {
  assert.deepEqual(parseCrosbyCommandArgs("COA-13"), { mode: "parent", issueKey: "COA-13" });
  assert.deepEqual(parseCrosbyCommandArgs("--watch"), { mode: "watch" });
  assert.deepEqual(parseCrosbyCommandArgs("push COA-13"), { mode: "push", issueKey: "COA-13" });
  assert.deepEqual(parseCrosbyCommandArgs("review COA-13"), { mode: "review", issueKey: "COA-13" });
});

test("publishParentPullRequest pushes branch and creates PR when missing", async () => {
  const calls = [];
  const pullRequest = await publishParentPullRequest(
    {
      parent: {
        identifier: "COA-129",
        title: "Symphony",
        branchName: "test-branch",
        labels: { nodes: [{ name: "tools" }] },
      },
      children: [{ identifier: "COA-135", title: "Failure handling and daemon resilience", state: { name: "Done" } }],
    },
    [],
    {
      routing: { documentsRoot: "C:/Users/camer/Documents", projectsRoot: "C:/Users/camer/Documents/projects", folderExists: (p) => /tools$/i.test(p) },
      ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
      assertCleanWorkingTree: async () => calls.push(["assertCleanWorkingTree"]),
      readImplementationSummary: async () => "Summary details",
      pushBranch: async ({ branchName }) => calls.push(["pushBranch", branchName]),
      getPullRequest: async () => null,
      createPullRequest: async ({ title, body, branchName }) => {
        calls.push(["createPullRequest", title, branchName, body]);
        return { number: 42, url: "https://example.com/pr/42", body, headRefName: branchName };
      },
      updatePullRequest: async () => calls.push(["updatePullRequest"]),
      addParentComment: async (issueKey, body) => calls.push(["addParentComment", issueKey, body]),
    },
  );

  assert.equal(pullRequest.url, "https://example.com/pr/42");
  assert.deepEqual(calls.slice(0, 3), [["ensureParentBranch"], ["assertCleanWorkingTree"], ["pushBranch", "test-branch"]]);
  assert.equal(calls.some(([type]) => type === "updatePullRequest"), false);
  assert.match(calls.find(([type]) => type === "addParentComment")[2], /https:\/\/example.com\/pr\/42/);
});

test("reviewParentPullRequest comments when Claude review fails", async () => {
  const calls = [];
  const result = await reviewParentPullRequest(
    {
      parent: {
        identifier: "COA-129",
        title: "Symphony",
        branchName: "test-branch",
        labels: { nodes: [{ name: "tools" }] },
      },
      children: [
        { identifier: "COA-135", title: "Failure handling and daemon resilience", state: { name: "Done" } },
      ],
    },
    [
      {
        child: { identifier: "COA-135", title: "Failure handling and daemon resilience" },
        workerResult: {
          outcome: "done",
          summary: "Completed.",
          changes: ["Added resilience handling"],
          tests: ["node --test lib-v2.test.mjs"],
          recoveryNotes: [],
        },
      },
    ],
    {
      routing: { documentsRoot: "C:/Users/camer/Documents", projectsRoot: "C:/Users/camer/Documents/projects", folderExists: (p) => /tools$/i.test(p) },
      ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
      assertCleanWorkingTree: async () => calls.push(["assertCleanWorkingTree"]),
      getPullRequest: async () => ({ number: 42, url: "https://example.com/pr/42", body: "Existing body", headRefName: "test-branch" }),
      readImplementationSummary: async () => "Summary details",
      updatePullRequest: async (payload) => calls.push(["updatePullRequest", payload.body]),
      runClaudeReview: async () => {
        throw new Error("Claude crashed");
      },
      addPullRequestComment: async (payload) => calls.push(["addPullRequestComment", payload.body]),
      addParentComment: async (issueKey, body) => calls.push(["addParentComment", issueKey, body]),
    },
  );

  assert.equal(result.pullRequest.url, "https://example.com/pr/42");
  assert.match(calls.find(([type]) => type === "addPullRequestComment")[1], /Review failed/);
  assert.match(calls.find(([type]) => type === "addPullRequestComment")[1], /Claude crashed/);
});


test("reviewParentPullRequest requires push before PR review", async () => {
  await assert.rejects(
    () =>
      reviewParentPullRequest(
        {
          parent: {
            identifier: "COA-129",
            title: "Symphony",
            branchName: "test-branch",
            labels: { nodes: [{ name: "tools" }] },
          },
          children: [{ identifier: "COA-135", title: "Failure handling and daemon resilience", state: { name: "Done" } }],
        },
        [],
        {
          routing: { documentsRoot: "C:/Users/camer/Documents", projectsRoot: "C:/Users/camer/Documents/projects", folderExists: (p) => /tools$/i.test(p) },
          ensureParentBranch: async () => {},
          assertCleanWorkingTree: async () => {},
          getPullRequest: async () => null,
        },
      ),
    /run \/crosby push COA-129 first/i,
  );
});

test("runWatchMode stays idle across later cycles when no execute parents exist", async () => {
  const cycles = [];
  const result = await runWatchMode(
    {
      fetchExecuteParentQueues: async () => [],
      sleep: async () => {},
    },
    {
      maxCycles: 2,
      pollIntervalMs: 0,
      getNow: (() => {
        const timestamps = [new Date("2026-05-04T00:02:00Z"), new Date("2026-05-04T12:45:00Z")];
        let index = 0;
        return () => timestamps[index++] ?? timestamps[timestamps.length - 1];
      })(),
      onCycle: async (cycle) => cycles.push(cycle),
    },
  );

  assert.equal(result.cycles.length, 2);
  assert.equal(cycles[0].status, "idle");
  assert.equal(cycles[1].status, "idle");
});
