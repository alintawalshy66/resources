# Portable AI Agent Workspace — Build from Scratch

## Overview

This guide rebuilds a complete portable development environment running on a Synology NAS with persistent access to Claude Code, Pi, and Codex agents via HTTPS.

**Final Result**: Remote HTTPS access to code-server with all agents configured to share a common skills repository.

---

## Prerequisites

### Hardware
- Synology NAS with Docker support (Container Manager installed)
- Sufficient disk space (minimum 50GB recommended)
- Network connectivity

### Software
- Git (for cloning repositories)
- SSH access to NAS (or web interface access)
- Let's Encrypt certificate (for HTTPS)

### Configuration
- DDNS hostname (e.g., `coachcw.synology.me`)
- Port forwarding for reverse proxy (80 → port 8080, 443 → port 8080)

---

## Step 1: Prepare NAS Directory Structure

SSH into the NAS or use File Manager to create:

```bash
/volume1/docker/dev-workspace/
├── home/              # Persistent home directory for containers
├── repos/             # Git repositories
└── scripts/           # Optional: helper scripts
```

Create the directories:

```bash
mkdir -p /volume1/docker/dev-workspace/home
mkdir -p /volume1/docker/dev-workspace/repos
mkdir -p /volume1/docker/dev-workspace/scripts
```

---

## Step 2: Set Up Docker Compose

Create `/volume1/docker/dev-workspace/docker-compose.yml`:

```yaml
services:
  dev-workspace:
    image: codercom/code-server:latest
    container_name: dev-workspace
    environment:
      - PASSWORD=Malkin71Crosby87
      - NPM_CONFIG_PREFIX=/home/coder/.npm-global
    volumes:
      - /volume1/docker/dev-workspace/home:/home/coder
      - /volume1/docker/dev-workspace/repos:/home/coder/repos
      - /volume1/docker/dev-workspace/scripts:/home/coder/scripts
    ports:
      - "8080:8080"
    restart: unless-stopped
```

### Key Settings

| Setting | Purpose |
|---------|---------|
| `PASSWORD` | Web access password for code-server |
| `NPM_CONFIG_PREFIX` | Global npm packages installed in persistent volume |
| `volumes` | Maps NAS storage to container paths |
| `ports` | Exposes port 8080 (reverse proxy will handle HTTPS) |

---

## Step 3: Start the Container

In Synology Container Manager or via command line:

```bash
cd /volume1/docker/dev-workspace
docker-compose up -d
```

Wait 30-60 seconds for the container to start. Check logs:

```bash
docker logs dev-workspace
```

You should see: `[2025-05-13T...] info  code-server 4.x.x started on http://0.0.0.0:8080`

---

## Step 4: Set Up Reverse Proxy (HTTPS)

In Synology DSM:

1. **Control Panel** → **Application Portal** → **Reverse Proxy**
2. Create new reverse proxy rule:
   - **Source Protocol**: HTTPS
   - **Source Hostname**: `codeserver.coachcw.synology.me` (your DDNS hostname)
   - **Source Port**: 443
   - **Destination Protocol**: HTTP
   - **Destination Hostname**: localhost
   - **Destination Port**: 8080
   - **Custom Header**: Enable WebSocket support
   - **Certificate**: Select your Let's Encrypt certificate for the domain

3. Click **Create**

### Port Forwarding Setup

In **Control Panel** → **Connectivity** → **Port Forwarding**:

- Forward external port **443** (HTTPS) to internal port **8080**
- Forward external port **80** (HTTP) to internal port **8080** (for cert renewal)

---

## Step 5: Clone Required Repositories

In code-server terminal:

```bash
cd /home/coder/repos

# Clone main repositories
git clone https://github.com/walshy66/coachcw.git
git clone https://github.com/walshy66/tools.git

# Optional: clone other project repos
# git clone https://github.com/walshy66/phoenix.git
# git clone https://github.com/walshy66/simplets.git
```

Verify:

```bash
ls -la /home/coder/repos/
```

You should see: `coachcw/`, `tools/`, etc.

---

## Step 6: Install & Configure Pi

### Install Pi

In terminal:

```bash
npm install -g pi-coding-agent
```

### Configure Pi Settings

Create/update `~/.pi/agent/settings.json`:

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.5",
  "defaultThinkingLevel": "medium",
  "theme": "gruvbox-dark-hard",
  "skills": [
    "/home/coder/repos/tools/shared-workflows/portable/skills"
  ],
  "packages": [
    "pi-autonomous-system",
    "https://github.com/microsoft/playwright-cli",
    "git:https://github.com/hasit/pi-community-themes"
  ]
}
```

### Configure AGENTS.md

Create `~/.pi/agent/AGENTS.md`:

```markdown
# Pi Shared Workflows

Canonical source of truth for available skills and workflows.

**Manifest location**: `/home/coder/repos/tools/shared-workflows/manifest.json`

This references the skills repository cloned to `/home/coder/repos/tools/` and loaded by Pi agent.
```

### Optional: Configure Crosby Extension

Create `~/.pi/agent/extensions/crosby/index.ts`:

```typescript
// Re-export Crosby extension from tools repository
export { default } from "/home/coder/repos/tools/shared-workflows/pi/extensions/crosby/index.ts";
```

### Verify Pi

In terminal:

```bash
pi --help
```

Expected output: Full help text with no errors. First run will clone remote packages.

---

## Step 7: Install & Configure Claude Code

### Install Claude Code

In terminal:

```bash
npm install -g claude-code
```

### Copy Configuration Files

Copy these files from your laptop to the NAS (update paths from Windows to Linux):

**`~/.claude/settings.json`** (permissions & plugins):

```json
{
  "permissions": {
    "allow": [
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(find:*)",
      "Bash(grep:*)",
      "Bash(pwd:*)",
      "Bash(echo:*)",
      "Bash(which:*)",
      "Bash(node:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(git stash:*)",
      "Bash(git branch:*)",
      "Bash(git checkout:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(cd:*)",
      "Edit",
      "Write"
    ],
    "deny": [
      "Bash(rm:*)",
      "Bash(rm -rf:*)",
      "Bash(git reset:*)",
      "Bash(git rebase:*)",
      "Bash(git clean:*)",
      "Bash(npx prisma migrate deploy:*)",
      "Bash(npx prisma db push:*)",
      "Bash(docker:*)",
      "Bash(sed:*)",
      "Bash(awk:*)",
      "Bash(sudo:*)",
      "Bash(chmod:*)",
      "Bash(chown:*)",
      "Bash(curl:*)",
      "Bash(wget:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [],
    "PostToolUse": [],
    "UserPromptSubmit": []
  },
  "compactCustomInstructions": "Focus on: architecture decisions made, unresolved blockers, current feature branch and its status, any invariants or contracts that were discussed, and the last completed task. Omit file contents, test output details, and resolved decisions.",
  "enabledPlugins": {
    "context-mode@context-mode": true
  }
}
```

**`~/.claude/settings.local.json`** (MCP servers & additional permissions):

```json
{
  "permissions": {
    "allow": [
      "mcp__plugin_context-mode_context-mode__ctx_batch_execute",
      "Bash(claude:*)",
      "Bash(mkdir -p ~/.claude/plugins/cache/context-mode/context-mode/1.0.5/hooks)",
      "Bash(~/.claude/plugins/cache/context-mode/context-mode/1.0.5/hooks/pretooluse.mjs)",
      "mcp__plugin_context-mode_context-mode__ctx_execute_file",
      "mcp__plugin_context-mode_context-mode__ctx_search",
      "mcp__plugin_context-mode_context-mode__ctx_execute",
      "mcp__claude_ai_Linear__list_projects",
      "mcp__claude_ai_Linear__list_issues",
      "mcp__claude_ai_Linear__list_issue_labels",
      "mcp__claude_ai_Linear__save_issue",
      "mcp__claude_ai_Linear__get_issue",
      "mcp__claude_ai_Linear__research",
      "Bash(linear issue *)",
      "Bash(git rm *)",
      "Bash(git pull *)",
      "WebFetch(domain:www.youtube.com)",
      "Bash(git -C \"/home/coder/repos/coachcw\" status)",
      "Bash(git -C \"/home/coder/repos/tools/shared-workflows\" status)",
      "Bash(git -C \"/home/coder/repos/coachcw\" add .specify/memory/constitution.md constitution.md)",
      "Bash(git -C '/home/coder/repos/coachcw' commit -m ' *)",
      "Bash(git -C \"/home/coder/repos/tools/shared-workflows\" add references/constitution.development.md)",
      "Bash(git -C '/home/coder/repos/tools/shared-workflows' commit -m ' *)",
      "Bash(git -C \"/home/coder/repos/coachcw\" push)",
      "Bash(git -C \"/home/coder/repos/tools/shared-workflows\" push)",
      "mcp__claude_ai_Linear__list_issue_statuses",
      "WebFetch(domain:vip.ventraip.com.au)",
      "Bash(git -C /home/coder/repos/coachcw log --all --oneline)",
      "Bash(git -C /home/coder/repos/coachcw branch -a)",
      "Bash(gh api *)"
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": []
}
```

**Note**: Replace Windows paths (`C:\Users\camer\...`) with NAS paths (`/home/coder/repos/...`).

### Create Symlink to Skills

In terminal:

```bash
ln -s /home/coder/repos/tools/shared-workflows/portable/skills ~/.claude/skills
```

### Verify Claude Code

In terminal:

```bash
claude-code --help
```

Expected output: Full help text.

---

## Step 8: Install & Configure Codex

### Install Codex

In terminal:

```bash
npm install -g codex
```

### Update AGENTS.md

Update `~/.codex/AGENTS.md`:

```markdown
# Codex Shared Workflow Pointer

The canonical shared workflow library lives at:

`/home/coder/repos/tools/shared-workflows/manifest.json`

Use that manifest to resolve portable skills, agents, and templates before falling back to local copies.
```

### Create Symlink to Skills

In terminal:

```bash
ln -s /home/coder/repos/tools/shared-workflows/portable/skills ~/.codex/skills
```

### Verify Codex

In terminal:

```bash
codex --help
```

Expected output: Full help text.

---

## Step 9: Verify Complete Setup

Run all verification commands in terminal:

```bash
# Check Pi
pi --help

# Check Claude Code
claude-code --help

# Check Codex
codex --help

# Verify symlinks
ls -la ~/.claude/skills
ls -la ~/.codex/skills

# List available skills
ls /home/coder/repos/tools/shared-workflows/portable/skills/
```

All commands should complete without errors.

---

## Step 10: Test Remote Access

1. On an external network, open browser
2. Navigate to: `https://codeserver.coachcw.synology.me`
3. Enter password: `Malkin71Crosby87`
4. You should see code-server interface
5. Open terminal in code-server and run `pi --help`

Expected: Full access to agents and repos from remote location.

---

## Handling Container Restarts

### Node.js Installation Loss

After NAS restarts, Node.js may be lost from the container. Reinstall:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Then reinstall agents:

```bash
npm install -g claude-code pi codex
```

**Note**: This is a known limitation. A permanent fix would require a custom Docker image, but Synology Container Manager has limitations with build directives.

---

## Troubleshooting

### Container Won't Start

- Check disk space: `df -h`
- Check logs: `docker logs dev-workspace`
- Verify docker-compose.yml syntax
- Restart Docker service in Container Manager

### HTTPS Certificate Issues

- Verify Let's Encrypt certificate is valid in DSM
- Check reverse proxy rule points to correct port (8080)
- Try hard refresh in browser (Ctrl+Shift+R)
- Check port forwarding for ports 80 and 443

### Permissions Denied on Mounted Volumes

If getting "Permission denied" errors:

```bash
sudo chmod -R 777 /volume1/docker/dev-workspace/repos
```

### Skills Not Loading

- Verify symlinks exist: `ls -la ~/.claude/skills`
- Recreate if missing: `ln -s /home/coder/repos/tools/shared-workflows/portable/skills ~/.claude/skills`
- Restart the agent
- Check permissions: `ls -la /home/coder/repos/tools/shared-workflows/portable/skills/`

---

## File Structure Reference

After complete setup, your structure should be:

```
/home/coder/
├── .cache/
├── .claude/
│   ├── settings.json
│   ├── settings.local.json
│   ├── plugins/
│   ├── skills → /home/coder/repos/tools/shared-workflows/portable/skills (symlink)
│   └── sessions/
├── .codex/
│   ├── AGENTS.md
│   ├── config.toml
│   ├── skills → /home/coder/repos/tools/shared-workflows/portable/skills (symlink)
│   └── [other codex data]
├── .pi/
│   ├── agent/
│   │   ├── settings.json
│   │   ├── AGENTS.md
│   │   └── extensions/
│   └── [other pi data]
├── repos/
│   ├── coachcw/
│   ├── tools/
│   │   └── shared-workflows/
│   │       ├── manifest.json
│   │       ├── portable/
│   │       │   └── skills/
│   │       └── references/
│   └── [other repos]
└── [npm, config, and runtime directories]
```

---

## Maintenance

### Regular Backups

Back up the persistent volume:

```bash
sudo tar -czf /volume1/backups/workspace-backup-$(date +%Y%m%d).tar.gz \
  /volume1/docker/dev-workspace/home \
  /volume1/docker/dev-workspace/repos
```

### Update Agents

To update agents to latest versions:

```bash
npm install -g claude-code@latest pi-coding-agent@latest codex@latest
```

### Monitor Disk Usage

```bash
du -sh /volume1/docker/dev-workspace/
```

---

## Security Notes

- **Password**: Change `Malkin71Crosby87` in docker-compose.yml to a strong password
- **HTTPS**: Always access via HTTPS (`codeserver.coachcw.synology.me`), not HTTP
- **Firewall**: Ensure port forwarding is only accessible when needed
- **Backups**: Regularly back up agent configurations and repos

---

## Next Steps

- See `PORTABLE-WORKSPACE-LOGIN.md` for usage instructions
- Configure agent API keys (Anthropic, OpenAI, etc.) in each agent's config
- Set up git credentials for pushing/pulling from repositories
- Test skill updates and syncing across agents
