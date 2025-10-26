# Guide d'Installation - Pest Runner Icons

## 🚀 Installation Rapide (Utilisateur Final)

### Méthode 1 : Ligne de Commande

```bash
code --install-extension pest-runner-icons-0.0.1.vsix
```

### Méthode 2 : Interface VS Code

1. Ouvrir VS Code
2. Extensions (`Ctrl+Shift+X`)
3. Menu **⋯** (3 points) → **Install from VSIX...**
4. Sélectionner `pest-runner-icons-0.0.1.vsix`
5. Redémarrer VS Code

### Méthode 3 : Drag & Drop

- Glisser le fichier `.vsix` dans la fenêtre VS Code
- Cliquer sur "Install"

---

## 📋 Prérequis

- **VS Code** version 1.105.0 ou supérieure
- **Système** : Windows, macOS, ou Linux
- **Aucune autre extension requise** (Better Pest recommandée)

---

## ✅ Vérification de l'Installation

### Via Terminal

```bash
code --list-extensions | grep pest-runner-icons
```

### Via VS Code

1. `Ctrl+Shift+X` (Extensions)
2. Chercher "Pest Runner Icons"
3. Devrait apparaître comme "Installée"

---

## 🧪 Test de Fonctionnement

1. Ouvrir un projet Laravel avec Pest
2. Ouvrir un fichier de test (ex: `tests/Feature/ExampleTest.php`)
3. Les CodeLens `[▶ Run]` devraient apparaître
4. Cliquer pour exécuter un test

---

## 🔧 Configuration (Optionnelle)

Dans VS Code Settings (`Ctrl+,`) :

```json
{
  "pest-runner-icons.enableCodeLens": true,
  "pest-runner-icons.useBetterPest": true
}
```

---

## 💡 Extensions Recommandées

Pour une meilleure expérience, installer aussi :

- **Better Pest** (m1guelpf.better-pest)
  - Support SSH/Docker
  - Configuration avancée
  - Meilleur formatage

Installation :

```bash
code --install-extension m1guelpf.better-pest
```

---

## 🐛 Dépannage

### Les CodeLens n'apparaissent pas ?

1. ✅ Vérifier que le fichier est dans `/tests/` ou se termine par `Test.php`
2. ✅ Vérifier que le langage est PHP
3. 🔄 Recharger la fenêtre : `Ctrl+Shift+P` → "Reload Window"
4. ✅ Vérifier les settings : `pest-runner-icons.enableCodeLens = true`

### L'extension n'est pas installée ?

```bash
# Réinstaller
code --uninstall-extension pest-runner-icons
code --install-extension pest-runner-icons-0.0.1.vsix
```

### Désinstaller l'extension

```bash
code --uninstall-extension pest-runner-icons
```

Ou via VS Code : Extensions → Pest Runner Icons → Désinstaller

---

## 📦 Fichier à Transférer

**Fichier** : `pest-runner-icons-0.0.1.vsix`  
**Taille** : ~31 KB  
**Format** : Package d'extension VS Code

---

## 🔄 Mise à Jour

Quand une nouvelle version est disponible :

```bash
# Désinstaller l'ancienne version
code --uninstall-extension pest-runner-icons

# Installer la nouvelle version
code --install-extension pest-runner-icons-0.0.2.vsix
```

---

## 🌐 Distribution

### Partage Direct

- Email le fichier `.vsix`
- Cloud : Google Drive, Dropbox
- Clé USB
- Réseau partagé

### Publication Marketplace (Avancé)

Voir **PUBLISHING.md** pour publier sur le VS Code Marketplace

---

## 📞 Support

- 📖 Documentation : Voir README.md
- 🐛 Problèmes : Consultez DEVELOPMENT.md
- 💬 Questions : Contactez le mainteneur

---

**Installation réussie ! Profitez de Pest Runner Icons ! 🚀✨**
