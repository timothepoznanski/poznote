

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
- 🗂️ Workspaces
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
- [Espaces de travail](#espaces-de-travail)
- [Modifier les paramètres](#modifier-les-paramètres)
- [Réinitialiser le mot de passe](#réinitialiser-le-mot-de-passe)
- [Mettre à jour l'application](#mettre-à-jour-lapplication)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Vue hors-ligne](#vue-hors-ligne)
- [Fonctionnalités IA](#fonctionnalités-ia)
- [Documentation API](#documentation-api)
- [Opérations manuelles](#opérations-manuelles)

## Installation

Poznote fonctionne dans un conteneur Docker, ce qui le rend très facile à déployer partout. Vous pouvez :

- **Lancer localement** sur votre ordinateur avec Docker Desktop (Windows) ou Docker Engine (Linux)
- **Déployer sur un serveur** pour accéder à vos notes de partout - téléphone, tablette ou tout navigateur web

### Prérequis

**🐳 Qu'est-ce que Docker ?**
Docker est une plateforme qui permet d'empaqueter et d'exécuter des applications dans des conteneurs isolés. Poznote utilise Docker pour simplifier l'installation et garantir que l'application fonctionne de la même manière sur tous les systèmes.

#### Prérequis Windows

1. **PowerShell 7** (**OBLIGATOIRE**) :
   - ⚠️ **L'installation ne fonctionne PAS avec PowerShell 5** (version par défaut de Windows)
   - Téléchargez et installez [PowerShell 7](https://github.com/PowerShell/PowerShell/releases/latest)
   - Après installation, lancez **PowerShell 7** (pas Windows PowerShell)
   - Pour vérifier la version : `$PSVersionTable.PSVersion` (doit afficher 7.x.x)
   
2. **Docker Desktop** :
   - Téléchargez et installez [Docker Desktop pour Windows](https://www.docker.com/products/docker-desktop/)
   - Suivez l'assistant d'installation (redémarrage requis)
   - Lancez Docker Desktop depuis le menu Démarrer
   - Attendez que Docker soit démarré (icône Docker dans la barre des tâches)

#### Prérequis Linux

1. **Docker Engine** : Installez Docker selon votre distribution :
   - **Ubuntu/Debian :** `curl -fsSL https://get.docker.com | sh`
   - **CentOS/RHEL :** Suivez le [guide officiel](https://docs.docker.com/engine/install/centos/)
   - **Arch Linux :** `sudo pacman -S docker docker-compose`

2. **Configuration Docker** :
   ```bash
   # Démarrer Docker
   sudo systemctl start docker && sudo systemctl enable docker
   
   # Ajouter votre utilisateur au groupe docker
   sudo usermod -aG docker $USER
   
   # Redémarrer la session (ou redémarrer)
   newgrp docker
   
   # Tester l'installation
   docker --version && docker compose version
   ```

### Démarrage rapide (installation Poznote)

**Windows (PowerShell 7) :**
⚠️ **Important** : Utilisez PowerShell 7, pas Windows PowerShell 5
```powershell
function Test-DockerConflict($name) { return (docker ps -a --format "{{.Names}}" | Select-String "^${name}-webserver-1$").Count -eq 0 }; do { $instanceName = Read-Host "
Choose an instance name (poznote-work, poznote_app, mynotes, etc.) [poznote]"; if ([string]::IsNullOrWhiteSpace($instanceName)) { $instanceName = "poznote" }; if (-not ($instanceName -cmatch "^[a-z0-9_-]+$")) { Write-Host "⚠️  Name must contain only lowercase letters, numbers, underscores, and hyphens, without spaces." -ForegroundColor Yellow; continue }; if (-not (Test-DockerConflict $instanceName)) { Write-Host "⚠️  Docker container '${instanceName}-webserver-1' already exists!" -ForegroundColor Yellow; continue }; if (Test-Path $instanceName) { Write-Host "⚠️  Folder '$instanceName' already exists!" -ForegroundColor Yellow; continue }; break } while ($true); git clone https://github.com/timothepoznanski/poznote.git $instanceName; cd $instanceName; .\setup.ps1
```

**Linux (bash) :**
```bash
check_conflicts() { local name="$1"; if docker ps -a --format "{{.Names}}" | grep -q "^${name}-webserver-1$"; then echo "⚠️  Docker container '${name}-webserver-1' already exists!"; return 1; fi; return 0; }; while true; do read -p "
Choose an instance name (poznote-work, poznote_app, mynotes, etc.) [poznote]: " instanceName; instanceName=${instanceName:-poznote}; if [[ "$instanceName" =~ ^[a-z0-9_-]+$ ]] && check_conflicts "$instanceName" && [ ! -d "$instanceName" ]; then break; else if [[ ! "$instanceName" =~ ^[a-z0-9_-]+$ ]]; then echo "⚠️  Name must contain only lowercase letters, numbers, underscores, and hyphens, without spaces."; elif [ -d "$instanceName" ]; then echo "⚠️  Folder '$instanceName' already exists!"; fi; fi; done; git clone https://github.com/timothepoznanski/poznote.git "$instanceName"; cd "$instanceName"; chmod +x setup.sh; ./setup.sh
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

### Exemple : Instances Tom et Alice sur le même serveur

```
Serveur : mon-serveur.com
├── Poznote-Tom
│   ├── Port : 8040
│   ├── URL : http://mon-serveur.com:8040
│   ├── Conteneur : poznote-tom-webserver-1
│   └── Données : ./poznote-tom/data/
│
└── Poznote-Alice
    ├── Port : 8041
    ├── URL : http://mon-serveur.com:8041
    ├── Conteneur : poznote-alice-webserver-1
    └── Données : ./poznote-alice/data/
```

Pour des déploiements sur des serveurs différents, il suffit de lancer le script de configuration pour mettre à jour la configuration (pas besoin de noms d'instance ou de ports différents).

## Espaces de travail

Les espaces de travail permettent d'organiser vos notes en environnements séparés et isolés au sein d'une même instance Poznote. Pensez aux espaces de travail comme différents "contextes" ou "projets" où vous pouvez regrouper des notes liées.

### Qu'est-ce que les espaces de travail ?

- **🔀 Environnements séparés** - Chaque espace de travail contient ses propres notes, tags et dossiers
- **⚡ Basculement facile** - Utilisez le sélecteur d'espace de travail pour changer d'environnement instantanément
- **🏷️ Organisation indépendante** - Les tags et dossiers sont uniques à chaque espace de travail

### Cas d'usage courants

- **📝 Personnel vs Travail** - Séparez les notes personnelles du contenu professionnel
- **🎓 Projets** - Organisez par client, cours ou sujet de recherche
- **🗂️ Archivage** - Maintenez séparées les notes actives et archivées

### Gestion des espaces de travail

**Accès :** Allez dans **Paramètres → Gérer les espaces de travail**

**Opérations de base :**
- **Créer :** Saisissez un nom et cliquez sur "Créer"
- **Changer :** Utilisez le sélecteur d'espace de travail en haut de l'interface
- **Renommer/Déplacer/Supprimer :** Utilisez les boutons dans la gestion des espaces de travail

⚠️ **Note :** L'espace de travail par défaut "Poznote" ne peut pas être supprimé et contient toutes les notes préexistantes.

### Comment changer d'espace de travail

Pour basculer entre les espaces de travail :
1. **Cliquez sur le nom de l'espace de travail** affiché en haut de l'interface
2. **Sélectionnez votre espace de travail cible** dans le menu déroulant qui apparaît
3. L'interface se recharge automatiquement et affiche les notes de l'espace de travail sélectionné

💡 **Astuce :** Le nom de l'espace de travail actuel est toujours visible en haut de la page, ce qui facilite la reconnaissance de l'environnement dans lequel vous travaillez.

## Modifier les paramètres

Pour changer votre nom d'utilisateur, mot de passe, port ou nom d'application :

**Linux :**
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

## Fonctionnalités IA

Poznote inclut des fonctionnalités IA puissantes propulsées par **OpenAI** ou **Mistral AI** pour améliorer votre expérience de prise de notes. Ces fonctionnalités sont optionnelles et nécessitent une clé API du fournisseur choisi.

### Fournisseurs IA supportés

- **🤖 OpenAI** - GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo (Recommandé pour la qualité)
- **🚀 Mistral AI** - Mistral Large, Medium, Small, Open Mistral (Alternative européenne)

### Fonctionnalités IA disponibles

- **🤖 Résumé IA** - Génère des résumés intelligents de vos notes pour comprendre rapidement les points clés
- **🏷️ Génération automatique de tags** - Génère automatiquement des tags pertinents selon le contenu de la note
- **🔍 Vérification du contenu** - Vérifie la cohérence, la logique et la grammaire de vos notes

### Configuration des fonctionnalités IA

1. **Choisissez votre fournisseur IA**
   - **OpenAI**: Rendez-vous sur [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Mistral AI**: Rendez-vous sur [Mistral Console](https://console.mistral.ai/)
   - Créez un compte ou connectez-vous
   - Générez une nouvelle clé API

2. **Configurez Poznote**
   - Allez dans **Paramètres → Paramètres IA** dans l'interface Poznote
   - Activez les fonctionnalités IA
   - Sélectionnez votre fournisseur IA préféré
   - Entrez votre clé API
   - Choisissez le modèle désiré
   - Testez la connexion avec le bouton "Test Connection"
   - Sauvegardez la configuration

3. **Utilisez les fonctionnalités IA**
   - Ouvrez une note et cherchez les boutons IA dans la barre d'outils
   - Utilisez **Résumé IA** pour générer un résumé
   - Utilisez **Tags auto** pour suggérer des tags
   - Utilisez **Correction** pour corriger grammaire et style

### Prérequis

- ✅ Connexion internet active
- ✅ Clé API valide (OpenAI ou Mistral AI)
- ✅ Crédits OpenAI suffisants

### Confidentialité & Données

Lorsque les fonctionnalités IA sont activées :
- Le contenu des notes est envoyé aux serveurs du fournisseur IA choisi pour traitement
- **OpenAI**: Les données sont traitées selon la [politique de confidentialité d'OpenAI](https://openai.com/privacy/)
- **Mistral AI**: Les données sont traitées selon les [conditions de service de Mistral AI](https://mistral.ai/terms/)
- Vous pouvez désactiver l'IA à tout moment dans les paramètres

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

### Endpoints

#### Lister les notes
```bash
curl -u 'utilisateur:motdepasse' http://localhost:8040/api_list_notes.php?workspace=MonEspaceDeTravail
```

Vous pouvez passer l'espace de travail comme paramètre de requête (`?workspace=NOM`) ou comme données POST (`workspace=NOM`). Si omis, l'API retournera les notes de tous les espaces de travail.

**Paramètres optionnels :**
- `workspace` (string) - Filtrer les notes par nom d'espace de travail

---

#### Créer une note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{
		"heading": "Ma nouvelle note",
		"tags": "perso,important",
		"folder_name": "Projets",
		"workspace": "MonEspaceDeTravail"
	}'
```

**Paramètres :**
- `heading` (string) - **Obligatoire** - Titre de la note
- `tags` (string) - *Optionnel* - Tags séparés par des virgules
- `folder_name` (string) - *Optionnel* - Nom du dossier (par défaut "Default")
- `workspace` (string) - *Optionnel* - Nom de l'espace de travail (par défaut "Poznote")

---

#### Créer un dossier
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{"folder_name": "Projets Travail", "workspace": "MonEspaceDeTravail"}'
```

**Paramètres :**
- `folder_name` (string) - **Obligatoire** - Nom du dossier
- `workspace` (string) - *Optionnel* - Nom de l'espace de travail pour scoper le dossier (par défaut "Poznote")

---

#### Déplacer une note
```bash
curl -X POST http://localhost:8040/api_move_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{
		"note_id": "123",
		"folder_name": "Projets Travail",
		"workspace": "MonEspaceDeTravail"
	}'
```

**Paramètres :**
- `note_id` (string) - **Obligatoire** - ID de la note à déplacer
- `folder_name` (string) - **Obligatoire** - Dossier cible
- `workspace` (string) - *Optionnel* - Si fourni, déplace la note vers l'espace de travail spécifié (gère les conflits de titre)

---

#### Supprimer une note
```bash
# Suppression douce (corbeille)
curl -X DELETE http://localhost:8040/api_delete_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{"note_id": "123", "workspace": "MonEspaceDeTravail"}'

# Suppression définitive
curl -X DELETE http://localhost:8040/api_delete_note.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{
		"note_id": "123",
		"permanent": true,
		"workspace": "MonEspaceDeTravail"
	}'
```

**Paramètres :**
- `note_id` (string) - **Obligatoire** - ID de la note à supprimer
- `permanent` (boolean) - *Optionnel* - Suppression définitive si true, sinon déplace vers la corbeille
- `workspace` (string) - *Optionnel* - Espace de travail pour scoper l'opération

---

#### Supprimer un dossier
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
	-u 'utilisateur:motdepasse' \
	-H "Content-Type: application/json" \
	-d '{"folder_name": "Projets Travail", "workspace": "MonEspaceDeTravail"}'
```

**Paramètres :**
- `folder_name` (string) - **Obligatoire** - Nom du dossier à supprimer
- `workspace` (string) - *Optionnel* - Espace de travail pour scoper l'opération (par défaut "Poznote")

**Note :** Le dossier `Default` ne peut pas être supprimé. Quand un dossier est supprimé, toutes ses notes sont déplacées dans `Default`.

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
