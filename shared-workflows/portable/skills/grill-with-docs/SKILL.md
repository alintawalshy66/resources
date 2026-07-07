---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when you want to stress-test a plan against the repo's language and documented decisions.
---

# Grill With Docs

Interview the user relentlessly about a plan or design until shared understanding is reached, while grounding decisions in the repo's docs and updating those docs as terms resolve.

This skill also scaffolds the repo-specific support docs other engineering skills rely on: an `## Agent skills` block in `AGENTS.md` or `CLAUDE.md`, plus any applicable `docs/agents/*.md` files.

## When to Use

- The user wants to stress-test an idea or plan
- You need to resolve branching design decisions before implementation
- The user asks to be grilled on a proposal
- The plan has ambiguity that should be resolved before coding
- You need to align the plan with existing domain language and ADRs

## Core Principles

1. Ask one question at a time.
2. Walk the decision tree from the top down.
3. Resolve dependencies between decisions before moving on.
4. For each question, provide your recommended answer.
5. If a question can be answered by exploring the codebase or docs, inspect them instead of asking the user.
6. Update docs as decisions crystallise; don't wait until the end.

## Workflow

### 0) Load context
- Read the repository root files first: `git remote -v`, `.git/config`, `AGENTS.md` and `CLAUDE.md`, `CONTEXT.md` and `CONTEXT-MAP.md`, `docs/adr/`, `docs/agents/`, and `.scratch/`.
- Treat issue-tracker and triage docs as optional; only generate them when the repo actually uses issues or labels.
- If the user includes an issue key or feature reference, load that context too.
- Look for existing domain language before asking questions.

### 1) Frame the decision space
- Identify the main design branches.
- Find the highest-risk unknowns first.
- Decide what must be answered before lower-level choices matter.
- Use the codebase and docs to eliminate questions you can already answer.

### 2) Ask one question
- Ask a single focused question.
- Include your recommendation and reasoning.
- Keep the question concrete and actionable.
- Call out terminology conflicts immediately.

### 3) Update docs inline
- When a term is resolved, update `CONTEXT.md` immediately.
- Keep `CONTEXT.md` glossary-only: definitions, relationships, examples, and ambiguities.
- Offer an ADR only when the decision is hard to reverse, surprising without context, and the result of a real trade-off.
- If an ADR is warranted, create it in `docs/adr/` using the ADR format template.
- Create `docs/agents/` lazily when the first repo-specific support doc needs to be written.

### 4) Write repository support docs
- After the decisions are resolved, show the user a draft of the `## Agent skills` block and any repo docs you plan to write before writing.
- If `CLAUDE.md` exists, edit it. Else if `AGENTS.md` exists, edit it. If neither exists, ask which one to create.
- Populate only the applicable `docs/agents/*.md` files from the matching seed templates in this skill folder.
- Keep edits minimal and do not duplicate an existing `## Agent skills` block.

### 5) Continue until complete
- Keep drilling down until the plan is no longer ambiguous.
- Stop when the important branches are resolved.

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
- Did you inspect the codebase and docs when the answer could be discovered there?
- Did you update `CONTEXT.md` or create an ADR when warranted?

## Troubleshooting

**Too many questions at once**
- Split them into separate turns.

**The answer is already in the repo**
- Explore the codebase and docs, then answer from evidence.

**The plan is still ambiguous**
- Keep drilling down until the ambiguity is removed.
