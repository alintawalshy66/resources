# Shared Workflows

Canonical shared content for tools and agents.

## Manifest

- `manifest.json` — canonical inventory of shared skills, agents, templates, and Pi extensions.
- `references/github-issue-workflow.md` — GitHub Issues parent/child workflow contract.

## Canonical Portable Skills

- `analyze`
- `clarify`
- `code-reviewer`
- `design`
- `design-reviewer`
- `grill-me`
- `grill-with-docs`
- `implement`
- `plan`
- `ralph-loop`
- `specify`
- `tasks`
- `tdd`
- `to-issues`
- `to-prd`

## Layout

- `portable/` — reusable, model-agnostic skills, agents, and templates.
- `pi/` — Pi-specific runtime extensions and adapters.
- `references/` — shared reference documents such as the constitution.

## Pi Extensions

- `crosby/` — GitHub Issues execution orchestrator.

To load Crosby globally in Pi, add this exact folder to `~/.pi/agent/settings.json` under `extensions`:

```text
/home/walsc0/projects/pi-resources/resources/shared-workflows/pi/extensions/crosby
```

After adding or updating the extension, restart Pi or run `/reload`.
