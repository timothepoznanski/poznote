# PoznNote - Automated Version Management

This project uses an automated versioning system based on Git hooks and GitHub Actions.

## How It Works

### 1. Automatic Version Increment
When you commit with the **exact message** `"Create new version"`:
- The post-commit hook automatically increments `src/version.txt`
- The commit is amended to include the new version
- No manual version management needed!

### 2. GitHub Actions Publishing
When you merge to `main`:
- GitHub Actions checks if `src/version.txt` > latest tag
- If yes, creates a new tag `v{X.Y.Z}` and publishes Docker image
- If no, skips publishing (no unnecessary builds)

### 3. Application Version Display
The app reads version from `src/version.txt` and displays it in:
- Settings → Check for Updates → Current version

## Setup

### First Time Setup (per development machine)
```bash
# After cloning the repository
./install-hook.sh
```

### Creating a New Release
```bash
# Make your changes
git add .
git commit -m "Create new version"  # ← Automatically increments version
git push origin dev
# Create PR to main
# GitHub Actions handles the rest
```

## Files

- `src/version.txt` - Current version (incremented automatically)
- `scripts/hooks/post-commit` - Git hook for version increment
- `install-hook.sh` - Hook installation script
- `.github/workflows/publish-docker.yml` - Conditional publishing

## Benefits

✅ **Zero manual versioning** - Just commit with "Create new version"
✅ **No rebase conflicts** - Version stays in sync between branches
✅ **Conditional publishing** - Only builds when version changes
✅ **Automatic tagging** - Tags created from version.txt content

## Notes

- Hook must be installed on each dev machine (`./install-hook.sh`)
- Version file is in `src/` for Docker image inclusion
- Only commits with **exact message** "Create new version" trigger increment