<!-- lang-selector -->
<p align="center">
  <b>English</b> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Troubleshooting Installation

<details>
<summary><strong>"mkdir() warnings (permission denied) or Connection failed"</strong></summary>
<br>

If you encounter errors like:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- The `database` folder is created with `root:root` instead of `www-data:www-data`

This is a known issue with Docker volume mounts in certain environments (Komodo, Portainer, etc.). The container cannot change permissions on mounted volumes in some configurations.

**Solution:** Before starting the container, set the correct permissions on your host machine:

```bash
# Navigate to your Poznote directory
cd poznote

# Create the data directory structure with correct permissions
mkdir -p data/database

# Set ownership to UID 82 (www-data in Alpine Linux)
sudo chown -R 82:82 data

# Start the container
docker compose up -d
```

</details>

<details>
<summary><strong>"Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database"</strong></summary>
<br>

First, try to stop and restart the container and wait for the database to be initialized (refresh the page).

If that didn't work, stop the container and fix ownership for the `data` folder (adapt UID/GID to your setup, example uses 1000:1000):

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Note:** UID 82 corresponds to the `www-data` user in Alpine Linux, which is used by the Poznote Docker image.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Running rootless (docker-compose.rootless.yml)</strong></summary>
<br>

Poznote also ships a rootless image variant that runs entirely as an unprivileged user (uid/gid `1000`, username `poznote`) instead of root, for environments that forbid root inside containers (Kubernetes restricted `PodSecurityStandard`, rootless Podman, `docker run --user`, etc).

Unlike the default image, this variant has no root process available at startup to fix ownership of a mismatched host bind mount, so `./data` **must be owned by uid/gid 1000 before the first start**:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

If this step is skipped, the container exits immediately at startup with an error explaining exactly what to run.

Note that `sudo` is often not needed for this step:

- If your host user already has uid `1000` (the first user created on most Linux distributions), `mkdir -p data` creates the directory with the right ownership and the `chown` can be skipped entirely.
- With rootless Podman or rootless Docker, run the chown inside the user namespace instead, without any root privileges:

```bash
# rootless Podman
podman unshare chown -R 1000:1000 data
# rootless Docker
rootlesskit chown -R 1000:1000 data
```

For a fresh install, follow the [Rootless install method](../README.md#rootless) in the README. To migrate an existing Poznote instance, stop it, back up and re-own your data directory, then start the rootless variant:

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

The rootless webserver listens internally on port `8080` instead of `80` (unprivileged ports only); `HTTP_WEB_PORT` from your `.env` still controls the host-side port, unchanged.

To build the rootless image from source instead of pulling it, replace the `image:` line in `docker-compose.rootless.yml` with `build: { context: ., target: rootless }` (a clone of this repository is then required).

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>Running with <code>network_mode: host</code></strong></summary>
<br>

By default Docker maps a host port onto the container: the web server listens on port `80` inside the container (`8080` for the rootless image), and `HTTP_WEB_PORT` picks the port on the host. With `network_mode: host` there is no mapping. The container binds the host's ports directly, where port `80` usually already belongs to another web server or container.

Set the port the web server listens on with `POZNOTE_LISTEN_PORT` in `.env` (with the rootless image, a port above 1023):

```bash
POZNOTE_LISTEN_PORT=8040
```

Then in `docker-compose.yml` (or `docker-compose.rootless.yml`), replace the `ports:` section of both services with `network_mode: host`. The MCP server needs two more changes: it can no longer reach the web server by its service name, and its image listens on every interface, which in host mode means every interface of the host. Point it at the new port and bind it to localhost:

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

Recreate the containers (a restart does not reload environment variables):

```bash
docker compose up -d --force-recreate
```

The value is applied by the container's init script on every start; an invalid value is reported in the log and the image default kept. `HTTP_WEB_PORT` is no longer used, and `POZNOTE_MCP_PORT` now sets the port the MCP server listens on. The health check of the current `docker-compose.yml` follows `POZNOTE_LISTEN_PORT`: if yours still calls `http://127.0.0.1/api/health`, download the file again or change the URL, otherwise the container stays `unhealthy` or checks whatever else answers on port `80`.

In host mode the web server listens on every interface of the host: filter the port with your firewall, or keep it reachable only through your reverse proxy. Inside the container, nginx and PHP talk over a unix socket, so Poznote takes no other port on the host and several instances can run side by side on different ports.

</details>

<details>
<summary><strong>"This site can't be reached"</strong></summary>
 <br>

If you see "This site can't be reached" in your browser, you may have SELinux enabled. In this case, check the container logs:

```bash
docker logs poznote-webserver-1
# or with podman
podman logs poznote-webserver-1
```

You'll likely find:
- `chown: /var/www/html/data: Permission denied`

This occurs when Docker volumes don't have the correct SELinux context, especially when installing from `/root` directory.

**Solution:** We strongly recommend using the `:Z` suffix for Docker volumes and avoiding the `/root` directory to ensure proper functioning on all distributions.

Edit your `docker-compose.yml` to add `:Z` to volume definitions:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Alternatively, install Poznote in a directory outside of `/root`, such as `/opt/poznote` or `~/poznote`.

</details>

<details>
<summary><strong>"Incorrect username or password"</strong></summary>
<br>

1. Try to log with "admin" or "admin_change_me" and your password.
2. Passwords are managed through the Poznote interface, not through `.env`. Until a password is changed in the UI, the built-in defaults apply: `admin` for administrators, `user` for standard users.
3. If you can log in as an administrator but not as a standard user, check if the profile is marked as **active** in the User Management panel.

</details>

<details>
<summary><strong>Lost administrator password</strong></summary>
<br>

If another administrator can still sign in, they can set a new password for you from **Settings > Admin Tools > User Management**. Otherwise, reset it directly in the master database. From your Poznote directory, on the host (the `sqlite3` command-line tool must be installed there, it is not part of the Poznote image):

```bash
sudo sqlite3 data/master.db "UPDATE users SET password_hash=NULL, password_login_disabled=0 WHERE id=1;"
```

This clears the stored password of the first account (id 1, always an administrator), so the built-in default applies again: sign in with that account's username and the password `admin`, then change it right away in **Settings > Change Password**. To reset another account, replace `WHERE id=1` with `WHERE username='its_username'`; a standard user falls back to the password `user`.

If two-factor authentication is on for that account, the login form still asks for a code after the password. See the next entry if the device is lost too.

</details>

<a id="two-factor-lockout"></a>
<details>
<summary><strong>Locked out by two-factor authentication (device and recovery codes lost)</strong></summary>
<br>

Each recovery code handed over when two-factor authentication was turned on signs you in once: on the code screen, choose **Use a recovery code**. Without any of them, an administrator can turn two-factor off for you from **Settings > Admin Tools > User Management**, in the password dialog of your account.

If you are the only administrator, remove the second factor directly in the master database. From your Poznote directory, on the host (the `sqlite3` command-line tool must be installed there):

```bash
sudo sqlite3 data/master.db "DELETE FROM user_totp_recovery_codes WHERE user_id=1; DELETE FROM user_totp WHERE user_id=1;"
```

Replace `1` with the id of the account (`sudo sqlite3 data/master.db "SELECT id, username FROM users;"` lists them). The password alone signs you in again, remember-me cookies issued for that account stop working, and two-factor authentication can be set up again from **Settings > Two-factor authentication**.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>The app stops answering under load (autosave errors, "server reached pm.max_children")</strong></summary>
<br>

PHP requests are served by a fixed pool of php-fpm workers, 10 by default. Short requests (autosave, polls, page loads) never fill it. Long ones do: an AI chat answer being streamed, an S3 call, a git sync, a large upload. Once every worker is busy, every other request waits, the browser shows a network error on save, and the container log reads:

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

Raise the pool on a busy instance (several users, AI chat, S3 or git sync in use) with the `POZNOTE_PHP_FPM_MAX_CHILDREN` variable in `.env`, then recreate the container (a restart does not reload environment variables):

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Each busy worker costs about 25-30 MB of memory, and idle workers are few whatever the value, so 20 is safe on a host with 1 GB and 10 fits a 512 MB host. The value is applied by the container's init script on every start; an invalid value is reported in the log and the image default kept.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>A request fails with "Allowed memory size exhausted"</strong></summary>
<br>

Each PHP request may use up to 512 MB by default. That is a ceiling, not a reservation (an idle worker weighs about 25 MB), and its job is to make a runaway request fail with a readable line in the PHP log instead of taking the host down:

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Backups, restores, exports and downloads stream to disk and need a few MB whatever the size of the account, so this should only happen with a single note of tens of MB. A backup or a download that hits it is a bug, please report it with the log line.

To raise the limit, set `POZNOTE_PHP_MEMORY_LIMIT` in `.env` (a whole number of MB), then recreate the container (a restart does not reload environment variables):

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

Never set it above the memory of the host: a request that goes past what the machine has is killed by the kernel without any message, and can take the whole container with it. On a 512 MB host, keep the default. The value is applied by the container's init script on every start; an invalid value is reported in the log and the image default kept.

</details>
