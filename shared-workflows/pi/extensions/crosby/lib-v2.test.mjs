import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinalParentSummary,
  buildFinalTriggerTestingSummary,
  buildParentProgressComment,
  buildPiWorkerExtraArgs,
  buildPiWorkerSessionName,
  buildRalphLoopPrompt,
  classifyLocalBranches,
  detectIssueTracker,
  extractEffortOverride,
  extractLabelValue,
  extractModelOverride,
  findExistingCrosbyDashboardPane,
  findExistingCrosbyWorkerAgent,
  formatLifecycleFinishedEvent,
  formatLifecycleStartedEvent,
  mergeChecklistAndNativeIssueChildren,
  parseCrosbyCommandArgs,
  renderBranchCleanupAdvisory,
  assertNoLocalBranchCleanupRequired,
  parseIssueTestCommand,
  selectCrosbyTrackerAdapter,
  normalizeTrackerIssueReference,
  publishParentPullRequest,
  reviewParentPullRequest,
  runQueueExecution,
  runWatchCycle,
  runWatchMode,
} from "./lib-v2.mjs";

test("classifyLocalBranches excludes main and assigns cleanup recommendations without mutating branch facts", () => {
  const branchFacts = [
    {
      name: "main",
      merged: false,
      upstream: "origin/main",
      lastCommitDate: "2024-01-01T00:00:00.000Z",
    },
    {
      name: "merged-feature",
      merged: true,
      upstream: "origin/merged-feature",
      lastCommitDate: "2024-12-20T00:00:00.000Z",
    },
    {
      name: "missing-upstream",
      merged: false,
      upstream: null,
      lastCommitDate: "2024-12-28T00:00:00.000Z",
    },
    {
      name: "stale-feature",
      merged: false,
      upstream: "origin/stale-feature",
      lastCommitDate: "2024-11-17T00:00:00.000Z",
    },
    {
      name: "very-stale-feature",
      merged: false,
      upstream: "origin/very-stale-feature",
      lastCommitDate: "2024-09-23T00:00:00.000Z",
    },
    {
      name: "active-feature",
      merged: false,
      upstream: "origin/active-feature",
      lastCommitDate: "2024-12-27T00:00:00.000Z",
    },
    {
      name: "missing-upstream-beats-age",
      merged: false,
      upstream: "",
      lastCommitDate: "2024-08-24T00:00:00.000Z",
    },
  ];
  const originalFacts = structuredClone(branchFacts);

  const classified = classifyLocalBranches(branchFacts, {
    now: new Date("2025-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(branchFacts, originalFacts);
  assert.deepEqual(
    classified.map((branch) => [branch.name, branch.recommendation]),
    [
      ["merged-feature", "Delete local copy"],
      ["missing-upstream", "Needs attention"],
      ["stale-feature", "Stale review"],
      ["very-stale-feature", "Very stale review"],
      ["active-feature", "Keep"],
      ["missing-upstream-beats-age", "Needs attention"],
    ],
  );
});

test("renderBranchCleanupAdvisory formats a sorted non-destructive blocking cleanup table", () => {
  const output = renderBranchCleanupAdvisory(
    [
      {
        name: "keep/recent",
        merged: false,
        upstream: "origin/keep/recent",
        lastCommitDate: "2024-12-25T00:00:00.000Z",
      },
      {
        name: "merged/done",
        merged: true,
        upstream: "origin/merged/done",
        lastCommitDate: "2024-11-20T00:00:00.000Z",
      },
      {
        name: "spike/stale",
        merged: false,
        upstream: "origin/spike/stale",
        lastCommitDate: "2024-10-19T00:00:00.000Z",
      },
      {
        name: "feature/current",
        current: true,
        merged: false,
        upstream: "origin/feature/current",
        ahead: 3,
        lastCommitDate: "2024-12-29T00:00:00.000Z",
      },
      {
        name: "old/missing-upstream-newer",
        merged: false,
        upstream: "",
        lastCommitDate: "2024-09-28T00:00:00.000Z",
      },
      {
        name: "old/missing-upstream-older",
        merged: false,
        upstream: null,
        lastCommitDate: "2024-09-03T00:00:00.000Z",
      },
      {
        name: "spike/very-stale",
        merged: false,
        upstream: "origin/spike/very-stale",
        lastCommitDate: "2024-09-13T00:00:00.000Z",
      },
    ],
    { now: new Date("2025-01-01T00:00:00.000Z"), baseBranch: "main" },
  );

  assert.match(output, /Blocked: branch cleanup required before starting Crosby\./);
  assert.match(output, /Base branch: main/);
  assert.match(output, /No branches were changed\./);
  assert.match(output, /Recommendation\s+Branch\s+Age\s+Reason\s+Suggested action/);
  assert.doesNotMatch(output, /git branch -[dD]\b/);

  const currentIndex = output.indexOf("* feature/current");
  const needsOlderIndex = output.indexOf("old/missing-upstream-older");
  const needsNewerIndex = output.indexOf("old/missing-upstream-newer");
  const veryStaleIndex = output.indexOf("spike/very-stale");
  const staleIndex = output.indexOf("spike/stale");
  const deleteIndex = output.indexOf("merged/done");
  const keepIndex = output.indexOf("keep/recent");

  assert.ok(currentIndex > -1);
  assert.ok(currentIndex < needsOlderIndex);
  assert.ok(needsOlderIndex < needsNewerIndex);
  assert.ok(needsNewerIndex < veryStaleIndex);
  assert.ok(veryStaleIndex < staleIndex);
  assert.ok(staleIndex < deleteIndex);
  assert.ok(deleteIndex < keepIndex);
  assert.match(output, /current branch; 3 ahead main/);
  assert.match(output, /unmerged into main; upstream missing/);
  assert.match(output, /Review, then remove local copy/);
});

test("assertNoLocalBranchCleanupRequired blocks with the cleanup advisory for non-main local branches", () => {
  assert.throws(
    () =>
      assertNoLocalBranchCleanupRequired(
        [
          {
            name: "main",
            current: false,
            merged: false,
            upstream: "origin/main",
            lastCommitDate: "2024-12-30T00:00:00.000Z",
          },
          {
            name: "current-work",
            current: true,
            merged: false,
            upstream: "origin/current-work",
            ahead: 2,
            lastCommitDate: "2024-12-31T00:00:00.000Z",
          },
        ],
        { now: new Date("2025-01-01T00:00:00.000Z"), baseBranch: "main" },
      ),
    (error) => {
      assert.match(error.message, /Blocked: branch cleanup required before starting Crosby\./);
      assert.match(error.message, /\* current-work/);
      assert.doesNotMatch(error.message, /\bmain\b.*origin\/main/);
      return true;
    },
  );
});

test("assertNoLocalBranchCleanupRequired passes when only local main is present", () => {
  assert.doesNotThrow(() =>
    assertNoLocalBranchCleanupRequired([
      {
        name: "main",
        current: true,
        merged: false,
        upstream: "origin/main",
        lastCommitDate: "2024-12-30T00:00:00.000Z",
      },
    ]),
  );
});

test("formatLifecycleStartedEvent and formatLifecycleFinishedEvent normalize worker lifecycle updates into short events", () => {
  assert.equal(formatLifecycleStartedEvent("#135"), "#135 started");
  assert.equal(
    formatLifecycleStartedEvent({ identifier: "#135" }),
    "#135 started",
  );
  assert.equal(formatLifecycleFinishedEvent("#135", "done"), "#135 finished done");
  assert.equal(formatLifecycleFinishedEvent("#136", "review"), "#136 finished review");
  assert.equal(formatLifecycleFinishedEvent("#137", "fatal"), "#137 fatal");
});

test("buildPiWorkerSessionName names Pi sessions from GitHub issue numbers", () => {
  assert.equal(buildPiWorkerSessionName("#123"), "gh-123");
  assert.equal(buildPiWorkerSessionName(456), "gh-456");
  assert.equal(
    buildPiWorkerSessionName("https://github.com/example/repo/issues/789"),
    "gh-789",
  );
  assert.equal(buildPiWorkerSessionName("manual worker"), "crosby-manual-worker");
  assert.equal(buildPiWorkerSessionName(null), "crosby-worker");
});

test("findExistingCrosbyDashboardPane finds a dashboard pane in the current tab", () => {
  const panes = [
    {
      pane_id: "other-dashboard",
      label: "Crosby dashboard",
      tab_id: "tab-2",
      workspace_id: "workspace-1",
      revision: 10,
    },
    {
      pane_id: "current-dashboard",
      label: "Crosby dashboard",
      tab_id: "tab-1",
      workspace_id: "workspace-1",
      revision: 1,
    },
  ];

  assert.equal(
    findExistingCrosbyDashboardPane(panes, {
      tabId: "tab-1",
      workspaceId: "workspace-1",
    })?.pane_id,
    "current-dashboard",
  );
});

test("findExistingCrosbyDashboardPane falls back to workspace when tab is unknown", () => {
  const panes = [
    {
      pane_id: "old-dashboard",
      label: "Crosby dashboard",
      workspace_id: "workspace-1",
      revision: 1,
    },
    {
      pane_id: "new-dashboard",
      label: "Crosby dashboard",
      workspace_id: "workspace-1",
      revision: 2,
    },
  ];

  assert.equal(
    findExistingCrosbyDashboardPane(panes, { workspaceId: "workspace-1" })
      ?.pane_id,
    "new-dashboard",
  );
});

test("findExistingCrosbyWorkerAgent finds an existing issue worker in the same cwd", () => {
  const agents = [
    {
      agent: "pi",
      name: "crosby-194-old",
      agent_status: "idle",
      cwd: "/home/walsc0/projects/other",
      terminal_title_stripped: "π - gh-194 - other",
      state_change_seq: 10,
    },
    {
      agent: "pi",
      name: "crosby-194-new",
      agent_status: "idle",
      cwd: "/home/walsc0/projects/dlhub",
      pane_id: "pane-194",
      terminal_title_stripped: "π - gh-194 - dlhub",
      state_change_seq: 11,
    },
  ];

  assert.equal(
    findExistingCrosbyWorkerAgent(agents, "#194", "/home/walsc0/projects/dlhub")?.pane_id,
    "pane-194",
  );
});

test("findExistingCrosbyWorkerAgent prefers ready workers over working matches", () => {
  const agents = [
    {
      agent: "pi",
      name: "crosby-194-working",
      agent_status: "working",
      cwd: "/home/walsc0/projects/dlhub",
      pane_id: "working-pane",
      state_change_seq: 99,
    },
    {
      agent: "pi",
      name: "crosby-194-idle",
      agent_status: "idle",
      cwd: "/home/walsc0/projects/dlhub",
      pane_id: "idle-pane",
      state_change_seq: 1,
    },
  ];

  assert.equal(
    findExistingCrosbyWorkerAgent(agents, "#194", "/home/walsc0/projects/dlhub")?.pane_id,
    "idle-pane",
  );
});

test("buildRalphLoopPrompt requires commit postconditions before done results", () => {
  const prompt = buildRalphLoopPrompt({
    identifier: "#24",
    title: "Require commit postconditions in Crosby worker prompt",
    body: "## Acceptance Criteria",
  });

  assert.match(prompt, /git add/i);
  assert.match(prompt, /git commit/i);
  assert.match(prompt, /commit message must reference #24/i);
  assert.match(prompt, /git status --porcelain/i);
  assert.match(prompt, /empty before returning outcome done/i);
  assert.match(prompt, /commit hash/i);
  assert.match(prompt, /changes\[\]/i);
  assert.match(prompt, /return outcome review/i);
  assert.match(prompt, /requiredHumanAction/i);
  assert.match(prompt, /humanTestingRequired/i);
  assert.match(prompt, /humanTestingInstructions/i);
});

test("buildParentProgressComment includes human testing handoff", () => {
  const comment = buildParentProgressComment({
    child: { identifier: "#135", title: "Add hover tooltip" },
    workerResult: {
      outcome: "done",
      summary: "Added the tooltip.",
      changes: ["Rendered the info icon tooltip."],
      tests: ["npm test -- tooltip"],
      recoveryNotes: [],
      humanTestingRequired: true,
      humanTestingInstructions: [
        "Open the portfolio page and hover the info icon.",
        "Confirm the tooltip explains the metric.",
      ],
    },
  });

  assert.match(comment, /Human testing required: Yes/);
  assert.match(comment, /Open the portfolio page and hover the info icon/);
});

test("buildFinalParentSummary rolls up human QA guidance", () => {
  const summary = buildFinalParentSummary(
    {
      parent: { identifier: "#129", title: "Hover information", comments: { nodes: [] } },
      children: [
        {
          identifier: "#135",
          title: "Add hover tooltip",
          state: { name: "Done" },
        },
      ],
    },
    [
      {
        child: { identifier: "#135", title: "Add hover tooltip" },
        workerResult: {
          outcome: "done",
          summary: "Added the tooltip.",
          changes: ["Rendered the info icon tooltip."],
          tests: ["npm test -- tooltip"],
          recoveryNotes: [],
          humanTestingRequired: true,
          humanTestingInstructions: ["Hover the info icon and confirm tooltip copy."],
        },
      },
    ],
  );

  assert.match(summary, /Human QA summary:/);
  assert.match(summary, /What was built:/);
  assert.match(summary, /Automated verification completed:/);
  assert.match(summary, /Human testing needed:/);
  assert.match(summary, /Hover the info icon and confirm tooltip copy/);
});

test("buildFinalTriggerTestingSummary lists how to test each completed task", () => {
  const summary = buildFinalTriggerTestingSummary(
    {
      parent: {
        identifier: "#129",
        title: "Hover information",
        branchName: "issue-129-hover-information",
        comments: { nodes: [] },
      },
      children: [
        {
          identifier: "#135",
          title: "Add hover tooltip",
          state: { name: "Done" },
        },
      ],
    },
    [
      {
        child: { identifier: "#135", title: "Add hover tooltip" },
        workerResult: {
          outcome: "done",
          summary: "Added tooltip.",
          changes: ["Rendered the hover tooltip."],
          tests: ["npm test -- tooltip"],
          recoveryNotes: [],
          humanTestingRequired: true,
          humanTestingInstructions: [
            "Open the portfolio page.",
            "Hover the info icon and confirm tooltip copy.",
          ],
        },
      },
    ],
  );

  assert.match(summary, /Crosby completed #129/);
  assert.match(summary, /Parent branch: issue-129-hover-information/);
  assert.match(summary, /## #135 Add hover tooltip/);
  assert.match(summary, /Rendered the hover tooltip/);
  assert.match(summary, /npm test -- tooltip/);
  assert.match(summary, /1\. Open the portfolio page/);
  assert.match(summary, /2\. Hover the info icon/);
});

test("parseIssueTestCommand reads fenced and plain Test Command sections", () => {
  assert.equal(
    parseIssueTestCommand({
      body: "## Test Command\n\n```bash\nnpm test -- tooltip\n```\n\n## Acceptance Criteria\n- [ ] Done",
    }),
    "npm test -- tooltip",
  );
  assert.equal(
    parseIssueTestCommand({ body: "## Test Command\npytest tests/test_api.py" }),
    "pytest tests/test_api.py",
  );
  assert.equal(parseIssueTestCommand({ body: "## Scope\nNone" }), null);
});

test("buildPiWorkerExtraArgs passes effort labels to pi as --thinking, not --effort", () => {
  // Regression: pi's CLI has no --effort flag (it errors with
  // "Unknown option: --effort"); the real flag is --thinking <level>.
  assert.deepEqual(
    buildPiWorkerExtraArgs({ model: "claude-opus-4.7", effort: "low" }),
    ["--model", "claude-opus-4.7", "--thinking", "low"],
  );
  assert.deepEqual(
    buildPiWorkerExtraArgs({ effort: "medium" }),
    ["--thinking", "medium"],
  );
  assert.deepEqual(buildPiWorkerExtraArgs({ model: "gpt-5.5" }), ["--model", "gpt-5.5"]);
  assert.deepEqual(buildPiWorkerExtraArgs({}), []);
  assert.deepEqual(buildPiWorkerExtraArgs(), []);
});

test("mergeChecklistAndNativeIssueChildren keeps native sub-issues when the parent body has no child checklist", () => {
  const children = mergeChecklistAndNativeIssueChildren(
    [],
    [
      {
        identifier: "#194",
        number: 194,
        title: "Native sub-issue",
        state: { name: "Ready to Build" },
      },
    ],
    190,
  );

  assert.deepEqual(
    children.map((child) => child.identifier),
    ["#194"],
  );
});

test("mergeChecklistAndNativeIssueChildren preserves checklist order and deduplicates native sub-issues", () => {
  const children = mergeChecklistAndNativeIssueChildren(
    [{ identifier: "#194", number: 194, title: "Checklist child" }],
    [
      { identifier: "#194", number: 194, title: "Duplicate native child" },
      { identifier: "#190", number: 190, title: "Parent self reference" },
      { identifier: "#202", number: 202, title: "Native-only child" },
    ],
    190,
  );

  assert.deepEqual(
    children.map((child) => child.identifier),
    ["#194", "#202"],
  );
});

test("runWatchCycle keeps fatal worker issues in Build and does not move them to review", async () => {
  const moved = [];
  const result = await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Failure handling and daemon resilience",
            state: { name: "Ready to Build", type: "unstarted" },
          },
        ],
      },
    ],
    moveIssue: async (issueKey, state) => moved.push([issueKey, state]),
    runWorker: async () => ({
      stdout: JSON.stringify({
        issueKey: "#135",
        issueTitle: "Failure handling and daemon resilience",
        outcome: "fatal",
        summary: "Worker failed safely.",
        changes: ["Logged the failure"],
        tests: ["Simulated worker failure"],
        humanTestingRequired: false,
        humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
        requiredHumanAction: "Inspect the worker failure.",
        recoveryNotes: ["Fix the worker, then rerun watch mode."],
      }),
    }),
  });

  assert.equal(result.status, "fatal");
  assert.deepEqual(moved, [["#135", "Building"]]);
  assert.equal(result.workerResult.outcome, "fatal");
});

test("runWatchCycle reports selected queue only when a runnable child will execute", async () => {
  const selectedQueues = [];
  const result = await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Runnable child",
            state: { name: "Ready to Build", type: "unstarted" },
          },
        ],
      },
    ],
    onQueueSelected: async (queue) => selectedQueues.push(queue),
    moveIssue: async () => {},
    runWorker: async () => ({
      stdout: JSON.stringify({
        issueKey: "#135",
        issueTitle: "Runnable child",
        outcome: "fatal",
        summary: "Stopped after selection.",
        changes: [],
        tests: [],
        humanTestingRequired: false,
        humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
        requiredHumanAction: "Inspect.",
        recoveryNotes: ["Retry."],
      }),
    }),
  });

  assert.equal(result.status, "fatal");
  assert.equal(selectedQueues.length, 1);
  assert.equal(selectedQueues[0].parent.identifier, "#129");
});

test("runWatchCycle does not report selected queue when children are not runnable", async () => {
  const selectedQueues = [];
  const result = await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Review child",
            state: { name: "Review", type: "review" },
          },
        ],
      },
    ],
    onQueueSelected: async (queue) => selectedQueues.push(queue),
  });

  assert.equal(result.status, "idle");
  assert.equal(selectedQueues.length, 0);
});

test("runWatchCycle reports refreshed queues before skipping non-runnable children", async () => {
  const loadedQueues = [];
  const result = await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Manually completed child",
            state: { name: "Done", type: "completed" },
          },
          {
            identifier: "#136",
            title: "Manual review child",
            state: { name: "Review", type: "review" },
          },
          {
            identifier: "#137",
            title: "Manual building child",
            state: { name: "Building", type: "started" },
          },
        ],
      },
    ],
    onQueueLoaded: async (queue) => loadedQueues.push(queue),
  });

  assert.equal(result.status, "idle");
  assert.equal(loadedQueues.length, 1);
  assert.deepEqual(
    loadedQueues[0].children.map((child) => [child.identifier, child.state.name]),
    [
      ["#135", "Done"],
      ["#136", "Review"],
      ["#137", "Building"],
    ],
  );
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
                parent: {
                  identifier: "#129",
                  title: "Symphony",
                  state: { name: "Execute", type: "started" },
                },
                children: [
                  {
                    identifier: "#135",
                    title: "Failure handling and daemon resilience",
                    state: { name: "Ready to Build", type: "unstarted" },
                  },
                ],
              },
            ]
          : [
              {
                parent: {
                  identifier: "#129",
                  title: "Symphony",
                  state: { name: "Execute", type: "started" },
                },
                children: [
                  {
                    identifier: "#136",
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
          childIssueKey === "#135"
            ? {
                issueKey: "#135",
                issueTitle: "Failure handling and daemon resilience",
                outcome: "fatal",
                summary: "Worker failed safely.",
                changes: ["Logged the failure"],
                tests: ["Simulated worker failure"],
                humanTestingRequired: false,
                humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
                requiredHumanAction: "Inspect the worker failure.",
                recoveryNotes: ["Fix the worker, then rerun watch mode."],
              }
            : {
                issueKey: "#136",
                issueTitle: "Next issue",
                outcome: "done",
                summary: "Worker succeeded.",
                changes: ["Completed the issue"],
                tests: ["Simulated worker success"],
                humanTestingRequired: false,
                humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
              },
        ),
      }),
      addComment: async () => {},
      refreshQueue: async () => ({
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Building", type: "started" },
        },
        children: [
          {
            identifier: "#136",
            title: "Next issue",
            state: { name: "Done", type: "completed" },
          },
        ],
      }),
      sleep: async () => {},
    },
    {
      maxCycles: 2,
      pollIntervalMs: 0,
      getNow: (() => {
        const timestamps = [
          new Date("2026-05-04T00:02:00Z"),
          new Date("2026-05-04T08:00:00Z"),
        ];
        let index = 0;
        return () => timestamps[index++] ?? timestamps[timestamps.length - 1];
      })(),
    },
  );

  assert.equal(result.cycles.length, 2);
  assert.equal(result.cycles[0].status, "fatal");
  assert.equal(result.cycles[1].status, "processed");
  assert.deepEqual(moved, [
    ["#135", "Building"],
    ["#136", "Building"],
    ["#136", "Done"],
    ["#129", "Review"],
  ]);
});

test("runQueueExecution downgrades done worker results to review when no new commit is found", async () => {
  const calls = [];
  const events = [];

  const result = await runQueueExecution(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        branchName: "issue-129-symphony",
        state: { name: "Execute", type: "started" },
      },
      children: [
        {
          identifier: "#135",
          title: "Implement dashboard",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    {
      moveIssue: async (issueKey, state) => calls.push(["moveIssue", issueKey, state]),
      addComment: async (issueKey, body) => calls.push(["addComment", issueKey, body]),
      snapshotGitState: async () => {
        events.push("snapshot");
        return { branch: "issue-129-symphony", head: "abc123" };
      },
      hasCommittedWorkSince: async () => {
        events.push("verify");
        return {
          hasCommittedWork: false,
          diagnostic:
            "No new commit found on issue-129-symphony; HEAD remained abc123.",
        };
      },
      runWorker: async () => {
        events.push("worker");
        return {
          stdout: JSON.stringify({
            issueKey: "#135",
            issueTitle: "Implement dashboard",
            outcome: "done",
            summary: "Completed.",
            changes: ["Updated dashboard implementation"],
            tests: ["node --test"],
            humanTestingRequired: false,
            humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
          }),
        };
      },
      refreshQueue: async () => ({
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Building", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Implement dashboard",
            state: { name: "Review", type: "review" },
          },
        ],
      }),
    },
  );

  assert.deepEqual(events, ["snapshot", "worker", "verify"]);
  assert.equal(result.completedChildren[0].workerResult.outcome, "review");
  assert.deepEqual(calls.slice(0, 2), [
    ["moveIssue", "#135", "Building"],
    ["moveIssue", "#135", "Review"],
  ]);
  assert.equal(
    calls.some((call) => call[0] === "moveIssue" && call[2] === "Done"),
    false,
  );
  const progressComment = calls.find(([type]) => type === "addComment")[2];
  assert.match(progressComment, /Status: Review/);
  assert.match(progressComment, /No new commit found on issue-129-symphony/);
  assert.match(progressComment, /commit the completed work/i);
});

test("runQueueExecution runs branch cleanup preflight before mutating git state", async () => {
  const calls = [];

  await assert.rejects(
    () =>
      runQueueExecution(
        {
          parent: {
            identifier: "#129",
            title: "Symphony",
            branchName: "issue-129-symphony",
            state: { name: "Execute", type: "started" },
            labels: { nodes: [{ name: "resources" }] },
          },
          children: [
            {
              identifier: "#135",
              title: "Implement dashboard",
              state: { name: "Ready to Build", type: "unstarted" },
            },
          ],
        },
        {
          routing: {
            documentsRoot: "/home/walsc0",
            projectsRoot: "/home/walsc0/projects",
            folderExists: (p) => /projects\/resources$/i.test(p),
          },
          assertBranchCleanupPreflight: async ({ cwd }) => {
            calls.push(["branchCleanupPreflight", cwd]);
            throw new Error("Blocked: branch cleanup required before starting Crosby.");
          },
          ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
          prepareChildBranch: async () => calls.push(["prepareChildBranch"]),
          moveIssue: async () => calls.push(["moveIssue"]),
          runWorker: async () => calls.push(["runWorker"]),
        },
      ),
    /branch cleanup required/i,
  );

  assert.deepEqual(calls, [["branchCleanupPreflight", "/home/walsc0/projects/resources"]]);
});

test("runQueueExecution preserves existing branch preparation blocking after branch preflight passes", async () => {
  const calls = [];

  await assert.rejects(
    () =>
      runQueueExecution(
        {
          parent: {
            identifier: "#129",
            title: "Symphony",
            branchName: "issue-129-symphony",
            state: { name: "Execute", type: "started" },
            labels: { nodes: [{ name: "resources" }] },
          },
          children: [
            {
              identifier: "#135",
              title: "Implement dashboard",
              state: { name: "Ready to Build", type: "unstarted" },
            },
          ],
        },
        {
          routing: {
            documentsRoot: "/home/walsc0",
            projectsRoot: "/home/walsc0/projects",
            folderExists: (p) => /projects\/resources$/i.test(p),
          },
          assertBranchCleanupPreflight: async () => calls.push(["branchCleanupPreflight"]),
          ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
          prepareChildBranch: async () => {
            calls.push(["prepareChildBranch"]);
            throw new Error("Cannot create child branch because the working tree has uncommitted changes.");
          },
          moveIssue: async () => calls.push(["moveIssue"]),
          runWorker: async () => calls.push(["runWorker"]),
        },
      ),
    /working tree has uncommitted changes/i,
  );

  assert.deepEqual(calls, [
    ["branchCleanupPreflight"],
    ["ensureParentBranch"],
    ["prepareChildBranch"],
  ]);
});

test("runQueueExecution verifies and merges child branch before closing a child", async () => {
  const calls = [];

  const result = await runQueueExecution(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        branchName: "issue-129-symphony",
        state: { name: "Execute", type: "started" },
      },
      children: [
        {
          identifier: "#135",
          title: "Implement dashboard",
          body: "## Test Command\nnode --test dashboard.test.mjs",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    {
      moveIssue: async (issueKey, state) => calls.push(["moveIssue", issueKey, state]),
      addComment: async (issueKey) => calls.push(["addComment", issueKey]),
      ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
      prepareChildBranch: async () => {
        calls.push(["prepareChildBranch"]);
        return { name: "crosby/129/135-implement-dashboard", parentBranch: "issue-129-symphony" };
      },
      snapshotGitState: async ({ childBranch }) => {
        calls.push(["snapshot", childBranch.name]);
        return { available: true, branch: childBranch.name, head: "abc123" };
      },
      runWorker: async () => {
        calls.push(["runWorker"]);
        return {
          stdout: JSON.stringify({
            issueKey: "#135",
            issueTitle: "Implement dashboard",
            outcome: "done",
            summary: "Completed.",
            changes: ["Updated dashboard implementation"],
            tests: ["node --test dashboard.test.mjs"],
            humanTestingRequired: false,
            humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
          }),
        };
      },
      hasCommittedWorkSince: async ({ expectedBranchName }) => {
        calls.push(["verifyCommit", expectedBranchName]);
        return { hasCommittedWork: true, diagnostic: "ok" };
      },
      runVerificationCommand: async ({ command }) => calls.push(["runVerification", command]),
      mergeChildBranchIntoParent: async ({ childBranch }) =>
        calls.push(["mergeChildBranch", childBranch.name]),
      refreshQueue: async () => ({
        parent: {
          identifier: "#129",
          title: "Symphony",
          branchName: "issue-129-symphony",
          state: { name: "Building", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Implement dashboard",
            state: { name: "Done", type: "completed" },
          },
        ],
      }),
    },
  );

  assert.equal(result.completedChildren[0].workerResult.outcome, "done");
  assert.deepEqual(calls.slice(0, 9), [
    ["ensureParentBranch"],
    ["prepareChildBranch"],
    ["moveIssue", "#135", "Building"],
    ["snapshot", "crosby/129/135-implement-dashboard"],
    ["runWorker"],
    ["verifyCommit", "crosby/129/135-implement-dashboard"],
    ["runVerification", "node --test dashboard.test.mjs"],
    ["mergeChildBranch", "crosby/129/135-implement-dashboard"],
    ["moveIssue", "#135", "Done"],
  ]);
});

test("runQueueExecution moves child to review and does not merge when verification fails", async () => {
  const calls = [];

  const result = await runQueueExecution(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        branchName: "issue-129-symphony",
        state: { name: "Execute", type: "started" },
      },
      children: [
        {
          identifier: "#135",
          title: "Implement dashboard",
          body: "## Test Command\nnode --test dashboard.test.mjs",
          state: { name: "Ready to Build", type: "unstarted" },
        },
        {
          identifier: "#136",
          title: "Next task",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    {
      moveIssue: async (issueKey, state) => calls.push(["moveIssue", issueKey, state]),
      addComment: async (issueKey, body) => calls.push(["addComment", issueKey, body]),
      prepareChildBranch: async () => ({ name: "crosby/129/135-implement-dashboard", parentBranch: "issue-129-symphony" }),
      snapshotGitState: async () => ({ available: true, branch: "crosby/129/135-implement-dashboard", head: "abc123" }),
      runWorker: async () => ({
        stdout: JSON.stringify({
          issueKey: "#135",
          issueTitle: "Implement dashboard",
          outcome: "done",
          summary: "Completed.",
          changes: ["Updated dashboard implementation"],
          tests: ["node --test dashboard.test.mjs"],
          humanTestingRequired: false,
          humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
        }),
      }),
      hasCommittedWorkSince: async () => ({ hasCommittedWork: true, diagnostic: "ok" }),
      runVerificationCommand: async () => {
        calls.push(["runVerification"]);
        throw new Error("tests failed");
      },
      mergeChildBranchIntoParent: async () => calls.push(["mergeChildBranch"]),
    },
  );

  assert.equal(result.completedChildren[0].workerResult.outcome, "review");
  assert.deepEqual(
    calls.filter((call) => call[0] === "moveIssue"),
    [
      ["moveIssue", "#135", "Building"],
      ["moveIssue", "#135", "Review"],
      ["moveIssue", "#129", "Review"],
    ],
  );
  assert.equal(calls.some((call) => call[0] === "mergeChildBranch"), false);
  assert.equal(calls.some((call) => call[1] === "#136"), false);
  const progressComment = calls.find((call) => call[0] === "addComment")?.[2] ?? "";
  assert.match(progressComment, /Status: Review/);
  assert.match(progressComment, /Verification command failed/);
});

test("runQueueExecution closes done worker results when committed work is found", async () => {
  const calls = [];
  const events = [];

  const result = await runQueueExecution(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        branchName: "issue-129-symphony",
        state: { name: "Execute", type: "started" },
      },
      children: [
        {
          identifier: "#135",
          title: "Implement dashboard",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    {
      moveIssue: async (issueKey, state) => calls.push(["moveIssue", issueKey, state]),
      addComment: async (issueKey) => calls.push(["addComment", issueKey]),
      snapshotGitState: async () => {
        events.push("snapshot");
        return { branch: "issue-129-symphony", head: "abc123" };
      },
      hasCommittedWorkSince: async () => {
        events.push("verify");
        return {
          hasCommittedWork: true,
          diagnostic:
            "New commit def456 found on issue-129-symphony after abc123.",
        };
      },
      runWorker: async () => {
        events.push("worker");
        return {
          stdout: JSON.stringify({
            issueKey: "#135",
            issueTitle: "Implement dashboard",
            outcome: "done",
            summary: "Completed.",
            changes: ["Updated dashboard implementation"],
            tests: ["node --test"],
            humanTestingRequired: false,
            humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
          }),
        };
      },
      refreshQueue: async () => ({
        parent: {
          identifier: "#129",
          title: "Symphony",
          state: { name: "Building", type: "started" },
        },
        children: [
          {
            identifier: "#135",
            title: "Implement dashboard",
            state: { name: "Done", type: "completed" },
          },
        ],
      }),
    },
  );

  assert.deepEqual(events, ["snapshot", "worker", "verify"]);
  assert.equal(result.completedChildren[0].workerResult.outcome, "done");
  assert.deepEqual(calls.slice(0, 2), [
    ["moveIssue", "#135", "Building"],
    ["moveIssue", "#135", "Done"],
  ]);
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "moveIssue" && call[1] === "#135" && call[2] === "Review",
    ),
    false,
  );
});

test("runQueueExecution emits finalized and refreshed callbacks after each child result", async () => {
  const calls = [];
  let refreshed = false;

  const result = await runQueueExecution(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        state: { name: "Execute", type: "started" },
      },
      children: [
        {
          identifier: "#135",
          title: "Implement dashboard",
          state: { name: "Ready to Build", type: "unstarted" },
        },
      ],
    },
    {
      moveIssue: async (issueKey, state) => calls.push(["moveIssue", issueKey, state]),
      addComment: async (issueKey) => calls.push(["addComment", issueKey]),
      runWorker: async () => ({
        stdout: JSON.stringify({
          issueKey: "#135",
          issueTitle: "Implement dashboard",
          outcome: "done",
          summary: "Completed.",
          changes: ["Added dashboard"],
          tests: ["node --test"],
          humanTestingRequired: false,
          humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
        }),
      }),
      refreshQueue: async () => {
        calls.push(["refreshQueue"]);
        refreshed = true;
        return {
          parent: {
            identifier: "#129",
            title: "Symphony",
            state: { name: "Building", type: "started" },
          },
          children: [
            {
              identifier: "#135",
              title: "Implement dashboard",
              state: { name: "Done", type: "completed" },
            },
          ],
        };
      },
      onExecutionFinalized: async (event) => {
        calls.push([
          "finalized",
          event.child.identifier,
          event.workerResult.outcome,
          refreshed,
        ]);
      },
      onQueueRefreshed: async (queue) => {
        calls.push([
          "queueRefreshed",
          queue.parent.identifier,
          queue.children[0].state.name,
        ]);
      },
      onParentFinalized: async ({ finalSummary }) => {
        calls.push(["parentFinalized", /Human QA summary/.test(finalSummary)]);
      },
    },
  );

  assert.equal(result.completedChildren.length, 1);
  assert.deepEqual(calls, [
    ["moveIssue", "#135", "Building"],
    ["moveIssue", "#135", "Done"],
    ["finalized", "#135", "done", false],
    ["addComment", "#129"],
    ["refreshQueue"],
    ["queueRefreshed", "#129", "Done"],
    ["addComment", "#129"],
    ["moveIssue", "#129", "Review"],
    ["parentFinalized", true],
  ]);
});

test("parseCrosbyCommandArgs supports push and review commands", async () => {
  assert.deepEqual(parseCrosbyCommandArgs("#13"), {
    mode: "parent",
    issueKey: "#13",
  });
  assert.deepEqual(parseCrosbyCommandArgs("--watch"), { mode: "watch" });
  assert.deepEqual(parseCrosbyCommandArgs("push #13"), {
    mode: "push",
    issueKey: "#13",
  });
  assert.deepEqual(parseCrosbyCommandArgs("review #13"), {
    mode: "review",
    issueKey: "#13",
  });
});

test("tracker detection routes Jira keys and browse URLs to Jira handling", () => {
  const jiraAdapter = { name: "jira" };
  const githubAdapter = { name: "github" };

  assert.deepEqual(parseCrosbyCommandArgs("WCSD-126"), {
    mode: "parent",
    issueKey: "WCSD-126",
  });
  assert.equal(detectIssueTracker("WCSD-126"), "jira");
  assert.deepEqual(normalizeTrackerIssueReference("WCSD-126"), {
    tracker: "jira",
    issueKey: "WCSD-126",
  });
  assert.deepEqual(
    normalizeTrackerIssueReference(
      "https://site.atlassian.net/browse/WCSD-126",
    ),
    {
      tracker: "jira",
      issueKey: "WCSD-126",
    },
  );
  assert.deepEqual(
    selectCrosbyTrackerAdapter("https://site.atlassian.net/browse/WCSD-126", {
      github: githubAdapter,
      jira: jiraAdapter,
    }),
    {
      tracker: "jira",
      issueKey: "WCSD-126",
      adapter: jiraAdapter,
    },
  );
});

test("tracker detection preserves GitHub issue references and watch parsing", () => {
  const githubRefs = [
    "#123",
    "123",
    "https://github.com/alintawalshy66/resources/issues/123",
  ];

  for (const ref of githubRefs) {
    assert.equal(detectIssueTracker(ref), "github");
    assert.equal(
      selectCrosbyTrackerAdapter(ref, { github: "gh", jira: "jira" }).adapter,
      "gh",
    );
  }

  assert.deepEqual(
    parseCrosbyCommandArgs(
      "push https://github.com/alintawalshy66/resources/issues/123",
    ),
    {
      mode: "push",
      issueKey: "https://github.com/alintawalshy66/resources/issues/123",
    },
  );
  assert.deepEqual(
    parseCrosbyCommandArgs(
      "review https://github.com/alintawalshy66/resources/issues/123",
    ),
    {
      mode: "review",
      issueKey: "https://github.com/alintawalshy66/resources/issues/123",
    },
  );
  assert.deepEqual(parseCrosbyCommandArgs("--watch"), { mode: "watch" });
});

test("publishParentPullRequest pushes branch and creates PR when missing", async () => {
  const calls = [];
  const pullRequest = await publishParentPullRequest(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        branchName: "test-branch",
        labels: { nodes: [{ name: "tools" }] },
      },
      children: [
        {
          identifier: "#135",
          title: "Failure handling and daemon resilience",
          state: { name: "Done" },
        },
      ],
    },
    [],
    {
      routing: {
        documentsRoot: "/home/walsc0",
        projectsRoot: "/home/walsc0/projects",
        folderExists: (p) => /tools$/i.test(p),
      },
      ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
      assertCleanWorkingTree: async () =>
        calls.push(["assertCleanWorkingTree"]),
      readImplementationSummary: async () => "Summary details",
      pushBranch: async ({ branchName }) =>
        calls.push(["pushBranch", branchName]),
      getPullRequest: async () => null,
      createPullRequest: async ({ title, body, branchName }) => {
        calls.push(["createPullRequest", title, branchName, body]);
        return {
          number: 42,
          url: "https://example.com/pr/42",
          body,
          headRefName: branchName,
        };
      },
      updatePullRequest: async () => calls.push(["updatePullRequest"]),
      addParentComment: async (issueKey, body) =>
        calls.push(["addParentComment", issueKey, body]),
    },
  );

  assert.equal(pullRequest.url, "https://example.com/pr/42");
  assert.deepEqual(calls.slice(0, 3), [
    ["ensureParentBranch"],
    ["assertCleanWorkingTree"],
    ["pushBranch", "test-branch"],
  ]);
  assert.equal(
    calls.some(([type]) => type === "updatePullRequest"),
    false,
  );
  assert.match(
    calls.find(([type]) => type === "addParentComment")[2],
    /https:\/\/example.com\/pr\/42/,
  );
});

test("reviewParentPullRequest comments when Claude review fails", async () => {
  const calls = [];
  const result = await reviewParentPullRequest(
    {
      parent: {
        identifier: "#129",
        title: "Symphony",
        branchName: "test-branch",
        labels: { nodes: [{ name: "tools" }] },
      },
      children: [
        {
          identifier: "#135",
          title: "Failure handling and daemon resilience",
          state: { name: "Done" },
        },
      ],
    },
    [
      {
        child: {
          identifier: "#135",
          title: "Failure handling and daemon resilience",
        },
        workerResult: {
          outcome: "done",
          summary: "Completed.",
          changes: ["Added resilience handling"],
          tests: ["node --test lib-v2.test.mjs"],
          humanTestingRequired: false,
          humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
          recoveryNotes: [],
        },
      },
    ],
    {
      routing: {
        documentsRoot: "/home/walsc0",
        projectsRoot: "/home/walsc0/projects",
        folderExists: (p) => /tools$/i.test(p),
      },
      ensureParentBranch: async () => calls.push(["ensureParentBranch"]),
      assertCleanWorkingTree: async () =>
        calls.push(["assertCleanWorkingTree"]),
      getPullRequest: async () => ({
        number: 42,
        url: "https://example.com/pr/42",
        body: "Existing body",
        headRefName: "test-branch",
      }),
      readImplementationSummary: async () => "Summary details",
      updatePullRequest: async (payload) =>
        calls.push(["updatePullRequest", payload.body]),
      runClaudeReview: async () => {
        throw new Error("Claude crashed");
      },
      addPullRequestComment: async (payload) =>
        calls.push(["addPullRequestComment", payload.body]),
      addParentComment: async (issueKey, body) =>
        calls.push(["addParentComment", issueKey, body]),
    },
  );

  assert.equal(result.pullRequest.url, "https://example.com/pr/42");
  assert.match(
    calls.find(([type]) => type === "addPullRequestComment")[1],
    /Review failed/,
  );
  assert.match(
    calls.find(([type]) => type === "addPullRequestComment")[1],
    /Claude crashed/,
  );
});

test("reviewParentPullRequest requires push before PR review", async () => {
  await assert.rejects(
    () =>
      reviewParentPullRequest(
        {
          parent: {
            identifier: "#129",
            title: "Symphony",
            branchName: "test-branch",
            labels: { nodes: [{ name: "tools" }] },
          },
          children: [
            {
              identifier: "#135",
              title: "Failure handling and daemon resilience",
              state: { name: "Done" },
            },
          ],
        },
        [],
        {
          routing: {
            documentsRoot: "/home/walsc0",
            projectsRoot: "/home/walsc0/projects",
            folderExists: (p) => /tools$/i.test(p),
          },
          ensureParentBranch: async () => {},
          assertCleanWorkingTree: async () => {},
          getPullRequest: async () => null,
        },
      ),
    /run \/crosby push #129 first/i,
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
        const timestamps = [
          new Date("2026-05-04T00:02:00Z"),
          new Date("2026-05-04T12:45:00Z"),
        ];
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

test("extractLabelValue returns the value after the prefix", () => {
  const child = { labels: ["type:child", "model:gpt-5.5"] };
  assert.equal(extractLabelValue(child, "model:"), "gpt-5.5");
});

test("extractLabelValue returns null when the prefix is absent", () => {
  const child = { labels: ["type:child", "dlhub"] };
  assert.equal(extractLabelValue(child, "model:"), null);
});

test("extractLabelValue trims whitespace and rejects empty values", () => {
  const child = { labels: ["model:   "] };
  assert.equal(extractLabelValue(child, "model:"), null);
});

test("extractLabelValue supports object-shaped labels", () => {
  const child = {
    labels: [{ name: "type:child" }, { name: "effort:medium" }],
  };
  assert.equal(extractLabelValue(child, "effort:"), "medium");
});

test("extractLabelValue supports GraphQL-style nodes labels", () => {
  const child = {
    labels: { nodes: [{ name: "model:claude-opus-4.7" }, { name: "dlhub" }] },
  };
  assert.equal(extractLabelValue(child, "model:"), "claude-opus-4.7");
});

test("extractLabelValue returns the first match when multiple prefixed labels exist", () => {
  const child = { labels: ["model:gpt-5.5", "model:claude-opus-4.7"] };
  assert.equal(extractLabelValue(child, "model:"), "gpt-5.5");
});

test("extractLabelValue returns null for empty or missing prefix", () => {
  const child = { labels: ["model:gpt-5.5"] };
  assert.equal(extractLabelValue(child, ""), null);
  assert.equal(extractLabelValue(child, undefined), null);
});

test("extractModelOverride wraps extractLabelValue with the model: prefix", () => {
  assert.equal(extractModelOverride({ labels: ["model:gpt-5.5"] }), "gpt-5.5");
  assert.equal(extractModelOverride({ labels: ["dlhub"] }), null);
  assert.equal(extractModelOverride(null), null);
});

test("extractEffortOverride wraps extractLabelValue with the effort: prefix", () => {
  assert.equal(extractEffortOverride({ labels: ["effort:high"] }), "high");
  assert.equal(extractEffortOverride({ labels: ["dlhub"] }), null);
  assert.equal(extractEffortOverride(null), null);
});

test("runWatchCycle forwards model and effort labels into runWorker", async () => {
  const workerCalls = [];
  await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "#200",
          title: "Model routing",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "#201",
            title: "Frontend slice",
            state: { name: "Ready to Build", type: "unstarted" },
            labels: [
              "type:child",
              "dlhub",
              "model:claude-opus-4.7",
              "effort:medium",
            ],
          },
        ],
      },
    ],
    moveIssue: async () => {},
    addComment: async () => {},
    ensureParentBranch: async () => {},
    refreshQueue: async () => null,
    loadIssue: async () => null,
    runWorker: async (call) => {
      workerCalls.push(call);
      return {
        stdout: JSON.stringify({
          issueKey: "#201",
          issueTitle: "Frontend slice",
          outcome: "done",
          summary: "Completed",
          changes: [],
          tests: [],
          humanTestingRequired: false,
          humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
          requiredHumanAction: "",
          recoveryNotes: [],
        }),
      };
    },
  });

  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0].model, "claude-opus-4.7");
  assert.equal(workerCalls[0].effort, "medium");
});

test("runWatchCycle passes null model and effort when labels are absent", async () => {
  const workerCalls = [];
  await runWatchCycle({
    fetchExecuteParentQueues: async () => [
      {
        parent: {
          identifier: "#300",
          title: "Default routing",
          state: { name: "Execute", type: "started" },
        },
        children: [
          {
            identifier: "#301",
            title: "Backend slice",
            state: { name: "Ready to Build", type: "unstarted" },
            labels: ["type:child", "dlhub"],
          },
        ],
      },
    ],
    moveIssue: async () => {},
    addComment: async () => {},
    ensureParentBranch: async () => {},
    refreshQueue: async () => null,
    loadIssue: async () => null,
    runWorker: async (call) => {
      workerCalls.push(call);
      return {
        stdout: JSON.stringify({
          issueKey: "#301",
          issueTitle: "Backend slice",
          outcome: "done",
          summary: "Completed",
          changes: [],
          tests: [],
          humanTestingRequired: false,
          humanTestingInstructions: ["No targeted human testing required beyond normal code review."],
          requiredHumanAction: "",
          recoveryNotes: [],
        }),
      };
    },
  });

  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0].model, null);
  assert.equal(workerCalls[0].effort, null);
});
