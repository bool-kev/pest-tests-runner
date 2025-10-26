# Development Guide

Guide pour développer et tester l'extension Pest Runner Icons.

## Prérequis

- Node.js (v22 ou supérieur)
- VS Code
- npm ou yarn

## Installation des dépendances

```bash
npm install
```

## Compilation

### Mode développement (avec watch)

```bash
npm run watch
```

### Compilation unique

```bash
npm run compile
```

### Build de production

```bash
npm run package
```

## Test de l'extension

### Méthode 1 : Debug dans VS Code

1. Ouvrez le projet dans VS Code
2. Appuyez sur `F5` ou allez dans "Run > Start Debugging"
3. Une nouvelle fenêtre VS Code s'ouvrira avec l'extension chargée
4. Ouvrez un fichier de test Pest (par exemple dans `examples/`)
5. Les CodeLens devraient apparaître automatiquement

### Méthode 2 : Installation locale

```bash
# Créer le package VSIX
npm run package
npx @vscode/vsce package

# Installer l'extension
code --install-extension pest-runner-icons-0.0.1.vsix
```

## Structure du projet

```
pest-runner-icons/
├── src/
│   ├── extension.ts              # Point d'entrée principal
│   └── pestCodeLensProvider.ts   # Fournisseur de CodeLens
├── examples/                      # Fichiers de test d'exemple
│   ├── ExampleTest.php
│   └── UserTest.php
├── dist/                          # Code compilé (généré)
├── package.json                   # Configuration de l'extension
└── README.md                      # Documentation
```

## Architecture

### extension.ts

- Active l'extension
- Enregistre les commandes
- Gère l'intégration avec Better Pest
- Fournit un fallback pour l'exécution des tests

### pestCodeLensProvider.ts

- Implémente `CodeLensProvider`
- Parse les fichiers PHP pour trouver les tests
- Détecte `test()`, `it()`, et `describe()`
- Fournit les CodeLens avec icônes

## Commandes disponibles

- `pest-runner-icons.runTest` - Exécute un test spécifique
- `pest-runner-icons.runTestFile` - Exécute tous les tests du fichier
- `pest-runner-icons.runTestSuite` - Exécute toute la suite de tests

## Configuration

Dans `.vscode/settings.json` :

```json
{
  "pest-runner-icons.enableCodeLens": true,
  "pest-runner-icons.useBetterPest": true
}
```

## Intégration Better Pest

L'extension vérifie automatiquement si Better Pest est installé :

```typescript
const betterPestExtension = vscode.extensions.getExtension('m1guelpf.better-pest');
if (betterPestExtension) {
    // Utilise Better Pest
    await vscode.commands.executeCommand('better-pest.run');
} else {
    // Utilise le runner intégré
    executeTestCommand();
}
```

## Détection des tests

Le CodeLens Provider utilise des regex pour détecter :

```typescript
// test() ou it()
/^\s*(test|it)\s*\(\s*['"`]([^'"`]+)['"`]/

// describe()
/^\s*describe\s*\(\s*['"`]([^'"`]+)['"`]/
```

## Débogage

### Activer les logs

Dans extension.ts, ajoutez :

```typescript
console.log('Debug info:', value);
```

### Voir les logs

- Ouvrez "View > Output"
- Sélectionnez "Extension Host" dans le dropdown
- Les logs de console.log apparaîtront ici

### Breakpoints

- Placez des breakpoints dans le code TypeScript
- Lancez avec F5
- Le débogueur s'arrêtera aux breakpoints

## Tests

Pour ajouter des tests unitaires :

```bash
npm run pretest
npm test
```

## Publication

### 1. Mise à jour de la version

```bash
npm version patch  # ou minor, ou major
```

### 2. Création du package

```bash
npx @vscode/vsce package
```

### 3. Publication sur le Marketplace

```bash
npx @vscode/vsce publish
```

## Troubleshooting

### CodeLens ne s'affiche pas

- Vérifiez que le fichier est bien un fichier PHP de test
- Vérifiez que `pest-runner-icons.enableCodeLens` est à `true`
- Redémarrez la fenêtre VS Code

### Les commandes ne fonctionnent pas

- Vérifiez la console de développement (Help > Toggle Developer Tools)
- Vérifiez que Better Pest est installé si `useBetterPest` est `true`

### Erreurs de compilation

```bash
# Nettoyer et réinstaller
rm -rf node_modules dist
npm install
npm run compile
```

## Contribution

1. Fork le projet
2. Créez une branche (`git checkout -b feature/amazing-feature`)
3. Committez vos changements (`git commit -m 'Add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

## Ressources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [CodeLens Provider](https://code.visualstudio.com/api/language-extensions/programmatic-language-features#codelens-show-actionable-context-information-within-source-code)
- [Better Pest Extension](https://marketplace.visualstudio.com/items?itemName=m1guelpf.better-pest)
- [Pest PHP](https://pestphp.com/)
