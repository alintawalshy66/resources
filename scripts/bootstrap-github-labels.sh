#!/usr/bin/env bash
set -euo pipefail

repo="${1:-}"
if [[ -z "$repo" ]]; then
  repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
fi

if [[ -z "$repo" ]]; then
  echo "Usage: $0 OWNER/REPO" >&2
  echo "Or run from inside a GitHub repository with gh authenticated." >&2
  exit 1
fi

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh is required. Install GitHub CLI and run 'gh auth login'." >&2
    exit 1
  fi
  gh auth status >/dev/null
}

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  if gh label view "$name" --repo "$repo" >/dev/null 2>&1; then
    gh label edit "$name" --repo "$repo" --color "$color" --description "$description" >/dev/null
    echo "updated label: $name"
  else
    gh label create "$name" --repo "$repo" --color "$color" --description "$description" >/dev/null
    echo "created label: $name"
  fi
}

require_gh

ensure_label "type:parent" "5319e7" "Parent/container issue for a feature or initiative"
ensure_label "type:child" "7c3aed" "Executable child/slice issue"

ensure_label "status:ready" "0e8a16" "Ready but not actively executing"
ensure_label "status:execute" "1d76db" "Active parent issue; automation may process children"
ensure_label "status:ready-to-build" "2da44e" "Runnable child issue"
ensure_label "status:building" "fbca04" "Claimed/in progress"
ensure_label "status:review" "d93f0b" "Needs human review or action"

ensure_label "mode:afk" "0052cc" "Automation may run this issue"
ensure_label "mode:hitl" "b60205" "Human-in-the-loop issue"

ensure_label "wt:development" "0366d6" "Development work type for constitution routing"
ensure_label "wt:process-automation" "0e8a16" "Process automation work type for constitution routing"

echo "GitHub labels bootstrapped for $repo"
