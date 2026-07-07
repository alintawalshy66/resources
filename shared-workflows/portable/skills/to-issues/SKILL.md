---
name: to-issues
description: Break a plan, spec, or PRD into independently grabbable GitHub issues. Use when you need vertical slices, implementation tickets, or a clean execution sequence from higher-level planning.
---

# To Issues

Convert a plan, spec, or PRD into thin, vertical-slice GitHub child issues that can be worked independently.

## When to Use

- A PRD, spec, or plan needs execution tickets.
- You want small, independently testable slices of work.
- You need dependencies made explicit.
- You want to avoid horizontal, layer-by-layer issue breakdowns.
- You want approved slices created as GitHub child issues linked to an originating parent issue.

## Core Principles

1. Prefer vertical slices that cut through the full stack.
2. Each issue should deliver a narrow, complete outcome.
3. Keep blocker relationships explicit in issue bodies and parent ordering.
4. Separate human-decision slices from buildable slices.
5. Prefer many thin issues over a few thick ones.
6. Treat GitHub Issues as the committed execution view, not the drafting surface.
7. Never create GitHub child issues before explicit user approval.

## Workflow

### 1) Gather the source material

- Read the plan, spec, or PRD.
- Identify the user stories and the minimum viable outcome.
- Resolve the originating GitHub parent issue from the current feature context.
- Load the parent issue metadata needed for child creation:
  - parent issue number or URL
  - parent title/body
  - parent labels
  - parent milestone, if any
- Use GitHub CLI when available:

  ```bash
  gh issue view <PARENT> --json number,title,body,state,labels,milestone,url
  ```

- If the parent issue cannot be resolved confidently, or its labels/milestone cannot be loaded confidently, stop and ask the user.

### 2) Draft slices

- Break the work into independent vertical slices.
- Ensure each issue can be understood and tested alone.
- Label blocking dependencies clearly in the proposed issue body.
- Propose execution windows or grouping when useful.

### 3) Review with the user

- Ask whether the granularity feels right.
- Ask whether dependencies are correct.
- Ask whether any slices should be merged or split.
- Ask whether execution windows or grouping should change.
- Do not create any GitHub issues yet.

### 4) Revise local planning artifacts if needed

- If approved changes materially affect sequencing, blockers, grouping, or scope, update the relevant local planning docs before publishing.
- Typically update `plan.md` when implementation sequencing or dependency structure changes.
- Update `tasks.md` when execution windows or grouped task boundaries are part of the agreed workflow.
- Keep local planning artifacts aligned with the final approved issue structure.

### 5) Finalize the issue list for approval

- Present the issue titles in dependency order.
- Include the acceptance criteria for each issue.
- Include proposed labels for each issue.
- Explicitly ask for approval before creating anything in GitHub.

### 6) Create GitHub child issues after approval

Only after explicit user approval, create the approved issues in GitHub as child issues linked to the originating parent issue.

Use `gh issue create` for each child. Each created child should include:

- `Parent: #<parent-number>` in the body.
- Scope and acceptance criteria.
- Any blocker/dependency notes.
- The same milestone as the parent, when present.
- Inherited parent labels where appropriate, especially work-type and local-folder routing labels.
- Type/status/mode labels:
  - all children: `type:child`
  - AFK/buildable issues: `mode:afk`, `status:ready-to-build`
  - HITL/manual issues: `mode:hitl`, `status:ready` or `status:review`
  - work type: `wt:development` or `wt:process-automation`

Example:

```bash
gh issue create \
  --title "Add backend validation" \
  --body "Parent: #122\n\n## Scope\n...\n\n## Acceptance Criteria\n- [ ] ..." \
  --label "type:child,status:ready-to-build,mode:afk,wt:development" \
  --milestone "my-feature"
```

After creating the children:

- Add or update a parent comment containing the child issue list in dependency order.
- If safely possible, update the parent issue body to include a `## Child Issues` checklist:

  ```markdown
  ## Child Issues

  - [ ] #123 Add backend validation
  - [ ] #124 Add frontend empty state
  ```

- Do not create a new parent issue.
- Verify each child has the correct parent reference, milestone, labels, and initial status label.
- If verification shows inherited labels were missed, add the missing labels; never remove existing labels unless the user explicitly requested removal.
- Report the created issue numbers, URLs, inherited milestone, inherited labels, mode labels, and initial status labels back to the user.

## Output Format

Use a numbered list where each proposed issue includes:

- Title
- Type: HITL or AFK
- Blocked by
- Execution window / grouping, if applicable
- User stories covered
- Acceptance criteria
- Proposed labels

After approval and creation, also report:

- GitHub parent issue
- Created child issue numbers
- Created child issue URLs
- Created child milestone
- Created child inherited labels
- Created child mode labels (`mode:afk` or `mode:hitl`)
- Created child initial status labels

## Quality Checks

- Is each issue independently valuable?
- Does each issue deliver a complete vertical slice?
- Are blockers minimal and realistic?
- Would the issue list support incremental delivery?
- Are the local planning artifacts still aligned with the approved issue breakdown?
- Has explicit user approval been captured before GitHub issue creation?
- Will every created child inherit the parent milestone and relevant labels?
- Will every created child receive the correct additive `mode:*` and `status:*` labels without replacing inherited labels?
- Was inheritance and type/status/mode assignment verified after creation?

## Troubleshooting

**Slices are too coarse**
- Split the work further by user value or capability.

**Slices are too thin to be useful**
- Merge slices until each one still delivers a complete behavior.

**Dependencies are unclear**
- Reorder the list and make blockers explicit.

**Execution windows changed the structure**
- Update `plan.md` and/or `tasks.md` before creating GitHub issues.

**Parent GitHub issue cannot be resolved**
- Stop and ask the user to provide or confirm the parent issue number or URL.

**User has not explicitly approved the issue set**
- Do not create any GitHub issues.

**GitHub CLI fails**
- Tell the user to check `gh` installation/authentication and try again.

**Created issues landed with the wrong labels**
- Immediately correct the child issue labels based on type:
  - AFK → `type:child`, `mode:afk`, `status:ready-to-build`
  - HITL → `type:child`, `mode:hitl`, `status:ready` or `status:review`
- Do not leave typed execution issues without a clear status label.

**Created issues did not inherit the parent milestone or labels**
- Immediately correct the child issues so they match the parent milestone and relevant labels.
- Use additive label commands (`gh issue edit <issue> --add-label <label>`) so existing labels are preserved.
- If the parent metadata could not be resolved confidently, stop and ask the user before creating additional children.
