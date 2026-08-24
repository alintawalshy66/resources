---
name: code-reviewer
description: Review changed work against available intent, tests, architecture, and constitutional rules. Supports issue/PR/spec-driven work and small diff-driven tinkering sessions. Discovers repo-specific checks, enforces the change classification/TDD gate, and flags deep-module violations. Reports findings only; does not auto-fix.
---

# Code Reviewer Skill

Review completed work before merge or handoff. Produce a structured report with a clear `APPROVED`, `CHANGES REQUIRED`, or `BLOCKED` outcome.

This skill is intentionally **not spec-dependent**. It works for large planned features, GitHub issues/PRs, and small local tinkering sessions.

## Usage

```bash
/skill:code-reviewer [optional intent source]
```

Examples:

```bash
/skill:code-reviewer
/skill:code-reviewer #96
/skill:code-reviewer https://github.com/org/repo/pull/123
/skill:code-reviewer "Review the local diff for the navbar label tweak"
```

---

## What This Skill Does

1. Finds the best available source of intent.
2. Reviews only changed work, not unrelated existing code.
3. Classifies the change type before judging test requirements.
4. Discovers repo-specific standards, principles, constitutions, and architectural guidance.
5. Discovers repo-specific build/test/typecheck/lint/check commands.
6. Runs clear, appropriate automated checks when safe.
7. Reviews the diff against the discovered standards and embedded checklist, including Deep Modules and TDD evidence.
8. Reports findings with exact files/lines and recommended fixes.
9. Does **not** auto-fix unless the user explicitly asks after the review.

---

## Phase 1: Load Context

### 1. Establish the review target

Prefer the narrowest available diff:

1. Pull request diff, if a PR URL/number is provided.
2. GitHub issue branch/diff, if an issue is provided and branch can be inferred.
3. Current branch against its merge base with the default branch.
4. Local staged/unstaged diff when no branch comparison is available.

Useful commands:

```bash
git status --short
git branch --show-current
git remote show origin
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}')
git merge-base HEAD "origin/${DEFAULT_BRANCH:-main}" 2>/dev/null || git merge-base HEAD "${DEFAULT_BRANCH:-main}" 2>/dev/null
git diff --stat
git diff
git diff --cached
```

Do not review unrelated existing code unless needed to understand changed code.

### 2. Resolve intent source

Use this priority order:

1. **GitHub issue or PR description** when provided or discoverable.
   - Prefer `gh issue view` / `gh pr view` when available.
2. **Explicit review brief or current conversation context** when supplied.
3. **Commit messages and changed files** as fallback.
4. **Diff-only architectural/test/safety review** when intent is unavailable.

Absence of a formal spec is not a blocker. If intent is unavailable, state that traceability is limited and review for correctness, tests, architecture, safety, and maintainability.

### 3. Load local guidance and repo standards

Read relevant repo guidance if present:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- contribution docs
- `.github/workflows/*`
- local constitution/reference docs if present

Then perform a dedicated repo standards discovery pass. Look for documents whose names or headings imply enforceable standards, including:

- `constitution.md`, `constitution*.md`, `.specify/memory/constitution.md`
- `engineering-principles.md`, `engineering-standards.md`, `development-standards.md`
- `architecture.md`, `ARCHITECTURE.md`, `docs/architecture*.md`
- `docs/refactor-audit.md`, `docs/adr/*`, `docs/agents/*`
- `CONTEXT.md`, `CONTEXT-MAP.md` when they define domain language or invariants
- any local guidance file that says rules are "hard rules", "standards", "principles", "non-negotiable", or "constitution"

If this shared workflow repo is available, also read the canonical constitution routing entrypoint and any clearly applicable mapped document:

- `shared-workflows/references/constitution.md`
- mapped work-type document when a work-type selector is available

Do not hard-block manual/local reviews only because a work-type label or prompt header is absent. Instead, state which constitution/standards were loaded and what could not be routed. If a repository-specific constitution or standards document exists, enforce it. If no constitution or standards exist, apply this skill's checklist as the review standard.

Treat explicit hard-rule/standards violations in discovered docs as review defects even when automated checks pass.

### 4. Inspect changed files and surrounding seams

Read changed files and only enough surrounding code to understand:

- public interfaces touched
- tests that should cover the behavior
- module boundaries
- ownership/auth/invariant enforcement
- build/test/typecheck/lint tooling

---

## Phase 2: Classify the Change

Classify the review before deciding whether new tests are required.

### Change classes

1. **Trivial non-behavior change**
   - Examples: label text, copy, docs, comments, formatting, obvious dead-code deletion.
   - TDD/new tests are not required.
   - Manual verification is acceptable; report what should be checked.

2. **Behavior change**
   - Examples: domain logic, API behavior, validation, state transitions, UI interaction, data fetching, error handling, persistence, authorization, feature gating.
   - Test evidence is required.

3. **Bug fix**
   - Regression test evidence is required.

4. **Structural refactor / deep-module extraction**
   - Tests should prove behavior preservation through public behavior or the new public seam.
   - New meaningful module interfaces should have direct tests when practical.

5. **Ambiguous**
   - Treat as behavior change until clarified.

### TDD enforcement standard

Review final diff evidence, not process claims.

Acceptable evidence:

- tests added or updated for changed observable behavior
- regression test for a bug fix
- module/interface tests for new deep-module seams
- existing tests clearly cover the changed behavior, with those tests identified in the report

Not sufficient by itself:

- “I tested manually” for a behavior change
- “existing tests probably cover it” without naming them
- large refactor with no tests around preserved behavior or public seams
- new module interface with no test path and no justification

---

## Phase 3: Discover and Run Checks

### Command discovery order

Discover commands from the repo rather than hardcoding project names or package managers.

1. Local guidance and standards: `AGENTS.md`, `CLAUDE.md`, `README.md`, contribution docs, engineering standards/principles.
2. CI definitions: `.github/workflows/*`, other CI config.
3. Project manifests:
   - `package.json` scripts
   - `Makefile`
   - `justfile`
   - `pyproject.toml`
   - language-specific equivalents
4. Existing test/check commands visible in scripts or docs.
5. Tool config files even when scripts are missing, such as `tsconfig.json`, ESLint configs, Ruff configs, MyPy configs, Pytest config, Vitest config, Playwright config, formatter configs, or security-scan config.

### Required check categories

For changed code, discover and report these categories when applicable:

- **Tests**: unit, integration, regression, e2e, or focused tests for the touched behavior.
- **Build**: production/package build or compile step where available.
- **Type checks**: explicit typecheck scripts, compiler no-emit modes, MyPy/Pyright, TypeScript compiler, or language equivalent.
- **Lint/static analysis**: ESLint, Ruff, Flake8, Pylint, Biome, ShellCheck, or language equivalent.
- **Formatting**: only when the repo documents a formatter/check command.
- **Security/secret checks**: only when locally runnable without credentials or external services.

If a category is relevant but no command/config exists, report it as `NOT FOUND`; do not silently omit it.

Examples of inferred-but-not-hardcoded checks when scripts/configs exist:

- `package.json` has `build` but no typecheck script: consider `npm run build` and, if TypeScript config exists, `npx tsc --noEmit` when safe.
- `package.json` has `test`: consider `npm test` or the focused documented test command.
- Python repo has `pytest.ini` or tests: consider `pytest` from the documented working directory.
- Python repo has Ruff/MyPy/Pyright config: consider the matching local command if installed.

### Running checks

- Run clear, local, review-appropriate checks when they are safe and not obviously expensive.
- Prefer the same checks CI runs when practical.
- Prefer focused tests for the touched behavior, plus broader checks when scope/risk warrants it.
- If commands are ambiguous, destructive, require external services/credentials, or look expensive, ask before running.
- If no commands can be found for a relevant category, continue manual review and mark that category as `NOT FOUND`, not `FAIL`.
- If a relevant discovered check fails, outcome is `BLOCKED` until the failure is resolved or the user explicitly scopes it out with justification.

Record exact commands and pass/fail/not-run/not-found status by category.

---

## Phase 4: Review Checklist

For each section, mark `PASS`, `WARN`, `FAIL`, or `N/A`.

### 1. Intent & Scope Traceability

- Changed behavior matches the best available intent source.
- No unrelated scope creep is included.
- If intent is unavailable, the report explicitly says so.
- Non-goals or out-of-scope work are not implemented accidentally.

### 2. Change Classification & TDD Gate

- Change class is stated.
- Test expectations match the change class.
- Behavior changes have test evidence.
- Bug fixes have regression test evidence.
- Trivial non-behavior changes are not burdened with unnecessary test demands.
- Ambiguous changes are treated as behavior changes.

### 3. Deep Modules & Testable Interfaces

- Modules hide meaningful complexity behind simple, stable interfaces.
- No pass-through wrappers that merely forward unchanged arguments to one dependency.
- Public method names express domain intent rather than underlying library mechanics.
- New module seams are testable without needing to exercise unrelated layers.
- Route/controller/handler code stays thin: parse, call service/module, return response.
- Repositories/data-access modules hide query construction, field filtering, and ownership scoping.
- UI components delegate data fetching/domain state to hooks or dedicated modules where applicable.

### 4. Invariants, Ownership & Boundaries

- Domain invariants are enforced at the authoritative layer.
- Authorization/ownership checks are not bypassed or moved to weaker layers.
- External inputs do not leak internal identity or persistence concerns.
- Cross-layer leakage is not introduced.

### 5. Error Semantics & Observability

- Errors are explicit, structured, and appropriate to the failure mode.
- Invariant/structural failures do not silently degrade.
- New critical flows include useful logging/diagnostics where appropriate.
- No secrets or sensitive data are logged.

### 6. Data, Schema & Compatibility Safety

- Persistence changes are migrated safely.
- Request/response/schema changes are reflected in contracts/types/tests.
- Existing data states, including zero/empty states, remain valid unless intentionally migrated.
- Rollback or disable path exists for risky changes where applicable.

### 7. Code Quality & Maintainability

- Code is simple, cohesive, and readable.
- No dead code, unused helpers, commented-out code, or speculative abstractions.
- Naming is domain-oriented and consistent.
- Duplication of domain logic is avoided.
- Dependencies are justified and pinned/managed consistently.

### 8. User-Facing Behavior & Accessibility

- UI changes preserve expected interaction flows.
- Copy/label changes are intentional and consistent.
- Loading, empty, and error states are handled when behavior changes touch them.
- Accessibility is not regressed for interactive UI changes.

### 9. Review Hygiene

- Diff is reviewable and focused.
- Generated files, lockfiles, snapshots, or formatting churn are intentional.
- Documentation is updated when behavior, commands, or architecture changed.
- Local guidance/constitution changes remain aligned and non-duplicative.

### 10. Repo Standards Compliance

- Discovered hard-rule documents were read and named in the report.
- Changed code follows repo-specific engineering principles, architecture guidance, and domain terminology.
- Any deviation from a discovered hard rule is explicitly justified in the intent source, implementation notes, or review report.
- Missing or unrouted constitution/work-type context is disclosed without blocking manual review unless the repo requires a hard gate.
- Standards violations are reported as defects even if tests, build, lint, and type checks pass.

---

## Phase 5: Determine Outcome

### BLOCKED

Use when review cannot safely proceed or merge must not happen:

- Relevant automated check fails.
- Diff cannot be obtained or understood.
- Required context is missing and cannot be reasonably inferred.
- Security/authorization/data-loss risk is present.
- Hard constitutional or repo-standards violation is present.

### CHANGES REQUIRED

Use when implementation must be updated before approval:

- Missing test evidence for behavior change, bug fix, or meaningful new module seam.
- Deep-module violation such as pass-through abstraction or query mechanics leaking through public interfaces.
- Scope drift from available intent.
- Non-blocking checklist `FAIL` findings.
- Documentation missing for changed behavior or changed commands.
- Repo-specific hard rules, engineering principles, or architecture standards are violated without an explicit accepted deviation.

### APPROVED

Use only when:

- Relevant checks pass or unavailable checks are clearly reported.
- Test evidence matches the change class.
- No unresolved `FAIL` findings remain.
- Warnings, if any, are acceptable and clearly documented.

---

## Phase 6: Produce Report

Write the report directly to the terminal. Do not write a file unless the user asks.

```text
═══════════════════════════════════════════════
CODE REVIEW
Outcome: APPROVED | CHANGES REQUIRED | BLOCKED
═══════════════════════════════════════════════

REVIEW TARGET
─────────────
Diff reviewed: {branch/PR/local diff}
Intent source: {issue/PR/brief/commits/diff-only}
Intent traceability: FULL | PARTIAL | UNAVAILABLE
Change class: TRIVIAL NON-BEHAVIOR | BEHAVIOR | BUG FIX | STRUCTURAL REFACTOR | AMBIGUOUS

STANDARDS LOADED
────────────────
- {AGENTS.md / CLAUDE.md / README.md / engineering-principles.md / constitution / docs/refactor-audit.md / none found}
- Constitution routing: {loaded work type / no selector available / not found / not applicable}

AUTOMATED CHECKS
────────────────
Tests: {command}: PASS | FAIL | NOT RUN | NOT FOUND
Build: {command}: PASS | FAIL | NOT RUN | NOT FOUND
Type checks: {command}: PASS | FAIL | NOT RUN | NOT FOUND
Lint/static analysis: {command}: PASS | FAIL | NOT RUN | NOT FOUND
Formatting: {command}: PASS | FAIL | NOT RUN | NOT FOUND | N/A
Security/secret checks: {command}: PASS | FAIL | NOT RUN | NOT FOUND | N/A

CHECKLIST RESULTS
─────────────────
1. Intent & Scope Traceability        PASS | WARN | FAIL | N/A
2. Change Classification & TDD Gate   PASS | WARN | FAIL | N/A
3. Deep Modules & Testable Interfaces PASS | WARN | FAIL | N/A
4. Invariants, Ownership & Boundaries PASS | WARN | FAIL | N/A
5. Error Semantics & Observability    PASS | WARN | FAIL | N/A
6. Data, Schema & Compatibility       PASS | WARN | FAIL | N/A
7. Code Quality & Maintainability     PASS | WARN | FAIL | N/A
8. User-Facing Behavior & A11y        PASS | WARN | FAIL | N/A
9. Review Hygiene                     PASS | WARN | FAIL | N/A
10. Repo Standards Compliance         PASS | WARN | FAIL | N/A

FINDINGS
────────
❌ FAIL — Section 3: Deep Modules & Testable Interfaces
   File: path/to/file.ts:42
   Issue: Public repository method forwards raw query options to the ORM, so callers know query mechanics.
   Fix: Replace with domain-intent methods that hide query construction and ownership scoping.

⚠️ WARN — Section 2: Change Classification & TDD Gate
   File: path/to/component.tsx:18
   Issue: Copy-only UI change has no automated test, which is acceptable for this change class.
   Fix: Manually verify the label renders in the target screen.

SUMMARY
───────
{One paragraph describing what was reviewed, what was found, and what must happen next.}
```

---

## Key Rules

**DO:**

- Review only changed work and necessary surrounding context.
- Use the best available intent source; do not require specs.
- Classify the change before enforcing tests.
- Enforce tests for behavior changes, bug fixes, and meaningful module seams.
- Allow manual verification for trivial non-behavior edits.
- Enforce Deep Modules as an architectural review gate.
- Discover and enforce repo-specific hard-rule/standards/principles docs.
- Discover checks from repo guidance/manifests/CI/config files.
- Report tests, build, type checks, lint/static analysis, formatting, and security categories as `PASS`, `FAIL`, `NOT RUN`, `NOT FOUND`, or `N/A`.
- Report exact file/line and concrete fixes for every `FAIL`.

**DON'T:**

- Auto-fix during review.
- Audit unrelated existing code.
- Require new tests for obvious label/copy/docs/format-only changes.
- Accept manual testing alone for behavior changes.
- Approve shallow pass-through modules that hide no complexity.
- Ignore repo-specific standards because generic tests passed.
- Silently omit missing typecheck/lint/build categories.
- Hardcode `api`, `app`, `npm`, `main`, or spec paths as universal assumptions.
