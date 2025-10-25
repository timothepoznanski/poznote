# Feature Excalidraw pour Poznote

## Aperçu

Cette fonctionnalité ajoute la possibilité de créer et d'éditer des diagrammes Excalidraw directement dans Poznote.

## Fichiers créés

### 1. `src/excalidraw_editor.php`
- Éditeur Excalidraw plein écran
- Intègre Excalidraw via CDN (React + Excalidraw)
- Boutons "Save" et "Return to notes"
- Support du thème clair/sombre
- Sauvegarde automatique des données JSON + image PNG

### 2. `src/api_save_excalidraw.php`
- API pour sauvegarder les diagrammes
- Stocke les données JSON dans le champ `entry`
- Génère et sauvegarde une image PNG pour l'aperçu
- Support de la création de nouvelles notes

### 3. `src/js/excalidraw.js`
- Fonctions pour créer et ouvrir les notes Excalidraw
- `createExcalidrawNote()` - Redirige vers l'éditeur
- `openExcalidrawNote(noteId)` - Ouvre une note existante

### 4. `src/css/excalidraw.css`
- Styles pour l'éditeur
- Styles pour les aperçus cliquables
- Support du dark mode
- Responsive mobile

## Fichiers modifiés

### 1. `src/modals.php`
- Ajout de l'option "Excalidraw Diagram" dans le modal de création
- Icône: `fa-draw-polygon`

### 2. `src/js/utils.js`
- Ajout du case 'excalidraw' dans `executeCreateAction()`
- Appelle `createExcalidrawNote()` lors de la sélection

### 3. `src/index.php`
- Chargement du script `excalidraw.js`
- Affichage des notes Excalidraw avec aperçu cliquable
- Notes Excalidraw non-éditables (contenteditable="false")
- Affichage de l'image PNG générée

## Fonctionnement

### Création d'une note Excalidraw

1. L'utilisateur clique sur le bouton "+" (Create)
2. Sélectionne "Excalidraw Diagram"
3. Est redirigé vers `excalidraw_editor.php`
4. L'éditeur Excalidraw s'ouvre avec un canvas vide
5. L'utilisateur crée son diagramme
6. Clique sur "Save" pour sauvegarder
7. Les données JSON + image PNG sont envoyées à `api_save_excalidraw.php`
8. Une nouvelle note est créée avec le type `'excalidraw'`

### Édition d'une note Excalidraw existante

1. L'utilisateur voit l'aperçu PNG dans la liste des notes
2. Clique sur l'aperçu
3. Est redirigé vers `excalidraw_editor.php?note_id=XXX`
4. L'éditeur charge les données JSON existantes
5. L'utilisateur modifie le diagramme
6. Clique sur "Save" pour mettre à jour
7. Les données JSON + nouvelle image PNG sont sauvegardées

### Retour aux notes

1. L'utilisateur clique sur "Return to notes"
2. Est redirigé vers `index.php` avec le workspace et l'ID de note
3. La note mise à jour s'affiche avec le nouvel aperçu

## Structure de données

### Base de données
- Type de note: `'excalidraw'`
- Champ `entry`: Stocke les données JSON d'Excalidraw
- Fichier PNG: `data/entries/{note_id}.png`

### Format JSON Excalidraw
```json
{
  "elements": [...],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    ...
  },
  "files": {...}
}
```

## Dépendances

### CDN (chargées dans excalidraw_editor.php)
- React 18 (production)
- ReactDOM 18 (production)
- Excalidraw 0.17.0 (production)

### Aucune installation locale nécessaire

## Compatibilité

- ✅ Support des workspaces
- ✅ Support des folders
- ✅ Support du dark mode
- ✅ Responsive mobile
- ✅ Fonctionne avec le système de recherche
- ✅ Compatible avec les autres types de notes (HTML, Markdown, Tasklist)

## Tests suggérés

1. ✅ Créer une nouvelle note Excalidraw
2. ✅ Dessiner un diagramme simple
3. ✅ Sauvegarder et vérifier l'aperçu
4. ✅ Rouvrir pour édition
5. ✅ Modifier et re-sauvegarder
6. ✅ Tester avec différents workspaces
7. ✅ Tester le dark mode
8. ✅ Tester sur mobile

## Notes techniques

- L'éditeur utilise le CDN Unpkg pour charger Excalidraw
- Les données sont stockées au format JSON pour permettre la ré-édition
- L'image PNG sert uniquement d'aperçu
- Le type `'excalidraw'` est déjà supporté par la structure de base de données existante

## Améliorations futures possibles

- Export PDF des diagrammes
- Collaboration en temps réel
- Templates de diagrammes pré-définis
- Intégration avec d'autres notes (embed)
- Version offline d'Excalidraw
