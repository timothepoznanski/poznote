# Implémentation CSP - Résumé des Modifications

## 🎯 Objectif

Permettre le déploiement de Poznote avec une Content Security Policy (CSP) stricte, sans nécessiter `unsafe-inline` ni `unsafe-eval` dans les configurations NGINX.

## ✅ Ce qui a été fait

### 1. Système de nonces CSP (`src/csp_helper.php`)

- Génération de nonces cryptographiquement sécurisés
- Helper `nonceAttr()` pour faciliter l'ajout aux scripts inline
- Support des headers CSP et meta tags
- Mode strict/permissif configurable

### 2. Extraction des scripts inline vers fichiers externes

**Nouveaux fichiers créés :**
- `src/js/index-page.js` - Fonctionnalités de la page principale
- `src/js/page-config.js` - Gestion de la configuration des pages
- `src/js/workspace-navigation.js` - Utilitaires de navigation
- `src/js/trash-page.js` - Fonctionnalités de la corbeille
- `src/js/note-creation.js` - Création de notes

### 3. Remplacement de `new Function()`

Dans `src/js/events.js`, le code qui utilisait `new Function()` (équivalent à `eval`) a été remplacé par un parser sécurisé pour les attributs onclick.

### 4. Ajout des nonces aux scripts essentiels

Les scripts qui DOIVENT rester inline (initialisation du thème pour éviter le flash) ont reçu des nonces dans :
- `index.php`
- `display.php`
- `settings.php`
- `backup_export.php`
- `restore_import.php`
- `trash.php`
- `excalidraw_editor.php`

## 🚀 Utilisation

### Mode par défaut (Permissif - Compatible)

Aucune configuration nécessaire. Le système fonctionne en mode compatible avec :
- `unsafe-inline` autorisé
- `unsafe-eval` autorisé
- Nonces inclus pour migration future

### Mode Strict (Recommandé en production)

**Option 1 : Variable d'environnement**
```bash
export POZNOTE_STRICT_CSP=true
```

**Option 2 : Base de données**
```sql
INSERT INTO settings (key, value) VALUES ('strict_csp_mode', 'true');
```

**Option 3 : NGINX**
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none';" always;
```

## 📋 Points à compléter (si nécessaire)

### Scripts inline restants

Certains fichiers contiennent encore des scripts inline qui pourraient être externalisés :

1. **restore_import.php** - Attributs `onclick` sur les boutons
   - Solution : Utiliser des `data-action` et des event listeners
   
2. **Bibliothèques tierces** 
   - `swagger-ui` (utilise eval)
   - `excalidraw` (utilise new Function)
   - `mermaid` (utilise eval)
   - Solution : Ces bibliothèques nécessitent `unsafe-eval` OU migrer vers des versions plus récentes CSP-compatibles

### Recommandation

Pour un CSP vraiment strict sans `unsafe-eval`, il faudrait :
1. Vérifier si des versions plus récentes de ces bibliothèques sont CSP-compatibles
2. Considérer des alternatives si nécessaire
3. Ou accepter `script-src 'self' 'unsafe-eval'` (qui reste plus sûr que `unsafe-inline`)

## 🧪 Tests

```bash
# Activer le mode strict
export POZNOTE_STRICT_CSP=true

# Redémarrer les services
systemctl restart php-fpm nginx

# Vérifier dans la console du navigateur :
# - Pas d'erreurs CSP
# - Toutes les fonctionnalités marchent
```

## 📚 Documentation complète

Voir `CSP_IMPLEMENTATION_GUIDE.md` pour la documentation détaillée.

## 🔐 Sécurité

Cette implémentation :
- ✅ Élimine `unsafe-inline` pour les scripts (mode strict)
- ⚠️ Garde `unsafe-eval` pour certaines bibliothèques tierces
- ✅ Utilise des nonces rotatifs par requête
- ✅ Déplace la majorité du code vers des fichiers externes
- ✅ Remplace `new Function()` par du code sûr

## 🎓 Approche adoptée

Au lieu d'ajouter des `nonceAttr()` partout, nous avons :
1. **Extrait** le maximum de code vers des fichiers .js externes
2. **Gardé** les nonces uniquement pour les scripts vraiment essentiels (thème, config)
3. **Refactorisé** le code pour éviter eval/new Function
4. **Créé** des fichiers modulaires et maintenables

C'est une approche **propre et maintenable** plutôt qu'un simple ajout de nonces.
