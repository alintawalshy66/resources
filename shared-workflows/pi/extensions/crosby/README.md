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
6. Runs the Pi worker.
7. Moves the child to:
   - closed if complete
   - `status:review` if human review/action is needed
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
- runs the Pi worker
- posts progress back to the parent
- when all child issues are closed, posts the final summary and moves the parent to `status:review`

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

## Config overrides

Optional environment variables:

- `CROSBY_CLAUDE_MODEL`
- `CROSBY_CLAUDE_EFFORT`
- `GH_BIN`
- `GIT_BIN`
- `CLAUDE_BIN`

Pi build workers inherit model selection from normal Pi config/session resolution.

Defaults:

- `CROSBY_CLAUDE_MODEL=claude-sonnet-4-6`
- `CROSBY_CLAUDE_EFFORT=medium`

## Files

- `index.ts` - Pi extension entrypoint and GitHub CLI adapter
- `lib-v2.mjs` - Crosby queue/execution logic
- `lib-v2.test.mjs` - Node test coverage
