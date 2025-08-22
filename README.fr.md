

<div align="center" style="border:2px solid #0078d7; border-radius:8px; padding:20px; background:#f0f8ff; margin-bottom:20px;">
<h3 style="margin:0; display:flex; justify-content:center; align-items:center;">
<a href="README.md" style="text-decoration:none; display:flex; align-items:center;">
  <span>Click here to read this documentation in English</span>
  <img src="https://flagcdn.com/24x18/gb.png" alt="GB flag" style="margin-left:10px;">
</a>
</h3>
</div>

# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite)](https://www.sqlite.org/)

Une application de prise de notes puissante qui vous donne un contrôle total sur vos données. Poznote peut être installée localement sur votre ordinateur ou sur un serveur distant pour accéder à vos notes depuis votre téléphone ou le navigateur web de votre ordinateur.

## Fonctionnalités

- 📝 Éditeur de texte enrichi
- 🔍 Recherche puissante
- 🏷️ Système de tags
- 📎 Pièces jointes
- 🤖 Fonctionnalités IA
- 📱 Design responsive pour tous les appareils
- 🖥️ Support multi-instance
- 🔒 Auto-hébergement avec authentification sécurisée
- 💾 Outils de sauvegarde et d'export intégrés
- 🗑️ Corbeille avec restauration
- 🌐 API REST pour l'automatisation

## Exemples

![texte alternatif](image.png)

![texte alternatif](image-1.png)

## Table des matières

- [Installation](#installation)
- [Accéder à votre instance](#accéder-à-votre-instance)
- [Instances multiples](#instances-multiples)
- [Fonctionnalités IA](#fonctionnalités-ia)
- [Modifier les paramètres](#modifier-les-paramètres)
- [Réinitialiser le mot de passe](#réinitialiser-le-mot-de-passe)
- [Mettre à jour l'application](#mettre-à-jour-lapplication)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Vue hors-ligne](#vue-hors-ligne)
- [Documentation API](#documentation-api)
- [Opérations manuelles](#opérations-manuelles)

## Installation

Poznote fonctionne dans un conteneur Docker, ce qui le rend très facile à déployer partout. Vous pouvez :

- **Lancer localement** sur votre ordinateur avec Docker Desktop (Windows) ou Docker Engine (Linux/macOS)
- **Déployer sur un serveur** pour accéder à vos notes de partout - téléphone, tablette ou tout navigateur web

### Prérequis

**Windows :**
- [Docker Desktop pour Windows](https://www.docker.com/products/docker-desktop/)

**Linux/macOS :**
- [Docker Engine](https://docs.docker.com/engine/install/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- Si vous n'êtes pas root, ajoutez votre utilisateur au groupe docker :

```bash
sudo usermod -aG docker $USER
```

### Démarrage rapide

**Windows (PowerShell) :**
```powershell
function Test-DockerConflict($name) { return (docker ps -a --format "{{.Names}}" | Select-String "^${name}-webserver-1$").Count -eq 0 }; do { $instanceName = Read-Host "\nChoisissez un nom d'instance (poznote, poznote-work, mes-notes, etc.) [poznote]"; if ([string]::IsNullOrWhiteSpace($instanceName)) { $instanceName = "poznote" }; if (-not ($instanceName -match "^[a-zA-Z0-9_-]+$")) { Write-Host "⚠️  Le nom ne peut contenir que des lettres, chiffres, tirets et underscores." -ForegroundColor Yellow; continue }; if (-not (Test-DockerConflict $instanceName)) { Write-Host "⚠️  Le conteneur Docker '${instanceName}-webserver-1' existe déjà !" -ForegroundColor Yellow; continue }; break } while ($true); git clone https://github.com/timothepoznanski/poznote.git $instanceName; cd $instanceName; .\setup.ps1
```

**Linux/macOS (Bash) :**
```bash
check_conflicts() { local name="$1"; if docker ps -a --format "{{.Names}}" | grep -q "^${name}-webserver-1$"; then echo "⚠️  Le conteneur Docker '${name}-webserver-1' existe déjà !"; return 1; fi; return 0; }; while true; do read -p "\nChoisissez un nom d'instance (poznote, poznote-work, mes-notes, etc.) [poznote]: " instanceName; instanceName=${instanceName:-poznote}; if [[ "$instanceName" =~ ^[a-zA-Z0-9_-]+$ ]] && check_conflicts "$instanceName"; then break; fi; done; git clone https://github.com/timothepoznanski/poznote.git "$instanceName"; cd "$instanceName"; chmod +x setup.sh; ./setup.sh
```

## Accéder à votre instance

Après installation, accédez à Poznote à l'adresse : `http://VOTRE_SERVEUR:VOTRE_PORT`

où VOTRE_SERVEUR dépend de votre environnement :

- localhost
- L'adresse IP de votre serveur
- Votre nom de domaine

Le script d'installation affichera l'URL exacte et les identifiants.

## Instances multiples

Vous pouvez lancer plusieurs instances Poznote isolées sur le même serveur. Il suffit de lancer le script de configuration plusieurs fois avec des noms d'instance et des ports différents.

Chaque instance aura :
- Des conteneurs Docker séparés
- Un stockage de données indépendant
- Des ports différents
- Des configurations isolées

### Exemple : Instances personnelle et professionnelle sur le même serveur

```
Serveur : mon-serveur.com
├── Poznote Personnel
│   ├── Port : 8040
│   ├── URL : http://mon-serveur.com:8040
│   ├── Conteneur : poznote-personnel-webserver-1
│   └── Données : ./poznote-personnel/data/
│
└── Poznote Travail
    ├── Port : 8041
    ├── URL : http://mon-serveur.com:8041
    ├── Conteneur : poznote-travail-webserver-1
    └── Données : ./poznote-travail/data/
```

Pour des déploiements sur des serveurs différents, il suffit juste de lancer le script de configuration et d'utiliser l'option de menu 2 pour mettre à jour le paramètre nom de l'application affiché - pas besoin de noms d'instance ou de ports différents.

## Fonctionnalités IA

Poznote inclut des fonctionnalités IA puissantes propulsées par OpenAI pour améliorer votre expérience de prise de notes. Ces fonctionnalités sont optionnelles et nécessitent une clé API OpenAI.

### Fonctionnalités IA disponibles

- **🤖 Résumé IA** - Génère des résumés intelligents de vos notes pour comprendre rapidement les points clés
- **🏷️ Génération automatique de tags** - Génère automatiquement des tags pertinents selon le contenu de la note
- **🔍 Vérification du contenu** - Vérifie la cohérence, la logique et la grammaire de vos notes

### Configuration des fonctionnalités IA

1. **Obtenez une clé API OpenAI**
	 - Rendez-vous sur [OpenAI Platform](https://platform.openai.com/api-keys)
	 - Créez un compte ou connectez-vous
	 - Générez une nouvelle clé API

2. **Configurez Poznote**
	 - Allez dans **Paramètres → Paramètres IA** dans l'interface Poznote
	 - Activez les fonctionnalités IA
	 - Entrez votre clé API OpenAI
	 - Sauvegardez la configuration

3. **Utilisez les fonctionnalités IA**
	 - Ouvrez une note et cherchez les boutons IA dans la barre d'outils
	 - Utilisez **Résumé IA** pour générer un résumé
	 - Utilisez **Tags auto** pour suggérer des tags
	 - Utilisez **Correction** pour corriger grammaire et style

### Prérequis

- ✅ Connexion internet active
- ✅ Clé API OpenAI valide
- ✅ Crédits OpenAI suffisants

### Confidentialité & Données

Lorsque les fonctionnalités IA sont activées :
- Le contenu des notes est envoyé aux serveurs d'OpenAI pour traitement
- Les données sont traitées selon la [politique de confidentialité d'OpenAI](https://openai.com/privacy/)
- Vous pouvez désactiver l'IA à tout moment dans les paramètres

## Modifier les paramètres

Pour changer votre nom d'utilisateur, mot de passe, port ou nom d'application :

**Linux/macOS :**
```bash
./setup.sh
```

**Windows :**
```powershell
.\setup.ps1
```

Sélectionnez l'option 2 (Modifier les paramètres) dans le menu. Le script préserve toutes vos données.

## Réinitialiser le mot de passe

Si vous avez oublié votre mot de passe, lancez le script de configuration et choisissez "Modifier les paramètres".

## Mettre à jour l'application

Vous pouvez vérifier si votre application est à jour directement depuis l'interface Poznote via **Paramètres → Vérifier les mises à jour**.

Pour mettre à jour Poznote vers la dernière version, lancez le script de configuration et choisissez "Mettre à jour l'application". Le script mettra à jour tout en préservant votre configuration et vos données.

## Sauvegarde et restauration

Poznote inclut une fonctionnalité de sauvegarde accessible via Paramètres → "Exporter/Importer la base de données".

### Options de sauvegarde

- **📝 Exporter les notes** - ZIP complet avec toutes vos notes (permet la consultation hors-ligne sans Poznote)
- **📎 Exporter les pièces jointes** - Toutes les pièces jointes en ZIP
- **🗄️ Exporter la base de données** - Dump SQLite

### Options de restauration

- **Restauration complète** - Nécessite notes + pièces jointes + base pour un fonctionnement complet
- **Vue hors-ligne** - Les notes exportées fonctionnent indépendamment avec `index.html` inclus

⚠️ **Important :** L'import de base de données remplace complètement les données actuelles. La base contient les métadonnées (titres, tags, dates) tandis que le contenu des notes est stocké dans des fichiers HTML.

### Sauvegarde automatique de la base

🔒 **Sécurité :** À chaque import/restauration via l'interface web, Poznote crée automatiquement une sauvegarde de la base avant de procéder.

- **Emplacement :** `data/database/poznote.db.backup.YYYY-MM-DD_HH-MM-SS`
- **Format :** Fichiers de sauvegarde horodatés (ex : `poznote.db.backup.2025-08-15_14-36-19`)
- **But :** Permet de revenir en arrière si besoin

## Vue hors-ligne

Quand vous exportez vos notes via **📝 Exporter les notes**, vous obtenez un ZIP contenant toutes vos notes en HTML ainsi qu'un fichier spécial `index.html`. Cela crée une version hors-ligne autonome de vos notes qui fonctionne sans Poznote installé.

**Fonctionnalités de la vue hors-ligne :**
- **Recherche par titre et tags** - Trouvez rapidement vos notes via la recherche du navigateur
- **Aucune installation requise** - Fonctionne dans tout navigateur
- **Portable** - Partagez ou archivez facilement vos notes

Il suffit d'extraire le ZIP et d'ouvrir `index.html` dans un navigateur pour accéder à vos notes hors-ligne.

## Documentation API

Poznote propose une API REST pour accéder aux notes et dossiers de façon programmatique.

### Authentification

Toutes les requêtes API nécessitent une authentification HTTP Basic :
```bash
curl -u 'utilisateur:motdepasse' http://localhost:8040/NOM_ENDPOINT_API.php
```

### URL de base

Accédez à l'API sur votre instance Poznote :
```
http://VOTRE_SERVEUR:PORT_HTTP_WEB/
```

### Format de réponse

**Codes HTTP :**
- `200` - Succès (mises à jour, suppressions)
- `201` - Créé
- `400` - Requête invalide
- `401` - Non autorisé
- `404` - Introuvable
- `409` - Conflit (doublon)
- `500` - Erreur serveur

**Réponse succès :**
```json
{
	"success": true,
	"message": "Opération terminée",
	"data": { /* données de réponse */ }
}
```

**Réponse erreur :**
```json
{
	"error": "Description de l'erreur",
	"details": "Détails supplémentaires (optionnel)"
}
```

### Endpoints

#### Lister les notes
```bash
curl -u 'utilisateur:motdepasse' http://localhost:8040/api_list_notes.php
```

#### Créer une note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{
		"heading": "Ma nouvelle note",
		"tags": "perso,important",
		"folder_name": "Projets"
	}'
```
**Paramètres obligatoires :**
- `heading` (string) - Titre de la note
**Paramètres optionnels :**
- `tags` (string) - Tags séparés par des virgules
- `folder_name` (string) - Nom du dossier (par défaut "Non classé")

#### Créer un dossier
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{"folder_name": "Projets Travail"}'
```
**Paramètre obligatoire :**
- `folder_name` (string) - Nom du dossier

#### Déplacer une note
```bash
curl -X POST http://localhost:8040/api_move_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{
		"note_id": "123",
		"folder_name": "Projets Travail"
	}'
```
**Paramètres obligatoires :**
- `note_id` (string) - ID de la note à déplacer
- `folder_name` (string) - Dossier cible

#### Supprimer une note
```bash
# Suppression douce (corbeille)
curl -X DELETE http://localhost:8040/api_delete_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{"note_id": "123"}'

# Suppression définitive
curl -X DELETE http://localhost:8040/api_delete_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{
		"note_id": "123",
		"permanent": true
	}'
```

#### Supprimer un dossier
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{"folder_name": "Projets Travail"}'
```

**Note :** Le dossier `Non classé` ne peut pas être supprimé. Quand un dossier est supprimé, toutes ses notes sont déplacées dans `Non classé`.

## Opérations manuelles

Pour les utilisateurs avancés qui préfèrent la configuration directe :

**Modifier les paramètres :**

1. Arrêtez Poznote : `docker compose down`
2. Modifiez le fichier `.env`
3. Redémarrez Poznote : `docker compose up -d`

**Mettre à jour Poznote :**

```bash
git pull origin main && docker compose down && docker compose up -d --build
```

**Sauvegarde :**

Copiez le dossier `./data/` (contient les notes, pièces jointes, base)

**Restauration :**

Remplacez le dossier `./data/` et redémarrez le conteneur

**Réinitialisation du mot de passe :**

1. Arrêtez Poznote : `docker compose down`
2. Modifiez `.env` : `POZNOTE_PASSWORD=nouveau_mot_de_passe`
3. Redémarrez Poznote : `docker compose up -d`
