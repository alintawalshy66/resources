---
name: grill-me
description: Interview the user relentlessly about a plan or design until every branch of the decision tree is resolved. Use when you want to stress-test a plan, get grilled on a design, or need shared understanding before implementation.
---

# Grill Me

Interview the user relentlessly about a plan or design until shared understanding is reached.

## When to Use

- The user wants to stress-test an idea or plan
- You need to resolve branching design decisions before implementation
- The user asks to be grilled on a proposal
- The plan has ambiguity that should be resolved before coding
- The user invokes the skill with a Linear issue key such as `grill-me COA-96`

## Core Principles

1. Ask one question at a time.
2. Walk the decision tree from the top down.
3. Resolve dependencies between decisions before moving on.
4. For each question, provide your recommended answer.
5. If a question can be answered by exploring the codebase, inspect the codebase instead of asking the user.
6. This discovery/grilling skill may continue when work type is ambiguous; ask follow-up questions instead of hard-blocking.

## Workflow

### 0) Load issue context when provided
- If the user includes a Linear issue key such as `COA-96`, fetch the issue before asking any questions.
- Prefer the Linear CLI, e.g. `linear issue view COA-96`.
- If that fails, inspect the workspace for a local Linear wrapper/extension and use it if available.
- Only use another integration if no local Linear access exists in the current agent.
- Read the issue title and description carefully.
- Treat the Linear issue description as the starting brief for the grilling session.
- If the issue cannot be fetched, tell the user and ask whether to continue from their prompt alone.

### 1) Frame the decision space
- Identify the main design branches
- Find the highest-risk unknowns first
- Decide what must be answered before lower-level choices matter
- Base the first branch on the Linear issue description when one was provided
- If a work-type selector is present, use it as context; if it is missing or ambiguous, continue and ask the user which work type applies

### 2) Ask one question
- Ask a single focused question
- Include your recommendation and reasoning
- Keep the question concrete and actionable
- Reference specific details from the Linear issue when relevant

### 3) Wait for the answer
- Do not batch multiple unrelated questions
- Use the answer to choose the next branch

### 4) Continue until complete
- Keep drilling down until the plan is no longer ambiguous
- Stop when the important branches are resolved

## Output Style

A good grilling loop looks like:

1. Brief summary of the issue or proposal being grilled
2. Question
3. Recommended answer
4. User response
5. Next question

## Quality Checks

- Did you ask only one question?
- Did you include a recommendation?
- Did you follow the decision tree, not a random list?
- Did you inspect the codebase when the answer could be discovered there?

## Troubleshooting

**Too many questions at once**
- Split them into separate turns.

**The answer is already in the repo**
- Explore the codebase and answer from evidence.

**The user supplied a Linear issue key**
- Fetch the issue first, summarize the title/description briefly, then begin the one-question-at-a-time loop.

**The plan is still ambiguous**
- Keep drilling down until the ambiguity is removed.
