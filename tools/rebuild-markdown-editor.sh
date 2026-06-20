#!/bin/bash

# Script to rebuild the CodeMirror Markdown editor bundle
# Usage: ./tools/rebuild-markdown-editor.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Rebuilding Markdown CodeMirror bundle..."

cd "$ROOT_DIR/markdown-editor-build"

echo "Installing/updating dependencies..."
npm install

echo "Building bundle..."
npm run build

echo "Build completed!"
echo "Bundle location: src/js/codemirror-dist/markdown-codemirror.iife.js"
