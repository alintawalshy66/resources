---
name: analyze
description: Review a feature specification for gaps, contradictions, missing edge cases, and test coverage concerns. Use this skill after design to audit the spec for completeness before moving to planning. Returns findings but does NOT modify files - you decide what to fix.
---

# Analyze Skill

Audit specification for gaps, contradictions, and missing coverage.

## How to Use

```bash
/skill:analyze
```

Then provide:
- Feature ID (e.g., `046`)
- Optional: specific areas to focus on

**Or direct:**
```bash
Analyze feature 046 for gaps and edge cases
```

---

## Prerequisites

- ✅ Feature directory exists: `specs/{FEATURE_ID}/`
- ✅ spec.md completed by design skill
- ✅ Constitution routing entrypoint available: `shared-workflows/references/constitution.md`

---

## What This Skill Does

### Phase 1: Read Context

1. **Load Constitution via canonical routing entrypoint**
   - Read `shared-workflows/references/constitution.md`
   - For this hard-gated skill, require exactly one valid work-type selector:
     - Linear label: `wt:development` or `wt:process-automation`
     - Non-Linear prompt header: `Work Type: development` or `Work Type: process-automation`
   - If the selector is missing, invalid, or duplicated, stop with recovery guidance
   - If the selector conflicts with the issue narrative, warn and proceed by selector
   - Load `## Core` plus the mapped work-type document
   - Note all applicable non-negotiable rules

2. **Load Spec**
   - Read spec.md completely
   - Note all requirements, stories, acceptance criteria

3. **Load Plan/Tasks** (if present)
   - Read plan.md and tasks.md to check alignment

### Phase 2: Audit for Gaps

4. **Identify Contradictions**
   - Do any requirements conflict with each other?
   - Do acceptance criteria contradict requirements?
   - Do user stories contradict each other?
   - Do any stories assume features that aren't described?

5. **Identify Missing Edge Cases**
   - What happens on invalid input?
   - What happens on boundary conditions?
   - What happens on concurrent access?
   - What happens on network failure (if applicable)?
   - What happens on database errors?
   - What about empty/null states?
   - What about authorization failures?

6. **Identify Missing Requirements**
   - What about error handling?
   - What about validation?
   - What about logging/observability?
   - What about authorization/access control?
   - What about data persistence?
   - What about backwards compatibility?
   - What about performance expectations?

7. **Check Test Coverage**
   - Can each user story be tested independently?
   - Does each acceptance criterion have a test case?
   - Are error cases tested?
   - Are edge cases tested?
   - Are there gaps in traceability (requirement → test)?

### Phase 3: Check Constitution Compliance

8. **Validate Against Constitution**
   - Do requirements respect Principle VI (Backend Authority)?
   - Do requirements respect Principle VII (Lifecycle)?
   - Do requirements respect UI/layout rules?
   - Do requirements include test coverage expectations?
   - Do requirements define observability?
   - Are there obvious violations?

9. **Check Acceptance Criteria Quality**
   - Are they Given/When/Then format (where applicable)?
   - Are they testable and observable?
   - Do they cover happy path and error cases?
   - Do they include validation/boundary cases?

### Phase 4: Report Findings

10. **Organize Findings by Severity**
    - CRITICAL: Contradictions, blocking ambiguities
    - HIGH: Missing requirements affecting core flow
    - MEDIUM: Missing edge cases or error handling
    - LOW: Nice-to-have clarifications

11. **Output Audit Report**
    - List findings (not changes)
    - Provide reasoning for each finding
    - Reference relevant spec sections
    - Include suggested fixes (without modifying files)
    - No action taken; user decides what to fix

---

## Output Format

```markdown
# Specification Audit: {FEATURE_ID}

## Summary
[X] total findings: [N] critical, [N] high, [N] medium, [N] low

---

## CRITICAL Findings

### Finding 1: Contradiction in [Section]
**Location**: spec.md § [section]
**Issue**: Requirement FR-002 says [X] but AC-005 requires [Y]
**Impact**: Spec is ambiguous; implementation can't proceed
**Suggested Fix**: Clarify which is correct; update contradicting requirement

### Finding 2: Missing Prerequisite
...

---

## HIGH Findings

### Finding 3: Missing Error Handling
**Location**: User Story 1 missing error case
**Issue**: What happens if system can't save preference?
**Impact**: User experience undefined; no error messaging spec
**Suggested Fix**: Add requirement for error handling; add AC for 500 error response

---

## MEDIUM Findings

### Finding 5: Edge Case Not Covered
...

---

## LOW Findings

### Finding 8: Clarity Improvement
...

---

## Test Coverage Analysis

| User Story | Testable | Coverage | Gap |
|---|---|---|---|
| US1 | ✅ | 80% | Missing error case test |
| US2 | ✅ | 90% | Complete |
| US3 | ⚠️ | 50% | Missing AC2 test |

---

## Constitution Compliance

- Principle VI (Backend Authority): ✅ PASS
- Principle VII (Lifecycle): ⚠️ WARN - Missing concurrent access rules
- Navigation/Layout Rules: ✅ PASS
- Test-First: ⚠️ WARN - Some AC not testable

---

## Recommendations

1. [Action to take for each critical finding]
2. [Action to take for each high finding]
3. [Consider for medium findings]

---

## Next Steps

1. Review findings above
2. Decide which to fix (critical and high recommended)
3. Use clarify skill to propose changes, OR
4. Manually edit spec.md, OR
5. Accept findings and proceed to plan
```

---

## Key Audit Checks

### Check 1: Requirement Traceability
Every requirement should map back to:
- At least one user story, OR
- At least one acceptance criterion

Missing traceability = orphaned requirement

### Check 2: Story Independence
Each user story should be testable without other stories:
- ✅ US1: Create preference
- ✅ US2: View preferences (can test with mocked data)
- ✅ US3: Delete preference (can test with mocked data)

### Check 3: Acceptance Criteria Completeness
For each acceptance criterion:
- Can it be tested? (observable result)
- Does it cover happy path?
- Does it cover error cases?
- Does it include boundary cases?

### Check 4: Edge Case Coverage
Typical edge cases to look for:
- Empty/null inputs
- Concurrent operations
- Authorization failures
- Validation failures
- Database errors
- Network/timeout issues (if applicable)
- Boundary values (min/max length, date ranges, etc.)

### Check 5: Constitution Compliance
Check for:
- Backend authority violations (frontend inferring server state)
- Lifecycle violations (improper state transitions)
- Navigation violations (breaking AppShell contract)
- Testing violations (untestable requirements)
- Authorization violations (unclear ownership rules)

---

## Common Findings

### Finding Type 1: Contradictions
```
FR-001 says field is optional
AC-002 says field is required
```
→ Fix: Decide which is correct; update both

### Finding Type 2: Missing Error Cases
```
US1 says "user can save preference"
Missing: What if database fails?
```
→ Fix: Add requirement for error handling and AC for error response

### Finding Type 3: Untestable Acceptance Criteria
```
AC-001: "System should be user-friendly"
```
→ Fix: Replace with observable, testable criterion

### Finding Type 4: Missing Edge Cases
```
FR-001: "Validate email"
Missing: What about empty string? Special characters?
```
→ Fix: Add AC for validation boundary cases

---

## Severity Levels

| Level | Action | Blocks Progress |
|-------|--------|-----------------|
| CRITICAL | Must fix before plan phase | YES |
| HIGH | Should fix before plan phase | Usually |
| MEDIUM | Consider fixing; note for tasks | NO |
| LOW | Nice-to-have clarifications | NO |

---

## This Skill Does NOT

- ❌ Modify files
- ❌ Suggest implementation details
- ❌ Enforce specific fixes (only suggests)
- ❌ Make decisions (you do)

---

## Next Steps After Analysis

1. **Review Findings**: Read audit report
2. **Decide What to Fix**:
   - Critical findings: Fix before proceeding
   - High findings: Highly recommended to fix
   - Medium/Low findings: Optional; note for later
3. **Fix Options**:
   - Option A: Use clarify skill to propose and apply changes
   - Option B: Manually edit spec.md
   - Option C: Accept findings and proceed (risk-aware)
4. **Re-Analyze** (optional): Run analyze again after fixes

---

## Tips

- **Run early**: Analyze right after design phase (before plan)
- **Focus on critical/high**: Don't get stuck on low-priority findings
- **Re-run if major changes**: If you significantly revise spec, re-analyze
- **Link to constitution**: Refer to specific constitution principles when flagging violations