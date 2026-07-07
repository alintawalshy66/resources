# Pi runtime extensions

This folder stores Pi-specific runtime extensions for the shared workflow repo.

## Important

Pi does **not** auto-discover this folder by itself unless you point Pi at it.

Use one of these options:

1. **Project-local discovery**
   - copy or symlink an extension into `.pi/extensions/` in the project you are working in

2. **Global Pi settings**
   - add the extension folder to Pi's `extensions` list in `~/.pi/agent/settings.json`

## Current extensions

- `crosby/` — GitHub Issues execution orchestrator

## How to make Pi load Crosby

Add this path to `~/.pi/agent/settings.json`:

```json
{
  "extensions": [
    "/home/walsc0/projects/pi-resources/resources/shared-workflows/pi/extensions/crosby"
  ]
}
```

After that, restart Pi or run `/reload`.
