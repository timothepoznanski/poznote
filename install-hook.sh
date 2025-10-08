#!/bin/bash

# Git hook installation script for automatic version management
# This script copies and configures the post-commit hook in .git/hooks/

set -e

HOOK_SOURCE="scripts/hooks/post-commit"
HOOK_DEST=".git/hooks/post-commit"

echo "🔧 Installing Git hook for automatic version management..."

# Check that we're in a Git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: This is not a Git repository"
    exit 1
fi

# Check that the source hook exists
if [ ! -f "$HOOK_SOURCE" ]; then
    echo "❌ Error: Source hook not found: $HOOK_SOURCE"
    exit 1
fi

# Check that src/version.txt exists
if [ ! -f "src/version.txt" ]; then
    echo "❌ Error: src/version.txt not found. Please ensure version.txt exists in src/ directory."
    exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy the hook
cp "$HOOK_SOURCE" "$HOOK_DEST"

# Make it executable
chmod +x "$HOOK_DEST"

echo "✅ Hook installed successfully!"
echo ""
echo "🎯 How it works:"
echo "   When you commit with the exact message 'Create new version',"
echo "   the version in src/version.txt will be automatically incremented."
echo ""
echo "📝 Usage example:"
echo "   git commit -m 'Create new version'"
echo ""
echo "⚠️  Note: This hook must be installed on each development machine."
echo "   Run this script after cloning the repository: ./install-hook.sh"