---
name: clarify
description: Review specification for improvements and propose changes before applying them. Use this skill after analyze to improve spec clarity, fix gaps, resolve contradictions, and ensure documents are tight before planning. Shows proposed changes for user approval before modifying files.
---

# Clarify Skill

Propose specification improvements and apply approved changes.

## How to Use

In Pi:

```bash
/skill:clarify
```

---

## Prerequisites

- ✅ Feature directory exists: `specs/{FEATURE_ID}/`
- ✅ spec.md completed
- ✅ Optional: analyze report available (to guide improvements)
- ✅ Constitution routing entrypoint available: `shared-workflows/references/constitution.md`

---

## What This Skill Does

### Phase 1: Review & Planning

1. **Load Context**
   - Read `shared-workflows/references/constitution.md`
   - For this hard-gated skill, require exactly one valid work-type selector:
     - Linear label: `wt:development` or `wt:process-automation`
     - Non-Linear prompt header: `Work Type: development` or `Work Type: process-automation`
   - If the selector is missing, invalid, or duplicated, stop with recovery guidance
   - If the selector conflicts with the issue narrative, warn and proceed by selector
   - Load `## Core` plus the mapped work-type document
   - Read spec.md
   - Load analyze report (if exists)

2. **Ask for Improvement Focus**
   - "What areas need clarification?"
   - Or read analyze findings to prioritize
   - Listen for: contradictions to fix, gaps to fill, clarity issues

### Phase 2: Propose Changes (NO EDITS YET)

3. **Build Proposed Changes List**
   - Change 1: [Type] [Location] [Why]
   - Change 2: [Type] [Location] [Why]
   - ... (numbered for reference)
   - Include before/after examples

4. **Display Proposed Changes to User**
   - Show each change clearly
   - Show WHY (what problem it solves)
   - Show WHAT will change (before → after)
   - DO NOT APPLY YET

5. **Ask User Decisions**
   - For each proposed change:
     - **APPLY**: Apply this change as proposed
     - **CHANGE**: Ask what to change (single focused question)
     - **IGNORE**: Skip this change

### Phase 3: Apply Approved Changes

6. **Make Edits to spec.md**
   - Apply only changes marked APPLY
   - Apply user-modified versions for CHANGE requests
   - Skip all IGNORE requests

7. **Update Document Structure**
   - Maintain consistent numbering (FR-001, AC-001, etc.)
   - Preserve formatting
   - Preserve traceability

8. **Handle Renumbering** (if needed)
   - If a requirement is added/removed, renumber affected sections
   - Update any cross-references

### Phase 4: Report & Summary

9. **Write Changes Log**
   - What was changed
   - What was skipped
   - What problems this solves
   - Any new open questions

10. **Display Final Summary**
    - Total changes proposed: X
    - Changes applied: Y
    - Changes skipped: Z
    - File: specs/{FEATURE_ID}/spec.md (updated)
    - Ready for plan phase

---

## Change Types

### Type 1: Fill Missing Requirement
```
Location: FR section
Why: Analyze found missing error handling
Change:
  ADD: FR-005: System MUST return 400 error on validation failure
  ADD: AC-007: Given invalid email, When submitted, Then system returns 400 VALIDATION_ERROR
```

### Type 2: Fix Contradiction
```
Location: FR-002 vs AC-005
Why: Contradictory requirements
Change:
  BEFORE: FR-002: Notes field is optional
  BEFORE: AC-005: System MUST require notes before completion
  AFTER: FR-002: Notes field is required for session completion
  AFTER: AC-005: Given in-progress session, When attempting completion without notes, Then system rejects with error
```

### Type 3: Add Edge Case Coverage
```
Location: US1 acceptance scenarios
Why: Missing concurrent access scenario
Change:
  ADD: AC-004: Given two concurrent updates, When both submitted simultaneously, Then last write wins (data is authoritative)
```

### Type 4: Improve Clarity
```
Location: FR-001 description
Why: Ambiguous language
Change:
  BEFORE: FR-001: System should validate input
  AFTER: FR-001: System MUST validate email format using RFC 5322 standard before persisting
```

### Type 5: Ensure Testability
```
Location: AC-002
Why: Not testable/observable
Change:
  BEFORE: AC-002: System handles errors gracefully
  AFTER: AC-002: Given database failure, When user tries to save, Then system returns 500 INTERNAL_SERVER_ERROR with clear message
```

---

## Workflow Example

```
AGENT: Reviewing spec for improvements...

PROPOSED CHANGES (review before applying):

1. FIX CONTRADICTION: FR-002 vs AC-005
   Why: Conflicting requirements about notes field
   Before: FR-002 says optional, AC-005 says required
   After: Both say required for completion
   [APPLY / CHANGE / IGNORE] ?

User: APPLY

2. ADD MISSING ERROR CASE: User Story 1
   Why: Analyze found no error handling spec
   Add: AC-007 for validation error + AC-008 for database error
   [APPLY / CHANGE / IGNORE] ?

User: CHANGE
   Question: Should I add separate AC for each error type or one combined AC?

AGENT: Good question. Separate is better for clarity. One AC per error type.
   Proposed:
   - AC-007: Validation error (400)
   - AC-008: Database error (500)
   - AC-009: Authorization error (403)
   Apply these three?

User: APPLY

3. ADD EDGE CASE: Concurrent Updates
   Why: Not covered in spec
   Add: AC-010 for concurrent session updates
   [APPLY / CHANGE / IGNORE] ?

User: IGNORE (we'll handle this in tasks phase)

---

APPLYING CHANGES:
✅ Applied: FIX CONTRADICTION in FR-002 and AC-005
✅ Applied: ADDED AC-007, AC-008, AC-009 for error cases
⏭️ Skipped: CONCURRENT UPDATES edge case

SUMMARY:
- Total proposed: 3
- Applied: 2
- Skipped: 1
- File updated: specs/046-user-preferences/spec.md
- Ready for plan phase!
```

---

## Key Rules

### Rule 1: Show Before Applying
- Never silently change files
- Always show proposed changes first
- Wait for user decision on each change

### Rule 2: One Question Per Change
- If user says "CHANGE", ask ONE focused question
- Don't overwhelm with options
- Apply the user's decision as stated

### Rule 3: Maintain Structure
- Keep spec template consistent
- Keep numbering sequential (FR-001, FR-002, ...)
- Keep cross-references accurate
- Keep formatting uniform

### Rule 4: Preserve Intent
- Don't rewrite the whole spec
- Make minimal, targeted improvements
- Keep author's voice and intent
- Focus on clarity and completeness, not style

### Rule 5: Document Decisions
- Log what changed and why
- Note what was skipped
- Explain the improvements made
- Help future phases understand context

---

## Common Change Patterns

### Pattern 1: Fill a Gap
```
"Analyze found missing error handling"
  → Add requirement for 400/500 responses
  → Add acceptance criteria for error cases
```

### Pattern 2: Fix a Contradiction
```
"FR-002 says optional, AC-005 says required"
  → Choose which is correct
  → Update both to be consistent
  → Explain the decision
```

### Pattern 3: Add Edge Case
```
"What happens on concurrent updates?"
  → Add acceptance criterion for this scenario
  → Specify expected behavior
  → Ensure it's testable
```

### Pattern 4: Improve Testability
```
"AC-002 is not observable (too vague)"
  → Rewrite using Given/When/Then
  → Make result testable
  → Include error cases
```

### Pattern 5: Clarify Ambiguity
```
"What does 'notify user' mean?"
  → Should be a requirement, not assumed
  → Specify exact notification behavior
  → Add acceptance criterion
```

---

## Checklist Before Plan Phase

After clarify completes:

- [ ] All proposed changes reviewed
- [ ] User approved/rejected each change
- [ ] Changes applied successfully
- [ ] spec.md is updated and consistent
- [ ] All numbering sequential
- [ ] All cross-references accurate
- [ ] No contradictions remain
- [ ] All gaps filled or explicitly deferred
- [ ] Ready to move to plan phase

---

## Next Steps

1. **Review Change Log**: Understand what improved
2. **Optional: Re-Analyze**: Run analyze again if major changes
3. **Plan Phase**: `/skill:plan`

---

## Hard Rules

- ✅ Always show proposed changes first
- ✅ Always ask user before applying
- ✅ Apply exactly what user approves (no surprises)
- ✅ Document what changed and why
- ❌ Never silently modify files
- ❌ Never make assumptions about improvements
- ❌ Never apply changes user didn't approve
- ❌ Never change more than discussed

---

## Tips

- **Use analyze first**: Analyze report guides improvements
- **Focus on critical gaps**: Don't bikeshed over style
- **Ask clarifying questions**: Don't impose fixes without understanding
- **Preserve intent**: Improve clarity, not architecture
- **Document decisions**: Helps plan and implement phases