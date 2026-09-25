<!-- lang-selector -->
<p align="center">
  <a href="../README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <b>Deutsch</b> ·
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
Leistungsstarke Notizen ohne Aufwand.
</h2>

<h3 align="center">
Eine kostenlose, selbst gehostete Open-Source-Alternative zu Notion, Obsidian, Evernote oder OneNote.
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

### Funktionen

Alle Funktionen finden Sie [hier](https://poznote.com/#features).

### Screenshots

Alle Screenshots sehen Sie [hier](https://poznote.com/screenshots.html).

### Demo

https://demo.poznote.com

**Benutzername**: poznote<br>
**Passwort**: poznote

### Poznote in den Medien

https://poznote.com/press.html

### Discord

Treten Sie der Community bei, um Fragen zu stellen, Feedback zu geben oder die Entwicklung zu verfolgen:

https://discord.gg/AWhWWSEkJ

## Inhaltsverzeichnis

- [Installation](#installation)
- [Zugriff](#zugriff)
- [Einstellungen ändern](#einstellungen-ändern)
- [Anwendung aktualisieren](#anwendung-aktualisieren)
- [Authentifizierung](#authentifizierung)
- [App-Passwörter](#app-passwörter)
- [Notiztypen](#notiztypen)
- [Schnappschüsse](#schnappschüsse)
- [Personalisierung](#personalisierung)
- [Mehrbenutzerbetrieb](#mehrbenutzerbetrieb)
- [Aktivitätsprotokoll](#aktivitätsprotokoll)
- [Webhooks](#webhooks)
- [Git-Synchronisierung](#git-synchronisierung)
- [S3-Speicher für Anhänge](#s3-speicher-für-anhänge)
- [S3-Sicherungen](#s3-sicherungen)
- [Sicherung / Export](#sicherung--export)
- [Wiederherstellen / Importieren](#wiederherstellen--importieren)
- [Offline](#offline)
- [Mehrere Instanzen](#mehrere-instanzen)
- [KI-Assistent](#ki-assistent)
- [Transkription (Sprache zu Text)](#transkription-sprache-zu-text)
- [MCP-Server](#mcp-server)
- [Chrome-Erweiterung](#chrome-erweiterung)
- [Unter Android an Poznote teilen](#unter-android-an-poznote-teilen)
- [API-Dokumentation](#api-dokumentation)
- [Technologie-Stack](#technologie-stack)

## Installation

> Das offizielle Image ist Multi-Arch (linux/amd64, linux/arm64) und unterstützt Windows/macOS über Docker Desktop sowie ARM64-Geräte wie Raspberry Pi, NAS-Systeme usw.

Wählen Sie unten Ihre bevorzugte Installationsmethode:

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Schritt 1: Voraussetzung

Installieren und starten Sie [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Schritt 2: Poznote bereitstellen

Erstellen Sie ein neues Verzeichnis:

```powershell
mkdir poznote
```

Wechseln Sie in das Poznote-Verzeichnis:
```powershell
cd poznote
```

Erstellen Sie die Umgebungsdatei:

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Bearbeiten Sie die Datei `.env`:

```powershell
notepad .env
```

Laden Sie die Docker-Compose-Konfigurationsdatei herunter:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Laden Sie die neuesten Images für den Poznote-Webserver und Poznote MCP herunter:
```powershell
docker compose pull
```

Starten Sie die Poznote-Container:
```powershell
docker compose up -d
```

</details>

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### Schritt 1: Voraussetzung

1. Installieren Sie die [Docker Engine](https://docs.docker.com/engine/install/)
2. Installieren Sie [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Schritt 2: Poznote installieren

Erstellen Sie ein neues Verzeichnis:
```bash
mkdir poznote
```

Wechseln Sie in das Poznote-Verzeichnis:
```bash
cd poznote
```

Erstellen Sie die Umgebungsdatei:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Bearbeiten Sie die Datei `.env`:
```bash
vi .env
```

Laden Sie die Docker-Compose-Konfigurationsdatei herunter:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Laden Sie die neuesten Images für den Poznote-Webserver und Poznote MCP herunter:
```bash
docker compose pull
```

Starten Sie die Poznote-Container:
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Schritt 1: Voraussetzung

Installieren und starten Sie [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### Schritt 2: Poznote bereitstellen

Erstellen Sie ein neues Verzeichnis:
```bash
mkdir poznote
```

Wechseln Sie in das Poznote-Verzeichnis:
```bash
cd poznote
```

Laden Sie die Umgebungsdatei herunter:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Bearbeiten Sie die Datei `.env`:
```bash
vi .env
```

Laden Sie die Docker-Compose-Konfigurationsdatei herunter:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Laden Sie die neuesten Images für den Poznote-Webserver und Poznote MCP herunter:
```bash
docker compose pull
```

Starten Sie die Poznote-Container:
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Cloud</strong></summary><br>

Sie möchten keinen Server verwalten? Ein Hosting-Anbieter kann Poznote für Sie betreiben und online halten. Die verfügbaren Anbieter und wie Sie zwischen ihnen wählen, finden Sie [hier](https://poznote.com/hosting.html).

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

Auf einem Proxmox-VE-Host installiert das Projekt Proxmox VE Community Scripts Poznote mit einem einzigen Befehl in einem eigenen Container, ganz ohne Docker: Es erstellt einen unprivilegierten Debian-13-LXC (standardmäßig 1 vCPU, 512 MB RAM und 4 GB Festplatte) und stellt Poznote darin über nginx und PHP bereit.

Führen Sie dies in der Shell des Proxmox-Hosts aus:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

Poznote ist dann unter `http://<container-ip>:8040` erreichbar, mit denselben Standard-Zugangsdaten wie bei jeder anderen Installation. Um später zu aktualisieren, führen Sie `update` in der Konsole des Containers aus.

Dieses Skript wird von der Community geschrieben und gepflegt, nicht von Poznote. Optionen und Hinweise finden Sie auf der [Seite des Poznote-Skripts](https://community-scripts.org/scripts/poznote).

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ Kubernetes mit Helm</strong></summary>

#### Schritt 1: Voraussetzung

Installieren Sie [Helm](https://helm.sh/docs/intro/install/) und stellen Sie sicher, dass Ihr Kubernetes-Kontext auf den Cluster zeigt, in dem Sie Poznote bereitstellen möchten.

#### Schritt 2: Poznote bereitstellen

Fügen Sie das HelmForge-Chart-Repository hinzu:

```bash
helm repo add helmforge https://repo.helmforge.dev
```

Aktualisieren Sie Ihren lokalen Chart-Index:

```bash
helm repo update
```

Installieren Sie Poznote:

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

Das Poznote-Helm-Chart wird von der HelmForge-Community als Kubernetes-native Installationsoption gepflegt. Werte, Persistenz, Service-Freigabe, Probes, Security Contexts und weitere produktionsrelevante Einstellungen sind in der [Dokumentation des HelmForge-Charts für Poznote](https://helmforge.dev/docs/charts/poznote) beschrieben.

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

Poznote liefert außerdem eine Rootless-Variante des Images, die vollständig als unprivilegierter Benutzer (uid/gid `1000`) statt als root läuft. Sie ist für Umgebungen gedacht, die root in Containern verbieten (Kubernetes mit restriktivem `PodSecurityStandard`, rootless Podman, `docker run --user` usw.). Sie funktioniert genau wie das Standard-Image, mit nur zwei Unterschieden: Sie lauscht intern auf Port `8080` und kann die Eigentümerschaft Ihres Datenverzeichnisses beim Start nicht selbst korrigieren.

#### Schritt 1: Voraussetzung

1. Installieren Sie die [Docker Engine](https://docs.docker.com/engine/install/)
2. Installieren Sie [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Schritt 2: Poznote bereitstellen

Erstellen Sie ein neues Verzeichnis:
```bash
mkdir poznote
```

Wechseln Sie in das Poznote-Verzeichnis:
```bash
cd poznote
```

Erstellen Sie das Datenverzeichnis und übertragen Sie die Eigentümerschaft an uid/gid `1000` (**erforderlich**: Anders als das Standard-Image kann der Rootless-Container diese Eigentümerschaft beim Start nicht selbst korrigieren):
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

`sudo` ist hier oft nicht nötig: Wenn Ihr Benutzer bereits die uid `1000` hat, können Sie `chown` überspringen, und unter rootless Podman/Docker funktioniert es auch ohne root, siehe [Rootless-Betrieb](TROUBLESHOOTING.de.md#running-rootless).

Erstellen Sie die Umgebungsdatei:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Bearbeiten Sie die Datei `.env`:
```bash
vi .env
```

Laden Sie die Rootless-Docker-Compose-Konfigurationsdatei herunter:
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

Laden Sie die neuesten Rootless-Images für den Poznote-Webserver und Poznote MCP herunter:
```bash
docker compose -f docker-compose.rootless.yml pull
```

Starten Sie die Poznote-Container:
```bash
docker compose -f docker-compose.rootless.yml up -d
```

Wie Sie eine bestehende Poznote-Instanz auf die Rootless-Variante umstellen und weitere Details finden Sie unter [Rootless-Betrieb](TROUBLESHOOTING.de.md#running-rootless) im Leitfaden zur Fehlerbehebung.

</details>

<br>

> Falls bei der Installation Probleme auftreten, lesen Sie den [Leitfaden zur Fehlerbehebung](TROUBLESHOOTING.de.md).

## Zugriff

Rufen Sie Poznote nach der Installation in Ihrem Webbrowser auf:

[http://localhost:8040](http://localhost:8040)


- Benutzername: `admin_change_me`
- Passwort: `admin`
- Port: `8040`

Benennen Sie das Standard-Administratorkonto um und ändern Sie das Standardpasswort nach der ersten Anmeldung.

## Einstellungen ändern

Die meisten alltäglichen Einstellungen ändern Sie in der Poznote-Oberfläche. Die Datei `.env` ist nur für Bereitstellungs- und Laufzeitwerte gedacht, die beim Start der Container gelesen werden.

<details>
<summary><strong>Verwenden Sie die Datei <code>.env</code> für</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- Optionale Laufzeit-Überschreibungen wie `POZNOTE_MCP_PORT` und `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN`, um auf einer stark ausgelasteten Instanz die Anzahl gleichzeitiger PHP-Anfragen zu ändern (Standard 10), siehe [Leitfaden zur Fehlerbehebung](TROUBLESHOOTING.de.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT`, um das PHP-Speicherlimit pro Anfrage in MB zu ändern (Standard 512), siehe [Leitfaden zur Fehlerbehebung](TROUBLESHOOTING.de.md#a-request-runs-out-of-memory)
- `POZNOTE_LISTEN_PORT`, um den Port zu ändern, auf dem der Webserver im Container lauscht (Standard 80), nur mit `network_mode: host` nötig, siehe [Leitfaden zur Fehlerbehebung](TROUBLESHOOTING.de.md#running-with-host-network)
- `POZNOTE_SETTINGS_PASSWORD`, um vor dem Öffnen der Einstellungsseite ein zusätzliches Passwort abzufragen, standardmäßig leer
- `POZNOTE_MCP_AUTH_TOKEN`, um von MCP-Clients ein Bearer-Token zu verlangen, siehe [MCP-Server](#mcp-server)

</details>

<details>
<summary><strong>Verwenden Sie die Oberfläche für</strong></summary>
<br>

- Administrative und globale Einstellungen wie OIDC-Anbietereinstellungen, Aktivierung der Git-Synchronisierung, Importlimits und das Hochladen von benutzerdefiniertem CSS
- Benutzer- und Profileinstellungen wie Passwörter lokaler Konten, Design, Schriftgrößen, Sortierung der Notizen, Hintergrund des Arbeitsbereichs und ausgeblendete Oberflächenelemente

</details>


### Systemeinstellungen ändern (`.env`)

Wechseln Sie in Ihr Poznote-Verzeichnis:
```bash
cd poznote
```

Stoppen Sie die laufenden Poznote-Container:
```bash
docker compose down
```

Bearbeiten Sie Ihre Datei `.env` mit einem Texteditor Ihrer Wahl (z. B. `nano .env` oder `notepad .env`).

Speichern Sie die Datei und starten Sie die Container erneut, um die Änderungen zu übernehmen:
```bash
docker compose up -d
```

## Anwendung aktualisieren

Wechseln Sie in Ihr Poznote-Verzeichnis:
```bash
cd poznote
```

Stoppen Sie die laufenden Container vor der Aktualisierung:
```bash
docker compose down
```

Laden Sie die neueste Docker-Compose-Konfiguration herunter:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Laden Sie die neueste `.env.template` herunter:
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Vergleichen Sie `.env.template` mit sdiff und ergänzen Sie bei Bedarf neue Variablen in Ihrer Datei `.env`:
```bash
sdiff .env .env.template
```

Laden Sie die neuesten Images für den Poznote-Webserver und Poznote MCP herunter:
```bash
docker compose pull
```

Starten Sie die aktualisierten Container:
```bash
docker compose up -d
```

Ihre Daten bleiben im Verzeichnis `./data` erhalten und sind von der Aktualisierung nicht betroffen.

### Beta-Versionen

Beta-Versionen bringen neue Funktionen, bevor sie als stabile Version erscheinen, und sind auf der [Release-Seite](https://github.com/timothepoznanski/poznote/releases) als Vorabversionen aufgeführt. Sie werden unter dem Tag `latest-and-beta` veröffentlicht, das immer auf die neueste Version zeigt, ob Beta oder stabil.

Um sie zu verwenden, ändern Sie die beiden `image`-Zeilen Ihrer `docker-compose.yml` und lassen den Rest der Datei unverändert:
```yaml
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest-and-beta
    ...
  mcp-server:
    image: ghcr.io/timothepoznanski/poznote-mcp:latest-and-beta
    ...
```

Bei der [Rootless](#rootless)-Variante wird das Webserver-Image in `docker-compose.rootless.yml` zu `poznote:latest-and-beta-rootless`, das MCP-Image bleibt dasselbe: `poznote-mcp:latest-and-beta`.

Laden Sie die Images herunter und starten Sie die Container neu:
```bash
docker compose pull
docker compose up -d
```

*   **Vor dem Wechsel:** Eine Beta kann noch Fehler enthalten, erstellen Sie daher zuerst ein [Backup](#sicherung--export). Probleme können in den [GitHub-Issues](https://github.com/timothepoznanski/poznote/issues) oder auf [Discord](https://discord.gg/AWhWWSEkJ) gemeldet werden.
*   **Aktualisierungen:** Jedes `docker compose pull` holt danach die neueste Beta oder, sobald sie erschienen ist, die stabile Version. Die obige Anleitung zur Aktualisierung lädt eine neue `docker-compose.yml` herunter, die wieder die stabilen Tags verwendet, ändern Sie daher die beiden `image`-Zeilen nach diesem Schritt erneut.
*   **Zurück zur stabilen Version:** Da eine Beta die Datenbank ändern kann, funktioniert die Rückkehr zu einer älteren stabilen Version möglicherweise nicht. Warten Sie auf die nächste stabile Version, die die Änderungen der Beta enthält, und folgen Sie dann der obigen Anleitung zur Aktualisierung.

## Authentifizierung

Poznote unterstützt mehrere Authentifizierungsmethoden, darunter lokale Konten und externe Identitätsanbieter. Apps und Erweiterungen, die mit der REST-API kommunizieren, verwenden [App-Passwörter](#app-passwörter), eine eigene Art von Zugangsdaten, die im nächsten Abschnitt beschrieben wird.

<details>
<summary><strong>Authentifizierung mit lokalen Konten</strong></summary>
<br>

Poznote authentifiziert Benutzer anhand ihres Profils mit einem Benutzernamen oder einer E-Mail-Adresse und einem Passwort.


#### Standardkonto

Bei einer Neuinstallation legt Poznote ein aktives Administratorprofil an:

- Benutzername: `admin_change_me`
- Passwort: `admin`

Ändern Sie das Standardpasswort und benennen Sie das Konto nach der ersten Anmeldung um.

#### Passwortverwaltung

Passwörter werden über die Poznote-Weboberfläche verwaltet, nicht über `.env`:

- Benutzer können ihr eigenes Passwort unter **Einstellungen > Passwort ändern** ändern.
- Administratoren können unter **Einstellungen > Admin-Werkzeuge > Benutzerverwaltung** für jeden Benutzer ein eigenes Passwort festlegen oder es auf den Standardwert zurücksetzen.
- Die Option **30 Tage merken** hält die Sitzung 30 Tage lang aufrecht.
- Eine Passwortänderung macht die bestehenden „Merken“-Cookies dieses Benutzers ungültig.

#### Zwei-Faktor-Authentifizierung

Jeder Benutzer kann die Zwei-Faktor-Authentifizierung (TOTP) unter **Settings > Two-factor authentication** aktivieren. Nach dem Passwort verlangt das Anmeldeformular dann einen 6-stelligen Code aus einer Authenticator-App (Aegis, Google Authenticator, 1Password, Bitwarden...).

- Die Einrichtung zeigt einen im Browser gezeichneten QR-Code und zehn einmalig verwendbare Wiederherstellungscodes, die für den Fall eines verlorenen Telefons aufzubewahren sind.
- Sie schützt die Anmeldung mit Passwort. Eine SSO-Anmeldung bleibt Sache des Identitätsanbieters und seines eigenen zweiten Faktors.
- Solange sie aktiv ist, akzeptiert die REST-API das Kontopasswort allein nicht mehr: Geben Sie Clients ein [App-Passwort](#app-passwörter) oder senden Sie den aktuellen Code im Header `X-Poznote-OTP`.
- Ein Administrator kann sie für einen Benutzer deaktivieren, der sowohl sein Gerät als auch seine Wiederherstellungscodes verloren hat, unter **Settings > Admin Tools > User Management** (Passwortdialog).
- Das Aktivieren oder Deaktivieren macht bestehende Remember-me-Cookies dieses Benutzers ungültig.

#### Standardpasswörter

- Administratorkonten: `admin`
- Standardbenutzerkonten: `user`

Solange ein Benutzer sein Passwort noch nicht geändert hat, gilt der oben genannte Standardwert. Sobald ein Passwort über die Oberfläche geändert wurde, wird ein sicherer bcrypt-Hash in der Datenbank gespeichert, der Vorrang hat.

</details>

<a id="oidc"></a>
<details>
<summary><strong>OIDC-/SSO-Authentifizierung (optional)</strong></summary>
<br>

Poznote unterstützt OpenID Connect (Authorization Code + PKCE) für Single Sign-on. Damit können sich Benutzer über externe Identitätsanbieter wie Auth0, Keycloak, Azure AD oder Google Identity anmelden.

#### Funktionsweise

1. Ist OIDC aktiviert, zeigt die Anmeldeseite eine Schaltfläche `Weiter mit [Anbietername]` an.
2. Benutzer authentifizieren sich über den OIDC-Authorization-Code-Flow, abgesichert durch PKCE.
3. Der Zugriff lässt sich über erlaubte Gruppen und bei Bedarf über eine ältere Liste erlaubter Benutzer einschränken.
4. Nach der Authentifizierung verknüpft Poznote die Identität in dieser Reihenfolge: `sub` (`oidc_subject`), dann `preferred_username`, dann `email`.
5. Ist das automatische Anlegen von Benutzern aktiviert und passt kein Profil, legt Poznote automatisch eines an. Ein solches Profil hat **überhaupt kein Passwort**: Es hat nie die Übergabe der initialen Zugangsdaten durchlaufen, die ein Administrator beim Anlegen eines Kontos vornimmt, und reagiert daher nicht auf das Standardpasswort. Die Anmeldung erfolgt über den Anbieter, oder ein Administrator legt unter **Einstellungen > Admin-Werkzeuge > Benutzerverwaltung** ein ausdrückliches Passwort fest.
6. Mit `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` wird das Formular für Benutzername und Passwort ausgeblendet, und die Anmeldeseite erlaubt nur noch SSO.
7. Bei aktiviertem OIDC können sich REST-API-Clients mit `Authorization: Bearer <OIDC JWT>` authentifizieren. Poznote prüft dabei die JWKS des Anbieters, den Aussteller, das Ablaufdatum, die Audience und die konfigurierten Zugriffsbeschränkungen.
8. Clients, die überhaupt keinen OIDC-Flow durchlaufen können (Browsererweiterung, mobile App, Skripte), verwenden stattdessen ein [App-Passwort](#app-passwörter), das jeder Benutzer in seinen eigenen Einstellungen erstellt.
9. Die [Zwei-Faktor-Authentifizierung](#zwei-faktor-authentifizierung) gilt nur für das Passwortformular: Eine SSO-Anmeldung fragt nie nach dem Poznote-Code. Verlangen Sie den zweiten Faktor stattdessen im Identitätsanbieter. Ein Benutzer mit Passwort und SSO-Identität behält beide Zugänge, und der Zugang über SSO ist nur so stark wie die Richtlinie des Anbieters.

#### Konfiguration

OIDC wird in der **Administrationsoberfläche** konfiguriert: Öffnen Sie **Einstellungen > Admin-Werkzeuge > OIDC / SSO**.

Die meisten Einstellungen (Aktivierung, Aussteller, Anbietername, Scopes, Zugriffskontrolle, erlaubte Gruppen/Benutzer, automatisches Anlegen von Benutzern, Verhalten von HTTP Basic Auth usw.) werden auf dieser Seite verwaltet und in der Datenbank gespeichert.

Für die Bearer-JWT-Authentifizierung an der REST-API konfigurieren Sie **JWT-Audience der API**, wenn Ihr Anbieter Access Tokens für eine eigene API-Audience ausstellt. Ist das Feld leer, akzeptiert Poznote die konfigurierte OIDC-Client-ID als JWT-Audience.

Die folgenden Einstellungen verbleiben in der Datei `.env`:

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

Verwenden Sie `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, wenn Sie das lokale Formular für Benutzername und Passwort ausblenden und nur die Anmeldung per SSO zulassen möchten. Dies ist der einzige Schalter, der die Passwort-Authentifizierung sperrt: Er entfernt das Formular, lehnt Passwort-POSTs serverseitig ab und blendet die Einstellung „Passwort ändern“ aus.

> **Wiederherstellung nach einem Ausfall des Identitätsanbieters.** Nur SSO bedeutet genau das: Solange `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` gesetzt ist, kann sich niemand mit einem Passwort anmelden, auch keine Administratoren, und es gibt keinen Notausgang im Browser. Das ist Absicht, denn so kann ein Angreifer, der ein Administratorkonto übernommen hat, die Passwort-Anmeldung nicht wieder aktivieren, um sich dauerhaften Zugang zu verschaffen. Für die Wiederherstellung ist Serverzugriff nötig: Setzen Sie `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false` in `.env`, starten Sie den Container neu und melden Sie sich mit einem lokalen Passwort an. Stellen Sie vor dem Aktivieren von Nur-SSO sicher, dass mindestens ein Administratorkonto ein ausdrücklich festgelegtes Passwort hat (**Einstellungen > Admin-Werkzeuge > Benutzerverwaltung**), sonst hilft auch das Zurücksetzen des Schalters nicht. Beachten Sie, dass ein automatisch per OIDC angelegtes Administratorprofil kein Passwort hat, solange keines festgelegt wurde.

> **Inkompatible Änderung:** Frühere OIDC-Einstellungen in `.env` werden nicht mehr gelesen, mit Ausnahme von `POZNOTE_OIDC_CLIENT_ID`, `POZNOTE_OIDC_CLIENT_SECRET` und `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`. Geben Sie die übrigen OIDC-Einstellungen nach dem Upgrade auf der Administrationsseite erneut ein.

#### Beispiel für Zugriffskontrolle (Gruppen + automatisches Anlegen)

Konfigurieren Sie auf der OIDC-Administrationsseite:
- **Groups-Claim:** `groups`
- **Erlaubte Gruppen:** `poznote`
- **Benutzerprofile bei der ersten OIDC-Anmeldung automatisch erstellen:** aktiviert

Ist das automatische Anlegen aktiviert, erzeugt Poznote einen Benutzernamen aus den OIDC-Claims (`preferred_username`, `nickname`, lokaler Teil der E-Mail-Adresse, `name`, dann `sub`) und speichert das OIDC-Subject im angelegten Profil.

</details>

## App-Passwörter

Apps können sich nicht wie ein Browser über einen Identitätsanbieter anmelden. Ein **App-Passwort** ist eine eigene Zugangsinformation, die Sie für genau einen Client erstellen (die Browsererweiterung, ein Smartphone, ein Skript) und jederzeit widerrufen können, sodass Sie nie Ihr Kontopasswort herausgeben müssen.

Erstellen Sie eines unter **Einstellungen > App-Passwörter**: Geben Sie ihm einen Namen, optional ein Ablaufdatum, und kopieren Sie das erzeugte Geheimnis. Es wird nur ein einziges Mal angezeigt. Geben Sie dann im Client Ihren üblichen Benutzernamen und dort, wo ein Passwort verlangt wird, das App-Passwort ein. Es wird als gewöhnliche HTTP Basic Auth übertragen, sodass jeder vorhandene Client unverändert funktioniert:

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

Ein App-Passwort erreicht nur die REST-API, und nur für sein eigenes Profil: Es kann weder die Weboberfläche öffnen noch einen Admin-Endpunkt aufrufen, Ihr Passwort ändern oder Ihr Konto verwalten, selbst wenn das Konto Administrator ist. Ein kompromittiertes App-Passwort legt daher die Notizen eines einzigen Kontos offen und nichts weiter, und mit dem Widerruf ist die Lücke geschlossen. Auf einer Nur-SSO-Instanz, auf der per OIDC angelegte Konten gar kein Passwort haben, ist es die einzige Zugangsinformation, die die API über Basic Auth akzeptiert.

Die vollständige Liste der Einschränkungen und die Endpunkte zur Verwaltung der App-Passwörter finden Sie in der [REST-API-Dokumentation](API-REST.md#authentication).

## Notiztypen

Poznote unterstützt zwei Hauptformate für Notizen, die jeweils auf unterschiedliche Arbeitsweisen zugeschnitten sind.

<details>
<summary><strong>Rich-Text-Notizen</strong></summary>
&nbsp;

*   **Editor:** Direkte WYSIWYG-Bearbeitung (What You See Is What You Get).
*   **Speicherung:** Als `.html`-Dateien im Datenverzeichnis des Benutzers gespeichert. Da es sich um Standard-HTML handelt, lassen sie sich direkt in jedem Webbrowser öffnen.
*   **Exklusive Funktionen:**
    *   **Umfangreiche Formatierung:** Native Unterstützung für Textfarben, Hervorhebungen und Standard-HTML-Elemente.
    *   **Interaktive Oberfläche:** Elemente lassen sich direkt im Editor bearbeiten.
</details>

<details>
<summary><strong>Markdown-Notizen</strong></summary>
&nbsp;

*   **Editor:** Editor für Markdown-Syntax mit Echtzeit-Vorschau.
*   **Speicherung:** Als `.md`-Dateien im Datenverzeichnis des Benutzers gespeichert.
*   **Exklusive Funktionen:**
    *   **Mermaid-Diagramme:** Native Unterstützung für die Erzeugung von Diagrammen (Flussdiagramme, Sequenzdiagramme usw.) über ` ```mermaid `-Codeblöcke.
    *   **Mathematische Formeln:** Zuverlässige LaTeX-Unterstützung für mathematische Formeln mit der Syntax `$ inline $` und `$$ block $$`.
    *   **Portabilität:** Standard-Markdown-Format, kompatibel mit jedem externen Editor oder Static-Site-Generator.
</details>

<details>
<summary><strong>Aufgabenlisten</strong></summary>
&nbsp;

*   **Verwendung:** Verwalten Sie Aufgaben und Projekte mit interaktiven Checklisten.
*   **Arbeitsablauf:** Verfolgen Sie den Fortschritt mit Kontrollkästchen, die sich direkt im Editor oder in der Notizliste abhaken lassen. Ein Fortschrittsbalken zeigt, wie weit jede Liste erledigt ist.
*   **Aufgabenoptionen:** Jede Aufgabe kann ein Fälligkeitsdatum mit optionaler Uhrzeit, eine Erinnerung, die zum Fälligkeitszeitpunkt ausgelöst wird, und eine Markierung als wichtig erhalten und lässt sich in eine andere Liste verschieben.
*   **Aufgaben-Seite:** Eine eigene Seite **Aufgaben**, die Sie über die linke Symbolleiste öffnen, sammelt an einem Ort alle Aufgaben Ihrer Aufgabenlisten und auf Wunsch auch die Kontrollkästchen in gewöhnlichen Notizen. Sie bietet Statusfilter (Offen, Wichtig, Überfällig, Mit Datum, Erledigt), einen Textfilter und eine Kalenderansicht der Aufgaben mit Fälligkeitsdatum.
*   **Öffentliche Zusammenarbeit:** Aufgabenlisten können über eine öffentliche URL geteilt werden. Wurden Bearbeitungsrechte vergeben, können externe Mitwirkende Einträge abhaken, ohne ein Poznote-Konto zu benötigen.
</details>

<details>
<summary><strong>Verknüpfungen</strong></summary>
&nbsp;

*   **Funktion:** Erstellt an einem anderen Ort einen Verweis auf eine bestehende Notiz.
*   **Anwendungsfall:** Eine Notiz kann so an zwei Stellen gleichzeitig referenziert werden. Beispielsweise kann eine Notiz in einem Ablageordner liegen, während ihre Verknüpfung auf einem Kanban-Board zur aktiven Nachverfolgung erscheint.
</details>

<details>
<summary><strong>Vorlagen</strong></summary>
&nbsp;

*   **Funktion:** Verwenden Sie vorformulierte Inhalte wieder, um Ihre Dokumentation zu vereinheitlichen, von der vollständigen Notiz bis zum kurzen Textbaustein.
*   **Einrichtung:** Legen Sie die Notizen, die Sie wiederverwenden möchten, in einen Ordner namens `Templates` (Unterordner sind erlaubt). Ein Arbeitsbereich namens `Templates` funktioniert ebenfalls und steht in jedem Arbeitsbereich zur Verfügung. Der Name wird auch in der Sprache der Oberfläche erkannt (`Modèles`, `Vorlagen`, `Plantillas`, `Modelos`, `Шаблоны`, `模板`).
*   **In eine Notiz einfügen:** Tippen Sie in einer Rich-Text- oder Markdown-Notiz `/template` (oder `/` gefolgt vom Titel der Vorlage) und wählen Sie eine Vorlage aus: Ihr Inhalt wird an der Cursorposition eingefügt und umgewandelt, falls Vorlage und Notiz nicht vom selben Typ sind.
*   **Neue Notiz aus einer Vorlage:** Duplizieren Sie die Vorlagennotiz, oder duplizieren Sie einen ganzen `Templates`-Ordner, um ein Projekt mit einer fertigen Ordnerstruktur zu beginnen.
</details>

<details>
<summary><strong>Tägliche Notizen (Tagebuch)</strong></summary>
&nbsp;

*   **Verwendung:** Schreiben Sie wie in einem Tagebuch eine Notiz pro Tag, über ein eigenes Tagebuch-Board.
*   **Arbeitsablauf:** Die Schaltfläche „Heutigen Eintrag erstellen“ legt die Notiz des heutigen Tages an (sobald sie existiert, heißt sie „Zum heutigen Eintrag“). Sie trägt das aktuelle Datum als Titel und wird automatisch in einer Ordnerstruktur `Diary/YYYY/MM` abgelegt.
*   **Board-Ansicht:** Einträge werden als Karten angezeigt, nach Monat gruppiert und die neuesten zuerst, mit einem Filter, um frühere Einträge schnell zu finden.
*   **Journalansicht:** Die Schriftrollen-Schaltfläche neben den Ansichtseinstellungen wechselt zu einer einzigen Lesespalte: jeder Eintrag mit seinem vollständigen Inhalt, die neuesten zuerst, nachgeladen beim Scrollen. Der Filter wirkt auch hier. Ein Klick auf einen Eintrag oder seinen Stift bearbeitet ihn direkt an Ort und Stelle; Änderungen werden beim Tippen gespeichert.
*   **Format:** Neue Einträge werden als Rich-Text- oder Markdown-Notizen angelegt, je nach der Einstellung „Format der Tagebucheinträge“ unter **Einstellungen > Verhalten**.
</details>

## Schnappschüsse

Schnappschüsse bewahren frühere Versionen des Inhalts einer Notiz auf, sodass Sie über das Menü **Schnappschüsse** der Notiz zu einem früheren Stand zurückkehren können.

<details>
<summary><strong>So funktionieren Schnappschüsse</strong></summary>
<br>

*   **Automatisch:** Beim ersten Öffnen einer Notiz an einem Tag wird ein Schnappschuss erstellt. Pro Notiz werden die 3 neuesten automatischen Schnappschüsse aufbewahrt; diese Anzahl lässt sich unter **Einstellungen > Aktionen > Schnappschüsse** ändern.
*   **Manuell:** „Jetzt Schnappschuss erstellen“ fügt jederzeit einen Schnappschuss hinzu, ebenso **Strg + Alt + S** (Cmd + Alt + S auf dem Mac) bei geöffneter Notiz. Manuelle Schnappschüsse sind unbegrenzt und zählen nicht zu dieser Anzahl.
*   **Vor einer KI-Änderung:** Unmittelbar bevor der [KI-Assistent](#ki-assistent) oder der [MCP-Server](#mcp-server) den Inhalt einer Notiz ändert, wird automatisch ein Schnappschuss erstellt, sodass sich eine misslungene Umformulierung mit einem Klick rückgängig machen lässt. Diese Schnappschüsse sind im Verlauf mit „Vor KI-Änderung“ oder „Vor MCP-Änderung“ gekennzeichnet und werden übersprungen, wenn der letzte Schnappschuss bereits denselben Inhalt enthält. Pro Notiz werden die 20 neuesten aufbewahrt, eine Anzahl, die Sie unter **Einstellungen → Schnappschüsse** ändern können (1 bis 200), falls auf Ihrer Instanz viele Notizen über KI oder MCP bearbeitet werden.
*   **Ablauf:** Jeder Schnappschuss, ob automatisch oder manuell, wird 30 Tage nach seiner Erstellung gelöscht. Ein Schnappschuss kann auch von Hand im Dialog „Schnappschüsse“ gelöscht werden.
*   **Anhänge und Bilder:** Schnappschüsse speichern nur den Text der Notiz. Anhänge werden nie kopiert, sodass eine Datei, auf die mehrere Schnappschüsse verweisen, nur einmal auf der Festplatte existiert. Eine aus einer Notiz entfernte Datei bleibt, für die Notiz unsichtbar, auf der Festplatte, solange noch ein Schnappschuss sie enthält, sodass sie beim Wiederherstellen dieses Schnappschusses zurückkehrt. Endgültig gelöscht wird sie, sobald der letzte Schnappschuss, der sie enthält, abläuft oder gelöscht wird, oder wenn die Notiz endgültig gelöscht wird. Mehr Schnappschüsse aufzubewahren dupliziert also nie Dateien. Entfernte Dateien bleiben lediglich länger erhalten, höchstens 30 Tage.

</details>

## Personalisierung

Poznote bietet direkt in der Anwendung mehrere integrierte Personalisierungsoptionen, ganz ohne Änderungen an Konfigurationsdateien.

<details>
<summary><strong>Einstellungen für Anzeige, Verhalten und Markdown</strong></summary>
<br>

Unter **Einstellungen > Anzeige** können Sie Folgendes konfigurieren:

- **App-Schriftart:** die Schrift für die gesamte Oberfläche wählen
- **Schriftgröße:** die Textgröße für Notizen, Seitenleiste, Codeblöcke und die Einstellungsseite anpassen
- **Notizfarben:** die Palette wählen, die beim Einfärben einer Notiz angeboten wird
- **Symbole nach Notiztyp:** Aufgabenlisten und Markdown-Notizen in der Notizliste ein eigenes Symbol geben
- **Skalierung der Index-Symbole:** die Größe der Symbole im Notizindex ändern
- **Reihenfolge der Icon-Seitenleiste:** die Schaltflächen der linken Symbolleiste neu anordnen und ihre Farbe ändern (ein Rechtsklick auf eine Schaltfläche der Leiste öffnet ebenfalls die Farbauswahl)
- **Breite des Notizinhalts:** die maximale Breite des Notizeditors festlegen
- **Anhangsvorschauen:** Anhänge als Vorschau in der Notiz anzeigen
- **Standard-Bildrahmen:** eingefügte Bilder ohne zusätzlichen Innenabstand einrahmen
- **Aktuellen Ordnerbaum hervorheben:** Notizen und Ordner außerhalb der Ordnerhierarchie, in der Sie gerade arbeiten, abblenden
- **Login-Seiten-Titel:** den auf der Anmeldeseite angezeigten Titel ändern
- **Sichtbarkeit von Elementen:** nicht genutzte Oberflächenelemente ausblenden, siehe unten

Unter **Einstellungen > Verhalten** können Sie Folgendes konfigurieren:

- **Notizen-Sortierreihenfolge:** festlegen, wie Notizen in der Liste sortiert werden
- **Altersfilter für Notizen:** nur Notizen auflisten, die innerhalb der gewählten Anzahl von Tagen geändert wurden
- **Schnappschüsse:** wie viele automatische Schnappschüsse pro Notiz aufbewahrt werden
- **Einfüge-Reihenfolge der Aufgaben:** festlegen, wo neue Aufgaben eingefügt werden
- **Notizen nach Ordnern anzeigen:** Notizen ohne Ordner unterhalb der Ordnerliste anzeigen
- **Codeblock-Zeilenumbruch:** den Zeilenumbruch in Codeblöcken ein- oder ausschalten
- **Format der Tagebucheinträge:** Tagebucheinträge als Rich-Text- oder Markdown-Notizen anlegen
- Sprache der Oberfläche, Zeitzone und Datumsformat, Anhänge und Backlinks am Ende einer Notiz, Rechtschreibprüfung und die Tastenkürzel

Unter **Einstellungen > Markdown** können Sie die Standardansicht, die Schriftart des Editors, Markdown mit Rahmen und farbiges Markdown sowie die Codeblock-Zeilennummern konfigurieren.

Das Design ist hier keine eigene Karte: Die Schaltfläche unten in der linken Symbolleiste schaltet der Reihe nach durch die Designs, und ein Administrator legt unter **Einstellungen > Admin-Werkzeuge > Theme-Liste** fest, welche sie anbietet.

</details>

<details>
<summary><strong>Hintergrundbild des Arbeitsbereichs</strong></summary>
<br>

Sie können für jeden Arbeitsbereich ein Hintergrundbild festlegen: Öffnen Sie die Seite **Arbeitsbereiche** und verwenden Sie die Aktion **Hintergrund** des Arbeitsbereichs, um ein Bild hochzuladen und seine Deckkraft einzustellen. So erhält jeder Arbeitsbereich sein eigenes Erscheinungsbild.

</details>

<details>
<summary><strong>Sichtbarkeit von Elementen</strong></summary>
<br>

Mit Poznote können Sie die Oberfläche entrümpeln, indem Sie Elemente ausblenden, die Sie nicht verwenden.

Konfigurieren Sie dies unter **Einstellungen > Anzeige > Sichtbarkeit von Elementen**.

- **Feine Steuerung:** Schalten Sie die Sichtbarkeit von Karten der Startseite, Aktionen der Werkzeugleiste, Einträgen des Slash-Menüs und mehr um. Auch das Abzeichen mit dem Erstellungsdatum an Notizen (**Erstellungsdatum der Notiz anzeigen**) und die Anzahl der Notizen neben jedem Ordner (**Ordner-Notizzähler anzeigen**) werden hier ein- und ausgeschaltet.
- **Pro Benutzer:** Jeder Benutzer kann seine eigene Oberflächengestaltung haben.
- **Administratoren:** Derselbe Dialog zeigt neben der eigenen Spalte „Ich“ des Administrators eine zweite Spalte „Benutzer“, um Elemente für alle Benutzer der Instanz auszublenden (Administratoren ausgenommen).
- **Durchsuchbar:** Mit dem Filter im Konfigurationsdialog finden Sie das auszublendende Element schnell.

</details>

<details>
<summary><strong>Benutzerdefinierte CSS-Anpassungen</strong></summary>
<br>

Wenn Sie Schriften, Abstände oder andere visuelle Details über die integrierten Optionen hinaus anpassen möchten, können Sie zusätzliche Stylesheets hochladen, die auf jede HTML-Seite für alle Benutzer angewendet werden.

Konfigurieren Sie sie unter **Einstellungen > Admin-Werkzeuge > Benutzerdefinierte CSS-Datei**.

Hinweise:

- Klicken Sie auf **CSS-Datei hochladen**, um eine `.css`-Datei von Ihrem Computer auszuwählen.
- Jede hochgeladene Datei bleibt erhalten, sodass Sie mehrere Designs speichern und zwischen ihnen wechseln können, ohne sie erneut hochzuladen.
- Der Dialog listet die gespeicherten Dateien auf: Wählen Sie diejenige, die für alle Benutzer gelten soll, oder **Kein eigenes CSS**, um zum integrierten Erscheinungsbild zurückzukehren, und klicken Sie dann auf **Speichern**.
- Das Hochladen einer Datei mit dem Namen einer bereits gespeicherten ersetzt dieses Design.
- Die Dateien werden in `data/css/` (Ihrem Docker-Volume) gespeichert und überstehen daher Image-Aktualisierungen.
- Klicken Sie auf das Papierkorbsymbol neben einem Design, um diese Datei aus Ihrem Volume zu löschen.
- Poznote hängt automatisch einen Cache-Busting-Parameter `v=` an.
- Das Stylesheet wird gegen Ende von `<head>` eingefügt und kann daher die Standardstile der Anwendung überschreiben.
- Nur Administratoren können eine benutzerdefinierte CSS-Datei hochladen, anwenden oder löschen.

### Die Theme-Liste

**Einstellungen > Admin-Werkzeuge > Theme-Liste** legt fest, durch welche Designs die Design-Schaltfläche unten in der Symbolleiste schaltet: ein Design pro Klick, in der angezeigten Reihenfolge.

- Haken Sie die integrierten Designs an, die Sie behalten möchten, und lassen Sie die weg, die niemand verwendet.
- Haken Sie eine gespeicherte CSS-Datei an, um sie als eigenes Design anzubieten. Sie erhält ein Palettensymbol und den Namen der Datei.
- Legen Sie mit den Pfeilen die Reihenfolge fest, in der die Schaltfläche durchschaltet.
- Ein benutzerdefiniertes Design wird über eine helle oder dunkle Basis gelegt, was die Datei selbst nicht angeben kann: Wählen Sie die Basis neben der Datei. Darauf wird `data-theme` gesetzt, ein für den Dunkelmodus geschriebenes Stylesheet braucht hier also **Dunkel**.
- Die Liste ist eine globale Einstellung, alle schalten also durch dieselben Designs; welches angewendet wird, bleibt die Wahl jedes einzelnen Benutzers.
- Wer ein Design verwendet, das Sie aus der Liste entfernen, erhält sofort das erste Design der Liste.
- Die Auswahl eines benutzerdefinierten Designs lädt diese Datei nur für diesen Benutzer, anstelle des instanzweit angewendeten Stylesheets.
- Das Löschen einer CSS-Datei entfernt sie auch aus der Liste.
- Steht nur ein einziges Design in der Liste, gibt es nichts zum Durchschalten: Die Schaltfläche öffnet dann für Administratoren diese Liste und bewirkt für alle anderen nichts.

**Bevor Sie CSS schreiben**, prüfen Sie, ob ein integriertes Design bereits das tut, was Sie möchten: Die Design-Schaltfläche unten in der Symbolleiste schaltet durch Hell, Dunkel, Schwarz, Lavendel, Sepia und Terminal.

### Beispiele

Farben, Abstände, Radien und Schriftstärken sind Design-Tokens, daher bestehen die meisten Änderungen aus einer kurzen Liste überschriebener Variablen statt aus einem Kampf mit Selektoren. Die vollständige Liste finden Sie in `src/public/css/tokens.css`.

**Akzentfarbe ändern**

```css
:root {
    --pz-accent: #d6336c;
    --pz-accent-hover: #a61e4d;
    --pz-accent-rgb: 214, 51, 108;   /* same colour, channels only, used for tints */
}
html[data-theme='dark'] {
    --pz-accent-text: #f783ac;       /* lighter, because it sits on a dark ground */
}
```

Zwei Tokens statt einem, weil eine *Füllung* und eine *Beschriftung* nicht dieselbe Farbe haben können: `--pz-accent` füllt Schaltflächen, `--pz-accent-text` ist die Akzentfarbe für Text, Symbole und Umrisse. In einem hellen Design folgt es `--pz-accent` von selbst; ein dunkler Grund braucht einen helleren Wert. Jedes Token behält in jedem Design denselben `--pz-*`-Namen, nur sein Wert ändert sich. Die `--dm-*`-Namen älterer Stylesheets funktionieren weiterhin.

**Symbole der Notiz-Werkzeugleiste umfärben**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

Symbole sind CSS-Masken, die mit `background-color: currentColor` gezeichnet werden, daher genügt `color`. `!important` ist hier nötig, weil einige dieser Symbole bereits eine eigene Farbe tragen (der Stern, wenn eine Notiz ein Favorit ist, das Teilen-Symbol, wenn sie veröffentlicht ist, die Büroklammer, wenn sie Anhänge hat).

Für ein einzelnes Symbol braucht es kein CSS: Klicken Sie es in der Notiz-Symbolleiste oder in der Icon-Seitenleiste mit der rechten Maustaste an und wählen Sie eine Farbe. Diese Farben werden pro Benutzer gespeichert und lassen die oben genannten Statusfarben unverändert.

**Die gesamte Oberfläche wärmer gestalten**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**Ein vollständiges Design schreiben**

Überschreiben Sie die Tokens auf `:root` für hell und auf `:root[data-theme='dark']` für dunkel, und sonst nichts. `src/public/css/README.md` dokumentiert jedes Token und zeigt ein vollständiges Beispiel; die integrierten Designs Lavendel, Sepia und Terminal in `src/public/css/tokens.css` sind genau dasselbe, auf dieselbe Weise geschrieben.

</details>

## Mehrbenutzerbetrieb

> Nicht zu verwechseln mit der Funktion [Mehrere Instanzen](#mehrere-instanzen).

Poznote ist mehrbenutzerfähig: Jedes Profil hat eigene Notizen, Arbeitsbereiche, Tags, Ordner, Anhänge und Einstellungen und meldet sich mit seinem eigenen Benutzernamen oder seiner E-Mail-Adresse und seinem Passwort an.

- **Benutzerverwaltung**: Administratoren legen Profile unter **Einstellungen > Admin-Werkzeuge > Benutzerverwaltung** an, deaktivieren und verwalten sie, und können einem Benutzer Zugriff auf das Konto eines anderen Benutzers gewähren, ohne dessen Eigentümerschaft zu übertragen.
- **Teilen**: Notizen und Ordner können mit anderen Benutzern der Instanz geteilt werden, schreibgeschützt oder bearbeitbar, oder öffentlich über eigene Links. Ein ganzer Arbeitsbereich kann mit anderen Benutzern der Instanz geteilt werden, die ihn in ihrem Arbeitsbereichsmenü finden und zusammen mit dem Besitzer bearbeiten. Können mehrere Benutzer auf dieselbe Notiz zugreifen, bearbeitet sie jeweils nur einer, und die anderen sehen, wer die Sperre hält.
- **Dieselbe Notiz bearbeiten**: Es bearbeitet immer nur eine Person. Ist eine Notiz gesperrt, bietet das schreibgeschützte Banner an, die Bearbeitung zu **übernehmen**: Der Bildschirm der anderen Person wird schreibgeschützt, ihre ungespeicherten Änderungen bleiben in ihrem Browser und werden erneut angeboten, sobald die Notiz frei ist. Eine geöffnete Notiz übernimmt anderswo gemachte Änderungen innerhalb weniger Sekunden. Bei einer **Markdown**-Notiz mit ungespeicherten Änderungen auf beiden Seiten werden die beiden Änderungen automatisch zusammengeführt, wenn sie verschiedene Zeilen betreffen; überschneiden sie sich, lässt Sie ein Banner wählen. Rich-Text-Notizen werden nie zusammengeführt, Sie wählen die Version, die bleibt. Halten Sie Skripte und anderen Code in eingezäunten Codeblöcken (```` ``` ````): rohes HTML außerhalb eines Codeblocks wird beim Speichern bereinigt, wodurch eine an sich saubere Zusammenführung wie ein Konflikt aussehen kann.
- **Mandantentrennung (SaaS-Modus)**: Administratoren können Benutzern ohne Administratorrechte das Auffinden der anderen Konten der Instanz, das Teilen mit ihnen oder das Registrieren persönlicher Webhooks untersagen. Für eine Familien- oder Team-Instanz lassen Sie alles deaktiviert.

<details>
<summary><strong>Datenablage auf der Festplatte</strong></summary>
<br>

Poznote verwendet eine Master-Datenbank (`data/master.db`) für gemeinsame Koordinationsdaten sowie separate Datenbanken und Dateien pro Benutzer für die eigentlichen Notizinhalte.

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

## Aktivitätsprotokoll

Poznote führt einen Verlauf der sensiblen Vorgänge auf der Instanz, sodass Administratoren sehen können, was wann und durch wen geschehen ist: An- und Abmeldungen, Konto- und Kontingentänderungen, Erstellen und Teilen von Arbeitsbereichen, Sicherungen und Wiederherstellungen, Leeren des Papierkorbs und endgültige Löschungen, App-Passwörter. Das Protokoll ist unter **Einstellungen > Admin-Werkzeuge > Aktivitätsprotokoll** verfügbar, Administratoren vorbehalten, und das Hilfesymbol oben auf der Seite listet alle protokollierten Vorgänge auf.

Das Protokoll hält fest, dass ein Vorgang stattgefunden hat, nicht die Daten, die er betraf: Notizinhalte und Passwörter werden nie hineingeschrieben, und Routinetätigkeiten wie das Schreiben einer Notiz oder das Verschieben in den Papierkorb werden nicht erfasst. Einträge werden standardmäßig 90 Tage lang aufbewahrt (30, 90, 365 Tage oder unbegrenzt), und das Protokoll kann auf derselben Seite geleert werden.

## Webhooks

Poznote kann externe Dienste benachrichtigen, wenn auf der Instanz etwas geschieht, indem es ausgehende Webhooks (HTTP-POST-Anfragen mit JSON-Nutzdaten) an die von Ihnen registrierten Endpunkte sendet. So lässt sich Poznote an Automatisierungswerkzeuge wie n8n, Zapier oder eigene Skripte anbinden. Administratoren registrieren Instanzereignisse (Konten, Kontingente, Registrierungen) unter **Einstellungen > Admin-Werkzeuge > Admin-Webhooks**, und jeder Benutzer kann unter **Einstellungen > Benutzer-Webhooks** Endpunkte für seine eigenen Notizen und Erinnerungen registrieren.

Zustellungen werden mit HMAC-SHA256 signiert, wenn der Webhook ein Geheimnis hat, und Notizinhalte werden nie gesendet. Alle Ereignisse, die Felder der Nutzdaten, die Signaturprüfung und die Zustellungsgarantien sind in der **[Webhooks-Dokumentation](WEBHOOKS.de.md)** beschrieben.

## Git-Synchronisierung

Poznote unterstützt die automatische und manuelle Synchronisierung mit **GitHub**, **GitLab** (gitlab.com oder eine selbst gehostete Instanz) oder **Forgejo**. Jeder Benutzer konfiguriert sein eigenes Repository unabhängig. Es gibt kein gemeinsames globales Repository.

Die Git-Synchronisierung kommuniziert über HTTPS mit der REST-API des Anbieters, die Authentifizierung erfolgt daher immer über Tokens. SSH-Schlüssel werden nicht verwendet.

<details>
<summary><strong>Git-Synchronisierung konfigurieren</strong></summary>
<br>

**Schritt 1: Funktion aktivieren (Administrator, unter Einstellungen > Admin-Werkzeuge)**

Aktivieren Sie **Git-Synchronisierung** im Bereich **Admin-Werkzeuge** der Einstellungsseite. Damit wird die Git-Synchronisierung global eingeschaltet, und die Karte bzw. Konfiguration **Git-Synchronisierung** auf Benutzerebene steht unter **Einstellungen** zur Verfügung.

---

**Schritt 2: Jeder Benutzer konfiguriert sein eigenes Repository (Einstellungen > Git-Synchronisierung)**

| Feld | Beschreibung |
|---|---|
| Anbieter | `GitHub`, `GitLab` oder `Forgejo` |
| API-Basis-URL | GitHub: automatisch ausgefüllt (schreibgeschützt). GitLab: `https://gitlab.com/api/v4` oder die URL Ihrer Instanz, z. B. `https://gitlab.example.com/api/v4`. Forgejo: die URL Ihrer Instanz, z. B. `https://forgejo.example.com/api/v1` |
| Zugriffstoken | GitHub-PAT (`ghp_...`), GitLab-Token mit dem Scope `api` (`glpat-...`, Personal oder Project Access Token) oder Forgejo-Token (Settings > Applications) |
| Repository | Format `owner/repo`. GitLab: der vollständige Projektpfad einschließlich Untergruppen, z. B. `group/subgroup/project` |
| Branch | Standard: `main` |
| Autorname / E-Mail | Werden für die Commit-Metadaten verwendet |

> 🔒 Zugriffstokens werden im Ruhezustand mit AES-256-GCM verschlüsselt. Ein Schlüssel wird automatisch erzeugt und in `data/.app_secret` gespeichert.

---

**Automatische Synchronisierung**

Wenn der Benutzer sie aktiviert, führt Poznote automatisch Folgendes aus:
- **Pull** bei der Anmeldung
- **Push** bei jedem Erstellen, Ändern oder Löschen einer Notiz

Manuelles Senden und Abrufen ist außerdem über die Schaltflächen **Senden** und **Abrufen** der linken Symbolleiste möglich.

---

**Synchronisierte Arbeitsbereiche**

Standardmäßig wird jeder Arbeitsbereich synchronisiert. Unter **Einstellungen > Git-Synchronisierung** kann jeder Benutzer die Synchronisierung stattdessen auf ausgewählte Arbeitsbereiche beschränken:

- Nur Notizen und Anhänge aus den ausgewählten Arbeitsbereichen werden gesendet und abgerufen.
- Ein Pull verändert niemals Notizen in den anderen Arbeitsbereichen.
- Ein Push entfernt Dateien im Repository, die außerhalb der ausgewählten Arbeitsbereiche liegen, sodass das Repository immer genau den synchronisierten Bestand widerspiegelt.
- Die Schaltflächen Senden und Abrufen in der Seitenleiste, der automatische Push und die Pull-Aufforderung erscheinen nur, während Sie einen synchronisierten Arbeitsbereich ansehen.

</details>

## S3-Speicher für Anhänge

Standardmäßig werden Anhänge von Notizen auf der lokalen Festplatte gespeichert. Administratoren können sie stattdessen in einem S3-kompatiblen Objektspeicher ablegen (AWS S3, MinIO, Garage, Cloudflare R2, Backblaze B2, ...). Die Einstellung gilt für alle Benutzer der Instanz.

<details>
<summary><strong>S3-Speicher konfigurieren</strong></summary>
<br>

Konfigurieren Sie ihn unter **Einstellungen > S3-Anhänge** (nur Administratoren).

- **Konfiguration**: Endpunkt-URL, Region, Bucket, Access Key, Secret Key und Path-Style-Adressierung, mit integriertem Verbindungstest.
- **Migration**: Verschieben Sie vorhandene Anhangsdateien zwischen lokaler Festplatte und Bucket, in beide Richtungen und für alle Benutzer. Die Migration läuft in Stapeln und kann gefahrlos unterbrochen und fortgesetzt werden.
- **Datenschutz**: Anhänge werden im Bucket unter `attachments/{user id}/` gespeichert und immer über Poznote ausgeliefert, sodass der Bucket privat bleiben kann.
- **Kontingente**: Pro Benutzer lässt sich ein S3-Speicherkontingent festlegen, und die S3-Nutzung erscheint in der Speicherstatistik für Administratoren.
- **Sicherungen**: ZIP-Exporte enthalten S3-Anhänge standardmäßig (sie werden dabei direkt aus dem Bucket geholt), unabhängig davon, ob sie im Sicherungsfenster, über die REST-API oder durch die automatischen S3-Sicherungen erstellt werden. Eine Option im Sicherungsfenster erlaubt es, sie für ein schlankeres Archiv wegzulassen. Kann der Bucket während der Erstellung eines Archivs nicht gelesen werden, schlägt der Export mit einem Fehler fehl, statt ein Archiv mit fehlenden Dateien zu erzeugen.

Das Wiederherstellen einer Sicherung, in der einige der referenzierten Anhangsdateien fehlen, wird bei aktiviertem S3-Speicher abgelehnt, weil eine vollständige Wiederherstellung den Inhalt des Buckets ersetzt und die fehlenden Dateien verloren gingen. Eine solche Sicherung lässt sich auf zwei Wegen wiederherstellen:

- **Am einfachsten**: Schalten Sie „Anhänge in S3 speichern“ aus (die Zugangsdaten bleiben erhalten), stellen Sie die Sicherung wieder her und schalten Sie den Schalter dann wieder ein. Eine Wiederherstellung im lokalen Modus verändert den Bucket nie, und die dort noch gespeicherten Anhänge werden weiterhin ausgeliefert. Dies ist auch der richtige Weg auf einem neuen Server mit intaktem Bucket, da der Anhang-Export der anderen Option eine Instanz voraussetzt, die die Notizen noch kennt.
- **Ein vollständiges Archiv neu erstellen**:
  1. Laden Sie im Sicherungsfenster den **Anhang-Export** herunter: Er enthält alle Anhänge Ihres Kontos in einem Ordner `files/`.
  2. Entpacken Sie die Sicherung, kopieren Sie die Dateien aus `files/` in den Ordner `attachments/` der Sicherung und packen Sie sie wieder als ZIP. Achtung beim erneuten Packen: Wählen Sie den Inhalt der Sicherung (`database/`, `entries/`, `attachments/`, ...) aus und komprimieren Sie diese Auswahl, nicht den Ordner, der sie enthält. Die Ordner müssen im Stammverzeichnis der ZIP-Datei liegen, sonst meldet die Wiederherstellung, dass `database/poznote_backup.sql` fehlt.
  3. Stellen Sie die neu erstellte ZIP-Datei ganz normal wieder her.

> Die Git-Synchronisierung ignoriert Anhänge, solange der S3-Speicher aktiviert ist.

</details>

## S3-Sicherungen

Administratoren können vollständige Sicherungsarchive (eine ZIP-Datei pro Benutzer, identisch mit dem Download der vollständigen Sicherung) manuell oder automatisch nach Zeitplan an einen S3-kompatiblen Bucket senden. Die Konfiguration ist unabhängig von der des S3-Speichers für Anhänge, sodass Sicherungen einen anderen Bucket oder Anbieter nutzen können.

<details>
<summary><strong>S3-Sicherungen konfigurieren</strong></summary>
<br>

Konfigurieren Sie sie unter **Einstellungen > S3-Sicherungen** (nur Administratoren).

- **Hauptschalter**: Ein Schalter oben auf der Seite aktiviert oder deaktiviert die gesamte Funktion. Ist er deaktiviert, stoppen die automatischen Sicherungen, und die Bereiche für S3-Sicherung und -Wiederherstellung verschwinden für alle Benutzer (die Self-Service-Aktionen werden auch serverseitig abgelehnt).
- **Konfiguration**: Endpunkt-URL, Region, Bucket, Access Key, Secret Key und Path-Style-Adressierung, mit integriertem Verbindungstest.
- **Benutzerauswahl**: Über Kontrollkästchen wählen Sie, welche Benutzer gesichert werden. Standardmäßig sind alle ausgewählt, und solange alle ausgewählt sind, werden neue Konten automatisch einbezogen.
- **Manuelle Sicherungen**: Die Schaltfläche „Jetzt sichern“ lädt für jeden ausgewählten Benutzer ein neues Archiv hoch, einen Benutzer nach dem anderen, mit Fortschrittsanzeige pro Benutzer. Sie funktioniert, sobald die Verbindung konfiguriert ist, auch wenn die automatischen Sicherungen ausgeschaltet sind.
- **Automatische Sicherungen**: Wenn aktiviert, sichert ein Hintergrundprozess die ausgewählten Benutzer im gewählten Rhythmus (täglich, wöchentlich oder monatlich). Der erste Durchlauf erfolgt wenige Minuten nach dem Aktivieren, die folgenden nach dem gewählten Intervall.
- **Aufbewahrung**: Pro Benutzer werden nur die N neuesten Archive aufbewahrt, ältere werden nach jeder Sicherung aus dem Bucket gelöscht (0 bewahrt alles auf).
- **Durchsuchen**: Die Seite listet die aktuell im Bucket vorhandenen Archive mit Aktionen zum Herunterladen und Löschen auf.
- **Wiederherstellung**: Archive werden im Bucket unter `backups/{user id}/` gespeichert und können über die normale Seite [Wiederherstellen / Importieren](#wiederherstellen--importieren) wiederhergestellt werden.
- **Self-Service**: Sobald der Bucket konfiguriert ist, erhält jeder Benutzer auf seiner Seite **Sicherung / Export** einen Bereich „S3-Sicherungen“, um ein neues Archiv seines eigenen Kontos hochzuladen und seine vorhandenen Archive herunterzuladen oder zu löschen. Ein Bereich „Aus S3 wiederherstellen“ auf der Seite **Wiederherstellen / Importieren** stellt sein Konto direkt aus einem dieser Archive wieder her.
- **Mandantentrennung**: Zwei Optionen („S3-Sicherungen auf der Sicherungsseite“ und „S3-Wiederherstellung auf der Wiederherstellungsseite“) deaktivieren diese Self-Service-Bereiche für Benutzer ohne Administratorrechte. Sie werden serverseitig durchgesetzt, sodass die gesperrten Aktionen auch bei direktem Aufruf abgelehnt werden.

Werden Anhänge in S3 gespeichert (S3-Speicher für Anhänge), sind sie standardmäßig in den Archiven enthalten und werden dabei direkt aus dem Bucket geholt. Mit einer Option können Sie sie für schlankere Archive und schnellere Durchläufe aus den Sicherungen herauslassen.

</details>

## Sicherung / Export

Poznote enthält eine integrierte Funktion für Sicherung und Export, die über die Einstellungen erreichbar ist.

<a id="complete-backup"></a>
<details>
<summary><strong>Vollständige Sicherung als Poznote-ZIP</strong></summary>
<br>

Eine einzige ZIP-Datei mit der Datenbank, allen Notizen und Anhängen aller Arbeitsbereiche:

  - Enthält eine `index.html` im Stammverzeichnis zum Offline-Durchblättern
  - Notizen sind nach Arbeitsbereich und Ordner geordnet
  - Anhänge sind über anklickbare Links erreichbar

Das Archiv wird im Hintergrund von einem Worker-Prozess erstellt, nicht während der Anfrage, die es anstößt, sodass auch ein großes Konto nicht an ein Timeout des Browsers oder eines Reverse Proxys stößt. Die Seite verfolgt den Fortschritt des Auftrags, und der Download startet von selbst, sobald die Datei bereit ist. Sie können die Seite verlassen und später zurückkehren, die Vorbereitung läuft weiter. Ein vorbereitetes Archiv bleibt 24 Stunden lang verfügbar, und eine Schaltfläche ermöglicht es, es sofort zu löschen.

#### Sicherungen pro Benutzer und vollständige Sicherungen

Poznote bietet flexible Sicherungsoptionen:

**Über die Weboberfläche (Einstellungen > Sicherung / Export):**
- **Alle Benutzer** können ihr eigenes Profil sichern und wiederherstellen
- **Administratoren** können auswählen, welches Benutzerprofil gesichert oder wiederhergestellt wird
- Sicherungen enthalten die Datenbank, die Notizen und die Anhänge des Benutzers

**Über API/Skript (nur Administratoren):**
- Automatisierte Sicherungen mit dem Skript `backup-poznote.sh`
- Programmatischer Zugriff über die REST-API v1
- Erfordert Administrator-Zugangsdaten

**Umfang der Sicherungen:**

1. **Sicherungen pro Benutzer**: Werden in den Einstellungen oder über die API erstellt. Enthalten *nur* die Daten eines bestimmten Benutzers (seine Datenbank, Notizen und Anhänge).
2. **Vollständige Systemsicherung**: Wird manuell durch Sichern des gesamten Verzeichnisses `/data` erstellt. Nur so lassen sich die Master-Konfiguration und die Daten aller Benutzer auf einmal sichern.

```bash
# Vollständige Systemsicherung über die Kommandozeile
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>Einzelne Notizen exportieren</strong></summary>
<br>

Exportieren Sie einzelne Notizen über die Schaltfläche **Exportieren** in der Werkzeugleiste der Notiz:

  - **Rich-Text-Notizen:** Export als HTML oder als einzelne HTML-Datei mit eingebetteten Bildern
  - **Markdown-Notizen:** Export als Markdown, als HTML oder als einzelne HTML-Datei mit eingebetteten Bildern
  - **Aufgabenlisten:** dieselben Optionen, dazu ein JSON-Rohexport der Liste

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Automatisierte Sicherungen mit Bash-Skript</strong></summary>
<br>

Für automatisierte, zeitgesteuerte Sicherungen über die API können Sie das mitgelieferte Skript `backup-poznote.sh` verwenden.

**WICHTIG:** Nur Administratoren können über die API Sicherungen erstellen.
Verwenden Sie das aktuelle Passwort des Administratorprofils, mit dem Sie sich authentifizieren. Bei einer Neuinstallation ist das das Standard-Administratorpasswort (`admin`), bis es in Poznote geändert wird. Sobald ein eigenes Passwort festgelegt ist, wird dieses für API-Aufrufe benötigt.

**Speicherort des Skripts:** `backup-poznote.sh` im Ordner `tools` des Poznote-Repositorys

**Verwendung durch Administratoren:**

Administratoren können jedes Benutzerprofil sichern, **ohne Benutzer-IDs kennen zu müssen**, der Benutzername genügt:

```bash
# Eigenes Profil sichern
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# Profil eines anderen Benutzers sichern (Nina)
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**Verwendung:**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**Beispiel mit crontab (Administrator sichert Nina):**

```bash
# In die crontab eintragen, um zweimal täglich automatisch zu sichern
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**Die Parameter im Einzelnen:**
- `'https://poznote.example.com'`: URL Ihrer Poznote-Instanz
- `'admin'`: Administrator-Benutzername für die Authentifizierung (muss ein Administrator sein)
- `'admin_password'`: Aktuelles Administratorpasswort des API-Profils (`admin`, bis es geändert wird, danach das eigene Passwort)
- `'Nina'`: Benutzername des zu sichernden Benutzers
- `'/root/backups'`: Übergeordnetes Verzeichnis, in dem die Sicherungen gespeichert werden (legt den Ordner `backups-poznote-<username>` an)
- `'30'`: Anzahl der aufzubewahrenden Sicherungen (ältere werden automatisch gelöscht)

**So läuft die Sicherung ab:**

1. Das Skript authentifiziert sich mit den Administrator-Zugangsdaten
2. Es ermittelt automatisch die Benutzer-ID anhand des Benutzernamens
3. Es erstellt eine Sicherung über die API
4. Es ruft die Poznote-REST-API v1 auf (`POST /api/v1/backups` mit dem Header `X-User-ID`)
5. Es lädt die Sicherungs-ZIP lokal nach `backups-poznote-<username>/` herunter
6. Es verwaltet die Aufbewahrung automatisch (bewahrt nur die angegebene Anzahl neuester Sicherungen auf)

**Hinweis:** Die Sicherungen jedes Benutzers werden in separaten Ordnern abgelegt (`backups-poznote-Nina`, `backups-poznote-Tim` usw.)

</details>


## Wiederherstellen / Importieren

Poznote bietet flexible Wiederherstellungsoptionen über die Weboberfläche (**Einstellungen > Wiederherstellen / Importieren**) oder, für Administratoren, programmatisch über die REST-API. Benutzer können ihre eigenen Profildaten aus einer vollständigen ZIP-Sicherung wiederherstellen oder einzelne Dateien importieren, während Administratoren Wiederherstellungen für das gesamte System verwalten können.

<a id="complete-restore"></a>
<details>
<summary><strong>Vollständige Wiederherstellung aus einer Poznote-ZIP-Sicherung</strong></summary>
<br>

Laden Sie die vollständige Sicherungs-ZIP hoch, um alles wiederherzustellen:

  - Ersetzt die Datenbank und stellt alle Notizen und Anhänge wieder her
  - Wirkt auf alle Arbeitsbereiche gleichzeitig

Es gibt praktisch keine Größenbeschränkung. Das Archiv wird in Teilstücken hochgeladen (ein fehlgeschlagenes Teilstück wird erneut gesendet, statt den gesamten Upload zu verlieren), auf dem Server wieder zusammengesetzt und anschließend von einem Hintergrundprozess entpackt und wiederhergestellt, sodass weder der Browser noch ein vorgeschalteter Reverse Proxy die Wiederherstellung durch ein Timeout abbrechen kann. Ein Fortschrittsbalken deckt den gesamten Ablauf ab: Upload, Entpacken, Datenbank, Notizen, dann Anhänge. Nach Abschluss der Wiederherstellung fragt Poznote, welchen Arbeitsbereich Sie öffnen möchten.

Die Wiederherstellung aus einem S3-Bucket (siehe [S3-Sicherungen](#s3-sicherungen)) läuft als derselbe Hintergrundauftrag, sodass auch das Abrufen eines großen Archivs aus dem Bucket und seine Wiederherstellung nicht davon abhängen, dass eine Anfrage bestehen bleibt.

Ist ein Upload überhaupt nicht möglich, bietet die Seite **Wiederherstellen / Importieren** zusätzlich eine Alternative per Direktkopie: Kopieren Sie das Archiv per SSH in den Poznote-Container, genau nach `/tmp/backup_restore.zip`, laden Sie die Seite neu und stellen Sie von dort aus wieder her.

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Einzelne Dateien importieren</strong></summary>
<br>

Importieren Sie eine oder mehrere HTML-, Markdown- oder Textnotizen direkt:

  - Unterstützt die Dateitypen `.html`, `.md`, `.markdown`, `.txt` und `.json`
  - Bis zu 50 Dateien können gleichzeitig ausgewählt werden, einstellbar unter Einstellungen > Admin-Werkzeuge > Importlimits

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>ZIP-Datei importieren</strong></summary>
<br>

Importieren Sie ein ZIP-Archiv mit mehreren Notizen:

  - Unterstützt die Dateitypen `.html`, `.md`, `.markdown` oder `.txt`
  - ZIP-Archive können bis zu 300 Dateien enthalten, einstellbar unter Einstellungen > Admin-Werkzeuge > Importlimits
  - Beim Import eines ZIP-Archivs erkennt Poznote die Ordnerstruktur automatisch und legt sie neu an

Für das Archiv gibt es praktisch keine Größenbeschränkung. Wie bei einer vollständigen Wiederherstellung wird es in Teilstücken hochgeladen (ein fehlgeschlagenes Teilstück wird erneut gesendet, statt den gesamten Upload zu verlieren), auf dem Server wieder zusammengesetzt und anschließend von einem Hintergrundprozess verarbeitet, sodass weder der Browser noch ein vorgeschalteter Reverse Proxy den Import durch ein Timeout abbrechen kann. Ein Fortschrittsbalken deckt den gesamten Ablauf ab: Upload, Bilder und Anhänge, dann Notizen.

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Einen Obsidian-Vault migrieren</strong></summary>
<br>

Ein Obsidian-Vault ist ein Ordner mit Markdown-Dateien und lässt sich daher unverändert in einem einzigen ZIP-Archiv importieren.

**Schritte**

1. Komprimieren Sie den Ordner Ihres Vaults zu einer ZIP-Datei. Vorher muss nichts bereinigt werden: Versteckte Ordner wie `.obsidian` oder `.trash` werden ignoriert.
2. Öffnen Sie in Poznote **Einstellungen > Wiederherstellen / Importieren** und gehen Sie zum Abschnitt, der Dateien und ZIP-Archive importiert. Wählen Sie den Ziel-Workspace (ein neuer, leerer Workspace macht das Ergebnis leicht überprüfbar), wählen Sie die ZIP-Datei aus und starten Sie den Import. Die ZIP-Datei auf die Notizliste der Hauptseite zu ziehen, bewirkt dasselbe.
3. Lesen Sie die Zusammenfassung am Ende: Sie nennt die Anzahl der importierten Notizen, Ordner, Bilder und PDF-Dateien sowie die Dateien, die nicht importiert werden konnten.

Eine ZIP-Datei kann bis zu 300 Notizen enthalten (Bilder und PDF-Dateien zählen nicht mit). Ein Administrator kann dieses Limit unter Einstellungen > Admin-Werkzeuge > Importlimits anheben. Die Größe des Archivs ist nicht begrenzt, siehe [ZIP-Datei importieren](#import-zip-notes).

**Was übernommen wird**

  - Notizen: Jede `.md`-Datei wird zu einer Markdown-Notiz, benannt nach der Datei oder nach dem Schlüssel `title` ihres Front Matters.
  - Ordner: Die Ordnerstruktur des Vaults wird samt Unterordnern neu angelegt. Liegt der gesamte Vault in einem einzigen Ordner auf oberster Ebene der ZIP-Datei, wird dieser Ordner übersprungen.
  - Tags: der Schlüssel `tags` des Front Matters und eine Zeile mit `#tags` ganz oben in einer Notiz. Leerzeichen in einem Tag werden zu Unterstrichen.
  - Front Matter: `title`, `folder`, `tags`, `favorite`, `created` und `updated` werden gelesen, siehe [Unterstützung von Markdown-Front-Matter](#markdown-front-matter).
  - Links zwischen Notizen: `[[Titel der Notiz]]` funktioniert unverändert. Poznote löst den Link über den Titel auf, zeigt ihn als internen Link an und berücksichtigt ihn in den Backlinks und im Graphen.
  - Bilder: `![[bild.png]]`, `![[bild.png|Beschriftung]]` und `![Beschriftung](bild.png)` werden zu Anhängen der Notiz und an Ort und Stelle angezeigt, egal wo das Bild im Vault liegt (neben den Notizen, in einem Unterordner oder in einem Ordner `attachments`).
  - PDF-Dateien: Ein aus einer Notiz verlinktes PDF (`![[datei.pdf]]`, `[[datei.pdf]]` oder ein Markdown-Link) wird an diese Notiz angehängt, und der Link zeigt auf den Anhang. Jedes andere PDF, neben den Notizen oder in einem Ordner `attachments`, wird zu einer nach der Datei benannten Notiz mit dem PDF als Anhang, im Ordner, der seinem Platz im Vault entspricht.

**Was nicht übernommen wird**

  - Links mit Alias oder auf eine Überschrift (`[[Notiz|Alias]]`, `[[Notiz#Überschrift]]`) bleiben im Text, führen aber zu keiner Notiz.
  - Eingebettete Notizen (`![[Andere Notiz]]`) und Plugin-Inhalte: Dataview-Abfragen, `.canvas`-Dateien, Zeichnungen aus dem Excalidraw-Plugin von Obsidian.
  - Tags mitten in einer Notiz bleiben einfacher Text.
  - Dateien anderer Typen neben den Notizen (Audio, Video, Office-Dokumente) werden ignoriert. Hängen Sie sie anschließend an die betreffende Notiz an.

Bilder und PDF-Dateien werden über den Dateinamen zugeordnet, nicht über den Pfad. Tragen zwei Dateien des Vaults denselben Namen, benennen Sie eine davon vor dem Import um.

</details>

<a id="markdown-front-matter"></a>
<details>
<summary><strong>Unterstützung von Markdown-Front-Matter</strong></summary>
<br>

Markdown-Dateien können YAML-Front-Matter enthalten, um Metadaten der Notiz festzulegen. Folgende Schlüssel werden unterstützt:

  - `title`: Überschreibt den Titel der Notiz (Standard: Dateiname ohne Endung)
  - `folder`: Überschreibt den Zielordner. Ein einfacher Name muss einem Ordner entsprechen, der im Arbeitsbereich bereits existiert; ein Pfad wie `Projects/2026` legt die benötigten Ordner an.
  - `tags`: Array von Tags, die der Notiz zugewiesen werden. Unterstützt sowohl die Inline-Syntax `[tag1, tag2]` als auch die mehrzeilige Syntax
  - `favorite`: Markiert die Notiz als Favorit (`true` oder `false`)
  - `created`: Legt ein eigenes Erstellungsdatum fest (Format: `YYYY-MM-DD HH:MM:SS`)
  - `updated`: Legt ein eigenes Änderungsdatum fest (Format: `YYYY-MM-DD HH:MM:SS`)

Beispiel mit Inline-Array-Syntax:
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

Beispiel mit mehrzeiliger Syntax:
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


## Offline

Poznote funktioniert auf zwei Arten auch ohne Netzwerk: Die zuletzt geänderten Notizen, Ihre Favoriten und die Notizen oder Ordner, die Sie behalten möchten, bleiben in Ihrem Browser zum Lesen und Bearbeiten verfügbar, und eine vollständige Sicherung lässt sich überall als schreibgeschützter Export ansehen.

<details>
<summary><strong>Offline-Notizen</strong></summary>
<br>

Die in den letzten 5 Tagen geänderten Notizen werden in jedem Browser aufbewahrt, in dem Sie Poznote verwenden, und diese Kopie wird nach jedem Speichern aktualisiert. Im Unterricht, im Zug oder überall ohne WLAN öffnen Sie die gewohnte Poznote-Adresse: Der Browser zeigt die Offline-Version von Poznote mit derselben Seitenleiste, denselben Editoren, derselben Werkzeugleiste, derselben Suche und denselben Tabs (ein Doppelklick oder ein Mittelklick öffnet eine Notiz in einem neuen Tab, und die online geöffneten Tabs werden übernommen), listet aber nur die offline aufbewahrten Notizen auf.

*   **Anmeldung:** Geben Sie das Passwort Ihrer letzten Anmeldung in diesem Browser ein, es wird ohne den Server geprüft. Haben Sie in diesem Browser nie Ihr Passwort eingegeben (SSO, automatische Anmeldung), öffnet sich das zuletzt verwendete Konto mit der Schaltfläche **Weiter als**.
*   **Lesen und Bearbeiten:** Rich-Text-Notizen, Markdown-Notizen und Aufgabenlisten öffnen sich in ihrem gewohnten Editor, und neue Notizen können erstellt werden. Das /-Menü und das Rechtsklick-Menü funktionieren ebenfalls, ohne die Befehle, die den Server brauchen (hochzuladende Bilder und Dateien, Vorlagen, Zeichnungen, Links zu anderen Notizen). Andere Notiztypen, etwa Zeichnungen, bleiben nur online verfügbar. Änderungen bleiben im Browser, bis sie gesendet sind.
*   **Offline behalten:** Favoriten werden immer aufbewahrt, und **Offline behalten** im Menü einer Notiz oder eines Ordners (Unterordner eingeschlossen) bewahrt sie unabhängig vom Datum auf, mit allen Anhängen (PDF, Audio, Dateien) bis 25 MB pro Datei. Dasselbe Menü einer Notiz zeigt an, ob sie in diesem Browser offline verfügbar ist, und die Seiten Notizen und Ordner markieren die in diesem Browser offline verfügbaren Notizen und Ordner. Auf der Seite Notizen lassen sich über die Sammelaktionen auch mehrere Notizen auf einmal offline behalten (oder nicht mehr), und die Seite Ordner bietet **Offline behalten** im Menü jedes Ordners.
*   **Offline-Seite:** Die Schaltfläche **Offline** der Symbolleiste listet die offline behaltenen Notizen und Ordner auf, wie die Seite Freigaben: Ordner als Baum mit ihren Notizen, der Grund, warum jede Notiz behalten wird (offline behalten, in einem offline behaltenen Ordner, Favorit, kürzlich geändert), ein Filter und eine Schaltfläche, um eine Notiz offline zu behalten oder damit aufzuhören. Ein Warnsymbol markiert eine Notiz, die dieser Browser noch nicht hat.
*   **Wieder online:** Die Änderungen werden automatisch gesendet. Wurde eine Notiz inzwischen auch auf dem Server geändert, werden beide Fassungen nach Möglichkeit zusammengeführt, andernfalls wird Ihre Offline-Fassung als eigene Notiz mit dem Namen „... (Offline-Kopie)“ behalten. Eine inzwischen auf dem Server gelöschte Notiz wird neu angelegt.
*   **Einstellungen:** **Einstellungen > Aktionen > Offline-Notizen** legt fest, wie viele Tage an Notizen aufbewahrt werden (standardmäßig 5, bis zu 30, 0 schaltet Offline-Notizen aus), und zeigt, was der aktuelle Browser enthält.
*   **Grenzen:** höchstens 300 Notizen und 50 MB Text, die zuletzt geänderten zuerst. Auch Dateien werden aufbewahrt: die in diesen Notizen angezeigten Bilder und alle Anhänge (PDF, Audio, Dateien) der Favoriten und der mit **Offline behalten** markierten Notizen, bis zu 25 MB pro Datei, 400 Dateien und 200 MB insgesamt, und nie mehr als die Hälfte des freien Speicherplatzes des Browsers. Eine größere Datei bleibt nur online, und die Notiz weist offline darauf hin.
*   **Voraussetzungen:** Poznote muss über HTTPS bereitgestellt werden (Browser halten Seiten nur über eine sichere Verbindung offline bereit, `http://localhost` funktioniert ebenfalls) und nach der Anmeldung einmal online im Browser geöffnet worden sein, damit die Kopie angelegt wird.
*   **Datenschutz:** Nur die Notizen Ihres eigenen Kontos werden aufbewahrt, nicht die eines mit Ihnen geteilten Kontos oder Arbeitsbereichs. Sie werden unverschlüsselt im Browser gespeichert. Die Abmeldung entfernt sie aus dem Browser (auch noch nicht gesendete Änderungen, nach einer Warnung, die sie auflistet): Melden Sie sich an einem gemeinsam genutzten Computer ab, wenn Sie gehen. Die Abmeldung funktioniert auch ohne Netzwerk über die Offline-Seite: Die Notizen werden sofort entfernt, und die Sitzung auf dem Server endet, sobald Poznote das nächste Mal online geöffnet wird.

</details>

<details>
<summary><strong>Offline-Export</strong></summary>
<br>

Die **📦 Vollständige Sicherung** erzeugt eine eigenständige Offline-Version Ihrer Notizen. Entpacken Sie einfach die ZIP-Datei und öffnen Sie `index.html` in einem beliebigen Webbrowser. So können Sie Ihre Notizen offline lesen, allerdings ohne den vollen Funktionsumfang von Poznote: Es handelt sich um einen schreibgeschützten Export.

</details>

## Mehrere Instanzen

> Nicht zu verwechseln mit der Funktion [Mehrbenutzerbetrieb](#mehrbenutzerbetrieb).

Sie können mehrere voneinander getrennte Poznote-Instanzen auf demselben Server betreiben. Jede Instanz hat ihre eigenen Daten, ihren eigenen Port und ihre eigenen Zugangsdaten.

Ideal für:
- Hosting für verschiedene Benutzer auf demselben Server, jeweils mit eigener, separater Instanz und eigenem Konto
- Das Testen neuer Funktionen, ohne Ihre Produktionsinstanz zu beeinträchtigen

Wiederholen Sie einfach die Installationsschritte in verschiedenen Verzeichnissen mit unterschiedlichen Ports.

### Beispiel: Instanzen für Tom und Alice auf demselben Server

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

## KI-Assistent

Poznote enthält einen integrierten KI-Chat, der sich mit einer lokalen [Ollama](https://ollama.com)- oder [LM Studio](https://lmstudio.ai)-Instanz, einem Cloud-Anbieter wie [Anthropic (Claude)](https://www.anthropic.com) oder OpenAI oder jedem OpenAI-kompatiblen Server verbindet. Er durchsucht und liest Ihre Notizen, um Fragen zu beantworten, und erstellt, überarbeitet und organisiert sie auf Wunsch, innerhalb des Arbeitsbereichs, in dem Sie den Chat geöffnet haben.

Ein Administrator aktiviert ihn unter **Einstellungen → Admin-Werkzeuge → KI-Assistent**, danach erhält jedes Profil eine Schaltfläche **KI-Assistent** in der linken Symbolleiste. Der KI-Server wird vom Poznote-Server aus aufgerufen, nie aus Ihrem Browser, sodass Ihre Notizen mit einer lokalen Ollama-Instanz nie Ihren Rechner verlassen.

Was der Assistent kann, die Wahl eines Anbieters und eines Modells, persönliche API-Schlüssel und die Anbindung eines lokalen Servers aus dem Poznote-Container heraus sind in der [Dokumentation zum KI-Assistenten](AI-ASSISTANT.de.md) beschrieben. Wenn stattdessen ein externer KI-Assistent (VS Code Copilot, Claude CLI...) Ihre Notizen verwalten soll, lesen Sie weiter unten den Abschnitt [MCP-Server](#mcp-server).

## Transkription (Sprache zu Text)

Verwandeln Sie Sprache in Notiztext, mit einem Speech-to-Text-Server, den Sie selbst betreiben. Poznote enthält kein eigenes Sprachmodell: Es kommuniziert mit jedem Server, der die OpenAI-Audio-API bereitstellt (`POST /v1/audio/transcriptions`), etwa einem selbst gehosteten Whisper, sodass die Audiodaten Ihren Rechner nie verlassen müssen.

Sobald ein Administrator die Funktion unter **Einstellungen → Admin-Werkzeuge → Transkription** aktiviert, finden Sie im Slash-Menü unter **Einfügen** den Eintrag **Diktieren** sowie an Audio-Anhängen eine Schaltfläche **Transkribieren**.

Die Einrichtung eines Servers, die Wahl eines Modells und alles Weitere sind in der [Dokumentation zur Transkription](TRANSCRIPTION.de.md) beschrieben.

## MCP-Server

Poznote enthält einen Model-Context-Protocol-Server (MCP), über den KI-Assistenten wie GitHub Copilot oder Claude CLI in natürlicher Sprache mit Ihren Notizen arbeiten können. Zum Beispiel:

- „Erstelle eine neue Notiz mit dem Titel 'Meeting Notes' und dem Inhalt ...“
- „Suche nach Notizen über 'Docker'“
- „Liste alle Notizen in meinem Poznote-Arbeitsbereich auf“
- „Aktualisiere Notiz 42 mit neuen Informationen“

Der MCP-Server ist Teil der offiziellen `docker-compose.yml` und wird nur auf `127.0.0.1` veröffentlicht, sodass ihn standardmäßig nichts außerhalb Ihres Rechners erreichen kann. Einrichtung, Client-Konfiguration, Überschreibungen für Port und Debug sowie der Schutz mit `POZNOTE_MCP_AUTH_TOKEN`, wenn Sie ihn weiter freigeben, sind in der [Dokumentation zum MCP-Server](MCP-SERVER.de.md) beschrieben.

## Chrome-Erweiterung

Der **Poznote URL Saver** ist eine Browsererweiterung, die die URL oder sogar einen ganzseitigen Screenshot der aktuellen Seite mit einem einzigen Klick in Ihrer Poznote-Instanz speichert. Installieren Sie sie aus dem Chrome Web Store: [Erweiterung installieren](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

Die Erweiterung verbindet sich mit Ihrer Instanz über Ihren Benutzernamen und ein [App-Passwort](#app-passwörter). Die Einrichtungsschritte finden Sie in der [Dokumentation zur Chrome-Erweiterung](CHROME-EXTENSION.de.md).

## Unter Android an Poznote teilen

Unter Android erscheint Poznote im **Teilen**-Menü des Systems, sobald die PWA installiert ist. Teilen Sie eine Seite aus Chrome (oder einen Link bzw. Text aus einer beliebigen App), wählen Sie Poznote, und es wird eine neue Notiz mit dem Seitentitel und einem anklickbaren Link angelegt, ganz ohne Erweiterung.

So verwenden Sie die Funktion:

1. Öffnen Sie Ihre Poznote-Instanz in Chrome unter Android und installieren Sie sie als App (Menü → **Zum Startbildschirm hinzufügen** → **Installieren**).
2. Tippen Sie in einer beliebigen App auf **Teilen** und wählen Sie dann **Poznote**.

> Falls Poznote nicht sofort im Teilen-Menü erscheint, vergewissern Sie sich, dass die App installiert ist (und nicht nur ein Lesezeichen). Wenn Sie die PWA installiert haben, bevor diese Funktion veröffentlicht wurde, übernimmt Chrome die neue Fähigkeit nach einigen Tagen automatisch, oder sofort, wenn Sie die App neu installieren.

## API-Dokumentation

Poznote bietet eine umfassende RESTful API v1 für den programmatischen Zugriff auf Notizen, Ordner, Arbeitsbereiche, Tags, Anhänge, Sicherungen, Einstellungen und mehr.

Die vollständige API-Referenz mit allen Endpunkten, Parametern und curl-Beispielen finden Sie in der **[REST-API-Dokumentation](API-REST.md)**.

### Schnellstart

```bash
# Alle Notizen des Benutzers mit der ID 1 auflisten
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# Dasselbe mit einem App-Passwort, erstellt unter Einstellungen > App-Passwörter
# (funktioniert auf Nur-SSO-Instanzen; X-User-ID ergibt sich von selbst)
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# Eine Notiz erstellen
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Interaktive Dokumentation (Swagger)

Rufen Sie die **Swagger UI** direkt in Poznote unter `Einstellungen > Über > API REST` auf, um alle Endpunkte zu durchsuchen, Anfrage- und Antwortschemata einzusehen und API-Aufrufe interaktiv zu testen.

## Technologie-Stack

Poznote setzt auf Einfachheit und Portabilität: keine komplexen Frameworks, keine schweren Abhängigkeiten. Nur geradlinige, zuverlässige Webtechnologien, die dafür sorgen, dass Ihre Notizen zugänglich und unter Ihrer Kontrolle bleiben.

**Architektur mit Fokus auf Datenschutz:** Poznote arbeitet vollständig lokal und benötigt für seine Funktionen keine externen Verbindungen. Alle Bibliotheken (Excalidraw, Mermaid, KaTeX) sind gebündelt und werden von Ihrer eigenen Instanz ausgeliefert. Im Auslieferungszustand ist die einzige ausgehende Verbindung eine tägliche Prüfung auf Updates; die optionalen Funktionen, die Sie selbst einschalten (Git-Synchronisierung, S3, ein KI-Anbieter, Webhooks, SMTP, OIDC), sind die einzigen weiteren.

<details>
<summary>Wenn Sie sich für den Technologie-Stack interessieren, auf dem Poznote aufbaut, <strong>werfen Sie hier einen Blick darauf.</strong></summary>

### Backend
- **PHP 8.x**: Serverseitige Skriptsprache
- **SQLite 3**: Leichtgewichtige, dateibasierte relationale Datenbank

### Frontend
- **HTML5**: Markup und Struktur
- **CSS3**: Gestaltung und responsives Design
- **JavaScript (Vanilla)**: Interaktive Funktionen und dynamische Inhalte
- **React + Vite**: Build-Toolchain für die Excalidraw-Komponente (als IIFE gebündelt)
- **AJAX**: Asynchrones Laden von Daten

### Bibliotheken
- **CodeMirror 6**: Erweiterbarer Code- und Texteditor für die Bearbeitung von Markdown
- **Excalidraw**: Virtuelles Whiteboard zum Skizzieren von Diagrammen und Zeichnungen
- **Mermaid**: Clientseitige JavaScript-Bibliothek zur Erzeugung von Diagrammen und Flussdiagrammen aus Text
- **KaTeX**: Clientseitige JavaScript-Bibliothek für schnellen mathematischen Formelsatz und die Darstellung mathematischer Gleichungen
- **Sortable.js**: JavaScript-Bibliothek für Sortieren per Drag-and-drop
- **highlight.js**: Syntaxhervorhebung für Codeblöcke
- **Swagger UI**: Interaktive Oberfläche zur API-Dokumentation und zum Testen

### Speicherung
- **HTML-/Markdown-Dateien**: Notizen werden als einfache HTML- oder Markdown-Dateien im Dateisystem gespeichert
- **SQLite-Datenbank**: Metadaten, Tags, Beziehungen und Benutzerdaten
- **Dateianhänge**: Im lokalen Dateisystem oder optional in einem S3-kompatiblen Objektspeicher gespeichert

### Infrastruktur
- **Nginx + PHP-FPM**: Leistungsstarker Webserver mit FastCGI Process Manager
- **Alpine Linux**: Sicheres, schlankes Basis-Image
- **Docker**: Containerisierung für einfache Bereitstellung und Portabilität
- **Python 3.12 (Alpine)**: Laufzeitumgebung des MCP-Servers mit den Bibliotheken httpx, uvicorn und fastmcp für die Integration von KI-Assistenten
</details>
