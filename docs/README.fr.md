<!-- lang-selector -->
<p align="center">
  <a href="../README.md">English</a> ·
  <b>Français</b> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->


<p align="center">
  <img src="../images/poznote-logo-text.png" alt="Poznote Logo" width="400">
</p>

<h2 align="center">
Une prise de notes puissante, sans prise de tête.
</h2>

<h3 align="center">
Une alternative gratuite, auto-hébergée et open source à Notion, Obsidian, Evernote ou OneNote.
</h3>

<p align="center">
  <a href="https://github.com/timothepoznanski/poznote/releases"><img src="https://img.shields.io/github/v/release/timothepoznanski/poznote?label=release&color=1f6feb" alt="Latest release"></a>
  <a href="https://github.com/timothepoznanski/poznote/pkgs/container/poznote"><img src="https://img.shields.io/badge/ghcr.io-poznote-2496ed?logo=docker&logoColor=white" alt="Docker image"></a>
  <a href="https://github.com/timothepoznanski/poznote/blob/main/LICENCE"><img src="https://img.shields.io/github/license/timothepoznanski/poznote?color=44cc11" alt="License MIT"></a>
  <a href="https://github.com/timothepoznanski/poznote/stargazers"><img src="https://img.shields.io/github/stars/timothepoznanski/poznote?color=f5b400" alt="GitHub stars"></a>
  <a href="https://github.com/timothepoznanski/poznote/issues?q=is%3Aissue+is%3Aclosed"><img src="https://img.shields.io/github/issues-closed/timothepoznanski/poznote?label=issues%20closed&color=44cc11" alt="Closed issues"></a>
  <a href="https://github.com/timothepoznanski/poznote/discussions"><img src="https://img.shields.io/github/discussions/timothepoznanski/poznote?label=discussions&logo=github&color=8957e5" alt="GitHub Discussions"></a>
  <a href="https://demo.poznote.com"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live demo"></a>
</p>

<p align="center">
  <img src="../images/pres1.png" alt="Poznote-light" width="100%">
</p>

### Fonctionnalités

Découvrez toutes les fonctionnalités [ici](https://poznote.com/#features).

### Captures d'écran

Consultez toutes les captures d'écran [ici](https://poznote.com/screenshots.html).

### Démo

https://demo.poznote.com

**Identifiant** : poznote<br>
**Mot de passe** : poznote

### Ils parlent de Poznote

https://poznote.com/press.html

### Discord

Rejoignez la communauté pour poser vos questions, partager vos retours ou suivre le développement :

https://discord.gg/AWhWWSEkJ

## Table des matières

- [Installation](#installation)
- [Accès](#accès)
- [Modifier les paramètres](#modifier-les-paramètres)
- [Mettre à jour l'application](#mettre-à-jour-lapplication)
- [Authentification](#authentification)
- [Mots de passe d'application](#mots-de-passe-dapplication)
- [Types de notes](#types-de-notes)
- [Snapshots](#snapshots)
- [Personnalisation](#personnalisation)
- [Multi-utilisateurs](#multi-utilisateurs)
- [Journal d'activité](#journal-dactivité)
- [Webhooks](#webhooks)
- [Synchronisation Git](#synchronisation-git)
- [Stockage des pièces jointes sur S3](#stockage-des-pièces-jointes-sur-s3)
- [Sauvegardes S3](#sauvegardes-s3)
- [Sauvegarde / Export](#sauvegarde--export)
- [Restauration / Import](#restauration--import)
- [Consultation hors ligne](#consultation-hors-ligne)
- [Instances multiples](#instances-multiples)
- [Assistant IA](#assistant-ia)
- [Transcription (reconnaissance vocale)](#transcription-reconnaissance-vocale)
- [Serveur MCP](#serveur-mcp)
- [Extension Chrome](#extension-chrome)
- [Partager vers Poznote sur Android](#partager-vers-poznote-sur-android)
- [Documentation de l'API](#documentation-de-lapi)
- [Stack technique](#stack-technique)

## Installation

> L'image officielle est multi-architecture (linux/amd64, linux/arm64) : elle fonctionne sous Windows et macOS via Docker Desktop, ainsi que sur les appareils ARM64 comme les Raspberry Pi, les NAS, etc.

Choisissez ci-dessous votre méthode d'installation :

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Étape 1 : prérequis

Installez et lancez [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Étape 2 : déployer Poznote

Créez un nouveau répertoire :

```powershell
mkdir poznote
```

Placez-vous dans le répertoire Poznote :
```powershell
cd poznote
```

Créez le fichier d'environnement :

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Modifiez le fichier `.env` :

```powershell
notepad .env
```

Téléchargez le fichier de configuration Docker Compose :

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Téléchargez les dernières images Poznote Webserver et Poznote MCP :
```powershell
docker compose pull
```

Démarrez les conteneurs Poznote :
```powershell
docker compose up -d
```

</details>

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### Étape 1 : prérequis

1. Installez [Docker engine](https://docs.docker.com/engine/install/)
2. Installez [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Étape 2 : installer Poznote

Créez un nouveau répertoire :
```bash
mkdir poznote
```

Placez-vous dans le répertoire Poznote :
```bash
cd poznote
```

Créez le fichier d'environnement :
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Modifiez le fichier `.env` :
```bash
vi .env
```

Téléchargez le fichier de configuration Docker Compose :
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Téléchargez les dernières images Poznote Webserver et Poznote MCP :
```bash
docker compose pull
```

Démarrez les conteneurs Poznote :
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Étape 1 : prérequis

Installez et lancez [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### Étape 2 : déployer Poznote

Créez un nouveau répertoire :
```bash
mkdir poznote
```

Placez-vous dans le répertoire Poznote :
```bash
cd poznote
```

Téléchargez le fichier d'environnement :
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Modifiez le fichier `.env` :
```bash
vi .env
```

Téléchargez le fichier de configuration Docker Compose :
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Téléchargez les dernières images Poznote Webserver et Poznote MCP :
```bash
docker compose pull
```

Démarrez les conteneurs Poznote :
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Cloud</strong></summary><br>

Vous ne voulez pas gérer de serveur ? Poznote peut être déployé dans le cloud en quelques minutes.

Consultez les options d'hébergement cloud sur [poznote.com/hosting.html](https://poznote.com/hosting.html).

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

Sur un hôte Proxmox VE, le projet Proxmox VE Community Scripts installe Poznote dans son propre conteneur en une seule commande, sans Docker : il crée un LXC Debian 13 non privilégié (1 vCPU, 512 Mo de RAM et un disque de 4 Go par défaut) et sert Poznote via nginx et PHP à l'intérieur.

Lancez cette commande depuis le shell de l'hôte Proxmox :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

Poznote répond ensuite sur `http://<container-ip>:8040`, avec les mêmes identifiants par défaut que toute autre installation. Pour le mettre à jour plus tard, lancez `update` dans la console du conteneur.

Ce script est écrit et maintenu par la communauté, pas par Poznote. Consultez la [page du script Poznote](https://community-scripts.org/scripts/poznote) pour ses options et ses remarques.

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ Kubernetes avec Helm</strong></summary>

#### Étape 1 : prérequis

Installez [Helm](https://helm.sh/docs/intro/install/) et vérifiez que votre contexte Kubernetes pointe vers le cluster sur lequel vous voulez déployer Poznote.

#### Étape 2 : déployer Poznote

Ajoutez le dépôt de charts HelmForge :

```bash
helm repo add helmforge https://repo.helmforge.dev
```

Mettez à jour votre index local de charts :

```bash
helm repo update
```

Installez Poznote :

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

Le chart Helm de Poznote est maintenu par la communauté HelmForge comme option d'installation native Kubernetes. Consultez la [documentation du chart Poznote HelmForge](https://helmforge.dev/docs/charts/poznote) pour les valeurs, la persistance, l'exposition du service, les sondes, les contextes de sécurité et les autres réglages destinés à la production.

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

Poznote propose aussi une variante d'image rootless qui tourne entièrement sous un utilisateur non privilégié (uid/gid `1000`) au lieu de root, pour les environnements qui interdisent root dans les conteneurs (`PodSecurityStandard` restricted de Kubernetes, Podman rootless, `docker run --user`, etc.). Elle fonctionne exactement comme l'image par défaut ; les seules différences sont qu'elle écoute en interne sur le port `8080` et qu'elle ne peut pas corriger le propriétaire de votre répertoire de données au démarrage.

#### Étape 1 : prérequis

1. Installez [Docker engine](https://docs.docker.com/engine/install/)
2. Installez [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Étape 2 : déployer Poznote

Créez un nouveau répertoire :
```bash
mkdir poznote
```

Placez-vous dans le répertoire Poznote :
```bash
cd poznote
```

Créez le répertoire de données et attribuez-le à l'uid/gid `1000` (**obligatoire** : contrairement à l'image par défaut, le conteneur rootless ne peut pas corriger lui-même ce propriétaire au démarrage) :
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

`sudo` n'est souvent pas nécessaire ici : si votre utilisateur a déjà l'uid `1000`, vous pouvez sauter le `chown`, et avec Podman/Docker rootless il peut s'exécuter sans root, voir [Exécution rootless](TROUBLESHOOTING.fr.md#running-rootless).

Créez le fichier d'environnement :
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Modifiez le fichier `.env` :
```bash
vi .env
```

Téléchargez le fichier de configuration Docker Compose rootless :
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

Téléchargez les dernières images Poznote Webserver rootless et Poznote MCP :
```bash
docker compose -f docker-compose.rootless.yml pull
```

Démarrez les conteneurs Poznote :
```bash
docker compose -f docker-compose.rootless.yml up -d
```

Pour migrer une instance Poznote existante vers la variante rootless, ou pour plus de détails, consultez [Exécution rootless](TROUBLESHOOTING.fr.md#running-rootless) dans le guide de dépannage.

</details>

<br>

> Si vous rencontrez des problèmes lors de l'installation, consultez le [guide de dépannage](TROUBLESHOOTING.fr.md).

## Accès

Une fois l'installation terminée, accédez à Poznote depuis votre navigateur web :

[http://localhost:8040](http://localhost:8040)


- Nom d'utilisateur : `admin_change_me`
- Mot de passe : `admin`
- Port : `8040`

Renommez le compte administrateur par défaut et changez le mot de passe par défaut après la première connexion.

## Modifier les paramètres

La plupart des réglages du quotidien se modifient depuis l'interface de Poznote. Réservez le fichier `.env` aux valeurs de déploiement et d'exécution lues au démarrage des conteneurs.

<details>
<summary><strong>Utilisez le fichier <code>.env</code> pour</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- Des surcharges d'exécution facultatives, comme `POZNOTE_MCP_PORT` et `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN` pour changer le nombre de requêtes PHP simultanées (10 par défaut) sur une instance très sollicitée, voir le [guide de dépannage](TROUBLESHOOTING.fr.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT` pour changer la limite de mémoire PHP par requête, en Mo (512 par défaut), voir le [guide de dépannage](TROUBLESHOOTING.fr.md#a-request-runs-out-of-memory)
- `POZNOTE_SETTINGS_PASSWORD` pour demander un mot de passe supplémentaire avant l'ouverture de la page Paramètres, vide par défaut
- `POZNOTE_MCP_AUTH_TOKEN` pour exiger un jeton bearer des clients MCP, voir [Serveur MCP](#serveur-mcp)

</details>

<details>
<summary><strong>Utilisez l'interface pour</strong></summary>
<br>

- Les réglages d'administration et globaux, comme la configuration du fournisseur OIDC, l'activation de la synchronisation Git, les limites d'import et le téléversement de CSS personnalisé
- Les réglages propres à chaque utilisateur ou profil, comme les mots de passe des comptes locaux, le thème, les tailles de police, le tri des notes, l'arrière-plan des espaces de travail et les éléments d'interface masqués

</details>


### Modifier les paramètres système (`.env`)

Placez-vous dans votre répertoire Poznote :
```bash
cd poznote
```

Arrêtez les conteneurs Poznote en cours d'exécution :
```bash
docker compose down
```

Modifiez votre fichier `.env` avec l'éditeur de texte de votre choix (par exemple `nano .env` ou `notepad .env`).

Enregistrez le fichier et redémarrez les conteneurs pour appliquer les modifications :
```bash
docker compose up -d
```

## Mettre à jour l'application

Placez-vous dans votre répertoire Poznote :
```bash
cd poznote
```

Arrêtez les conteneurs en cours d'exécution avant la mise à jour :
```bash
docker compose down
```

Téléchargez la dernière configuration Docker Compose :
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Téléchargez le dernier `.env.template` :
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Utilisez sdiff pour comparer avec `.env.template` et ajoutez si besoin les nouvelles variables à votre fichier `.env` :
```bash
sdiff .env .env.template
```

Téléchargez les dernières images Poznote Webserver et Poznote MCP :
```bash
docker compose pull
```

Démarrez les conteneurs mis à jour :
```bash
docker compose up -d
```

Vos données sont conservées dans le répertoire `./data` et ne sont pas affectées par la mise à jour.

## Authentification

Poznote prend en charge plusieurs méthodes d'authentification, dont les comptes locaux et les fournisseurs d'identité externes. Les applications et extensions qui dialoguent avec l'API REST utilisent des [mots de passe d'application](#mots-de-passe-dapplication), un identifiant distinct décrit dans la section suivante.

<details>
<summary><strong>Authentification par comptes locaux</strong></summary>
<br>

Poznote authentifie les utilisateurs sur leur profil à l'aide d'un nom d'utilisateur ou d'une adresse e-mail et d'un mot de passe.


#### Compte par défaut

Sur une nouvelle installation, Poznote crée un profil administrateur actif :

- Nom d'utilisateur : `admin_change_me`
- Mot de passe : `admin`

Changez le mot de passe par défaut et renommez le compte après la première connexion.

#### Gestion des mots de passe

Les mots de passe se gèrent depuis l'interface web de Poznote, pas via `.env` :

- Chaque utilisateur peut changer son propre mot de passe depuis **Paramètres > Changer le mot de passe**.
- Les administrateurs peuvent définir un mot de passe personnalisé pour n'importe quel utilisateur, ou le réinitialiser à la valeur par défaut, depuis **Paramètres > Outils d'administration > Gestion des utilisateurs**.
- L'option **Se souvenir de moi** conserve la session pendant 30 jours.
- Changer un mot de passe invalide les cookies « se souvenir de moi » existants de cet utilisateur.

#### Mots de passe par défaut

- Comptes administrateur : `admin`
- Comptes utilisateur standard : `user`

Tant qu'un utilisateur n'a pas changé son mot de passe, la valeur par défaut ci-dessus s'applique. Dès qu'un mot de passe est changé depuis l'interface, un hachage bcrypt sécurisé est enregistré dans la base de données et prend le dessus.

</details>

<a id="oidc"></a>
<details>
<summary><strong>Authentification OIDC / SSO (facultative)</strong></summary>
<br>

Poznote prend en charge OpenID Connect (authorization code + PKCE) pour l'authentification unique (SSO). Les utilisateurs peuvent ainsi se connecter via des fournisseurs d'identité externes comme Auth0, Keycloak, Azure AD ou Google Identity.

#### Fonctionnement

1. Quand OIDC est activé, la page de connexion affiche un bouton `Continue with [Provider Name]`.
2. Les utilisateurs s'authentifient via le flux authorization code d'OIDC, sécurisé par PKCE.
3. L'accès peut être restreint à des groupes autorisés et, si nécessaire, à une ancienne liste d'utilisateurs autorisés.
4. Après l'authentification, Poznote rattache l'identité dans cet ordre : `sub` (`oidc_subject`), puis `preferred_username`, puis `email`.
5. Si la création automatique des utilisateurs est activée et qu'aucun profil ne correspond, Poznote en crée un automatiquement. Un tel profil n'a **aucun mot de passe** : il n'est jamais passé par la remise des identifiants initiaux qu'effectue un administrateur lorsqu'il crée un compte, il ne répond donc pas au mot de passe par défaut. La connexion passe par le fournisseur, ou bien un administrateur définit un mot de passe explicite depuis **Paramètres > Outils d'administration > Gestion des utilisateurs**.
6. Si `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, le formulaire nom d'utilisateur/mot de passe est masqué et la page de connexion passe en SSO uniquement.
7. Quand OIDC est activé, les clients de l'API REST peuvent s'authentifier avec `Authorization: Bearer <OIDC JWT>` ; Poznote vérifie le JWKS du fournisseur, l'émetteur, l'expiration, l'audience et les contrôles d'accès configurés.
8. Les clients incapables de suivre un flux OIDC (extension de navigateur, application mobile, scripts) utilisent à la place un [mot de passe d'application](#mots-de-passe-dapplication), que chaque utilisateur crée depuis ses propres paramètres.

#### Configuration

OIDC se configure depuis l'**interface d'administration** : allez dans **Paramètres > Outils d'administration > OIDC / SSO**.

La plupart des réglages (activation, émetteur, nom du fournisseur, scopes, contrôle d'accès, groupes et utilisateurs autorisés, création automatique des utilisateurs, comportement de l'authentification HTTP Basic, etc.) se gèrent depuis cette page et sont enregistrés dans la base de données.

Pour l'authentification Bearer JWT de l'API REST, renseignez **Audience JWT de l'API** si votre fournisseur émet des jetons d'accès pour une audience d'API dédiée. Si ce champ est vide, Poznote accepte le Client ID OIDC configuré comme audience du JWT.

Les réglages suivants restent dans le fichier `.env` :

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

Utilisez `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` pour masquer le formulaire local nom d'utilisateur/mot de passe et imposer la connexion en SSO uniquement. C'est le seul interrupteur qui bloque l'authentification par mot de passe : il retire le formulaire, rejette côté serveur les POST de mot de passe et masque le réglage « Changer le mot de passe ».

> **Reprendre la main lors d'une panne du fournisseur d'identité.** SSO uniquement veut dire exactement cela : tant que `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, personne ne peut se connecter avec un mot de passe, administrateurs compris, il n'existe donc aucune porte de sortie depuis le navigateur. C'est voulu : un attaquant qui aurait compromis un compte administrateur ne peut pas réactiver la connexion par mot de passe pour s'ouvrir un accès persistant. La récupération nécessite un accès au serveur : définissez `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false` dans `.env`, redémarrez le conteneur et connectez-vous avec un mot de passe local. Avant d'activer le SSO uniquement, assurez-vous qu'au moins un compte administrateur possède un mot de passe explicite (**Paramètres > Outils d'administration > Gestion des utilisateurs**), sinon rebasculer l'option ne servira à rien. Notez qu'un profil administrateur créé automatiquement par OIDC n'a pas de mot de passe tant qu'on ne lui en a pas défini un.

> **Changement incompatible :** les anciens réglages OIDC du fichier `.env` ne sont plus lus, à l'exception de `POZNOTE_OIDC_CLIENT_ID`, `POZNOTE_OIDC_CLIENT_SECRET` et `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`. Après la mise à jour, saisissez de nouveau les autres réglages OIDC depuis la page d'administration.

#### Exemple de contrôle d'accès (groupes + création automatique)

Depuis la page d'administration OIDC, configurez :
- **Claim des groupes :** `groups`
- **Groupes autorisés :** `poznote`
- **Créer automatiquement les profils à la première connexion OIDC :** activé

Si la création automatique est activée, Poznote génère un nom d'utilisateur à partir des claims OIDC (`preferred_username`, `nickname`, partie locale de l'adresse e-mail, `name`, puis `sub`) et enregistre le subject OIDC sur le profil créé.

</details>

## Mots de passe d'application

Les applications ne peuvent pas se connecter via un fournisseur d'identité comme le fait un navigateur. Un **mot de passe d'application** est un identifiant distinct que vous créez pour un client donné (l'extension de navigateur, un téléphone, un script) et que vous pouvez révoquer à tout moment : vous n'avez jamais à communiquer le mot de passe de votre compte.

Créez-en un depuis **Paramètres > Mots de passe d'application** : donnez-lui un nom, éventuellement une date d'expiration, puis copiez le secret généré. Il n'est affiché qu'une seule fois. Ensuite, dans le client, saisissez votre nom d'utilisateur habituel et le mot de passe d'application là où un mot de passe est demandé. Il transite en authentification HTTP Basic ordinaire, donc tous les clients existants fonctionnent tels quels :

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

Un mot de passe d'application n'atteint que l'API REST, et uniquement pour son propre profil : il ne peut ni ouvrir l'interface web, ni appeler un endpoint d'administration, ni changer votre mot de passe ou gérer votre compte, même si le compte est administrateur. Un mot de passe divulgué n'expose donc que les notes d'un seul compte, rien de plus, et il suffit de le révoquer pour refermer la brèche. Sur une instance en SSO uniquement, où les comptes créés par OIDC n'ont aucun mot de passe, c'est le seul identifiant accepté par l'API en authentification Basic.

La liste complète des limites et les endpoints qui permettent de gérer les mots de passe d'application se trouvent dans la [documentation de l'API REST](API-REST.md#authentication).

## Types de notes

Poznote prend en charge deux formats de notes principaux, chacun adapté à une façon de travailler.

<details>
<summary><strong>Notes HTML</strong></summary>
&nbsp;

*   **Éditeur :** édition WYSIWYG (What You See Is What You Get) directe.
*   **Stockage :** enregistrées sous forme de fichiers `.html` dans le répertoire de données de l'utilisateur. Comme il s'agit de HTML standard, elles s'ouvrent directement dans n'importe quel navigateur web.
*   **Fonctionnalités exclusives :**
    *   **Mise en forme riche :** prise en charge native des couleurs de texte, du surlignage et des éléments HTML standard.
    *   **Interface interactive :** manipulation directe des éléments dans l'éditeur.
</details>

<details>
<summary><strong>Notes Markdown</strong></summary>
&nbsp;

*   **Éditeur :** éditeur en syntaxe Markdown avec aperçu en temps réel.
*   **Stockage :** enregistrées sous forme de fichiers `.md` dans le répertoire de données de l'utilisateur.
*   **Fonctionnalités exclusives :**
    *   **Diagrammes Mermaid :** prise en charge native de la génération de diagrammes (organigrammes, diagrammes de séquence, etc.) via des blocs de code ` ```mermaid `.
    *   **Équations mathématiques :** prise en charge solide de LaTeX pour les formules mathématiques, avec la syntaxe `$ inline $` et `$$ block $$`.
    *   **Portabilité :** format Markdown standard, compatible avec n'importe quel éditeur externe ou générateur de site statique.
</details>

<details>
<summary><strong>Listes de tâches</strong></summary>
&nbsp;

*   **Usage :** gérez vos tâches et vos projets avec des checklists interactives.
*   **Fonctionnement :** suivez l'avancement grâce à des cases à cocher que l'on coche directement dans l'éditeur ou dans la liste des notes. Une barre de progression indique l'état d'avancement de chaque liste.
*   **Options des tâches :** chaque tâche peut avoir une date d'échéance avec une heure facultative, un rappel qui se déclenche à l'échéance et un marqueur d'importance, et peut être déplacée vers une autre liste.
*   **Page Tâches :** une page Tâches dédiée, ouverte depuis la barre d'icônes de gauche, rassemble en un seul endroit toutes les tâches de vos listes de tâches et, en option, les cases à cocher présentes dans les notes ordinaires. Elle propose des filtres par statut (à faire, importantes, en retard, avec échéance, terminées), un filtre texte et une vue calendrier des tâches qui ont une date d'échéance.
*   **Collaboration publique :** les listes de tâches peuvent être partagées via une URL publique. Si le droit de modification est accordé, des collaborateurs externes peuvent cocher les éléments de la liste sans avoir besoin d'un compte Poznote.
</details>

<details>
<summary><strong>Raccourcis</strong></summary>
&nbsp;

*   **Fonctionnalité :** créez une référence à une note existante à un autre emplacement.
*   **Cas d'usage :** une note peut ainsi être référencée à deux endroits en même temps. Par exemple, une note peut rester rangée dans un dossier de classement tandis que son raccourci apparaît sur un tableau Kanban pour le suivi en cours.
</details>

<details>
<summary><strong>Modèles</strong></summary>
&nbsp;

*   **Fonctionnalité :** réutilisez du contenu déjà rédigé pour uniformiser votre documentation, qu'il s'agisse d'une note complète ou d'un court extrait.
*   **Mise en place :** placez les notes à réutiliser dans un dossier nommé `Templates` (les sous-dossiers sont acceptés). Un espace de travail nommé `Templates` fonctionne aussi et il est proposé depuis tous les espaces de travail. Le nom est également reconnu dans la langue de l'interface (`Modèles`, `Vorlagen`, `Plantillas`, `Modelos`, `Шаблоны`, `模板`).
*   **Insérer dans une note :** tapez `/template` (ou `/` suivi du titre du modèle) dans une note HTML ou Markdown et choisissez un modèle : son contenu est collé à l'emplacement du curseur, et converti si le modèle et la note ne sont pas du même type.
*   **Nouvelle note à partir d'un modèle :** dupliquez la note modèle, ou dupliquez un dossier `Templates` entier pour démarrer un projet avec une arborescence de dossiers toute prête.
</details>

<details>
<summary><strong>Notes quotidiennes (Journal)</strong></summary>
&nbsp;

*   **Usage :** écrivez une note par jour, façon journal intime, depuis un tableau Journal dédié.
*   **Fonctionnement :** le bouton « Créer la note du jour » crée la note du jour (il devient « Aller à la note du jour » une fois la note créée), avec la date du jour pour titre, et la range automatiquement dans une arborescence de dossiers `Diary/YYYY/MM`.
*   **Vue tableau :** les entrées s'affichent sous forme de cartes regroupées par mois, les plus récentes en premier, avec un filtre pour retrouver rapidement les entrées passées.
*   **Vue en fil continu :** le bouton en forme de parchemin, à côté des réglages d'affichage, passe à une seule colonne de lecture : chaque entrée avec son contenu complet, les plus récentes en premier, chargées au fil du défilement. Le filtre s'y applique aussi. Cliquez sur une entrée, ou sur son crayon, pour la modifier sur place : les changements sont enregistrés au fil de la frappe.
*   **Format :** les nouvelles entrées sont créées en notes HTML ou Markdown, selon le réglage « Format des entrées de journal » dans **Paramètres > Comportement**.
</details>

## Snapshots

Les snapshots conservent les versions précédentes du contenu d'une note pour que vous puissiez revenir à un état antérieur depuis le menu **Snapshots** de la note.

<details>
<summary><strong>Fonctionnement des snapshots</strong></summary>
<br>

*   **Automatiques :** un snapshot est pris la première fois qu'une note est ouverte chaque jour. Les 3 snapshots automatiques les plus récents sont conservés par note ; ce nombre se modifie dans **Paramètres > Comportement > Snapshots**.
*   **Manuels :** « Prendre un snapshot maintenant » ajoute un snapshot à tout moment, tout comme **Ctrl + Alt + S** (Cmd + Alt + S sur Mac) lorsqu'une note est ouverte. Les snapshots manuels sont illimités et ne sont pas comptés dans ce nombre.
*   **Avant une modification par l'IA :** un snapshot est pris automatiquement juste avant que l'[assistant IA](#assistant-ia) ou le [serveur MCP](#serveur-mcp) ne modifie le contenu d'une note : une réécriture qui tourne mal s'annule donc en un clic. Ces snapshots portent la mention « Avant modification par l'IA » ou « Avant modification MCP » dans l'historique, ne sont pas pris lorsque le dernier snapshot contient déjà le même contenu, et les 20 plus récents sont conservés par note, un nombre que vous pouvez modifier dans **Paramètres → Snapshots** (de 1 à 200) si votre instance modifie beaucoup de notes via l'IA ou MCP.
*   **Expiration :** chaque snapshot, automatique ou manuel, est supprimé 30 jours après avoir été pris. Un snapshot peut aussi être supprimé à la main depuis la fenêtre Snapshots.
*   **Pièces jointes et images :** les snapshots ne stockent que le texte de la note. Les pièces jointes ne sont jamais copiées : un fichier référencé par plusieurs snapshots n'existe qu'une fois sur le disque. Un fichier retiré d'une note reste sur le disque, masqué dans la note, tant qu'un snapshot le contient encore, si bien que restaurer ce snapshot le fait revenir. Il est supprimé définitivement dès que le dernier snapshot qui le contient expire ou est supprimé, ou lorsque la note est supprimée définitivement. Conserver davantage de snapshots ne duplique donc jamais de fichiers. Cela garde seulement les fichiers retirés plus longtemps, 30 jours au maximum.

</details>

## Personnalisation

Poznote propose plusieurs options de personnalisation intégrées, directement depuis l'application, sans avoir à modifier de fichier de configuration.

<details>
<summary><strong>Réglages Affichage, Comportement et Markdown</strong></summary>
<br>

Dans **Paramètres > Affichage**, vous pouvez configurer :

- **Police de l'application :** choisissez la police utilisée dans toute l'interface
- **Taille de police :** ajustez la taille du texte des notes, de la barre latérale, des blocs de code et de la page des paramètres
- **Couleurs des notes :** choisissez la palette proposée pour colorer une note
- **Icônes par type de note :** donnez aux listes de tâches et aux notes Markdown leur propre icône dans la liste des notes
- **Taille des icônes (Index) :** redimensionnez les icônes de l'index des notes
- **Ordre de la barre d'icônes :** réorganisez les boutons de la barre d'icônes de gauche et changez leur couleur (un clic droit sur un bouton de la barre ouvre aussi le choix de couleur)
- **Largeur du contenu de la note :** définissez la largeur maximale de la zone d'édition des notes
- **Aperçus des pièces jointes :** affichez les pièces jointes sous forme d'aperçus dans la note
- **Bordure par défaut des images :** encadrez les images insérées sans ajouter de marge intérieure
- **Mettre en avant le dossier courant :** atténuez les notes et dossiers situés en dehors de l'arborescence dans laquelle vous travaillez
- **Titre page de connexion :** changez le titre affiché sur la page de connexion
- **Visibilité des éléments :** masquez les éléments d'interface que vous n'utilisez pas, voir plus bas

Dans **Paramètres > Comportement**, vous pouvez configurer :

- **Tri des notes :** choisissez l'ordre des notes dans la liste
- **Filtre d’ancienneté :** n'affichez que les notes modifiées au cours du nombre de jours choisi
- **Snapshots :** le nombre de snapshots automatiques conservés par note
- **Ordre d'insertion des tâches :** définissez où les nouvelles tâches sont insérées
- **Afficher les notes après les dossiers :** affichez les notes sans dossier sous la liste des dossiers
- **Retour à la ligne des blocs de code :** activez ou désactivez le retour à la ligne automatique dans les blocs de code
- **Format des entrées de journal :** créez les entrées de journal en notes HTML ou Markdown
- La langue de l'interface, le fuseau horaire et le format de date, les pièces jointes et les backlinks en bas de note, la vérification orthographique et les raccourcis clavier

Dans **Paramètres > Markdown**, vous pouvez configurer le mode d'ouverture, la police de l'éditeur, le Markdown encadré et coloré, et les numéros de ligne des blocs de code.

Le thème n'a pas de carte ici : le bouton en bas de la barre d'icônes de gauche fait défiler les thèmes, et un administrateur choisit ceux qu'il propose dans **Paramètres > Outils d'administration > Liste des thèmes**.

</details>

<details>
<summary><strong>Image d'arrière-plan des espaces de travail</strong></summary>
<br>

Vous pouvez définir une image d'arrière-plan par espace de travail : ouvrez la page **Espaces de travail** et utilisez l'action **Arrière-plan** de l'espace de travail pour téléverser une image et régler son opacité, afin que chaque espace de travail ait sa propre identité visuelle.

</details>

<details>
<summary><strong>Visibilité des éléments</strong></summary>
<br>

Poznote vous permet d'alléger l'interface en masquant les éléments que vous n'utilisez pas.

Configurez-la dans **Paramètres > Affichage > Visibilité des éléments**.

- **Contrôle précis :** affichez ou masquez les cartes de l'accueil, les actions de la barre d'outils, les éléments du menu slash, et plus encore. Le badge de date de création des notes (**Afficher la date de création**) et le nombre de notes à côté de chaque dossier (**Afficher le nombre de notes par dossier**) s'activent et se désactivent aussi ici.
- **Par utilisateur :** chaque utilisateur peut avoir sa propre disposition de l'interface.
- **Administrateurs :** la même fenêtre affiche une seconde colonne « Utilisateurs » à côté de la colonne « Moi » de l'administrateur, pour masquer des éléments pour tous les utilisateurs de l'instance (administrateurs exceptés).
- **Recherche :** retrouvez facilement l'élément à masquer grâce au filtre de la fenêtre de configuration.

</details>

<details>
<summary><strong>Surcharges CSS personnalisées</strong></summary>
<br>

Si vous souhaitez ajuster les polices, les espacements ou d'autres détails visuels au-delà des options intégrées, vous pouvez téléverser des feuilles de style supplémentaires, appliquées à chaque page HTML pour tous les utilisateurs.

Configurez-les dans **Paramètres > Outils d'administration > Chemin CSS personnalisé**.

Remarques :

- Cliquez sur **Téléverser un fichier CSS** pour sélectionner un fichier `.css` sur votre ordinateur.
- Chaque fichier téléversé est conservé : vous pouvez donc stocker plusieurs thèmes et passer de l'un à l'autre sans les téléverser à nouveau.
- La fenêtre liste les fichiers stockés : choisissez celui à appliquer à tous les utilisateurs, ou **Aucun CSS personnalisé** pour revenir à l'apparence intégrée, puis cliquez sur **Enregistrer**.
- Téléverser un fichier portant le nom d'un fichier déjà stocké remplace ce thème.
- Les fichiers sont stockés dans `data/css/` (votre volume Docker) : ils survivent donc aux mises à jour de l'image.
- Cliquez sur l'icône de corbeille à côté d'un thème pour supprimer ce fichier de votre volume.
- Poznote ajoute automatiquement un paramètre `v=` pour contourner le cache.
- La feuille de style est injectée vers la fin de `<head>`, elle peut donc surcharger les styles par défaut de l'application.
- Seuls les administrateurs peuvent téléverser, appliquer ou supprimer un fichier CSS personnalisé.

### La liste des thèmes

**Paramètres > Outils d'administration > Liste des thèmes** définit les thèmes que fait défiler le bouton de thème en bas de la barre d'icônes : un thème par clic, dans l'ordre affiché.

- Cochez les thèmes intégrés que vous voulez garder, et laissez de côté ceux que personne n'utilise.
- Cochez un fichier CSS stocké pour le proposer comme un thème à part entière. Il reçoit une icône de palette et le nom du fichier.
- Utilisez les flèches pour définir l'ordre de défilement du bouton.
- Un thème personnalisé se peint par-dessus une base claire ou sombre, ce que le fichier ne peut pas indiquer lui-même : choisissez-la à côté du fichier. C'est la valeur donnée à `data-theme` : une feuille de style écrite pour le mode sombre a donc besoin de **Sombre** ici.
- La liste est un réglage global : tout le monde fait défiler les mêmes thèmes, mais le thème appliqué reste le choix de chaque utilisateur.
- Les utilisateurs qui se trouvent sur un thème que vous retirez de la liste basculent immédiatement sur le premier thème de la liste.
- Choisir un thème personnalisé charge ce fichier pour cet utilisateur uniquement, à la place de la feuille de style appliquée à toute l'instance.
- Supprimer un fichier CSS le retire aussi de la liste.
- S'il n'y a qu'un seul thème dans la liste, il n'y a rien à faire défiler : le bouton ouvre alors cette liste pour un administrateur, et ne fait rien pour les autres utilisateurs.

**Avant d'écrire la moindre ligne de CSS**, vérifiez si un thème intégré ne fait pas déjà ce que vous voulez : le bouton de thème en bas de la barre d'icônes fait défiler Clair, Sombre, Noir, Lavande, Sépia et Terminal.

### Exemples

Les couleurs, espacements, rayons et graisses de police sont des design tokens : la plupart des modifications se résument donc à une courte liste de variables surchargées, sans bataille de sélecteurs. La liste complète se trouve dans `src/public/css/tokens.css`.

**Changer la couleur d'accent**

```css
:root {
    --pz-accent: #d6336c;
    --pz-accent-hover: #a61e4d;
    --pz-accent-rgb: 214, 51, 108;   /* same colour, channels only, used for tints */
}
html[data-theme='dark'] {
    --dm-accent: #f783ac;            /* lighter, because it sits on a dark ground */
}
```

Deux tokens plutôt qu'un, car un *remplissage* et un *libellé* ne peuvent pas avoir la même couleur : `--pz-accent` remplit les boutons, `--dm-accent` est l'accent utilisé comme couleur de texte en mode sombre.

**Recolorer les icônes de la barre d'outils des notes**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

Les icônes sont des masques CSS peints avec `background-color: currentColor` : `color` suffit donc. `!important` est nécessaire ici car quelques-unes de ces icônes ont déjà leur propre couleur (l'étoile quand une note est en favori, l'icône de partage quand elle est publiée, le trombone quand elle a des pièces jointes).

Pour colorer une seule icône, pas besoin de CSS : faites un clic droit dessus dans la barre d'outils de la note ou dans la barre d'icônes, puis choisissez une couleur. Ces couleurs sont enregistrées par utilisateur et laissent intactes les couleurs d'état ci-dessus.

**Réchauffer toute l'interface**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**Écrire un thème complet**

Surchargez les tokens sur `:root` pour le mode clair et sur `:root[data-theme='dark']` pour le mode sombre, et rien d'autre. `src/public/css/README.md` documente chaque token et montre un exemple complet ; les thèmes intégrés Lavande, Sépia et Terminal de `src/public/css/tokens.css` sont exactement cela, écrits de la même façon.

Une chose reste pour l'instant hors de portée d'un thème : quelques icônes qu'une règle de page colore explicitement s'affichent dans le gris générique des icônes en mode sombre.

</details>

## Multi-utilisateurs

> À ne pas confondre avec la fonctionnalité [Instances multiples](#instances-multiples).

Poznote est multi-utilisateur : chaque profil a ses propres notes, espaces de travail, tags, dossiers, pièces jointes et paramètres, et se connecte avec son propre nom d'utilisateur ou adresse e-mail et son mot de passe.

- **Gestion des utilisateurs** : les administrateurs créent, désactivent et gèrent les profils depuis **Paramètres > Outils d'administration > Gestion des utilisateurs**, et peuvent donner à un utilisateur l'accès au compte d'un autre utilisateur sans en transférer la propriété.
- **Partage** : les notes, les dossiers et des espaces de travail entiers peuvent être partagés avec d'autres utilisateurs de l'instance, en lecture seule ou en modification, ou publiquement via des liens dédiés. Quand plusieurs utilisateurs ont accès à la même note, un seul la modifie à la fois et les autres voient qui détient le verrou.
- **Isolation des comptes (mode SaaS)** : les administrateurs peuvent empêcher les utilisateurs non administrateurs de découvrir les autres comptes de l'instance, de partager avec eux ou d'enregistrer des webhooks personnels. Laissez tout décoché pour une instance familiale ou d'équipe.

<details>
<summary><strong>Organisation des données sur le disque</strong></summary>
<br>

Poznote utilise une base de données maîtresse (`data/master.db`) pour les données de coordination partagées, et des bases de données et fichiers séparés par utilisateur pour le contenu réel des notes.

```
data/
├── master.db                    # Profiles, global settings, shared links, account access, edit locks
├── css/                         # Custom CSS files uploaded by an administrator
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/poznote.db  # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   ├── attachments/         # User's attachments
    │   ├── snapshots/           # Earlier versions of the user's notes
    │   ├── backgrounds/         # Workspace background images
    │   └── backups/             # Backup archives prepared for download
    ├── 2/                       # User ID 2
    └── ...
```

</details>

## Journal d'activité

Poznote conserve un historique des opérations sensibles effectuées sur l'instance, pour que les administrateurs puissent voir ce qui s'est passé, quand et par qui : connexions et déconnexions, modifications de comptes et de quotas, création et partage d'espaces de travail, sauvegardes et restaurations, vidage de la corbeille et suppressions définitives, mots de passe d'application. Il est accessible depuis **Paramètres > Outils d'administration > Journal d'activité**, réservé aux administrateurs, et l'icône d'aide en haut de la page liste toutes les opérations enregistrées.

Le journal enregistre qu'une opération a eu lieu, pas les données qu'elle a touchées : le contenu des notes et les mots de passe n'y sont jamais écrits, et l'activité courante, comme écrire une note ou la mettre à la corbeille, est laissée de côté. Les entrées sont conservées 90 jours par défaut (30, 90, 365 jours ou illimité), et le journal peut être vidé depuis la même page.

## Webhooks

Poznote peut prévenir des services externes lorsque quelque chose se produit sur l'instance, en envoyant des webhooks sortants (requêtes HTTP POST avec un payload JSON) vers les endpoints que vous enregistrez, ce qui permet de le brancher sur des outils d'automatisation comme n8n, Zapier ou vos propres scripts. Les administrateurs enregistrent les événements de l'instance (comptes, quotas, inscriptions) dans **Paramètres > Outils d'administration > Webhooks admin**, et chaque utilisateur peut enregistrer des endpoints pour ses propres notes et rappels dans **Paramètres > Webhooks utilisateur**.

Les livraisons sont signées en HMAC-SHA256 lorsque le webhook a un secret, et le contenu des notes n'est jamais envoyé. Chaque événement, les champs du payload, la vérification de signature et les garanties de livraison sont décrits dans la **[documentation des webhooks](WEBHOOKS.fr.md)**.

## Synchronisation Git

Poznote prend en charge la synchronisation automatique et manuelle avec **GitHub**, **GitLab** (gitlab.com ou une instance auto-hébergée) ou **Forgejo**. Chaque utilisateur configure son propre dépôt indépendamment. Il n'existe pas de dépôt global partagé.

La synchronisation Git dialogue avec l'API REST du fournisseur en HTTPS : l'authentification repose donc toujours sur un jeton. Les clés SSH ne sont pas utilisées.

<details>
<summary><strong>Configurer la synchronisation Git</strong></summary>
<br>

**Étape 1 : activer la fonctionnalité (administrateur, dans Paramètres > Outils d'administration)**

Activez **Synchronisation Git** dans la section **Outils d'administration** de la page Paramètres. Cela active la synchronisation Git globalement et rend disponible, depuis **Paramètres**, la carte et la configuration **Synchronisation Git** de chaque utilisateur.

---

**Étape 2 : chaque utilisateur configure son propre dépôt (Paramètres > Synchronisation Git)**

| Champ | Description |
|---|---|
| Fournisseur | `GitHub`, `GitLab` ou `Forgejo` |
| URL de base de l'API | GitHub : remplie automatiquement (lecture seule). GitLab : `https://gitlab.com/api/v4`, ou l'URL de votre instance, par exemple `https://gitlab.example.com/api/v4`. Forgejo : l'URL de votre instance, par exemple `https://forgejo.example.com/api/v1` |
| Jeton d'accès | PAT GitHub (`ghp_...`), jeton GitLab avec le scope `api` (`glpat-...`, jeton d'accès personnel ou de projet) ou jeton Forgejo (Settings > Applications) |
| Dépôt | Format `owner/repo`. GitLab : le chemin complet du projet, sous-groupes compris, par exemple `group/subgroup/project` |
| Branche | Par défaut : `main` |
| Nom de l'auteur / Email de l'auteur | Utilisés pour les métadonnées des commits |

> 🔒 Les jetons d'accès sont chiffrés au repos avec AES-256-GCM. Une clé de chiffrement est générée automatiquement et stockée dans `data/.app_secret`.

---

**Synchronisation automatique**

Lorsque l'utilisateur l'active, Poznote va automatiquement :
- **Récupérer** (pull) à la connexion
- **Envoyer** (push) à chaque création, modification ou suppression de note

L'envoi et la récupération manuels sont aussi disponibles via les boutons **Envoyer** et **Récupérer** de la barre d'icônes de gauche.

---

**Espaces de travail synchronisés**

Par défaut, tous les espaces de travail sont synchronisés. Dans **Paramètres > Synchronisation Git**, chaque utilisateur peut à la place limiter la synchronisation Git à certains espaces de travail :

- Seules les notes et pièces jointes des espaces de travail sélectionnés sont envoyées et récupérées.
- Une récupération ne touche jamais aux notes des autres espaces de travail.
- Un envoi supprime du dépôt les fichiers qui se trouvent en dehors des espaces de travail sélectionnés, pour que le dépôt reflète toujours exactement l'ensemble synchronisé.
- Les boutons Envoyer et Récupérer de la barre latérale, l'envoi automatique et l'invite de récupération n'apparaissent que lorsque vous consultez un espace de travail synchronisé.

</details>

## Stockage des pièces jointes sur S3

Par défaut, les pièces jointes des notes sont stockées sur le disque local. Les administrateurs peuvent à la place les stocker dans un stockage objet compatible S3 (AWS S3, MinIO, Garage, Cloudflare R2, Backblaze B2, ...). Ce réglage s'applique à tous les utilisateurs de l'instance.

<details>
<summary><strong>Configurer le stockage S3</strong></summary>
<br>

Configurez-le dans **Paramètres > Pièces jointes S3** (administrateurs uniquement).

- **Configuration** : URL du endpoint, région, bucket, clé d'accès, clé secrète et adressage path-style, avec un test de connexion intégré.
- **Migration** : déplacez les fichiers de pièces jointes existants entre le disque local et le bucket, dans les deux sens et pour tous les utilisateurs. La migration s'exécute par lots et peut être interrompue puis reprise sans risque.
- **Confidentialité** : les pièces jointes sont stockées sous `attachments/{user id}/` dans le bucket et sont toujours servies à travers Poznote : le bucket peut donc rester privé.
- **Quotas** : un quota de stockage S3 par utilisateur peut être défini, et l'utilisation de S3 apparaît dans les statistiques de stockage de l'administration.
- **Sauvegardes** : les exports zip incluent par défaut les pièces jointes S3 (récupérées à la volée depuis le bucket), qu'ils soient réalisés depuis la fenêtre de sauvegarde, via l'API REST ou par les sauvegardes S3 automatiques. Une option de la fenêtre de sauvegarde permet de les exclure pour obtenir une archive plus légère. Si le bucket ne peut pas être lu pendant la construction d'une archive, l'export échoue avec une erreur au lieu de produire une archive à laquelle il manque des fichiers.

La restauration d'une sauvegarde à laquelle manquent certains des fichiers de pièces jointes qu'elle référence est refusée tant que le stockage S3 est activé, car une restauration complète remplace le contenu du bucket et les fichiers manquants seraient perdus. Deux façons de restaurer une telle sauvegarde :

- **La plus simple** : désactivez l'interrupteur « Stocker les pièces jointes dans S3 » (en conservant les identifiants), restaurez la sauvegarde, puis réactivez l'interrupteur. Une restauration en mode local ne touche jamais au bucket, et les pièces jointes qui y sont encore stockées continuent d'être servies. C'est aussi la bonne méthode sur un nouveau serveur lorsque le bucket est intact, puisque l'export des pièces jointes de l'autre option nécessite une instance qui connaît encore les notes.
- **Reconstruire une archive complète** :
  1. Téléchargez l'**Export des pièces jointes** depuis la fenêtre de sauvegarde : il contient toutes les pièces jointes de votre compte dans un dossier `files/`.
  2. Décompressez la sauvegarde, copiez les fichiers de `files/` dans le dossier `attachments/` de la sauvegarde, puis recompressez-la. Attention lors de la recompression : sélectionnez le contenu de la sauvegarde (`database/`, `entries/`, `attachments/`, ...) et compressez cette sélection, pas le dossier qui la contient. Les dossiers doivent se trouver à la racine du zip, sinon la restauration signale que `database/poznote_backup.sql` est manquant.
  3. Restaurez normalement le zip reconstruit.

> La synchronisation Git ignore les pièces jointes tant que le stockage S3 est activé.

</details>

## Sauvegardes S3

Les administrateurs peuvent envoyer des archives de sauvegarde complètes (un ZIP par utilisateur, identique au téléchargement de la sauvegarde complète) vers un bucket compatible S3, manuellement ou automatiquement selon une planification. Cette configuration est indépendante de celle du stockage des pièces jointes sur S3 : les sauvegardes peuvent donc cibler un autre bucket ou un autre fournisseur.

<details>
<summary><strong>Configurer les sauvegardes S3</strong></summary>
<br>

Configurez-les dans **Paramètres > Sauvegardes S3** (administrateurs uniquement).

- **Interrupteur principal** : un interrupteur en haut de la page active ou désactive toute la fonctionnalité. Lorsqu'il est désactivé, les sauvegardes automatiques s'arrêtent et les sections de sauvegarde et de restauration S3 disparaissent pour tous les utilisateurs (les actions en libre-service sont aussi refusées côté serveur).
- **Configuration** : URL du endpoint, région, bucket, clé d'accès, clé secrète et adressage path-style, avec un test de connexion intégré.
- **Sélection des utilisateurs** : des cases à cocher déterminent les utilisateurs couverts par les sauvegardes. Tout le monde est coché par défaut et, tant que tout le monde est coché, les nouveaux comptes sont inclus automatiquement.
- **Sauvegardes manuelles** : un bouton « Sauvegarder maintenant » envoie une archive fraîche pour chaque utilisateur sélectionné, un utilisateur à la fois, avec la progression de chacun. Il fonctionne dès que la connexion est configurée, même si les sauvegardes automatiques sont désactivées.
- **Sauvegardes automatiques** : une fois activées, un processus en arrière-plan sauvegarde les utilisateurs sélectionnés selon la fréquence choisie (quotidienne, hebdomadaire ou mensuelle). La première exécution a lieu dans les minutes qui suivent l'activation, les suivantes après l'intervalle choisi.
- **Rétention** : seules les N archives les plus récentes sont conservées par utilisateur, les plus anciennes sont supprimées du bucket après chaque sauvegarde (0 conserve tout).
- **Consultation** : la page liste les archives actuellement présentes dans le bucket, avec des actions de téléchargement et de suppression.
- **Restauration** : les archives sont stockées sous `backups/{user id}/` dans le bucket et peuvent être restaurées avec la page standard [Restauration / Import](#restauration--import).
- **Libre-service** : une fois le bucket configuré, chaque utilisateur dispose d'une section « Sauvegardes S3 » sur sa page Sauvegarde / Export pour envoyer une archive fraîche de son propre compte, et télécharger ou supprimer ses archives existantes. Une section « Restauration depuis S3 » sur la page Restauration / Import restaure directement son compte à partir de l'une de ces archives.
- **Isolation des comptes** : deux options (« Sauvegardes S3 sur la page Sauvegarde » et « Restauration S3 sur la page Restauration ») désactivent ces sections en libre-service pour les utilisateurs non administrateurs. Elles sont appliquées côté serveur : les actions bloquées sont refusées même lorsqu'elles sont appelées directement.

Lorsque les pièces jointes sont stockées dans S3 (stockage des pièces jointes sur S3), elles sont incluses par défaut dans les archives, récupérées à la volée depuis le bucket. Une option permet de les exclure des sauvegardes pour obtenir des archives plus légères et des exécutions plus rapides.

</details>

## Sauvegarde / Export

Poznote intègre une fonctionnalité de sauvegarde et d'export accessible depuis les Paramètres.

<a id="complete-backup"></a>
<details>
<summary><strong>Sauvegarde complète au format zip Poznote</strong></summary>
<br>

Un seul ZIP contenant la base de données, toutes les notes et les pièces jointes de tous les espaces de travail :

  - Inclut un `index.html` à la racine pour la consultation hors ligne
  - Les notes sont organisées par espace de travail et par dossier
  - Les pièces jointes sont accessibles via des liens cliquables

L'archive est construite en arrière-plan par un processus dédié, et non pendant la requête qui la lance : un compte volumineux ne peut donc pas se heurter au délai d'expiration d'un navigateur ou d'un reverse proxy. La page suit la progression de la tâche, et le téléchargement démarre tout seul dès que le fichier est prêt. Vous pouvez quitter la page et y revenir, la préparation continue. Une archive préparée reste disponible pendant 24 heures, et un bouton permet de la supprimer immédiatement.

#### Sauvegardes par utilisateur et sauvegardes complètes

Poznote propose des options de sauvegarde flexibles :

**Via l'interface web (Paramètres > Sauvegarde / Export) :**
- **Tous les utilisateurs** peuvent sauvegarder et restaurer leur propre profil
- **Les administrateurs** peuvent choisir le profil utilisateur à sauvegarder ou à restaurer
- Les sauvegardes contiennent la base de données, les notes et les pièces jointes de l'utilisateur

**Via l'API ou un script (administrateurs uniquement) :**
- Sauvegardes automatisées avec le script `backup-poznote.sh`
- Accès programmatique via l'API REST v1
- Nécessite des identifiants administrateur

**Portée des sauvegardes :**

1. **Sauvegardes par utilisateur** : créées depuis les Paramètres ou via l'API. Elles contiennent *uniquement* les données d'un utilisateur donné (sa base de données, ses notes et ses pièces jointes).
2. **Sauvegarde complète du système** : réalisée manuellement en sauvegardant tout le répertoire `/data`. C'est le seul moyen de sauvegarder en une fois la configuration maîtresse et les données de tous les utilisateurs.

```bash
# Sauvegarde complète du système en ligne de commande
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>Exporter des notes individuelles</strong></summary>
<br>

Exportez des notes individuelles avec le bouton **Exporter** de la barre d'outils de la note :

  - **Notes HTML :** export en HTML, ou en un fichier HTML unique avec les images intégrées
  - **Notes Markdown :** export en Markdown, en HTML, ou en un fichier HTML unique avec les images intégrées
  - **Listes de tâches :** les mêmes options, plus un export JSON brut de la liste

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Sauvegardes automatisées avec un script Bash</strong></summary>
<br>

Pour des sauvegardes planifiées via l'API, vous pouvez utiliser le script `backup-poznote.sh` fourni.

**IMPORTANT :** seuls les administrateurs peuvent créer des sauvegardes via l'API.
Utilisez le mot de passe actuel du profil administrateur avec lequel vous vous authentifiez. Sur une nouvelle installation, il s'agit du mot de passe administrateur par défaut (`admin`) tant qu'il n'a pas été changé dans Poznote. Dès qu'un mot de passe personnalisé est défini, c'est lui qui est requis pour les appels API.

**Emplacement du script :** `backup-poznote.sh` dans le dossier `tools` du dépôt Poznote

**Utilisation par un administrateur :**

Les administrateurs peuvent sauvegarder n'importe quel profil utilisateur, **sans connaître les ID des utilisateurs**, le nom d'utilisateur suffit :

```bash
# Sauvegarder votre propre profil
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# Sauvegarder le profil d'un autre utilisateur (Nina)
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**Utilisation :**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**Exemple avec crontab (un administrateur qui sauvegarde Nina) :**

```bash
# À ajouter à la crontab pour des sauvegardes automatiques deux fois par jour
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**Explication des paramètres :**
- `'https://poznote.example.com'` : l'URL de votre instance Poznote
- `'admin'` : nom d'utilisateur administrateur pour l'authentification (doit être un administrateur)
- `'admin_password'` : mot de passe administrateur actuel du profil utilisé pour l'API (`admin` par défaut tant qu'il n'a pas été changé, puis le mot de passe personnalisé)
- `'Nina'` : nom de l'utilisateur à sauvegarder
- `'/root/backups'` : répertoire parent où les sauvegardes seront stockées (crée un dossier `backups-poznote-<username>`)
- `'30'` : nombre de sauvegardes à conserver (les plus anciennes sont supprimées automatiquement)

**Déroulement de la sauvegarde :**

1. Le script s'authentifie avec les identifiants administrateur
2. Il retrouve automatiquement l'ID de l'utilisateur à partir de son nom d'utilisateur
3. Il crée une sauvegarde via l'API
4. Il appelle l'API REST v1 de Poznote (`POST /api/v1/backups` avec l'en-tête `X-User-ID`)
5. Il télécharge le ZIP de sauvegarde localement dans `backups-poznote-<username>/`
6. Il gère automatiquement la rétention (ne conserve que le nombre indiqué de sauvegardes récentes)

**Remarque :** les sauvegardes de chaque utilisateur sont stockées dans des dossiers séparés (`backups-poznote-Nina`, `backups-poznote-Tim`, etc.)

</details>


## Restauration / Import

Poznote propose des options de restauration flexibles, via l'interface web (**Paramètres > Restauration / Import**) ou par programmation via l'API REST pour les administrateurs. Les utilisateurs peuvent restaurer les données de leur propre profil à partir d'une sauvegarde ZIP complète ou importer des fichiers individuels, tandis que les administrateurs peuvent gérer les restaurations pour l'ensemble du système.

<a id="complete-restore"></a>
<details>
<summary><strong>Restauration complète à partir d'une sauvegarde zip Poznote</strong></summary>
<br>

Téléversez le ZIP de sauvegarde complète pour tout restaurer :

  - Remplace la base de données, restaure toutes les notes et les pièces jointes
  - Fonctionne pour tous les espaces de travail en une seule fois

Il n'y a pas de limite de taille en pratique. L'archive est téléversée par tranches (une tranche qui échoue est renvoyée au lieu de faire perdre tout le téléversement), réassemblée sur le serveur, puis extraite et restaurée par un processus en arrière-plan : ni le navigateur ni un reverse proxy placé devant l'instance ne peuvent faire expirer la restauration. Une barre de progression couvre l'ensemble du traitement : téléversement, extraction, base de données, notes, puis pièces jointes. Une fois la restauration terminée, Poznote vous demande quel espace de travail ouvrir.

La restauration depuis un bucket S3 (voir [Sauvegardes S3](#sauvegardes-s3)) s'exécute comme la même tâche en arrière-plan : récupérer une grosse archive depuis le bucket et la restaurer ne dépend donc pas non plus du maintien d'une requête.

Si le téléversement est tout simplement impossible, la page Restauration / Import propose aussi une solution de repli par copie directe : copiez l'archive dans le conteneur Poznote exactement à l'emplacement `/tmp/backup_restore.zip` via SSH, rechargez la page et lancez la restauration depuis celle-ci.

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Importer des fichiers individuels</strong></summary>
<br>

Importez directement une ou plusieurs notes HTML, Markdown ou texte :

  - Prend en charge les types de fichiers `.html`, `.md`, `.markdown`, `.txt` et `.json`
  - Jusqu'à 50 fichiers peuvent être sélectionnés en une fois, un nombre réglable dans Paramètres > Outils d'administration > Limites d'import

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Importer un fichier ZIP</strong></summary>
<br>

Importez une archive ZIP contenant plusieurs notes :

  - Prend en charge les types de fichiers `.html`, `.md`, `.markdown` ou `.txt`
  - Les archives ZIP peuvent contenir jusqu'à 300 fichiers, un nombre réglable dans Paramètres > Outils d'administration > Limites d'import
  - Lors de l'import d'une archive ZIP, Poznote détecte et recrée automatiquement l'arborescence des dossiers

Il n'y a pas de limite de taille en pratique pour l'archive. Comme pour une restauration complète, elle est téléversée par tranches (une tranche qui échoue est renvoyée au lieu de faire perdre tout le téléversement), réassemblée sur le serveur, puis traitée par un processus en arrière-plan : ni le navigateur ni un reverse proxy placé devant l'instance ne peuvent faire expirer l'import. Une barre de progression couvre l'ensemble du traitement : téléversement, images et pièces jointes, puis notes.

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Importer des notes Obsidian</strong></summary>
<br>

Importez une archive ZIP contenant plusieurs notes issues d'Obsidian :

  - Les archives ZIP peuvent contenir jusqu'à 300 fichiers, un nombre réglable dans Paramètres > Outils d'administration > Limites d'import
  - Poznote détecte et recrée automatiquement l'arborescence des dossiers
  - Poznote détecte automatiquement les tags existants à créer
  - Poznote importe automatiquement les images si elles se trouvent à la racine du fichier zip

</details>

<details>
<summary><strong>Prise en charge du front matter Markdown</strong></summary>
<br>

Les fichiers Markdown peuvent inclure un front matter YAML pour préciser les métadonnées de la note. Les clés suivantes sont prises en charge :

  - `title` : remplace le titre de la note (par défaut : le nom du fichier sans extension)
  - `folder` : remplace le dossier cible. Un nom simple doit correspondre à un dossier qui existe déjà dans l'espace de travail ; un chemin comme `Projects/2026` crée les dossiers nécessaires.
  - `tags` : tableau de tags à appliquer à la note. Accepte à la fois la syntaxe en ligne `[tag1, tag2]` et la syntaxe sur plusieurs lignes
  - `favorite` : marque la note comme favorite (`true` ou `false`)
  - `created` : définit une date de création personnalisée (format : `YYYY-MM-DD HH:MM:SS`)
  - `updated` : définit une date de modification personnalisée (format : `YYYY-MM-DD HH:MM:SS`)

Exemple avec la syntaxe de tableau en ligne :
```yaml
---
title: My Important Note
folder: Projects
tags: [important, work]
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

Exemple avec la syntaxe sur plusieurs lignes :
```yaml
---
title: My Important Note
folder: Projects
tags:
  - important
  - work
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

</details>


## Consultation hors ligne

La **📦 Sauvegarde complète** crée une version hors ligne autonome de vos notes. Il suffit d'extraire le ZIP et d'ouvrir `index.html` dans n'importe quel navigateur web. Vous pouvez ainsi lire vos notes hors ligne, mais sans toutes les fonctionnalités de Poznote : il s'agit d'un export en lecture seule.

## Instances multiples

> À ne pas confondre avec la fonctionnalité [Multi-utilisateurs](#multi-utilisateurs).

Vous pouvez faire tourner plusieurs instances Poznote isolées sur le même serveur. Chaque instance a ses propres données, son port et ses identifiants.

Idéal pour :
- Héberger différents utilisateurs sur le même serveur, chacun avec sa propre instance et son propre compte
- Tester de nouvelles fonctionnalités sans toucher à votre instance de production

Il suffit de répéter les étapes d'installation dans des répertoires différents, avec des ports différents.

### Exemple : instances de Tom et d'Alice sur le même serveur

```
Server: my-server.com
├── Poznote-Tom
│   ├── Port: 8040
│   ├── URL: http://my-server.com:8040
│   ├── Container: poznote-tom-webserver-1
│   └── Data: ./poznote-tom/data/
│
└── Poznote-Alice
  ├── Port: YOUR_POZNOTE_API_PORT
  ├── URL: http://my-server.com:YOUR_POZNOTE_API_PORT
    ├── Container: poznote-alice-webserver-1
    └── Data: ./poznote-alice/data/
```

## Assistant IA

Poznote intègre un chat IA qui se connecte à une instance locale [Ollama](https://ollama.com) ou [LM Studio](https://lmstudio.ai), à un fournisseur cloud comme [Anthropic (Claude)](https://www.anthropic.com) ou OpenAI, ou à n'importe quel serveur compatible OpenAI. Il recherche et lit vos notes pour répondre à vos questions et, quand vous le lui demandez, les crée, les réécrit et les organise, dans l'espace de travail où vous avez ouvert le chat.

Un administrateur l'active depuis **Paramètres → Outils d'administration → Assistant IA**, et chaque profil dispose alors d'un bouton **Assistant IA** dans la barre d'icônes de gauche. Le serveur d'IA est appelé depuis le serveur Poznote, jamais depuis votre navigateur : avec une instance Ollama locale, vos notes ne quittent jamais votre machine.

Ce que l'assistant sait faire, le choix d'un fournisseur et d'un modèle, les clés API personnelles et la connexion d'un serveur local depuis le conteneur Poznote sont décrits dans la [documentation de l'assistant IA](AI-ASSISTANT.fr.md). Pour confier plutôt la gestion de vos notes à un assistant IA externe (VS Code Copilot, Claude CLI...), consultez le [Serveur MCP](#serveur-mcp) ci-dessous.

## Transcription (reconnaissance vocale)

Transformez votre voix en texte de note grâce à un serveur de reconnaissance vocale que vous hébergez vous-même. Poznote n'embarque aucun modèle vocal : il dialogue avec n'importe quel serveur exposant l'API audio d'OpenAI (`POST /v1/audio/transcriptions`), comme un Whisper auto-hébergé, si bien que l'audio n'a jamais besoin de quitter votre machine.

Une fois qu'un administrateur l'a activée dans **Paramètres → Outils d'administration → Transcription**, vous disposez de **Dicter** sous **Insérer** dans le menu slash, et d'un bouton **Transcrire** sur les pièces jointes audio.

La mise en place d'un serveur, le choix d'un modèle et tout le reste sont décrits dans la [documentation de la transcription](TRANSCRIPTION.fr.md).

## Serveur MCP

Poznote intègre un serveur Model Context Protocol (MCP) qui permet à des assistants IA comme GitHub Copilot ou Claude CLI d'interagir avec vos notes en langage naturel. Par exemple :

- « Crée une nouvelle note intitulée 'Meeting Notes' avec le contenu... »
- « Recherche les notes qui parlent de 'Docker' »
- « Liste toutes les notes de mon espace de travail Poznote »
- « Mets à jour la note 42 avec de nouvelles informations »

Le serveur MCP est fourni avec le `docker-compose.yml` officiel et n'est publié que sur `127.0.0.1` : par défaut, rien en dehors de votre machine ne peut l'atteindre. L'installation, la configuration des clients, les surcharges de port et de débogage, et la protection par `POZNOTE_MCP_AUTH_TOKEN` lorsque vous l'exposez davantage sont décrites dans la [documentation du serveur MCP](MCP-SERVER.fr.md).

## Extension Chrome

**Poznote URL Saver** est une extension de navigateur qui enregistre en un seul clic l'URL, ou même une capture pleine page, de la page courante dans votre instance Poznote. Installez-la depuis le Chrome Web Store : [Installer l'extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

L'extension se connecte à votre instance avec votre nom d'utilisateur et un [mot de passe d'application](#mots-de-passe-dapplication). Les étapes de configuration sont dans la [documentation de l'extension Chrome](CHROME-EXTENSION.fr.md).

## Partager vers Poznote sur Android

Sur Android, Poznote apparaît dans le menu système **Partager** une fois la PWA installée. Partagez une page depuis Chrome (ou un lien ou du texte depuis n'importe quelle application), choisissez Poznote, et une nouvelle note est créée avec le titre de la page et un lien cliquable, sans aucune extension.

Pour l'utiliser :

1. Ouvrez votre instance Poznote dans Chrome sur Android et installez-la comme application (menu → **Ajouter à l'écran d'accueil** → **Installer**).
2. Dans n'importe quelle application, appuyez sur **Partager**, puis choisissez **Poznote**.

> Si Poznote n'apparaît pas tout de suite dans le menu de partage, vérifiez que l'application est bien installée (et pas seulement ajoutée en favori). Si vous avez installé la PWA avant la sortie de cette fonctionnalité, Chrome prend en compte la nouvelle capacité automatiquement au bout de quelques jours, ou immédiatement si vous réinstallez l'application.

## Documentation de l'API

Poznote fournit une API RESTful v1 complète pour accéder par programmation aux notes, dossiers, espaces de travail, tags, pièces jointes, sauvegardes, paramètres, et plus encore.

Pour la référence complète de l'API, avec tous les endpoints, les paramètres et des exemples curl, consultez la **[documentation de l'API REST](API-REST.md)**.

### Démarrage rapide

```bash
# Lister toutes les notes de l'utilisateur d'ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# Idem, avec un mot de passe d'application créé dans Paramètres > Mots de passe d'application
# (fonctionne sur les instances en SSO uniquement ; X-User-ID est implicite)
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# Créer une note
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Documentation interactive (Swagger)

Accédez à **Swagger UI** directement depuis Poznote dans `Settings > About > API REST` pour parcourir tous les endpoints, consulter les schémas de requête et de réponse, et tester les appels API de manière interactive.

## Stack technique

Poznote privilégie la simplicité et la portabilité : pas de framework complexe, pas de dépendances lourdes. Uniquement des technologies web simples et fiables, qui garantissent que vos notes restent accessibles et sous votre contrôle.

**Architecture axée sur la confidentialité :** Poznote fonctionne entièrement en local, sans qu'aucune connexion externe ne soit nécessaire à son fonctionnement. Toutes les bibliothèques (Excalidraw, Mermaid, KaTeX) sont embarquées et servies depuis votre propre instance. Par défaut, la seule connexion sortante est une vérification quotidienne des mises à jour ; les fonctionnalités facultatives que vous activez vous-même (synchronisation Git, S3, un fournisseur d'IA, webhooks, SMTP, OIDC) sont les seules autres.

<details>
<summary>Si la stack technique sur laquelle repose Poznote vous intéresse, <strong>jetez un œil ici.</strong></summary>

### Backend
- **PHP 8.x** : langage de script côté serveur
- **SQLite 3** : base de données relationnelle légère, stockée dans un fichier

### Frontend
- **HTML5** : balisage et structure
- **CSS3** : mise en forme et design responsive
- **JavaScript (Vanilla)** : fonctionnalités interactives et contenu dynamique
- **React + Vite** : chaîne de build du composant Excalidraw (empaqueté en IIFE)
- **AJAX** : chargement asynchrone des données

### Bibliothèques
- **CodeMirror 6** : éditeur de code et de texte extensible, utilisé pour l'édition Markdown
- **Excalidraw** : tableau blanc virtuel pour esquisser des diagrammes et des dessins
- **Mermaid** : bibliothèque JavaScript côté client qui génère des diagrammes et des organigrammes à partir de texte
- **KaTeX** : bibliothèque JavaScript côté client pour la composition rapide et le rendu des équations mathématiques
- **Sortable.js** : bibliothèque JavaScript de tri par glisser-déposer
- **highlight.js** : coloration syntaxique des blocs de code
- **Swagger UI** : interface interactive de documentation et de test de l'API

### Stockage
- **Fichiers HTML/Markdown** : les notes sont stockées sous forme de simples fichiers HTML ou Markdown dans le système de fichiers
- **Base de données SQLite** : métadonnées, tags, relations et données utilisateur
- **Pièces jointes** : stockées sur le système de fichiers local, ou en option dans un stockage objet compatible S3

### Infrastructure
- **Nginx + PHP-FPM** : serveur web performant avec le gestionnaire de processus FastCGI
- **Alpine Linux** : image de base sécurisée et légère
- **Docker** : conteneurisation pour un déploiement et une portabilité simplifiés
- **Python 3.12 (Alpine)** : environnement d'exécution du serveur MCP, avec les bibliothèques httpx, uvicorn et fastmcp pour l'intégration des assistants IA
</details>
