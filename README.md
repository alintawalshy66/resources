# resources

Shared workflow and agent assets for Pi, Claude Code, and Codex in this environment.

## Current State

- This repo is the work-safe source of truth for portable skills, agents, templates, and the constitution.
- Pi loads approved shared skills from `shared-workflows/portable/skills`.
- Pi runtime extensions live under `shared-workflows/pi/extensions/`.
- Current Pi runtime extension: `crosby` for GitHub Issues orchestration.
- GitHub issue workflow contract: `shared-workflows/references/github-issue-workflow.md`.
- GitHub label bootstrap script: `scripts/bootstrap-github-labels.sh`.
- The constitution is stored canonically at `shared-workflows/references/constitution.md`.
- Portable templates live in `shared-workflows/portable/templates/`.

## Layout

```text
shared-workflows/
├── manifest.json
├── portable/
│   ├── skills/
│   ├── agents/
│   └── templates/
├── pi/
│   └── extensions/
└── references/
```

## Pi setup

Point Pi at these folders in `~/.pi/agent/settings.json`:

```json
{
  "skills": [
    "/home/walsc0/projects/pi-resources/resources/shared-workflows/portable/skills"
  ],
  "extensions": [
    "/home/walsc0/projects/pi-resources/resources/shared-workflows/pi/extensions/crosby"
  ],
  "prompts": [
    "/home/walsc0/projects/pi-resources/resources/shared-workflows/portable/templates"
  ]
}
```

After updating settings, restart Pi or run `/reload`.

## GitHub Issues setup

Install and authenticate GitHub CLI if you want Crosby or issue-creation skills to create/read/update issues:

```bash
gh auth login
```

Bootstrap the required labels once per repo:

```bash
./scripts/bootstrap-github-labels.sh OWNER/REPO
```

The workflow uses parent issues, child issues, labels, and milestones. GitHub Projects are intentionally out of scope for now.

## Canonical Shared Skills

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

## Portable Templates

- `prd-template`
- `issue-slice-template`
- `claude-code-project-template`

## Notes

- Update `shared-workflows/manifest.json` whenever portable content changes.
- Keep portable skill content model-agnostic.
- Keep Pi-specific runtime behavior isolated in `shared-workflows/pi/extensions/`.
