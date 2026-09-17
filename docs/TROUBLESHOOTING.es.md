<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Solución de problemas de instalación

<details>
<summary><strong>«Advertencias de mkdir() (permission denied) o Connection failed»</strong></summary>
<br>

Si te encuentras con errores como:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- La carpeta `database` se crea con `root:root` en lugar de `www-data:www-data`

Se trata de un problema conocido de los volúmenes montados de Docker en ciertos entornos (Komodo, Portainer, etc.). En algunas configuraciones, el contenedor no puede cambiar los permisos de los volúmenes montados.

**Solución:** antes de iniciar el contenedor, establece los permisos correctos en tu máquina anfitriona:

```bash
# Ve a tu directorio de Poznote
cd poznote

# Crea la estructura del directorio de datos con los permisos correctos
mkdir -p data/database

# Asigna la propiedad al UID 82 (www-data en Alpine Linux)
sudo chown -R 82:82 data

# Inicia el contenedor
docker compose up -d
```

</details>

<details>
<summary><strong>«Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database»</strong></summary>
<br>

Primero, prueba a detener y reiniciar el contenedor y espera a que se inicialice la base de datos (recarga la página).

Si eso no funciona, detén el contenedor y corrige la propiedad de la carpeta `data` (adapta el UID/GID a tu instalación, el ejemplo usa 1000:1000):

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Nota:** el UID 82 corresponde al usuario `www-data` de Alpine Linux, que es el que usa la imagen Docker de Poznote.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Ejecución rootless (docker-compose.rootless.yml)</strong></summary>
<br>

Poznote también ofrece una variante de imagen rootless que se ejecuta por completo como usuario sin privilegios (uid/gid `1000`, nombre de usuario `poznote`) en lugar de root, para entornos que prohíben root dentro de los contenedores (`PodSecurityStandard` restricted de Kubernetes, Podman rootless, `docker run --user`, etc.).

A diferencia de la imagen por defecto, esta variante no dispone de ningún proceso root al arrancar que pueda corregir la propiedad de un bind mount del host que no coincida, así que `./data` **debe pertenecer al uid/gid 1000 antes del primer arranque**:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Si te saltas este paso, el contenedor se detiene nada más arrancar con un error que explica exactamente qué hay que ejecutar.

Ten en cuenta que a menudo no hace falta `sudo` para este paso:

- Si tu usuario del host ya tiene el uid `1000` (el primer usuario creado en la mayoría de las distribuciones Linux), `mkdir -p data` crea el directorio con la propiedad correcta y puedes omitir el `chown` por completo.
- Con Podman rootless o Docker rootless, ejecuta el chown dentro del espacio de nombres de usuario, sin ningún privilegio de root:

```bash
# Podman rootless
podman unshare chown -R 1000:1000 data
# Docker rootless
rootlesskit chown -R 1000:1000 data
```

Para una instalación nueva, sigue el [método de instalación rootless](README.es.md#rootless) del README. Para migrar una instancia de Poznote existente, detenla, haz una copia de seguridad de tu directorio de datos y cambia su propietario, y luego inicia la variante rootless:

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

El servidor web rootless escucha internamente en el puerto `8080` en lugar del `80` (solo puertos sin privilegios); `HTTP_WEB_PORT` de tu `.env` sigue controlando el puerto del lado del host, sin cambios.

Para compilar la imagen rootless desde el código fuente en lugar de descargarla, sustituye la línea `image:` de `docker-compose.rootless.yml` por `build: { context: ., target: rootless }` (en ese caso necesitas un clon de este repositorio).

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>Ejecutar con <code>network_mode: host</code></strong></summary>
<br>

Por defecto, Docker asigna un puerto del host al contenedor: el servidor web escucha en el puerto `80` dentro del contenedor (`8080` en la imagen rootless), y `HTTP_WEB_PORT` elige el puerto en el host. Con `network_mode: host` no hay asignación. El contenedor ocupa directamente los puertos del host, donde el puerto `80` suele pertenecer ya a otro servidor web o contenedor.

Define el puerto en el que escucha el servidor web con `POZNOTE_LISTEN_PORT` en `.env` (con la imagen rootless, un puerto superior a 1023):

```bash
POZNOTE_LISTEN_PORT=8040
```

Después, en `docker-compose.yml` (o `docker-compose.rootless.yml`), sustituye la sección `ports:` de ambos servicios por `network_mode: host`. El servidor MCP necesita dos cambios más: ya no puede llegar al servidor web por su nombre de servicio, y su imagen escucha en todas las interfaces, lo que en modo host significa todas las interfaces del host. Apúntalo al nuevo puerto y limítalo a localhost:

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

Vuelve a crear los contenedores (un reinicio no recarga las variables de entorno):

```bash
docker compose up -d --force-recreate
```

El script de inicio del contenedor aplica el valor en cada arranque; un valor no válido se indica en el log y se mantiene el valor por defecto de la imagen. `HTTP_WEB_PORT` deja de usarse, y `POZNOTE_MCP_PORT` define ahora el puerto en el que escucha el servidor MCP. El healthcheck del `docker-compose.yml` actual sigue `POZNOTE_LISTEN_PORT`: si el tuyo todavía llama a `http://127.0.0.1/api/health`, vuelve a descargar el archivo o cambia la URL; de lo contrario, el contenedor queda `unhealthy` o comprueba cualquier otra cosa que responda en el puerto `80`.

En modo host, el servidor web escucha en todas las interfaces del host: filtra el puerto con tu cortafuegos, o déjalo accesible solo a través de tu proxy inverso. Dentro del contenedor, nginx y PHP se comunican mediante un socket unix, así que Poznote no ocupa ningún otro puerto en el host y varias instancias pueden funcionar en paralelo en puertos distintos.

</details>

<details>
<summary><strong>«This site can't be reached»</strong></summary>
 <br>

Si ves «This site can't be reached» en tu navegador, es posible que tengas SELinux activado. En ese caso, revisa los registros del contenedor:

```bash
docker logs poznote-webserver-1
# o con podman
podman logs poznote-webserver-1
```

Lo más probable es que encuentres:
- `chown: /var/www/html/data: Permission denied`

Esto ocurre cuando los volúmenes de Docker no tienen el contexto SELinux correcto, sobre todo al instalar desde el directorio `/root`.

**Solución:** te recomendamos encarecidamente usar el sufijo `:Z` en los volúmenes de Docker y evitar el directorio `/root` para garantizar un funcionamiento correcto en todas las distribuciones.

Edita tu `docker-compose.yml` para añadir `:Z` a las definiciones de volúmenes:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Como alternativa, instala Poznote en un directorio fuera de `/root`, como `/opt/poznote` o `~/poznote`.

</details>

<details>
<summary><strong>«Nombre de usuario o contraseña incorrectos»</strong></summary>
<br>

1. Intenta iniciar sesión con «admin» o «admin_change_me» y tu contraseña.
2. Las contraseñas se gestionan desde la interfaz de Poznote, no desde `.env`. Mientras no se cambie una contraseña en la interfaz, se aplican los valores por defecto integrados: `admin` para los administradores y `user` para los usuarios estándar.
3. Si puedes iniciar sesión como administrador pero no como usuario estándar, comprueba que el perfil esté marcado como **activo** en el panel Gestión de usuarios.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>La aplicación deja de responder bajo carga (errores de autoguardado, «server reached pm.max_children»)</strong></summary>
<br>

Las peticiones PHP las atiende un grupo fijo de workers de php-fpm, 10 por defecto. Las peticiones cortas (autoguardado, sondeos, cargas de página) nunca lo llenan. Las largas sí: una respuesta del chat de IA en streaming, una llamada a S3, una sincronización Git, una subida grande. Cuando todos los workers están ocupados, las demás peticiones esperan, el navegador muestra un error de red al guardar y el log del contenedor indica:

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

En una instancia con mucha actividad (varios usuarios, chat de IA, S3 o sincronización Git en uso), amplía el grupo con la variable `POZNOTE_PHP_FPM_MAX_CHILDREN` en `.env` y luego vuelve a crear el contenedor (un reinicio no recarga las variables de entorno):

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Cada worker ocupado consume unos 25-30 MB de memoria, y los workers inactivos son pocos sea cual sea el valor, así que 20 es seguro en un host con 1 GB y 10 cabe en un host de 512 MB. El script de inicio del contenedor aplica el valor en cada arranque; un valor no válido se indica en el log y se mantiene el valor por defecto de la imagen.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>Una petición falla con «Allowed memory size exhausted»</strong></summary>
<br>

Cada petición PHP puede usar hasta 512 MB por defecto. Es un techo, no una reserva (un worker inactivo ocupa unos 25 MB), y su función es que una petición descontrolada falle con una línea legible en el log de PHP en lugar de tumbar el host:

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Las copias de seguridad, restauraciones, exportaciones y descargas se transmiten al disco en streaming y necesitan unos pocos MB sea cual sea el tamaño de la cuenta, así que esto solo debería ocurrir con una sola nota de decenas de MB. Si una copia de seguridad o una descarga alcanza este límite, es un error: infórmalo junto con la línea del log.

Para aumentar el límite, define `POZNOTE_PHP_MEMORY_LIMIT` en `.env` (un número entero de MB) y luego vuelve a crear el contenedor (un reinicio no recarga las variables de entorno):

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

Nunca lo pongas por encima de la memoria del host: una petición que supera lo que tiene la máquina es eliminada por el kernel sin ningún mensaje, y puede arrastrar consigo todo el contenedor. En un host de 512 MB, mantén el valor por defecto. El script de inicio del contenedor aplica el valor en cada arranque; un valor no válido se indica en el log y se mantiene el valor por defecto de la imagen.

</details>
