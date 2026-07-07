---
name: code-reviewer
description: Review completed feature implementation against spec, plan, and constitutional requirements before merge. Loads spec.md, plan.md, tasks.md, and git diff, then works through the code-review-checklist skill to produce a structured report. Surfaces blockers to the user — does not auto-fix. Run after implement skill completes and before merging to main.
---

# Code Reviewer Skill

Review completed feature implementation before merge. Produce a structured report with a clear APPROVED / CHANGES REQUIRED / BLOCKED outcome.

## Usage

```bash
/skill:code-reviewer {FEATURE-SLUG}
```

Example:
```bash
/skill:code-reviewer 054-exercise-block-tempo-persistence
```

---

## Prerequisites

- ✅ `specs/{FEATURE-SLUG}/spec.md` exists and is complete
- ✅ `specs/{FEATURE-SLUG}/plan.md` exists
- ✅ `specs/{FEATURE-SLUG}/tasks.md` exists with all tasks marked `[x]`
- ✅ Implementation committed to feature branch
- ✅ Tests passing locally (`cd api && npm test` and `cd app && npm test`)

---

## What This Skill Does

### Phase 1: Load Context

1. **Load the code-review-checklist skill**
   - This skill defines the 8-section checklist, blocker definitions, and report format
   - All review judgements follow that skill's standards

2. **Load feature documents**
   - Read `specs/{FEATURE-SLUG}/spec.md` — acceptance criteria, requirements, non-goals
   - Read `specs/{FEATURE-SLUG}/plan.md` — intended architecture and data model
   - Read `specs/{FEATURE-SLUG}/tasks.md` — task list to verify completeness

3. **Load constitution via canonical routing entrypoint**
   - Read `shared-workflows/references/constitution.md`
   - For this hard-gated skill, require exactly one valid work-type selector:
     - Linear label: `wt:development` or `wt:process-automation`
     - Non-Linear prompt header: `Work Type: development` or `Work Type: process-automation`
   - If the selector is missing, invalid, or duplicated, stop with recovery guidance
   - If the selector conflicts with the issue narrative, warn and proceed by selector
   - Load `## Core` plus the mapped work-type document
   - Note all applicable non-negotiable principles relevant to this feature

4. **Get git diff**
   ```bash
   git diff main...HEAD
   ```
   This is the authoritative view of what changed. Review only what's in the diff — do not audit unrelated existing code.

5. **Run automated checks**
   ```bash
   cd api && npm test
   cd app && npm test
   cd api && npx tsc --noEmit
   cd app && npx tsc --noEmit
   ```
   If any command fails — stop immediately. Report BLOCKED with the failure output. Do not proceed with manual review until automated checks pass.

---

### Phase 2: Work Through the Checklist

Work through all 8 sections from the `code-review-checklist` skill. For each section, note findings as:

- ✅ **PASS** — requirement met
- ⚠️ **WARN** — potential issue, not a blocker
- ❌ **FAIL** — violation found, must be resolved

The 8 sections are defined in the `code-review-checklist` skill. Work through each one systematically — do not skip sections even if the feature seems simple.

For each FAIL finding, record:
- Which checklist item failed
- The specific file and line where the violation occurs
- What needs to change to resolve it

---

### Phase 3: Determine Outcome

**BLOCKED** — stop, do not allow merge:
- Any automated check fails (tests, TypeScript)
- Any hard blocker from the checklist is present (see skill for full list)

**CHANGES REQUIRED** — implementation must be updated before merge:
- One or more checklist violations found that are not hard blockers
- Missing tests for new behaviour
- Non-goal implemented

**APPROVED** — ready to merge:
- All automated checks pass
- No checklist violations
- Warnings noted but not blocking

---

### Phase 4: Produce Report

Write the review report directly to the terminal. Do not write a file unless the user asks.

```
═══════════════════════════════════════════════
CODE REVIEW: {FEATURE-SLUG}
Outcome: APPROVED | CHANGES REQUIRED | BLOCKED
═══════════════════════════════════════════════

AUTOMATED CHECKS
────────────────
api tests:       PASS | FAIL
app tests:       PASS | FAIL
api TypeScript:  PASS | FAIL
app TypeScript:  PASS | FAIL

CHECKLIST RESULTS
─────────────────
1. Spec Traceability        PASS | WARN | FAIL
2. Constitutional Compliance PASS | WARN | FAIL
3. Data Ownership & Auth     PASS | WARN | FAIL
4. Error Semantics           PASS | WARN | FAIL
5. Schema & Migration Safety PASS | WARN | FAIL
6. Code Quality              PASS | WARN | FAIL
7. Frontend                  PASS | WARN | FAIL
8. Observability             PASS | WARN | FAIL

FINDINGS
────────
[Only populated if WARN or FAIL items exist]

❌ FAIL — Section 3: Data Ownership
   File: api/src/modules/exercise-history/exercise-history.routes.ts:47
   Issue: athleteId accepted as URL parameter — violates identity boundary rule
   Fix: Remove athleteId param. Resolve athlete from userId server-side.

⚠️ WARN — Section 6: Code Quality
   File: app/src/features/exercise-history/ExerciseHistoryPanel.tsx:112
   Issue: TODO comment left in production code
   Fix: Resolve or remove before merge.

TASKS AUDIT
───────────
[x] tasks marked complete: {N}/{N}
Unresolved tasks: [list if any]

SUMMARY
───────
{One paragraph describing what was reviewed, what was found, and what must happen next.}
```

---

## Key Rules

**DO:**
- Review only what changed (git diff against main)
- Surface every finding — do not silently ignore minor issues
- Stop immediately if automated checks fail
- Report exact file and line for every FAIL finding
- State clearly what needs to change, not just what's wrong

**DON'T:**
- Auto-fix violations — surface them to the user
- Review unrelated existing code
- Approve with open FAIL items
- Skip sections because the feature seems small
- Run without loading the `code-review-checklist` skill first

---

## After the Review

**If APPROVED:**
```
Next steps:
  git checkout main
  git merge {FEATURE-SLUG}
  git push origin main
  Mark feature DONE in Notion
```

**If CHANGES REQUIRED or BLOCKED:**
```
Next steps:
  1. Address each FAIL finding listed above
  2. Re-run: /skill:code-reviewer {FEATURE-SLUG}
  3. Do not merge until outcome is APPROVED
```
