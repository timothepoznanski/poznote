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
2. Check if the user's role (Admin vs User) matches the password you are using from the `.env` file.
3. Ensure no extra spaces were added when editing the `.env` variables.
4. If you can log in as an administrator (admin) but not as a standard user, check if the profile is marked as **active** in the User Management panel.

</details>
