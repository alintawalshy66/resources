---
name: tasks
description: Break a feature plan into atomic, execution-window-grouped tasks with explicit context boundaries. Use this skill after plan is complete to create tasks.md with task items grouped into execution windows (3 tasks max per window), traced back to requirements, with clear dependencies and fresh-context boundaries for GSD-style isolated execution.
---

# Tasks Skill (Option C: Execution Windows)

Break implementation plan into atomic, execution-window-grouped, implementation-ready tasks.

## How to Use

In Pi:

```bash
/skill:tasks
```

---

## Prerequisites

- ✅ Feature directory exists: `specs/{FEATURE_ID}/`
- ✅ spec.md completed
- ✅ plan.md completed
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
   - Note testing requirements
   - Note architectural rules

2. **Load Spec**
   - Read all user stories (P1, P2, P3)
   - Read all requirements (FR-001, ...)
   - Read all acceptance criteria (AC-001, ...)

3. **Load Plan**
   - Read technical approach
   - Read phased delivery structure
   - Read data model (if present)
   - Read API contracts (if present)

### Phase 2: Create Task Structure (with Execution Windows)

4. **Define Execution Window 1: Foundation**
   - Database schema creation
   - Model/entity creation
   - Infrastructure that BLOCKS all other work
   - **Critical**: This window MUST complete before any user story work starts
   - **Target**: 2-4 tasks, fits in ~60-80k tokens

5. **Define Execution Windows 2+: User Stories (one window per priority)**
   - Window per P1 (MVP)
   - Window per P2 (if present)
   - Window per P3 (if present)
   - **Target**: 2-3 tasks per window, ~50-80k tokens per window
   - Each window independently valuable but depends on Foundation

6. **Define Final Execution Window: Polish (optional)**
   - Documentation
   - Cleanup
   - Performance optimization
   - **Target**: 1-3 tasks

### Phase 3: Estimate Window Size

7. **For Each Execution Window**:
   - Estimate total token budget: ~60-100k per window (leaving 50k headroom)
   - Account for:
     - Test files to read/write
     - Implementation files to create/modify
     - Debugging and refactoring
     - State.md context overhead
   - If a logical group exceeds budget, split into multiple windows

8. **Document Window Rationale**
   - Why these tasks belong together?
   - What dependency between them?
   - What checkpoint validates this window is complete?

### Phase 4: Write Tasks

9. **For Each Task:**
   - Assign unique ID (T001, T002, ...)
   - Write clear, atomic description (one file or one feature)
   - Assign to execution window (T001 in Window 1, T002 in Window 1, etc.)
   - Mark if parallel [P] (within same window)
   - Show dependencies
   - Show traceability (which requirement/story)
   - Include test expectations

10. **Format Tasks**
    ```
    T001 [P] Create execution_note migration
    - Window: 1 (Foundation)
    - Traceability: FR-001
    - Dependencies: none
    - Phase: Database
    - Description: Create database migration for execution_note table
    - Test: Migration runs without error

    T002 Create ExecutionNote model
    - Window: 1 (Foundation)
    - Traceability: FR-001
    - Dependencies: T001 (migration ready)
    - Phase: Models
    - Description: Create Prisma model in schema.prisma
    - Test: Unit test validates model structure
    ```

11. **Organize by Execution Window**
    ```
    ## Execution Window 1: Foundation (BLOCKING)
    Purpose: Core infrastructure that blocks all feature work
    Token Budget: 60-80k
    Checkpoint: All tasks pass, migration runs, models validated

    - T001 [P] Create migration file
    - T002 [P] Add schema to Prisma
    - T003 Create ExecutionNote model
    - T004 Create ExecutionNoteRepository (scoped userId)

    [WINDOW_CHECKPOINT_1: Foundation ready - user story work can begin]

    ## Execution Window 2: User Story 1 (P1) - Create Notes
    Purpose: MVP - Athletes can create and retrieve notes
    Token Budget: 70-90k
    Checkpoint: All AC-001 through AC-003 passing

    - T005 Contract test for POST /sessions/:id/notes
    - T006 Contract test for GET /sessions/:id
    - T007 Create POST route for notes
    - T008 Modify GET to include notes in response
    - T009 Integration test: create → retrieve → verify

    [WINDOW_CHECKPOINT_2: P1 complete, MVP working]

    ## Execution Window 3: User Story 2 (P2) - Edit/Delete Notes
    Purpose: Post-session corrections
    Token Budget: 70-90k
    Checkpoint: All AC-004 through AC-005 passing

    - T010 Contract test for PATCH
    - T011 Contract test for DELETE
    - T012 Create PATCH route
    - T013 Create DELETE route
    - T014 Ownership verification (Principle VI)
    - T015 Integration test: edit → delete → verify

    [WINDOW_CHECKPOINT_3: P2 complete, full CRUD working]

    ## Execution Window 4: Polish & Documentation
    Purpose: Final validation and cleanup
    Token Budget: 40-60k (lighter window)
    Checkpoint: Docs updated, no warnings in tests

    - T016 Update docs/API.md with examples
    - T017 Code cleanup and refactoring
    - T018 Final integration test covering all ACs
    ```

### Phase 5: Document Dependencies & Checkpoints

12. **Create Execution Dependency Graph**
    ```
    Window 1 (Foundation) ← NO dependencies, can start immediately
      ↓
    Window 2 (P1) ← DEPENDS: Window 1 complete
      ↓ (can proceed in parallel if staffed)
    Window 3 (P2) ← DEPENDS: Window 2 complete
      ↓
    Window 4 (Polish) ← DEPENDS: Window 3 complete
    ```

13. **Identify Parallel Opportunities**
    - Mark tasks with [P] if they can run simultaneously WITHIN the same window
    - Example: T001 and T002 in Window 1 both write to schema.prisma, so NOT parallel
    - Example: T005 and T006 both write tests but different files, so [P]
    - **Rule**: [P] tasks must not touch same file

14. **Define Checkpoints**
    - After each window, implement skill pauses
    - Checkpoint validates: "Does this window's output work?"
    - Example: "Can we run migrations? Do models compile?"
    - Before next window starts, previous window checkpoint must pass

---

## Output Format

### tasks.md Structure (Option C)

```markdown
# Tasks: {FEATURE_NAME}

**Input**: Specs from `/specs/{FEATURE_ID}/`
**Strategy**: Option C Execution Windows (GSD-aligned)
**Windows**: [X total, estimate [Y] hours total]

---

## Format Guide

- **[P]**: Can run in parallel (different files, same window)
- **Window N**: Execution context boundary (fresh 200k context window)
- **WINDOW_CHECKPOINT**: Validation gate before next window
- **Traceability**: Each task traces back to spec (FR-XXX, AC-XXX, US-X)
- **Dependency**: What prior work must be done

---

## Execution Window 1: Foundation (BLOCKING)

**Purpose**: Core infrastructure required before ANY feature work

**Token Budget**: 60-80k (estimate; implement skill will report actual)

**Checkpoint Validation**:
- [ ] Migration runs: `npm run migrate:dev`
- [ ] Models compile: `npx prisma generate`
- [ ] Repository unit tests pass
- [ ] Can proceed to Window 2

---

### T001 [P] Create database migration for execution_notes table

**Window**: 1 (Foundation)
**Phase**: Database
**Traceability**: FR-001 (System MUST persist notes)
**Dependencies**: None
**Description**: Create migration file in api/prisma/migrations/{DATE}_create_execution_notes/

**What to create**:
- File: api/prisma/migrations/{DATE}_create_execution_notes/migration.sql
- Table: execution_notes with columns:
  - id (primary key, cuid)
  - userId (foreign key, cascade)
  - sessionLogId (foreign key, cascade)
  - exerciseLogId (foreign key, cascade)
  - content (varchar 500)
  - createdAt, updatedAt
- Constraints: unique(sessionLogId, exerciseLogId), index on userId
- No data loss risk (new table)

**Test**: Migration runs without error
```bash
npm run migrate:dev
# Verify: psql coachcw -c "\dt" shows execution_notes table
```

---

### T002 [P] Add ExecutionNote model to schema.prisma

**Window**: 1 (Foundation)
**Phase**: Models
**Traceability**: FR-001 (System MUST persist notes)
**Dependencies**: T001 (migration file created, defines schema)
**Description**: Add Prisma model matching migration schema

**What to create**:
- File: api/prisma/schema.prisma
- Add model ExecutionNote with:
  - All fields from migration
  - Relations to User, SessionLog, ExerciseLog
  - @@unique constraint matching migration
  - @@index on userId

**Test**: Model compiles
```bash
npx prisma generate
# Verify: No errors, Prisma client regenerated
```

---

### T003 Create ExecutionNoteRepository (scoped to userId)

**Window**: 1 (Foundation)
**Phase**: Repository (Backend Authority, Principle VI)
**Traceability**: FR-001, Principle VI (Backend Authority)
**Dependencies**: T002 (model ready)
**Description**: Create repository with userId-scoped constructor (enforces data ownership)

**What to create**:
- File: api/src/repositories/execution-note-repository.ts
- Constructor: `ExecutionNoteRepository(userId: string)`
- Methods:
  - `create(sessionLogId, exerciseLogId, content)` → returns ExecutionNote
  - `update(noteId, content)` → returns updated note, verifies userId ownership, throws 403 if not owner
  - `delete(noteId)` → returns void, verifies userId ownership, throws 403 if not owner
  - `findBySession(sessionLogId)` → returns notes for session (userId-scoped)
  - `findByExercise(exerciseLogId)` → returns notes for exercise (userId-scoped)

**Test**: Unit test in api/src/repositories/__tests__/execution-note-repository.test.ts
```
- Test: create() saves note with userId
- Test: update() fails with 403 if userId doesn't match
- Test: delete() fails with 403 if userId doesn't match
- Test: findBySession() returns only this user's notes
```

All tests must PASS before proceeding.

---

[WINDOW_CHECKPOINT_1]

**Before proceeding to Window 2**:
- [ ] T001: Migration runs without error
- [ ] T002: Prisma generates without error
- [ ] T003: All repository unit tests pass
- [ ] Foundation is ready for feature development

If all checkpoints pass, proceed to Window 2.
If any checkpoint fails, debug and fix within Window 1 (do NOT proceed).

---

## Execution Window 2: User Story 1 (P1) - Create & Read Notes

**Purpose**: MVP - Athletes can create and view notes (happy path)

**Token Budget**: 70-90k

**Checkpoint Validation**:
- [ ] POST /sessions/:id/notes returns 201
- [ ] GET /sessions/:id includes notes
- [ ] All AC-001 through AC-003 passing
- [ ] Can proceed to Window 3

---

### T004 [P] Contract test for POST /sessions/:sessionId/notes

**Window**: 2 (P1 - Create)
**Phase**: Tests (write FIRST, must fail before implementation)
**Traceability**: AC-001 (Given athlete, When note submitted, Then 201)
**Dependencies**: T003 (repository ready)
**Description**: Write contract test for note creation endpoint

**What to create**:
- File: api/src/__tests__/contract/execution-notes.contract.test.ts
- Test name: "POST /sessions/:sessionId/notes returns 201 on valid input"
- Test setup:
  - Create authenticated user (userId)
  - Create session and exercise
  - Call POST /sessions/{sessionId}/exercises/{exerciseId}/notes with valid note
- Expected: 201 response with note object matching schema
- Additional tests:
  - POST with empty content → 400 VALIDATION_ERROR
  - POST with content > 500 chars → 400 VALIDATION_ERROR
  - POST unauthenticated → 401 UNAUTHORIZED
  - POST to another user's session → 403 FORBIDDEN

**Test Status**: Must FAIL before T007 implementation (no route exists yet)

---

### T005 [P] Contract test for GET /sessions/:sessionId (modified response)

**Window**: 2 (P1 - Read)
**Phase**: Tests (write FIRST, must fail before implementation)
**Traceability**: AC-002 (When retrieve session, Then notes included)
**Dependencies**: T003 (repository ready)
**Description**: Write contract test for modified GET /sessions/:id that includes notes

**What to create**:
- File: api/src/__tests__/contract/execution-notes.contract.test.ts (same file as T004)
- Test name: "GET /sessions/:sessionId includes notes in exercise objects"
- Test setup:
  - Create session with notes on 2 exercises
  - Call GET /sessions/:sessionId
- Expected: Response includes exercises with notes nested
- Schema example:
  ```json
  {
    "exercises": [
      {
        "id": "...",
        "name": "Squat",
        "note": {
          "id": "note-123",
          "content": "Good form",
          "createdAt": "..."
        }
      }
    ]
  }
  ```

**Test Status**: Must FAIL before T008 implementation (GET doesn't include notes yet)

---

### T006 [P] Integration test for create → retrieve → verify flow

**Window**: 2 (P1 - Integration)
**Phase**: Tests (write FIRST)
**Traceability**: AC-003 (Complete flow validation)
**Dependencies**: T003 (repository ready)
**Description**: Write integration test validating full user story 1 happy path

**What to create**:
- File: api/src/__tests__/integration/execution-notes.integration.test.ts
- Test scenario:
  1. Create session
  2. Log exercise
  3. POST /sessions/:id/exercises/:exId/notes with "Great form"
  4. GET /sessions/:id
  5. Verify note appears in response with correct content
- Expected: All steps succeed, note data persists and retrieves correctly

**Test Status**: Must FAIL before T007/T008 implementation

---

### T007 Create POST /sessions/:sessionId/exercises/:exerciseId/notes route

**Window**: 2 (P1 - Create Implementation)
**Phase**: Implementation (after tests fail)
**Traceability**: AC-001 (201 on valid submission)
**Dependencies**: T004, T006 (contract tests must exist and fail)
**Description**: Implement route handler for note creation

**What to create**:
- File: api/src/routes/execution-notes.ts (new route file)
- Route: POST /sessions/:sessionId/exercises/:exerciseId/notes
- Handler:
  - Extract userId from session (auth)
  - Validate request body with Zod (content: string, max 500 chars)
  - Call `ExecutionNoteRepository(userId).create(sessionLogId, exerciseLogId, content)`
  - Return 201 with note object
- Error handling:
  - Validation error → 400 VALIDATION_ERROR
  - Unauthorized → 401 UNAUTHORIZED
  - Forbidden → 403 FORBIDDEN
  - DB error → 500 INTERNAL_SERVER_ERROR

**Test Status**: T004 must PASS after this implementation

---

### T008 Modify GET /sessions/:sessionId to include notes

**Window**: 2 (P1 - Read Implementation)
**Phase**: Implementation (after tests fail)
**Traceability**: AC-002 (Notes included in session response)
**Dependencies**: T005, T006 (contract tests must exist and fail)
**Description**: Extend existing GET /sessions/:id endpoint to include notes

**What to modify**:
- File: api/src/routes/sessions.ts (existing file)
- Locate: GET /sessions/:sessionId handler
- Modify response:
  - For each exercise in session, fetch notes via repository
  - Nest notes in exercise object
  - Return 200 with modified schema

**Test Status**: T005 must PASS after this modification

---

### T009 Integrate routes and run integration test

**Window**: 2 (P1 - Integration)
**Phase**: Integration (after implementation)
**Traceability**: AC-001, AC-002, AC-003 (full flow)
**Dependencies**: T007, T008 (routes implemented)
**Description**: Register routes in app and verify integration test passes

**What to do**:
- File: api/src/server.ts or api/src/app.ts
- Register: execution-notes.ts route plugin
- Run test:
  ```bash
  npm test -- execution-notes.integration.test.ts
  ```
- Verify: T006 integration test PASSES

**Test Status**: T006 must PASS, all P1 acceptance criteria validated

---

[WINDOW_CHECKPOINT_2]

**Before proceeding to Window 3**:
- [ ] T004: Contract test for POST passes
- [ ] T005: Contract test for GET passes
- [ ] T006: Integration test passes
- [ ] All AC-001 through AC-003 passing
- [ ] P1 (MVP) is complete and working

If all checkpoints pass, proceed to Window 3.
If any fails, fix within Window 2 (do NOT proceed).

---

## Execution Window 3: User Story 2 (P2) - Edit & Delete Notes

**Purpose**: Post-session corrections (extends P1)

**Token Budget**: 70-90k

**Checkpoint Validation**:
- [ ] PATCH /sessions/:id/notes/:noteId returns 200 or 403
- [ ] DELETE /sessions/:id/notes/:noteId returns 204 or 403
- [ ] All AC-004 through AC-005 passing
- [ ] Can proceed to Window 4

---

### T010 [P] Contract test for PATCH /sessions/:sessionId/notes/:noteId

**Window**: 3 (P2 - Edit Tests)
**Phase**: Tests
**Traceability**: AC-004 (Given logged note, When updated, Then 200 or 403)
**Dependencies**: T003 (repository ready)
**Description**: Write contract test for note update

**What to create**:
- File: api/src/__tests__/contract/execution-notes.contract.test.ts (add to same file)
- Tests:
  - PATCH own note → 200 with updated content
  - PATCH another user's note → 403 FORBIDDEN
  - PATCH with content > 500 chars → 400 VALIDATION_ERROR

**Test Status**: Must FAIL before T012 implementation

---

### T011 [P] Contract test for DELETE /sessions/:sessionId/notes/:noteId

**Window**: 3 (P2 - Delete Tests)
**Phase**: Tests
**Traceability**: AC-005 (Given logged note, When deleted, Then 204 or 403)
**Dependencies**: T003 (repository ready)
**Description**: Write contract test for note deletion

**What to create**:
- File: api/src/__tests__/contract/execution-notes.contract.test.ts (add to same file)
- Tests:
  - DELETE own note → 204 NO_CONTENT
  - DELETE another user's note → 403 FORBIDDEN
  - DELETE non-existent note → 404 NOT_FOUND

**Test Status**: Must FAIL before T013 implementation

---

### T012 Create PATCH route with ownership verification

**Window**: 3 (P2 - Edit Implementation)
**Phase**: Implementation (after tests fail)
**Traceability**: AC-004 (Update with ownership check)
**Dependencies**: T010 (contract test must exist and fail)
**Description**: Implement PATCH endpoint with Principle VI (Backend Authority) ownership check

**What to create/modify**:
- File: api/src/routes/execution-notes.ts (add to existing file)
- Route: PATCH /sessions/:sessionId/exercises/:exerciseId/notes/:noteId
- Handler:
  - Extract userId from session
  - Call `ExecutionNoteRepository(userId).update(noteId, content)`
  - Repository enforces userId ownership (throws 403 if not owner)
  - Return 200 with updated note
- Error handling: 400 validation, 403 forbidden, 404 not found, 500 error

**Test Status**: T010 must PASS after this implementation

---

### T013 Create DELETE route with ownership verification

**Window**: 3 (P2 - Delete Implementation)
**Phase**: Implementation (after tests fail)
**Traceability**: AC-005 (Delete with ownership check)
**Dependencies**: T011 (contract test must exist and fail)
**Description**: Implement DELETE endpoint with Principle VI ownership check

**What to create/modify**:
- File: api/src/routes/execution-notes.ts (add to existing file)
- Route: DELETE /sessions/:sessionId/exercises/:exerciseId/notes/:noteId
- Handler:
  - Extract userId from session
  - Call `ExecutionNoteRepository(userId).delete(noteId)`
  - Repository enforces userId ownership (throws 403 if not owner)
  - Return 204 NO_CONTENT
- Error handling: 403 forbidden, 404 not found, 500 error

**Test Status**: T011 must PASS after this implementation

---

### T014 [P] Integration test for edit → delete flow

**Window**: 3 (P2 - Integration)
**Phase**: Integration (after implementation)
**Traceability**: AC-004, AC-005 (full flow)
**Dependencies**: T012, T013 (routes implemented)
**Description**: Write integration test validating P2 flow

**What to create**:
- File: api/src/__tests__/integration/execution-notes.integration.test.ts (add to existing file)
- Test scenario:
  1. Create note via P1 flow
  2. PATCH note with updated content
  3. GET session, verify updated content
  4. DELETE note
  5. GET session, verify note gone
- Expected: All steps succeed, data consistent

**Test Status**: Must PASS after T012/T013

---

[WINDOW_CHECKPOINT_3]

**Before proceeding to Window 4**:
- [ ] T010: Contract test for PATCH passes
- [ ] T011: Contract test for DELETE passes
- [ ] T012/T013: Routes implemented and tested
- [ ] T014: Integration test passes
- [ ] All AC-004 through AC-005 passing
- [ ] Full CRUD (Create, Read, Update, Delete) working

If all checkpoints pass, proceed to Window 4.
If any fails, fix within Window 3 (do NOT proceed).

---

## Execution Window 4: Polish & Documentation

**Purpose**: Final validation, documentation, cleanup

**Token Budget**: 40-60k (lighter window, mostly documentation)

**Checkpoint Validation**:
- [ ] All docs updated
- [ ] No warnings in test suite
- [ ] Code is clean

---

### T015 Update API documentation with execution notes examples

**Window**: 4 (Polish)
**Phase**: Documentation
**Traceability**: All features (user-facing docs)
**Dependencies**: T009, T014 (feature complete)
**Description**: Update docs/API.md with execution notes endpoints

**What to create/modify**:
- File: docs/API.md (or equivalent)
- Add section: "Execution Notes"
- Document:
  - POST /sessions/:id/exercises/:exId/notes (with example request/response)
  - GET /sessions/:id (modified response with notes)
  - PATCH /sessions/:id/exercises/:exId/notes/:noteId (with example)
  - DELETE /sessions/:id/exercises/:exId/notes/:noteId (with example)
  - Error responses and codes

**Test**: Docs are readable and examples are accurate

---

### T016 Code cleanup and refactoring

**Window**: 4 (Polish)
**Phase**: Refactoring
**Traceability**: All (quality)
**Dependencies**: T014 (feature complete)
**Description**: Clean up code, remove debug logs, ensure consistent style

**What to do**:
- Review all files created in Windows 1-3
- Remove console.logs, debug comments
- Ensure consistent naming and formatting
- Run linter: `npm run lint --fix`
- Run tests to ensure nothing broke: `npm test`

**Test**: All tests still pass, no lint warnings

---

### T017 Final validation: Run all feature tests

**Window**: 4 (Polish)
**Phase**: Validation
**Traceability**: All AC (final check)
**Dependencies**: T015, T016 (cleanup complete)
**Description**: Run full test suite for feature, verify no regressions

**What to do**:
```bash
npm test -- execution-notes
npm test -- sessions.integration (modified GET)
npm run lint
```

**Expected**: All tests pass, no warnings, coverage acceptable

**Test**: All AC-001 through AC-005 passing, no regressions

---

[WINDOW_CHECKPOINT_4]

**Feature Complete**:
- [ ] All windows passed checkpoints
- [ ] All acceptance criteria validated
- [ ] Documentation updated
- [ ] Code clean, tests green
- [ ] Ready for merge

---

## Summary

**Total Execution Windows**: 4
**Estimated Tokens**:
- Window 1 (Foundation): 60-80k
- Window 2 (P1): 70-90k
- Window 3 (P2): 70-90k
- Window 4 (Polish): 40-60k
- **Total**: 240-310k tokens (vs. single 400k+ session if done without windows)

**Savings**: ~100k tokens by isolating execution into clean contexts.

**Implementation Strategy**: 
- Each window executed in fresh 200k context
- Implement skill manages window boundaries
- STATE.md tracks checkpoint progress
- If a window fails, only that window is redone
- Clear hand-offs between windows via checkpoints

---

## Key Rules

### Rule 1: One Window = One Fresh Context
- Implement skill `/clear`s between windows
- Each window starts with clean 200k context
- Only prior checkpoint results in STATE.md carry forward

### Rule 2: Checkpoints Gate Progression
- Each window has explicit validation checklist
- MUST pass before proceeding to next window
- If checkpoint fails, stay in window and fix
- Never skip ahead

### Rule 3: Test-First Within Each Window
- Tests written FIRST in every task
- Tests must FAIL before implementation
- Tests must PASS after implementation
- Before window checkpoint, all tests pass

### Rule 4: Traceability Every Task
- Every task maps back to spec (FR-XXX, AC-XXX)
- Every AC validated by end of feature
- No orphaned work

### Rule 5: Window Independence
- Later windows depend on earlier windows' checkpoints, not conversation history
- Implement skill reads STATE.md, not chat memory
- Can restart any window without losing prior work

---

## Checklist Before Implement Phase

- [ ] All windows created and sequenced
- [ ] Tasks logically organized within windows
- [ ] Dependencies documented
- [ ] Parallel opportunities marked [P]
- [ ] Traceability to spec established (every task → FR/AC)
- [ ] Test-first tasks precede implementation tasks
- [ ] Checkpoints clearly defined (what validates completion?)
- [ ] Token budgets estimated per window
- [ ] Ready for implement skill with Option C window management

---

## Next Steps

1. **Review Tasks**: Understand window sequencing and checkpoints
2. **Implement Phase**: `/skill:implement`
   - Implement skill will manage windows, `/clear` between them, track STATE.md

---

## Tips

- **Keep tasks small**: One file or one feature per task
- **Group logically**: Tasks in same window should have natural dependencies
- **Estimate tokens**: Foundation window heavier, polish window lighter
- **Checkpoint thoroughly**: Don't move to next window on hope
- **Use STATE.md**: Implement skill will read it, not chat history