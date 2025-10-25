# Troubleshooting Excalidraw Integration

## Issues Résolus

### 1. "Cannot read properties of undefined (reading 'jsxs')"

**Cause**: Le fichier `excalidraw.production.min.js` ne contient pas les exports nécessaires.

**Solution**: Utiliser `excalidraw.min.js` à la place et ajouter la feuille de style CSS.

```html
<!-- Avant (ne fonctionne pas) -->
<script src="https://unpkg.com/@excalidraw/excalidraw@0.17.0/dist/excalidraw.production.min.js"></script>

<!-- Après (fonctionne) -->
<link rel="stylesheet" href="https://unpkg.com/@excalidraw/excalidraw@0.17.0/dist/excalidraw.min.css" />
<script src="https://unpkg.com/@excalidraw/excalidraw@0.17.0/dist/excalidraw.min.js"></script>
```

### 2. "Cannot destructure property 'Excalidraw' of 'window.ExcalidrawLib' as it is undefined"

**Cause**: Le script tente d'accéder à `window.ExcalidrawLib` avant que la bibliothèque soit complètement chargée.

**Solution**: Envelopper l'initialisation dans un événement `DOMContentLoaded` et ajouter une vérification.

```javascript
// Avant (ne fonctionne pas)
const { Excalidraw } = window.ExcalidrawLib;

// Après (fonctionne)
window.addEventListener('DOMContentLoaded', function() {
    if (typeof window.ExcalidrawLib === 'undefined') {
        console.error('Excalidraw library not loaded');
        alert('Error: Excalidraw library failed to load. Please refresh the page.');
        return;
    }
    
    const { Excalidraw } = window.ExcalidrawLib;
    // ... reste du code
});
```

### 3. React Scripts avec CORS

**Solution**: Ajouter l'attribut `crossorigin` aux scripts React pour éviter les problèmes CORS.

```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
```

## Dépannage Général

### L'éditeur Excalidraw ne s'affiche pas

1. **Vérifier la console du navigateur** pour des erreurs JavaScript
2. **Vérifier la connexion CDN**:
   - Ouvrir https://unpkg.com/@excalidraw/excalidraw@0.17.0/dist/excalidraw.min.js dans le navigateur
   - Si le fichier ne charge pas, le CDN peut être temporairement indisponible
3. **Vérifier les bloqueurs de contenu**: Désactiver temporairement les bloqueurs de pub/scripts
4. **Vérifier la version de React**: S'assurer que React 18 est chargé correctement

### L'image PNG ne s'affiche pas

1. **Vérifier les permissions du dossier `data/entries/`**:
   ```bash
   chmod 755 data/entries/
   ```
2. **Vérifier que le fichier PNG existe**:
   ```bash
   ls -la data/entries/[note_id].png
   ```
3. **Vérifier les logs PHP** pour les erreurs d'écriture de fichier

### La sauvegarde échoue

1. **Vérifier que `api_save_excalidraw.php` est accessible**
2. **Vérifier la console du navigateur** pour les erreurs de fetch
3. **Vérifier les permissions d'écriture** sur `data/entries/`
4. **Vérifier la taille maximale d'upload PHP** (`upload_max_filesize` et `post_max_size`)

### Le thème dark/light ne fonctionne pas

1. **Vérifier localStorage**: Ouvrir la console et taper `localStorage.getItem('poznote-theme')`
2. **Forcer un thème**: `localStorage.setItem('poznote-theme', 'dark')` puis recharger
3. **Vérifier que `css/dark-mode.css` est chargé**

## Logs de Debug

Pour activer les logs de debug, ouvrir la console du navigateur et vérifier:

```javascript
// Vérifier que React est chargé
console.log('React:', typeof React);

// Vérifier que ReactDOM est chargé
console.log('ReactDOM:', typeof ReactDOM);

// Vérifier que ExcalidrawLib est chargé
console.log('ExcalidrawLib:', typeof window.ExcalidrawLib);

// Vérifier l'API Excalidraw après initialisation
console.log('Excalidraw API initialized');
```

## Versions Testées

- React: 18.x
- ReactDOM: 18.x
- Excalidraw: 0.17.0

## Ressources

- [Documentation Excalidraw](https://docs.excalidraw.com/)
- [Repository Excalidraw](https://github.com/excalidraw/excalidraw)
- [UNPKG CDN](https://unpkg.com/)
