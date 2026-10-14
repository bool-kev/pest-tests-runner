# Todo List - Améliorations & Refactoring

## 🚀 Phase 5 : Fonctionnalités avancées

### 1. ♻️ Exécution continue (watch)
- [ ] `TestRunProfile.supportsContinuousRun` (nécessite `engines.vscode` ≥ 1.80) : relancer les tests d'un fichier à chaque sauvegarde.

### 2. 📊 Couverture de code
- [ ] Profil Coverage (`--coverage-clover`) + `TestRun.addCoverage` (VS Code ≥ 1.88), avec `XDEBUG_MODE=coverage`.

### 3. 🐳 Debug dans Docker / WSL
- [ ] Générer une configuration de lancement avec `pathMappings` à partir de `command`.

### 4. 🧭 Arborescence par dossiers
- [ ] Afficher `tests/Feature/...` comme des dossiers dans le Test Explorer au lieu de chemins relatifs.

---

## ✅ Archives (Phases Précédentes)

### Phase 4 : API Testing & fiabilité (0.5.0)
- [x] Cache AST centralisé (`document.version` + hash)
- [x] Test Explorer, icônes de gouttière, profil Debug, vue diff
- [x] Détection de la racine du projet (dossier parent, monorepo), Docker/Sail/WSL
- [x] Identifiants de tests = description Pest complète (synchro des icônes)
- [x] Tests unitaires (parsers, commande, résolution du projet, store) + e2e sur Pest 3 et 4

### Phase 1 : Migration Teamcity (Complété)
- [x] Remplacer --log-junit par --teamcity
- [x] Streaming temps réel
- [x] Parser Teamcity de base

### Phase 2 : Optimisations AST (Complété)
- [x] Intégration de `php-parser`
- [x] Remplacement des Regex par AST

### Phase 3 : Documentation (Complété)
- [x] Mise à jour README et CHANGELOG
