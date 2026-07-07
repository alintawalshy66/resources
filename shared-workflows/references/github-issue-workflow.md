# GitHub Issue Workflow

This repository uses GitHub Issues as the execution source of truth.

## Core model

- A **parent issue** represents a feature, initiative, or larger unit of work.
- **Child issues** represent thin, independently executable vertical slices.
- Labels represent issue type, work type, execution mode, and workflow status.
- Milestones group the parent and child issues for a feature/release.
- GitHub Projects are intentionally out of scope for now.

## Required labels

### Type labels

- `type:parent` — issue is a parent/container issue.
- `type:child` — issue is an executable child/slice issue.

### Status labels

- `status:ready` — parent is ready but not actively watched/executed.
- `status:execute` — parent is active; Crosby watch mode may process child issues.
- `status:ready-to-build` — child is runnable by automation.
- `status:building` — child is currently claimed/in progress.
- `status:review` — child or parent needs human review/action.

Done/completed work is represented by the GitHub issue being **closed**. Do not use a `status:done` label.

### Execution mode labels

- `mode:afk` — automation may run this child when it is `status:ready-to-build`.
- `mode:hitl` — human-in-the-loop issue; defaults to `status:ready` or `status:review` rather than auto-run.

### Work type labels

- `wt:development`
- `wt:process-automation`

These labels route constitution checks for hard-gated skills.

### Optional routing labels

A label matching a local folder name may be used to route Crosby to the correct checkout. For example, if the local repo lives at `/home/walsc0/projects/dlhub`, add a `dlhub` label to the parent or child issue.

## Parent issue format

A parent issue should include a child issue checklist. The checklist is the canonical child order.

```markdown
## Child Issues

- [ ] #123 Build backend validation
- [ ] #124 Add frontend empty state
- [ ] #125 Add tests and verification
```

Recommended parent labels:

```text
type:parent
status:ready or status:execute
wt:development or wt:process-automation
<local-folder-label>
```

Recommended parent milestone: the feature/release milestone shared by all children.

## Child issue format

A child issue should link back to its parent:

```markdown
Parent: #122

## Scope
...

## Acceptance Criteria
- [ ] ...
```

Recommended child labels:

```text
type:child
status:ready-to-build or status:review
mode:afk or mode:hitl
wt:development or wt:process-automation
<local-folder-label>
```

Recommended child milestone: same milestone as the parent.

## Status transitions

| Workflow action | GitHub representation |
| --- | --- |
| Parent ready | Open with `status:ready` |
| Parent active/watchable | Open with `status:execute` |
| Child runnable | Open with `status:ready-to-build` |
| Child claimed/in progress | Open with `status:building` |
| Child needs human action | Open with `status:review` |
| Child complete | Closed |
| Parent ready for review | Open with `status:review` |
| Parent complete | Closed |

Only one child under a parent should have `status:building` at a time.

## Crosby expectations

Crosby expects:

1. Parent issues to have `type:parent`.
2. Watchable parent issues to have `status:execute`.
3. Child issues to have `type:child`.
4. Runnable children to have `status:ready-to-build`.
5. Parent issue body to contain child issue references like `#123`.
6. Done children to be closed.
7. Human-review children to be open with `status:review`.
8. Parent and children to share a milestone where possible.

## GitHub CLI examples

Fetch an issue:

```bash
gh issue view 123 --json number,title,body,state,labels,milestone,url,comments
```

Create a child issue:

```bash
gh issue create \
  --title "Add backend validation" \
  --body "Parent: #122\n\n## Scope\n..." \
  --label "type:child,status:ready-to-build,mode:afk,wt:development" \
  --milestone "my-feature"
```

Move a child to building:

```bash
gh issue edit 123 \
  --remove-label status:ready-to-build \
  --remove-label status:review \
  --add-label status:building
```

Move a child to review:

```bash
gh issue edit 123 \
  --remove-label status:ready-to-build \
  --remove-label status:building \
  --add-label status:review
```

Close a completed child:

```bash
gh issue close 123 --comment "Completed by automation."
```
