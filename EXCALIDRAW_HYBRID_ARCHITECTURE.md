# Excalidraw Integration - Architecture Hybride

## 🎯 Problème résolu

Nous avons remplacé l'approche CDN (qui ne fonctionnait pas) par une **architecture hybride** qui utilise le package npm officiel d'Excalidraw compilé avec Vite, puis intégré dans notre application PHP.

## 🏗️ Architecture

```
poznote-dev/
├── excalidraw-build/          # Projet React pour builder Excalidraw
│   ├── src/
│   │   ├── ExcalidrawComponent.jsx  # Composant React wrapper
│   │   └── main.jsx                 # Point d'entrée avec API globale
│   ├── package.json
│   └── vite.config.js
├── src/
│   ├── js/excalidraw-dist/
│   │   └── excalidraw-bundle.iife.js  # Bundle compilé
│   └── excalidraw_editor.php          # Interface PHP
└── rebuild-excalidraw.sh             # Script de rebuild
```

## 🚀 Comment ça marche

1. **Phase de build** (une seule fois ou après mise à jour) :
   - Le projet React dans `excalidraw-build/` compile Excalidraw
   - Vite génère un bundle IIFE dans `src/js/excalidraw-dist/`
   - Ce bundle expose `window.PoznoteExcalidraw` globalement

2. **Phase d'exécution** (à chaque chargement de page) :
   - Le PHP charge le bundle compilé
   - JavaScript utilise `window.PoznoteExcalidraw.init()` pour initialiser l'éditeur
   - L'API fournit toutes les méthodes nécessaires (getSceneElements, exportToCanvas, etc.)

## 🔧 Maintenance

### Rebuilder le bundle après modification

```bash
./rebuild-excalidraw.sh
```

### Mettre à jour Excalidraw

```bash
cd excalidraw-build
npm update @excalidraw/excalidraw
npm run build
```

## ✨ Avantages de cette approche

1. **Fiabilité** : Pas de dépendance aux CDN externes
2. **Performance** : Bundle optimisé et mis en cache
3. **Contrôle** : Version d'Excalidraw fixe et testée
4. **Flexibilité** : Facilité de customisation du composant React
5. **Intégration** : API sur mesure pour les besoins de PozNote

## 🔄 Processus de développement

1. Modifier le composant dans `excalidraw-build/src/`
2. Exécuter `./rebuild-excalidraw.sh`
3. Tester dans l'éditeur PHP
4. Répéter si nécessaire

## 📦 Dépendances

- **Build time** : Node.js, npm, Vite, React, @excalidraw/excalidraw
- **Runtime** : Aucune (tout est dans le bundle compilé)

Cette solution résout définitivement les problèmes de chargement d'Excalidraw !