---
name: plan
description: Write a complete implementation plan with technical approach, phased delivery, testing strategy, and research documentation. Use this skill after design/analyze/clarify to create plan.md and supporting docs before breaking into tasks.
---

# Plan Skill

Write a complete implementation plan with technical approach and phased delivery.

## How to Use

In Pi:

```bash
/skill:plan
```

---

## Prerequisites

- ✅ Feature directory exists: `specs/{FEATURE_ID}/`
- ✅ spec.md completed and clarified
- ✅ Constitution routing entrypoint available: `shared-workflows/references/constitution.md`
- ✅ Git branch active: `{FEATURE_ID}`

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
   - Note all technical constraints
   - Note all testing requirements
   - Note all architectural rules

2. **Load Spec**
   - Read all user stories (P1, P2, P3)
   - Note all requirements
   - Note all acceptance criteria

3. **Analyze Technical Scope**
   - What technologies are involved?
   - What layers are affected (frontend, backend, database)?
   - What existing patterns to follow?

### Phase 2: Technical Planning

4. **Define Technical Context**
   - Language/runtime (Node 20+, Python 3.11, etc.)
   - Primary dependencies (Fastify, Prisma, React, etc.)
   - Storage layer (PostgreSQL, etc.)
   - Testing framework (Vitest, etc.)
   - Target platform (Web, mobile, etc.)
   - Performance goals
   - Scale/scope

5. **Review Constitution Compliance**
   - Does this feature violate any constitutional rules?
   - Are there architectural constraints?
   - Testing expectations from constitution
   - Error handling standards
   - Observability requirements

6. **Define Project Structure**
   - Single project or multi-repo?
   - Source code layout (api/src, frontend/src, etc.)
   - Test location and structure
   - Configuration management

7. **Create Complexity Tracker** (if needed)
   - Any deviations from constitution?
   - Any additional complexity vs. simpler alternatives?
   - Justification for each complexity

### Phase 3: Write Plan Artifacts

8. **Create plan.md**
   - Summary of feature and technical approach
   - Technical context (languages, frameworks, storage, etc.)
   - Constitution check (compliance review)
   - Project structure (folder layout)
   - Complexity tracking (if violations/deviations)

9. **Create research.md** (if applicable)
   - Spike/research needed
   - Alternative approaches considered
   - Technology decisions and rationale
   - Open questions

10. **Create data-model.md** (if applicable)
    - Database schema changes
    - Entity relationships
    - Constraints and invariants
    - Migration strategy

11. **Create contracts//** (if applicable)
    - API contracts (request/response shapes)
    - Error codes and semantics
    - Authorization boundaries
    - Data ownership rules

12. **Create quickstart.md** (if helpful)
    - How to manually verify the feature
    - Test data setup
    - Key user flows to validate
    - Troubleshooting steps

### Phase 4: Deliver Plan

13. **Display Summary**
    - Files created/updated
    - Technical decisions made
    - Testing strategy
    - Next phase (tasks)

---

## Output Files

### plan.md (Primary)
```markdown
# Implementation Plan: {FEATURE_NAME}

**Branch**: {FEATURE_ID} | **Date**: [DATE] | **Spec**: [link]

## Summary
[Technical approach summary]

## Technical Context
- Language/Version: [Node 20+]
- Primary Dependencies: [Fastify, Prisma, Zod]
- Storage: [PostgreSQL 15]
- Testing: [Vitest]
- Target Platform: [Web]
- Performance Goals: [1000 req/s, <200ms p95]
- Scale/Scope: [10k users, 50 endpoints]

## Constitution Check
- Principle VI (Backend Authority): [✅ PASS / ⚠️ WARN / ❌ FAIL]
- Principle VII (Lifecycle): [✅ PASS]
- Test-First: [✅ PASS]
- Navigation/Layout: [✅ PASS]

[Any violations explained and justified]

## Project Structure
```
api/src/
├── routes/
├── services/
├── repositories/
└── lib/

api/src/routes/
├── user-preferences.ts    (routes)
└── user-preferences.test.ts (tests)

specs/046/
├── spec.md (requirements)
├── plan.md (this file)
└── tasks.md (atomic tasks)
```

## Phased Delivery

### Phase 1: Database & Models
- Add preferences schema
- Create migrations
- Seed test data

### Phase 2: API Routes
- GET /preferences
- POST /preferences
- PATCH /preferences/:id

### Phase 3: Validation & Error Handling
- Zod validation
- Structured error responses
- Integration tests

### Phase 4: Documentation
- API docs
- Quickstart
- Examples
```

### research.md (if needed)
```markdown
# Research: {FEATURE}

## Questions
- What's the best way to store user preferences?
- Should preferences be versioned?

## Alternatives Considered
1. Option A: Single preferences object (chosen)
   - Pros: Simple, fast
   - Cons: Limited history
2. Option B: Versioned preferences
   - Pros: Full audit trail
   - Cons: More complex

## Technology Decisions
- Use Prisma for ORM (already in use)
- Store as JSON field (efficient, flexible)
- No versioning for MVP (can add later)

## Open Questions
- [Remaining unknowns]
```

### data-model.md (if applicable)
```markdown
# Data Model: {FEATURE}

## Changes to schema.prisma

### New Table: UserPreference
```prisma
model UserPreference {
  id String @id @default(cuid())
  userId String
  user User @relation(fields: [userId], references: [id])
  
  key String
  value Json
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([userId, key])
}
```

### Invariants
- Exactly one preference per key per user
- Values are arbitrary JSON (application validates)

### Migrations Needed
- Create UserPreference table
- Add index on (userId, key)
```

### contracts/ (if applicable)
```markdown
# API Contracts

## GET /preferences
**Request**: None
**Response (200)**:
```json
{
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}
```

## POST /preferences
**Request**:
```json
{
  "key": "theme",
  "value": "light"
}
```
**Response (201)**: Created preference
**Response (400)**: VALIDATION_ERROR
**Response (409)**: Already exists

## Error Codes
- VALIDATION_ERROR: 400
- NOT_FOUND: 404
- ALREADY_EXISTS: 409
- INTERNAL_SERVER_ERROR: 500
```

### quickstart.md (if helpful)
```markdown
# Quickstart: Test User Preferences

## Setup
1. Start API: `npm run dev`
2. Create test user: [steps]
3. Create preference: `curl -X POST http://localhost:3333/preferences ...`

## Verify
- [ ] Can create preference
- [ ] Can retrieve preferences
- [ ] Can update preference
- [ ] Can delete preference
- [ ] Validation errors return 400
- [ ] Unauthenticated requests return 401

## Troubleshooting
- [Common issues and fixes]
```

---

## Key Decisions

### Decision 1: Phased Delivery
Plan breaks implementation into phases:
1. Foundation (schema, models)
2. API implementation
3. Validation/error handling
4. Testing/documentation

Each phase is independently valuable but builds on previous.

### Decision 2: Testing Strategy
- Test-first discipline (tests before implementation)
- Unit tests for services
- Integration tests for routes
- Coverage tracking

### Decision 3: Constitution Alignment
- Every requirement checked against constitution
- Any violations explained and justified
- Testing framework matches constitution requirements
- Error handling matches standards

---

## Checklist Before Tasks Phase

- [ ] plan.md written and complete
- [ ] Technical context clearly defined
- [ ] Constitution compliance verified
- [ ] Project structure documented
- [ ] Phased delivery clear and sequenced
- [ ] data-model.md created (if needed)
- [ ] contracts/ created (if APIs)
- [ ] research.md created (if needed)
- [ ] quickstart.md created (if helpful)
- [ ] Ready for tasks phase

---

## Common Plan Contents

### For Backend Features
- Language/framework (Fastify, Node, etc.)
- Database changes (Prisma schema)
- API routes to create
- Services/repositories needed
- Error handling strategy
- Testing approach

### For Frontend Features
- UI framework (React)
- Component structure
- State management
- API integration points
- Navigation/routing changes
- Testing approach

### For Database Changes
- Schema changes (Prisma)
- Migrations needed
- Data backfill strategy
- Rollback plan
- Performance impact

---

## Next Steps

1. **Review Plan**: Ensure technical decisions are sound
2. **Optional: Ask Questions**: Clarify any technical decisions
3. **Tasks Phase**: `/skill:tasks`

---

## Tips

- **Be specific**: "Fastify 5 + Prisma + Zod" beats "use backend stuff"
- **Think phases**: Break feature into logically sequenced parts
- **Document decisions**: Explain WHY each choice (not just WHAT)
- **Plan for testing**: Include testing strategy upfront
- **Consider constitution**: Ensure plan respects all rules
- **Note unknowns**: Flag open questions for research phase