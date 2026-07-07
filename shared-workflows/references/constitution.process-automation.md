# Process Automation Constitution

This document applies when work is routed by `wt:process-automation` or `Work Type: process-automation`.

## Additions

- Optimize for durable workflows, low token usage, and deterministic agent behavior.
- Prefer explicit workflow states, labels, templates, and routing rules over informal conventions.
- Changes should improve repeatability across sessions, tools, and operators.
- Guardrails for destructive or ambiguous workflow operations must fail safely.
- When changing process rules, document the operator recovery path for missing metadata, invalid selectors, or conflicting configuration.

## Overrides

- None.
