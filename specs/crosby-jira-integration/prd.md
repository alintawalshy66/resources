# PRD: Crosby Jira Integration

## Execution Metadata

- Tracker: Jira
- Container Issue Type: Epic
- Crosby Execution: yes
- Child Work Type: Story

## Problem Statement

Crosby currently executes work from GitHub Issues. The planning skills now support Jira tracker context and can draft Jira-oriented work hierarchies, but Crosby cannot yet read, claim, execute, update, or summarize Jira issues.

The remaining work is to add a Jira integration layer to Crosby so the existing Crosby execution engine can operate against Jira containers and children in the same way it currently operates against GitHub parent issues and native sub-issues.

Without this integration, Jira PRDs and Jira issue hierarchies can be planned but cannot be run by Crosby.

## Solution

Add a tracker-aware Jira adapter for Crosby that maps Jira issues into Crosby's existing normalized queue shape and implements the same operations currently backed by GitHub:

- load a container issue and its child work
- fetch executable/watchable parent queues
- move issues through Crosby workflow states
- add progress/final-summary comments
- refresh queues after each child execution
- expose model/effort routing metadata to workers
- produce tracker-aware worker prompts that do not assume GitHub or `gh`

The core Crosby queue/execution logic should remain mostly tracker-neutral. Jira-specific behavior should live in an integration boundary that translates Jira CLI/API responses into Crosby's internal issue model.

## User Stories

1. As a user running Crosby on a Jira Epic, I want Crosby to discover child Stories so it can execute a feature build from Jira.
2. As a user running Crosby on a Jira Story, Bug, or Task, I want Crosby to discover Sub-tasks so small fixes and changes can still run through Crosby.
3. As a user, I want Crosby to move Jira issues through equivalent workflow states so Jira remains the execution source of truth.
4. As a user, I want Crosby to post progress and final summary comments back to Jira so the parent/container issue has an audit trail.
5. As a user, I want model and effort routing metadata from Jira to reach Crosby workers so backend/frontend work can use the intended models.
6. As a worker agent, I need tracker-aware prompts that tell me how to refresh/read Jira issues instead of telling me to use GitHub commands.
7. As a maintainer, I want the existing GitHub Issues behavior to keep working unchanged while Jira support is added.

## Implementation Decisions

- Keep Crosby's core execution engine centered on its existing normalized issue shape:
  - `identifier`
  - `title`
  - `description` / `body`
  - `url`
  - `state.name`
  - `state.type`
  - `labels`
  - `parent`
  - `children`
  - `comments`
  - `branchName`
- Add a Jira adapter layer rather than mixing Jira-specific logic into GitHub functions.
- The Jira adapter should implement Crosby operation seams equivalent to the current GitHub-backed operations:
  - `loadIssue`
  - `refreshQueue`
  - `fetchExecuteParentQueues`
  - `moveIssue`
  - `addComment`
- Jira hierarchy mapping:
  - Epic → Stories
  - Story → Sub-tasks
  - Bug → Sub-tasks
  - Task → Sub-tasks
- Crosby should continue requiring the invoked Jira container to have children when Crosby execution is enabled.
- Jira issue keys such as `PROJ-123` should be treated as Jira identifiers.
- Jira URLs such as `https://<domain>.atlassian.net/browse/PROJ-123` should resolve to the Jira key.
- Do not assume a concrete Jira CLI command until the Jira CLI/API is installed and inspected.
- Once the Jira tool exists, document/configure the command names, auth expectations, and JSON output mapping.
- Keep GitHub Issues support working as-is.
- Worker prompts must become tracker-aware. Jira runs must not instruct workers to run `gh issue view` or claim GitHub access assumptions.
- Status mapping must be configurable enough to match the Jira project's workflow names.
- Model/effort routing should use whichever Jira mechanism is available and agreed: labels, components, custom fields, or another configured field.

## Testing Decisions

- Add adapter-level tests using representative Jira CLI/API JSON fixtures once the Jira tool output is known.
- Test Jira reference parsing:
  - Jira key: `PROJ-123`
  - Jira URL: `https://<domain>.atlassian.net/browse/PROJ-123`
  - GitHub `#123` remains GitHub-specific when context is GitHub.
- Test Jira hierarchy loading:
  - Epic loads child Stories.
  - Story loads Sub-tasks.
  - Bug loads Sub-tasks.
  - Task loads Sub-tasks.
  - Container with no children fails with a clear Crosby recovery message.
- Test Jira status mapping:
  - ready/executable state maps to Crosby `Ready to Build` or equivalent.
  - claimed/in-progress state maps to `Building`.
  - review state maps to `Review`.
  - done/closed state maps to `Done`.
- Test issue transitions through the Jira adapter:
  - move child to Building
  - move child to Done
  - move child to Review
  - move parent/container to Review when complete
- Test comments through the Jira adapter:
  - per-child progress comment
  - final parent/container summary comment
- Test model/effort extraction from Jira metadata once the chosen storage mechanism is known.
- Regression-test the existing GitHub Crosby flow to confirm Jira changes do not alter GitHub behavior.

## Out of Scope

- Implementing Jira support before a Jira CLI/API is installed and its output is known.
- Changing the working GitHub Issues workflow beyond tracker-aware abstractions needed to preserve behavior.
- Replacing Crosby's core execution model.
- Designing a full Jira project workflow from scratch.
- Supporting arbitrary Jira custom workflows without configuration.
- Migrating existing GitHub issues into Jira.
- Creating Jira issues from `to-issues` without configured Jira access.

## Further Notes

The planning skills have already been updated to draft Jira-aware work:

- `grill-me` accepts tracker hints and Jira references.
- `to-prd` adds Jira execution metadata only when Jira is selected or inferred.
- `to-issues` understands Jira hierarchy rules.

Crosby still needs the runtime integration. The key technical risk is not the internal queue execution model; Crosby already handles parent/child and nested child queues. The key risk is the tracker boundary: reading Jira hierarchy, mapping statuses, moving issues, commenting, and making worker prompts tracker-aware.

Once the Jira CLI/API is installed, the first implementation step should be an investigation spike that captures exact commands and JSON shapes for:

- viewing an issue
- listing Epic children / Story children
- listing Sub-tasks
- transitioning issue status
- adding comments
- reading/writing labels or custom fields for model and effort routing
