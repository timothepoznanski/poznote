<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <b>Français</b> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Utiliser le serveur MCP de Poznote avec Claude CLI

Ce guide explique comment configurer et utiliser le serveur MCP de Poznote avec Claude CLI (interface en ligne de commande).

## Prérequis

- **Clé API Anthropic :** Claude CLI nécessite une [clé API Anthropic](https://console.anthropic.com/) payante. Définissez-la avant d'utiliser la CLI :
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI installé (`npm install -g @anthropic-ai/claude-cli` ou équivalent)
- Le serveur MCP de Poznote en fonctionnement (via Docker Compose)
- Le serveur MCP accessible sur 127.0.0.1 (port par défaut : 8045)

## Installation

### 1. Vérifier que le serveur MCP tourne

Vérifiez que le conteneur de votre serveur MCP est en cours d'exécution :

```bash
docker ps | grep mcp
```

Le serveur MCP doit apparaître comme en cours d'exécution. Notez le numéro de port indiqué dans la sortie (8045 par défaut).

### 2. Ajouter le serveur MCP à Claude CLI

Ajoutez le serveur MCP de Poznote en utilisant le transport HTTP :

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **Remarque :** remplacez `8045` par le port réel de votre serveur MCP si vous l'avez personnalisé dans votre `docker-compose.yml`.

#### Utiliser un jeton d'authentification

Si le serveur MCP a été démarré avec `POZNOTE_MCP_AUTH_TOKEN` (voir [Jeton d'authentification entrant](MCP-SERVER.fr.md#jeton-dauthentification-entrant)), passez le même jeton dans un en-tête, sinon chaque appel est rejeté avec `401 Unauthorized` :

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

L'emplacement de la configuration dépend de l'option `--scope` :
- **Local (par défaut) :** `~/.claude.json`, disponible uniquement dans le dossier où la commande a été lancée
- **Utilisateur (`--scope user`) :** `~/.claude.json`, disponible dans tous vos projets
- **Projet (`--scope project`) :** `.mcp.json` à la racine du projet, destiné à être versionné et partagé avec votre équipe

### 3. Vérifier la configuration

Listez tous les serveurs MCP configurés :
```bash
claude mcp list
```

`poznote` doit apparaître dans la liste avec son URL HTTP.

### 4. Afficher les détails du serveur

Obtenez des informations détaillées sur le serveur MCP de Poznote :
```bash
claude mcp get poznote
```

## Exemples d'utilisation

Une fois la configuration faite, vous pouvez interagir avec votre instance Poznote au moyen de commandes en langage naturel :

### Requêtes de base

```bash
# Lister toutes les notes
claude "Liste toutes mes notes de Poznote"

# Rechercher des notes
claude "Recherche les notes qui parlent de 'docker' dans Poznote"

# Obtenir une note précise
claude "Montre-moi la note 123 de Poznote"

# Lister les espaces de travail
claude "Quels espaces de travail ai-je dans Poznote ?"

# Lister les dossiers
claude "Montre-moi tous les dossiers de mon espace de travail Poznote"
```

### Créer et modifier des notes

```bash
# Créer une note
# IMPORTANT : si vous ne précisez pas l'espace de travail, la note est créée dans
# l'espace de travail par défaut de l'utilisateur connecté. Précisez toujours l'espace de travail cible.
claude "Crée une note dans Poznote intitulée 'Meeting Notes' dans l'espace de travail 'Projets' avec le contenu 'Discussion sur la nouvelle fonctionnalité'"

# Mettre à jour une note existante
claude "Mets à jour la note 456 dans Poznote avec un nouveau contenu sur le processus de déploiement"

# Supprimer une note (la met à la corbeille)
claude "Supprime la note 456 dans Poznote"

# Créer une note avec un rappel, en une seule étape
claude "Crée une note 'Renew passport' dans l'espace de travail 'Perso' dans Poznote et programme-moi un rappel le 1er septembre à 9 h"

# Créer un dossier
claude "Crée un dossier nommé 'Projects' dans Poznote"
```

### Rappels

```bash
# Définir un rappel sur une note existante
claude "Rappelle-moi la note 123 dans Poznote lundi prochain à 8 h"

# Définir un rappel récurrent
claude "Définis un rappel hebdomadaire sur la note 123 dans Poznote, tous les lundis à 9 h"

# Consulter un rappel
claude "La note 123 dans Poznote a-t-elle un rappel ?"

# Supprimer un rappel
claude "Supprime le rappel de la note 123 dans Poznote"
```

### Listes de tâches

```bash
# Lister les tâches d'une liste de tâches
claude "Montre-moi les tâches de la note 123 dans Poznote"

# Ajouter une tâche avec une date d'échéance et un rappel
claude "Ajoute à la note 123 dans Poznote une tâche 'Buy milk' à faire pour demain 18 h 30, avec un rappel"

# Ajouter une tâche récurrente
claude "Ajoute une tâche 'Weekly report' à la note 123 dans Poznote, à faire tous les vendredis"

# Terminer une tâche
claude "Marque la tâche 'Buy milk' de la note 123 comme terminée dans Poznote"

# Mettre à jour ou supprimer une tâche
claude "Repousse l'échéance de la tâche 'Buy milk' de la note 123 à lundi prochain dans Poznote"
claude "Supprime la tâche 'Buy milk' de la note 123 dans Poznote"
```

### Opérations avancées

```bash
# Dupliquer une note
claude "Duplique la note 789 dans Poznote"

# Ajouter aux favoris ou en retirer
claude "Ajoute la note 123 aux favoris dans Poznote"

# Déplacer une note dans un dossier
claude "Déplace la note 456 dans le dossier 'Projects' dans Poznote"

# Convertir une note entre HTML et Markdown
claude "Convertis la note 123 de Poznote en Markdown"

# Trouver les notes qui pointent vers une note
claude "Quelles notes pointent vers la note 123 dans Poznote ?"

# Partager une note
claude "Active le partage public de la note 123 dans Poznote"

# Lister tout ce qui est partagé publiquement
claude "Liste toutes mes notes et tous mes dossiers partagés publiquement dans Poznote"

# Obtenir les informations système
claude "Quelle version de Poznote est-ce que j'utilise ?"
```

### Dossiers et espaces de travail

```bash
# Renommer ou supprimer un dossier
claude "Renomme le dossier 12 en 'Archive' dans Poznote"
claude "Supprime le dossier 12 dans Poznote et mets ses notes à la corbeille"

# Gérer les espaces de travail
claude "Crée un espace de travail nommé 'Work' dans Poznote"
claude "Renomme l'espace de travail 'Work' en 'Job' dans Poznote"
claude "Supprime l'espace de travail 'Job' dans Poznote"
```

### Paramètres

```bash
# Lire un paramètre
claude "Quelle est la valeur du paramètre 'timezone' dans Poznote ?"

# Modifier un paramètre
claude "Règle le paramètre 'timezone' sur 'Europe/Paris' dans Poznote"
```

### Corbeille et restauration

```bash
# Afficher la corbeille
claude "Montre-moi toutes les notes de la corbeille de Poznote"

# Restaurer une note
claude "Restaure la note 123 depuis la corbeille de Poznote"

# Vider la corbeille
claude "Vide la corbeille de Poznote"
```

### Synchronisation Git

```bash
# Consulter l'état de la synchronisation Git
claude "Où en est la synchronisation Git dans Poznote ?"

# Envoyer vers Git
claude "Envoie mes notes Poznote vers Git"

# Récupérer depuis Git
claude "Récupère les notes depuis Git dans Poznote"
```

### Sauvegardes

```bash
# Lister les sauvegardes
claude "Liste toutes les sauvegardes Poznote"

# Créer une sauvegarde
claude "Crée une sauvegarde de mes données Poznote"

# Restaurer une sauvegarde (⚠️ remplace toutes les données actuelles de l'utilisateur)
claude "Restaure la sauvegarde Poznote poznote_backup_2026-02-02_15-30-00.zip"

# Supprimer un fichier de sauvegarde
claude "Supprime la sauvegarde Poznote poznote_backup_2026-02-02_15-30-00.zip"
```

## Mode interactif

Lancez une session interactive pour discuter de vos notes avec Claude :

```bash
claude
```

Posez ensuite vos questions naturellement :
- « Peux-tu me montrer toutes mes notes qui ont le tag 'important' ? »
- « Fais un résumé de toutes mes notes de réunion de la semaine dernière »
- « Aide-moi à organiser mes notes en dossiers »

## Options de configuration

### Utiliser un port personnalisé

Si votre serveur MCP tourne sur un autre port (vérifiez le paramètre `POZNOTE_MCP_PORT` dans votre `docker-compose.yml`) :
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### Supprimer le serveur

Pour retirer le serveur MCP de Poznote de Claude CLI :
```bash
claude mcp remove poznote
```

### Instances multiples

Si vous faites tourner plusieurs instances de Poznote sur différents ports, vous pouvez les configurer sous des noms différents :
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

Précisez ensuite dans vos requêtes quelle instance utiliser :
```bash
claude "Liste les notes de poznote-work"
```

## Dépannage

### Problèmes de connexion

Si Claude CLI ne parvient pas à se connecter au serveur MCP :

1. **Vérifiez que le serveur MCP tourne :**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   (Remplacez `8045` par le port que vous avez configuré)

2. **Vérifiez l'état du conteneur Docker :**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **Vérifiez la publication du port :**
   Assurez-vous que le port est lié à 127.0.0.1 dans `docker-compose.yml` :
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### Erreurs d'authentification

Le serveur MCP s'authentifie auprès de Poznote avec le jeton partagé stocké dans `data/.mcp_token`.

Vérifiez ces points :
- `./data/.mcp_token` existe sur l'hôte Poznote
- le service `mcp-server` monte `./data:/var/www/html/data:ro`
- le conteneur webserver a été recréé au moins une fois après la mise à jour vers la configuration MCP à base de jeton

### Mode débogage

Activez les logs de débogage du serveur MCP en recréant le conteneur avec une variable d'environnement passée sur la ligne de commande :
```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Seules les valeurs exactes en minuscules `true` et `false` sont reconnues. Toute autre valeur est traitée comme `false` et un avertissement est écrit dans les logs MCP.

Consultez ensuite les logs :
```bash
docker compose logs -f mcp-server
```

## Remarques sur la sécurité

⚠️ **Important :** quiconque peut joindre le point de terminaison MCP peut gérer toutes les notes. Par défaut, il n'est joignable que depuis 127.0.0.1 ; si vous l'exposez davantage, définissez `POZNOTE_MCP_AUTH_TOKEN` pour que les clients doivent présenter un jeton bearer (voir [Utiliser un jeton d'authentification](#utiliser-un-jeton-dauthentification)).

**Configuration par défaut (sécurisée) :**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Pour un accès distant, utilisez un tunnel SSH :**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Tous les détails : [Sécurité du serveur MCP](MCP-SERVER.fr.md#sécurité).

## Outils MCP disponibles

Le serveur MCP de Poznote fournit les outils suivants :

### Gestion des notes
- `get_note` : obtenir une note précise par son ID
- `list_notes` : lister toutes les notes
- `search_notes` : rechercher des notes par texte, avec une plage de dates de création facultative
- `create_note` : créer une note, éventuellement avec une date d'échéance ou un rappel
- `update_note` : mettre à jour une note existante et/ou définir sa date d'échéance ou son rappel
- `delete_note` : supprimer une note
- `duplicate_note` : dupliquer une note
- `convert_note` : convertir une note entre HTML et Markdown
- `get_backlinks` : obtenir les notes qui pointent vers une note

### Rappels
- `get_reminder` : obtenir le rappel défini sur une note
- `set_reminder` : définir ou remplacer le rappel d'une note, avec un intervalle de répétition facultatif
- `remove_reminder` : supprimer le rappel d'une note

### Tâches
- `list_tasks` : lister les tâches d'une liste de tâches, avec leurs ID et leurs dates d'échéance
- `add_task` : ajouter une tâche, avec une date d'échéance et un rappel facultatifs
- `update_task` : mettre à jour une tâche (texte, date d'échéance, rappel, indicateur important)
- `complete_task` : marquer une tâche comme terminée, ou la rouvrir
- `delete_task` : supprimer une tâche d'une liste de tâches

### Organisation
- `create_folder` : créer un dossier
- `list_folders` : lister tous les dossiers
- `rename_folder` : renommer un dossier
- `delete_folder` : supprimer un dossier et mettre ses notes à la corbeille
- `list_workspaces` : lister tous les espaces de travail
- `create_workspace` : créer un espace de travail
- `rename_workspace` : renommer un espace de travail
- `delete_workspace` : supprimer un espace de travail (impossible de supprimer le dernier)
- `list_tags` : lister tous les tags
- `move_note_to_folder` : déplacer une note dans un dossier
- `remove_note_from_folder` : retirer une note d'un dossier
- `toggle_favorite` : ajouter aux favoris ou en retirer

### Gestion de la corbeille
- `get_trash` : lister les notes de la corbeille
- `restore_note` : restaurer depuis la corbeille
- `empty_trash` : vider la corbeille

### Partage
- `share_note` : activer le partage public
- `unshare_note` : désactiver le partage public
- `get_note_share_status` : obtenir l'état du partage
- `list_shared` : lister toutes les notes et tous les dossiers partagés publiquement

### Pièces jointes
- `list_attachments` : lister les pièces jointes d'une note

### Synchronisation Git
- `get_git_sync_status` : obtenir l'état de la synchronisation Git
- `git_push` : envoyer vers le dépôt Git
- `git_pull` : récupérer depuis le dépôt Git

### Système
- `get_system_info` : obtenir les informations de version de Poznote
- `list_backups` : lister les sauvegardes système
- `create_backup` : créer une sauvegarde
- `restore_backup` : restaurer une sauvegarde (remplace les données actuelles de l'utilisateur)
- `delete_backup` : supprimer un fichier de sauvegarde
- `get_app_setting` : obtenir un paramètre de l'application
- `update_app_setting` : modifier un paramètre de l'application

### Prise en charge multi-utilisateur

La plupart des outils acceptent un paramètre facultatif `user_id` pour cibler un profil utilisateur précis. Les exceptions sont les outils système `get_system_info`, `list_backups`, `create_backup` et `delete_backup`, qui ne prennent pas `user_id`.
```bash
claude "Liste les notes de l'utilisateur 2 dans Poznote"
```

## Documentation associée

- [Documentation principale du serveur MCP](MCP-SERVER.fr.md)
- [Configuration de VS Code Copilot](VSCODE-COPILOT.fr.md)
- [Considérations de sécurité](MCP-SERVER.fr.md#sécurité)

## Support

Pour tout problème ou toute question :
- Consultez la [documentation MCP principale](MCP-SERVER.fr.md)
- Examinez les logs du serveur MCP : `docker compose logs mcp-server`
- Vérifiez que l'API Poznote est accessible
