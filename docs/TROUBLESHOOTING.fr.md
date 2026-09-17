<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <b>Français</b> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Dépannage de l'installation

<details>
<summary><strong>Avertissements « mkdir() » (permission denied) ou « Connection failed »</strong></summary>
<br>

Si vous rencontrez des erreurs comme :
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- Le dossier `database` est créé avec `root:root` au lieu de `www-data:www-data`

Il s'agit d'un problème connu des montages de volumes Docker dans certains environnements (Komodo, Portainer, etc.). Dans certaines configurations, le conteneur ne peut pas modifier les permissions des volumes montés.

**Solution :** avant de démarrer le conteneur, définissez les bonnes permissions sur votre machine hôte :

```bash
# Placez-vous dans votre répertoire Poznote
cd poznote

# Créez l'arborescence du répertoire data avec les bonnes permissions
mkdir -p data/database

# Attribuez la propriété à l'UID 82 (www-data sous Alpine Linux)
sudo chown -R 82:82 data

# Démarrez le conteneur
docker compose up -d
```

</details>

<details>
<summary><strong>"Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database"</strong></summary>
<br>

Commencez par arrêter puis redémarrer le conteneur, et attendez que la base de données soit initialisée (rafraîchissez la page).

Si cela n'a pas suffi, arrêtez le conteneur et corrigez le propriétaire du dossier `data` (adaptez l'UID/GID à votre installation, l'exemple utilise 1000:1000) :

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Remarque :** l'UID 82 correspond à l'utilisateur `www-data` sous Alpine Linux, utilisé par l'image Docker de Poznote.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Exécution rootless (docker-compose.rootless.yml)</strong></summary>
<br>

Poznote fournit aussi une variante d'image rootless qui tourne entièrement sous un utilisateur non privilégié (uid/gid `1000`, nom d'utilisateur `poznote`) au lieu de root, pour les environnements qui interdisent root dans les conteneurs (Kubernetes avec le `PodSecurityStandard` restricted, Podman rootless, `docker run --user`, etc.).

Contrairement à l'image par défaut, cette variante ne dispose d'aucun processus root au démarrage pour corriger le propriétaire d'un montage bind de l'hôte qui ne correspond pas : `./data` **doit appartenir à l'uid/gid 1000 avant le premier démarrage** :

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Si cette étape est omise, le conteneur s'arrête dès le démarrage avec une erreur qui indique exactement quoi exécuter.

Notez que `sudo` n'est souvent pas nécessaire pour cette étape :

- Si votre utilisateur sur l'hôte a déjà l'uid `1000` (le premier utilisateur créé sur la plupart des distributions Linux), `mkdir -p data` crée le répertoire avec le bon propriétaire et le `chown` peut être entièrement omis.
- Avec Podman rootless ou Docker rootless, exécutez plutôt le chown dans l'espace de noms utilisateur, sans aucun privilège root :

```bash
# Podman rootless
podman unshare chown -R 1000:1000 data
# Docker rootless
rootlesskit chown -R 1000:1000 data
```

Pour une nouvelle installation, suivez la [méthode d'installation rootless](README.fr.md#rootless) du README. Pour migrer une instance Poznote existante, arrêtez-la, sauvegardez votre répertoire de données et changez-en le propriétaire, puis démarrez la variante rootless :

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

Le serveur web rootless écoute en interne sur le port `8080` au lieu de `80` (ports non privilégiés uniquement) ; `HTTP_WEB_PORT` dans votre `.env` contrôle toujours le port côté hôte, sans changement.

Pour construire l'image rootless depuis les sources au lieu de la télécharger, remplacez la ligne `image:` de `docker-compose.rootless.yml` par `build: { context: ., target: rootless }` (un clone de ce dépôt est alors nécessaire).

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>Utiliser <code>network_mode: host</code></strong></summary>
<br>

Par défaut, Docker associe un port de l'hôte au conteneur : le serveur web écoute sur le port `80` dans le conteneur (`8080` pour l'image rootless), et `HTTP_WEB_PORT` choisit le port côté hôte. Avec `network_mode: host`, il n'y a plus d'association. Le conteneur ouvre directement les ports de l'hôte, où le port `80` appartient souvent déjà à un autre serveur web ou conteneur.

Définissez le port d'écoute du serveur web avec `POZNOTE_LISTEN_PORT` dans `.env` (avec l'image rootless, un port supérieur à 1023) :

```bash
POZNOTE_LISTEN_PORT=8040
```

Puis, dans `docker-compose.yml` (ou `docker-compose.rootless.yml`), remplacez la section `ports:` des deux services par `network_mode: host`. Le serveur MCP demande deux changements de plus : il ne peut plus joindre le serveur web par son nom de service, et son image écoute sur toutes les interfaces, ce qui en mode host veut dire toutes les interfaces de l'hôte. Faites-le pointer vers le nouveau port et limitez-le à localhost :

```yaml
  mcp-server:
    image: ghcr.io/timothepoznanski/poznote-mcp:6
    restart: always
    network_mode: host
    command: ["sh", "-c", "poznote-mcp serve --host=127.0.0.1 --port=$${MCP_PORT}"]
    environment:
      POZNOTE_API_URL: http://127.0.0.1:${POZNOTE_LISTEN_PORT}/api/v1
      MCP_PORT: ${POZNOTE_MCP_PORT:-8045}
      POZNOTE_DEBUG: ${POZNOTE_DEBUG:-false}
      POZNOTE_USER_ID: ${POZNOTE_USER_ID:-1}
      POZNOTE_MCP_AUTH_TOKEN: ${POZNOTE_MCP_AUTH_TOKEN:-}
    volumes:
      - "./data:/var/www/html/data:ro"
    depends_on:
      - webserver
```

Recréez les conteneurs (un simple redémarrage ne recharge pas les variables d'environnement) :

```bash
docker compose up -d --force-recreate
```

La valeur est appliquée par le script d'initialisation du conteneur à chaque démarrage ; une valeur invalide est signalée dans le journal et la valeur par défaut de l'image est conservée. `HTTP_WEB_PORT` n'est plus utilisé, et `POZNOTE_MCP_PORT` définit désormais le port d'écoute du serveur MCP. Le healthcheck du `docker-compose.yml` actuel suit `POZNOTE_LISTEN_PORT` : si le vôtre appelle encore `http://127.0.0.1/api/health`, téléchargez à nouveau le fichier ou modifiez l'URL, sinon le conteneur reste `unhealthy` ou vérifie ce qui répond d'autre sur le port `80`.

En mode host, le serveur web écoute sur toutes les interfaces de l'hôte : filtrez le port avec votre pare-feu, ou laissez-le accessible uniquement via votre reverse proxy. Dans le conteneur, nginx et PHP communiquent par un socket unix : Poznote n'occupe donc aucun autre port sur l'hôte, et plusieurs instances peuvent tourner côte à côte sur des ports différents.

</details>

<details>
<summary><strong>"This site can't be reached"</strong></summary>
 <br>

Si votre navigateur affiche « This site can't be reached », SELinux est peut-être activé. Dans ce cas, consultez les journaux du conteneur :

```bash
docker logs poznote-webserver-1
# ou avec podman
podman logs poznote-webserver-1
```

Vous y trouverez probablement :
- `chown: /var/www/html/data: Permission denied`

Cela se produit quand les volumes Docker n'ont pas le bon contexte SELinux, en particulier lors d'une installation depuis le répertoire `/root`.

**Solution :** nous recommandons vivement d'utiliser le suffixe `:Z` pour les volumes Docker et d'éviter le répertoire `/root`, afin d'assurer un bon fonctionnement sur toutes les distributions.

Modifiez votre `docker-compose.yml` pour ajouter `:Z` aux définitions de volumes :

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Vous pouvez aussi installer Poznote dans un répertoire situé en dehors de `/root`, comme `/opt/poznote` ou `~/poznote`.

</details>

<details>
<summary><strong>« Nom d’utilisateur ou mot de passe incorrect »</strong></summary>
<br>

1. Essayez de vous connecter avec « admin » ou « admin_change_me » et votre mot de passe.
2. Les mots de passe se gèrent depuis l'interface de Poznote, pas via `.env`. Tant qu'un mot de passe n'a pas été changé dans l'interface, les valeurs par défaut intégrées s'appliquent : `admin` pour les administrateurs, `user` pour les utilisateurs standard.
3. Si vous pouvez vous connecter en tant qu'administrateur mais pas en tant qu'utilisateur standard, vérifiez que le profil est marqué comme **Actif** dans le panneau **Gestion des utilisateurs**.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>L'application ne répond plus sous la charge (erreurs d'enregistrement automatique, "server reached pm.max_children")</strong></summary>
<br>

Les requêtes PHP sont servies par un pool fixe de workers php-fpm, 10 par défaut. Les requêtes courtes (enregistrement automatique, interrogations périodiques, chargements de page) ne le remplissent jamais. Les longues, si : une réponse du chat IA en cours de streaming, un appel S3, une synchronisation Git, un gros envoi de fichier. Dès que tous les workers sont occupés, toutes les autres requêtes attendent, le navigateur affiche une erreur réseau à l'enregistrement, et le journal du conteneur indique :

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

Agrandissez le pool sur une instance chargée (plusieurs utilisateurs, chat IA, S3 ou synchronisation Git en service) avec la variable `POZNOTE_PHP_FPM_MAX_CHILDREN` dans `.env`, puis recréez le conteneur (un simple redémarrage ne recharge pas les variables d'environnement) :

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Chaque worker occupé consomme environ 25 à 30 Mo de mémoire, et les workers inactifs restent peu nombreux quelle que soit la valeur : 20 ne pose pas de problème sur un hôte de 1 Go, et 10 convient à un hôte de 512 Mo. La valeur est appliquée par le script d'initialisation du conteneur à chaque démarrage ; une valeur invalide est signalée dans le journal et la valeur par défaut de l'image est conservée.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>Une requête échoue avec "Allowed memory size exhausted"</strong></summary>
<br>

Chaque requête PHP peut utiliser jusqu'à 512 Mo par défaut. C'est un plafond, pas une réservation (un worker inactif pèse environ 25 Mo), et son rôle est de faire échouer une requête incontrôlée avec une ligne lisible dans le journal PHP, plutôt que de faire tomber l'hôte :

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Les sauvegardes, restaurations, exports et téléchargements sont écrits en flux sur le disque et n'ont besoin que de quelques Mo, quelle que soit la taille du compte : cela ne devrait donc arriver qu'avec une seule note de plusieurs dizaines de Mo. Une sauvegarde ou un téléchargement qui atteint ce plafond est un bug, merci de le signaler avec la ligne du journal.

Pour relever la limite, définissez `POZNOTE_PHP_MEMORY_LIMIT` dans `.env` (un nombre entier de Mo), puis recréez le conteneur (un simple redémarrage ne recharge pas les variables d'environnement) :

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

Ne la réglez jamais au-dessus de la mémoire de l'hôte : une requête qui dépasse ce dont dispose la machine est tuée par le noyau sans aucun message, et peut entraîner tout le conteneur avec elle. Sur un hôte de 512 Mo, gardez la valeur par défaut. La valeur est appliquée par le script d'initialisation du conteneur à chaque démarrage ; une valeur invalide est signalée dans le journal et la valeur par défaut de l'image est conservée.

</details>
