#!/bin/bash

# Script to install the pre-commit hook for automatic versioning

echo "Installing pre-commit hook for automatic versioning..."

# Create the hook file
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# Pre-commit hook to automatically update version.txt
# This runs locally before each commit

# Get the directory of the repository
REPO_DIR=$(git rev-parse --show-toplevel)

# Generate new version in format YYMMDDHHmm
NEW_VERSION=$(date +%y%m%d%H%M)

# Update version.txt
echo $NEW_VERSION > "$REPO_DIR/src/version.txt"

# Add version.txt to the commit
git add "$REPO_DIR/src/version.txt"

echo "Auto-updated version to: $NEW_VERSION"
EOF

# Make it executable
chmod +x .git/hooks/pre-commit

echo "✅ Pre-commit hook installed successfully!"
echo "Now every commit will automatically update the version."
