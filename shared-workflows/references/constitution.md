# Shared Constitution Entrypoint

This file is the canonical constitution entrypoint for shared workflows.

## Core

These rules apply to every work type unless an explicit override is declared in the selected work-type document.

- Keep one canonical source of truth for workflow rules and references.
- Prefer deterministic, text-first inputs and outputs that agents can parse reliably.
- Keep work scoped to small, independently completable slices.
- Use explicit selectors for hard-gated execution flows; do not guess when routing is ambiguous.
- Surface configuration failures clearly and fail closed when a required routing artifact is missing.
- Record overrides explicitly; implicit overrides are invalid.

### Override Contract

A work-type document may add rules freely.
A work-type document may override a Core rule only inside an explicit `## Overrides` section that names the exact Core rule being changed and explains why.
If no override is listed, Core remains in effect.

## Work Type Routing

- `wt:development` -> `shared-workflows/references/constitution.development.md`
- `wt:process-automation` -> `shared-workflows/references/constitution.process-automation.md`

For non-Linear hard-gated work, the accepted prompt headers are:
- `Work Type: development`
- `Work Type: process-automation`

## Selection Algorithm

1. If a Linear issue exists, read its work-type label.
2. For hard-gated skills, require exactly one valid work-type selector.
3. If the selector is missing, stop and tell the user to add `wt:development` or `wt:process-automation`.
4. If multiple work-type labels are present, stop and require exactly one.
5. If no Linear issue exists for hard-gated work, require an explicit `Work Type:` header in the prompt.
6. Load `## Core` from this file.
7. Load the mapped work-type document.
8. Apply additive rules from the work-type document.
9. Apply only the overrides declared in that document’s `## Overrides` section.
10. If the selector conflicts with the narrative issue content, proceed by selector and warn.
11. If the mapped document is missing or unreadable, stop with a configuration error.
