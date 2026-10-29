<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a> ·
  <a href="TROUBLESHOOTING.ko.md">한국어</a> ·
  <a href="TROUBLESHOOTING.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Resolució de problemes d'instal·lació

<details>
<summary><strong>"Avisos de mkdir() (permission denied) o Connection failed"</strong></summary>
<br>

Si trobeu errors com aquests:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- La carpeta `database` es crea amb `root:root` en lloc de `www-data:www-data`

Es tracta d'un problema conegut dels volums muntats de Docker en alguns entorns (Komodo, Portainer, etc.). En algunes configuracions, el contenidor no pot canviar els permisos dels volums muntats.

**Solució:** abans d'iniciar el contenidor, definiu els permisos correctes a la màquina amfitriona:

```bash
# Anar al directori de Poznote
cd poznote

# Crear l'estructura del directori de dades amb els permisos correctes
mkdir -p data/database

# Assignar la propietat a l'UID 82 (www-data a Alpine Linux)
sudo chown -R 82:82 data

# Iniciar el contenidor
docker compose up -d
```

</details>

<details>
<summary><strong>"Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database"</strong></summary>
<br>

Primer, proveu d'aturar i reiniciar el contenidor i espereu que la base de dades s'inicialitzi (actualitzeu la pàgina).

Si no funciona, atureu el contenidor i corregiu el propietari de la carpeta `data` (adapteu l'UID i el GID a la vostra configuració; l'exemple fa servir 1000:1000):

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Nota:** l'UID 82 correspon a l'usuari `www-data` d'Alpine Linux, que és el que fa servir la imatge Docker de Poznote.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Execució sense root (docker-compose.rootless.yml)</strong></summary>
<br>

Poznote també ofereix una variant de la imatge que s'executa completament com a usuari sense privilegis (uid/gid `1000`, nom d'usuari `poznote`) en lloc de root, per als entorns que prohibeixen root dins dels contenidors (`PodSecurityStandard` restringit de Kubernetes, Podman sense root, `docker run --user`, etc.).

A diferència de la imatge per defecte, aquesta variant no té cap procés root disponible a l'inici per corregir el propietari d'un muntatge de l'amfitrió que no coincideixi, de manera que `./data` **ha de pertànyer a l'uid/gid 1000 abans del primer inici**:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Si ometeu aquest pas, el contenidor surt immediatament a l'inici amb un error que explica exactament què cal executar.

Tingueu en compte que sovint no cal `sudo` per a aquest pas:

- Si el vostre usuari de l'amfitrió ja té l'uid `1000` (el primer usuari creat a la majoria de distribucions Linux), `mkdir -p data` crea el directori amb el propietari correcte i podeu ometre el `chown`.
- Amb Podman o Docker sense root, executeu el chown dins de l'espai de noms d'usuari, sense cap privilegi de root:

```bash
# Podman sense root
podman unshare chown -R 1000:1000 data
# Docker sense root
rootlesskit chown -R 1000:1000 data
```

Per a una instal·lació nova, seguiu el [mètode d'instal·lació sense root](README.ca.md#rootless) del README. Per migrar una instància de Poznote existent, atureu-la, feu una còpia de seguretat del directori de dades, canvieu-ne el propietari i, després, inicieu la variant sense root:

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

El servidor web sense root escolta internament al port `8080` en lloc del `80` (només ports sense privilegis); `HTTP_WEB_PORT` del vostre `.env` continua controlant el port del costat de l'amfitrió, sense canvis.

Per construir la imatge sense root des del codi font en lloc de baixar-la, substituïu la línia `image:` de `docker-compose.rootless.yml` per `build: { context: ., target: rootless }` (aleshores cal un clon d'aquest repositori).

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>Execució amb <code>network_mode: host</code></strong></summary>
<br>

Per defecte, Docker associa un port de l'amfitrió amb el contenidor: el servidor web escolta al port `80` dins del contenidor (`8080` amb la imatge sense root), i `HTTP_WEB_PORT` tria el port de l'amfitrió. Amb `network_mode: host` no hi ha cap associació. El contenidor ocupa directament els ports de l'amfitrió, on el port `80` normalment ja pertany a un altre servidor web o contenidor.

Definiu el port on escolta el servidor web amb `POZNOTE_LISTEN_PORT` al `.env` (amb la imatge sense root, un port superior al 1023):

```bash
POZNOTE_LISTEN_PORT=8040
```

Després, a `docker-compose.yml` (o `docker-compose.rootless.yml`), substituïu la secció `ports:` dels dos serveis per `network_mode: host`. El servidor MCP necessita dos canvis més: ja no pot accedir al servidor web pel nom del servei, i la seva imatge escolta a totes les interfícies, cosa que en mode amfitrió vol dir totes les interfícies de l'amfitrió. Apunteu-lo al port nou i vinculeu-lo a localhost:

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

Torneu a crear els contenidors (un reinici no torna a carregar les variables d'entorn):

```bash
docker compose up -d --force-recreate
```

L'script d'inicialització del contenidor aplica el valor a cada inici; un valor no vàlid es registra al registre i es manté el valor per defecte de la imatge. `HTTP_WEB_PORT` ja no es fa servir, i ara `POZNOTE_MCP_PORT` defineix el port on escolta el servidor MCP. La comprovació de salut del `docker-compose.yml` actual segueix `POZNOTE_LISTEN_PORT`: si la vostra encara crida `http://127.0.0.1/api/health`, torneu a baixar el fitxer o canvieu l'URL; si no, el contenidor es queda `unhealthy` o comprova qualsevol altra cosa que respongui al port `80`.

En mode amfitrió, el servidor web escolta a totes les interfícies de l'amfitrió: filtreu el port amb el tallafoc o feu-lo accessible només a través del servidor intermediari invers. Dins del contenidor, nginx i PHP es comuniquen per un sòcol Unix, de manera que Poznote no ocupa cap altre port a l'amfitrió i diverses instàncies es poden executar alhora en ports diferents.

</details>

<details>
<summary><strong>"No es pot accedir a aquest lloc"</strong></summary>
 <br>

Si el navegador mostra "No es pot accedir a aquest lloc" ("This site can't be reached"), és possible que tingueu SELinux activat. En aquest cas, consulteu els registres del contenidor:

```bash
docker logs poznote-webserver-1
# o amb podman
podman logs poznote-webserver-1
```

Probablement hi trobareu:
- `chown: /var/www/html/data: Permission denied`

Passa quan els volums de Docker no tenen el context de SELinux correcte, sobretot quan s'instal·la des del directori `/root`.

**Solució:** us recomanem molt que feu servir el sufix `:Z` als volums de Docker i que eviteu el directori `/root`, perquè funcioni correctament a totes les distribucions.

Editeu el `docker-compose.yml` per afegir `:Z` a les definicions dels volums:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

També podeu instal·lar Poznote en un directori fora de `/root`, com ara `/opt/poznote` o `~/poznote`.

</details>

<details>
<summary><strong>"El nom d'usuari o la contrasenya no són correctes"</strong></summary>
<br>

1. Proveu d'iniciar la sessió amb "admin" o "admin_change_me" i la vostra contrasenya.
2. Les contrasenyes es gestionen des de la interfície de Poznote, no des del `.env`. Fins que no es canvia una contrasenya a la interfície, s'apliquen les contrasenyes predeterminades: `admin` per als administradors i `user` per als usuaris estàndard.
3. Si podeu iniciar la sessió com a administrador però no com a usuari estàndard, comproveu que el perfil estigui marcat com a **actiu** al plafó de gestió d'usuaris.

</details>

<details>
<summary><strong>Contrasenya d'administrador perduda</strong></summary>
<br>

Si un altre administrador encara pot iniciar la sessió, us pot definir una contrasenya nova des de **Paràmetres > Eines d'administració > Gestió d'usuaris**. Si no, restabliu-la directament a la base de dades principal. Des del directori de Poznote, a l'amfitrió (cal que hi tingueu instal·lada l'eina de línia d'ordres `sqlite3`, que no forma part de la imatge de Poznote):

```bash
sudo sqlite3 data/master.db "UPDATE users SET password_hash=NULL, password_login_disabled=0 WHERE id=1;"
```

Això esborra la contrasenya emmagatzemada del primer compte (id 1, sempre un administrador), de manera que torna a aplicar-se la predeterminada: inicieu la sessió amb el nom d'usuari d'aquest compte i la contrasenya `admin` i, tot seguit, canvieu-la a **Paràmetres > Canvi de contrasenya**. Per restablir un altre compte, substituïu `WHERE id=1` per `WHERE username='el_seu_nom_dusuari'`; un usuari estàndard torna a la contrasenya `user`.

Si aquest compte té l'autenticació de dos factors activada, el formulari d'inici de sessió continua demanant un codi després de la contrasenya. Vegeu l'apartat següent si també heu perdut el dispositiu.

</details>

<a id="two-factor-lockout"></a>
<details>
<summary><strong>Accés bloquejat per l'autenticació de dos factors (dispositiu i codis de recuperació perduts)</strong></summary>
<br>

Cada codi de recuperació que es va lliurar en activar l'autenticació de dos factors us permet iniciar la sessió una vegada: a la pantalla del codi, trieu **Fes servir un codi de recuperació**. Si no en teniu cap, un administrador us pot desactivar els dos factors des de **Paràmetres > Eines d'administració > Gestió d'usuaris**, al diàleg de contrasenya del vostre compte.

Si sou l'únic administrador, elimineu el segon factor directament a la base de dades principal. Des del directori de Poznote, a l'amfitrió (cal que hi tingueu instal·lada l'eina de línia d'ordres `sqlite3`):

```bash
sudo sqlite3 data/master.db "DELETE FROM user_totp_recovery_codes WHERE user_id=1; DELETE FROM user_totp WHERE user_id=1;"
```

Substituïu `1` per l'id del compte (`sudo sqlite3 data/master.db "SELECT id, username FROM users;"` els llista). Amb la contrasenya sola tornareu a iniciar la sessió, les galetes de "Recorda'm" emeses per a aquest compte deixen de funcionar i podeu tornar a configurar l'autenticació de dos factors des de **Paràmetres > Autenticació de dos factors**.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>L'aplicació deixa de respondre quan té molta càrrega (errors de desament automàtic, "server reached pm.max_children")</strong></summary>
<br>

Les sol·licituds PHP les serveix un conjunt fix de processos de php-fpm, 10 per defecte. Les sol·licituds curtes (desament automàtic, consultes periòdiques, càrrega de pàgines) no l'omplen mai. Les llargues sí: una resposta del xat d'IA que es transmet, una crida a S3, una sincronització amb Git, una pujada gran. Quan tots els processos estan ocupats, la resta de sol·licituds esperen, el navegador mostra un error de xarxa en desar i el registre del contenidor diu:

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

En una instància amb molta activitat (diversos usuaris, xat d'IA, S3 o sincronització amb Git), augmenteu el conjunt amb la variable `POZNOTE_PHP_FPM_MAX_CHILDREN` al `.env` i torneu a crear el contenidor (un reinici no torna a carregar les variables d'entorn):

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Cada procés ocupat consumeix uns 25-30 MB de memòria, i els processos inactius són pocs sigui quin sigui el valor, de manera que 20 és segur en un amfitrió d'1 GB i 10 cap en un amfitrió de 512 MB. L'script d'inicialització del contenidor aplica el valor a cada inici; un valor no vàlid es registra al registre i es manté el valor per defecte de la imatge.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>Una sol·licitud falla amb "Allowed memory size exhausted"</strong></summary>
<br>

Cada sol·licitud PHP pot fer servir fins a 512 MB per defecte. És un límit, no una reserva (un procés inactiu pesa uns 25 MB), i serveix perquè una sol·licitud descontrolada falli amb una línia llegible al registre de PHP en lloc de fer caure l'amfitrió:

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Les còpies de seguretat, les restauracions, les exportacions i les baixades s'escriuen al disc a mesura que avancen i necessiten pocs MB sigui quina sigui la mida del compte, de manera que això només hauria de passar amb una sola nota de desenes de MB. Si una còpia de seguretat o una baixada arriba al límit, és un error: comuniqueu-lo amb la línia del registre.

Per augmentar el límit, definiu `POZNOTE_PHP_MEMORY_LIMIT` al `.env` (un nombre enter de MB) i torneu a crear el contenidor (un reinici no torna a carregar les variables d'entorn):

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

No el definiu mai per sobre de la memòria de l'amfitrió: el nucli mata sense cap missatge una sol·licitud que superi el que té la màquina, i pot arrossegar tot el contenidor. En un amfitrió de 512 MB, mantingueu el valor per defecte. L'script d'inicialització del contenidor aplica el valor a cada inici; un valor no vàlid es registra al registre i es manté el valor per defecte de la imatge.

</details>

<a id="this-address-is-not-allowed"></a>
<details>
<summary><strong>"Aquesta adreça no està permesa: un webhook ha d'apuntar a un amfitrió públic d'Internet"</strong></summary>
<br>

Un usuari que no és administrador ha escrit l'adreça d'una màquina de la vostra xarxa local, o del mateix servidor, en un webhook, a la sincronització amb Git o al seu propi servidor d'IA, de transcripció o MCP. Només els administradors poden accedir a aquestes adreces. Un administrador pot permetre aquest amfitrió a **Paràmetres > Eines d'administració > Integracions > Accés a la xarxa local**; vegeu [Accés a la xarxa local per als usuaris que no són administradors](README.ca.md#local-network-access).

Si l'amfitrió ja és a la llista i el missatge continua, el contenidor de Poznote no pot resoldre'n el nom: el missatge és el mateix en els dos casos expressament, perquè no reveli res de la xarxa interna. Comproveu el nom des del contenidor:

```bash
docker compose exec webserver getent hosts ollama.lan
```

Si l'ordre no mostra res, introduïu a la llista l'adreça IP o la xarxa de l'amfitrió en lloc del nom.

</details>
