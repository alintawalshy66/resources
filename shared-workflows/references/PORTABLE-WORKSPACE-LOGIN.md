# Portable AI Agent Workspace — Access & Usage Guide

## Overview

This is a portable development environment running on a Synology NAS that provides remote access to Claude Code, Pi, and Codex agents via a web browser. All agents share a common skills repository and persistent configuration.

**External URL**: `https://codeserver.coachcw.synology.me`  
**Local Network URL**: `http://<nas-ip>:8080` (if on same network)

---

## Accessing the Workspace

### From Remote (Work, etc.)

1. Open browser and navigate to: `https://codeserver.coachcw.synology.me`
2. Enter password: `Malkin71Crosby87`
3. You're now in code-server (VS Code in browser)

### From Local Network

If on the same network as the NAS, you can also use the local IP directly for faster access.

---

## What You Should See

### File Structure (Left Panel)

```
CODER/
├── .cache/
├── .claude/                    ← Claude Code config & cache
├── .codex/                     ← Codex config & cache
├── .config/
├── .local/
├── .npm/
├── .npm-global/
├── .pi/                        ← Pi agent config & cache
├── repos/
│   ├── coachcw/                ← CoachCW fitness app
│   ├── phoenix/
│   ├── simplets/
│   └── tools/                  ← Shared workflows (skills library)
│       └── shared-workflows/
│           ├── manifest.json   ← Skills manifest
│           ├── portable/
│           │   ├── agents/
│           │   └── skills/     ← All agent skills
│           └── references/
├── scripts/
└── [other config directories]
```

---

## Verifying Agents Are Working

### Test Claude Code

1. Click the **Claude Code** icon (left sidebar)
2. Type: `claude-code --help`
3. You should see the full command help output

**Expected**: No errors, help text displays.

### Test Pi

1. Open a **Terminal** in code-server (View > Terminal)
2. Run: `pi --help`
3. You should see Pi's help and available commands

**Expected**: Pi clones any remote packages on first run, then displays help.

### Test Codex

1. In terminal, run: `codex --help`
2. You should see Codex's help and available commands

**Expected**: No errors, help text displays.

---

## Using the Agents

### Claude Code (Built-in to code-server)

- Click the Claude Code icon in the left sidebar
- Start a conversation or ask it to edit/review code
- It has access to all files in the workspace

### Pi (Command Line)

Open a terminal and run:

```bash
pi "Your task here"
```

Or interactive mode:

```bash
pi
```

**Note**: Pi loads skills from `/home/coder/repos/tools/shared-workflows/portable/skills/` automatically.

### Codex (Command Line)

Open a terminal and run:

```bash
codex "Your task here"
```

Or interactive:

```bash
codex
```

**Note**: Codex is configured via `~/.codex/AGENTS.md` and loads shared workflows from the tools repository.

---

## Working with Skills

All three agents can access the same skills library located at:

```
/home/coder/repos/tools/shared-workflows/portable/skills/
```

### View Available Skills

In terminal:

```bash
ls /home/coder/repos/tools/shared-workflows/portable/skills/
```

### Skills Are Symlinked

For Claude Code and Codex, skills are accessible via symlinks:

- Claude Code: `~/.claude/skills` → points to tools repo
- Codex: `~/.codex/skills` → points to tools repo

Pi reads directly from the configured path in `~/.pi/agent/settings.json`.

---

## Making Changes & Syncing

### Updating a Skill

1. Edit a skill file in any agent
2. The change writes directly to `/home/coder/repos/tools/shared-workflows/portable/skills/`
3. Commit and push from the tools repo:

```bash
cd /home/coder/repos/tools/shared-workflows
git add .
git commit -m "Update skill"
git push
```

### Pulling Updated Skills

If someone else updates skills in the repo:

```bash
cd /home/coder/repos/tools/shared-workflows
git pull
```

All three agents see the updated skills immediately (no restart needed).

---

## Troubleshooting

### Agent Shows "Command Not Found"

**Problem**: After NAS restarts, agents may be missing.

**Solution**: Reinstall Node.js in terminal:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Then reinstall agents:

```bash
npm install -g claude-code pi codex
```

### Skills Not Appearing

**Claude Code / Codex**: Check that symlinks exist:

```bash
ls -la ~/.claude/skills
ls -la ~/.codex/skills
```

If missing, recreate:

```bash
ln -s /home/coder/repos/tools/shared-workflows/portable/skills ~/.claude/skills
ln -s /home/coder/repos/tools/shared-workflows/portable/skills ~/.codex/skills
```

**Pi**: Run `pi --help` to verify it loads. Check `~/.pi/agent/settings.json` has correct path.

### Connection Refused

If you get "Connection Refused" accessing `codeserver.coachcw.synology.me`:

- Check the NAS is powered on
- Check container is running in Synology Container Manager
- Try local IP instead: `http://<nas-ip>:8080`

### Certificate Warning

If browser shows "Not secure" but site loads:

- This is a cosmetic issue with Let's Encrypt cert chain on Synology
- Site is still secure; warning is safe to ignore
- Try hard refresh (Ctrl+Shift+R)

---

## Useful Paths

| Purpose | Path |
|---------|------|
| Claude Code config | `~/.claude/` |
| Pi config | `~/.pi/agent/` |
| Codex config | `~/.codex/` |
| Shared skills | `/home/coder/repos/tools/shared-workflows/portable/skills/` |
| CoachCW repo | `/home/coder/repos/coachcw/` |
| Tools repo | `/home/coder/repos/tools/` |

---

## Next Steps

- Open a project in the editor
- Use Claude Code to ask questions or get help
- Run `pi` or `codex` in terminal for command-line agent use
- Edit skills and push changes back to the tools repo
