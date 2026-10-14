---
name: to-issues
description: Break a plan, spec, or PRD into independently grabbable GitHub issues. Use when you need vertical slices, implementation tickets, or a clean execution sequence from higher-level planning.
---

# To Issues

Convert a plan, spec, or PRD into thin, vertical-slice native GitHub sub-issues that can be worked independently.

## When to Use

- A PRD, spec, or plan needs execution tickets.
- You want small, independently testable slices of work.
- You need dependencies made explicit.
- You want to avoid horizontal, layer-by-layer issue breakdowns.
- You want approved slices created as native GitHub sub-issues linked to an originating parent issue.
- You want Jira PRD metadata converted into the correct Jira hierarchy: Epic → Stories, or Story/Bug/Task → Sub-tasks.

## Core Principles

1. Prefer vertical slices that cut through the full stack.
2. Each issue should deliver a narrow, complete outcome.
3. Keep blocker relationships explicit in issue bodies and parent ordering.
4. Separate human-decision slices from buildable slices.
5. Prefer many thin issues over a few thick ones.
6. Treat GitHub Issues as the committed execution view, not the drafting surface.
7. Make AFK/buildable issues parallel-ready by giving Crosby a tight execution envelope: expected files, do-not-touch boundaries, test command, and advisory locks.
8. Keep AFK implementation test gates narrow: scoped tests prove each child slice, while broad/full-suite regression belongs in a dedicated post-AFK verification issue before final HITL/manual acceptance.
9. Never create GitHub sub-issues before explicit user approval.
10. If no parent issue exists, draft and create a parent issue from the approved context before creating sub-issues.
11. Do not change the working GitHub Issues flow when adding Jira support.
12. For Jira, follow explicit PRD execution metadata when present; do not infer a different hierarchy unless the metadata is missing or contradictory.

## Workflow

### 1) Gather the source material

- Read the plan, spec, or PRD.
- Identify the user stories and the minimum viable outcome.
- Resolve tracker context when present:
  - Explicit invocation hint wins: `jira`, `gh`, `github`, or `neutral`.
  - Jira URLs or keys such as `PROJ-123` infer Jira.
  - GitHub issue URLs or `#123` infer GitHub Issues.
  - Bare numbers infer GitHub only when repo context is explicit/unambiguous.
  - Existing PRD `Execution Metadata` may carry tracker context forward.
- If tracker context is Jira, use the Jira workflow below and do not apply GitHub creation steps.
- If tracker context is GitHub Issues or neutral/default, preserve the existing GitHub Issues workflow.
- When using GitHub Issues:
  - Resolve the originating GitHub parent issue from the current feature context.
  - If a parent issue exists, load the parent issue metadata needed for sub-issue creation:
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
    - parent body summarizing context, scope, constraints, and the planned native sub-issue list placeholder
    - parent labels: `type:parent`, `status:ready`, the appropriate work-type label (`wt:development` or `wt:process-automation`), and the Crosby local-folder routing label when any child is AFK/buildable
    - parent milestone, if one can be inferred confidently; otherwise leave the milestone unset and call that out
  - Present the drafted parent issue with the sub-issue list for approval before creating anything in GitHub.
  - If an existing parent issue is found but its labels/milestone cannot be loaded confidently, stop and ask the user before creating sub-issues.

### 2) Draft slices

- Break the work into independent vertical slices.
- Ensure each issue can be understood and tested alone.
- Label blocking dependencies clearly in the proposed issue body.
- Propose execution windows or grouping when useful.
- For every AFK/buildable issue, draft a Crosby execution envelope:
  - `## Expected Files` — files or directories the worker is expected to touch.
  - `## Do Not Touch` — files/directories that are explicitly out of scope.
  - `## Test Command` — the narrowest useful verification command for implementation children; broad/full-suite commands are reserved for explicit regression/integration verification issues.
  - `## Crosby Locks` — advisory file/directory/domain locks used to avoid launching conflicting sub-issues in parallel.

#### Crosby test-command discipline

For AFK/buildable implementation issues, `## Test Command` must be the narrowest useful verification command for that slice.

Reject broad full-suite commands for normal AFK implementation children when the issue changes feature code. Do not use broad commands such as:

```bash
pytest
python -m pytest
python3 -m pytest
npm test -- --run        # with no scoped file/path args
pnpm test                # with no scoped file/path args
yarn test                # with no scoped file/path args
```

as the primary child `## Test Command` unless the issue is explicitly a regression/integration verification issue.

Instead, propose scoped commands that verify only the affected module, endpoint, component, hook, helper, or integration path. Examples:

```bash
(cd backend && python3 -m pytest tests/test_specific_behavior.py -q)
(cd frontend && npm test -- --run src/pages/example/ExampleComponent.test.tsx src/pages/example/exampleHelper.test.ts)
```

Crosby executes the complete `## Test Command` block in one shell. When a block contains commands for multiple project directories, wrap each directory-scoped command in its own subshell so one `cd` does not affect the next command. Do not generate adjacent commands such as `cd backend && ...` followed by `cd frontend && ...` without subshells.

If full-suite confidence is required for a Crosby parent, create or propose a dedicated post-AFK regression verification issue after the last AFK implementation issue and before final HITL/manual testing. Do not push that full-suite burden into every implementation child.

#### Test-safe environment commands

When a repository requires test-safe environment overrides, bake those overrides directly into the issue's `## Test Command`. Do not rely on the worker shell, local `.env`, or developer machine defaults to already be test-safe.

Use this rule for both GitHub and Jira issue generation.

Generic pattern:

```bash
(cd <project-or-package> && ENV_FLAG_1=value ENV_FLAG_2=value <test command>)
```

Delivery Hub backend example:

```bash
cd backend && AUTH_MODE=disabled DATABASE_HEALTH_CHECK_ENABLED=false python3 -m pytest -q
```

Avoid bare commands when local `.env` values can alter auth mode, database health checks, external integrations, date-sensitive behavior, or other test contracts.

#### Post-AFK regression verification issue

For multi-child Crosby plans, when broad suite confidence is required, propose a dedicated AFK regression verification issue after the final AFK implementation child and before the final HITL/manual acceptance issue.

This issue should be explicitly labelled/scoped as verification, not feature delivery.

The regression issue should own broad commands such as full backend and frontend test suites. It should not introduce new planned feature work.

Suggested issue body shape:

```md
## Type
AFK verification

## Scope
Run the full automated regression suite after all AFK implementation tasks are complete.

No feature implementation is expected in this task. If failures are found:
- determine whether they are caused by the completed parent work
- fix in-scope regressions only when they are clearly attributable and small
- otherwise return review with a concise diagnosis and recommended follow-up

## Expected Files
- None, unless fixing an in-scope regression discovered by the suite

## Do Not Touch
- New feature scope not already delivered by prior child issues
- Unrelated refactors or cleanup

## Test Command
(cd backend && <full backend suite with test-safe env>)
(cd frontend && <full frontend suite>)

## Acceptance Criteria
- Full automated regression suite passes, or failures are clearly classified.
- Any fixed failures are demonstrably in-scope for this parent.
- Any unrelated/pre-existing failures are summarized with recommended follow-up.
- Crosby/Jira/GitHub comments contain concise summaries only, not full raw logs.
```

Example sequencing:

```text
AFK implementation child 1 -> scoped tests only
AFK implementation child 2 -> scoped tests only
AFK implementation child 3 -> scoped tests only
AFK regression verification -> full suites only, no feature work
HITL acceptance testing -> browser/stakeholder/manual verification
```

#### Crosby tracker comment hygiene

Generated issues must not require workers to paste full raw failing test output into Jira or GitHub comments.

For worker summaries, ask for concise diagnostics only:
- command run
- pass/fail status
- failing test file/name, when applicable
- short cause summary
- whether the failure appears in-scope, unrelated, or pre-existing
- recommended recovery

Long raw logs belong in the worker transcript, CI artifacts, local temporary files, or committed fixtures only when explicitly required. This avoids Jira/GitHub tracker comment size failures such as Jira `CONTENT_LIMIT_EXCEEDED`.

- If an AFK issue is too vague to name expected files, tests, and locks, mark it HITL or split/add an investigation issue first.
- Every AFK/buildable issue must include model routing and effort metadata using the tracker-appropriate mechanism:
  - GitHub: provider-qualified model label `model:<provider>/<model-id>` plus `effort:<thinking-level>`.
  - Jira: exactly one native Jira model component plus Jira-safe effort label such as `effort-medium`. Do not add `model-*` labels to new Jira issues.
- Use provider-qualified model labels only for GitHub; never use bare model names. For Jira, model routing is via native Components, and legacy Jira `model-*` labels are fallback only for older issues.
- Model-family routing must be reasoned about per issue, not assigned only from file extensions:
  - Backend/API/data/persistence/infrastructure work → OpenAI family.
  - Frontend/UI/component/interaction/design-system work → Anthropic Claude Opus family.
  - Full-stack issues should be split when practical so backend and frontend work can receive the correct model family.
  - If a full-stack issue cannot be split, choose the family based on the riskiest or largest part of the work and explain the decision.
- Exact Jira model component defaults:
  - Normal backend work → Jira component `OpenAI GPT-5.5`; normally `effort-medium`.
  - High-effort backend work → Jira component `OpenAI GPT-5.6 Luna`; normally `effort-high`.
  - Higher-risk backend work → Jira component `OpenAI GPT-5.6 Sol`; use `effort-medium` or lower and never exceed medium unless explicitly agreed in the conversation.
  - Frontend/UI work → an Anthropic Claude Opus component, normally `Anthropic Claude Opus 4.7`; do not route planned work to Claude Sonnet or Haiku components.
- Every AFK/buildable issue must include an effort label where the thinking level is one of Pi's supported thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
  - Use GitHub `effort:low` / Jira `effort-low` for mechanical, tightly scoped changes.
  - Use GitHub `effort:medium` / Jira `effort-medium` for normal implementation with some design judgement.
  - Use GitHub `effort:high` / Jira `effort-high` or above for architecture, security, migrations, concurrency, or broad cross-module work.
- HITL/manual issues may omit model routing unless a worker is expected to execute code, but should still include an effort label when the issue will guide later implementation.
- For GitHub Issues intended for Crosby execution, ensure the parent and every AFK/buildable child has exactly one local-folder routing label that matches the local checkout directory name, such as `dlhub` for `/home/walsc0/projects/dlhub`.
- Infer the routing label from an existing parent label or the current repository folder only when confident.
- If the routing label cannot be inferred, ask the user before creating issues.
- If multiple plausible local-folder routing labels are present, ask the user which one Crosby should use before creating issues.
- If a new GitHub model label or Jira model component mapping is proposed, verify or ask the user to verify it before issue creation with:

  ```bash
  pi --model <provider>/<model-id> --thinking <level> -p 'Reply OK'
  ```

### 2a) Jira hierarchy rules

Use this section only when tracker context is Jira.

- Read Jira PRD execution metadata when present:

  ```md
  ## Execution Metadata

  - Tracker: Jira
  - Container Issue Type: Epic | Story | Bug | Task
  - Crosby Execution: yes | no
  - Child Work Type: Story | Sub-task
  ```

- Jira hierarchy mapping:
  - `Container Issue Type: Epic` → create Jira Stories under the Epic.
  - `Container Issue Type: Story` → create Jira Sub-tasks under the Story.
  - `Container Issue Type: Bug` → create Jira Sub-tasks under the Bug.
  - `Container Issue Type: Task` → create Jira Sub-tasks under the Task.
- If `Crosby Execution: yes`, every Jira container must have child work:
  - Epic containers need one or more Stories.
  - Story/Bug/Task containers need one or more Sub-tasks.
- Standalone Jira Story/Bug/Task issues with no Sub-tasks are allowed only when `Crosby Execution: no` or the user explicitly requests manual/HITL/no-Crosby work.
- If Jira metadata is missing but Jira is selected, infer the container type from explicit language:
  - `Epic` — feature, initiative, capability, project, broad product build, or multi-story rollout.
  - `Story` — user-facing product behavior, small feature, enhancement, or single user outcome.
  - `Bug` — bug, defect, regression, broken behavior, error, or failure fix.
  - `Task` — internal tooling, workflow, documentation, maintenance, process, refactor, or chore work.
- If Jira metadata is ambiguous or contradictory, ask before creating anything.
- Use the configured Jira CLI/API for Jira reads and writes; do not assume a specific command name until Jira tooling is configured in the repo/environment.
- If Jira CLI/API operations fail, report the failure directly.

### 3) Review with the user

- Ask whether the granularity feels right.
- Ask whether dependencies are correct.
- Ask whether any slices should be merged or split.
- Ask whether execution windows or grouping should change.
- Do not create any tracker issues yet.

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
- If broad/full-suite confidence is required, show the dedicated post-AFK regression verification issue separately from the final HITL/manual acceptance issue.
- Explicitly ask for approval before creating anything in the selected tracker, including the parent/container issue when one does not already exist.

### 6) Create GitHub parent and native sub-issues after approval

Only after explicit user approval, create the approved issues in GitHub.

If no parent issue existed, create the parent first with `gh issue create`. The created parent should include:

- A feature/initiative title derived from the approved context.
- A body summarizing the source context, scope, constraints, and a `## Sub-Issues` placeholder to be updated after sub-issue creation when useful.
- Labels: `type:parent`, `status:ready`, the appropriate work-type label, and the Crosby local-folder routing label when any child is AFK/buildable.
- The inferred milestone, when one was approved.

Then create each approved execution issue and attach it to the parent as a **native GitHub sub-issue**.

Use `gh issue create` for each sub-issue, then immediately link it to the parent with GitHub's native sub-issue GraphQL mutation. Do not rely on a body-only `Parent: #<parent-number>` reference or a checklist as the parent/sub-issue relationship.

Each created sub-issue should include:

- Scope and acceptance criteria.
- Any blocker/dependency notes.
- For AFK/buildable implementation issues: `Expected Files`, `Do Not Touch`, scoped `Test Command`, and `Crosby Locks` sections.
- For dedicated AFK regression/integration verification issues: broad/full-suite `Test Command` is allowed, but the issue scope must state that it performs verification only and should not introduce new planned feature work.
- The same milestone as the parent, when present.
- Inherited parent labels required for execution, especially work-type and the Crosby local-folder routing label. AFK/buildable children must carry the routing label.
- Type/status/mode labels:
  - all executable sub-issues: `type:child` — keep this label for Crosby compatibility even though the GitHub relationship is a native sub-issue
  - AFK/buildable issues: `mode:afk`, `status:ready-to-build`
  - HITL/manual issues: `mode:hitl`, `status:ready` or `status:review`
  - work type: `wt:development` or `wt:process-automation`
  - required worker routing labels for AFK/buildable issues:
    - `model:github-copilot/gpt-5.5` for backend/API/data/persistence/infrastructure work
    - `model:github-copilot/claude-opus-4.7` for frontend/UI/component/interaction/design-system work
    - `effort:<thinking-level>` for Pi thinking level, where thinking level is `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`

Required worker routing guidance for AFK/buildable GitHub issues:

- Always include a provider-qualified `model:*` label and an `effort:*` label for GitHub.
- Always include the provider in GitHub model labels: `model:<provider>/<model-id>`.
- Never use bare model labels such as `model:gpt-5.5` or `model:claude-opus-4.7`.
- Split full-stack work when practical so backend and frontend issues can receive the correct model routing.
- Use `effort:low` for mechanical, tightly scoped changes.
- Use `effort:medium` for normal implementation with some design judgement.
- Reserve `effort:high`+ for high-risk architecture, security, data migration, concurrency, or broad cross-module work.
- Only use `effort:xhigh` or `effort:max` for exceptional high-risk work where the extra thinking cost/latency is justified.

For Jira AFK/buildable issues, use native Jira model components for model routing; do not create model labels.

Example:

```bash
parent_id=$(gh issue view 122 --json id --jq .id)

sub_issue_url=$(gh issue create \
  --title "Add backend validation" \
  --body "## Scope\n...\n\n## Expected Files\n- backend/app/validation.py\n- backend/tests/test_validation.py\n\n## Do Not Touch\n- frontend/\n- migrations/\n\n## Crosby Locks\n- backend/app/validation.py\n\n## Test Command\ncd backend && python3 -m pytest tests/test_validation.py -q\n\n## Acceptance Criteria\n- [ ] ..." \
  --label "type:child,status:ready-to-build,mode:afk,wt:development,model:github-copilot/gpt-5.5,effort:medium" \
  --milestone "my-feature")

sub_issue_id=$(gh issue view "$sub_issue_url" --json id --jq .id)

gh api graphql \
  -f query='mutation($parent:ID!, $subIssue:ID!) { addSubIssue(input: { issueId: $parent, subIssueId: $subIssue }) { issue { number } subIssue { number } } }' \
  -f parent="$parent_id" \
  -f subIssue="$sub_issue_id"
```

After creating the sub-issues:

- Add or update a parent comment containing the native sub-issue list in dependency order.
- If safely possible, update the parent issue body to include a `## Sub-Issues` reference list for readability, while keeping the native sub-issue relationship as the source of truth:

  ```markdown
  ## Sub-Issues

  - #123 Add backend validation
  - #124 Add frontend empty state
  ```

- Do not create a new parent issue when an existing parent was resolved.
- Verify the parent has `type:parent`, an appropriate status label, work-type label, the Crosby local-folder routing label when any child is AFK/buildable, and approved milestone.
- Verify each created issue is attached to the parent as a native GitHub sub-issue, and has the correct milestone, labels, routing label, and initial status label.
- If verification shows inherited labels were missed, add the missing labels; never remove existing labels unless the user explicitly requested removal.
- Report the created parent issue when applicable, plus sub-issue numbers, URLs, inherited milestone, inherited labels, mode labels, and initial status label/status value back to the user.

### 7) Create Jira container children after approval

Use this section only when tracker context is Jira.

Only after explicit user approval, create the approved Jira issues using the configured Jira CLI/API.

- If the approved container is an Epic:
  - Create approved child work as Jira Stories under the Epic.
  - Stories are executable leaves by default.
  - Create Sub-tasks under a Story only when that Story is itself too broad and needs nested execution slices.
- If the approved container is a Story, Bug, or Task:
  - Create approved child work as Jira Sub-tasks under that container.
  - If Crosby execution is enabled, create at least one Sub-task even for small bug/fix/change work.
- Preserve dependency ordering in Jira using native `Blocks` links when the configured Jira tooling supports it. The intended relationship is explicit: if issue A must finish before issue B, the final Jira relationship must render as `A blocks B` and `B is blocked by A`. The CLI example is:
  ```bash
  acli jira workitem link create --out A --in B --type Blocks --yes
  ```
  Do not reverse this relationship; the blocked issue must render as the inward/blocked side.
- **Jira REST direction warning:** Jira REST payload fields named `outwardIssue` and `inwardIssue` can render counterintuitively depending on the Jira tenant/API path. Do not treat a successful API response as proof that the dependency direction is correct. After creating each link, reload both issues and verify the user-visible/native relationship: issue A shows `blocks B`, and issue B shows `is blocked by A`. If the rendered direction is reversed, delete the link and recreate it with the API payload orientation that produces the correct native relationship before continuing.
- Apply the Jira issue type, parent relationship, native initial status, exactly one native model component for AFK/buildable issues, and routing metadata needed by Crosby.
- Jira workflow status is stored in Jira's native status field, not in labels. For WCSD, use:
  - `Backlog` for an unactivated Story/container or HITL work awaiting attention
  - `Ready to build` for an AFK/buildable Sub-task
  - `Building` while Crosby is executing the issue
  - `Review` when human review or recovery is required
  - `Done` when the work is complete
- Jira issue creation may require a create-then-transition sequence: create the issue with its type, parent, and `components: [{ id: <model-component-id> }]`, transition it to the intended initial status, then reload and verify the status and component.
- Resolve the WCSD component ID from the component name before creation; do not depend on a display-name-only label or silently create an unregistered component.
- If the configured Jira CLI cannot write components, use the configured Jira REST/API tool for creation rather than claiming the component was assigned. Do not substitute a model label for a missing component on new Jira issues.
- For Jira, use the native Jira issue type and parent relationship instead of `type-parent`/`type-child` labels. Keep non-status metadata labels such as `mode-afk`, `mode-hitl`, effort, work type, and local-folder routing.
- Every Jira AFK/buildable issue receives exactly one model component. Use the component as the human-visible model decision:
  - normal backend → `OpenAI GPT-5.5`
  - high-effort backend → `OpenAI GPT-5.6 Luna`
  - higher-risk backend → `OpenAI GPT-5.6 Sol`, capped at `effort-medium` unless explicitly agreed
  - frontend/UI → an `Anthropic Claude Opus ...` component
- Do not select Anthropic Sonnet or Haiku components for planned work.
- For Jira AFK/buildable implementation issues, use the same Crosby test-command discipline as GitHub:
  - implementation children get scoped `## Test Command`s
  - broad/full-suite commands are rejected unless the Jira issue is explicitly a regression/integration verification issue
  - when full-suite confidence is required, create/propose a dedicated post-AFK regression verification Jira child before the final HITL/manual Jira child
- For Jira metadata labels, use Jira-safe hyphenated names:
  - mode: `mode-afk` or `mode-hitl`
  - work type: `wt-development` or `wt-process-automation`
  - effort: `effort-off`, `effort-minimal`, `effort-low`, `effort-medium`, `effort-high`, `effort-xhigh`, or `effort-max`
  - local checkout routing label such as `dlhub`
- Do not write Jira workflow states, issue hierarchy/type, or model routing as labels. Do not use GitHub-only colon/slash label spellings such as `model:github-copilot/gpt-5.5` when writing Jira labels.
- A Jira container may include `Branch: branch-name` in its description when a specific feature branch is required; otherwise Crosby derives one from the Jira issue key and summary.
- Verify the created Jira children are attached to the intended container and have the intended type, native status, exactly one model component for AFK/buildable issues, and routing metadata.
- Report the created Jira container and child issue keys, URLs, child issue types, native status values, model components, and routing metadata back to the user.

## Output Format

If Jira is selected, first show:

- Proposed Jira container key or new container title
- Proposed Jira container issue type: Epic, Story, Bug, or Task
- Proposed Jira child issue type: Story or Sub-task
- Crosby Execution: yes or no

If a new GitHub parent issue is needed, first show:

- Proposed parent title
- Proposed parent body summary
- Proposed parent labels
- Proposed parent milestone, or `none` with reason

Use a numbered list where each proposed child work item includes:

- Title
- Tracker-specific issue type: GitHub native sub-issue, Jira Story, or Jira Sub-task
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
- Proposed labels/fields. For GitHub AFK/buildable issues, include the required Crosby local-folder routing label plus provider-qualified model and effort labels (`model:<provider>/<model-id>`, `effort:<thinking-level>`). For Jira, show metadata labels (`mode-*`, `wt-*`, `effort-*`, local routing), native initial status, and native model component separately; do not propose Jira model labels or `status-*` labels.

After approval and creation, also report:

- GitHub parent issue, including whether it was existing or newly created, when using GitHub Issues
- Created GitHub sub-issue numbers or Jira issue keys
- Created child issue URLs
- Created child milestone/version when applicable
- Created child inherited labels or Jira fields
- Created child mode labels/fields (`mode:afk` or `mode:hitl`) when applicable
- Created child initial status labels for GitHub, or native status values for Jira

## Quality Checks

- Is each issue independently valuable?
- Does each issue deliver a complete vertical slice?
- Are blockers minimal and realistic?
- Would the issue list support incremental delivery?
- Is each AFK/buildable implementation issue parallel-ready with expected files, do-not-touch boundaries, a narrow/scoped test command, and Crosby locks?
- Were broad/full-suite test commands rejected for normal implementation children and moved into a dedicated regression/integration verification issue when needed?
- Does any dedicated regression verification issue sit after the last AFK implementation child and before final HITL/manual acceptance?
- Do test commands include required test-safe environment overrides instead of relying on local `.env` defaults?
- Are vague or discovery-heavy items marked HITL or split into investigation-first issues instead of AFK parallel work?
- Does every AFK/buildable issue include a reasoned model-family choice, the required Jira model component when applicable, and an effort level? Backend work should use the OpenAI family; frontend/UI work should use the Anthropic Claude Opus family. Sol must not exceed medium effort without explicit conversational approval.
- Are the local planning artifacts still aligned with the approved issue breakdown?
- Has explicit user approval been captured before tracker issue creation?
- If no parent existed, is the proposed parent clear, labeled `type:parent`, assigned an appropriate status/work-type/routing label set, and approved before creation?
- For GitHub Issues with any AFK/buildable child, does the parent have exactly one Crosby local-folder routing label matching the intended checkout directory?
- Will every AFK/buildable GitHub sub-issue inherit the Crosby local-folder routing label plus the parent milestone and relevant labels?
- Will every created GitHub sub-issue receive the correct additive `mode:*` and `status:*` labels without replacing inherited labels?
- If Jira is selected, will every created issue receive the intended native initial status through a verified create-then-transition flow?
- Was every created execution issue attached to the parent with GitHub's native `addSubIssue` relationship when using GitHub Issues?
- If Jira is selected, did the issue hierarchy match the PRD metadata: Epic → Stories, or Story/Bug/Task → Sub-tasks?
- If Jira is selected, are metadata labels Jira-safe and limited to non-status/non-model metadata (`mode-afk`, `effort-medium`, `wt-development`, routing labels), is exactly one native model component assigned for AFK/buildable issues, and are workflow statuses represented by native Jira status values (`Backlog`, `Ready to build`, `Building`, `Review`, `Done`) rather than `status-*` labels?
- If Jira is selected, are issue type and parent relationships represented by Jira's native hierarchy rather than `type-parent`/`type-child` labels?
- If Jira Crosby execution is `yes`, does the Jira container have at least one child issue for Crosby to execute?
- Was inheritance and type/status/mode assignment verified after creation?
- Were every native Jira dependency link’s semantics verified after creation, with each intended `A blocks B` relationship confirmed from both A (`blocks B`) and B (`is blocked by A`) rather than only checking that a link exists?

## Troubleshooting

**Slices are too coarse**
- Split the work further by user value or capability.

**Slices are too thin to be useful**
- Merge slices until each one still delivers a complete behavior.

**Dependencies are unclear**
- Reorder the list and make blockers explicit.

**Execution windows changed the structure**
- Update `plan.md` and/or `tasks.md` before creating tracker issues.

**Parent GitHub issue cannot be resolved**
- Draft a new parent issue from the available context and include it in the approval request.
- If there is not enough context to draft a meaningful parent title, scope, labels, or milestone decision, ask the user for the missing details before creating anything.

**User has not explicitly approved the issue set**
- Do not create any GitHub issues.

**GitHub CLI fails**
- Tell the user to check `gh` installation/authentication and try again.

**Jira CLI/API fails**
- Report the Jira failure directly.
- Do not create partial hierarchy claims; clearly distinguish created/attached Jira issues from failed operations.

**Created issues landed with the wrong labels**
- Immediately correct the sub-issue labels based on tracker and type:
  - GitHub AFK → `type:child`, `mode:afk`, `status:ready-to-build`
  - GitHub HITL → `type:child`, `mode:hitl`, `status:ready` or `status:review`
  - Jira AFK → native `Sub-task` issue type, `mode-afk`, initial status `Ready to build`
  - Jira HITL → native `Sub-task` issue type, `mode-hitl`, initial status `Backlog` or `Review`
- Do not leave typed execution issues without a clear status label.

**Created issues did not inherit the parent milestone or labels**
- Immediately correct the sub-issues so they match the parent milestone and relevant labels.
- For AFK/buildable GitHub sub-issues, immediately add the Crosby local-folder routing label if it is missing.
- Use additive label commands (`gh issue edit <issue> --add-label <label>`) so existing labels are preserved.
- If the parent metadata or routing label could not be resolved confidently, stop and ask the user before creating additional sub-issues.

**Created issues were not attached as native sub-issues**
- Immediately link each created execution issue to the parent using the `addSubIssue` GraphQL mutation.
- If native sub-issue linking fails, report the created but unlinked issue numbers and ask the user how to proceed; do not represent them as complete sub-issues.
