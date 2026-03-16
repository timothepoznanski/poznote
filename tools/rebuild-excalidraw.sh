#!/bin/bash

# Script to rebuild the Excalidraw bundle
# Usage: ./rebuild-excalidraw.sh

echo "Rebuilding Excalidraw bundle..."

cd excalidraw-build

echo "Installing/updating dependencies..."
npm install

echo "Building bundle..."
npm run build

echo "Copying excalidraw-assets (fonts and lazy-loaded chunks)..."
cp -r node_modules/@excalidraw/excalidraw/dist/excalidraw-assets ../src/js/excalidraw-dist/

echo "Build completed!"
echo "Bundle location: src/js/excalidraw-dist/excalidraw-bundle.iife.js"
echo "Assets location: src/js/excalidraw-dist/excalidraw-assets/"
echo "You can now refresh your Excalidraw editor page."

cd ..