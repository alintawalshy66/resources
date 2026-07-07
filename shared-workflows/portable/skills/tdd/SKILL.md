---
name: tdd
description: Test-driven development with a red-green-refactor loop. Use when you want to build a feature or fix a bug by writing one behavior-focused test at a time before implementation.
---

# Test-Driven Development

Use TDD to build features and fixes with a vertical-slice, behavior-first loop.

## When to Use

- Building new functionality
- Fixing a bug with a reproducible failing case
- Adding regression coverage
- Refactoring code while preserving behavior
- You want tests that describe public behavior, not implementation details

## Core Principles

1. Write one behavior-focused test before production code.
2. Test public interfaces and observable outcomes.
3. Keep each cycle small: one test, minimal code, verify, then repeat.
4. Avoid horizontal slicing: do not write all tests first and all code later.
5. Refactor only after the current test passes.

## Workflow

### 1) Plan the next behavior
- Identify the smallest valuable behavior
- Confirm the interface and expected outcome
- Decide what should fail first

### 2) Red
- Write a single test that captures one behavior
- Verify it fails for the right reason

### 3) Green
- Write the smallest code change that makes the test pass
- Avoid speculative features

### 4) Refactor
- Simplify without changing behavior
- Keep tests green after each cleanup step

### 5) Repeat
- Move to the next behavior
- Keep the slice narrow and independently verifiable

## Output Format

A successful TDD cycle produces:

- a failing test first
- minimal production code
- passing test(s)
- cleaner code after refactor

## Quality Checks

- Does the test exercise a public behavior?
- Would the test survive an internal refactor?
- Did you implement only what was needed?
- Did you avoid batching many unrelated tests?

## Troubleshooting

**Test is too implementation-focused**
- Rewrite it around the user-visible outcome.

**Too many behaviors at once**
- Split into smaller tracer bullets.

**Refactor broke behavior**
- Stop, restore green, then continue.
