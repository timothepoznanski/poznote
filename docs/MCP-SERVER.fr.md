<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <b>Français</b> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Serveur MCP de Poznote

Serveur MCP (Model Context Protocol) pour Poznote : il permet de gérer vos notes avec l'aide de l'IA, en langage naturel.

Ce serveur prend en charge **uniquement le transport HTTP** (MCP Streamable HTTP).

> [!TIP]
> Vous cherchez un chat avec un modèle local (par exemple Ollama) directement dans Poznote ? Vous n'avez pas besoin du serveur MCP pour cela : utilisez plutôt l'[Assistant IA](AI-ASSISTANT.fr.md) intégré (**Paramètres → Outils d'administration → Assistant IA**). Le serveur MCP sert à connecter à vos notes des assistants *externes* compatibles MCP ; Ollama seul est un environnement d'exécution de modèles, pas un client MCP, et ne peut pas s'y connecter directement.

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

## Démarrage rapide

Choisissez votre assistant IA :

- **[VS Code Copilot](VSCODE-COPILOT.fr.md) :** intégrez Poznote à votre éditeur
- **[Claude CLI](CLAUDE-CLI.fr.md) :** utilisez Poznote en ligne de commande

---

## Fonctionnement

Le serveur MCP fait le lien entre les assistants IA et votre instance Poznote.

### Composants

- **`server.py`** : serveur MCP (HTTP / Streamable HTTP)
  - Expose le point de terminaison MCP à l'adresse `http://127.0.0.1:8045/mcp`
  - Définit les outils (actions) de gestion des notes
  - Orchestre les appels entre l'IA et l'API Poznote

- **`client.py`** : client HTTP pour l'API REST de Poznote
  - Effectue les requêtes HTTP (GET, POST, PATCH, DELETE)
  - Gère l'authentification auprès de l'API Poznote avec le jeton de service MCP partagé

### Flux de communication

1. L'assistant IA (VS Code Copilot ou Claude CLI) se connecte au serveur MCP
2. Le serveur MCP appelle l'API REST de Poznote
3. Les résultats sont renvoyés à l'assistant IA

Un onglet Poznote ouvert dans le navigateur prend en compte les modifications faites via MCP en quelques secondes : l'arborescence de la barre latérale et la note ouverte se rafraîchissent sur place (ou affichent un bandeau de rechargement lorsque la note contient des modifications non enregistrées). Une note simplement ouverte dans le navigateur ne bloque pas les écritures MCP ; seule une note en cours de modification par un autre utilisateur du même compte, ou par un visiteur via un lien de partage public, répond par une erreur HTTP 423.

## Fonctionnalités

### Outils (actions)
- `get_note` : obtenir une note précise par son ID, avec tout son contenu
- `list_notes` : lister les notes d'un espace de travail, une page à la fois (`limit`/`offset`, avec le `total` réel de l'espace de travail dans le résultat)
- `search_notes` : rechercher des notes par texte, avec une plage de dates de création facultative
- `create_note` : créer une note, éventuellement à partir d'un modèle et/ou avec une date d'échéance ou un rappel
- `update_note` : mettre à jour une note existante, la déplacer et/ou définir sa date d'échéance ou son rappel
- `delete_note` : supprimer une note par son ID
- `get_reminder` : obtenir le rappel actuellement défini sur une note
- `set_reminder` : définir ou remplacer le rappel d'une note, avec un intervalle de répétition facultatif
- `remove_reminder` : supprimer le rappel d'une note
- `list_tasks` : lister les tâches d'une liste de tâches, avec leurs ID, leurs dates d'échéance et leurs indicateurs
- `add_task` : ajouter une tâche à une liste de tâches, avec une date d'échéance et un rappel facultatifs
- `update_task` : mettre à jour une tâche (texte, date d'échéance, rappel, indicateur important)
- `complete_task` : marquer une tâche comme terminée, ou la rouvrir
- `delete_task` : supprimer une tâche d'une liste de tâches
- `create_folder` : créer un dossier, par nom ou par chemin (`folder_path="Projects/2026/Q3"` crée toute la chaîne en un seul appel), ou une racine de journal avec `is_diary=true`
- `list_folders` : lister tous les dossiers d'un espace de travail, avec leurs chemins et leurs indicateurs de journal
- `list_workspaces` : lister tous les espaces de travail disponibles
- `list_tags` : lister tous les tags distincts utilisés dans les notes
- `list_templates` : lister les notes modèles à partir desquelles `from_template_id` de `create_note` peut démarrer
- `get_trash` : lister toutes les notes actuellement dans la corbeille
- `empty_trash` : supprimer définitivement toutes les notes de la corbeille
- `restore_note` : restaurer une note depuis la corbeille
- `duplicate_note` : créer un doublon d'une note existante
- `toggle_favorite` : ajouter une note aux favoris ou l'en retirer
- `list_attachments` : lister toutes les pièces jointes d'une note
- `add_attachment` : joindre un fichier à une note à partir de son contenu en base64 (image, log, PDF, …)
- `move_note` : déplacer une note vers un autre espace de travail et/ou un autre dossier, en conservant son id
- `move_folder` : déplacer un dossier (avec ses sous-dossiers et ses notes) sous un autre parent et/ou dans un autre espace de travail
- `move_note_to_folder` : déplacer une note dans un dossier précis
- `remove_note_from_folder` : retirer une note de son dossier actuel (la déplace à la racine)
- `share_note` : activer le partage public d'une note et obtenir l'URL publique
- `unshare_note` : désactiver le partage public d'une note
- `get_note_share_status` : obtenir l'état de partage actuel et l'URL publique d'une note
- `list_shared` : lister toutes les notes et tous les dossiers partagés publiquement
- `get_backlinks` : obtenir toutes les notes qui pointent vers (référencent) une note précise
- `convert_note` : convertir une note entre les formats HTML et Markdown
- `rename_folder` : renommer un dossier existant
- `delete_folder` : supprimer un dossier et mettre ses notes à la corbeille
- `create_workspace` : créer un espace de travail
- `rename_workspace` : renommer un espace de travail existant
- `delete_workspace` : supprimer un espace de travail (impossible de supprimer le dernier)
- `get_git_sync_status` : obtenir l'état actuel de la synchronisation Git (GitHub/GitLab/Forgejo)
- `git_push` : forcer l'envoi des notes locales vers le dépôt Git configuré
- `git_pull` : forcer la récupération des notes depuis le dépôt Git configuré
- `get_system_info` : obtenir les informations de version de l'installation Poznote
- `list_backups` : lister toutes les sauvegardes système disponibles
- `create_backup` : lancer la création d'une nouvelle sauvegarde système
- `restore_backup` : restaurer un fichier de sauvegarde (remplace les données actuelles de l'utilisateur)
- `delete_backup` : supprimer un fichier de sauvegarde précis
- `get_app_setting` : obtenir la valeur d'un paramètre précis de l'application
- `update_app_setting` : modifier la valeur d'un paramètre précis de l'application

**Dans quel espace de travail arrive un appel.** Indiquez toujours le `workspace` sur `create_note`, `create_folder` et `list_folders` (un dossier appartient toujours à un espace de travail) : c'est le seul moyen d'en être sûr. Lorsqu'il est omis, le serveur le détermine dans un ordre fixe et ne devine jamais : d'abord le paramètre `mcp_default_workspace` s'il désigne un espace de travail existant, puis l'unique espace de travail du compte s'il n'en a qu'un. Avec plusieurs espaces de travail et aucun paramètre, l'appel est refusé et la réponse les liste, plutôt que de déposer la note dans l'espace de travail qui se trouve trié en premier (lequel pouvait changer de lui-même, par exemple la première fois que l'archivage d'une note créait « Archives »). Définissez la valeur par défaut avec `update_app_setting("mcp_default_workspace", "<name>")`.

**Pièces jointes.** `add_attachment(note_id, filename, content_base64)` enregistre un fichier sur une note exactement comme le fait un glisser-déposer dans l'interface web, de sorte qu'un graphique généré ou un fichier de log peut être joint sans intervention humaine ; une URI `data:` est acceptée comme contenu. Les règles de Poznote s'appliquent toujours : un type exécutable ou un quota de stockage plein renvoient un refus accompagné de sa raison. Les octets transitent encodés en base64 dans l'appel d'outil, c'est pourquoi l'outil limite un envoi à 25 Mo et renvoie vers l'interface web pour tout fichier plus volumineux.

**Déplacements.** `move_note` et `move_folder` déplacent, ils ne copient pas : les id, le contenu, l'historique et les liens pointant vers une note sont tous conservés. Sur `update_note`, `workspace` indique où *chercher la note* ; l'argument qui la déplace est `target_workspace`. Une note qui change d'espace de travail sans qu'on lui indique un dossier de destination arrive à la racine de cet espace de travail, puisque son ancien dossier appartient à l'espace de travail qu'elle a quitté. Un dossier emporte avec lui ses sous-dossiers et toutes les notes qu'ils contiennent.

**Dossiers.** Tous les outils qui prennent un dossier acceptent la même chose : un nom, ou un chemin séparé par des barres obliques. `create_note(folder="Diary/2026/08")` crée les niveaux manquants au passage ; `create_folder(folder_path=…)` fait de même pour un dossier ; `list_notes(folder_id=…)` limite une liste à un seul dossier côté serveur, si bien que son `total` ne compte que ce dossier. Un nom seul désigne un dossier existant à n'importe quelle profondeur lorsqu'un seul dossier de l'espace de travail porte ce nom, plutôt que d'en créer un second à la racine ; lorsque plusieurs le portent, l'appel est refusé et les liste : passez alors le chemin complet ou l'id.

**Journaux.** Un journal n'est pas un simple dossier nommé Journal : c'est un dossier racine portant l'indicateur `is_diary`, et le bouton « Nouvelle entrée de journal » de l'interface range ses notes datées dans cette racine marquée. Créez-en un avec `create_folder(folder_name="Journal", is_diary=true)`, et `list_folders` vous indique quels dossiers sont des journaux. Passer un nom déjà porté par un dossier racine transforme ce dossier en journal et conserve ses notes. Les entrées de journal elles-mêmes sont des notes ordinaires : rangez-les avec `create_note(folder="Journal/2026/09")`.

**Modèles.** Un modèle est une note ordinaire conservée dans un dossier nommé `Templates` (toute profondeur en dessous compte) ou n'importe où dans un espace de travail de ce nom ; le mot est reconnu dans toutes les langues livrées, un dossier `Modèles` fonctionne donc aussi. `list_templates` les renvoie avec leurs id, et `create_note(from_template_id=…)` démarre une nouvelle note à partir de l'un d'eux, dans le format propre au modèle ; demandez `note_type="markdown"` et un modèle HTML est converti, comme le fait la commande `/template` dans l'éditeur. Un modèle ne peut pas servir à démarrer une liste de tâches ni un dessin. Passer aussi `content` l'ajoute après le corps du modèle.

**Rappels et tâches.** `reminder_at` (sur `create_note`/`update_note` et `set_reminder`) est une date-heure ISO telle que `2026-09-01T09:00:00+02:00` ; indiquez un décalage, sinon l'heure est interprétée en UTC. Les dates d'échéance des tâches (`due_at`) sont différentes : ce sont des valeurs d'heure locale, `YYYY-MM-DD` ou `YYYY-MM-DDTHH:MM` sans décalage, interprétées selon le fuseau horaire configuré par l'utilisateur, et une date sans heure déclenche le rappel à 09:00. Les intervalles de répétition s'écrivent `<count><unit>` avec l'unité `i`/`h`/`d`/`w`/`m`/`y`, par exemple `30i`, `1d` ou `2w`.

Les outils de tâches agissent sur une seule tâche à la fois : appelez `list_tasks` pour obtenir les ID des tâches, puis `add_task`, `update_task`, `complete_task` ou `delete_task`. Chaque appel ne transporte que cette tâche : un client ne lit donc jamais une liste de tâches pour renvoyer ensuite un tableau entier, et deux appelants qui modifient des tâches différentes ne peuvent pas écraser le travail l'un de l'autre. Poznote stocke les tâches d'une note sous forme d'un unique tableau JSON, que le serveur réécrit à chaque appel : le travail effectué par un appel augmente donc toujours avec la longueur de la liste. Les notifications restent synchronisées automatiquement, et terminer ou supprimer une tâche retire son rappel en attente.

La plupart des outils acceptent un argument facultatif `user_id` pour cibler un profil utilisateur précis. Lorsqu'il est fourni, le serveur MCP envoie l'en-tête `X-User-ID` pour cette requête, ce qui vous permet de créer ou de lire des notes dans différents profils sans modifier l'environnement MCP global. Les exceptions sont les outils système `get_system_info`, `list_backups`, `create_backup` et `delete_backup`, qui ne prennent pas `user_id`. Pour changer le profil utilisé par défaut lorsqu'aucun `user_id` n'est passé, voir [Profil utilisateur par défaut](#profil-utilisateur-par-défaut).

---

## Installation du serveur

Le serveur MCP est inclus dans le `docker-compose.yml` officiel de Poznote et démarre automatiquement.

### Configuration

Le serveur MCP utilise les valeurs par défaut de `docker-compose.yml` :

```bash
# Le port du serveur MCP vaut 8045 par défaut
# Les logs de débogage sont désactivés (false) par défaut
```

Poznote génère automatiquement le jeton de service MCP dans `data/.mcp_token`. Le conteneur `mcp-server` lit ce fichier via le volume partagé `./data:/var/www/html/data:ro` : il n'y a donc aucun mot de passe à conserver dans `.env`.

Pour modifier le port et le mode débogage le temps d'un démarrage, recréez le conteneur MCP en passant les variables d'environnement sur la ligne de commande :

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Un simple `docker compose restart mcp-server` ne recharge pas les variables d'environnement modifiées.

#### Profil utilisateur par défaut

Par défaut, le serveur MCP agit en tant que profil utilisateur `1` (le premier administrateur). Pour rattacher le serveur à un autre profil, définissez `POZNOTE_USER_ID` au démarrage du conteneur :

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

Tous les appels d'outils s'appliquent alors à ce profil, sauf si une requête passe un argument `user_id` explicite, qui reste prioritaire pour cette requête. La valeur doit être un ID de profil numérique ; toute autre valeur est ignorée, avec un avertissement dans les logs MCP, et la valeur par défaut `1` est utilisée.

#### Jeton d'authentification entrant

Par défaut, le point de terminaison MCP accepte tout client capable de le joindre, ce qui est sûr puisque le port n'est publié que sur `127.0.0.1`. Si vous exposez le port au-delà de votre machine (reverse proxy, réseau local, installation sans Docker), définissez `POZNOTE_MCP_AUTH_TOKEN` : le serveur exigera alors un en-tête `Authorization: Bearer <token>` sur chaque requête et répondra `401 Unauthorized` sinon :

```bash
# Générez une seule fois un jeton robuste
openssl rand -hex 32

# Placez-le dans .env
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# Recréez le conteneur MCP pour qu'il prenne en compte le nouvel environnement
docker compose up -d --force-recreate mcp-server
```

Ajoutez ensuite le même en-tête à la configuration de votre client : voir [VS Code Copilot](VSCODE-COPILOT.fr.md#utiliser-un-jeton-dauthentification) et [Claude CLI](CLAUDE-CLI.fr.md#utiliser-un-jeton-dauthentification). Les espaces en début et en fin de valeur sont ignorés, si bien qu'un jeton lu depuis un fichier de secrets avec un saut de ligne final fonctionne quand même. Une valeur vide laisse le point de terminaison ouvert. La ligne de log au démarrage indique le mode actif.

Ce jeton est distinct de `data/.mcp_token` : celui-là sert au serveur MCP pour dialoguer *avec* l'API Poznote, celui-ci est ce que *votre assistant IA* doit présenter au serveur MCP.

#### Mode débogage

Définissez `POZNOTE_DEBUG=true` dans la commande de démarrage pour faire passer le niveau de log de `INFO` à `DEBUG`. Remettez-le à `false` pour un usage normal. Seules les valeurs exactes en minuscules `true` et `false` sont reconnues. Toute autre valeur est traitée comme `false` et un avertissement est écrit dans les logs MCP. Le serveur web est plus tolérant et accepte aussi `1`, `on` ou `yes`. Chaque requête HTTP envoyée à l'API Poznote, chaque appel d'outil reçu de l'assistant IA et chaque réponse sont écrits en détail dans les logs du conteneur. Utilisez-le pour diagnostiquer des problèmes de connexion ou d'authentification :

```bash
docker compose logs -f mcp-server
```

Laissez-le désactivé en usage normal : cette verbosité supplémentaire est inutile au quotidien.

### Démarrer le serveur

```bash
docker-compose up -d
```

### Vérifier l'installation

```bash
# Vérifier que le conteneur tourne
docker ps | grep mcp

# Tester le point de terminaison
curl http://127.0.0.1:8045/mcp
```

Pour désactiver le serveur MCP, commentez le service `mcp-server` dans `docker-compose.yml`.

---

## Configuration des clients

Configurez votre assistant IA pour qu'il se connecte au serveur MCP :

### **VS Code Copilot**
Guide de configuration complet : **[VSCODE-COPILOT.md](VSCODE-COPILOT.fr.md)**

### **Claude CLI**
Guide de configuration complet : **[CLAUDE-CLI.md](CLAUDE-CLI.fr.md)**

---

## Sécurité

Quiconque peut joindre le point de terminaison MCP peut lire, créer, modifier et supprimer toutes les notes de tous les profils (les outils acceptent un argument `user_id`), et peut aussi déclencher des sauvegardes, des restaurations et des modifications de paramètres. Deux niveaux de protection évitent que cela pose problème :

1. **Accessibilité réseau.** Par défaut, le point de terminaison n'est joignable que depuis la machine locale.
2. **Jeton bearer entrant** (facultatif). Définissez `POZNOTE_MCP_AUTH_TOKEN` et chaque requête devra comporter `Authorization: Bearer <token>`.

Avec le `docker-compose.yml` par défaut, le niveau 1 suffit à lui seul. Ajoutez le niveau 2 dès que le port devient joignable depuis un endroit que vous ne maîtrisez pas entièrement.

### Pourquoi l'écoute limitée à 127.0.0.1 est à la fois normale et sûre

Le conteneur MCP écoute sur `0.0.0.0` *à l'intérieur* du conteneur, ce dont Docker a besoin pour que la redirection de port fonctionne, mais le port n'est publié **que sur `127.0.0.1`** de l'hôte, jamais sur une interface publique :

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

C'est voulu, et c'est la bonne configuration : seuls les processus tournant sur la même machine (ou les tunnels SSH que vous avez explicitement mis en place) peuvent se connecter. Il n'y a rien à craindre avec la configuration par défaut.

### Exécuter le serveur MCP en dehors de Docker

Si vous installez le serveur MCP avec `pip` et lancez vous-même `poznote-mcp serve` (systemd, LXC Proxmox, ...), aucune redirection de port Docker ne se trouve devant lui : l'adresse d'écoute a donc son importance.

- `poznote-mcp serve` écoute sur **`127.0.0.1` par défaut**. Conservez cette valeur par défaut, sauf si vous savez pourquoi il vous faut autre chose.
- Si vous devez écouter sur `0.0.0.0` (reverse proxy sur un autre hôte, interface VPN), définissez aussi `POZNOTE_MCP_AUTH_TOKEN`. Le serveur écrit un avertissement dans les logs au démarrage lorsqu'il écoute sur une adresse autre que la boucle locale sans jeton.
- Les versions plus anciennes écoutaient sur `0.0.0.0` par défaut : passez explicitement `--host=127.0.0.1` (ou définissez `MCP_HOST=127.0.0.1` si vous lancez le serveur sans la sous-commande `serve`).

### Accès distant

Si Poznote tourne sur un serveur distant et que vous voulez vous y connecter depuis votre poste de travail, utilisez une redirection de port SSH et n'exposez **pas** le port publiquement :

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Pointez ensuite votre assistant IA vers `http://127.0.0.1:8045/mcp`, comme d'habitude.

### Environnements de production

Si vous devez faire transiter le serveur MCP par un réseau, protégez-le avec :
- `POZNOTE_MCP_AUTH_TOKEN` (voir [Jeton d'authentification entrant](#jeton-dauthentification-entrant)), et HTTPS devant lui pour que le jeton ne circule pas en clair
- Un VPN (Tailscale, WireGuard)
- Éventuellement, un reverse proxy doté de sa propre authentification ou d'une liste d'IP autorisées (nginx, Caddy), comme protection supplémentaire

### Comment le serveur MCP s'authentifie auprès de Poznote

Le serveur MCP se connecte à l'API REST de Poznote avec un jeton Bearer interne stocké dans `data/.mcp_token`. Poznote crée ce jeton automatiquement, et la configuration Docker Compose monte `./data` en lecture seule dans le conteneur MCP, si bien que le jeton n'a jamais besoin de figurer dans `.env`.

Comme ce jeton identifie le serveur MCP, Poznote prend un snapshot d'une note juste avant qu'une requête qui le porte ne modifie le contenu ou les tâches de la note (`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`). Il apparaît sous le nom « Avant modification MCP » dans le menu Snapshots de la note : une réécriture par l'IA qui aurait supprimé du contenu peut ainsi être annulée en un clic. Aucun snapshot n'est pris lorsque le plus récent contient déjà le même contenu, et les 20 plus récents sont conservés par note, un nombre à augmenter dans **Paramètres → Snapshots** (jusqu'à 200) lorsque le serveur MCP modifie suffisamment de notes pour en épuiser 20 en un après-midi.

---

## Exemples d'utilisation

Une fois la configuration faite, interagissez avec Poznote en langage naturel :

```
Liste toutes les notes de l'espace de travail 'Poznote'
Recherche les notes qui parlent de 'MCP'
Crée une note intitulée 'Meeting Notes' à propos de la discussion
Mets à jour la note 123 avec un nouveau contenu
Déplace la note 456 dans le dossier 'Projects'
```

Pour des exemples d'utilisation détaillés et le dépannage :
- VS Code Copilot : [VSCODE-COPILOT.md](VSCODE-COPILOT.fr.md#exemples-dutilisation)
- Claude CLI : [CLAUDE-CLI.md](CLAUDE-CLI.fr.md#exemples-dutilisation)

---

## Support et ressources

- **[Configuration de VS Code Copilot →](VSCODE-COPILOT.fr.md)**
- **[Configuration de Claude CLI →](CLAUDE-CLI.fr.md)**

En cas de problème :
- Consultez les logs du serveur MCP : `docker compose logs mcp-server`
- Vérifiez que l'API Poznote est accessible
- Consultez les guides de dépannage propres à chaque client
