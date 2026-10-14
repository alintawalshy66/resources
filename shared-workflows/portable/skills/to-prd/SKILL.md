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
- When noting labels for downstream Jira issue creation, use Jira-safe hyphenated Crosby metadata labels, not GitHub-only colon/slash labels:
  - mode: `mode-afk` or `mode-hitl`
  - work type: `wt-development` or `wt-process-automation`
  - effort: `effort-off`, `effort-minimal`, `effort-low`, `effort-medium`, `effort-high`, `effort-xhigh`, or `effort-max`
  - local checkout routing label, e.g. `dlhub`
- Do not use Jira labels for workflow status, issue hierarchy, or model routing. Jira workflow status uses native Jira status values; issue type and parent/child relationships use native Jira fields; model routing uses native Jira Components.
- Jira model components are the model-routing source:
  - normal backend/API/data work → `OpenAI GPT-5.5`
  - high-effort backend work → `OpenAI GPT-5.6 Luna` with `effort-high`
  - higher-risk backend work → `OpenAI GPT-5.6 Sol` with `effort-medium` or lower; never above `effort-medium` unless explicitly agreed in the conversation
  - frontend/UI work → an Anthropic Claude Opus component, normally `Anthropic Claude Opus 4.7`
- Keep Anthropic routing within the Claude Opus family; do not select Claude Sonnet or Haiku components for planned work.
- Do not add model compatibility labels such as `model-github-copilot-gpt-5.5` to new Jira issues. Those labels are legacy fallback only; new Jira work should have exactly one recognized model component when AFK/buildable.
- Include a `Branch: branch-name` note only when a specific branch is required; otherwise Crosby derives the Jira parent/container feature branch from the Jira issue key and summary.

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
- Model Family Policy: OpenAI for backend/data/infrastructure; Anthropic Claude Opus for frontend/UI
- Model Component Policy: OpenAI GPT-5.5 normally; GPT-5.6 Luna for high-effort work; GPT-5.6 Sol for higher-risk work capped at medium effort unless explicitly agreed; Claude Opus for frontend/UI
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
- If Jira labels are mentioned for downstream execution, are they limited to current Jira-safe metadata labels such as `mode-afk`, `wt-development`, `effort-medium`, and the local checkout routing label rather than workflow/status, type, parent/child, or model labels?
- If Jira model routing is included, does the PRD distinguish the OpenAI backend family from the Anthropic Claude Opus frontend family and record the approved native Jira component/effort policy?

## Troubleshooting

**Context is incomplete**
- Ask one focused question instead of guessing.

**The PRD is too vague**
- Tighten the user stories and decisions.

**The PRD is too technical**
- Remove implementation details and keep the product level view.
