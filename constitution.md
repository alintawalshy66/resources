<!--
Sync Impact Report
- Version change: 1.12.0 -> 1.12.1
- Modified principles: none
- Added principles: none
- Added clarifications: none
- Renumbered sections: none
- Removed sections: none
- Templates requiring updates: none
- Follow-up TODOs: none
-->

# CoachCW Constitution (v1.12.1)

## Purpose, Users & Scope

### Primary users

CoachCW is designed for:

- New or returning exercisers building base fitness
- Busy professionals trying to train around work and family demands
- Amateur athletes looking to take the next step in their sport

### Scope of this repo

This repository governs:

- A **web-based application** as the primary interface (initially desktop web, mobile web later)
- Training plans, sessions, and progress **logging & tracking**
- Surfacing **simple metrics** (e.g. consistency, load trends, key performance indicators)
- In-app **guidance & education** explaining the “why” behind recommendations
- A **Docker-based local development environment** and related tooling

Future scope (explicitly allowed but not required now):

- **3rd-party integrations** (e.g. watches, bike computers, heart-rate straps) via APIs
- Background jobs or services that process training data for insights

Any major expansion beyond this (e.g. nutrition tracking, e-commerce, or medical tooling) must be explicitly added to this constitution and reviewed.

---

## Core Principles

### I. User Outcomes First (NON-NEGOTIABLE)

Every initiative must anchor to explicit user journeys and measurable success criteria before design or build.  
Prioritize by user value (P1, P2, P3) and keep acceptance criteria **testable and observable** so progress can be demonstrated quickly.

---

### II. Test-First Reliability (NON-NEGOTIABLE)

All new behavior MUST begin with failing automated tests.

Required coverage levels:
- Unit tests for domain logic and invariants.
- Integration tests for API boundaries and lifecycle flows.
- Contract tests when modifying request/response schemas.
- Regression tests for every bug fix.

Code MAY NOT merge unless:
- All tests pass locally and in CI.
- New domain rules are explicitly covered by tests.
- Critical failure paths are tested.
- Edge cases are tested where invariants are involved.

Test execution is mandatory:
- Tests MUST be executed before every merge.
- Feature branches MUST NOT bypass test runs.
- Failing tests MUST block merge.

If a feature introduces new domain states, lifecycle transitions, or invariants, 
corresponding tests are required in the same branch.

Absence of tests for new behavior constitutes a violation of this constitution.

---

### III. Incremental, Releasable Slices

Work is broken into independently valuable slices that can ship on their own.  
Avoid cross-story coupling; favor feature flags or configuration to keep incomplete work disabled while keeping the main branch releasable at all times.

---

### IV. Text-First Interfaces & Traceability

Automation and tooling favor text I/O (stdin/stdout/stderr) with deterministic, parseable output to enable scripting, debugging, and reproducibility.  
All commands and scripts must emit structured logs for traceability.

---

### V. Observability & Change Safety

Changes must include meaningful logging, error handling, and (where applicable) metrics that expose health and user impact.

- Dependencies are pinned
- Secrets are excluded from the repo
- Every change includes a rollback or disable strategy
- Global infrastructure behaviors (server lifecycle, request parsing, auth, CORS) MUST be logged and diagnosable in integration environments

**Error Semantics Clarification**

- Recoverable errors MAY surface retry affordances or alternative user actions.
- Structural or invariant violations MUST halt affected flows until resolved.
- UX “graceful degradation” applies only to recoverable errors, never to invariant failures.

---

### VI. Backend Authority & Invariants (NON-NEGOTIABLE)

The backend is the sole authority for domain truth and invariants.

- Structural invariants (e.g. “exactly one active session”) MUST be enforced server-side.
- The frontend MUST NOT infer, repair, or bypass invariant failures.
- When invariants are violated, the system MUST fail explicitly with a structured error.
- Silent fallback, partial success, or “best guess” behavior is prohibited for invariant failures.

Invariant violations are considered system health issues and MUST be observable, logged, and test-covered.

---

#### Identity Boundary & Authorization Authority (Clarification)

**User identity is the only valid external identity boundary.**

- All external APIs MUST accept and operate on **user identity (`userId`) only**.
- Athlete identity is a **derived, internal concern** and MUST be resolved server-side.
- No repository, service, or route handler may accept `athleteId` as a boundary input.
- Athlete identifiers MUST NOT appear in public API contracts.

**Authorization semantics**

- **401 Unauthorized** MUST be returned when no valid user identity is present.
- **403 Forbidden** MUST be returned only after identity resolution, when a valid user is authenticated but lacks access to the resolved resource.
- Validation errors MUST NOT return 403.

These rules exist to ensure:
- Clear ownership semantics
- Consistent authorization behavior
- Long-term support for multi-athlete, coach, and delegated access models

---

#### Execution vs Planning Authority (Clarification)

- Session execution MUST NOT depend on planning structures (programs, phases, blocks).
- An athlete MUST be able to train, log sessions, and view progress without any program defined.
- Planning structures MAY reference, organize, or contextualize session execution, but MUST NOT own or gate it.
- Creation of planning structures MUST be driven by explicit user intent (e.g. “upgrade to program”), never silently inferred.

This rule exists to preserve execution-first onboarding, historical data integrity, and clear user intent boundaries.

---

#### Feature Gating Authority (Clarification)

**The backend is the sole authority for feature visibility.**

- A central feature registry MUST define all gated features, their keys, and their eligibility conditions.
- The backend MUST evaluate the resolved feature set per user and return it via a dedicated endpoint.
- The frontend MUST consume the resolved feature set from the backend — it MUST NOT make independent gating decisions based on role, subscription, or any other locally inferred state.
- Gated features MUST be removed from the DOM entirely when disabled — CSS-hiding or opacity tricks are prohibited.
- No route handler, service, or UI component MAY implement ad-hoc gating logic (subscription checks, role checks, env-var flags) outside the registry evaluation path.
- Dev-time overrides MUST affect frontend rendering only and MUST NOT bypass backend enforcement.
- On any evaluation error or ambiguous state, the system MUST fail closed — all gated features treated as disabled.

This rule exists to ensure feature access is consistent, auditable, and enforced at a single authoritative location — not scattered across routes and components.

---

### VII. Test Architecture & Lifecycle Invariants (NON-NEGOTIABLE)

Automated tests are a **first-class enforcement mechanism** for system authority and invariants.  
Test infrastructure MUST NOT undermine or contradict production lifecycle rules.

**Fastify Server Lifecycle**

- Integration tests MUST create the Fastify server exactly once per test file.
- Servers MUST be created in `beforeAll`, never in `beforeEach`.
- Servers MUST NOT be conditionally or lazily instantiated.
- `app.close()` MUST NOT be called in integration tests unless the test file exclusively owns the server instance.

**Database Connection Ownership**

- Database connections are process-global during test runs.
- Integration tests MUST NOT call `connectionManager.connect()` or `disconnect()` unless explicitly designated as environment-level tests.
- Per-test isolation MUST be achieved via data cleanup, not connection teardown.

**Integration Test Isolation**

- Integration tests MUST assume other test suites run in the same process.
- Tests MUST NOT rely on implicit global seeded state.
- Tests MUST NOT assume execution order or exclusivity.

**Zero-State Validity**

- Absence of domain structure (e.g. programs, sessions) is a valid system state.
- Tests MUST explicitly create required data and MUST NOT rely on implicit initialization side-effects.

**Request Lifecycle Hook Discipline (Fastify) (NON-NEGOTIABLE)**

Fastify request lifecycle hooks are **infrastructure-level** behaviors and MUST be treated as invariants.

- `preParsing` MUST NOT be used for general-purpose plugins (cookies, auth, CORS, logging, validation, etc.).
- `preParsing` MAY be used only for explicit stream transformation use-cases and MUST meet ALL requirements:
  - The hook MUST defensively handle `payload` being `undefined` or non-stream.
  - The hook MUST NOT assume `payload.length` exists.
  - The hook MUST NOT rely on `request.body` (it is not available at `preParsing`).
  - The hook MUST be documented in the server bootstrap and have an integration test that exercises both “body present” and “body absent” requests.
- Plugins that only read headers (e.g. cookie parsing) MUST run at `onRequest` (or plugin default) and MUST NOT be configured to run earlier.
- Features MUST NOT register or re-register lifecycle-affecting plugins. All such registration MUST be centralized in server bootstrap (e.g. `api/src/server.ts`).

**Infrastructure Regression Guard**

- Any bug caused by lifecycle hook misuse (server lifecycle or request lifecycle) MUST result in a regression test or guardrail that prevents recurrence.
- If a dependency/plugin requires non-default lifecycle configuration, the configuration MUST be justified in-code with a comment explaining why default behavior is insufficient.

Violations of these rules constitute **architectural defects**, not feature bugs, and MUST be corrected before feature work proceeds.

---

### VIII. Roadmap Authority & Sequencing Discipline

The project roadmap is the authoritative record of feature intent, sequencing, and dependencies.

- Every feature MUST be represented in the roadmap with an explicit **status**, **order**, and **declared dependencies**.
- Declared dependencies are **hard constraints** and MUST be satisfied before implementation proceeds.
- Feature order is **advisory**, not mandatory.

Tooling MAY warn when work proceeds out of the declared order, but MUST NOT block implementation solely due to ordering.

Ordering warnings exist to prompt deliberate decision-making, not to enforce rigidity.  
Engineers retain the authority to intentionally work out of order when justified.

Feature branches MUST NOT merge into main unless:
- Tests pass.
- Review checklist is completed.
- Constitution compliance is confirmed.

---

### IX. Cross-Feature Consistency & Review Enforcement (NON-NEGOTIABLE)

CoachCW must maintain architectural, structural, and philosophical consistency across all features.

Every feature MUST:

- Follow established folder and naming conventions (kebab-case).
- Preserve domain invariants and lifecycle rules.
- Maintain Backend Authority.
- Avoid mutation of immutable artifacts (e.g. planSnapshot).
- Include tests that reflect new or modified invariants.
- Update relevant documentation when behavior changes.

Before merge, every feature MUST undergo structured review.

Review must confirm:
