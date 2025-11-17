# Todo List - Migration vers Teamcity Streaming

## ✅ Phase 1 : Migration Teamcity (COMPLÉTÉ)

### 1. ✅ Passer au format Teamcity avec streaming

- Remplacer --log-junit par --teamcity pour obtenir les résultats en temps réel ligne par ligne
- Modifier executeTestCommand() pour utiliser spawn avec streaming des données stdout
- **Status** : ✅ Terminé - spawn implémenté avec streaming temps réel

### 2. ✅ Créer TestResultParser pour Teamcity

- Créer un parser qui analyse les lignes ##teamcity[testStarted/testFinished/testFailed/testIgnored]
- Extraire les informations (name, duration, message, details, flowId)
- **Status** : ✅ Terminé - Fichier teamcityParser.ts créé avec toutes les fonctions

### 3. ✅ Implémenter système d'événements avec cache

- Créer un système de cache Map<flowId, TestResult> pour tracker les tests en cours
- Implémenter les handlers pour testStarted, testFinished, testFailed, testIgnored
- **Status** : ✅ Terminé - handleTeamcityEvent() implémenté avec cache

### 4. ✅ Afficher messages d'erreur pour tests failed

- Extraire message et details depuis testFailed
- Afficher dans Output channel avec stack trace formatée
- **Status** : ✅ Terminé - Messages + Details affichés avec formatting |n → \n

### 5. ✅ Afficher messages pour tests skipped

- Extraire le message/raison du skip depuis testIgnored
- Mettre à jour le statut avec l'icône 🟡 et le message
- **Status** : ✅ Terminé - Raison du skip affichée dans Output

### 6. ✅ Mettre à jour UI en temps réel

- Appeler updateTestDecorations() et refreshCodeLens() immédiatement après chaque événement
- Ne plus attendre la fin complète des tests
- **Status** : ✅ Terminé - UI mise à jour après chaque testStarted/Finished/Failed/Ignored

### 7. ✅ Supprimer code XML obsolète

- Retirer parseJUnitResults(), fast-xml-parser dependency
- Supprimer extractTestNameFromXml(), extractErrorMessage(), getTestStatus(), logSummary()
- **Status** : ✅ Terminé - Tout le code XML supprimé + fast-xml-parser désinstallé

---

## 🚧 Phase 2 : Optimisations (EN COURS)

### 8. ✅ Installer php-parser pour AST parsing

- ✅ `npm install php-parser` installé avec succès
- ✅ Créé `src/phpAstParser.ts` (~160 lignes) avec :
  - parseTestsFromPhp() : Parse le fichier PHP avec AST
  - traverseAst() : Parcourt récursivement pour trouver test/it/describe
  - extractTestName() : Extrait le nom du premier argument
  - extractStringValue() : Gère strings, encapsed, concatenation
  - decodeTestName() : Décode les caractères échappés
- ✅ Remplacé regex dans `pestCodeLensProvider.ts` par parsing AST
- ✅ Remplacé regex dans `extractTestNamesFromFile()` par parsing AST  
- ✅ Remplacé regex dans `extractTestNamesFromDescribe()` par parsing AST
- ✅ Compilation réussie sans erreurs
- **Avantages** : Plus fiable, gère strings multi-lignes, concatenation, describes imbriqués
- **Status** : ✅ Terminé

### 9. ✅ Tester avec tests complexes

- ✅ Créé `test-samples/ComplexTest.php` avec cas complexes :
  - Noms avec apostrophes, guillemets, emojis, caractères spéciaux
  - Describes imbriqués sur 3 niveaux
  - Test qui échoue (pour valider messages d'erreur)
  - Test skippé (pour valider affichage raison)
  - Concatenation de strings
  - Datasets Pest
- ✅ Créé `TESTING_GUIDE.md` avec instructions détaillées de test manuel
- ⏳ Tests manuels à effectuer :
  - Vérifier parsing AST détecte tous les tests
  - Vérifier affichage temps réel fonctionne
  - Vérifier messages d'erreur s'affichent avec stack trace
  - Vérifier raisons de skip s'affichent
- **Status** : ✅ Préparation terminée, tests manuels à faire

---

## 📚 Phase 3 : Documentation (EN ATTENTE)

### 10. ✅ Mettre à jour documentation

- ✅ Mis à jour README.md :
  - Section "Features" restructurée avec 4 catégories
  - Nouveau : Real-Time Test Execution avec streaming
  - Nouveau : Smart Test Detection avec AST parsing
  - Amélioré : Rich Test Results avec détails erreurs/skip
  - Release Notes ajoutées pour v0.2.0
- ✅ Mis à jour CHANGELOG.md :
  - Version 0.2.0 ajoutée avec détails complets
  - Breaking changes documentés
  - Nouvelles features listées (streaming, AST, messages)
  - Performance et Technical Details expliqués
- ✅ Mis à jour package.json :
  - Version bumped to 0.2.0
  - Description améliorée avec "real-time streaming"
- **Status** : ✅ Terminé

---

## 📝 Notes Techniques

### Architecture Teamcity

- **Format** : `##teamcity[event key='value']`
- **Événements** : testStarted, testFinished, testFailed, testIgnored, testCount, testSuiteStarted, testSuiteFinished
- **Avantage** : Streaming ligne par ligne = feedback instantané
- **Cache** : Map<flowId, TeamcityResult> pour corréler les événements

### Performance

- **Avant** : Attend fin de tous les tests → Parse XML lourd → Affiche résultats
- **Après** : Parse ligne par ligne → Update UI immédiat → Feedback temps réel
- **Gain** : Affichage instantané pendant l'exécution au lieu d'après

### Fichiers modifiés

- ✅ `src/teamcityParser.ts` : Nouveau fichier parser Teamcity
- ✅ `src/extension.ts` : executeTestCommand() refactorisé avec spawn + handleTeamcityEvent()
- ✅ `package.json` : fast-xml-parser retiré des dependencies
- ⏳ `README.md` : À mettre à jour
- ⏳ `CHANGELOG.md` : À mettre à jour
