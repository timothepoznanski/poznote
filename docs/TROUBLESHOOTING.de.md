<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Fehlerbehebung bei der Installation

<details>
<summary><strong>„mkdir()-Warnungen (permission denied) oder Connection failed“</strong></summary>
<br>

Wenn Fehler wie diese auftreten:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- Der Ordner `database` wird mit `root:root` statt mit `www-data:www-data` angelegt

Dies ist ein bekanntes Problem mit Docker-Volume-Mounts in bestimmten Umgebungen (Komodo, Portainer usw.). In manchen Konfigurationen kann der Container die Berechtigungen gemounteter Volumes nicht ändern.

**Lösung:** Setzen Sie vor dem Start des Containers die richtigen Berechtigungen auf Ihrem Host-Rechner:

```bash
# In Ihr Poznote-Verzeichnis wechseln
cd poznote

# Die Struktur des Datenverzeichnisses mit den richtigen Berechtigungen anlegen
mkdir -p data/database

# Eigentümer auf UID 82 setzen (www-data in Alpine Linux)
sudo chown -R 82:82 data

# Den Container starten
docker compose up -d
```

</details>

<details>
<summary><strong>„Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database“</strong></summary>
<br>

Stoppen Sie zunächst den Container, starten Sie ihn neu und warten Sie, bis die Datenbank initialisiert ist (laden Sie die Seite neu).

Hat das nicht geholfen, stoppen Sie den Container und korrigieren Sie den Eigentümer des Ordners `data` (passen Sie UID/GID an Ihre Umgebung an, das Beispiel verwendet 1000:1000):

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Hinweis:** UID 82 entspricht dem Benutzer `www-data` in Alpine Linux, das vom Poznote-Docker-Image verwendet wird.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Rootless-Betrieb (docker-compose.rootless.yml)</strong></summary>
<br>

Poznote bietet außerdem eine Rootless-Variante des Images, die vollständig als unprivilegierter Benutzer (uid/gid `1000`, Benutzername `poznote`) statt als root läuft, für Umgebungen, die root in Containern verbieten (Kubernetes mit restriktivem `PodSecurityStandard`, rootless Podman, `docker run --user` usw.).

Anders als beim Standard-Image steht dieser Variante beim Start kein root-Prozess zur Verfügung, um den Eigentümer eines nicht passenden Host-Bind-Mounts zu korrigieren. Daher **muss `./data` vor dem ersten Start uid/gid 1000 gehören**:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Wird dieser Schritt ausgelassen, beendet sich der Container beim Start sofort mit einer Fehlermeldung, die genau erklärt, was auszuführen ist.

Beachten Sie, dass `sudo` für diesen Schritt oft nicht nötig ist:

- Hat Ihr Host-Benutzer bereits uid `1000` (der erste angelegte Benutzer auf den meisten Linux-Distributionen), legt `mkdir -p data` das Verzeichnis mit dem richtigen Eigentümer an, und `chown` kann komplett entfallen.
- Mit rootless Podman oder rootless Docker führen Sie chown stattdessen im User-Namespace aus, ganz ohne root-Rechte:

```bash
# rootless Podman
podman unshare chown -R 1000:1000 data
# rootless Docker
rootlesskit chown -R 1000:1000 data
```

Für eine Neuinstallation folgen Sie der [Rootless-Installationsmethode](README.de.md#rootless) in der README. Um eine bestehende Poznote-Instanz zu migrieren, stoppen Sie sie, sichern Sie Ihr Datenverzeichnis und ändern Sie dessen Eigentümer, und starten Sie dann die Rootless-Variante:

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

Der Rootless-Webserver lauscht intern auf Port `8080` statt `80` (nur unprivilegierte Ports); `HTTP_WEB_PORT` aus Ihrer `.env` steuert weiterhin unverändert den Port auf der Host-Seite.

Um das Rootless-Image aus dem Quellcode zu bauen, statt es herunterzuladen, ersetzen Sie die Zeile `image:` in `docker-compose.rootless.yml` durch `build: { context: ., target: rootless }` (dafür ist dann ein Klon dieses Repositorys erforderlich).

</details>

<details>
<summary><strong>„This site can't be reached“</strong></summary>
 <br>

Wenn Ihr Browser „This site can't be reached“ anzeigt, ist möglicherweise SELinux aktiviert. Prüfen Sie in diesem Fall die Container-Logs:

```bash
docker logs poznote-webserver-1
# oder mit podman
podman logs poznote-webserver-1
```

Wahrscheinlich finden Sie:
- `chown: /var/www/html/data: Permission denied`

Das passiert, wenn Docker-Volumes nicht den richtigen SELinux-Kontext haben, insbesondere bei einer Installation aus dem Verzeichnis `/root`.

**Lösung:** Wir empfehlen dringend, das Suffix `:Z` für Docker-Volumes zu verwenden und das Verzeichnis `/root` zu meiden, damit alles auf allen Distributionen korrekt funktioniert.

Bearbeiten Sie Ihre `docker-compose.yml` und fügen Sie den Volume-Definitionen `:Z` hinzu:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Alternativ installieren Sie Poznote in einem Verzeichnis außerhalb von `/root`, etwa `/opt/poznote` oder `~/poznote`.

</details>

<details>
<summary><strong>„Falscher Benutzername oder Passwort“</strong></summary>
<br>

1. Versuchen Sie, sich mit „admin“ oder „admin_change_me“ und Ihrem Passwort anzumelden.
2. Passwörter werden über die Poznote-Oberfläche verwaltet, nicht über `.env`. Solange ein Passwort nicht in der Oberfläche geändert wurde, gelten die eingebauten Standardwerte: `admin` für Administratoren, `user` für Standardbenutzer.
3. Wenn Sie sich als Administrator anmelden können, aber nicht als Standardbenutzer, prüfen Sie in der **Benutzerverwaltung**, ob das Profil als **Aktiv** markiert ist.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>Die App reagiert unter Last nicht mehr (Fehler beim automatischen Speichern, „server reached pm.max_children“)</strong></summary>
<br>

PHP-Anfragen werden von einem festen Pool aus php-fpm-Workern bedient, standardmäßig 10. Kurze Anfragen (automatisches Speichern, Abfragen, Seitenaufrufe) füllen ihn nie. Lange Anfragen schon: eine gestreamte Antwort des KI-Chats, ein S3-Aufruf, eine Git-Synchronisierung, ein großer Upload. Sobald alle Worker belegt sind, wartet jede weitere Anfrage, der Browser zeigt beim Speichern einen Netzwerkfehler, und im Container-Log steht:

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

Vergrößern Sie den Pool auf einer stark genutzten Instanz (mehrere Benutzer, KI-Chat, S3 oder Git-Synchronisierung im Einsatz) mit der Variable `POZNOTE_PHP_FPM_MAX_CHILDREN` in `.env` und erstellen Sie den Container dann neu (ein Neustart lädt Umgebungsvariablen nicht neu):

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Jeder beschäftigte Worker belegt etwa 25-30 MB Speicher, und untätige Worker gibt es unabhängig vom Wert nur wenige. 20 ist daher auf einem Host mit 1 GB sicher, und 10 passt auf einen Host mit 512 MB. Der Wert wird bei jedem Start vom Init-Skript des Containers angewendet; ein ungültiger Wert wird im Log gemeldet, und der Standardwert des Images bleibt erhalten.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>Eine Anfrage schlägt mit „Allowed memory size exhausted“ fehl</strong></summary>
<br>

Jede PHP-Anfrage darf standardmäßig bis zu 512 MB verwenden. Das ist eine Obergrenze, keine Reservierung (ein untätiger Worker belegt etwa 25 MB), und sie soll dafür sorgen, dass eine außer Kontrolle geratene Anfrage mit einer verständlichen Zeile im PHP-Log fehlschlägt, statt den Host lahmzulegen:

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Backups, Wiederherstellungen, Exporte und Downloads werden auf die Festplatte gestreamt und brauchen unabhängig von der Größe des Kontos nur wenige MB. Das sollte also nur bei einer einzelnen Notiz von mehreren Dutzend MB passieren. Stößt ein Backup oder ein Download an diese Grenze, ist das ein Fehler; bitte melden Sie ihn zusammen mit der Log-Zeile.

Um das Limit zu erhöhen, setzen Sie `POZNOTE_PHP_MEMORY_LIMIT` in `.env` (eine ganze Zahl in MB) und erstellen Sie den Container dann neu (ein Neustart lädt Umgebungsvariablen nicht neu):

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

Setzen Sie ihn nie höher als den Arbeitsspeicher des Hosts: Eine Anfrage, die über das hinausgeht, was der Rechner hat, wird vom Kernel ohne jede Meldung beendet und kann den ganzen Container mit sich reißen. Auf einem Host mit 512 MB behalten Sie den Standardwert bei. Der Wert wird bei jedem Start vom Init-Skript des Containers angewendet; ein ungültiger Wert wird im Log gemeldet, und der Standardwert des Images bleibt erhalten.

</details>
