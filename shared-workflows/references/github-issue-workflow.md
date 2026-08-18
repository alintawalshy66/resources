# GitHub Issue Workflow

This repository uses GitHub Issues as the execution source of truth.

## Core model

- A **parent issue** represents a feature, initiative, or larger unit of work.
- Native GitHub **sub-issues** represent thin, independently executable vertical slices.
- Labels represent issue type, work type, execution mode, and workflow status.
- Milestones group the parent and sub-issues for a feature/release.
- GitHub Projects are intentionally out of scope for now.

## Required labels

### Type labels

- `type:parent` — issue is a parent/container issue.
- `type:child` — issue is an executable sub-issue/slice issue. Keep this label for Crosby compatibility even though the GitHub relationship is native sub-issues.

### Status labels

- `status:ready` — parent is ready but not actively watched/executed.
- `status:execute` — parent is active; Crosby watch mode may process sub-issues.
- `status:ready-to-build` — sub-issue is runnable by automation.
- `status:building` — sub-issue is currently claimed/in progress.
- `status:review` — sub-issue or parent needs human review/action.

Done/completed work is represented by the GitHub issue being **closed**. Do not use a `status:done` label.

### Execution mode labels

- `mode:afk` — automation may run this sub-issue when it is `status:ready-to-build`.
- `mode:hitl` — human-in-the-loop issue; defaults to `status:ready` or `status:review` rather than auto-run.

### Work type labels

- `wt:development`
- `wt:process-automation`

These labels route constitution checks for hard-gated skills.

### Optional routing labels

A label matching a local folder name may be used to route Crosby to the correct checkout. For example, if the local repo lives at `/home/walsc0/projects/dlhub`, add a `dlhub` label to the parent or sub-issue.

### Optional Pi worker overrides

A sub-issue may set a specific Pi model and/or reasoning effort for its worker:

- `model:<provider>/<model-id>` — e.g. `model:github-copilot/gpt-5.5`, `model:github-copilot/claude-opus-4.7`. Provider-qualified labels avoid Pi selecting an unavailable provider for a bare model name.
- `effort:<level>` — e.g. `effort:medium`, `effort:high`.

If either label is absent, the worker uses Pi's normal config default. Crosby does not validate the values; unknown IDs surface as Pi worker errors. When multiple `model:*` or `effort:*` labels are set on the same issue, the first one wins.

## Parent issue format

A parent issue should use GitHub's native sub-issue relationship for executable slices. A readable `## Sub-Issues` reference list may be included in the body, but the native sub-issue relationship is the source of truth.

```markdown
## Sub-Issues

- #123 Build backend validation
- #124 Add frontend empty state
- #125 Add tests and verification
```

Recommended parent labels:

```text
type:parent
status:ready or status:execute
wt:development or wt:process-automation
<local-folder-label>
```

Recommended parent milestone: the feature/release milestone shared by all sub-issues.

## Sub-issue format

A sub-issue should be attached to its parent with GitHub's native sub-issue relationship, not only a body reference.

```markdown
## Scope
...

## Acceptance Criteria
- [ ] ...
```

Recommended sub-issue labels:

```text
type:child
status:ready-to-build or status:review
mode:afk or mode:hitl
wt:development or wt:process-automation
<local-folder-label>
```

Recommended sub-issue milestone: same milestone as the parent.

## Status transitions

| Workflow action | GitHub representation |
| --- | --- |
| Parent ready | Open with `status:ready` |
| Parent active/watchable | Open with `status:execute` |
| Sub-issue runnable | Open with `status:ready-to-build` |
| Sub-issue claimed/in progress | Open with `status:building` |
| Sub-issue needs human action | Open with `status:review` |
| Sub-issue complete | Closed |
| Parent ready for review | Open with `status:review` |
| Parent complete | Closed |

Only one sub-issue under a parent should have `status:building` at a time.

## Crosby expectations

Crosby expects:

1. Parent issues to have `type:parent`.
2. Watchable parent issues to have `status:execute`.
3. Execution sub-issues to have `type:child`.
4. Runnable sub-issues to have `status:ready-to-build`.
5. Parent issues to have native GitHub sub-issues attached. Body references like `#123` are optional readability aids, not the source of truth.
6. Done sub-issues to be closed.
7. Human-review sub-issues to be open with `status:review`.
8. Parent and sub-issues to share a milestone where possible.

## GitHub CLI examples

Fetch an issue:

```bash
gh issue view 123 --json number,title,body,state,labels,milestone,url,comments
```

Create and attach a native sub-issue:

```bash
parent_id=$(gh issue view 122 --json id --jq .id)

sub_issue_url=$(gh issue create \
  --title "Add backend validation" \
  --body "## Scope\n..." \
  --label "type:child,status:ready-to-build,mode:afk,wt:development" \
  --milestone "my-feature")

sub_issue_id=$(gh issue view "$sub_issue_url" --json id --jq .id)

gh api graphql \
  -f query='mutation($parent:ID!, $subIssue:ID!) { addSubIssue(input: { issueId: $parent, subIssueId: $subIssue }) { issue { number } subIssue { number } } }' \
  -f parent="$parent_id" \
  -f subIssue="$sub_issue_id"
```

Move a sub-issue to building:

```bash
gh issue edit 123 \
  --remove-label status:ready-to-build \
  --remove-label status:review \
  --add-label status:building
```

Move a sub-issue to review:

```bash
gh issue edit 123 \
  --remove-label status:ready-to-build \
  --remove-label status:building \
  --add-label status:review
```

Close a completed sub-issue:

```bash
gh issue close 123 --comment "Completed by automation."
```
