# Crosby

Crosby is the Linear execution orchestrator for this workflow.

## Quick start

### Run one parent manually

```text
/crosby COA-129
```

Use this to kick off the next runnable child under one parent immediately.

### Run the watcher

```text
/crosby --watch
```

Use this to poll for parent issues in `Execute` and process eligible child issues automatically.

### Stop the watcher

- stop the current Pi run
- close the terminal/session running it
- or press `Ctrl+C`

### Core rule

- parent in `Execute` = active workflow
- child in `Ready to Build` = runnable work
- one parent issue = one feature branch

## What Crosby does

Crosby supports four commands:

- **`/crosby COA-129`**: run one parent now
- **`/crosby --watch`**: poll Linear and automatically process active parents
- **`/crosby push COA-129`**: push the parent branch and create/update a PR
- **`/crosby review COA-129`**: run automated review against the parent PR

It uses:

- **Pi build worker** for child implementation
  - model is inherited from normal Pi resolution/config
- **Claude review worker** for explicit PR review
  - default model: `claude-sonnet-4-6`
  - default effort: `medium`

## Commands

### Execute child work

```text
/crosby COA-129
```

What happens:

1. Crosby loads the parent
2. Reads the child issues
3. Picks the next unblocked child in `Ready to Build`
4. Ensures the repo is on the parent feature branch
   - checks out the existing branch if present
   - creates it if missing
5. Moves that child to `Build`
6. Runs the Pi worker
7. Moves the child to:
   - `Done` if complete
   - `In Review` if human review/action is needed
8. Posts a progress comment to the parent
9. If all children are `Done`, Crosby posts the final parent summary and moves the parent to `In Review`

### Watch mode

```text
/crosby --watch
```

Current behavior:

- polls every **60 seconds**
- looks for **parent issues in `Execute`**
- reads the children under those parents
- picks the next unblocked child in `Ready to Build`
- ensures the repo is on the parent feature branch
- moves that child to `Build`
- runs the Pi worker
- posts progress back to the parent
- when all child issues are complete, posts the final summary and moves the parent to `In Review`

## How to stop watch mode

There is no separate `/crosby --stop` command.

To stop watch mode:

- stop the current Pi run
- or close the terminal/session running it
- or use `Ctrl+C` if it is running in a terminal

If watch mode is off, nothing runs automatically.

## Workflow states

### Parent issue states

- `Ready to Build`
  - inactive
  - watcher ignores it
- `Execute`
  - active
  - watcher will inspect this parent and try to run child work
- `In Review`
  - all child work is complete and ready for human QA / explicit push / explicit review
- `Done`
  - fully finished

### Child issue states

- `Backlog`
  - typically used for `HITL` child issues
  - not auto-run
- `Ready to Build`
  - runnable state for buildable child issues
- `Build`
  - currently being worked by Crosby
- `In Review`
  - implementation finished but human review/action is required
- `Done`
  - complete

## Intended issue creation defaults

- `AFK` child issues -> `Ready to Build`
- `HITL` child issues -> `Backlog`

## How the workflow is intended to work

### Manual path

1. Create child issues
2. AFK children start in `Ready to Build`
3. Run:

```text
/crosby COA-129
```

4. Crosby works the next runnable child under that parent

### Watch path

1. Create child issues
2. AFK children start in `Ready to Build`
3. Move the **parent** issue to `Execute`
4. Start watch mode:

```text
/crosby --watch
```

5. Crosby finds parents in `Execute`
6. It works child issues in `Ready to Build`, one at a time

## Important rules

- Watch mode is driven by **parent issues in `Execute`**
- Child issues do **not** need to be moved to `Execute`
- Child issues must be in **`Ready to Build`** to be auto-run
- One parent issue = one feature branch
- Before child execution, Crosby resolves the parent `branchName`, checks out that branch, or creates it if needed
- If the resolved project folder is not a git repo, Crosby stops with a descriptive error
- If Crosby would need to switch branches and the repo has uncommitted changes, it stops with a descriptive error instead of risking work on the wrong branch
- Blocked children are skipped until blockers are `Done`
- If a child is already in `Build`, Crosby will not start another child for that parent

## Push/review behavior

When all child issues are `Done`, normal execution stops after:

1. posting the final summary to the parent Linear issue
2. moving the parent to `In Review`

GitHub work is explicit:

### Push

```text
/crosby push COA-129
```

1. ensures the repo is on the parent branch
2. requires a clean working tree
3. pushes the branch to `origin`
4. creates a PR if missing, otherwise updates the existing PR body
5. posts the PR link back to the parent Linear issue

### Review

```text
/crosby review COA-129
```

1. ensures the repo is on the parent branch
2. requires a clean working tree
3. requires an existing PR
4. syncs `implementation_summary.md` into the PR body
5. runs Claude review
6. posts the review result to the PR
7. posts the review summary back to the parent Linear issue

## Config overrides

Optional environment variables:

- `CROSBY_CLAUDE_MODEL`
- `CROSBY_CLAUDE_EFFORT`

Pi build workers now inherit model selection from normal Pi config/session resolution.

Defaults:

- `CROSBY_CLAUDE_MODEL=claude-sonnet-4-6`
- `CROSBY_CLAUDE_EFFORT=medium`

## Files

- `index.ts` - Pi extension entrypoint
- `lib.mjs` - core Crosby logic
- `lib-v2.mjs` - active imported library used by the extension
