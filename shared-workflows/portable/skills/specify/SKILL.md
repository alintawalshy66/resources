---
name: specify
description: Initialize a new feature with directory structure, git branch, and stub spec.md. Use this skill to start fresh features. Provide a feature name or description and the skill creates the feature directory, branches, and scaffolding needed before the design phase begins.
---

# Specify Skill

Initialize a new feature with proper structure and git setup.

## How to Use

```bash
/skill:specify
```

Then provide:
- Feature name or short description (e.g., "user preferences" or "session sharing")
- Optional: More detailed feature context

**Or direct:**
```bash
Specify a new feature for user settings UI
```

---

## What This Skill Does

### Phase 1: Feature Naming

1. **Ask for Feature Name**
   - Suggest kebab-case naming (e.g., `user-preferences`)
   - If you provide a description, skill suggests the name

2. **Calculate Feature ID**
   - Look at existing `specs/` folder
   - Find highest numbered feature (e.g., `045-*`)
   - Assign next number (e.g., `046-user-preferences`)

### Phase 2: Directory & Git Setup

3. **Create Feature Directory**
   - `specs/046-user-preferences/` created
   - `specs/046-user-preferences/checklists/` created (for later phase)
   - Confirm directory creation

4. **Create Git Branch**
   - Check current git status
   - Create branch: `046-user-preferences`
   - Checkout the new branch
   - Confirm branch switch

### Phase 3: Scaffold Stub Files

5. **Create Stub spec.md**
   - Minimal scaffold with sections:
     - Summary (TBD)
     - User Stories (TBD)
     - Functional Requirements (TBD)
     - Non-Functional Requirements (TBD)
     - Acceptance Criteria (TBD)
   - Ready for design phase to fill in

6. **Display Setup Summary**
   - Feature ID: `046-user-preferences`
   - Branch: `046-user-preferences` (active)
   - Directory: `specs/046-user-preferences/`
   - Next step: "Run design skill to write the spec"

---

## Output

```
✅ Feature Initialized

ID: 046-user-preferences
Branch: 046-user-preferences (active)
Directory: specs/046-user-preferences/
Files Created:
  - specs/046-user-preferences/spec.md (stub)
  - specs/046-user-preferences/checklists/ (directory)

Next Step:
Run: /skill:design
Then describe the feature requirements.
```

---

## Error Handling

**If feature ID already exists:**
- Ask: "Feature 046 already exists. Use that or pick a new name?"
- Confirm before proceeding

**If git branch already exists:**
- Ask: "Branch already exists. Checkout existing or create new?"
- Confirm before proceeding

**If not in git repo:**
- Block and explain: "Must be in a git repository"

---

## Files Created

- `specs/{FEATURE_ID}/spec.md` — Stub specification (ready for design phase)
- `specs/{FEATURE_ID}/checklists/` — Directory (created but empty)

## Files Unchanged

- Constitution (read-only)
- Roadmap (read-only; updated later by implement skill)

---

## Next Steps After Specify

1. **Design Phase**: `/skill:design`
   - Write complete spec.md

2. **Planning Phase**: `/skill:plan`
   - Write plan.md with technical approach

3. **Analysis Phase**: `/skill:analyze`
   - Review spec for gaps and edge cases

4. **Tasks Phase**: `/skill:tasks`
   - Break plan into atomic tasks

5. **Implementation Phase**: `/skill:implement`
   - Execute feature build

---

## Checklist

Before proceeding to design:

- [ ] Feature directory exists: `specs/{FEATURE_ID}/`
- [ ] Git branch created and active: `{FEATURE_ID}`
- [ ] Stub spec.md created
- [ ] Ready to write full specification

---

## Tips

- **Keep names descriptive**: `user-preferences` is better than `feature-x`
- **One feature per branch**: Don't mix unrelated work
- **Commit stub**: After specify runs, you can commit the scaffold:
  ```bash
  git add specs/{FEATURE_ID}/
  git commit -m "chore: initialize feature {FEATURE_ID}"
  ```