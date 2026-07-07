---
name: to-issues
description: Break a plan, spec, or PRD into independently grabbable issues. Use when you need vertical slices, implementation tickets, or a clean execution sequence from higher-level planning.
---

# To Issues

Convert a plan or PRD into thin, vertical-slice Linear sub-issues that can be worked independently.

## When to Use

- A PRD, spec, or plan needs execution tickets
- You want small, independently testable slices of work
- You need dependencies made explicit
- You want to avoid horizontal, layer-by-layer issue breakdowns
- You want approved slices created as Linear child issues under the originating parent issue

## Core Principles

1. Prefer vertical slices that cut through the full stack.
2. Each issue should deliver a narrow, complete outcome.
3. Keep blocker relationships explicit.
4. Separate human-decision slices from buildable slices.
5. Prefer many thin issues over a few thick ones.
6. Treat Linear as the committed execution view, not the drafting surface.
7. Never create Linear sub-issues before explicit user approval.

## Workflow

### 1) Gather the source material
- Read the plan, spec, or PRD
- Identify the user stories and the minimum viable outcome
- Resolve the originating Linear parent issue from the current feature context
- Load the parent issue metadata needed for child creation, including:
  - parent issue key
  - parent project
  - parent labels
- Prefer raw Linear API verification for labels when the CLI `issue view` output is incomplete or suspect; do not assume the parent has no labels unless verified
- If the parent issue cannot be resolved confidently, or its project/labels cannot be loaded confidently, stop and ask the user

### 2) Draft slices
- Break the work into independent vertical slices
- Ensure each issue can be understood and tested alone
- Label blocking dependencies clearly
- Propose execution windows or grouping when useful

### 3) Review with the user
- Ask whether the granularity feels right
- Ask whether dependencies are correct
- Ask whether any slices should be merged or split
- Ask whether execution windows or grouping should change
- Do not create any Linear issues yet

### 4) Revise local planning artifacts if needed
- If approved changes materially affect sequencing, blockers, grouping, or scope, update the relevant local planning docs before publishing
- Typically update `plan.md` when implementation sequencing or dependency structure changes
- Update `tasks.md` when execution windows or grouped task boundaries are part of the agreed workflow
- Keep local planning artifacts aligned with the final approved issue structure

### 5) Finalize the issue list for approval
- Present the issue titles in dependency order
- Include the acceptance criteria for each issue
- Explicitly ask for approval before creating anything in Linear

### 6) Create Linear sub-issues after approval
- Only after explicit user approval, create the approved issues in Linear as child issues of the originating parent issue
- Use the Linear CLI to create each child issue under the existing parent
- Every created child must inherit the parent context:
  - same Linear project as the parent
  - same labels as the parent, unless the user explicitly asked for deviations
- Add the execution-type label to each child in addition to inherited labels:
  - `AFK` issues → add `AFK` label
  - `HITL` issues → add `HITL` label
- Label handling must be additive, not replacing:
  - Preserve all existing/inherited parent labels
  - Add `AFK`/`HITL` as an extra label
  - If the Linear CLI `--label`/`issue update --label` behavior is ambiguous or may replace labels, create the issue first and then use `linear issue label add <issue> <label>` for each missing inherited/type label
- Set the initial Linear state when creating each child issue:
  - `AFK` issues → `Ready to Build`
  - `HITL` issues → `Backlog`
- Do not leave the initial state to Linear defaults when the issue type is known
- Do not create a new parent issue
- After creation, verify each child landed under the correct parent, project, labels, type label, and initial state
- If verification shows any inherited labels were missed or replaced, immediately re-add the missing labels; never remove existing labels unless the user explicitly requested removal
- Report the created issue keys, URLs, inherited project, inherited labels, type labels, and initial states back to the user

## Output Format

Use a numbered list where each proposed issue includes:

- Title
- Type: HITL or AFK
- Blocked by
- Execution window / grouping (if applicable)
- User stories covered
- Acceptance criteria

After approval and creation, also report:

- Linear parent issue
- Created child issue keys
- Created child issue URLs
- Created child inherited project
- Created child inherited labels
- Created child type labels (`AFK` or `HITL`)
- Created child initial states

## Quality Checks

- Is each issue independently valuable?
- Does each issue deliver a complete vertical slice?
- Are blockers minimal and realistic?
- Would the issue list support incremental delivery?
- Are the local planning artifacts still aligned with the approved issue breakdown?
- Has explicit user approval been captured before Linear creation?
- Will every created child inherit the parent project and labels?
- Will every created child receive the correct additive `AFK` or `HITL` label without replacing inherited labels?
- Was that inheritance and type-label assignment verified after creation?

## Troubleshooting

**Slices are too coarse**
- Split the work further by user value or capability.

**Slices are too thin to be useful**
- Merge slices until each one still delivers a complete behavior.

**Dependencies are unclear**
- Reorder the list and make blockers explicit.

**Execution windows changed the structure**
- Update `plan.md` and/or `tasks.md` before creating Linear issues.

**Parent Linear issue cannot be resolved**
- Stop and ask the user to provide or confirm the parent issue key.

**User has not explicitly approved the issue set**
- Do not create any Linear issues.

**Linear CLI fails**
- Tell the user to check Linear CLI authentication and try again.

**Created issues landed in the wrong default state**
- Re-run creation or immediately correct the child issue states based on type:
  - `AFK` → `Ready to Build`
  - `HITL` → `Backlog`
- Do not leave typed execution issues in an unintended default workflow state.

**Created issues did not inherit the parent labels or project**
- Immediately correct the child issues so they match the parent project and labels.
- Use additive label commands such as `linear issue label add <issue> <label>` so existing labels are preserved.
- If the parent metadata could not be resolved confidently, stop and ask the user before creating additional children.

**Adding AFK/HITL labels removed existing labels**
- Treat this as an error.
- Re-fetch the parent labels using Linear API if needed.
- Re-add all missing inherited labels to the affected children.
- Keep the new `AFK`/`HITL` label as well.
- Do not use any label command that replaces the full label set unless explicitly asked by the user.
