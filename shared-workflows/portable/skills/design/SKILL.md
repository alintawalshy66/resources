---
name: design
description: Review and enhance a feature specification. The spec.md already exists from Linear—review it for completeness, check against constitutional principles, and enhance with additional detail if needed.
---

# Design Skill

Review and enhance the feature specification that came from Linear.

## How to Use

In Pi:

```bash
/skill:design
```

The skill reads the existing spec.md from the current feature branch and enhances it as needed.

---

## Prerequisites

- ✅ Feature directory exists: `specs/{FEATURE-SLUG}/`
- ✅ `spec.md` present from the upstream planning/issue workflow
- ✅ Constitution routing entrypoint available: `shared-workflows/references/constitution.md`
- ✅ Git branch active: `{FEATURE-SLUG}`

---

## What This Skill Does

### Phase 1: Load All Context

1. **Load Constitution via canonical routing entrypoint**
   - Read `shared-workflows/references/constitution.md`
   - For this hard-gated skill, require exactly one valid work-type selector:
     - Linear label: `wt:development` or `wt:process-automation`
     - Non-Linear prompt header: `Work Type: development` or `Work Type: process-automation`
   - If the selector is missing, invalid, or duplicated, stop with recovery guidance
   - If the selector conflicts with the issue narrative, warn and proceed by selector
   - Load `## Core` plus the mapped work-type document
   - Extract all applicable non-negotiable principles
   - Note: identity boundary rules, backend authority, test-first, AppShell rules, accessibility, lifecycle invariants

2. **Load Existing spec.md**
   - Read `specs/{FEATURE-SLUG}/spec.md`
   - Extract: Summary, User Stories, Requirements, Acceptance Criteria, Edge Cases
   - Assess completeness and quality

3. **Load Related Prior Specs** (if any in the specs/ directory that relate to this feature)
   - Skim related specs from `specs/` to understand prior patterns and decisions
   - Do not copy — understand patterns

4. **Load Relevant Module Files** (based on what the spec touches)
   - Skim relevant `api/src/modules/` or `app/src/features/` folders
   - Understand existing patterns, naming conventions, existing endpoints
   - Cross-reference with spec to ensure alignment

5. **Assess Completeness and Constitutional Alignment**
   - Is the spec complete and testable?
   - Are all requirements observable?
   - Are user stories independently shippable?
   - Does it comply with constitutional principles?

### Phase 2: Review and Enhance

Review and enhance `specs/{FEATURE-SLUG}/spec.md` as needed.

6. **Validate User Stories**
   - Are P1 stories independently shippable as MVP?
   - Are priorities justified by user value?
   - Is each story independently testable?
   - Add or refine acceptance scenarios if needed (Given/When/Then format)

7. **Validate Functional Requirements**
   - Are all requirements testable and observable?
   - Are non-goals from the spec enforced as explicit constraints?
   - Do requirements reference existing APIs/patterns from codebase?
   - Add missing requirements if gaps identified

8. **Validate Non-Functional Requirements**
   - Accessibility (keyboard nav, tap targets, contrast — constitution section IX)
   - Layout (handheld + desktop — constitution AppShell rules)
   - Error handling (structured errors, no silent failures — constitution Principle V)
   - Observability (logging — constitution Principle V)
   - Add or enhance NFRs as needed

9. **Validate Key Entities**
   - Does the spec define data structures being read/produced?
   - Do entities reference existing codebase entities where possible?
   - Are relationships clear?
   - Add missing entity definitions if gaps identified

10. **Validate Edge Cases**
    - Are known concerns from Linear issue addressed?
    - Are additional edge cases identified?
    - Include: empty states, error states, auth failures, boundary conditions
    - Add missing edge cases if gaps identified

11. **Validate Success Criteria**
    - Are criteria measurable and observable?
    - Do they trace back to user stories?
    - Add missing success criteria if gaps identified

12. **Validate Acceptance Criteria**
    - Are criteria in Given/When/Then format?
    - Do they cover: happy path, error cases, auth, empty state, layout (handheld + desktop)?
    - Is each AC independently testable?
    - Enhance or add missing acceptance criteria as needed

### Phase 3: Constitutional Compliance Check

13. **Validate Spec Against Constitution**

    Check each principle that applies to this feature:

    - **Principle I**: Each user story has explicit measurable outcome
    - **Principle II**: All AC are testable and observable; error cases covered
    - **Principle VI**: Backend is authoritative; no client-side inference of server state
    - **Principle VII**: Lifecycle and Fastify rules respected if backend changes involved
    - **AppShell**: Any new page renders within AppShell — no custom nav shell
    - **Identity Boundary**: External APIs use userId only; no athleteId in contracts
    - **Accessibility**: Keyboard nav, tap targets, contrast referenced in NFRs
    - **Responsive**: Both handheld and desktop layouts addressed
    - **Immutable Data**: No mutation of planSnapshot or completed session records unless explicitly in scope

14. **Add or Update Constitutional Compliance Section**
    - ✅ PASS / ⚠️ WARN / ❌ FAIL for each relevant principle
    - Explain any WARNs
    - Flag any open constitutional questions

15. **Resolve Gaps**
    - For any section that is incomplete or missing:
      - Either enhance it inline
      - Or flag it clearly and ask the user to clarify before proceeding

### Phase 4: Deliver

16. **Update spec.md**
    - Write enhanced spec.md back to `specs/{FEATURE-SLUG}/spec.md`
    - All TBD or placeholder sections should be filled in
    - All enhancements should be inline (no separate files)

17. **Display Summary**
    ```
    ✅ Spec review and enhancement complete: specs/{FEATURE-SLUG}/spec.md

    📋 Contents:
       - {N} user stories (P1: {N}, P2: {N}, P3: {N})
       - {N} functional requirements
       - {N} non-functional requirements
       - {N} acceptance criteria
       - {N} edge cases

    ⚖️ Constitutional compliance:
       - {N} PASS
       - {N} WARN: {brief description}
       - {N} FAIL: {brief description}

    📝 Next steps:
       1. Review spec.md
       2. Begin implementation work on this branch
       3. Create PR against main when ready
    ```

---

## Key Rules

### Rule 1: Spec Comes from Linear
- The spec.md is already written and complete
- Your job is to enhance it, not rewrite it
- Preserve the author's intent and language where it's sound
- Only change what needs clarification, completion, or constitutional alignment

### Rule 2: Constitution Overrides Everything
- If the spec conflicts with a constitutional principle, flag it clearly
- Do not silently violate the constitution
- If a violation is blocking, surface it to the user before finalizing

### Rule 3: Backend Authority
- The spec must not describe client-side inference of server state
- Any metric, status, or decision that belongs to the server must be explicitly marked as server-determined in requirements

### Rule 4: No Implementation Details in Spec
- Spec describes WHAT, not HOW
- No framework names, no file paths, no specific library choices
- ✅ "System MUST validate input before persisting"
- ❌ "System MUST use Zod to validate with the exerciseSchema"

### Rule 5: Ask Minimally
- Only ask for clarification if a section is genuinely incomplete or blocking
- One focused question per gap
- If you can enhance it based on context, do so

---

## Output: Enhanced spec.md Structure

The spec.md should follow this structure (enhanced from what came from Linear):

```markdown
# Spec: {FEATURE-SLUG}

**Status**: READY_FOR_DEV
**Source**: {Linear Issue URL}
**Priority**: {Priority}

## Summary
[Clear, concise summary of what this feature is and who it's for]

---

## User Scenarios & Testing

### User Story 1 — {Title} (Priority: P1)
[Description]
**Why this priority**: [Justification]
**Independent Test**: [How to test this story alone]
**Acceptance Scenarios**:
1. Given [...], When [...], Then [...]

### User Story 2 — {Title} (Priority: P2)
...

### Edge Cases
- [From Linear + additional identified]

---

## Requirements

### Functional Requirements
- FR-001: System MUST [...]
- FR-002: System MUST NOT [...]
...

### Non-Functional Requirements
- NFR-001: [Accessibility]
- NFR-002: [Layout]
- NFR-003: [Error handling]
...

### Key Entities
- **{Entity}**: [Description, sourced from existing codebase where possible]

---

## Success Criteria
- SC-001: [Measurable outcome]
...

---

## Acceptance Criteria
1. Given [...], When [...], Then [...]
...

---

## Constitutional Compliance
- ✅ Principle I (User Outcomes): [...]
- ✅ Principle II (Test-First): [...]
- ✅/⚠️ Principle VI (Backend Authority): [...]
- ✅/⚠️ AppShell: [...]
- ✅/⚠️ Identity Boundary: [...]
- ✅ Accessibility: [...]
- ✅ Responsive: [...]
```

---

## Error Handling

**spec.md missing:**
→ Stop. Ask the user to provide or create `specs/{FEATURE-SLUG}/spec.md` before running design.

**Spec is incomplete but recoverable:**
→ Enhance inline if possible, or ask for clarification on specific gaps.

**Constitutional violation identified:**
→ Flag in compliance section. If FAIL-level, stop and surface to user before finalizing.

**Cannot determine scope or intent from spec:**
→ Ask the user for clarification before enhancing further.