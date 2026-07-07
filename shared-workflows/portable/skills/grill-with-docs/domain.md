# Domain docs

Choose the repo's domain-document layout and consumer rules.

This file is always applicable when the repo has domain terms to track.

## Template

```md
# Domain docs

## Layout

- {Single-context or multi-context description}

## Consumer rules

- Read `CONTEXT.md` before naming new concepts.
- Read `docs/adr/` before proposing hard-to-reverse changes.
- If `CONTEXT-MAP.md` exists, use it to find the relevant context.
- Create `CONTEXT.md` lazily when the first term is resolved.
- Create `docs/adr/` lazily when the first ADR is needed.
```
