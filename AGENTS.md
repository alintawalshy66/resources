# tools — Project Guidelines for Agents

## Project Overview
This repository is the canonical home for shared workflow assets used by Pi, Claude Code, and Codex.
It contains portable skills, shared templates, Pi runtime extensions, and repo-level guidance.

Out of scope: tool-specific duplicates of portable skills, ad-hoc workflow forks, or runtime-only assets that belong in a specific tool folder.

---

## Shared Workflow Source of Truth
Canonical shared workflow assets live in:

`/home/walsc0/projects/pi-resources/tools/shared-workflows`

Use the manifest as the source of truth for portable workflows:

`/home/walsc0/projects/pi-resources/tools/shared-workflows/manifest.json`

Rules:
- Do not duplicate portable skill content in this repo.
- When a task matches a shared workflow skill, load the relevant skill from the shared repo.
- Prefer the shared portable skills over any ad-hoc local instructions.
- Keep reusable workflow logic in `shared-workflows/`.

---

## Project Structure
- `shared-workflows/` — canonical portable skills, templates, and shared references
- `pi/` — Pi-specific runtime extensions and adapters
- `specs/` — feature/spec worktrees and planning artifacts
- `README.md` — repo overview and canonical inventory notes

---

## Tech Stack
- **Runtime**: Markdown, JSON, TypeScript (Pi extensions)
- **Backend**: None
- **Frontend**: None
- **Testing**: N/A unless a specific workflow or extension adds it
- **Environment**: Windows paths, Git, Bash-compatible shell tools

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
