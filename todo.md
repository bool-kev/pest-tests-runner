# Todo List - Améliorations & Refactoring

## 🚀 Phase 4 : Optimisations & Fonctionnalités Avancées

### 1. ⚡ Optimisation avec Caching (AST)
- [ ] Implémenter un cache pour le parsing AST dans `PestCodeLensProvider`.
- [ ] Utiliser `document.version` comme clé de cache pour éviter de re-parser si le fichier n'a pas changé.
- [ ] Mesurer le gain de performance sur les gros fichiers.

### 2. 🧹 Refactoring du code (`activate`)
- [ ] Extraire la logique d'enregistrement des commandes dans une classe ou fonction dédiée.
- [ ] Extraire la configuration des décorations (`errorLineDecorationType`) dans un module UI.
- [ ] Alléger la fonction `activate` dans `extension.ts` pour la rendre plus lisible et maintenable.

### 3. 🐞 Ajout du Debugging
- [ ] Ajouter une commande `pest-tests-runner.debugTest`.
- [ ] Implémenter la configuration de lancement dynamique (`vscode.debug.startDebugging`) pour Xdebug.
- [ ] Permettre de lancer un test spécifique en mode debug depuis les CodeLens.

### 4. 🧪 Tests Unitaires (Finalisation)
- [ ] Configurer l'environnement de test (Mocha/Chai ou autre framework JS/TS).
- [ ] Écrire des tests unitaires pour `phpAstParser.ts` (cas nominaux, edge cases, syntaxe complexe).
- [ ] Écrire des tests unitaires pour `teamcityParser.ts` (parsing des événements, échappement, attributs).
- [ ] Vérifier la couverture de code et s'assurer de la non-régression.

---

## ✅ Archives (Phases Précédentes)

### Phase 1 : Migration Teamcity (Complété)
- [x] Remplacer --log-junit par --teamcity
- [x] Streaming temps réel
- [x] Parser Teamcity de base

### Phase 2 : Optimisations AST (Complété)
- [x] Intégration de `php-parser`
- [x] Remplacement des Regex par AST

### Phase 3 : Documentation (Complété)
- [x] Mise à jour README et CHANGELOG
