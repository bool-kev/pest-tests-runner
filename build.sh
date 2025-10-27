#!/bin/bash

# Script pour créer et installer le package VSIX de l'extension

echo "🚀 Building Pest Runner Icons Extension..."
echo ""

# Create build directory if it doesn't exist
mkdir -p build

# Compiler le projet
echo "📦 Compiling TypeScript..."
npm run package

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed!"
    exit 1
fi

# Créer le package VSIX
echo "📦 Creating VSIX package..."
npx @vscode/vsce package --out build/

if [ $? -ne 0 ]; then
    echo "❌ Package creation failed!"
    exit 1
fi

# Détecter le VSIX généré dans le dossier build
VSIX_FILE=$(ls build/*.vsix | sort -V | tail -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "❌ No VSIX package found!"
    exit 1
fi

echo ""
echo "✅ Extension successfully packaged: $VSIX_FILE"
echo ""

# Désinstaller l'ancienne version (force)
echo "🗑️  Uninstalling previous version..."
code --uninstall-extension $(basename "$VSIX_FILE" .vsix) --force

# Installer la nouvelle version
echo "📥 Installing $VSIX_FILE..."
code --install-extension "$VSIX_FILE" --force

if [ $? -ne 0 ]; then
    echo "❌ Installation failed!"
    exit 1
fi

echo ""
echo "✅ Extension installed successfully!"
echo ""
echo "To publish to marketplace, run:"
echo "  npx @vscode/vsce publish"
