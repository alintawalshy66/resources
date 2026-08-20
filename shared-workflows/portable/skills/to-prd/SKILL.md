---
name: to-prd
description: Turn the current conversation context into a PRD. Use when you have enough discussion and want a clear product brief that captures the problem, solution, stories, decisions, testing, and out-of-scope items.
---

# To PRD

Synthesize the current context into a focused PRD that a developer or agent can execute against.

## When to Use

- A feature has been discussed and needs a written PRD
- You want to convert conversation context into a durable brief
- The user wants planning before implementation
- You need a reusable product document that is tool-neutral
- You want to carry tracker context from a grilling or planning session into downstream issue creation

## Core Principles

1. Synthesize from existing context; do not re-interview unless a critical gap blocks progress.
2. Write the PRD around user outcomes, not implementation trivia.
3. Keep the document specific enough to guide design and planning.
4. Include testable user stories and clear out-of-scope boundaries.
5. Avoid tool-specific assumptions unless the environment requires them.
6. Do not change the existing GitHub Issues workflow when adding tracker metadata for Jira.
7. Include Jira execution metadata only when Jira is explicitly selected or clearly inferred.

## Workflow

### 1) Gather context
- Read the current conversation
- Inspect the codebase if needed for constraints or patterns
- Identify the user problem and the desired outcome
- Resolve tracker context when present:
  - Explicit invocation hint wins: `jira`, `gh`, `github`, or `neutral`.
  - Jira URLs or keys such as `PROJ-123` infer Jira.
  - GitHub issue URLs or `#123` infer GitHub Issues.
  - Bare numbers infer GitHub only when repo context is explicit/unambiguous.
  - Existing grilling summary context or PRD metadata may carry tracker context forward.
- Keep the PRD tracker-neutral unless Jira is explicitly selected or clearly inferred.

### 2) Define the problem and solution
- State the user-facing problem
- Describe the intended solution at a product level

### 3) Write user stories
- List the primary journeys in priority order
- Make each story independently understandable
- Keep the stories framed in user value language

### 4) Capture implementation decisions
- Note the major modules, interfaces, or contracts that matter
- Keep this at a decision level, not a code-path level

### 5) Capture testing decisions
- Describe the behaviors that should be verified
- Call out important success and failure cases

### 6) Mark out of scope
- Define what is intentionally not being solved now

### 7) Add Jira execution metadata when Jira is selected
- Only add this metadata block when tracker context is Jira.
- Do not add this block for existing GitHub Issues flows unless the user explicitly asks for new metadata.
- Default `Crosby Execution` to `yes` unless the user explicitly says manual, HITL-only, no-Crosby, planning-only, standalone, or no executable children.
- Classify `Container Issue Type` from explicit language first, then validate by scope:
  - `Epic` — feature, initiative, capability, project, broad product build, or multi-story rollout.
  - `Story` — user-facing product behavior, small feature, enhancement, or single user outcome.
  - `Bug` — bug, defect, regression, broken behavior, error, or failure fix.
  - `Task` — internal tooling, workflow, documentation, maintenance, process, refactor, or chore work.
- Ask only when the container issue type is ambiguous.
- Set `Child Work Type` from the container:
  - `Epic` → `Story`
  - `Story`, `Bug`, or `Task` → `Sub-task`
- For Jira Crosby execution, every container must have child work:
  - Epic containers need one or more Stories.
  - Story/Bug/Task containers need one or more Sub-tasks.

## Output Format

Use a PRD with these sections by default:

- Problem Statement
- Solution
- User Stories
- Implementation Decisions
- Testing Decisions
- Out of Scope
- Further Notes

When Jira is selected or inferred, add this section near the top of the PRD:

```md
## Execution Metadata

- Tracker: Jira
- Container Issue Type: Epic | Story | Bug | Task
- Crosby Execution: yes | no
- Child Work Type: Story | Sub-task
```

Do not add Jira execution metadata for tracker-neutral or existing GitHub Issues flows unless explicitly requested.

## Quality Checks

- Does the PRD explain the user problem clearly?
- Are the stories ordered by priority and value?
- Are the decisions specific enough to guide design?
- Is the scope boundary explicit?
- Would another tool or person understand what comes next?
- If Jira is selected, does the PRD include Jira execution metadata with a clear container type and child work type?
- If Jira Crosby execution is `yes`, will the selected container type produce child work for Crosby to execute?

## Troubleshooting

**Context is incomplete**
- Ask one focused question instead of guessing.

**The PRD is too vague**
- Tighten the user stories and decisions.

**The PRD is too technical**
- Remove implementation details and keep the product level view.
