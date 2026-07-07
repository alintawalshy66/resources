# {Project Name} — Project Guidelines for Claude Code

## Project Overview
{Short description of the project. Explain who it is for, what it does, and the core domain it serves.}

{Explain the main product constraints and business rules.}

Out of scope: {things this project must not include}. Do not introduce these.

---

## Shared Workflow Source of Truth
Canonical shared workflow assets live in:

`C:\Users\camer\Documents\projects\tools\shared-workflows`

Use the manifest as the source of truth for portable workflows:

`C:\Users\camer\Documents\projects\tools\shared-workflows\manifest.json`

Rules:
- Do not duplicate portable skill content in this project.
- When a task matches a shared workflow skill, load the relevant skill from the shared repo.
- Prefer the shared portable skills over any ad-hoc local instructions.
- Keep this file project-specific; keep reusable workflow logic in the shared repo.

---

## Project Structure
- `{folder}/` — {description}
- `{folder}/` — {description}
- `{folder}/` — {description}

---

## Tech Stack
- **Runtime**: {runtime version / environment}
- **Backend**: {backend stack}
- **Frontend**: {frontend stack}
- **Testing**: {testing stack}
- **Environment**: {OS / shell / wrapper notes}

---

## Key Commands

### {Area 1}
- `{command}` — {description}
- `{command}` — {description}
- `{command}` — {description}

### {Area 2}
- `{command}` — {description}
- `{command}` — {description}
- `{command}` — {description}

### Local Services
- `{command}` — {description}
- `{command}` — {description}

---

## Shared Workflow Guidance
Use the shared workflow skills when the task fits them. Common examples include:
- discovery / gap analysis: `analyze`
- refinement / question framing: `clarify`
- spec enhancement: `design`
- implementation planning: `plan`
- task breakdown: `tasks`
- TDD execution: `tdd`
- feature implementation: `implement`
- review / enforcement: `code-reviewer`
- issue conversion: `to-prd`, `to-issues` (use `to-issues` when child Linear issues must inherit the parent project's labels and project)

If more than one workflow seems relevant, choose the smallest skill needed for the current step.

---

## Architecture Invariants (Non-Negotiable)

{Copy the project constitution rules here or link to the constitution if the project uses one.}

**{Invariant Group 1}**
- {rule}
- {rule}
- {rule}

**{Invariant Group 2}**
- {rule}
- {rule}
- {rule}

**{Invariant Group 3}**
- {rule}
- {rule}
- {rule}

---

## Accessibility & UI Standards

**{Standard} is required on all layouts.**

- {accessibility rule}
- {accessibility rule}
- {accessibility rule}
- {accessibility rule}
- {accessibility rule}
- {accessibility rule}

**{Visual / theme rule}**
- {theme rule}
- {theme rule}
- {theme rule}
- {theme rule}

## Code Style
- Validate only at system boundaries (user input, external APIs). Trust internal code.
- No unused helpers, premature abstractions, or backwards-compatibility hacks.
- Delete unused code — do not comment it out.
- Keep solutions minimal. Do not add features or refactoring beyond what was requested.
- Read the relevant file before suggesting or making changes.

---

## Git Rules
- Always create new commits. Never amend.
- Never push to remote without explicit confirmation.
- Create a new commit after hook failures — do not amend.
- Use clear, concise commit messages.

---

## Commands Not Allowed (Require Explicit Confirmation or Are Prohibited)
- `{command}`
- `{command}`
- `{command}`
- `{command}`

---

## Scoped Repository Pattern
{Describe any repository-scoping or data-ownership rules here.}

{Add any extra project-specific guidance here.}
