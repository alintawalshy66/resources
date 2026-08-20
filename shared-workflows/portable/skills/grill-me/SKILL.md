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
- The user invokes the skill with a GitHub issue reference such as `grill-me #96`, `grill-me 96`, or a GitHub issue URL
- The user invokes the skill with tracker context such as `grill-me jira`, `grill-me gh`, `grill-me github`, or `grill-me neutral`
- The user invokes the skill with a Jira issue reference such as `PROJ-123` or a Jira URL

## Core Principles

1. Ask one question at a time.
2. Walk the decision tree from the top down.
3. Resolve dependencies between decisions before moving on.
4. For each question, provide your recommended answer.
5. If a question can be answered by exploring the codebase, inspect the codebase instead of asking the user.
6. This discovery/grilling skill may continue when work type is ambiguous; ask follow-up questions instead of hard-blocking.

## Workflow

### 0) Resolve tracker and load issue context when provided
- Accept tracker hints on invocation:
  - `jira` → Jira
  - `gh` or `github` → GitHub Issues
  - `neutral` → no tracker-specific assumptions
- Tracker precedence:
  1. Explicit tracker hint in the current invocation.
  2. Tracker link/reference in the current prompt when unambiguous.
  3. Existing carried context from the conversation.
  4. Neutral/default behavior.
- Recognize Jira references:
  - Jira URL: `https://<domain>.atlassian.net/browse/PROJ-123`
  - Jira issue key: `PROJ-123`
- Recognize GitHub issue references:
  - GitHub issue URL: `https://github.com/<org>/<repo>/issues/123`
  - GitHub shorthand: `#123`
  - Bare number such as `123` only when GitHub repo context is already explicit/unambiguous.
- If the tracker is GitHub Issues and the user includes a GitHub issue reference, fetch the issue before asking any questions.
- Prefer the GitHub CLI (`gh`), e.g. `gh issue view 96 --json number,title,body,labels,milestone,url`.
- If GitHub fetching fails, ask whether to continue from the prompt alone or to authenticate/install `gh`.
- If the tracker is Jira and the user includes a Jira issue reference, fetch the issue before asking any questions using the configured Jira CLI/API.
- Do not assume a specific Jira command name until Jira tooling is configured in the repo/environment.
- If Jira fetching fails, report the failure directly.
- Read the issue title and description carefully.
- Treat the fetched issue description as the starting brief for the grilling session.
- Carry tracker context forward in the grilling summary when relevant, e.g. `Tracker Context: Jira` or `Tracker Context: GitHub Issues`.

### 1) Frame the decision space
- Identify the main design branches
- Find the highest-risk unknowns first
- Decide what must be answered before lower-level choices matter
- Base the first branch on the fetched issue description when one was provided
- If a work-type selector is present, use it as context; if it is missing or ambiguous, continue and ask the user which work type applies

### 2) Ask one question
- Ask a single focused question
- Include your recommendation and reasoning
- Keep the question concrete and actionable
- Reference specific details from the fetched issue when relevant

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

**The user supplied a GitHub issue key**
- Fetch the issue first, summarize the title/description briefly, then begin the one-question-at-a-time loop.

**The user supplied a Jira issue key**
- Fetch the issue through the configured Jira CLI/API first, summarize the title/description briefly, then begin the one-question-at-a-time loop.
- If Jira tooling is unavailable or fails, report the failure directly.

**The plan is still ambiguous**
- Keep drilling down until the ambiguity is removed.
