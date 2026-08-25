# Crosby

Crosby is the GitHub Issues execution orchestrator for this workflow.

## Quick start

### Run one parent manually

```text
/crosby #129
```

Use this to kick off the next runnable child under one parent immediately.

### Run the watcher

```text
/crosby --watch
```

Use this to poll for parent issues labeled `type:parent` and `status:execute`, then process eligible child issues automatically.

### Stop the watcher

- stop the current Pi run
- close the terminal/session running it
- or press `Ctrl+C`

### Core rule

- parent issue with `status:execute` = active workflow
- child issue with `status:ready-to-build` = runnable work
- one parent issue = one feature branch
- child completion = closed GitHub issue

## What Crosby does

Crosby supports four commands:

- **`/crosby #129`**: run one parent now
- **`/crosby --watch`**: poll GitHub and automatically process active parents
- **`/crosby push #129`**: push the parent branch and create/update a PR
- **`/crosby review #129`**: run automated review against the parent PR

It uses:

- **Pi build worker** for child implementation
  - model is inherited from normal Pi resolution/config
  - the Crosby control tab renders a live dashboard of parent child issues, including queued/in-progress/done/review/fatal state and worker pane IDs when available
  - when Crosby itself is running inside Herdr, each build worker starts as an interactive Pi agent in its own Herdr tab by default so progress/tool calls are visible while watch/manual execution loops
  - when Crosby itself is running inside Herdr, a sibling dashboard pane opens in the same tab by default for both `/crosby #parent` and `/crosby --watch`, running the standalone dashboard runner against the current run's event log; the compact widget stays to one current-activity line and includes the dashboard pane ID once it is open
- **Claude review worker** for explicit PR review
  - default model: `claude-sonnet-4-6`
  - default effort: `medium`

## Required GitHub issue model

See `shared-workflows/references/github-issue-workflow.md`.

Required labels:

- `type:parent`
- `type:child`
- `status:ready`
- `status:execute`
- `status:ready-to-build`
- `status:building`
- `status:review`
- `mode:afk`
- `mode:hitl`
- `wt:development`
- `wt:process-automation`

Optional per-child worker overrides:

- `model:<provider>/<model-id>` — routes this child's Pi build worker to a specific model, e.g. `model:github-copilot/gpt-5.5` or `model:github-copilot/claude-opus-4.7`. Prefer provider-qualified model labels because bare model labels can resolve to an unavailable provider before Pi falls back to the provider shown by `pi --list-models`.
- `effort:<effort-level>` — sets the reasoning effort for the Pi build worker, e.g. `effort:medium`. If absent, the worker uses Pi's normal config default. This is passed to `pi` as `--thinking <effort-level>` (pi's CLI flag for reasoning effort), so `effort-level` must be one of pi's supported thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

Both labels are additive to the required labels above; Crosby does not validate the values, so unknown, unavailable, or unauthenticated model/provider names surface as Pi worker errors. First matching label wins if multiple `model:*` or `effort:*` labels are present. Verify a model override with `pi --model <provider>/<model-id> --thinking <level> -p 'Reply OK'` before applying it broadly.

Done work is represented by closing the GitHub issue.

## Parent issue format

The parent issue body should include child references in order:

```markdown
## Child Issues

- [ ] #135 Failure handling and daemon resilience
- [ ] #136 Next issue
```

The parent should have:

- `type:parent`
- `status:ready` or `status:execute`
- a work-type label such as `development`
- a local folder routing label, such as `dlhub`, when Crosby must choose a checkout
- an optional `Branch: branch-name` line or `branch:<name>` label; otherwise Crosby derives a branch name from the issue number/title
- a milestone shared with its children, when useful

## Child issue format

Each child issue should include:

```markdown
Parent: #129

## Scope
...

## Acceptance Criteria
- [ ] ...
```

Runnable child issues should have:

- `type:child`
- `status:ready-to-build`
- `mode:afk`
- same milestone as parent, when useful
- optionally `model:<provider>/<id>` and/or `effort:<level>` to route this child to a specific Pi model/effort

Human-in-the-loop child issues should have:

- `type:child`
- `mode:hitl`
- `status:ready` or `status:review`

## Commands

### Execute child work

```text
/crosby #129
```

What happens:

1. Crosby loads the parent issue with `gh issue view`.
2. Reads child issue references from the parent body.
3. Picks the next unblocked child with `status:ready-to-build`.
4. Ensures the repo is on the parent feature branch.
5. Moves that child to `status:building`.
6. Runs the Pi worker with a persistent session named from the child issue number (for example `gh-135`) so it is easy to find later with `pi -r` / `/resume`. The worker prompt requires leaf workers to `git add`, `git commit` with a message referencing the issue key, verify `git status --porcelain` is empty before returning `done`, include commit hash(es) in `changes[]`, and return `review` with `requiredHumanAction` if they cannot satisfy that commit protocol.
7. Validates the worker result against git state:
   - Crosby snapshots `HEAD` on the parent branch before launching the worker
   - `outcome: "done"` closes the child only if a new descendant commit exists on the parent branch after the worker finishes
   - if no qualifying commit is found, Crosby downgrades the result to `status:review` with a diagnostic and human-action recovery note
   - `outcome: "review"` still moves directly to `status:review`
8. Posts a progress comment to the parent.
9. If all children are closed, Crosby posts the final parent summary and moves the parent to `status:review`.

### Watch mode

```text
/crosby --watch
```

Current behavior:

- polls every **60 seconds**
- looks for open parent issues with `type:parent` and `status:execute`
- reads children from those parents
- picks the next unblocked child with `status:ready-to-build`
- ensures the repo is on the parent feature branch
- moves that child to `status:building`
- snapshots the current git branch and `HEAD`
- runs the Pi worker with a persistent `gh-<issue-number>` session name for resume lookup
- instructs the worker to stage and commit its work, reference the issue key in the commit message, verify `git status --porcelain` is empty before `done`, report commit hash(es) in `changes[]`, and return `review` with `requiredHumanAction` when it cannot commit cleanly
- closes `done` children only when worker execution produced a new descendant commit on the parent branch; otherwise moves the child to `status:review` with a clear no-commit diagnostic
- posts progress back to the parent
- when all child issues are closed, posts the final summary and moves the parent to `status:review`

## Branch cleanup preflight report

Before Crosby starts or resumes execution, it runs a blocking branch cleanup preflight.
The branch cleanup report explains which branch state must be reviewed before the run can continue.

- **Base branch: main**.
- Only local branches are reported; remote-only branches are not included in this check.
- The report can list local branches that need manual review, such as stale parent or child work branches left from earlier runs.
- Crosby does not modify branches during this preflight. It reports the branch state and stops until a human decides what to keep, merge, rename, or remove.
- The documentation and report intentionally avoid deletion command examples because branch cleanup is a manual, explicit decision.

## Workflow states

### Parent issue labels

- `status:ready`
  - inactive
  - watcher ignores it
- `status:execute`
  - active
  - watcher will inspect this parent and try to run child work
- `status:review`
  - all child work is complete and ready for human QA / explicit push / explicit review
- closed
  - fully finished

### Child issue labels/state

- `status:ready-to-build`
  - runnable state for buildable child issues
- `status:building`
  - currently being worked by Crosby
- `status:review`
  - implementation finished but human review/action is required
- closed
  - complete

## Intended issue creation defaults

- `mode:afk` child issues -> `status:ready-to-build`
- `mode:hitl` child issues -> `status:ready` or `status:review`

## Push/review behavior

When all child issues are closed, normal execution stops after:

1. posting the final summary to the parent GitHub issue
2. moving the parent to `status:review`

GitHub PR work is explicit:

### Push

```text
/crosby push #129
```

1. ensures the repo is on the parent branch
2. requires a clean working tree
3. pushes the branch to `origin`
4. creates a PR if missing, otherwise updates the existing PR body
5. posts the PR link back to the parent GitHub issue

### Review

```text
/crosby review #129
```

1. ensures the repo is on the parent branch
2. requires a clean working tree
3. requires an existing PR
4. syncs `implementation_summary.md` into the PR body
5. runs Claude review
6. posts the review result to the PR
7. posts the review summary back to the parent GitHub issue

## Dashboard

Crosby projects run state in two places: a compact widget always visible in the Pi UI,
and an optional full dashboard pane opened in Herdr.

### Compact widget vs. full dashboard pane

- **Compact widget**: a single-line `ctx.ui.setWidget` status rendered inside the running Pi process
  (Crosby control tab). It never shows the full task list. It shows the current activity,
  such as:
  ```text
  Crosby #129: #135 started · pane pane-42
  ```
  When no lifecycle event has occurred yet it shows the parent as idle; fatal runs show the
  fatal reason on the same line. The pane suffix appears only after a dashboard pane has
  actually been opened.
- **Full dashboard pane**: a separate terminal pane running the standalone
  `dashboard-runner.mjs` script. It renders the full parent/child task list, per-task
  status (queued/in-progress/done/review/fatal), and the recent event history using the
  same `renderCrosbyDashboard` reducer that produces the pane content. Because it is a
  plain Node process, it never starts a Pi model or session and keeps running/tailing
  even if the Crosby control tab's Pi process exits.

### Herdr dashboard pane behavior

When Crosby is running inside Herdr, both `/crosby #129` (manual) and `/crosby --watch`
open one dashboard pane per run as a sibling pane in the **same Herdr tab** as the Crosby
control process (`pane split --direction right`). The pane is labeled `Crosby dashboard`
and runs `dashboard-runner.mjs --run <run-id>`, pointed at the current run's event log, so
it reprints as new lifecycle events are appended.

Dashboard pane creation is best-effort: if the Herdr split, label, or runner launch fails,
Crosby logs it internally but never stops or fails the run.

### Event log location

Every dashboard mutation (run started/idle, task started/finished/review/fatal, run
completed/fatal, dashboard pane opened) is appended as one JSON line to:

```text
~/.pi/agent/crosby/runs/<run-id>/events.jsonl
```

Writes are append-only (`fs.appendFileSync`), so the file is safe to `tail -f` from any
other terminal, independent of the dashboard pane or dashboard runner.

### Default-on behavior inside Herdr

- Inside Herdr (`HERDR_ENV=1` and a resolvable `HERDR_PANE_ID`): the dashboard pane opens
  automatically for both manual and watch execution — no flag is required to opt in.
- Outside Herdr: Crosby never attempts to open a dashboard pane. Compact widget and
  event log behavior are unaffected; only the separate terminal pane is skipped.

### Disabling the dashboard pane

Set:

```text
CROSBY_DASHBOARD_PANE=0
```

to opt out of automatic dashboard pane creation while still running inside Herdr. This
only disables the dashboard pane; it does not affect build worker panes/tabs
(`CROSBY_HERDR_PANES`) or the compact widget/event log.

### Troubleshooting: missing dashboard pane

If no dashboard pane appears when running inside Herdr:

- Confirm `CROSBY_DASHBOARD_PANE` is not set to `0`, `false`, `no`, or `off`.
- Confirm Crosby detects Herdr: both `HERDR_ENV=1` and `HERDR_PANE_ID` must be set in the
  environment the Pi process is running in.
- Dashboard pane creation is best-effort — a failed `herdr pane split`/`rename`/`run` call
  is swallowed so it never blocks execution. Check for a stray unlabeled pane in the same
  tab, or run `dashboard-runner.mjs` manually against the run directory to confirm the
  event log itself is healthy.
- Run the dashboard manually against the most recent run without waiting for Crosby to
  reopen a pane:
  ```bash
  node shared-workflows/pi/extensions/crosby/dashboard-runner.mjs --once
  ```
  or point it at a specific run:
  ```bash
  node shared-workflows/pi/extensions/crosby/dashboard-runner.mjs --run <run-id>
  ```
- If `~/.pi/agent/crosby/runs/<run-id>/events.jsonl` is missing or empty, the run never
  reached its first dashboard mutation (e.g. it failed before `run_started`); check Crosby's
  own output/logs rather than the dashboard pane.

## Config overrides

Optional environment variables:

- `CROSBY_CLAUDE_MODEL`
- `CROSBY_CLAUDE_EFFORT`
- `CROSBY_HERDR_PANES=0` disables automatic Herdr worker terminals when Crosby is running inside Herdr
- `CROSBY_HERDR_LAYOUT=tab|pane` chooses worker display layout when running inside Herdr; default is `tab`
- `CROSBY_DASHBOARD_PANE=0` disables the automatic Herdr dashboard pane; the dashboard pane is otherwise opened by default whenever Crosby is running inside Herdr, and never opened outside Herdr
- `GH_BIN`
- `GIT_BIN`
- `CLAUDE_BIN`
- `HERDR_BIN`
- `NODE_BIN`

Pi build workers inherit model selection from normal Pi config/session resolution.

Defaults:

- `CROSBY_CLAUDE_MODEL=claude-sonnet-4-6`
- `CROSBY_CLAUDE_EFFORT=medium`

## Files

- `index.ts` - Pi extension entrypoint and GitHub CLI adapter
- `lib-v2.mjs` - Crosby queue/execution logic
- `lib-v2.test.mjs` - Node test coverage
- `dashboard.mjs` - dashboard/compact widget state model, event persistence, and rendering
- `dashboard.test.mjs` - Node test coverage for the dashboard model
- `dashboard-runner.mjs` - standalone terminal renderer for the full dashboard pane
- `dashboard-runner.test.mjs` - Node test coverage for the dashboard runner
