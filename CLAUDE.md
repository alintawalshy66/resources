# tools — Project Guidelines for Claude Code

## Project Overview
This repository is the canonical home for shared workflow assets used by Pi, Claude Code, and Codex.
It contains portable skills, shared templates, Pi runtime extensions, and repo-level guidance.

Out of scope: tool-specific duplicates of portable skills, ad-hoc workflow forks, or runtime-only assets that belong in a specific tool folder.

---

## Shared Workflow Source of Truth
Canonical shared workflow assets live in:

`/home/walsc0/projects/pi-resources/resources/shared-workflows`

Use the manifest as the source of truth for portable workflows:

`/home/walsc0/projects/pi-resources/resources/shared-workflows/manifest.json`

Rules:
- Do not duplicate portable skill content in this repo.
- When a task matches a shared workflow skill, load the relevant skill from the shared repo.
- Prefer the shared portable skills over any ad-hoc local instructions.
- Keep reusable workflow logic in `shared-workflows/`.

---

## Project Structure
- `shared-workflows/` — canonical portable skills, templates, and shared references
- `shared-workflows/references/github-issue-workflow.md` — GitHub Issues parent/child workflow contract
- `pi/` — Pi-specific runtime extensions and adapters
- `specs/` — feature/spec worktrees and planning artifacts
- `README.md` — repo overview and canonical inventory notes

---

## Tech Stack
- **Runtime**: Markdown, JSON, TypeScript (Pi extensions)
- **Backend**: None
- **Frontend**: None
- **Testing**: N/A unless a specific workflow or extension adds it
- **Environment**: Linux paths, Git, Bash-compatible shell tools, GitHub CLI (`gh`) for issue workflows

---

## Shared Workflow Guidance
Use the shared workflow skills when the task fits them. Common examples include:
- discovery / gap analysis: `analyze`
- refinement / question framing: `clarify`
- doc-grounded grilling: `grill-with-docs`
- spec enhancement: `design`
- implementation planning: `plan`
- task breakdown: `tasks`
- TDD execution: `tdd`
- feature implementation: `implement`
- review / enforcement: `code-reviewer`
- issue conversion: `to-prd`, `to-issues`

If more than one workflow seems relevant, choose the smallest skill needed for the current step.

---

## Architecture Invariants (Non-Negotiable)

**Portable content stays portable**
- Shared skills live only in `shared-workflows/portable/skills/`.
- Keep portable skill content model-agnostic.
- Do not introduce tool-specific behavior into portable skills.

**Local repo files stay minimal**
- Keep local pointers and repo-specific docs short.
- Do not duplicate canonical shared content in multiple places.
- Update `shared-workflows/manifest.json` when portable content changes.

**Runtime-specific code stays isolated**
- Pi-only runtime behavior belongs in `pi/extensions/`.
- Shared templates and reference docs belong in `shared-workflows/`.

**Repository guidance should match the source of truth**
- Update `README.md` when the canonical set changes.
- Keep any repo-level instructions aligned with the shared manifest.

---

## Code Style
- Read the relevant file before suggesting or making changes.
- Keep solutions minimal.
- No unused helpers, premature abstractions, or backwards-compatibility hacks.
- Delete unused code — do not comment it out.

---

## Change Classification Gate
Before changing code, classify the work:

1. **Trivial non-behavior change** — labels, copy, docs, comments, formatting, or obvious dead-code deletion. TDD is not required; include a brief manual verification note when appropriate.
2. **Behavior change** — domain logic, API behavior, validation, state transitions, UI interaction, data fetching, error handling, persistence, authorization, or feature gating. Use TDD: write/identify the failing behavior test before production changes.
3. **Bug fix** — add a regression test that fails before the fix and passes after it.
4. **Structural refactor / deep-module extraction** — preserve behavior with tests at the public seam or existing public behavior tests; add direct interface tests for new deep module seams when useful.
5. **Ambiguous** — treat as a behavior change until clarified.

Do not invent needless tests for obvious copy/documentation/formatting-only edits. Do not skip tests for behavior changes because the change is small or lacks a formal issue/spec.

---

## Deep Module Guidance
- Prefer deep modules with small, stable, testable interfaces over many shallow pass-through files.
- A function or method that only forwards arguments unchanged to one dependency is a design smell and should usually be removed or deepened.
- Public method names should express domain intent, not underlying library mechanics.
- Route handlers should parse input, call a service, and return output; domain logic belongs in services/modules.
- Repositories should hide query construction and ownership scoping from callers.
- React components should delegate data-fetching/domain state to hooks or dedicated modules; test components by mocking seams and test seams independently.

---

## Git Rules
- Always create new commits. Never amend.
- Never push to remote without explicit confirmation.
- Create a new commit after hook failures — do not amend.
- Use clear, concise commit messages.

---

## Commands Not Allowed (Require Explicit Confirmation or Are Prohibited)
- `git push`
- `git reset --hard`
- `git clean -fd`
- force-deleting branches

---

## Scoped Repository Pattern
This repo scopes changes to shared workflow assets and their supporting runtime adapters.
Avoid adding project-specific workflow logic here unless it is intended to become canonical and portable.
