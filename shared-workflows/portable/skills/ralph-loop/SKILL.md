---
name: ralph-loop
description: Execute one Linear child issue per fresh context using a strict TDD red-green-refactor loop, then stop and hand off to a new window for the next unblocked issue.
---

# Ralph Loop

Run implementation as a sequence of **issue-scoped, fresh-context execution loops**.

This skill is for work that has already been broken into **thin Linear child issues**. It executes **exactly one issue per session**, uses **TDD by default**, and stops at issue completion so the next issue can begin in a **new window/context**.

## When to Use

- A parent issue has already been split into child issues
- Each child issue is intended to be its own execution window
- You want strict context isolation between issues
- You want red-green-refactor enforced during implementation
- You want the agent to stop after one issue instead of rolling into siblings

## Core Principles

1. **One issue = one session = one fresh window.**
2. **Never execute more than one Linear child issue in the same run.**
3. **TDD first**: write a failing test or verification before production changes where applicable.
4. **Use the issue as the scope lock**; do not pull sibling work into the current loop.
5. **Stop after completion** and explicitly hand off to a new window for the next unblocked issue.
6. **If the issue is blocked, do not start implementation.**
7. **If the work is documentation/process-only, replace code-test red/green with the smallest equivalent verification-first loop.**
8. **Linear workflow states are enforced**: child execution issues should start in **Build Ready**, move to **Done** when complete, and move to **Review** if blocked pending required human action.
9. **Parent progress must stay current**: every completed child posts a concise progress summary to the parent, and the final completed child posts a consolidated wrap-up before moving the parent to **Review**.

## Inputs

Provide exactly one Linear issue key:

```text
/skill:ralph-loop COA-112
```

For non-Linear work, do not use this skill unless the work has been formalized into a single execution issue.

## Workflow

### 0) Resolve and validate the issue
- Fetch the supplied Linear issue.
- Use the Linear CLI explicitly for this step: `linear issue view <ISSUE-KEY> --json`.
- In isolated worker runs launched by other automation, assume the Linear CLI is available unless that command actually fails.
- Do not report "I can't talk to Linear" or equivalent unless you have attempted the CLI command in the current run and include the real failure.
- Confirm it is a **single execution issue**, not a parent container for multiple active slices.
- Read:
  - issue title
  - issue description
  - parent issue (if any)
  - dependency/blocker state
  - labels / work type
  - current workflow state
- Confirm the child issue is in **Build Ready** before execution starts. If not, stop and ask for the issue to be corrected unless you are explicitly resuming an already-started loop.
- If the issue is blocked, stop and tell the user which dependency must clear first.
- Load constitution via the canonical routing entrypoint:
  - Read `shared-workflows/references/constitution.md`
  - For this hard-gated skill, require exactly one valid work-type selector:
    - Linear label: `wt:development` or `wt:process-automation`
  - If the selector is missing, invalid, or duplicated, stop with recovery guidance
  - If the selector conflicts with the issue narrative, warn and proceed by selector
  - Load `## Core` plus the mapped work-type document

### 1) Enforce fresh-context execution
- Treat the current session as the **only** context for this issue.
- Do not plan or implement sibling issues.
- Do not continue into the next issue when this one finishes.
- If this run began from a previous issue handoff, still treat this issue as a fresh start.

### 2) Load only minimal required context
Read only what is necessary to complete the current issue:
- the current child issue
- the minimum parent context needed for intent and constraints
- `shared-workflows/references/constitution.md` plus the mapped work-type document selected in Step 0
- the specific files/modules relevant to this issue
- existing tests relevant to the touched behavior
- at finish time, the sibling child issue list and parent comments needed to post progress and determine whether this is the final completed child

Avoid loading unrelated specs, sibling issue details, or broad repo context unless required to unblock the current issue.

### 3) Lock scope to the issue
Before changing code, restate:
- current issue key
- expected outcome
- acceptance criteria
- files/modules likely in scope
- explicit out-of-scope items inferred from sibling issues or parent structure

If the issue is too broad for one clean loop, stop and tell the user it should be split further.

### 4) Start the TDD loop
For each behavior slice inside the issue:

#### Red
- Choose the smallest behavior that advances the issue.
- Write one failing automated test first.
- If the issue is docs/process/config work, define the smallest failing verification first (script, assertion, checklist-backed validation, or equivalent).
- Run the test/verification and confirm it fails for the right reason.

#### Green
- Make the minimum change required to pass.
- Avoid speculative work or adjacent cleanup.
- Re-run the relevant test/verification.

#### Refactor
- Clean up only after green.
- Keep behavior unchanged.
- Re-run tests after each cleanup step.

#### Repeat
- Continue one behavior at a time until the issue acceptance criteria are satisfied.

### 5) Validate the issue
Before completion:
- Run the relevant test set for the changed behavior.
- Run any broader required checks for the touched area.
- Confirm acceptance criteria are met.
- Confirm no sibling issue scope was accidentally implemented.
- Confirm constitution requirements were respected.

### 6) Finish the issue and stop
At completion:
- Summarize what was changed
- List touched files
- Note tests/verifications run
- Note any follow-up risks or observations
- Move the completed child issue to **Done**
- Post a concise progress comment to the parent issue for **every** completed child. Include at minimum:
  - child issue key and title
  - completion status
  - key changes
  - tests/verifications run
  - follow-up notes or risks
- If the issue cannot proceed because a human must take over or unblock it, move the child issue to **Review** instead of **Done** and explain the required human action in a comment
- If all sibling child issues under the same parent are now **Done**:
  - read the sibling child issues and available parent progress comments
  - add a final consolidated summary comment to the parent issue covering all completed child issues, key changes, verification run, and any follow-up notes
  - move the parent issue to **Review**
- **Stop here**

Then instruct the user to:
1. open a **new window/context** using the slash command
2. run the next unblocked issue with `/skill:ralph-loop ISSUE-KEY`

## Output Format

Use this structure during execution:

1. Issue summary
2. Scope lock
3. Current TDD slice
4. Red result
5. Green result
6. Refactor result
7. Completion summary
8. New-window handoff instruction

## Hard Guards

- If more than one issue is in active scope, stop.
- If the current issue is blocked, stop.
- If the current child issue is not in **Build Ready** when starting a fresh run, stop and ask for the workflow state to be corrected.
- If acceptance criteria require unrelated sibling work, stop and flag the issue structure problem.
- If you cannot produce a failing test/verification first, explain why and ask before proceeding.
- Never auto-roll into the next issue in the same session.

## Recommended Handoff Message

```text
Issue COA-112 is complete.
Open a new window/context, then run:
/skill:ralph-loop COA-113
```

## Relationship to Other Skills

- Use `to-prd` to turn discussion into a durable brief.
- Use `to-issues` to split the parent into thin execution slices.
- Use `tdd` inside this skill as the execution discipline.
- Use `code-reviewer` after implementation if a review pass is needed.

## Troubleshooting

**The issue is really a parent, not an execution slice**
- Stop and ask the user to select a child issue.

**The issue is blocked**
- If a dependency blocks the issue before work starts, stop and name the blocking issue.
- If implementation reaches a point where required human action is needed, move the child issue to **Review** and leave a comment describing exactly what the human must do.
- Do not treat a human-blocked child as complete for parent rollup purposes until the child is actually finished and moved to **Done**.

**The test-first step is unclear for documentation/process work**
- Define the smallest verification-first check that can fail before the change.

**The session is getting too broad**
- Re-lock scope to the issue. If needed, stop and ask for a split.
