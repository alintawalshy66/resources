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
7. Make AFK/buildable issues parallel-ready by giving Crosby a tight execution envelope: expected files, do-not-touch boundaries, test command, and advisory locks.
8. Never create GitHub child issues before explicit user approval.
9. If no parent issue exists, draft and create a parent issue from the approved context before creating children.

## Workflow

### 1) Gather the source material

- Read the plan, spec, or PRD.
- Identify the user stories and the minimum viable outcome.
- Resolve the originating GitHub parent issue from the current feature context.
- If a parent issue exists, load the parent issue metadata needed for child creation:
  - parent issue number or URL
  - parent title/body
  - parent labels
  - parent milestone, if any
- Use GitHub CLI when available:

  ```bash
  gh issue view <PARENT> --json number,title,body,state,labels,milestone,url
  ```

- If no parent issue can be resolved confidently, draft a parent issue from the source context instead of stopping:
  - parent title that captures the feature/initiative
  - parent body summarizing context, scope, constraints, and the planned child checklist placeholder
  - parent labels: `type:parent`, `status:ready`, the appropriate work-type label (`wt:development` or `wt:process-automation`), and any justified local-folder routing label
  - parent milestone, if one can be inferred confidently; otherwise leave the milestone unset and call that out
- Present the drafted parent issue with the child issue list for approval before creating anything in GitHub.
- If an existing parent issue is found but its labels/milestone cannot be loaded confidently, stop and ask the user before creating children.

### 2) Draft slices

- Break the work into independent vertical slices.
- Ensure each issue can be understood and tested alone.
- Label blocking dependencies clearly in the proposed issue body.
- Propose execution windows or grouping when useful.
- For every AFK/buildable issue, draft a Crosby execution envelope:
  - `## Expected Files` — files or directories the worker is expected to touch.
  - `## Do Not Touch` — files/directories that are explicitly out of scope.
  - `## Test Command` — the narrowest useful verification command.
  - `## Crosby Locks` — advisory file/directory/domain locks used to avoid launching conflicting children in parallel.
- If an AFK issue is too vague to name expected files, tests, and locks, mark it HITL or split/add an investigation issue first.
- Every AFK/buildable issue must include both:
  - a provider-qualified model label: `model:<provider>/<model-id>`
  - an effort/thinking label: `effort:<thinking-level>`
- Use provider-qualified model labels only; never use bare model names.
- Default model routing:
  - Backend/API/data/persistence/infrastructure work → `model:github-copilot/gpt-5.5`
  - Frontend/UI/component/interaction/design-system work → `model:github-copilot/claude-opus-4.7`
  - Full-stack issues should be split when practical so backend and frontend work can receive the correct model routing.
  - If a full-stack issue cannot be split, choose the model based on the riskiest or largest part of the work and call out the reason in the proposed labels.
- Every AFK/buildable issue must include an `effort:<thinking-level>` label where `<thinking-level>` is one of Pi's supported thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
  - Use `effort:low` for mechanical, tightly scoped changes.
  - Use `effort:medium` for normal implementation with some design judgement.
  - Use `effort:high` or above for architecture, security, migrations, concurrency, or broad cross-module work.
- HITL/manual issues may omit model labels unless a worker is expected to execute code, but should still include an effort label when the issue will guide later implementation.
- If a model label is proposed, verify or ask the user to verify it before issue creation with:

  ```bash
  pi --model <provider>/<model-id> --thinking <level> -p 'Reply OK'
  ```

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

- If a new parent is needed, present the proposed parent title, body summary, labels, and milestone decision.
- Present the issue titles in dependency order.
- Include the acceptance criteria for each issue.
- Include proposed labels for each issue.
- Explicitly ask for approval before creating anything in GitHub, including the parent issue when one does not already exist.

### 6) Create GitHub parent and child issues after approval

Only after explicit user approval, create the approved issues in GitHub.

If no parent issue existed, create the parent first with `gh issue create`. The created parent should include:

- A feature/initiative title derived from the approved context.
- A body summarizing the source context, scope, constraints, and a `## Child Issues` placeholder to be updated after child creation.
- Labels: `type:parent`, `status:ready`, the appropriate work-type label, and any justified local-folder routing label.
- The inferred milestone, when one was approved.

Then create the approved child issues linked to the parent issue.

Use `gh issue create` for each child. Each created child should include:

- `Parent: #<parent-number>` in the body.
- Scope and acceptance criteria.
- Any blocker/dependency notes.
- For AFK/buildable issues: `Expected Files`, `Do Not Touch`, `Test Command`, and `Crosby Locks` sections.
- The same milestone as the parent, when present.
- Inherited parent labels where appropriate, especially work-type and local-folder routing labels.
- Type/status/mode labels:
  - all children: `type:child`
  - AFK/buildable issues: `mode:afk`, `status:ready-to-build`
  - HITL/manual issues: `mode:hitl`, `status:ready` or `status:review`
  - work type: `wt:development` or `wt:process-automation`
  - required worker routing labels for AFK/buildable issues:
    - `model:github-copilot/gpt-5.5` for backend/API/data/persistence/infrastructure work
    - `model:github-copilot/claude-opus-4.7` for frontend/UI/component/interaction/design-system work
    - `effort:<thinking-level>` for Pi thinking level, where thinking level is `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`

Required worker routing guidance for AFK/buildable issues:

- Always include a provider-qualified `model:*` label and an `effort:*` label.
- Always include the provider in model labels: `model:<provider>/<model-id>`.
- Never use bare model labels such as `model:gpt-5.5` or `model:claude-opus-4.7`.
- Use `model:github-copilot/gpt-5.5` for backend/API/data/persistence/infrastructure work.
- Use `model:github-copilot/claude-opus-4.7` for frontend/UI/component/interaction/design-system work.
- Split full-stack work when practical so backend and frontend issues can receive the correct model routing.
- Use `effort:low` for mechanical, tightly scoped changes.
- Use `effort:medium` for normal implementation with some design judgement.
- Reserve `effort:high`+ for high-risk architecture, security, data migration, concurrency, or broad cross-module work.
- Only use `effort:xhigh` or `effort:max` for exceptional high-risk work where the extra thinking cost/latency is justified.

Example:

```bash
gh issue create \
  --title "Add backend validation" \
  --body "Parent: #122\n\n## Scope\n...\n\n## Expected Files\n- backend/app/validation.py\n- backend/app/tests/test_validation.py\n\n## Do Not Touch\n- frontend/\n- migrations/\n\n## Crosby Locks\n- backend/app/validation.py\n\n## Test Command\npytest backend/app/tests/test_validation.py\n\n## Acceptance Criteria\n- [ ] ..." \
  --label "type:child,status:ready-to-build,mode:afk,wt:development,model:github-copilot/gpt-5.5,effort:medium" \
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

- Do not create a new parent issue when an existing parent was resolved.
- Verify the parent has `type:parent`, an appropriate status label, work-type label, optional routing label, and approved milestone.
- Verify each child has the correct parent reference, milestone, labels, and initial status label.
- If verification shows inherited labels were missed, add the missing labels; never remove existing labels unless the user explicitly requested removal.
- Report the created parent issue when applicable, plus child issue numbers, URLs, inherited milestone, inherited labels, mode labels, and initial status labels back to the user.

## Output Format

If a new parent issue is needed, first show:

- Proposed parent title
- Proposed parent body summary
- Proposed parent labels
- Proposed parent milestone, or `none` with reason

Use a numbered list where each proposed child issue includes:

- Title
- Type: HITL or AFK
- Blocked by
- Execution window / grouping, if applicable
- Parallel readiness: ready / not ready, with reason
- User stories covered
- Scope
- Expected files (AFK required)
- Do not touch (AFK required)
- Crosby locks (AFK required)
- Test command (AFK required)
- Acceptance criteria
- Proposed labels, including required provider-qualified `model:<provider>/<model-id>` and `effort:<thinking-level>` labels for AFK/buildable issues

After approval and creation, also report:

- GitHub parent issue, including whether it was existing or newly created
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
- Is each AFK/buildable issue parallel-ready with expected files, do-not-touch boundaries, a narrow test command, and Crosby locks?
- Are vague or discovery-heavy items marked HITL or split into investigation-first issues instead of AFK parallel work?
- Does every AFK/buildable issue include provider-qualified `model:*` and `effort:*` labels, with backend work routed to `model:github-copilot/gpt-5.5` and frontend work routed to `model:github-copilot/claude-opus-4.7`?
- Are the local planning artifacts still aligned with the approved issue breakdown?
- Has explicit user approval been captured before GitHub issue creation?
- If no parent existed, is the proposed parent clear, labeled `type:parent`, assigned an appropriate status/work-type/routing label set, and approved before creation?
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
- Draft a new parent issue from the available context and include it in the approval request.
- If there is not enough context to draft a meaningful parent title, scope, labels, or milestone decision, ask the user for the missing details before creating anything.

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
