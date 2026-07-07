---
name: design-reviewer
description: Validate a Gemini-written spec for structure, constitution compliance, and testability. This skill ONLY reviews—it does not rewrite. Use after running design-gemini prompt to catch issues before proceeding.
---

# Design Reviewer Skill

Lightweight validation of Gemini-written spec.md.

## How to Use

```bash
/skill:design-reviewer
```

Then provide:
- Feature ID (e.g., `045`)

**Or direct:**
```bash
Review spec for feature 045
```

---

## Prerequisites

- ✅ Feature directory exists: `specs/{FEATURE_ID}/`
- ✅ spec.md created by Gemini (using design-gemini-prompt.md)
- ✅ Constitution routing entrypoint available: `shared-workflows/references/constitution.md`

---

## What This Skill Does

### Phase 1: Structural Validation (5 min)

1. **Check Numbering**
   - All FR-XXX sequential (no gaps: FR-001, FR-002, ...)
   - All AC-XXX sequential
   - All US properly labeled (P1, P2, P3)

2. **Check Completeness**
   - [ ] Summary exists
   - [ ] At least 3 user stories
   - [ ] At least 3 functional requirements
   - [ ] At least 3 acceptance criteria
   - [ ] Edge cases section populated
   - [ ] Success criteria defined

3. **Report**
   ```
   STRUCTURAL CHECK:
   ✅ Numbering sequential (FR-001 to FR-005, AC-001 to AC-010)
   ✅ All sections present
   ✅ User stories prioritized (P1, P2, P3)
   ```

### Phase 2: Testability Check (5 min)

4. **Verify Each AC is Testable**
   - Given/When/Then format?
   - Observable result (not "should be good")?
   - Can be automated or verified manually?

5. **Flag Untestable Criteria**
   ```
   TESTABILITY CHECK:
   ✅ AC-001: "Given logged exercise, When note submitted, Then 201" → TESTABLE
   ⚠️ AC-003: "System should handle errors gracefully" → NOT TESTABLE (rewrite?)
   ```

### Phase 3: Traceability Check (5 min)

6. **Verify Mapping**
   - Each AC traces back to at least one FR
   - Each FR traces back to at least one US
   - No orphaned requirements

7. **Report**
   ```
   TRACEABILITY CHECK:
   ✅ All AC map to FR
   ✅ All FR map to US
   ✅ No gaps in chain
   ```

### Phase 4: Constitution Compliance (5 min)

8. **Load Constitution via canonical routing entrypoint**
   - Read `shared-workflows/references/constitution.md`
   - For this hard-gated skill, require exactly one valid work-type selector:
     - Linear label: `wt:development` or `wt:process-automation`
     - Non-Linear prompt header: `Work Type: development` or `Work Type: process-automation`
   - If the selector is missing, invalid, or duplicated, stop with recovery guidance
   - If the selector conflicts with the issue narrative, warn and proceed by selector
   - Load `## Core` plus the mapped work-type document

9. **Check Against Key Principles**
   - Principle I: User outcomes clear? (each story has measurable outcome)
   - Principle II: Testable criteria present? (yes/no)
   - Principle VI: Backend authority respected? (if backend feature)
   - Principle VII: Lifecycle clear? (if stateful feature)

10. **Report**
   ```
   CONSTITUTION COMPLIANCE:
   ✅ Principle I: User outcomes clearly defined
   ✅ Principle II: All AC are testable and observable
   ⚠️ Principle VI: No explicit mention of user ownership enforcement
   ⏭️ Principle VII: Not applicable (stateless feature)
   ```

### Phase 5: Deliver Results

11. **Output Validation Report**
    - PASS: No issues, ready for plan phase
    - WARN: Non-blocking issues, proceed with notes
    - FAIL: Blocking issues, need fixes

12. **Do NOT Modify Files**
    - Only report findings
    - Ask user: "Fix these or proceed as-is?"
    - Do not propose changes (that's clarify skill job)

---

## Output Format

```markdown
# Spec Review: Feature {FEATURE_ID}

**File**: specs/{FEATURE_ID}/spec.md
**Date**: [today]
**Reviewer**: Design Reviewer Skill

---

## Structural Validation
✅ Numbering: Sequential (FR-001 to FR-005)
✅ User Stories: 3 present (P1, P2, P3)
✅ Requirements: 5 functional requirements
✅ Acceptance Criteria: 10 total
✅ Edge Cases: Populated with 5 scenarios
✅ Success Criteria: 3 defined

Result: **PASS**

---

## Testability Validation

| Item | Format | Testable | Status |
|------|--------|----------|--------|
| AC-001 | Given/When/Then | ✅ | ✅ PASS |
| AC-002 | Given/When/Then | ✅ | ✅ PASS |
| AC-003 | Statement | ❌ | ⚠️ WARN |
| AC-004 | Given/When/Then | ✅ | ✅ PASS |

**Findings**:
- AC-003: "System should return notes efficiently" → Not testable. Recommend: "Given session with 100 notes, When retrieved, Then response time < 200ms"

Result: **WARN (1 issue)**

---

## Traceability Validation

✅ All AC trace back to FR
✅ All FR trace back to US
✅ No orphaned requirements
✅ No unreferenced stories

Result: **PASS**

---

## Constitution Compliance

### Principle I: User Outcomes First
✅ Each story has clear measurable outcome
✅ Acceptance criteria testable and observable

### Principle II: Test-First Reliability
✅ All AC are testable/observable
✅ Error cases included (validation, auth, database)
⚠️ Missing: Concurrent update scenario

### Principle VI: Backend Authority
✅ Ownership model clear (user owns notes)
✅ Server-side enforcement implied

### Principle VII: Lifecycle Invariants
⏭️ Not applicable (stateless feature)

**Issues**:
- AC-006 should explicitly mention "last-write-wins" is authoritative server decision
- Add AC for authorization failure case

Result: **WARN (2 recommendations)**

---

## Overall Result

**Status**: ⚠️ WARN

**Summary**: Spec is well-structured and mostly testable. Two minor issues:
1. AC-003 needs rewrite for testability
2. AC-006 needs explicit server-authority language
3. Missing explicit 403 error case for authorization

**Recommendations**:
1. (Optional) Clarify AC-003 with specific performance target
2. (Optional) Add explicit AC for 403 Forbidden when user lacks access
3. (If critical) Use clarify skill to fix before planning

**Recommendation**: ✅ **Ready to proceed** to plan phase. Flag issues as notes for tasks phase.

---

## Next Steps

1. ✅ Proceed to plan phase (issues are minor, can be addressed in tasks)
   ```bash
   /skill:plan
   ```

2. OR use clarify skill if you want to tighten spec first:
   ```bash
   /skill:clarify
   ```
```

---

## Key Rules

### Rule 1: VALIDATE ONLY
- ❌ Do NOT propose changes
- ❌ Do NOT rewrite anything
- ✅ Report findings only
- ✅ Let user decide to fix or proceed

### Rule 2: LIGHTWEIGHT
- Target 15-20 min total runtime
- Focus on structure, testability, traceability
- Skip deep architectural analysis (that's plan phase)

### Rule 3: FAST FEEDBACK
- Structured report (checkboxes, pass/warn/fail)
- Clear findings section
- Clear next steps
- No lengthy prose

### Rule 4: CONSTITUTION FIRST
- Check against key principles only
- Flag if principle violated
- Explain briefly
- Do NOT enforce—user decides

---

## Common Findings

### Finding 1: Untestable AC
```
AC-002: "System should be responsive"
→ Not testable (no observable result)
→ Recommend: "When user adds note, Then response returns < 200ms"
```

### Finding 2: Orphaned Requirement
```
FR-005: "Caching" but no user story requires it
→ Is this needed? Flag for user decision
```

### Finding 3: Missing Error Case
```
US1 acceptance scenarios cover happy path
→ Missing: "When submission fails, Then error displayed"
→ Recommend adding error case AC
```

### Finding 4: Unclear Ownership
```
Feature involves user data but spec doesn't mention authorization
→ Recommend: "System MUST verify user owns note before allowing edit (403 if not)"
```

---

## Pass/Warn/Fail Criteria

| Status | Meaning | Action |
|--------|---------|--------|
| **PASS** | No issues, ready for plan | Proceed to plan phase |
| **WARN** | Minor issues, can proceed | Flag for later or use clarify skill |
| **FAIL** | Blocking issues | Must fix before proceeding |

### FAIL Examples:
- Critical untestable AC
- Missing constitutional requirement
- Orphaned requirements (no traceability)
- Contradictory acceptance criteria

### WARN Examples:
- One untestable AC (can clarify later)
- Missing error case (can add in tasks)
- Vague language (note for tasks phase)

### PASS Examples:
- All AC testable and clear
- Full traceability
- All constitutional principles respected

---

## Checklist Before Reporting

- [ ] Read entire spec.md
- [ ] Checked numbering (no gaps, sequential)
- [ ] Verified traceability (AC → FR → US)
- [ ] Confirmed all AC are testable (Given/When/Then)
- [ ] Cross-checked constitution principles
- [ ] Identified any blocking issues (FAIL?)
- [ ] Identified any minor issues (WARN?)
- [ ] Generated report with findings
- [ ] Did NOT modify any files
- [ ] Did NOT propose specific changes

---

## Tips

- **Be concise**: Report findings in bullets, not prose
- **Use tables**: Traceability is clearest in table format
- **Flag not fix**: Your job is to spot issues, not solve them
- **Focus on structure**: Ignore prose quality, focus on testability and traceability
- **Fast feedback**: 15-20 min total, not 45 min deep analysis