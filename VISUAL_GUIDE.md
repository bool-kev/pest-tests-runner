# Guide Visuel - Pest Runner Icons

Guide visuel pour comprendre comment fonctionne l'extension Pest Runner Icons.

## 📸 Aperçu Visuel

### 1. Vue d'ensemble d'un fichier de test

```
┌───────────────────────────────────────────────────────────┐
│ ExampleTest.php                                   ✓ x ☐ │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ [▶ Run File]  ← Icône pour exécuter tout le fichier     │
│                                                           │
│ describe('Array operations', function () {  [▶ Run Group]│
│     test('array has correct length', function () { [▶ Run]│
│         $array = [1, 2, 3, 4, 5];                        │
│         expect($array)->toHaveCount(5);                  │
│     });                                                   │
│                                                           │
│     it('can merge arrays', function () {         [▶ Run] │
│         $array1 = [1, 2, 3];                             │
│         $array2 = [4, 5, 6];                             │
│         $merged = array_merge($array1, $array2);         │
│         expect($merged)->toHaveCount(6);                 │
│     });                                                   │
│ });                                                       │
│                                                           │
│ test('basic example test', function () {         [▶ Run] │
│     expect(true)->toBeTrue();                            │
│ });                                                       │
└───────────────────────────────────────────────────────────┘
```

### 2. Icônes CodeLens en Détail

#### Icône "Run File" (En haut)

```
┌─────────────────────┐
│ $(run-all) Run File │  ← Cliquable
└─────────────────────┘
```

- **Apparaît** : Toujours en haut du fichier
- **Action** : Exécute tous les tests du fichier
- **Équivalent** : `./vendor/bin/pest path/to/file.php`

#### Icône "Run" (Tests individuels)

```
test('my test', function () {  $(play) Run  ← Cliquable
```

- **Apparaît** : Sur les lignes `test()` et `it()`
- **Action** : Exécute uniquement ce test
- **Équivalent** : `./vendor/bin/pest --filter /my test/`

#### Icône "Run Group" (Groupes describe)

```
describe('My Group', function () {  $(run-all) Run Group  ← Cliquable
```

- **Apparaît** : Sur les lignes `describe()`
- **Action** : Exécute tous les tests du groupe
- **Équivalent** : `./vendor/bin/pest --filter /My Group/`

## 🎬 Flux d'Exécution

### Scénario 1 : Clic sur "Run" (Test individuel)

```
1. Utilisateur clique sur [▶ Run] à côté d'un test
   │
   ▼
2. Extension détecte le clic
   │
   ▼
3. Vérifie si Better Pest est installé
   │
   ├─ OUI → Positionne le curseur sur la ligne du test
   │         └─ Exécute: better-pest.run
   │
   └─ NON → Exécute: pest --filter /test_name/
   │
   ▼
4. Terminal s'ouvre et affiche les résultats
```

### Scénario 2 : Clic sur "Run File"

```
1. Utilisateur clique sur [▶ Run File]
   │
   ▼
2. Extension détecte le clic
   │
   ▼
3. Vérifie si Better Pest est installé
   │
   ├─ OUI → Exécute: better-pest.run-file
   │
   └─ NON → Exécute: pest path/to/file.php
   │
   ▼
4. Tous les tests du fichier s'exécutent
```

## 🔍 Détection des Tests

### Pattern Matching

L'extension scanne le fichier ligne par ligne :

```php
// ✅ DÉTECTÉ
test('user can login', function () {
    // CodeLens apparaît ici

// ✅ DÉTECTÉ  
it('validates email', function () {
    // CodeLens apparaît ici

// ✅ DÉTECTÉ
describe('Authentication', function () {
    // CodeLens apparaît ici

// ❌ NON DÉTECTÉ (pas au début de ligne)
    test('indented test', function () {
        
// ❌ NON DÉTECTÉ (syntaxe différente)
test("double quotes with complex args", ['data'], function () {
```

### Regex Utilisées

```javascript
// Pour test() et it()
/^\s*(test|it)\s*\(\s*['"`]([^'"`]+)['"`]/

// Pour describe()
/^\s*describe\s*\(\s*['"`]([^'"`]+)['"`]/
```

## ⚙️ Configuration

### Panneau de Configuration

```
Settings > Extensions > Pest Runner Icons
┌─────────────────────────────────────────────────┐
│                                                 │
│ ☑ Enable CodeLens                               │
│   Show run buttons in test files               │
│                                                 │
│ ☑ Use Better Pest                               │
│   Use Better Pest extension when available     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Désactiver les CodeLens

**Méthode 1 : Via UI**

1. Ouvrir Settings (`Ctrl+,`)
2. Chercher "Pest Runner"
3. Décocher "Enable CodeLens"

**Méthode 2 : Via settings.json**

```json
{
  "pest-runner-icons.enableCodeLens": false
}
```

## 🎯 Intégration Better Pest

### Détection Automatique

```
┌─────────────────────────────────────────────┐
│  Pest Runner Icons démarre                  │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
         ┌────────────────────┐
         │ Better Pest        │
         │ est-il installé ?  │
         └────────┬───────────┘
                  │
         ┌────────┴────────┐
         │                 │
        OUI               NON
         │                 │
         ▼                 ▼
    ┌─────────┐      ┌──────────┐
    │ Utilise │      │ Utilise  │
    │ Better  │      │ Runner   │
    │ Pest    │      │ Intégré  │
    └─────────┘      └──────────┘
```

### Commandes Déléguées

Quand Better Pest est disponible :

| Action Pest Runner Icons | Délégué à Better Pest |
|-------------------------|----------------------|
| Run Test | `better-pest.run` |
| Run File | `better-pest.run-file` |
| Run Suite | `better-pest.run-suite` |

### Avantages de l'Intégration

```
Better Pest activé :
├─ ✅ Support SSH
├─ ✅ Support Docker
├─ ✅ Configuration avancée
├─ ✅ Task runner optimisé
├─ ✅ Problem matcher
└─ ✅ Formatage des erreurs

Runner intégré uniquement :
├─ ✅ Exécution basique
├─ ❌ Pas de SSH/Docker
├─ ❌ Configuration limitée
└─ ❌ Terminal simple
```

## 🖥️ Terminal de Sortie

### Avec Better Pest

```
┌─────────────────────────────────────────────┐
│ TERMINAL: pest: run                         │
├─────────────────────────────────────────────┤
│                                             │
│ PASS  Tests\ExampleTest                     │
│ ✓ basic example test                        │
│ ✓ addition works correctly                  │
│                                             │
│ Tests:  2 passed (2 total)                  │
│ Time:   0.12s                               │
│                                             │
└─────────────────────────────────────────────┘
```

### Avec Runner Intégré

```
┌─────────────────────────────────────────────┐
│ TERMINAL: Pest Test Runner                  │
├─────────────────────────────────────────────┤
│ $ ./vendor/bin/pest tests/ExampleTest.php   │
│                                             │
│   PASS  Tests\ExampleTest                   │
│   ✓ basic example test                      │
│   ✓ addition works correctly                │
│                                             │
└─────────────────────────────────────────────┘
```

## 🐛 Indicateurs Visuels

### Fichier de Test Valide

```
✅ Fichier détecté comme test Pest
├─ Nom : *Test.php OU
├─ Chemin : */tests/*
├─ Langage : PHP
└─ CodeLens activés
```

### Fichier Non-Test

```
❌ Fichier ignoré
├─ Pas dans /tests/
├─ Ne se termine pas par Test.php
└─ Pas de CodeLens
```

## 📱 Responsive à la Configuration

### CodeLens Activés

```php
<?php
// [▶ Run File]  ← VISIBLE

test('example', function () {  [▶ Run]  ← VISIBLE
    //...
});
```

### CodeLens Désactivés

```php
<?php
// Aucun CodeLens visible

test('example', function () {
    //...
});
```

## 🎨 Personnalisation Visuelle

Les icônes utilisent les codicons de VS Code :

- `$(play)` → ▶️ Icône Play
- `$(run-all)` → 🏃 Icône Run All

Ces icônes s'adaptent automatiquement au thème VS Code.

## 🔄 Cycle de Vie

```
1. Ouverture fichier PHP
   │
   ▼
2. Extension vérifie si c'est un test
   │
   ├─ tests/ → OUI
   ├─ *Test.php → OUI
   └─ Autre → NON
   │
   ▼ (si OUI)
3. Parse le fichier
   │
   ▼
4. Crée les CodeLens
   │
   ▼
5. Affiche dans l'éditeur
   │
   ▼
6. Utilisateur clique
   │
   ▼
7. Exécute le test
```

## 💡 Astuces Visuelles

### Hover sur CodeLens

```
┌─────────────────────────┐
│ $(play) Run            │
│                        │
│ Run this specific test │  ← Tooltip
└─────────────────────────┘
```

### Commande Palette

```
Ctrl+Shift+P
┌────────────────────────────────────┐
│ > pest                             │
├────────────────────────────────────┤
│ Pest Runner Icons: Run Test        │
│ Pest Runner Icons: Run Test File   │
│ Pest Runner Icons: Run Test Suite  │
└────────────────────────────────────┘
```

---

**Profitez de l'expérience visuelle optimale ! 👁️✨**
