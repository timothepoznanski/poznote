
<div align="center" style="border:2px solid #0078d7; border-radius:8px; padding:20px; background:#f0f8ff; margin-bottom:20px;">
<h3 style="margin:0; display:flex; justify-content:center; align-items:center;">
<a href="README.md" style="text-decoration:none; display:flex; align-items:center;">
  <span>Cliquez ici pour lire cette documentation en anglais</span>
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
- 🗂️ Espaces de travail
- 🏠 Auto-hébergement avec authentification sécurisée
- 💾 Outils de sauvegarde et d'export intégrés
- 🗑️ Corbeille avec restauration
- 🌐 API REST pour l'automatisation

<video width="320" height="240" controls>
  <source src="poznote.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

## Table des matières

- [Installation](#installation)
- [Accéder à votre instance](#accéder-à-votre-instance)
- [Espaces de travail](#espaces-de-travail)
- [Instances multiples](#instances-multiples)
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

---

### 🪟 Prérequis Windows

1. **PowerShell 7** : [Télécharger PowerShell 7](https://github.com/PowerShell/PowerShell/releases/latest)
2. **Docker Desktop** : [Télécharger Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

### 🐧 Prérequis Linux

1. **Docker Engine** : Installez Docker selon votre distribution ([guide officiel](https://docs.docker.com/engine/install/))
2. **Docker Compose** : Installez Docker Compose ([guide officiel](https://docs.docker.com/compose/install/))

---

## 🚀 Démarrage rapide (installation Poznote)

**Une fois Docker installé, copiez et collez la commande selon votre système :**

### 🪟 Installation Windows (PowerShell 7)

#### Étape 1 : Choisissez votre nom d'instance
```powershell
# Exécutez ce script interactif pour choisir votre nom d'instance
# Il validera le nom et vérifiera les conflits Docker

function Test-DockerConflict($name) {
    return (docker ps -a --format "{{.Names}}" | Select-String "^${name}-webserver-1$").Count -eq 0
}

do {
    $instanceName = Read-Host "Choisissez un nom d'instance (poznote-tom, poznote-alice, mes-notes, etc.) [poznote]"
    if ([string]::IsNullOrWhiteSpace($instanceName)) { $instanceName = "poznote" }
    if (-not ($instanceName -cmatch "^[a-z0-9_-]+$")) {
        Write-Host "Le nom doit contenir uniquement des lettres minuscules, des chiffres, des underscores et des tirets, sans espaces." -ForegroundColor Yellow
        continue
    }
    if (-not (Test-DockerConflict $instanceName)) {
        Write-Host "Le conteneur Docker '${instanceName}-webserver-1' existe déjà !" -ForegroundColor Yellow
        continue
    }
    if (Test-Path $instanceName) {
        Write-Host "Le dossier '$instanceName' existe déjà !" -ForegroundColor Yellow
        continue
    }
    break
} while ($true)

$INSTANCE_NAME = $instanceName
Write-Host "Utilisation du nom d'instance : $INSTANCE_NAME"
```

#### Étape 2 : Clonez le dépôt et naviguez vers le répertoire
```powershell
# Clonez le dépôt avec votre nom d'instance choisi
git clone https://github.com/timothepoznanski/poznote.git $INSTANCE_NAME

# Naviguez vers le répertoire cloné
cd $INSTANCE_NAME
```

#### Étape 3 : Exécutez le script de configuration
```powershell
# Lancez le script de configuration interactif
.\setup.ps1
```

### 🐧 Installation Linux (Bash)

#### Étape 1 : Choisissez votre nom d'instance
```bash
# Exécutez ce script interactif pour choisir votre nom d'instance
# Il validera le nom et vérifiera les conflits Docker

check_conflicts() {
    local name="$1"
    if docker ps -a --format "{{.Names}}" | grep -q "^${name}-webserver-1$"; then
        echo "Le conteneur Docker '${name}-webserver-1' existe déjà !"
        return 1
    fi
    return 0
}

while true; do
    read -p "Choisissez un nom d'instance (poznote-tom, poznote-alice, mes-notes, etc.) [poznote] : " instanceName
    instanceName=${instanceName:-poznote}
    if [[ "$instanceName" =~ ^[a-z0-9_-]+$ ]] && check_conflicts "$instanceName" && [ ! -d "$instanceName" ]; then
        INSTANCE_NAME="$instanceName"
        break
    else
        if [[ ! "$instanceName" =~ ^[a-z0-9_-]+$ ]]; then
            echo "Le nom doit contenir uniquement des lettres minuscules, des chiffres, des underscores et des tirets, sans espaces."
        elif [ -d "$instanceName" ]; then
            echo "Le dossier '$instanceName' existe déjà !"
        fi
    fi
done

echo "Utilisation du nom d'instance : $INSTANCE_NAME"
```

#### Étape 2 : Clonez le dépôt et naviguez vers le répertoire
```bash
# Clonez le dépôt avec votre nom d'instance choisi
git clone https://github.com/timothepoznanski/poznote.git "$INSTANCE_NAME"

# Naviguez vers le répertoire cloné
cd "$INSTANCE_NAME"
```

#### Étape 3 : Exécutez le script de configuration
```bash
# Lancez le script de configuration interactif
bash setup.sh
```

---

## Accéder à votre instance

Après installation, accédez à Poznote à l'adresse : `http://VOTRE_SERVEUR:VOTRE_PORT`

où VOTRE_SERVEUR dépend de votre environnement :

- localhost
- L'adresse IP de votre serveur
- Votre nom de domaine

Le script de configuration affichera l'URL exacte et les identifiants.

## Espaces de travail

Les espaces de travail permettent d'organiser vos notes en environnements séparés au sein d'une même instance Poznote - comme avoir différents carnets pour le travail, la vie personnelle ou les projets.

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

## Modifier les paramètres

Pour changer votre nom d'utilisateur, mot de passe ou port :

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

Poznote inclut une fonctionnalité de sauvegarde (export) et restoration (import) intégrée accessible via Paramètres.

**📦 Sauvegarde complète** 

ZIP unique contenant la base de données, toutes les notes et pièces jointes pour tous les espaces de travail :

  - Inclut un `index.html` à la racine pour la navigation hors-ligne
  - Les notes sont organisées par espace de travail et dossier
  - Les pièces jointes sont accessibles via des liens cliquables

**🔄 Restauration complète**

Téléchargez le ZIP de sauvegarde complète pour tout restaurer :

  - Remplace la base de données, restaure toutes les notes et pièces jointes
  - Fonctionne pour tous les espaces de travail en une fois

⚠️ L'import de base de données remplace complètement les données actuelles et pour tous les workspaces. La base contient les métadonnées (titres, tags, dates) tandis que le contenu des notes est stocké dans des fichiers HTML.

🔒 À chaque import/restauration via l'interface web, Poznote crée automatiquement une sauvegarde de la base avant de procéder.

- **Emplacement :** `data/database/poznote.db.backup.AAAA-MM-JJ_HH-MM-SS`
- **Format :** Fichiers de sauvegarde horodatés (ex : `poznote.db.backup.2025-08-15_14-36-19`)
- **But :** Permet de récupérer si l'import échoue ou si les données doivent être restaurées

## Vue hors-ligne

La **📦 Sauvegarde complète** crée une version hors-ligne autonome de vos notes. Il suffit d'extraire le ZIP et d'ouvrir `index.html` dans n'importe quel navigateur web.

## Fonctionnalités IA

Poznote inclut des fonctionnalités IA puissantes propulsées par **OpenAI** ou **Mistral AI** pour améliorer votre expérience de prise de notes. Ces fonctionnalités sont optionnelles et nécessitent une clé API du fournisseur choisi.

### Fournisseurs IA supportés

- **🤖 OpenAI** - GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo (Recommandé pour la qualité)
- **🚀 Mistral AI** - Mistral Large, Medium, Small, Open Mistral (Alternative européenne)

### Fonctionnalités IA disponibles

- **🤖 Résumé IA** - Génère des résumés intelligents de vos notes pour une compréhension rapide
- **🏷️ Tags automatiques** - Génère automatiquement des tags pertinents basés sur le contenu de la note
- **🔍 Vérifier les erreurs** - Vérifie la cohérence, la logique et la grammaire dans vos notes

### Configuration des fonctionnalités IA

1. **Choisissez votre fournisseur IA**
   - **OpenAI** : Rendez-vous sur [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Mistral AI** : Rendez-vous sur [Mistral Console](https://console.mistral.ai/)
   - Créez un compte ou connectez-vous
   - Générez une nouvelle clé API

2. **Configurez Poznote**
   - Allez dans **Paramètres → Paramètres IA** dans l'interface Poznote
   - Activez les fonctionnalités IA en cochant la case
   - Sélectionnez votre fournisseur IA préféré
   - Entrez votre clé API
   - Choisissez le modèle désiré
   - Testez la connexion avec le bouton "Tester la connexion"
   - Sauvegardez la configuration

3. **Commencez à utiliser les fonctionnalités IA**
   - Ouvrez une note et cherchez les boutons IA dans la barre d'outils
   - Utilisez **Résumé IA** pour générer des résumés de notes
   - Utilisez **Tags automatiques** pour suggérer des tags pertinents
   - Utilisez **Corriger les erreurs** pour corriger la grammaire et le style

### Prérequis

- ✅ Connexion internet active
- ✅ Clé API valide (OpenAI ou Mistral AI)

### Confidentialité & Données

Quand les fonctionnalités IA sont activées :
- Le contenu des notes est envoyé aux serveurs du fournisseur IA choisi pour traitement
- **OpenAI** : Les données sont traitées selon la [politique de confidentialité d'OpenAI](https://openai.com/privacy/)
- **Mistral AI** : Les données sont traitées selon les [conditions de service de Mistral AI](https://mistral.ai/terms/)
- Vous pouvez désactiver les fonctionnalités IA à tout moment dans les paramètres

## Documentation API

Poznote fournit une API REST pour un accès programmatique aux notes et dossiers.

### Authentification

Toutes les requêtes API nécessitent une authentification HTTP Basic :
```bash
curl -u 'nomutilisateur:motdepasse' http://localhost:8040/POINT_TERMINAISON_API.php
```

### URL de base

Accédez à l'API sur votre instance Poznote :
```
http://VOTRE_SERVEUR:PORT_HTTP_WEB/
```

### Format de réponse

**Codes de statut HTTP :**
- `200` - Succès (mises à jour, suppressions)
- `201` - Créé
- `400` - Requête invalide
- `401` - Non autorisé
- `404` - Introuvable
- `409` - Conflit (doublon)
- `500` - Erreur serveur

### Points de terminaison

#### Lister les notes
```bash
curl -u 'nomutilisateur:motdepasse' http://localhost:8040/api_list_notes.php?workspace=MonEspaceDeTravail
```

Vous pouvez passer l'espace de travail comme paramètre de requête (`?workspace=NOM`) ou comme données POST (`workspace=NOM`). Si omis, l'API retournera les notes de tous les espaces de travail.

**Paramètres :**
- `workspace` (string) - *Optionnel* - Filtrer les notes par nom d'espace de travail

---

#### Créer une note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u 'nomutilisateur:motdepasse' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "Ma nouvelle note",
    "entry": "<p>Ceci est le <strong>contenu HTML</strong> de la note</p>",
    "entrycontent": "Ceci est le contenu texte brut de la note",
    "tags": "personnel,important",
    "folder_name": "Projets",
    "workspace": "MonEspaceDeTravail"
  }'
```

**Paramètres :**
- `heading` (string) - **Obligatoire** - Le titre de la note
- `entry` (string) - *Optionnel* - Contenu HTML qui sera sauvegardé dans le fichier HTML de la note
- `entrycontent` (string) - *Optionnel* - Contenu texte brut qui sera sauvegardé en base de données
- `tags` (string) - *Optionnel* - Tags séparés par des virgules
- `folder_name` (string) - *Optionnel* - Nom du dossier (par défaut "Default")
- `workspace` (string) - *Optionnel* - Nom de l'espace de travail (par défaut "Poznote")

---

#### Créer un dossier
```bash
curl -X POST http://localhost:8040/api_create_folder.php \
  -u 'nomutilisateur:motdepasse' \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Projets de travail", "workspace": "MonEspaceDeTravail"}'
```

**Paramètres :**
- `folder_name` (string) - **Obligatoire** - Le nom du dossier
- `workspace` (string) - *Optionnel* - Nom de l'espace de travail pour scoper le dossier (par défaut "Poznote")

---

#### Déplacer une note
```bash
curl -X POST http://localhost:8040/api_move_note.php \
  -u 'nomutilisateur:motdepasse' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "folder_name": "Projets de travail",
    "workspace": "MonEspaceDeTravail"
  }'
```

**Paramètres :**
- `note_id` (string) - **Obligatoire** - L'ID de la note à déplacer
- `folder_name` (string) - **Obligatoire** - Le nom du dossier cible
- `workspace` (string) - *Optionnel* - Si fourni, déplace la note vers l'espace de travail spécifié (gère les conflits de titre)

---

#### Supprimer une note
```bash
# Suppression douce (vers la corbeille)
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u 'nomutilisateur:motdepasse' \
  -H "Content-Type: application/json" \
  -d '{"note_id": "123", "workspace": "MonEspaceDeTravail"}'

# Suppression définitive
curl -X DELETE http://localhost:8040/api_delete_note.php \
  -u 'nomutilisateur:motdepasse' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": "123",
    "permanent": true,
    "workspace": "MonEspaceDeTravail"
  }'
```

**Paramètres :**
- `note_id` (string) - **Obligatoire** - L'ID de la note à supprimer
- `permanent` (boolean) - *Optionnel* - Si true, suppression définitive ; sinon déplacement vers la corbeille
- `workspace` (string) - *Optionnel* - Espace de travail pour scoper l'opération

---

#### Supprimer un dossier
```bash
curl -X DELETE http://localhost:8040/api_delete_folder.php \
  -u 'nomutilisateur:motdepasse' \
  -H "Content-Type: application/json" \
  -d '{"folder_name": "Projets de travail", "workspace": "MonEspaceDeTravail"}'
```

**Paramètres :**
- `folder_name` (string) - **Obligatoire** - Le nom du dossier à supprimer
- `workspace` (string) - *Optionnel* - Espace de travail pour scoper l'opération (par défaut "Poznote")

**Note :** Le dossier par défaut ("Default", historiquement "Uncategorized") ne peut pas être supprimé. Quand un dossier est supprimé, toutes ses notes sont déplacées vers le dossier par défaut.

## Opérations manuelles

Pour les utilisateurs avancés qui préfèrent la configuration directe :

**Installer Poznote Linux (Bash) :**

```bash
INSTANCE_NAME="VOTRE-NOM-DINSTANCE"
git clone https://github.com/timothepoznanski/poznote.git "$INSTANCE_NAME"
cd $INSTANCE_NAME
vim Dockerfile # Si nécessaire (par exemple pour ajouter les proxies)
cp .env.template .env
vim .env
mkdir -p data/entries
mkdir -p data/database
mkdir -p data/attachments
docker compose up -d --build
```

**Modifier les paramètres :**

```bash
docker compose down
vim .env
docker compose up -d
```

**Mettre à jour Poznote vers la dernière version :**

```bash
docker compose down
git stash push -m "Keep local modifications"
git pull
git stash pop
docker compose --build # --no-cache
docker compose up -d --force-recreate
```

**Sauvegarde :**

Copiez le répertoire `./data/` (contient les entrées, pièces jointes, base de données)

**Restauration :**

Remplacez le répertoire `./data/` et redémarrez le conteneur

**Réinitialisation du mot de passe :**

```bash
docker compose down
vim .env  # `POZNOTE_PASSWORD=nouveau_mot_de_passe`
docker compose up -d
```