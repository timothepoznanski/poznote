<!-- lang-selector -->
<p align="center">
  <a href="../README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-cn.md">简体中文</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->


<p align="center">
  <img src="../images/poznote-logo-text.png" alt="Logotip de Poznote" width="400">
</p>

<h2 align="center">
Presa de notes potents, sense complicacions.
</h2>

<h3 align="center">
Una alternativa gratuïta, autoallotjada i de codi obert a Notion, Obsidian, Evernote o OneNote.
</h3>

<p align="center">
  <a href="https://poznote.com/video/poznote.mp4"><img src="../images/poznote-video.jpg" alt="Mireu el vídeo de Poznote" width="100%"></a>
</p>

<p align="center">
  <img src="../images/pres1.png" alt="Poznote-light" width="100%">
</p>

### Funcions

Descobriu totes les funcions [aquí](https://poznote.com/#features).

### Captures de pantalla

Vegeu totes les captures de pantalla [aquí](https://poznote.com/screenshots.html).

### Demostració

https://demo.poznote.com

**Usuari**: poznote<br>
**Contrasenya**: poznote

### No voleu gestionar un servidor?

Un proveïdor d'allotjament pot executar el Poznote per vosaltres.<br>
[Compareu els proveïdors](https://poznote.com/hosting.html) o desplegueu-lo directament:

<p>
  <a href="https://www.pikapods.com/pods?run=poznote"><img src="https://www.pikapods.com/static/run-button.svg" alt="Executa a PikaPods" height="44"></a>
  <a href="https://calibernode.com/cloud-apps/poznote"><img src="../images/run-on-calibernode.svg" alt="Executa a Caliber Node" height="44"></a>
</p>

### Parlen del Poznote

https://poznote.com/press.html

### Discord

Uniu-vos a la comunitat per fer preguntes, compartir comentaris o seguir el desenvolupament:

https://discord.gg/fuEV6uqf4N

## Taula de continguts

- [Instal·lació](#installació)
- [Accés](#accés)
- [Canvi de paràmetres](#canvi-de-paràmetres)
- [Actualització de l'aplicació](#actualització-de-laplicació)
- [Autenticació](#autenticació)
- [Contrasenyes d'aplicació](#contrasenyes-daplicació)
- [Tipus de notes](#tipus-de-notes)
- [Revisions](#revisions)
- [Personalització](#personalització)
- [Diversos usuaris](#diversos-usuaris)
- [Compartició i col·laboració](#compartició-i-collaboració)
- [Registre d'activitat](#registre-dactivitat)
- [Webhooks](#webhooks)
- [Sincronització amb Git](#sincronització-amb-git)
- [Emmagatzematge de fitxers adjunts a S3](#emmagatzematge-de-fitxers-adjunts-a-s3)
- [Còpia de seguretat / Exportació](#còpia-de-seguretat--exportació)
- [Restauració / Importació](#restauració--importació)
- [Fora de línia](#fora-de-línia)
- [Diverses instàncies](#diverses-instàncies)
- [Assistent d'IA](#assistent-dia)
- [Transcripció (veu a text)](#transcripció-veu-a-text)
- [Servidor MCP](#servidor-mcp)
- [Aplicacions](#aplicacions)
- [Extensió per al Chrome](#extensió-per-al-chrome)
- [Comparteix al Poznote a l'Android](#comparteix-al-poznote-a-landroid)
- [Documentació de l'API](#documentació-de-lapi)
- [Tecnologies](#tecnologies)

## Instal·lació

> La imatge oficial és multiarquitectura (linux/amd64, linux/arm64) i funciona a Windows/macOS amb Docker Desktop, així com en dispositius ARM64 com Raspberry Pi, sistemes NAS, etc.

Trieu el vostre mètode d'instal·lació preferit:

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Pas 1: Requisit previ

Instal·leu i inicieu [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Pas 2: Desplegament del Poznote

Creeu un directori nou:

```powershell
mkdir poznote
```

Aneu al directori del Poznote:
```powershell
cd poznote
```

Creeu el fitxer d'entorn:

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Editeu el fitxer `.env`:

```powershell
notepad .env
```

Baixeu el fitxer de configuració de Docker Compose:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixeu les imatges més recents del Poznote Webserver i el Poznote MCP:
```powershell
docker compose pull
```

Inicieu els contenidors del Poznote:
```powershell
docker compose up -d
```

</details>

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### Pas 1: Requisit previ

1. Instal·leu [Docker Engine](https://docs.docker.com/engine/install/)
2. Instal·leu [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Pas 2: Instal·lació del Poznote

Creeu un directori nou:
```bash
mkdir poznote
```

Aneu al directori del Poznote:
```bash
cd poznote
```

Creeu el fitxer d'entorn:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Editeu el fitxer `.env`:
```bash
vi .env
```

Baixeu el fitxer de configuració de Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixeu les imatges més recents del Poznote Webserver i el Poznote MCP:
```bash
docker compose pull
```

Inicieu els contenidors del Poznote:
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Pas 1: Requisit previ

Instal·leu i inicieu [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### Pas 2: Desplegament del Poznote

Creeu un directori nou:
```bash
mkdir poznote
```

Aneu al directori del Poznote:
```bash
cd poznote
```

Baixeu el fitxer d'entorn:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Editeu el fitxer `.env`:
```bash
vi .env
```

Baixeu el fitxer de configuració de Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixeu les imatges més recents del Poznote Webserver i el Poznote MCP:
```bash
docker compose pull
```

Inicieu els contenidors del Poznote:
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Núvol</strong></summary><br>

No voleu gestionar un servidor? Una proveïdor d'allotjament pot executar el Poznote per vós i mantenir-lo en línia. Vegeu els proveïdors disponibles i com triar-ne un [aquí](https://poznote.com/hosting.html).

<p>
  <a href="https://www.pikapods.com/pods?run=poznote"><img src="https://www.pikapods.com/static/run-button.svg" alt="Executa a PikaPods" height="44"></a>
  <a href="https://calibernode.com/cloud-apps/poznote"><img src="../images/run-on-calibernode.svg" alt="Executa a Caliber Node" height="44"></a>
</p>

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

En un amfitrió Proxmox VE, el projecte Proxmox VE Community Scripts instal·la el Poznote en el seu propi contenidor amb una sola ordre, sense Docker: crea un LXC Debian 13 sense privilegis (1 vCPU, 512 MB de RAM i un disc de 4 GB per defecte) i serveix el Poznote amb nginx i PHP a dins.

Executeu això des de l'intèrpret d'ordres de l'amfitrió Proxmox:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

Aleshores el Poznote respon a `http://<container-ip>:8040`, amb les mateixes credencials per defecte que qualsevol altra instal·lació. Per actualitzar-lo més endavant, executeu `update` a la consola del contenidor.

Aquest script l'escriu i el manté la comunitat, no el Poznote. Consulteu la [pàgina de l'script del Poznote](https://community-scripts.org/scripts/poznote) per conèixer-ne les opcions i les notes.

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ Kubernetes amb Helm</strong></summary>

#### Pas 1: Requisit previ

Instal·leu [Helm](https://helm.sh/docs/intro/install/) i assegureu-vos que el context de Kubernetes apunta al clúster on voleu desplegar el Poznote.

#### Pas 2: Desplegament del Poznote

Afegiu el repositori de diagrames de HelmForge:

```bash
helm repo add helmforge https://repo.helmforge.dev
```

Actualitzeu l'índex local de diagrames:

```bash
helm repo update
```

Instal·leu el Poznote:

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

El chart de Helm del Poznote el manté la comunitat HelmForge com a opció d'instal·lació nativa de Kubernetes. Consulteu la [documentació del chart del Poznote de HelmForge](https://helmforge.dev/docs/charts/poznote) per als valors, la persistència, l'exposició del servei, les sondes, els contextos de seguretat i altres paràmetres orientats a producció.

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

El Poznote també ofereix una variant rooless de la imatge que s'executa completament com a usuari sense privilegis (uid/gid `1000`) en lloc de root, per als entorns que prohibeixen root dins dels contenidors (`PodSecurityStandard` restringit de Kubernetes, Podman rootless, `docker run --user`, etc.). Funciona exactament igual que la imatge per defecte; les úniques diferències són que escolta internament al port `8080` i que no pot corregir el propietari del directori de dades a l'inici.

#### Pas 1: Requisit previ

1. Instal·leu [Docker Engine](https://docs.docker.com/engine/install/)
2. Instal·leu [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Pas 2: Desplegament del Poznote

Creeu un directori nou:
```bash
mkdir poznote
```

Aneu al directori del Poznote:
```bash
cd poznote
```

Creeu el directori de dades i feu que pertanyi a l'uid/gid `1000` (**obligatori**: a diferència de la imatge per defecte, el contenidor rootless no pot corregir aquest propietari a l'inici):
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Sovint no cal `sudo` aquí: si el vostre usuari ja té l'uid `1000`, podeu ometre el `chown`, i amb Podman/Docker rootless es pot executar sense root; vegeu [Execució sense root](TROUBLESHOOTING.ca.md#running-rootless).

Creeu el fitxer d'entorn:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Editeu el fitxer `.env`:
```bash
vi .env
```

Baixeu el fitxer de configuració de Docker Compose rootless:
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

Baixeu les imatges més recents del Poznote Webserver rootless i el Poznote MCP:
```bash
docker compose -f docker-compose.rootless.yml pull
```

Inicieu els contenidors del Poznote:
```bash
docker compose -f docker-compose.rootless.yml up -d
```

Per migrar una instància del Poznote existent a la variant rootless, o per a més detalls, vegeu [Execució rootless](TROUBLESHOOTING.ca.md#running-rootless) a la guia de resolució de problemes.

</details>

<br>

> Si teniu problemes amb la instal·lació, consulteu la [guia de resolució de problemes](TROUBLESHOOTING.ca.md).

## Accés

Després de la instal·lació, accediu al Poznote amb el navegador web:

[http://localhost:8040](http://localhost:8040)


- Nom d'usuari: `admin_change_me`
- Contrasenya: `admin`
- Port: `8040`

Canvieu el nom del compte d'administrador per defecte i la contrasenya per defecte després del primer inici de sessió.

## Canvi de paràmetres

La majoria de paràmetres del dia a dia es canvien des de la interfície del Poznote. Feu servir el fitxer `.env` només per als valors de desplegament o d'execució que es llegeixen quan s'inicien els contenidors.

<details>
<summary><strong>Feu servir el fitxer <code>.env</code> per a</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- Substitucions opcionals en temps d'execució, com ara `POZNOTE_MCP_PORT` i `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN` per canviar el nombre de sol·licituds PHP simultànies (10 per defecte) en una instància amb molta activitat; vegeu la [guia de resolució de problemes](TROUBLESHOOTING.ca.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT` per canviar el límit de memòria de PHP per sol·licitud, en MB (512 per defecte); vegeu la [guia de resolució de problemes](TROUBLESHOOTING.ca.md#a-request-runs-out-of-memory)
- `POZNOTE_LISTEN_PORT` per canviar el port on escolta el servidor web dins del contenidor (80 per defecte), només necessari amb `network_mode: host`; vegeu la [guia de resolució de problemes](TROUBLESHOOTING.ca.md#running-with-host-network)
- `POZNOTE_SETTINGS_PASSWORD` per demanar una contrasenya addicional abans d'obrir la pàgina de paràmetres, buit per defecte
- `POZNOTE_MCP_AUTH_TOKEN` per exigir un testimoni Bearer als clients MCP; vegeu [Servidor MCP](#servidor-mcp)

</details>

<details>
<summary><strong>Feu servir la interfície per a</strong></summary>
<br>

- Paràmetres globals o d'administració, com ara els paràmetres del proveïdor OIDC, l'activació de la sincronització amb Git, els límits d'importació i la pujada de CSS personalitzat
- Paràmetres d'usuari o de perfil, com ara les contrasenyes dels comptes locals, el tema, les mides de lletra, l'ordenació de les notes, el fons de l'espai de treball i els elements de la interfície amagats

</details>


### Modificació dels paràmetres del sistema (`.env`)

Aneu al directori del Poznote:
```bash
cd poznote
```

Atureu els contenidors del Poznote en execució:
```bash
docker compose down
```

Editeu el fitxer `.env` amb l'editor de text que preferiu (p. ex. `nano .env` o `notepad .env`).

Deseu el fitxer i torneu a iniciar els contenidors per aplicar els canvis:
```bash
docker compose up -d
```

## Actualització de l'aplicació

Aneu al directori del Poznote:
```bash
cd poznote
```

Atureu els contenidors en execució abans d'actualitzar:
```bash
docker compose down
```

Baixeu la configuració de Docker Compose més recent:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixeu el `.env.template` més recent:
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Feu servir sdiff per revisar `.env.template` i afegir al vostre fitxer `.env` les variables noves, si cal:
```bash
sdiff .env .env.template
```

Baixeu les imatges més recents del Poznote Webserver i el Poznote MCP:
```bash
docker compose pull
```

Inicieu els contenidors actualitzats:
```bash
docker compose up -d
```

Les dades es conserven al directori `./data` i l'actualització no les afecta.

### Versions beta

Les versions beta porten funcions noves abans que es publiquin com a estables, i es llisten com a versions preliminars a la [pàgina de versions](https://github.com/timothepoznanski/poznote/releases). Es publiquen amb l'etiqueta `latest-and-beta`, que sempre apunta a la versió més recent, beta o estable.

Per fer-les servir, canvieu les dues línies `image` del `docker-compose.yml` i deixeu la resta del fitxer tal com és:
```yaml
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest-and-beta
    ...
  mcp-server:
    image: ghcr.io/timothepoznanski/poznote-mcp:latest-and-beta
    ...
```

Amb la variant [rootless](#rootless), la imatge del servidor web de `docker-compose.rootless.yml` passa a ser `poznote:latest-and-beta-rootless`, i la imatge MCP és la mateixa `poznote-mcp:latest-and-beta`.

Baixeu les imatges i reinicieu els contenidors:
```bash
docker compose pull
docker compose up -d
```

*   **Abans de canviar:** una beta encara pot contenir errors, de manera que primer feu una [còpia de seguretat](#còpia-de-seguretat--exportació). Podeu comunicar els problemes als [issues de GitHub](https://github.com/timothepoznanski/poznote/issues) o a [Discord](https://discord.gg/fuEV6uqf4N).
*   **Actualitzacions:** aleshores cada `docker compose pull` obté la beta més recent, o la versió estable quan es publica. El procediment d'actualització de més amunt baixa un `docker-compose.yml` nou que torna a fer servir les etiquetes estables, de manera que, després d'aquest pas, cal tornar a canviar les dues línies `image`.
*   **Tornar a la versió estable:** una beta pot canviar la base de dades, de manera que tornar a una versió estable anterior pot no funcionar. Espereu la versió estable següent, que inclou els canvis de la beta, i després seguiu el procediment d'actualització de més amunt.

## Autenticació

El Poznote admet diversos mètodes d'autenticació, com ara comptes locals i proveïdors d'identitat externs. Les aplicacions i les extensions que es comuniquen amb l'API REST fan servir [contrasenyes d'aplicació](#contrasenyes-daplicació), una credencial independent que es descriu a la secció següent.

<details>
<summary><strong>Autenticació amb comptes locals</strong></summary>
<br>

El Poznote autentica els usuaris en el seu perfil amb un nom d'usuari o una adreça electrònica i una contrasenya.

#### Compte per defecte

En una instal·lació nova, el Poznote crea un perfil d'administrador actiu:

- Nom d'usuari: `admin_change_me`
- Contrasenya: `admin`

Canvieu la contrasenya per defecte i el nom del compte després del primer inici de sessió.

#### Gestió de les contrasenyes

Les contrasenyes es gestionen des de la interfície web del Poznote, no des del `.env`:

- Els usuaris poden canviar la seva contrasenya des de **Paràmetres > Canvi de contrasenya**.
- Els administradors poden definir una contrasenya personalitzada per a qualsevol usuari o restablir-ne la contrasenya per defecte des de **Paràmetres > Eines d'administració > Gestió d'usuaris**.
- L'opció **Recorda'm durant 30 dies** conserva la sessió durant aquest temps.
- Canviar una contrasenya invalida les galetes de «Recorda'm» existents d'aquell usuari.

#### Autenticació de dos factors

Cada usuari pot activar l'autenticació de dos factors (TOTP) des de **Paràmetres > Autenticació de dos factors**. Aleshores, després de la contrasenya, el formulari d'inici de sessió demana un codi de 6 xifres d'una aplicació d'autenticació (Aegis, Google Authenticator, 1Password, Bitwarden...).

- La configuració mostra un codi QR, dibuixat al navegador, i deu codis de recuperació d'un sol ús per guardar per si es perd el telèfon.
- Protegeix l'inici de sessió amb contrasenya. Un inici de sessió SSO queda en mans del proveïdor d'identitat i del seu propi segon factor.
- Mentre està activada, l'API REST ja no accepta la contrasenya del compte sola: doneu als clients una [contrasenya d'aplicació](#contrasenyes-daplicació), o envieu el codi actual a la capçalera `X-Poznote-OTP`.
- Un administrador la pot desactivar per a un usuari que ha perdut el dispositiu i els codis de recuperació, des de **Paràmetres > Eines d'administració > Gestió d'usuaris** (diàleg de contrasenya).
- Un administrador la pot fer obligatòria per a tots els comptes que inicien la sessió amb contrasenya, des de **Paràmetres > Eines d'administració > Dos factors obligatoris**. Un compte que no la té la configura en el proper inici de sessió (codi QR i primer codi a la pàgina d'inici de sessió), les sessions obertes sense aquesta autenticació es tanquen i el titular ja no la pot desactivar. Els inicis de sessió amb SSO no s'hi veuen afectats.
- Activar-la o desactivar-la invalida les galetes de «Recorda'm» existents d'aquell usuari.

#### Contrasenyes per defecte

- Comptes d'administrador: `admin`
- Comptes d'usuari estàndard: `user`

Mentre un usuari no ha canviat la contrasenya, es fa servir el valor per defecte de més amunt. Quan es canvia una contrasenya des de la interfície, s'emmagatzema un resum bcrypt segur a la base de dades, que té prioritat.

</details>

<a id="oidc"></a>
<details>
<summary><strong>Autenticació OIDC / SSO (opcional)</strong></summary>
<br>

El Poznote admet OpenID Connect (codi d'autorització + PKCE) per a la integració de l'inici de sessió únic. Això permet que els usuaris iniciïn la sessió amb proveïdors d'identitat externs com Auth0, Keycloak, Azure AD o Google Identity.

#### Com funciona

1. La pàgina d'inici de sessió mostra un botó `Continua amb [Nom del proveïdor]` quan OIDC està activat.
2. Els usuaris s'autentiquen amb el flux de codi d'autorització d'OIDC protegit amb PKCE.
3. L'accés es pot restringir amb grups permesos i, si cal, amb una llista antiga d'usuaris permesos.
4. Després de l'autenticació, el Poznote vincula la identitat pel `sub` (`oidc_subject`) i, després, per una adreça electrònica verificada (definida per un administrador o sincronitzada des del proveïdor, sense distingir majúscules i minúscules). Un perfil existent no es vincula mai pel nom d'usuari: per vincular-ne un en el seu primer inici de sessió SSO, doneu-li l'adreça electrònica que envia el proveïdor o enganxeu-hi el seu subjecte OIDC a **Paràmetres > Eines d'administració > Gestió d'usuaris**. Un primer inici de sessió rebutjat registra el subjecte que cal enganxar.
5. Si la creació automàtica d'usuaris està activada i cap perfil no coincideix, el Poznote en crea un automàticament. Aquest perfil **no té cap contrasenya**: no ha passat pel lliurament de credencials inicials que fa un administrador en crear un compte, de manera que no respon a la contrasenya per defecte. L'inici de sessió passa pel proveïdor, o un administrador hi defineix una contrasenya explícita des de **Paràmetres > Eines d'administració > Gestió d'usuaris**.
6. Si `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, el formulari de nom d'usuari i contrasenya s'amaga i la pàgina d'inici de sessió passa a ser només SSO.
7. Els clients de l'API REST es poden autenticar amb `Authorization: Bearer <OIDC JWT>` quan OIDC està activat; el Poznote valida el JWKS del proveïdor, l'emissor, la caducitat, l'audiència i els controls d'accés configurats.
8. Els clients que no poden fer cap flux OIDC (extensió del navegador, aplicació mòbil, scripts) fan servir una [contrasenya d'aplicació](#contrasenyes-daplicació), que cada usuari crea des dels seus paràmetres.
9. L'[autenticació de dos factors](#autenticació-de-dos-factors) només cobreix el formulari de contrasenya: un inici de sessió SSO no demana mai el codi del Poznote. Exigiu un segon factor al proveïdor d'identitat. Un usuari que té alhora una contrasenya i una identitat SSO conserva totes dues entrades, i la SSO només és tan sòlida com la política del proveïdor.

#### Configuració

OIDC es configura des de la **interfície d'administració**: aneu a **Paràmetres > Eines d'administració > OIDC / SSO**.

La majoria de paràmetres (activació, emissor, nom del proveïdor, àmbits, control d'accés, grups i usuaris permesos, creació automàtica d'usuaris, comportament de l'autenticació HTTP Basic, etc.) es gestionen des d'aquesta pàgina i s'emmagatzemen a la base de dades.

Per a l'autenticació JWT Bearer de l'API REST, configureu **Audiència del JWT de l'API** si el proveïdor emet testimonis d'accés per a una audiència d'API específica. Quan és buida, el Poznote accepta l'identificador del client OIDC configurat com a audiència del JWT.

Els paràmetres següents es mantenen al fitxer `.env`:

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

Feu servir `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` si voleu amagar el formulari local de nom d'usuari i contrasenya i forçar l'inici de sessió només amb SSO. És l'únic interruptor que bloqueja l'autenticació amb contrasenya: elimina el formulari, rebutja al servidor els POST amb contrasenya i amaga el paràmetre «Canvi de contrasenya».

> **Recuperació després d'una caiguda del proveïdor d'identitat.** Només SSO vol dir exactament això: mentre `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, ningú no pot iniciar la sessió amb contrasenya, administradors inclosos, de manera que no hi ha cap sortida d'emergència des del navegador. És deliberat, perquè un atacant que hagués compromès un compte d'administrador no podria tornar a activar l'inici de sessió amb contrasenya per assegurar-se un accés persistent. La recuperació necessita accés al servidor: definiu `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false` al `.env`, reinicieu el contenidor i inicieu la sessió amb una contrasenya local. Abans d'activar el mode només SSO, assegureu-vos que almenys un compte d'administrador té una contrasenya explícita definida (**Paràmetres > Eines d'administració > Gestió d'usuaris**); si no, tornar a canviar l'indicador no servirà de res. Tingueu en compte que un perfil d'administrador creat automàticament per OIDC no té contrasenya fins que no se n'hi defineix una.

> **Canvi incompatible:** la configuració OIDC anterior del `.env` ja no es llegeix, excepte `POZNOTE_OIDC_CLIENT_ID`, `POZNOTE_OIDC_CLIENT_SECRET` i `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`. Després d'actualitzar, torneu a introduir els altres paràmetres OIDC des de la pàgina d'administració.

#### URL que cal registrar al proveïdor d'identitat

Quan creeu l'aplicació (client) al proveïdor d'identitat, registreu el primer URL de més avall com a URI de redirecció (també anomenat URL de retorn), i el segon com a URI de redirecció després de tancar la sessió si el proveïdor el demana:

```text
https://YOUR_SERVER/oidc_callback.php
https://YOUR_SERVER/login.php
```

El Poznote crea tots dos a partir del nom d'amfitrió per on arriba la sol·licitud, sempre amb `https://`. Si el proveïdor necessita una altra cosa, definiu **URI de redirecció** o **URI de redirecció després de tancar la sessió** a la secció Avançat de la pàgina d'administració d'OIDC, i registreu exactament aquest valor.

Normalment no cal omplir l'URL de descoberta: el Poznote afegeix `/.well-known/openid-configuration` a l'**URL de l'emissor**. Amb Authentik, per exemple, l'emissor és `https://AUTHENTIK_HOST/application/o/APPLICATION_SLUG/`. Definiu l'**URL de descoberta** només si el proveïdor publica aquest document en un altre lloc.

#### Exemple de control d'accés (grups + creació automàtica)

Des de la pàgina d'administració d'OIDC, configureu:
- **Declaració de grups:** `groups`
- **Grups permesos:** `poznote`
- **Creació automàtica d'usuaris:** activada

Si la creació automàtica està activada, el Poznote genera un nom d'usuari a partir de les declaracions OIDC (`preferred_username`, `nickname`, la part local de l'adreça electrònica, `name` i, després, `sub`) i desa el subjecte OIDC al perfil creat. Si un perfil existent que no ha iniciat mai la sessió amb SSO ja porta aquest `preferred_username`, l'inici de sessió es rebutja en lloc de crear-ne un segon al costat: doneu a aquell perfil l'adreça electrònica que envia el proveïdor, o el seu subjecte OIDC, perquè quedi vinculat.

</details>

## Contrasenyes d'aplicació

Les aplicacions no poden iniciar la sessió a través d'un proveïdor d'identitat com ho fa un navegador. Una **contrasenya d'aplicació** és una credencial independent que creeu per a un client (l'extensió del navegador, un telèfon, un script) i que podeu revocar en qualsevol moment, de manera que no heu de donar mai la contrasenya del compte.

Creeu-ne una des de **Paràmetres > Contrasenyes d'aplicació**: doneu-li un nom i, opcionalment, una caducitat, i copieu el secret generat. Només es mostra una vegada. Després, al client, introduïu el nom d'usuari de sempre i la contrasenya d'aplicació on demana una contrasenya. Viatja com a autenticació HTTP Basic normal, de manera que tots els clients existents funcionen tal com són:

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

Una contrasenya d'aplicació només accedeix a l'API REST, i només per al seu propi perfil: no pot obrir la interfície web, cridar un punt final d'administració, canviar la contrasenya ni gestionar el compte, encara que el compte sigui d'administrador. Per tant, si se'n filtra una, només exposa les notes d'un compte, i revocar-la tanca el forat. En una instància només SSO, on els comptes creats per OIDC no tenen cap contrasenya, és l'única credencial que l'API accepta amb l'autenticació Basic.

La llista completa de límits i els punts finals que gestionen les contrasenyes d'aplicació són a la [documentació de l'API REST](API-REST.md#authentication).

## Tipus de notes

El Poznote admet dos formats de nota principals, cadascun pensat per a una manera de treballar diferent.

<details>
<summary><strong>Notes de text enriquit</strong></summary>
&nbsp;

*   **Editor:** edició WYSIWYG (el que veieu és el que obteniu) directa.
*   **Emmagatzematge:** es desen com a fitxers `.html` al directori de dades de l'usuari. Com que són HTML estàndard, es poden obrir directament amb qualsevol navegador web.
*   **Funcions exclusives:**
    *   **Format enriquit:** compatibilitat nativa amb colors de text, ressaltat i elements HTML estàndard.
    *   **Interfície interactiva:** manipulació directa dels elements a l'editor.
</details>

<details>
<summary><strong>Notes Markdown</strong></summary>
&nbsp;

*   **Editor:** editor de sintaxi Markdown amb previsualització en temps real.
*   **Emmagatzematge:** es desen com a fitxers `.md` al directori de dades de l'usuari.
*   **Funcions exclusives:**
    *   **Diagrames Mermaid:** compatibilitat nativa per generar diagrames (diagrames de flux, de seqüència, etc.) amb blocs de codi ` ```mermaid `.
    *   **Equacions matemàtiques:** compatibilitat completa amb LaTeX per a fórmules matemàtiques amb la sintaxi `$ inline $` i `$$ block $$`.
    *   **Portabilitat:** format Markdown estàndard compatible amb qualsevol editor extern o generador de llocs estàtics.
</details>

<details>
<summary><strong>Llistes de tasques</strong></summary>
&nbsp;

*   **Ús:** gestioneu tasques i projectes amb llistes de comprovació interactives.
*   **Flux de treball:** seguiu el progrés amb caselles que es poden marcar directament a l'editor o a la llista de notes. Una barra de progrés mostra el grau de compleció de cada llista.
*   **Opcions de les tasques:** cada tasca pot tenir una data de venciment amb una hora opcional, una notificació de recordatori que s'activa a l'hora de venciment i una marca d'important, i es pot moure a una altra llista.
*   **Pàgina de tasques:** una pàgina Tasques específica, que s'obre des de la barra lateral d'icones de l'esquerra, reuneix en un sol lloc totes les tasques de les llistes de tasques i, opcionalment, les caselles que hi ha dins de les notes normals. Ofereix filtres d'estat (per fer, importants, vençudes, amb data de venciment, completades), un filtre de text i una visualització de calendari de les tasques que tenen data de venciment. Una llista de tasques, o les caselles d'una nota, es poden amagar de la pàgina amb el botó de l'ull de la seva capçalera i tornar a mostrar amb **Mostra les llistes amagades**. L'elecció es desa al compte, de manera que us segueix d'un dispositiu a l'altre.
*   **Col·laboració pública:** les llistes de tasques es poden compartir amb un URL públic. Si es donen permisos d'edició, els col·laboradors externs poden marcar elements de la llista sense necessitat de compte del Poznote.
</details>

<details>
<summary><strong>Dreceres</strong></summary>
&nbsp;

*   **Funcionalitat:** creeu una referència a una nota existent en una altra ubicació.
*   **Cas d'ús:** permet fer referència a una nota en dos llocs diferents alhora. Per exemple, una nota pot ser en una carpeta de classificació mentre la seva drecera apareix en un tauler Kanban per fer-ne el seguiment actiu.
</details>

<details>
<summary><strong>Plantilles</strong></summary>
&nbsp;

*   **Funcionalitat:** reutilitzeu contingut ja escrit per estandarditzar la documentació, des d'una nota completa fins a un fragment curt.
*   **Configuració:** poseu les notes que voleu reutilitzar en una carpeta anomenada `Templates` (les subcarpetes també valen). Un espai de treball anomenat `Templates` també funciona i s'ofereix des de tots els espais de treball. El nom també es reconeix en la llengua de la interfície (`Modèles`, `Vorlagen`, `Plantillas`, `Modelos`, `Шаблоны`, `模板`, `템플릿`, `テンプレート`, `Plantilles`).
*   **Inserció en una nota:** escriviu `/template` (o `/` seguit del títol de la plantilla) en una nota de text enriquit o Markdown i trieu una plantilla: el contingut s'enganxa al cursor, convertit si la plantilla i la nota no són del mateix tipus.
*   **Nota nova a partir d'una plantilla:** dupliqueu la nota de plantilla, o dupliqueu tota una carpeta `Templates` per començar un projecte amb una estructura de carpetes ja preparada.
</details>

<details>
<summary><strong>Notes diàries (diari)</strong></summary>
&nbsp;

*   **Ús:** escriviu una nota per dia, com en un diari, des d'un tauler de diari específic.
*   **Flux de treball:** el botó «Crea l'entrada d'avui» crea la nota d'avui (quan la nota ja existeix, diu «Ves a l'entrada d'avui»), amb la data actual com a títol i desada automàticament en una estructura de carpetes `Diary/YYYY/MM`.
*   **Un altre dia:** el botó del calendari del costat dels controls de visualització tria qualsevol dia, també als telèfons. Els dies que ja tenen una entrada es marquen amb un punt; si en trieu un, se n'obre l'entrada, i si trieu un altre dia, es crea l'entrada d'aquella data.
*   **Visualització de tauler:** les entrades es mostren com a targetes agrupades per mes, primer les més recents, amb un filtre per trobar ràpidament les entrades anteriors.
*   **Visualització de diari:** el botó del desplaçament del costat dels controls de visualització passa a una sola columna de lectura: totes les entrades amb el contingut complet, primer les més recents, que es carreguen a mesura que us desplaceu. El filtre també funciona allà. Feu clic a una entrada, o al seu llapis, per editar-la allà mateix; els canvis es desen a mesura que escriviu. El botó de l'etiqueta del costat del llapis converteix les etiquetes de l'entrada en un editor: afegiu o traieu etiquetes sense obrir la nota.
*   **Format:** les entrades noves es creen com a notes de text enriquit o Markdown, segons el paràmetre «Format de les entrades del diari» de **Paràmetres > Diari**.
*   **Plantilla:** per començar cada entrada nova amb el mateix contingut (títols, caselles...), deseu aquella nota en una carpeta anomenada `Templates` de l'espai de treball i trieu-la al paràmetre «Plantilla de les entrades del diari» de **Paràmetres > Diari**. Cada espai de treball té la seva plantilla, triada entre les seves pròpies notes: obriu els paràmetres des de l'espai de treball per definir-la. La plantilla es converteix quan el seu format és diferent del de l'entrada.
</details>

## Revisions

Les revisions conserven versions anteriors del contingut d'una nota, juntament amb el títol i les etiquetes, perquè les pugueu comparar amb la nota actual i tornar a un estat anterior. La icona de l'historial de la barra d'eines de la nota obre la pàgina **Revisions** de la nota.

<details>
<summary><strong>La pàgina Revisions</strong></summary>
<br>

*   **Historial:** la columna de l'esquerra llista les revisions de la nota agrupades per dia, cadascuna amb l'etiqueta Automàtica, Manual, Abans de l'edició de la IA o Abans de l'edició d'MCP. Una insígnia «Actual» marca les revisions idèntiques a la nota actual, i «Sense canvis», les idèntiques a la revisió anterior. Totes dues insígnies també exigeixen el mateix títol i les mateixes etiquetes.
*   **Contingut:** la pàgina s'obre en aquesta pestanya, que mostra la revisió seleccionada, renderitzada. Per a les notes Markdown, hi ha un commutador Previsualització/Font al costat de les pestanyes.
*   **Canvis:** la segona pestanya mostra una comparació línia per línia, amb les paraules canviades ressaltades, respecte a la versió actual, la revisió anterior o qualsevol altra revisió. La comparació es mostra Unificada o Una al costat de l'altra, les línies sense canvis es pleguen (feu-hi clic per desplegar-les), els botons de canvi anterior i següent salten d'un canvi a l'altre, i es compten les línies afegides i eliminades. Les notes Markdown es comparen pel codi font. Les notes de text enriquit es comparen pel text, de manera que un canvi només de format no es mostra. Damunt de la comparació, la pestanya mostra el canvi de títol (antic → nou) i les etiquetes afegides o eliminades entre les dues versions comparades.
*   **Accions:** el menú «Accions» conté «Restaura aquesta revisió», «Desa una revisió», «Copia el contingut» i «Suprimeix aquesta revisió». «Desa una revisió» desa immediatament el contingut actual; les altres entrades actuen sobre la revisió seleccionada.
*   **Restauració:** una restauració torna a la nota el contingut, el títol i les etiquetes de la revisió. L'estat que substitueix no es desa: si és important, primer deseu una revisió («Desa una revisió» al menú Accions, o **Ctrl+Alt+S**). Un títol restaurat segueix les regles de canvi de nom: si una altra nota de la mateixa carpeta ja té aquest títol, s'hi afegeix un sufix com ara «(1)». Una revisió desada abans que es registressin les etiquetes no té etiquetes i deixa intactes les etiquetes de la nota.

</details>

<details>
<summary><strong>Com funcionen les revisions</strong></summary>
<br>

*   **Automàtiques:** El Poznote desa una revisió quan es modifica una nota, no quan s'obre. Cada vegada que es desa un canvi del contingut, el títol o les etiquetes de la nota (el desament automàtic de l'editor, una tasca marcada, un dibuix desat, l'API REST, una edició des d'un enllaç de compartició pública), el Poznote primer conserva la nota tal com era just abans d'aquell canvi, tret que ja s'hagi pres una revisió d'aquella nota en els últims 10 minuts. Per tant, una revisió sempre conté l'estat anterior a un canvi, i una sessió d'edició produeix com a màxim una revisió automàtica cada 10 minuts. Obrir o llegir una nota no crea mai una revisió. No es desa res per a una nota buida, ni quan la revisió més recent ja conté exactament el contingut, el títol i les etiquetes actuals, de manera que l'historial no té duplicats. Aquestes revisions s'etiqueten com a «Automàtica» a l'historial, igual que les revisions que les versions anteriors del Poznote prenien en obrir una nota: segueixen les mateixes regles.
*   **Exemple:** editeu una nota de 9:00 a 9:35. L'historial obté revisions cap a les 9:00 (la nota abans que la toquéssiu), les 9:10, les 9:20 i les 9:30. Torneu a les 14:00 i canvieu una paraula: una revisió de les 14:00 conserva la nota tal com la vau deixar a les 9:35.
*   **A què podeu tornar:** l'estat en què deixeu una nota al final d'una sessió no es desa com a revisió en aquell moment, perquè és la nota mateixa. Es captura amb el primer canvi de la sessió següent, per molt més tard que sigui. Així, sempre podeu tornar a com era la nota abans de començar a editar-la avui i, dins d'una sessió llarga, a estats separats com a màxim uns 10 minuts. L'últim estat sempre és la nota mateixa: compareu qualsevol revisió amb «Versió actual» per veure què ha canviat des d'aleshores.
*   **Quant de temps es conserven les revisions automàtiques:** es conserven totes les revisions automàtiques de les últimes 24 hores. Més enllà de les 24 hores, només es conserva la revisió automàtica més recent de cada dia, durant 30 dies per defecte. Aquest nombre de dies es pot canviar a **Paràmetres > Revisions** (d'1 a 30). Si ja havíeu canviat aquest paràmetre en una versió anterior, en què comptava revisions, el vostre valor es conserva i ara compta dies.
*   **Manuals:** «Desa una revisió» afegeix una revisió en qualsevol moment, i també **Ctrl+Alt+S** (Cmd+Alt+S al Mac) mentre hi ha una nota oberta. Les revisions manuals són il·limitades i no s'esporgen mai: només desapareixen quan caduquen, al cap de 30 dies.
*   **Abans d'una edició de la IA:** es desa automàticament una revisió just abans que l'[assistent d'IA](#assistent-dia) o el [servidor MCP](#servidor-mcp) canviïn el contingut d'una nota, fins i tot quan s'ha pres una revisió automàtica fa menys de 10 minuts, de manera que una reescriptura que surt malament es pot desfer amb un clic. Aquestes revisions s'etiqueten com a «Abans de l'edició de la IA» o «Abans de l'edició d'MCP» a l'historial i s'ometen quan l'última revisió ja conté el mateix contingut, títol i etiquetes.
*   **Revisions de seguretat:** les revisions «Abans de l'edició de la IA» i «Abans de l'edició d'MCP» comparteixen un límit: es conserven les 20 més recents per nota, un nombre que podeu canviar a **Paràmetres → Revisions** (d'1 a 200) si la instància edita moltes notes amb IA o MCP.
*   **Caducitat:** totes les revisions, de qualsevol tipus, se suprimeixen 30 dies després de desar-se. Una revisió també es pot suprimir a mà des de la pàgina Revisions.
*   **Fitxers adjunts i imatges:** les revisions emmagatzemen el text, el títol i les etiquetes de la nota, mai els seus fitxers. Els fitxers adjunts no es copien mai, de manera que un fitxer referenciat per diverses revisions existeix una sola vegada al disc. Un fitxer eliminat d'una nota es queda al disc, amagat de la nota, mentre alguna revisió encara el contingui, de manera que restaurar aquella revisió el recupera. Se suprimeix definitivament quan caduca o se suprimeix l'última revisió que el conté, o quan la nota se suprimeix permanentment. Per tant, conservar més revisions no duplica mai fitxers. Només conserva més temps els fitxers eliminats, 30 dies com a màxim.
*   **API i MCP:** l'[API REST](API-REST.md#snapshots) i les eines del [servidor MCP](#servidor-mcp) encara anomenen les revisions «snapshots» (`/notes/{id}/snapshots`, `list_snapshots`, `get_snapshot`, `restore_snapshot`).

</details>

## Personalització

El Poznote ofereix diverses opcions de personalització integrades directament a l'aplicació, sense haver de canviar cap fitxer de configuració.

<details>
<summary><strong>Paràmetres de visualització, de comportament i de Markdown</strong></summary>
<br>

A **Paràmetres > Visualització**, podeu configurar:

- **Tipus de lletra de l'aplicació:** trieu el tipus de lletra de tota la interfície
- **Mida de la lletra:** ajusteu la mida del text de les notes, la barra lateral, els blocs de codi i la pàgina de paràmetres
- **Colors de les notes:** trieu la paleta que s'ofereix per acolorir una nota
- **Icones per tipus de nota:** doneu a les llistes de tasques i a les notes Markdown la seva pròpia icona a la llista de notes
- **Escala de les icones de l'índex:** canvieu la mida de les icones de l'índex de notes
- **Disposició de la barra lateral d'icones:** reordeneu els botons de la barra lateral d'icones de l'esquerra i canvieu-ne els colors (un clic amb el botó dret en un botó de la barra també obre el selector de color)
- **Amplada del contingut de la nota:** controleu l'amplada màxima de l'àrea de l'editor de notes
- **Previsualitzacions dels fitxers adjunts:** mostreu els fitxers adjunts com a previsualitzacions dins de la nota
- **Vora de les imatges per defecte:** emmarqueu les imatges inserides sense afegir-hi farciment
- **Ressalta l'arbre de la carpeta actual:** atenueu les notes i les carpetes que queden fora de la jerarquia de carpetes en què treballeu
- **Títol de la pàgina d'inici de sessió:** canvieu el títol que es mostra a la pàgina d'inici de sessió
- **Visibilitat dels elements:** amagueu els elements de la interfície que no feu servir; vegeu més avall

A **Paràmetres > Comportament**, podeu configurar:

- **Ordenació de les notes:** trieu com s'ordenen les notes a la llista
- **Filtre per antiguitat de les notes:** llisteu només les notes actualitzades dins del nombre de dies triat
- **Revisions:** durant quants dies es conserven les revisions automàtiques (una per dia més enllà de les últimes 24 hores) i quantes revisions de seguretat es conserven per nota
- **Ordre d'inserció a les llistes de tasques:** controleu on s'insereixen les tasques noves
- **Mostra les notes després de les carpetes:** llisteu les notes sense carpeta sota la llista de carpetes
- **Ajust de línia als blocs de codi:** activeu o desactiveu l'ajust de línia als blocs de codi
- **Format de les entrades del diari:** creeu les entrades del diari com a notes de text enriquit o Markdown
- **Plantilla de les entrades del diari:** una nota de la carpeta `Templates` de l'espai de treball amb la qual comença cada entrada nova del diari d'aquell espai de treball
- La llengua de la interfície, el fus horari i el format de data, els fitxers adjunts i els enllaços entrants a la part inferior d'una nota, la correcció ortogràfica i les dreceres de teclat

A **Paràmetres > Markdown**, podeu configurar el mode de visualització per defecte, les visualitzacions per les quals passa el botó de visualització d'una nota (previsualització en directe, text enriquit, dividida), el tipus de lletra de l'editor, el Markdown amb marc i acolorit, i els números de línia dels blocs de codi.

El tema no és una targeta aquí: el botó de la part inferior de la barra lateral d'icones de l'esquerra passa d'un tema a l'altre, i un administrador tria quins ofereix a **Paràmetres > Eines d'administració > Llista de temes**.

</details>

<details>
<summary><strong>Imatge de fons de l'espai de treball</strong></summary>
<br>

Podeu definir una imatge de fons per a cada espai de treball: obriu **Paràmetres > Espais de treball** i feu servir l'acció **Fons** de l'espai de treball per pujar una imatge i ajustar-ne l'opacitat, de manera que cada espai de treball tingui la seva pròpia identitat visual.

</details>

<details>
<summary><strong>Visibilitat dels elements</strong></summary>
<br>

El Poznote permet simplificar la interfície amagant els elements que no feu servir.

Configureu-ho a **Paràmetres > Visualització > Visibilitat dels elements**.

- **Control detallat:** mostreu o amagueu les targetes de l'inici, les accions de la barra d'eines, els elements del menú de barra i molt més. La insígnia de la data de creació de les notes (**Mostra la data de creació**) i el nombre de notes al costat de cada carpeta (**Mostra el nombre de notes de les carpetes**) també s'activen i es desactiven aquí.
- **Per usuari:** cada usuari pot tenir la seva pròpia disposició de la interfície.
- **Administradors:** el mateix diàleg mostra una segona columna «Usuaris» al costat de la columna «Jo» de l'administrador, per amagar elements a tots els usuaris de la instància (excepte els administradors).
- **Amb cerca:** trobeu fàcilment l'element que voleu amagar amb el filtre del diàleg de configuració.

</details>

<details>
<summary><strong>Tipus de lletra personalitzats</strong></summary>
<br>

El Poznote inclou Inter i pot fer servir els tipus de lletra instal·lats al dispositiu. Per fer servir qualsevol altre tipus de lletra, per exemple una família de Google Fonts, un administrador en puja els fitxers una vegada i, després, tots els usuaris la poden triar.

Pugeu-los a **Paràmetres > Eines d'administració > Tipus de lletra personalitzats** i trieu el tipus de lletra a **Paràmetres > Visualització > Tipus de lletra de l'aplicació** o a **Paràmetres > Markdown > Tipus de lletra de l'editor Markdown**.

Notes:

- Els formats acceptats són WOFF2, WOFF, TTF i OTF, fins a 10 MB per fitxer.
- Una família són diversos fitxers (normal, negreta, cursiva...) o un únic fitxer de tipus de lletra variable. Seleccioneu tots els fitxers d'una família en una sola pujada; s'agrupen amb el nom de la família.
- Els tipus de lletra els serveix la vostra pròpia instància; no es carrega res de Google ni de cap altre tercer. Primer baixeu la família, de [Google Fonts](https://fonts.google.com) (**Get font > Download all**) o de [google-webfonts-helper](https://gwfh.mranftl.com/fonts).
- Una família sense fitxer de negreta manté el tipus de lletra per defecte per al text en negreta i els títols, així que pugeu també el fitxer de negreta.
- Els fitxers s'emmagatzemen a `data/fonts/` (el vostre volum de Docker), de manera que sobreviuen a les actualitzacions de la imatge. Els fitxers que s'hi copien a mà es detecten quan s'obre el diàleg **Tipus de lletra personalitzats**.
- Cada usuari tria el seu tipus de lletra. Suprimir una família torna al tipus de lletra per defecte els usuaris que l'havien triada.
- Només els administradors poden pujar o suprimir tipus de lletra.

</details>

<details>
<summary><strong>Substitucions amb CSS personalitzat</strong></summary>
<br>

Si voleu ajustar els tipus de lletra, l'espaiat o altres detalls visuals més enllà de les opcions integrades, podeu pujar fulls d'estil addicionals que s'apliquen a totes les pàgines HTML per a tots els usuaris.

Configureu-los a **Paràmetres > Eines d'administració > Camí del CSS personalitzat**.

Notes:

- Feu clic a **Puja un fitxer CSS** per seleccionar un fitxer `.css` de l'ordinador.
- Tots els fitxers pujats es conserven, de manera que podeu emmagatzemar diversos temes i canviar d'un a l'altre sense tornar-los a pujar.
- El diàleg llista el que hi ha emmagatzemat: trieu el que voleu aplicar a tots els usuaris, o **Sense CSS personalitzat** per tornar a l'aspecte integrat, i feu clic a **Desa**.
- Si pugeu un fitxer amb el nom d'un que ja hi ha emmagatzemat, aquell tema se substitueix.
- Els fitxers s'emmagatzemen a `data/css/` (el vostre volum de Docker), de manera que sobreviuen a les actualitzacions de la imatge.
- Feu clic a la icona de la paperera del costat d'un tema per suprimir aquell fitxer del volum.
- El Poznote hi afegeix automàticament un paràmetre `v=` per invalidar la memòria cau.
- El full d'estil s'injecta cap al final de `<head>`, de manera que pot substituir els estils per defecte de l'aplicació.
- Només els administradors poden pujar, aplicar o suprimir un fitxer CSS personalitzat.

### La llista de temes

**Paràmetres > Eines d'administració > Llista de temes** indica per quins temes passa el botó de tema de la part inferior de la barra d'icones: un tema per clic, en l'ordre que es mostra.

- Marqueu els temes integrats que voleu conservar i deixeu fora els que no fa servir ningú.
- Marqueu un fitxer CSS emmagatzemat per oferir-lo com a tema propi. Té una icona de paleta i el nom del fitxer.
- Feu servir les fletxes per definir l'ordre en què hi passa el botó.
- Un tema personalitzat pinta sobre una base clara o fosca, cosa que el fitxer no pot indicar sol: trieu-la al costat del fitxer. És el valor que pren `data-theme`, de manera que un full d'estil escrit per al mode fosc aquí necessita **Fosc**.
- La llista és un paràmetre global, de manera que tothom passa pels mateixos temes; quin s'aplica continua sent l'elecció de cada usuari.
- Qui faci servir un tema que traieu de la llista obté immediatament el primer tema de la llista.
- Triar un tema personalitzat carrega aquell fitxer només per a aquell usuari, en lloc del full d'estil aplicat a tota la instància.
- Suprimir un fitxer CSS també el treu de la llista.
- Amb un sol tema a la llista no hi ha cap altre tema al qual passar, de manera que el botó obre aquesta llista per a un administrador i no fa res per a la resta.

**Abans d'escriure cap CSS**, comproveu si un tema integrat ja fa el que voleu: el botó de tema de la part inferior de la barra d'icones passa per Clar, Fosc, Negre, Lavanda, Sèpia i Terminal.

### Exemples

Els colors, l'espaiat, els radis i els gruixos de lletra són tokens de disseny, de manera que la majoria de canvis són una llista curta de variables substituïdes en lloc d'una lluita amb els selectors. La llista completa és a `src/public/css/tokens.css`.

**Canvi del color d'èmfasi**

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

Dos tokens en lloc d'un perquè un *emplenament* i una *etiqueta* no poden ser del mateix color: `--pz-accent` emplena els botons, i `--pz-accent-text` és el color d'èmfasi per al text, les icones i els contorns. En un tema clar segueix `--pz-accent` per si sol; un fons fosc necessita un valor més clar. Cada token conserva el mateix nom `--pz-*` a tots els temes; només en canvia el valor. Els noms `--dm-*` dels fulls d'estil antics continuen funcionant.

**Canvi del color de les icones de la barra d'eines de la nota**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

Les icones són màscares CSS pintades amb `background-color: currentColor`, de manera que `color` és tot el que cal. Aquí cal `!important` perquè algunes d'aquestes icones ja tenen un color propi (l'estrella quan una nota és preferida, la icona de compartir quan està publicada, el clip quan té fitxers adjunts).

No cal CSS per acolorir una sola icona: feu-hi clic amb el botó dret a la barra d'eines de la nota o a la barra d'icones i trieu un color. Aquests colors es desen per usuari i no toquen els colors d'estat de més amunt.

**Donar un to càlid a tota la interfície**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**Escriptura d'un tema complet**

Substituïu els tokens a `:root` per al mode clar i a `:root[data-theme='dark']` per al fosc, i res més. `src/public/css/README.md` documenta tots els tokens i mostra un exemple complet; els temes integrats Lavanda, Sèpia i Terminal de `src/public/css/tokens.css` són el mateix, escrits de la mateixa manera.

</details>

## Diversos usuaris

> No s'ha de confondre amb la funció [Diverses instàncies](#diverses-instàncies).

El Poznote admet diversos usuaris: cada perfil té les seves notes, espais de treball, etiquetes, carpetes, fitxers adjunts i paràmetres, i inicia la sessió amb el seu propi nom d'usuari o adreça electrònica i contrasenya.

- **Gestió d'usuaris**: els administradors creen, desactiven i gestionen els perfils des de **Paràmetres > Eines d'administració > Gestió d'usuaris**, i poden donar a un usuari accés al compte d'un altre sense transferir-ne la propietat.
- **Compartició i col·laboració**: els espais de treball, les notes i les carpetes es poden compartir amb els altres usuaris de la instància; vegeu [Compartició i col·laboració](#compartició-i-collaboració).
- **Aïllament d'inquilins (mode SaaS)**: els administradors poden impedir que els usuaris que no són administradors descobreixin els altres comptes de la instància, que hi comparteixin contingut o que registrin webhooks personals. Deixeu-ho tot desmarcat en una instància familiar o d'equip.
- **Accés a la xarxa local**: els usuaris que no són administradors només poden connectar els webhooks, la sincronització amb Git i els seus propis servidors d'IA, de transcripció o MCP a amfitrions públics d'Internet, a part dels amfitrions locals que permeti un administrador; vegeu [Accés a la xarxa local per als usuaris que no són administradors](#local-network-access).

<a id="local-network-access"></a>
<details>
<summary><strong>Accés a la xarxa local per als usuaris que no són administradors</strong></summary>
<br>

Algunes funcions fan que el mateix servidor del Poznote es connecti a una adreça escrita per un usuari: els webhooks, la sincronització amb Git i els seus propis servidors d'IA, de transcripció o MCP. La sol·licitud surt del servidor, no del navegador de l'usuari. Sense cap límit, qualsevol compte podria fer servir el Poznote per accedir al mateix servidor, als altres contenidors Docker, a la vostra xarxa local o a un servei de metadades del núvol, llocs als quals no pot accedir pel seu compte.

Per això, la regla depèn de qui ha escrit l'adreça:

- **Els administradors** no tenen límits: ja controlen el servidor.
- **Els altres usuaris** només poden fer servir amfitrions públics d'Internet. Es rebutja qualsevol adreça local o privada: `localhost` i `127.0.0.1`, `10.x.x.x`, de `172.16.x.x` a `172.31.x.x`, `192.168.x.x`, `169.254.x.x`, les adreces IPv6 locals (`fc00::/7`, `fe80::/10`) i qualsevol nom que apunti a una d'aquestes adreces, com ara el nom d'un altre servei de Docker.

El que un administrador defineix per a tota la instància (l'assistent d'IA, la transcripció, els webhooks d'administració, S3, OIDC, SMTP) no s'hi veu afectat.

En una instància familiar o d'equip, els usuaris poden necessitar un servidor de la vostra xarxa, per exemple un servidor d'Ollama per a la seva IA personal o n8n per als seus webhooks. Llisteu aquests amfitrions a **Paràmetres > Eines d'administració > Integracions > Accés a la xarxa local**, una entrada per línia:

| Entrada | Què permet |
|---|---|
| `ollama` o `ollama.lan` | aquest nom d'amfitrió, sigui quina sigui l'adreça a la qual apunti (el nom d'un servei de Docker funciona) |
| `*.home.arpa` | tots els noms d'amfitrió d'aquest domini |
| `192.168.1.20` | aquesta adreça |
| `192.168.1.0/24` | totes les adreces d'aquesta xarxa (IPv6 també funciona, `fd00::/8`) |

Una entrada permet tots els ports d'aquell amfitrió. Les entrades no vàlides es rebutgen en desar, amb la llista de les que cal corregir. La targeta mostra **Només públics** mentre la llista és buida, i el nombre d'entrades en els altres casos.

Convé saber:

- Un nom d'amfitrió de la llista s'ha de poder resoldre des de dins del contenidor del Poznote, no només des del vostre ordinador. El Poznote no pot resoldre un nom que només coneixen el vostre ordinador o l'encaminador, i el rebutja com qualsevol nom desconegut: introduïu-ne l'adreça o la xarxa.
- L'adreça es torna a comprovar a cada connexió, no només quan es desa: eliminar una entrada té efecte immediatament, i un nom que més endavant apunti a una adreça local es rebutja.
- Per als usuaris que no són administradors, el Poznote no segueix les redireccions, excepte a la sincronització amb Git, que torna a comprovar cada pas de la redirecció.

</details>

<details>
<summary><strong>Organització de les dades al disc</strong></summary>
<br>

El Poznote fa servir una base de dades principal (`data/master.db`) per a les dades de coordinació compartides, i bases de dades i fitxers separats per usuari per al contingut real de les notes.

```
data/
├── master.db                    # Profiles, global settings, shared links, account access, edit locks
├── css/                         # Custom CSS files uploaded by an administrator
├── fonts/                       # Custom fonts uploaded by an administrator
├── backups/                     # Scheduled local backups, one folder per user ID
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/poznote.db  # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   ├── attachments/         # User's attachments
    │   ├── snapshots/           # Earlier versions of the user's notes (revisions)
    │   ├── backgrounds/         # Workspace background images
    │   └── backups/             # Backup archives prepared for download
    ├── 2/                       # User ID 2
    └── ...
```

</details>

## Compartició i col·laboració

El Poznote ofereix diverses maneres de treballar amb els altres usuaris de la instància, i cada persona conserva el seu propi compte. Per a un espai comú (família, amics, un equip), compartiu un espai de treball.

- **Compartir un espai de treball**: el propietari obre **Paràmetres > Espais de treball** i fa clic a **Comparteix** a la fila de l'espai de treball (la icona de compartir, o la primera entrada del menú **...**), i després tria els usuaris. Aquests troben l'espai de treball al seu menú d'espais de treball, a **Compartits amb mi**, i n'editen les notes i les carpetes amb l'editor complet, amb el mateix accés d'escriptura que el propietari. Els altres espais de treball, els paràmetres, la paperera i les còpies de seguretat del propietari continuen sent privats. En un espai de treball compartit, escriure `@username` en una nota menciona aquella persona, que la troba a la seva pàgina **Mencions**. Quan la instància envia correus (SMTP), cada membre pot activar **Paràmetres > Espais de treball > Correus dels espais de treball compartits** per rebre la llista de notes que els altres hi han creat, editat o suprimit, uns minuts després dels canvis, o com a resum enviat cada dia a les 8:00 o cada dilluns a les 8:00 (en el fus horari del membre).
- **Compartir una nota o una carpeta**: **Comparteix**, al menú de la nota o de la carpeta, crea un enllaç només a aquella nota o carpeta. L'enllaç pot ser públic, estar protegit amb una contrasenya o restringit a alguns usuaris de la instància, que inicien la sessió per obrir-lo, i pot permetre l'edició. La pàgina **Comparticions** de la barra d'icones llista les vostres comparticions, i el que els altres han compartit amb vós a **Compartits amb mi**.
- **Donar accés a tot un compte**: un administrador pot permetre que un usuari obri el compte d'un altre usuari des de **Paràmetres > Eines d'administració > Gestió d'usuaris**, sense transferir-ne la propietat. L'usuari hi canvia des de la secció **Comptes** del menú d'espais de treball.
- **Editar la mateixa nota**: només una persona edita alhora. Quan una nota està bloquejada, el bàner de només lectura ofereix **Pren el control**: la pantalla de l'editor anterior passa a només lectura i els seus canvis no desats es queden al seu navegador, i se li tornen a oferir quan la nota queda lliure. Una nota oberta recull en pocs segons els canvis fets en un altre lloc. En una nota **Markdown** amb edicions no desades a tots dos costats, els dos conjunts de canvis es combinen automàticament quan toquen línies diferents, i un bàner us permet triar quan se superposen. Les notes de text enriquit no es combinen mai: trieu quina versió voleu conservar. Poseu els scripts i altre codi en blocs de codi delimitats (```` ``` ````): l'HTML sense processar fora d'un bloc de codi se sanititza en desar, cosa que pot fer que una combinació que seria neta sembli un conflicte.

## Registre d'activitat

El Poznote conserva un historial de les operacions delicades fetes a la instància, perquè els administradors puguin veure què ha passat, quan i qui ho ha fet: inicis i tancaments de sessió, canvis de comptes i de quotes, creació i compartició d'espais de treball, còpies de seguretat i restauracions, buidatges de la paperera i supressions permanents, contrasenyes d'aplicació. És disponible a **Paràmetres > Eines d'administració > Registre d'activitat**, només per als administradors, i la icona d'ajuda de la part superior de la pàgina llista totes les operacions registrades.

El registre anota que s'ha fet una operació, no les dades que ha tocat: el contingut de les notes i les contrasenyes no s'hi escriuen mai, i l'activitat habitual, com escriure una nota o moure-la a la paperera, en queda fora. Les entrades es conserven 90 dies per defecte (30, 90, 365 dies o il·limitat), i el registre es pot buidar des de la mateixa pàgina.

## Webhooks

El Poznote pot avisar serveis externs quan passa alguna cosa a la instància, enviant webhooks de sortida (sol·licituds HTTP POST amb una càrrega útil JSON) als punts finals que registreu, de manera que es connecta a eines d'automatització com ara n8n, Zapier o els vostres propis scripts. Els administradors registren els esdeveniments de la instància (comptes, quotes, registres) a **Paràmetres > Eines d'administració > Webhooks d'administració**, i cada usuari pot registrar punts finals per a les seves notes i recordatoris a **Paràmetres > Webhooks d'usuari**.

Els lliuraments se signen amb HMAC-SHA256 quan el webhook té un secret, i el contingut de les notes no s'envia mai. Tots els esdeveniments, els camps de la càrrega útil, la verificació de la signatura i les garanties de lliurament es descriuen a la **[documentació dels webhooks](WEBHOOKS.ca.md)**.

## Sincronització amb Git

El Poznote admet la sincronització automàtica i manual amb **GitHub**, **GitLab** (gitlab.com o una instància autoallotjada) o **Forgejo**. Cada usuari configura el seu propi repositori de manera independent. No hi ha cap repositori global compartit.

La sincronització amb Git es comunica amb l'API REST del proveïdor per HTTPS, de manera que l'autenticació sempre es basa en testimonis. No es fan servir claus SSH.

<details>
<summary><strong>Com configurar la sincronització amb Git</strong></summary>
<br>

**Pas 1: activeu la funció (administrador, a Paràmetres > Eines d'administració)**

Activeu **Sincronització amb Git** a la secció **Eines d'administració** de la pàgina de paràmetres. Això activa la sincronització amb Git globalment i fa que la targeta i la configuració **Sincronització amb Git** de cada usuari estiguin disponibles a **Paràmetres**.

---

**Pas 2: cada usuari configura el seu propi repositori (Paràmetres > Sincronització amb Git)**

| Camp | Descripció |
|---|---|
| Proveïdor | `GitHub`, `GitLab` o `Forgejo` |
| URL base de l'API | GitHub: s'omple automàticament (només lectura). GitLab: `https://gitlab.com/api/v4`, o l'URL de la vostra instància, p. ex. `https://gitlab.example.com/api/v4`. Forgejo: l'URL de la vostra instància, p. ex. `https://forgejo.example.com/api/v1` |
| Testimoni d'accés | PAT de GitHub (`ghp_...`), testimoni de GitLab amb l'àmbit `api` (`glpat-...`, testimoni d'accés personal o de projecte) o testimoni de Forgejo (Settings > Applications) |
| Repositori | Format `owner/repo`. GitLab: el camí complet del projecte, subgrups inclosos, p. ex. `group/subgroup/project` |
| Branca | Per defecte: `main` |
| Nom / adreça electrònica de l'autor | Es fan servir per a les metadades de les confirmacions |

> 🔒 Els testimonis d'accés s'emmagatzemen xifrats amb AES-256-GCM. Es genera automàticament una clau de xifratge, que es desa a `data/.app_secret`.

---

**Sincronització automàtica**

Quan l'usuari l'activa, el Poznote automàticament:
- **Obté** els canvis en iniciar la sessió
- **Envia** a cada creació, actualització o supressió d'una nota

L'enviament i l'obtenció manuals també estan disponibles amb els botons **Envia** i **Obtén** de la barra lateral d'icones de l'esquerra.

---

**Espais de treball sincronitzats**

Per defecte es sincronitzen tots els espais de treball. A **Paràmetres > Sincronització amb Git**, cada usuari pot limitar la sincronització amb Git als espais de treball seleccionats:

- Només s'envien i s'obtenen les notes i els fitxers adjunts dels espais de treball seleccionats.
- Una obtenció no toca mai les notes dels altres espais de treball.
- Un enviament elimina els fitxers del repositori que queden fora dels espais de treball seleccionats, de manera que el repositori sempre reflecteix exactament el conjunt sincronitzat.
- Els botons Envia i Obtén de la barra lateral, l'enviament automàtic i la pregunta d'obtenció només apareixen mentre es mostra un espai de treball sincronitzat.

</details>

## Emmagatzematge de fitxers adjunts a S3

Per defecte, els fitxers adjunts de les notes s'emmagatzemen al disc local. Els administradors poden emmagatzemar-los en un emmagatzematge d'objectes compatible amb S3 (AWS S3, MinIO, Garage, Cloudflare R2, Backblaze B2...). El paràmetre s'aplica a tots els usuaris de la instància.

<details>
<summary><strong>Com configurar l'emmagatzematge S3</strong></summary>
<br>

Configureu-lo a **Paràmetres > Fitxers adjunts a S3** (només administradors).

- **Configuració**: URL del punt final, regió, cubell, clau d'accés, clau secreta i adreçament d'estil de camí, amb una prova de connexió integrada.
- **Migració**: moveu els fitxers adjunts existents entre el disc local i el cubell, en tots dos sentits i per a tots els usuaris. La migració s'executa per lots i es pot interrompre i reprendre amb seguretat.
- **Privadesa**: els fitxers adjunts s'emmagatzemen a `attachments/{user id}/` al cubell i sempre se serveixen a través del Poznote, de manera que el cubell pot continuar sent privat.
- **Quotes**: es pot definir una quota d'emmagatzematge S3 per usuari, i l'ús d'S3 apareix a les estadístiques d'emmagatzematge de l'administració.
- **Còpies de seguretat**: les exportacions ZIP inclouen per defecte els fitxers adjunts d'S3 (obtinguts del cubell al moment), tant si es fan des de la finestra de còpia de seguretat com mitjançant l'API REST o amb les còpies de seguretat automàtiques a S3. Una opció de la finestra de còpia de seguretat permet deixar-los fora per obtenir un arxiu més lleuger. Si no es pot llegir el cubell mentre es genera un arxiu, l'exportació falla amb un error en lloc de produir un arxiu al qual faltin fitxers.

Restaurar una còpia de seguretat a la qual falten alguns dels fitxers adjunts que referencia es rebutja mentre l'emmagatzematge S3 està activat, perquè una restauració completa substitueix el contingut del cubell i els fitxers que falten es perdrien. Hi ha dues maneres de restaurar una còpia de seguretat com aquesta:

- **La més fàcil**: desactiveu el commutador «Emmagatzema els fitxers adjunts a S3» (conserveu les credencials), restaureu la còpia de seguretat i torneu a activar el commutador. Una restauració en mode local no toca mai el cubell, i els fitxers adjunts que encara hi són emmagatzemats es continuen servint. També és el camí correcte en un servidor nou quan el cubell està intacte, perquè l'exportació de fitxers adjunts de l'altra opció necessita una instància que encara conegui les notes.
- **Reconstruir un arxiu complet**:
  1. Baixeu l'**Exportació de fitxers adjunts** des de la finestra de còpia de seguretat: conté tots els fitxers adjunts del compte en una carpeta `files/`.
  2. Descomprimiu la còpia de seguretat, copieu els fitxers de `files/` a la carpeta `attachments/` de la còpia i torneu-la a comprimir. Aneu amb compte en tornar a comprimir: seleccioneu el contingut de la còpia (`database/`, `entries/`, `attachments/`...) i comprimiu aquesta selecció, no la carpeta que el conté. Les carpetes han de ser a l'arrel del zip; si no, la restauració indica que falta `database/poznote_backup.sql`.
  3. Restaureu el zip reconstruït amb normalitat.

> La sincronització amb Git ignora els fitxers adjunts mentre l'emmagatzematge S3 està activat.

</details>

## Còpia de seguretat / Exportació

El Poznote pot fer còpies de seguretat d'un compte de diverses maneres. Totes produeixen el mateix arxiu ZIP (base de dades, notes i fitxers adjunts, amb un `index.html` a l'arrel per navegar-hi fora de línia), i la pàgina [Restauració / Importació](#restauració--importació) les accepta totes:

- **Manualment**, com a baixada des de Paràmetres > Còpia de seguretat / Exportació.
- **De manera planificada**, a una carpeta del servidor o a un cubell compatible amb S3, configurat per un administrador.
- **Des d'un script**, mitjançant l'API REST, per exemple amb l'script bash de més avall.

Cada opció es detalla més avall, i les notes individuals també es poden exportar per separat.

<a id="complete-backup"></a>
<details>
<summary><strong>Còpia de seguretat completa en un zip del Poznote</strong></summary>
<br>

Un sol ZIP que conté la base de dades, totes les notes i els fitxers adjunts de tots els espais de treball:

  - Inclou un `index.html` a l'arrel per navegar-hi fora de línia
  - Les notes s'organitzen per espai de treball i carpeta
  - Els fitxers adjunts són accessibles amb enllaços on es pot fer clic

L'arxiu el genera en segon pla un procés de treball, no durant la sol·licitud que l'inicia, de manera que un compte gran no pot esgotar el temps d'espera del navegador o del servidor intermediari invers. La pàgina segueix el progrés de la tasca, i la baixada comença sola quan el fitxer és a punt. Podeu sortir de la pàgina i tornar-hi: la preparació continua. Un arxiu preparat està disponible durant 24 hores, i un botó permet suprimir-lo immediatament.

#### Còpies de seguretat per usuari i còpies completes

Tots els mètodes de més amunt produeixen **còpies de seguretat per usuari**: un arxiu només conté les dades d'un compte (la seva base de dades, les notes i els fitxers adjunts). Cada usuari pot fer una còpia de seguretat del seu compte i restaurar-lo, i els administradors poden triar qualsevol compte.

Una **còpia de seguretat completa del sistema**, que inclou la configuració principal (comptes, paràmetres globals, enllaços compartits) i tots els usuaris alhora, es fa copiant tot el directori `/data`:

```bash
# Complete system backup via CLI
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="local-backups"></a>
<details>
<summary><strong>Còpies de seguretat planificades a una carpeta local</strong></summary>
<br>

Els administradors poden fer que es desin arxius de còpia de seguretat completa (un ZIP per usuari, idèntic a la baixada de la còpia de seguretat completa) en una carpeta del servidor, manualment o automàticament de manera planificada, i que només se'n conservin els més recents. No cal res fora del Poznote: ni cubell, ni tasca cron, ni script.

Configureu-ho a **Paràmetres > Còpies de seguretat locals** (només administradors).

- **Carpeta de còpies de seguretat**: un camí absolut al servidor (dins del contenidor, amb Docker). Si es deixa buit, els arxius van a `data/backups`, que ja forma part del volum de dades. La carpeta es crea si cal, i l'usuari del servidor web hi ha de poder escriure.
- **Selecció d'usuaris**: unes caselles trien quins usuaris inclouen les còpies de seguretat. Per defecte estan tots marcats, i mentre estan tots marcats, els comptes nous s'inclouen automàticament.
- **Còpies de seguretat manuals**: un botó «Fes ara la còpia de seguretat» desa un arxiu nou per a cada usuari seleccionat, un usuari cada vegada, amb el progrés de cada usuari. Funciona fins i tot quan les còpies de seguretat automàtiques estan desactivades.
- **Còpies de seguretat automàtiques**: quan estan activades, un procés en segon pla fa la còpia de seguretat dels usuaris seleccionats amb la freqüència triada (diària, setmanal o mensual). La primera execució es fa uns minuts després d'activar-les, i les següents, després de l'interval triat. La pàgina mostra el resultat de l'última execució i la data de la següent.
- **Retenció**: només es conserven els N arxius més recents per usuari, i els més antics se suprimeixen de la carpeta després de cada còpia de seguretat (0 ho conserva tot).
- **Navegació**: la pàgina llista els arxius que hi ha a la carpeta, amb accions per baixar-los i suprimir-los.
- **Restauració**: els arxius s'emmagatzemen a `{user id}/` a la carpeta de còpies de seguretat i es poden restaurar amb la pàgina estàndard [Restauració / Importació](#restauració--importació).
- **Supressió de comptes**: suprimir un compte també en suprimeix els arxius de la carpeta de còpies de seguretat.

Per conservar les còpies de seguretat en un altre disc o en una unitat de xarxa compartida, munteu-lo al contenidor i introduïu el camí del contenidor (`/backups` en aquest exemple) com a carpeta de còpies de seguretat:

```yaml
services:
  webserver:
    volumes:
      - "./data:/var/www/html/data"
      - "/mnt/nas/poznote-backups:/backups"
```

Es rebutja una carpeta dins de la mateixa aplicació, excepte `data/backups`. Quan els fitxers adjunts s'emmagatzemen a S3 (emmagatzematge de fitxers adjunts a S3), s'inclouen als arxius, obtinguts del cubell al moment.

</details>

<a id="s3-backups"></a>
<details>
<summary><strong>Còpies de seguretat planificades a un cubell S3</strong></summary>
<br>

Els administradors poden enviar arxius de còpia de seguretat completa (un ZIP per usuari, idèntic a la baixada de la còpia de seguretat completa) a un cubell compatible amb S3, manualment o automàticament de manera planificada. La configuració és independent de la de l'emmagatzematge de fitxers adjunts a S3, de manera que les còpies de seguretat poden anar a un altre cubell o proveïdor.

Configureu-ho a **Paràmetres > Còpies de seguretat a S3** (només administradors).

- **Commutador principal**: un commutador a la part superior de la pàgina activa o desactiva tota la funció. Quan està desactivat, les còpies de seguretat automàtiques s'aturen i les seccions de còpia de seguretat i restauració d'S3 desapareixen per a tots els usuaris (el servidor també rebutja les accions d'autoservei).
- **Configuració**: URL del punt final, regió, cubell, clau d'accés, clau secreta i adreçament d'estil de camí, amb una prova de connexió integrada.
- **Selecció d'usuaris**: unes caselles trien quins usuaris inclouen les còpies de seguretat. Per defecte estan tots marcats, i mentre estan tots marcats, els comptes nous s'inclouen automàticament.
- **Còpies de seguretat manuals**: un botó «Fes ara la còpia de seguretat» puja un arxiu nou per a cada usuari seleccionat, un usuari cada vegada, amb el progrés de cada usuari. Funciona tan bon punt la connexió està configurada, fins i tot quan les còpies de seguretat automàtiques estan desactivades.
- **Còpies de seguretat automàtiques**: quan estan activades, un procés en segon pla fa la còpia de seguretat dels usuaris seleccionats amb la freqüència triada (diària, setmanal o mensual). La primera execució es fa uns minuts després d'activar-les, i les següents, després de l'interval triat.
- **Retenció**: només es conserven els N arxius més recents per usuari, i els més antics se suprimeixen del cubell després de cada còpia de seguretat (0 ho conserva tot).
- **Navegació**: la pàgina llista els arxius que hi ha al cubell, amb accions per baixar-los i suprimir-los.
- **Restauració**: els arxius s'emmagatzemen a `backups/{user id}/` al cubell i es poden restaurar amb la pàgina estàndard [Restauració / Importació](#restauració--importació).
- **Autoservei**: un cop el cubell està configurat, cada usuari té una secció «Còpies de seguretat a S3» a la seva pàgina Còpia de seguretat / Exportació per pujar un arxiu nou del seu compte i per baixar o suprimir els arxius existents. Una secció «Restauració des d'S3» a la pàgina Restauració / Importació restaura el compte directament a partir d'un d'aquests arxius.
- **Aïllament d'inquilins**: dues opcions («Còpies de seguretat a S3 a la pàgina de còpia de seguretat» i «Restauració des d'S3 a la pàgina de restauració») desactiven aquestes seccions d'autoservei per als usuaris que no són administradors. S'apliquen al servidor, de manera que les accions bloquejades es rebutgen fins i tot quan es criden directament.

Quan els fitxers adjunts s'emmagatzemen a S3 (emmagatzematge de fitxers adjunts a S3), s'inclouen per defecte als arxius, obtinguts del cubell al moment. Una opció permet deixar-los fora de les còpies de seguretat per obtenir arxius més lleugers i execucions més ràpides.

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Còpies de seguretat automatitzades amb un script bash</strong></summary>
<br>

Per a còpies de seguretat planificades i automatitzades amb l'API, podeu fer servir l'script `backup-poznote.sh` inclòs.

**IMPORTANT:** només els administradors poden crear còpies de seguretat amb l'API.
Feu servir la contrasenya actual del perfil d'administrador amb què us autentiqueu. En una instal·lació nova, és la contrasenya d'administrador per defecte (`admin`) fins que no es canvia al Poznote. Un cop definida una contrasenya personalitzada, cal aquesta contrasenya per a les crides a l'API.

**Ubicació de l'script:** `backup-poznote.sh` a la carpeta `tools` del repositori del Poznote

**Ús per a administradors:**

Els administradors poden fer una còpia de seguretat de qualsevol perfil d'usuari, **sense necessitat de conèixer els ID d'usuari**, només amb el nom d'usuari:

```bash
# Backup your own profile
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# Backup another user's profile (Nina)
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**Ús:**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**Exemple amb crontab (un administrador fent la còpia de seguretat de la Nina):**

```bash
# Add to crontab for automated backups twice daily
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**Explicació dels paràmetres:**
- `'https://poznote.example.com'` - URL de la vostra instància del Poznote
- `'admin'` - Nom d'usuari d'administrador per a l'autenticació (ha de ser administrador)
- `'admin_password'` - Contrasenya actual de l'administrador per al perfil de l'API (`admin` per defecte fins que es canvia; després, la contrasenya personalitzada)
- `'Nina'` - Nom d'usuari de qui es fa la còpia de seguretat
- `'/root/backups'` - Directori pare on s'emmagatzemaran les còpies de seguretat (crea la carpeta `backups-poznote-<username>`)
- `'30'` - Nombre de còpies de seguretat que es conserven (les més antigues se suprimeixen automàticament)

**Com funciona el procés de còpia de seguretat:**

1. L'script s'autentica amb credencials d'administrador
2. Cerca automàticament l'ID d'usuari a partir del nom d'usuari
3. Crea una còpia de seguretat amb l'API
4. Crida l'API REST v1 del Poznote (`POST /api/v1/backups` amb la capçalera `X-User-ID`)
5. Baixa localment el ZIP de la còpia de seguretat a `backups-poznote-<username>/`
6. Gestiona automàticament la retenció (només conserva el nombre indicat de còpies de seguretat recents)

**Nota:** les còpies de seguretat de cada usuari es desen en carpetes separades (`backups-poznote-Nina`, `backups-poznote-Tim`, etc.)

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>Exportació de notes individuals</strong></summary>
<br>

Exporteu notes individuals amb el botó **Exporta** de la barra d'eines de la nota:

  - **Notes de text enriquit:** exportació a HTML, o a un sol fitxer HTML amb les imatges incrustades
  - **Notes Markdown:** exportació a Markdown, a HTML, o a un sol fitxer HTML amb les imatges incrustades
  - **Llistes de tasques:** les mateixes opcions, més una exportació JSON de les dades de la llista

</details>

## Restauració / Importació

El Poznote ofereix opcions de restauració flexibles des de la interfície web (**Paràmetres > Restauració / Importació**) o, per als administradors, de manera programàtica amb l'API REST. Els usuaris poden restaurar les dades del seu perfil a partir d'una còpia de seguretat ZIP completa o importar fitxers individuals, mentre que els administradors poden gestionar les restauracions de tot el sistema.

<a id="complete-restore"></a>
<details>
<summary><strong>Restauració completa a partir d'una còpia de seguretat zip del Poznote</strong></summary>
<br>

Pugeu el ZIP de la còpia de seguretat completa per restaurar-ho tot:

  - Substitueix la base de dades i restaura totes les notes i els fitxers adjunts
  - Funciona per a tots els espais de treball alhora

No hi ha cap límit de mida pràctic. L'arxiu es puja per parts (una part que falla es torna a provar en lloc de perdre tota la pujada), es torna a muntar al servidor i, després, un procés en segon pla l'extreu i el restaura, de manera que ni el navegador ni un servidor intermediari invers davant de la instància poden fer que la restauració esgoti el temps d'espera. Una barra de progrés cobreix tot el procés: pujada, extracció, base de dades, notes i, finalment, fitxers adjunts. Quan acaba la restauració, el Poznote us pregunta quin espai de treball voleu obrir.

La restauració des d'un cubell S3 (vegeu [Còpies de seguretat a S3](#s3-backups)) s'executa com la mateixa tasca en segon pla, de manera que obtenir un arxiu gran del cubell i restaurar-lo tampoc no depèn que una sol·licitud continuï activa.

Si la pujada no és possible de cap manera, la pàgina Restauració / Importació també ofereix una alternativa de còpia directa: copieu l'arxiu al contenidor del Poznote exactament a `/tmp/backup_restore.zip` per SSH, torneu a carregar la pàgina i restaureu des d'allà.

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Importació de fitxers individuals</strong></summary>
<br>

Importeu directament una o més notes HTML, Markdown o de text:

  - Admet els tipus de fitxer `.html`, `.md`, `.markdown`, `.txt` i `.json`
  - Es poden seleccionar fins a 50 fitxers alhora, configurable a Paràmetres > Eines d'administració > Límits d'importació

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Importació d'un fitxer ZIP</strong></summary>
<br>

Importeu un arxiu ZIP que conté diverses notes:

  - Admet els tipus de fitxer `.html`, `.md`, `.markdown` o `.txt`
  - Els arxius ZIP poden contenir fins a 300 fitxers, configurable a Paràmetres > Eines d'administració > Límits d'importació
  - En importar un arxiu ZIP, el Poznote detecta i torna a crear automàticament l'estructura de carpetes

No hi ha cap límit de mida pràctic per a l'arxiu. Com en una restauració completa, es puja per parts (una part que falla es torna a provar en lloc de perdre tota la pujada), es torna a muntar al servidor i, després, el processa un procés en segon pla, de manera que ni el navegador ni un servidor intermediari invers davant de la instància poden fer que la importació esgoti el temps d'espera. Una barra de progrés cobreix tot el procés: pujada, imatges i fitxers adjunts i, finalment, notes.

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Migració d'una caixa forta d'Obsidian</strong></summary>
<br>

Una caixa forta (vault) d'Obsidian és una carpeta de fitxers Markdown, de manera que es pot importar tal com és, en un sol arxiu ZIP.

**Passos**

1. Comprimiu la carpeta de la caixa forta en un fitxer ZIP. No cal netejar res abans: les carpetes ocultes com `.obsidian` o `.trash` s'ignoren.
2. Al Poznote, obriu **Paràmetres > Restauració / Importació** i aneu a la secció que importa fitxers i arxius ZIP. Trieu l'espai de treball de destinació (un espai de treball nou i buit facilita comprovar el resultat), seleccioneu el ZIP i inicieu la importació. Deixar anar el ZIP a la llista de notes de la pàgina principal fa el mateix.
3. Llegiu el resum que es mostra al final: indica el nombre de notes, carpetes, imatges i fitxers PDF importats, i anomena els fitxers que no s'han pogut importar.

Un ZIP pot contenir fins a 300 notes (les imatges i els fitxers PDF no compten), un límit que un administrador pot augmentar a Paràmetres > Eines d'administració > Límits d'importació. La mida de l'arxiu no està limitada; vegeu [Importació d'un fitxer ZIP](#import-zip-notes).

**Què es conserva**

  - Notes: cada fitxer `.md` es converteix en una nota Markdown amb el nom del fitxer, o amb la clau `title` de la seva capçalera YAML.
  - Carpetes: es torna a crear l'arbre de carpetes de la caixa forta, subcarpetes incloses. Quan tota la caixa forta és dins d'una sola carpeta de primer nivell del ZIP, aquesta carpeta s'omet.
  - Etiquetes: la clau `tags` de la capçalera YAML, i una línia de `#tags` a la part superior d'una nota. Els espais d'una etiqueta es converteixen en guions baixos.
  - Capçalera YAML: es llegeixen `title`, `folder`, `tags`, `favorite`, `created` i `updated`; vegeu [Compatibilitat amb la capçalera YAML de Markdown](#markdown-front-matter).
  - Enllaços entre notes: `[[Títol de la nota]]` funciona tal com és. El Poznote el resol pel títol, el mostra com a enllaç intern i el compta als enllaços entrants i al graf.
  - Imatges: `![[image.png]]`, `![[image.png|caption]]` i `![caption](image.png)` es converteixen en fitxers adjunts de la nota i es mostren al seu lloc, sigui on sigui la imatge a la caixa forta (al costat de les notes, en una subcarpeta o en una carpeta `attachments`).
  - Fitxers PDF: un PDF enllaçat des d'una nota (`![[file.pdf]]`, `[[file.pdf]]` o un enllaç Markdown) s'adjunta a aquella nota, i l'enllaç apunta al fitxer adjunt. Qualsevol altre PDF, al costat de les notes o en una carpeta `attachments`, es converteix en una nota amb el nom del fitxer, amb el PDF com a fitxer adjunt, a la carpeta que correspon a la seva ubicació a la caixa forta.

**Què no es conserva**

  - Els enllaços amb un àlies o un títol (`[[Note|alias]]`, `[[Note#Heading]]`) es queden al text però no es resolen en una nota.
  - Les notes incrustades (`![[Other note]]`) i el contingut dels connectors: consultes de Dataview, fitxers `.canvas`, dibuixos fets amb el connector Excalidraw d'Obsidian.
  - Les etiquetes escrites al mig d'una nota es queden com a text normal.
  - Els fitxers d'altres tipus que hi ha al costat de les notes (àudio, vídeo, documents d'Office) s'ignoren. Adjunteu-los després a la nota corresponent.

Les imatges i els fitxers PDF es fan coincidir pel nom del fitxer, no pel camí. Si dos fitxers de la caixa forta tenen el mateix nom, canvieu el nom d'un dels dos abans de la importació.

</details>

<a id="markdown-front-matter"></a>
<details>
<summary><strong>Compatibilitat amb la capçalera YAML de Markdown</strong></summary>
<br>

Els fitxers Markdown poden incloure una capçalera YAML (front matter) per indicar les metadades de la nota. S'admeten les claus següents:

  - `title`: substitueix el títol de la nota (per defecte: el nom del fitxer sense l'extensió)
  - `folder`: substitueix la carpeta de destinació. Un nom simple ha de coincidir amb una carpeta que ja existeixi a l'espai de treball; un camí com `Projects/2026` crea les carpetes que necessita.
  - `tags`: matriu d'etiquetes que s'apliquen a la nota. Admet tant la sintaxi en línia `[tag1, tag2]` com la de diverses línies
  - `favorite`: marca la nota com a preferida (`true` o `false`)
  - `created`: defineix una data de creació personalitzada (format: `YYYY-MM-DD HH:MM:SS`)
  - `updated`: defineix una data d'actualització personalitzada (format: `YYYY-MM-DD HH:MM:SS`)

Exemple amb la sintaxi de matriu en línia:
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

Exemple amb la sintaxi de diverses línies:
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


## Fora de línia

El Poznote continua funcionant sense xarxa de dues maneres: les notes que heu modificat recentment, els preferits i les notes o carpetes que trieu conservar continuen disponibles al navegador, a punt per llegir-les i editar-les, i una còpia de seguretat completa es pot consultar a qualsevol lloc com a exportació de només lectura.

<details>
<summary><strong>Notes fora de línia</strong></summary>
<br>

Les notes que heu modificat els últims 5 dies es conserven a cada navegador on feu servir el Poznote, i aquesta còpia s'actualitza després de cada desament. En una aula, en un tren o en qualsevol lloc sense wifi, obriu l'adreça habitual del Poznote: el navegador mostra la versió fora de línia del Poznote, amb la mateixa barra lateral, els editors, la barra d'eines, la cerca i les pestanyes (un doble clic o un clic amb el botó del mig obre una nota en una pestanya nova, i les pestanyes obertes en línia tornen a aparèixer), i només hi llista les notes conservades fora de línia.

*   **Inici de sessió:** escriviu la contrasenya amb què vau iniciar la sessió per última vegada en aquest navegador; es comprova sense el servidor. Si no heu escrit mai la contrasenya en aquest navegador (SSO, inici de sessió automàtic), l'últim compte que s'hi ha fet servir s'obre amb un botó **Continua com a**.
*   **Lectura i edició:** les notes de text enriquit, les notes Markdown i les llistes de tasques s'obren al seu editor habitual, i es poden crear notes noves. El menú / i el menú del botó dret també funcionen, sense les ordres que necessiten el servidor (imatges i fitxers per pujar, plantilles, dibuixos, enllaços a altres notes). Els altres tipus de nota, com els dibuixos, només estan disponibles en línia. Els canvis es conserven al navegador fins que s'envien.
*   **Conserva fora de línia:** els preferits sempre es conserven, i **Conserva fora de línia**, al menú d'una nota o d'una carpeta (subcarpetes incloses), la conserva sigui quina sigui la data, amb tots els fitxers adjunts (PDF, àudio, fitxers) de fins a 25 MB cadascun. El mateix menú d'una nota indica si està disponible fora de línia en aquest navegador, i les pàgines Notes i Carpetes marquen les notes i les carpetes disponibles fora de línia en aquest navegador. La pàgina Notes també pot conservar diverses notes fora de línia alhora (o deixar de fer-ho) des de les accions en bloc, i la pàgina Carpetes té **Conserva fora de línia** al menú de cada carpeta.
*   **Pàgina Fora de línia:** el botó **Fora de línia** de la barra lateral d'icones llista les notes i les carpetes conservades fora de línia, com la pàgina Comparticions: les carpetes com un arbre amb les seves notes, per què es conserva cada nota (conservada fora de línia, en una carpeta conservada fora de línia, preferida, modificada recentment), un filtre i un botó per conservar una nota fora de línia o deixar de fer-ho. Una icona d'avís marca les notes que aquest navegador encara no té.
*   **De tornada en línia:** els canvis s'envien automàticament. Si mentrestant una nota també s'ha canviat al servidor, les dues versions es combinen quan és possible; si no, la vostra versió fora de línia es conserva com una nota separada anomenada «... (còpia fora de línia)». Una nota suprimida al servidor mentrestant es torna a crear.
*   **Paràmetres:** **Paràmetres > Sincronització i historial > Notes fora de línia** defineix quants dies de notes es conserven (5 per defecte, fins a 30; 0 desactiva les notes fora de línia) i mostra què conté el navegador actual.
*   **Límits:** com a màxim 300 notes i 50 MB de text, primer les modificades més recentment. També es conserven fitxers: les imatges que es mostren en aquestes notes, i tots els fitxers adjunts (PDF, àudio, fitxers) dels preferits i de les notes conservades amb **Conserva fora de línia**, de fins a 25 MB cadascun, amb un total de 400 fitxers i 200 MB, i mai més de la meitat de l'espai lliure del navegador. Un fitxer més gran només està disponible en línia, i la nota ho indica quan s'obre fora de línia.
*   **Requisits:** El Poznote s'ha de servir amb HTTPS (els navegadors només conserven pàgines fora de línia amb una connexió segura; `http://localhost` també funciona) i s'ha d'obrir una vegada en línia al navegador, després d'iniciar la sessió, perquè es faci la còpia.
*   **Privadesa:** només es conserven les notes del vostre compte, no les d'un compte o un espai de treball compartit amb vós. S'emmagatzemen sense xifrar al navegador. Tancar la sessió les elimina del navegador (també els canvis que encara no s'han enviat, després d'un avís que els llista): en un ordinador compartit, tanqueu la sessió quan marxeu. Tancar la sessió també funciona sense xarxa, des de la pàgina fora de línia: les notes s'eliminen immediatament, i la sessió al servidor finalitza la propera vegada que el Poznote s'obre en línia.

</details>

<details>
<summary><strong>Exportació fora de línia</strong></summary>
<br>

La **📦 còpia de seguretat completa** crea una versió fora de línia independent de les vostres notes. Només cal que extraieu el ZIP i obriu `index.html` amb qualsevol navegador web. Això us permet llegir les notes fora de línia, però sense totes les funcions del Poznote: és una exportació de només lectura.

</details>

## Diverses instàncies

> No s'ha de confondre amb la funció [Diversos usuaris](#diversos-usuaris).

Podeu executar diverses instàncies aïllades del Poznote al mateix servidor. Cada instància té les seves dades, el seu port i les seves credencials.

Perfecte per a:
- Allotjar diferents usuaris al mateix servidor, cadascun amb la seva instància i el seu compte separats
- Provar funcions noves sense afectar la instància de producció

Només cal que repetiu els passos d'instal·lació en directoris diferents amb ports diferents.

### Exemple: instàncies del Tom i de l'Alice al mateix servidor

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

## Assistent d'IA

El Poznote inclou un xat d'IA integrat que es connecta a una instància local d'[Ollama](https://ollama.com) o d'[LM Studio](https://lmstudio.ai), a un proveïdor al núvol com [Anthropic (Claude)](https://www.anthropic.com) o OpenAI, o a qualsevol servidor compatible amb OpenAI. Cerca i llegeix les vostres notes per respondre preguntes i, quan li ho demaneu, les crea, les torna a escriure i les organitza, dins de l'espai de treball on heu obert el xat.

Un administrador l'activa des de **Paràmetres → Eines d'administració → Assistent d'IA**, i aleshores cada perfil té un botó **Assistent d'IA** a la barra lateral d'icones de l'esquerra. El servidor d'IA es crida des del servidor del Poznote, mai des del navegador, de manera que, amb una instància local d'Ollama, les notes no surten mai del vostre ordinador.

Què pot fer l'assistent, com triar un proveïdor i un model, les claus de l'API personals, les eines externes com una cerca web (servidors MCP remots) i com connectar un servidor local des del contenidor del Poznote es descriuen a la [documentació de l'assistent d'IA](AI-ASSISTANT.ca.md). Per deixar que un assistent d'IA extern (VS Code Copilot, Claude CLI...) gestioni les notes, vegeu el [Servidor MCP](#servidor-mcp) més avall.

## Transcripció (veu a text)

Convertiu la veu en text de les notes amb un servidor de veu a text que gestioneu vós mateix. El Poznote no incorpora cap model de veu: es comunica amb qualsevol servidor que exposi l'API d'àudio d'OpenAI (`POST /v1/audio/transcriptions`), com ara un Whisper autoallotjat, de manera que l'àudio no ha de sortir mai del vostre ordinador.

Un cop un administrador l'activa a **Paràmetres → Eines d'administració → Transcripció**, **Enregistra àudio**, a **Insereix** del menú de barra, té un botó **Transcriu** al costat d'**Insereix l'àudio**, i els fitxers d'àudio adjunts tenen un botó **Transcriu**.

La configuració d'un servidor, la tria d'un model i tota la resta són a la [documentació de la transcripció](TRANSCRIPTION.ca.md).

## Servidor MCP

El Poznote inclou un servidor Model Context Protocol (MCP) que permet que assistents d'IA com GitHub Copilot o Claude CLI interactuïn amb les notes amb llenguatge natural. Per exemple:

- «Crea una nota nova titulada “Notes de la reunió” amb el contingut...»
- «Cerca notes sobre “Docker”»
- «Llista totes les notes del meu espai de treball del Poznote»
- «Actualitza la nota 42 amb informació nova»

El servidor MCP s'inclou al `docker-compose.yml` oficial i només es publica a `127.0.0.1`, de manera que per defecte no hi pot accedir res de fora del vostre ordinador. La configuració, la configuració dels clients, la substitució del port i de la depuració, i com protegir-lo amb `POZNOTE_MCP_AUTH_TOKEN` quan l'exposeu més enllà es descriuen a la [documentació del servidor MCP](MCP-SERVER.ca.md).

## Aplicacions

El Poznote funciona a qualsevol navegador, i també es pot instal·lar des del navegador com a aplicació web (PWA): aleshores té la seva pròpia icona i la seva pròpia finestra, com una aplicació nativa.

*   **Android i ordinador:** obriu la instància del Poznote amb el Chrome o l'Edge i trieu **Instal·la** al menú del navegador.
*   **Firefox a l'Android:** obriu la instància del Poznote amb el Firefox i trieu **Afegeix a la pantalla d'inici** al menú del navegador.
*   **iPhone i iPad:** obriu la instància del Poznote amb el Safari, toqueu **Comparteix** i, després, **Afegeix a la pantalla d'inici**.

> Per instal·lar l'aplicació web cal que el Poznote se serveixi amb HTTPS (`http://localhost` també funciona).

La [pàgina d'aplicacions](https://poznote.com/apps.html) del lloc web llista tot el que hi ha disponible: l'aplicació web, l'extensió per al Chrome i les aplicacions mòbils creades per la comunitat.

## Extensió per al Chrome

**Poznote URL Saver** és una extensió del navegador que desa l'URL, o fins i tot una captura de pantalla de la pàgina completa, de la pàgina actual a la vostra instància del Poznote amb un sol clic. Instal·leu-la des de la Chrome Web Store: [Instal·la l'extensió](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

L'extensió es connecta a la instància amb el vostre nom d'usuari i una [contrasenya d'aplicació](#contrasenyes-daplicació). Els passos de configuració són a la [documentació de l'extensió per al Chrome](CHROME-EXTENSION.ca.md).

## Comparteix al Poznote a l'Android

A l'Android, el Poznote apareix al menú **Comparteix** del sistema un cop instal·lada la PWA. Compartiu una pàgina des del Chrome (o un enllaç o un text des de qualsevol aplicació), trieu el Poznote i es crearà una nota nova amb el títol de la pàgina i un enllaç on es pot fer clic, sense necessitat de cap extensió.

Per fer-ho servir:

1. Obriu la instància del Poznote amb el Chrome a l'Android i instal·leu-la com a aplicació (menú → **Afegeix a la pantalla d'inici** → **Instal·la**).
2. A qualsevol aplicació, toqueu **Comparteix** i trieu **Poznote**.

> Si el Poznote no apareix immediatament al menú de compartir, assegureu-vos que l'aplicació està instal·lada (no només com a adreça d'interès). Si vau instal·lar la PWA abans que es publiqués aquesta funció, el Chrome detecta la funció nova automàticament al cap d'uns dies, o immediatament si reinstal·leu l'aplicació.

## Documentació de l'API

El Poznote ofereix una API REST v1 completa per accedir de manera programàtica a les notes, les carpetes, els espais de treball, les etiquetes, els fitxers adjunts, les còpies de seguretat, els paràmetres i molt més.

Per a la referència completa de l'API amb tots els punts finals, els paràmetres i exemples amb curl, vegeu la **[documentació de l'API REST](API-REST.md)**.

### Inici ràpid

```bash
# List all notes for user ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# Same, with an app password created in Settings > App passwords
# (works on SSO-only instances; X-User-ID is implied)
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# Create a note
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Documentació interactiva (Swagger)

Accediu a la **interfície de Swagger** directament des del Poznote a `Paràmetres > Quant a > API REST` per explorar tots els punts finals, consultar els esquemes de les sol·licituds i les respostes, i provar les crides a l'API de manera interactiva.

## Tecnologies

El Poznote prioritza la simplicitat i la portabilitat: sense entorns de treball complexos ni dependències pesades. Només tecnologies web senzilles i fiables que garanteixen que les vostres notes continuïn sent accessibles i sota el vostre control.

**Arquitectura centrada en la privadesa:** El Poznote funciona completament en local, sense cap connexió externa necessària per funcionar. Totes les biblioteques (Excalidraw, Mermaid, KaTeX) s'inclouen i se serveixen des de la vostra pròpia instància. D'entrada, l'única connexió de sortida és una comprovació diària d'actualitzacions; les funcions opcionals que activeu vós mateix (sincronització amb Git, S3, un proveïdor d'IA i les eines externes que hi connecteu, webhooks, SMTP, OIDC) són les úniques altres.

<details>
<summary>Si us interessen les tecnologies amb què s'ha creat el Poznote, <strong>feu-hi un cop d'ull aquí.</strong></summary>

### Backend
- **PHP 8.x** - Llenguatge de scripts del costat del servidor
- **SQLite 3** - Base de dades relacional lleugera basada en fitxers

### Frontend
- **HTML5** - Marcatge i estructura
- **CSS3** - Estil i disseny adaptable
- **JavaScript (Vanilla)** - Funcions interactives i contingut dinàmic
- **Vite** - Cadena de compilació per als components d'Excalidraw (React) i CodeMirror (empaquetats com a IIFE)
- **AJAX** - Càrrega asíncrona de dades

### Biblioteques
- **CodeMirror 6** - Editor de codi i de text extensible per a l'edició de Markdown
- **Excalidraw** - Pissarra virtual per dibuixar diagrames i esbossos
- **Mermaid** - Biblioteca JavaScript del costat del client per generar diagrames i diagrames de flux a partir de text
- **KaTeX** - Biblioteca JavaScript del costat del client per compondre ràpidament fórmules matemàtiques i renderitzar equacions
- **Sortable.js** - Biblioteca JavaScript per ordenar arrossegant i deixant anar
- **Lucide** - Conjunt d'icones que es fa servir a tota la interfície
- **Devicon** - Icones de llenguatges de programació per als blocs de codi
- **highlight.js** - Ressaltat de sintaxi per als blocs de codi
- **Swagger UI** - Interfície interactiva de documentació i prova de l'API

### Emmagatzematge
- **Fitxers HTML/Markdown** - Les notes s'emmagatzemen com a fitxers HTML o Markdown simples al sistema de fitxers
- **Base de dades SQLite** - Metadades, etiquetes, relacions i dades d'usuari
- **Fitxers adjunts** - S'emmagatzemen al sistema de fitxers local o, opcionalment, en un emmagatzematge d'objectes compatible amb S3

### Infraestructura
- **Nginx + PHP-FPM** - Servidor web d'alt rendiment amb el gestor de processos FastCGI
- **Alpine Linux** - Imatge base segura i lleugera
- **Docker** - Contenidors per a un desplegament fàcil i portable
- **Supervisor** - Executa Nginx, PHP-FPM i els processos en segon pla (recordatoris, còpies de seguretat planificades)
- **Python 3.12 (Alpine)** - Entorn d'execució del servidor MCP, amb les biblioteques httpx, uvicorn i fastmcp per a la integració amb assistents d'IA
</details>
