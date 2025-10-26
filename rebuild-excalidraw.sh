#!/bin/bash

# Script pour rebuilder le bundle Excalidraw
# Usage: ./rebuild-excalidraw.sh

echo "🔨 Rebuilding Excalidraw bundle..."

cd excalidraw-build

echo "📦 Installing/updating dependencies..."
npm install

echo "🏗️ Building bundle..."
npm run build

echo "✅ Build completed!"
echo "📁 Bundle location: src/js/excalidraw-dist/excalidraw-bundle.iife.js"
echo "🔄 You can now refresh your Excalidraw editor page."

cd ..