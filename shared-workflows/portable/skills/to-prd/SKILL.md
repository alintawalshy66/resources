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

## Core Principles

1. Synthesize from existing context; do not re-interview unless a critical gap blocks progress.
2. Write the PRD around user outcomes, not implementation trivia.
3. Keep the document specific enough to guide design and planning.
4. Include testable user stories and clear out-of-scope boundaries.
5. Avoid tool-specific assumptions unless the environment requires them.

## Workflow

### 1) Gather context
- Read the current conversation
- Inspect the codebase if needed for constraints or patterns
- Identify the user problem and the desired outcome

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

## Output Format

Use a PRD with these sections:

- Problem Statement
- Solution
- User Stories
- Implementation Decisions
- Testing Decisions
- Out of Scope
- Further Notes

## Quality Checks

- Does the PRD explain the user problem clearly?
- Are the stories ordered by priority and value?
- Are the decisions specific enough to guide design?
- Is the scope boundary explicit?
- Would another tool or person understand what comes next?

## Troubleshooting

**Context is incomplete**
- Ask one focused question instead of guessing.

**The PRD is too vague**
- Tighten the user stories and decisions.

**The PRD is too technical**
- Remove implementation details and keep the product level view.
