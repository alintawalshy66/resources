---
name: implement
description: Execute feature implementation with execution window isolation, fresh-context management, and state tracking. Use after spec is complete.
---

# Implement Agent Skill

This skill executes feature implementation with isolated execution windows, fresh-context management, and state tracking. Use this agent after spec is complete. It manages execution windows (3 tasks max per window), enforces test-first discipline, tracks progress in STATE.md, and validates against constitution before proceeding.

## Setup

Ensure you have:
1. A feature directory: `specs/{FEATURE_SLUG}/`
2. A complete spec.md: `specs/{FEATURE_SLUG}/spec.md`
3. Constitution routing entrypoint: `shared-workflows/references/constitution.md`
4. You're on the feature branch: `{FEATURE_SLUG}`
5. GitHub issue has `status:building` while implementation is active, when an issue is associated with the work

## Usage

Invoke this skill with:
```
/skill:implement
```

## Workflow

### Phase 0: Initialization & Setup

1. **Detect Current Feature Branch**
   - Run: `git branch --show-current`
   - Extract feature slug from branch name
   - Verify branch exists and is active

2. **Verify Prerequisites**
   - Confirm spec.md exists and is readable
   - Verify `shared-workflows/references/constitution.md` is accessible
   - For this hard-gated skill, require exactly one valid work-type selector:
     - GitHub issue label: `wt:development` or `wt:process-automation`
     - Non-issue prompt header: `Work Type: development` or `Work Type: process-automation`
   - If the selector is missing, invalid, or duplicated, stop with recovery guidance
   - If the selector conflicts with the issue narrative, warn and proceed by selector
   - Load `## Core` plus the mapped work-type document
   - Confirm GitHub issue exists and is accessible
   - If a GitHub issue is associated with the work, update it to `status:building` (if not already)
   - Add a GitHub issue comment: "Implementation started. Beginning execution windows."

3. **Initialize State Management**
   - Create/read `.planning/{FEATURE_SLUG}/STATE.md`
   - Initialize with feature metadata

4. **Parse Feature Scope from spec.md**
   - Extract user stories and derive implementation tasks
   - Organize tasks into logical execution windows

5. **Create Scope & Documentation Artifacts**
   - Create: `specs/{FEATURE_SLUG}/scope-lock.md`
   - Create: `specs/{FEATURE_SLUG}/task-ledger.md`
   - Create: `specs/{FEATURE_SLUG}/implementation-log.md`

### Phase 1: Pre-Implementation Checklist

6. **Constitution Compliance Review**
   - List constitutional constraints affecting this feature
   - Confirm testing requirements (test-first discipline)
   - Block if constitution violations detected

7. **Test-First Validation**
   - Confirm test-first approach will be used
   - Plan test structure

### Phase 2: Per-Window Execution (Repeat for Each Window)

#### Step A: Load Context from STATE.md
8. **Read Prior Window Results**
   - Open `.planning/{FEATURE_SLUG}/STATE.md`
   - Load prior window completion evidence

#### Step B: Present Window Tasks
9. **Display Window Overview**
   - Show window number, purpose, and tasks
   - Ask: "Ready to start Window N?"

#### Step C: Real-Time Task Tracking
10-13. **Guide Task Execution & Enforce Discipline**
    - For each task: display description, show test requirements, ask confirmation
    - **REQUIRE** test execution before behavior implementation
    - Verify test files exist and FAIL with current code
    - Generate code following constitution standards
    - Check for constitutional violations, error handling, logging gaps

#### Step D: Window Checkpoint Validation
14-16. **Validate Window Completion**
    - Execute all tests in window: `npm test`
    - Confirm ALL tests pass
    - If any test fails: display failure details, ask for revision
    - Validate checkpoint checklist items
    - Check test coverage for new code

#### Step E: Save State & Prepare for Next Window
17-18. **Update STATE.md & Clear Context**
    - Add window results to STATE.md
    - If YES to proceed: commit work, update implementation-log.md, execute `/clear`
    - If NO: save STATE.md, ask about resuming later

### Phase 3: Between Windows (Fresh Context)

19-21. **Reload Minimal Context & Execute**
    - Read STATE.md, spec.md, task-ledger.md (no prior implementation code)
    - Validate prior window completeness
    - Execute current window tasks (back to Phase 2 Step B)

### Phase 4: Final Completion (After All Windows)

22-26. **Integration & Documentation**
    - Run full test suite: `npm test`
    - Create IMPLEMENTATION_SUMMARY.md
    - If a GitHub issue is associated with the work, update it from `status:building` to `status:review`
    - Add comment with link to IMPLEMENTATION_SUMMARY.md
    - Display git status for final review

## Key Behavioral Rules

✅ **Window Isolation**: Each window executes in fresh context (after `/clear`)
✅ **Checkpoint Gates**: Checkpoint MUST pass before proceeding
✅ **Test-First Enforcement**: No behavior without corresponding test
✅ **State-Driven Resumption**: Resume from STATE.md if interrupted
✅ **Constitution Compliance**: Every code decision checked against constitution
✅ **Evidence & Traceability**: Every task completion requires evidence

## GitHub Issue Status Lifecycle

```text
Start: status:ready-to-build or status:ready → status:building
During: status remains status:building
End: status:building → status:review, or close the issue when fully complete
```

## Tools Used

- Bash — git commands, test execution, file operations
- File system — create directories and copy files
- GitHub CLI (`gh`) — update issue labels, comments, and closure state

## Error Handling

**Missing spec.md or constitution routing entrypoint:**
→ Stop. Show what's missing and ask user to create/locate `shared-workflows/references/constitution.md` or the spec.

**Not on feature branch:**
→ Stop. Show current branch and expected feature branch.

**GitHub CLI (`gh`) fails:**
→ Tell user to check `gh` installation/authentication and try again.

**Test failures during checkpoint:**
→ Show failure details. Ask which task needs revision or if user wants to skip (with documentation).

**Feature directory doesn't exist:**
→ Stop. Ask the user to create `specs/{FEATURE_SLUG}/` manually before implementation.