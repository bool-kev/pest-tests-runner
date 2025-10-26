#!/bin/bash

# Script pour créer le package VSIX de l'extension

echo "🚀 Building Pest Runner Icons Extension..."
echo ""

# Nettoyer les anciens builds
echo "🧹 Cleaning old builds..."
rm -f *.vsix

# Compiler le projet
echo "📦 Compiling TypeScript..."
npm run package

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed!"
    exit 1
fi

# Créer le package VSIX
echo "📦 Creating VSIX package..."
npx @vscode/vsce package

if [ $? -ne 0 ]; then
    echo "❌ Package creation failed!"
    exit 1
fi

echo ""
echo "✅ Extension successfully packaged!"
echo ""
echo "📦 Package created: pest-runner-icons-0.0.1.vsix"
echo ""
echo "To install locally, run:"
echo "  code --install-extension pest-runner-icons-0.0.1.vsix"
echo ""
echo "To publish to marketplace, run:"
echo "  npx @vscode/vsce publish"
