<!-- lang-selector -->
<p align="center">
  <a href="../README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->


<p align="center">
  <img src="../images/poznote-logo-text.png" alt="Poznote Logo" width="400">
</p>

<h2 align="center">
Toma de notas potente, sin complicaciones.
</h2>

<h3 align="center">
Una alternativa gratuita, autoalojada y de código abierto a Notion, Obsidian, Evernote o OneNote.
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

### Funciones

Descubre todas las funciones [aquí](https://poznote.com/#features).

### Capturas de pantalla

Consulta todas las capturas de pantalla [aquí](https://poznote.com/screenshots.html).

### Demo

https://demo.poznote.com

**Usuario**: poznote<br>
**Contraseña**: poznote

### Hablan de Poznote

https://poznote.com/press.html

### Discord

Únete a la comunidad para hacer preguntas, compartir tus comentarios o seguir el desarrollo:

https://discord.gg/AWhWWSEkJ

## Índice

- [Instalación](#instalación)
- [Acceso](#acceso)
- [Cambiar la configuración](#cambiar-la-configuración)
- [Actualizar la aplicación](#actualizar-la-aplicación)
- [Autenticación](#autenticación)
- [Contraseñas de aplicación](#contraseñas-de-aplicación)
- [Tipos de notas](#tipos-de-notas)
- [Instantáneas](#instantáneas)
- [Personalización](#personalización)
- [Multiusuario](#multiusuario)
- [Registro de actividad](#registro-de-actividad)
- [Webhooks](#webhooks)
- [Sincronización Git](#sincronización-git)
- [Almacenamiento de adjuntos en S3](#almacenamiento-de-adjuntos-en-s3)
- [Copias de seguridad S3](#copias-de-seguridad-s3)
- [Copia de seguridad / Exportar](#copia-de-seguridad--exportar)
- [Restaurar / Importar](#restaurar--importar)
- [Vista sin conexión](#vista-sin-conexión)
- [Varias instancias](#varias-instancias)
- [Asistente IA](#asistente-ia)
- [Transcripción (voz a texto)](#transcripción-voz-a-texto)
- [Servidor MCP](#servidor-mcp)
- [Extensión de Chrome](#extensión-de-chrome)
- [Compartir con Poznote en Android](#compartir-con-poznote-en-android)
- [Documentación de la API](#documentación-de-la-api)
- [Stack tecnológico](#stack-tecnológico)

## Instalación

> La imagen oficial es multiarquitectura (linux/amd64, linux/arm64) y funciona en Windows/macOS con Docker Desktop, así como en dispositivos ARM64 como Raspberry Pi, sistemas NAS, etc.

Elige a continuación tu método de instalación preferido:

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Paso 1: Requisito previo

Instala e inicia [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Paso 2: Desplegar Poznote

Crea un nuevo directorio:

```powershell
mkdir poznote
```

Entra en el directorio de Poznote:
```powershell
cd poznote
```

Crea el archivo de entorno:

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edita el archivo `.env`:

```powershell
notepad .env
```

Descarga el archivo de configuración de Docker Compose:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Descarga las últimas imágenes de Poznote Webserver y Poznote MCP:
```powershell
docker compose pull
```

Inicia los contenedores de Poznote:
```powershell
docker compose up -d
```

</details>

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### Paso 1: Requisito previo

1. Instala [Docker engine](https://docs.docker.com/engine/install/)
2. Instala [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Paso 2: Instalar Poznote

Crea un nuevo directorio:
```bash
mkdir poznote
```

Entra en el directorio de Poznote:
```bash
cd poznote
```

Crea el archivo de entorno:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edita el archivo `.env`:
```bash
vi .env
```

Descarga el archivo de configuración de Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Descarga las últimas imágenes de Poznote Webserver y Poznote MCP:
```bash
docker compose pull
```

Inicia los contenedores de Poznote:
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Paso 1: Requisito previo

Instala e inicia [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### Paso 2: Desplegar Poznote

Crea un nuevo directorio:
```bash
mkdir poznote
```

Entra en el directorio de Poznote:
```bash
cd poznote
```

Descarga el archivo de entorno:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edita el archivo `.env`:
```bash
vi .env
```

Descarga el archivo de configuración de Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Descarga las últimas imágenes de Poznote Webserver y Poznote MCP:
```bash
docker compose pull
```

Inicia los contenedores de Poznote:
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Nube</strong></summary><br>

¿No quieres administrar un servidor? Dos proveedores alojan Poznote por ti. En ambos casos, primero debes crear una cuenta en el proveedor y luego desplegar Poznote desde su catálogo en unos pocos clics. Los dos ofrecen crédito gratuito al registrarte, así que puedes probarlo sin pagar nada.

- **[Caliber Node](https://calibernode.com/cloud-apps/poznote)**, desde 2,50 $ al mes: las actualizaciones llegan en cuanto se publican, planes fijos (si necesitas más, pasas al siguiente), consola SSH y snapshots automáticos incluidos. Ideal si quieres gestionar lo mínimo posible y no tienes demasiadas notas.
- **[PikaPods](https://www.pikapods.com/pods?run=poznote)**, desde 2 $ al mes: las actualizaciones se prueban antes de desplegarse, por lo que llegan un poco más tarde, RAM, CPU y disco ajustables por separado, copias de seguridad automáticas pero tú configuras dónde se guardan (S3). Ideal si quieres margen para crecer a medida que aumentan tus notas.

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

En un host Proxmox VE, el proyecto Proxmox VE Community Scripts instala Poznote en su propio contenedor con un solo comando, sin Docker: crea un LXC Debian 13 sin privilegios (1 vCPU, 512 MB de RAM y un disco de 4 GB por defecto) y sirve Poznote con nginx y PHP dentro de él.

Ejecuta esto desde la shell del host Proxmox:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

Poznote responde entonces en `http://<container-ip>:8040`, con las mismas credenciales por defecto que cualquier otra instalación. Para actualizarlo más adelante, ejecuta `update` en la consola del contenedor.

Este script lo escribe y mantiene la comunidad, no Poznote. Consulta la [página del script de Poznote](https://community-scripts.org/scripts/poznote) para ver sus opciones y notas.

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ Kubernetes con Helm</strong></summary>

#### Paso 1: Requisito previo

Instala [Helm](https://helm.sh/docs/intro/install/) y asegúrate de que tu contexto de Kubernetes apunta al clúster donde quieres desplegar Poznote.

#### Paso 2: Desplegar Poznote

Añade el repositorio de charts de HelmForge:

```bash
helm repo add helmforge https://repo.helmforge.dev
```

Actualiza tu índice local de charts:

```bash
helm repo update
```

Instala Poznote:

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

El chart de Helm de Poznote lo mantiene la comunidad HelmForge como opción de instalación nativa para Kubernetes. Consulta la [documentación del chart de Poznote de HelmForge](https://helmforge.dev/docs/charts/poznote) para los valores, la persistencia, la exposición del servicio, las sondas, los contextos de seguridad y otros ajustes orientados a producción.

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

Poznote también ofrece una variante rootless de la imagen que se ejecuta por completo como usuario sin privilegios (uid/gid `1000`) en lugar de root, para los entornos que prohíben root dentro de los contenedores (`PodSecurityStandard` restringido de Kubernetes, Podman rootless, `docker run --user`, etc.). Funciona exactamente igual que la imagen por defecto; las únicas diferencias son que escucha internamente en el puerto `8080` y que no puede corregir el propietario de tu directorio de datos al arrancar.

#### Paso 1: Requisito previo

1. Instala [Docker engine](https://docs.docker.com/engine/install/)
2. Instala [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Paso 2: Desplegar Poznote

Crea un nuevo directorio:
```bash
mkdir poznote
```

Entra en el directorio de Poznote:
```bash
cd poznote
```

Crea el directorio de datos y asigna su propiedad al uid/gid `1000` (**obligatorio**: a diferencia de la imagen por defecto, el contenedor rootless no puede corregir él mismo este propietario al arrancar):
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

A menudo `sudo` no es necesario aquí: si tu usuario ya tiene el uid `1000`, puedes omitir el `chown`, y con Podman/Docker rootless se puede ejecutar sin root, consulta [Ejecución rootless](TROUBLESHOOTING.es.md#running-rootless).

Crea el archivo de entorno:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edita el archivo `.env`:
```bash
vi .env
```

Descarga el archivo de configuración de Docker Compose rootless:
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

Descarga las últimas imágenes rootless de Poznote Webserver y Poznote MCP:
```bash
docker compose -f docker-compose.rootless.yml pull
```

Inicia los contenedores de Poznote:
```bash
docker compose -f docker-compose.rootless.yml up -d
```

Para migrar una instancia de Poznote existente a la variante rootless, o para más detalles, consulta [Ejecución rootless](TROUBLESHOOTING.es.md#running-rootless) en la Guía de resolución de problemas.

</details>

<br>

> Si tienes problemas durante la instalación, consulta la [Guía de resolución de problemas](TROUBLESHOOTING.es.md).

## Acceso

Tras la instalación, accede a Poznote desde tu navegador web:

[http://localhost:8040](http://localhost:8040)


- Nombre de usuario: `admin_change_me`
- Contraseña: `admin`
- Puerto: `8040`

Cambia el nombre de la cuenta de administrador por defecto y su contraseña después del primer inicio de sesión.

## Cambiar la configuración

La mayoría de los ajustes del día a día se cambian desde la interfaz de Poznote. Usa el archivo `.env` solo para los valores de despliegue y ejecución que se leen al iniciar los contenedores.

<details>
<summary><strong>Usa el archivo <code>.env</code> para</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- Variables opcionales de ejecución, como `POZNOTE_MCP_PORT` y `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN` para cambiar el número de peticiones PHP simultáneas (10 por defecto) en una instancia muy solicitada, consulta la [Guía de resolución de problemas](TROUBLESHOOTING.es.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT` para cambiar el límite de memoria de PHP por petición, en MB (512 por defecto), consulta la [Guía de resolución de problemas](TROUBLESHOOTING.es.md#a-request-runs-out-of-memory)
- `POZNOTE_LISTEN_PORT` para cambiar el puerto en el que escucha el servidor web dentro del contenedor (80 por defecto), solo necesario con `network_mode: host`, consulta la [Guía de resolución de problemas](TROUBLESHOOTING.es.md#running-with-host-network)
- `POZNOTE_SETTINGS_PASSWORD` para pedir una contraseña adicional antes de abrir la página de Configuración, vacía por defecto
- `POZNOTE_MCP_AUTH_TOKEN` para exigir un token bearer a los clientes MCP, consulta [Servidor MCP](#servidor-mcp)

</details>

<details>
<summary><strong>Usa la interfaz para</strong></summary>
<br>

- Los ajustes globales y de administración, como la configuración del proveedor OIDC, la activación de la Sincronización Git, los límites de importación y la subida de CSS personalizado
- Los ajustes de usuario y de perfil, como las contraseñas de las cuentas locales, el tema, los tamaños de fuente, el orden de las notas, el fondo del espacio de trabajo y los elementos ocultos de la interfaz

</details>


### Modificar la configuración del sistema (`.env`)

Entra en tu directorio de Poznote:
```bash
cd poznote
```

Detén los contenedores de Poznote en ejecución:
```bash
docker compose down
```

Edita tu archivo `.env` con tu editor de texto preferido (por ejemplo, `nano .env` o `notepad .env`).

Guarda el archivo y vuelve a iniciar los contenedores para aplicar los cambios:
```bash
docker compose up -d
```

## Actualizar la aplicación

Entra en tu directorio de Poznote:
```bash
cd poznote
```

Detén los contenedores en ejecución antes de actualizar:
```bash
docker compose down
```

Descarga la última configuración de Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Descarga el último `.env.template`:
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Usa sdiff para revisar `.env.template` y añade las nuevas variables a tu archivo `.env` si hace falta:
```bash
sdiff .env .env.template
```

Descarga las últimas imágenes de Poznote Webserver y Poznote MCP:
```bash
docker compose pull
```

Inicia los contenedores actualizados:
```bash
docker compose up -d
```

Tus datos se conservan en el directorio `./data` y la actualización no les afecta.

## Autenticación

Poznote admite varios métodos de autenticación, entre ellos las cuentas locales y los proveedores de identidad externos. Las aplicaciones y extensiones que se comunican con la API REST usan [contraseñas de aplicación](#contraseñas-de-aplicación), una credencial independiente que se describe en la sección siguiente.

<details>
<summary><strong>Autenticación con cuentas locales</strong></summary>
<br>

Poznote autentica a los usuarios contra su perfil mediante un nombre de usuario o una dirección de correo electrónico y una contraseña.


#### Cuenta por defecto

En una instalación nueva, Poznote crea un perfil de administrador activo:

- Nombre de usuario: `admin_change_me`
- Contraseña: `admin`

Cambia la contraseña por defecto y el nombre de la cuenta después del primer inicio de sesión.

#### Gestión de contraseñas

Las contraseñas se gestionan desde la interfaz web de Poznote, no desde `.env`:

- Los usuarios pueden cambiar su propia contraseña desde **Configuración > Cambiar contraseña**.
- Los administradores pueden definir una contraseña personalizada para cualquier usuario, o restablecer la contraseña por defecto, desde **Configuración > Herramientas de administración > Gestión de usuarios**.
- La opción **Recordarme por 30 días** mantiene la sesión abierta durante ese tiempo.
- Cambiar una contraseña invalida las cookies de «recordarme» existentes de ese usuario.

#### Contraseñas por defecto

- Cuentas de administrador: `admin`
- Cuentas de usuario estándar: `user`

Mientras un usuario no haya cambiado su contraseña, se usa el valor por defecto indicado arriba. En cuanto se cambia una contraseña desde la interfaz, se guarda en la base de datos un hash bcrypt seguro, que tiene prioridad.

</details>

<a id="oidc"></a>
<details>
<summary><strong>Autenticación OIDC / SSO (opcional)</strong></summary>
<br>

Poznote admite OpenID Connect (código de autorización + PKCE) para el inicio de sesión único. Esto permite a los usuarios iniciar sesión con proveedores de identidad externos como Auth0, Keycloak, Azure AD o Google Identity.

#### Cómo funciona

1. La página de inicio de sesión muestra un botón `Continue with [Provider Name]` cuando OIDC está activado.
2. Los usuarios se autentican con el flujo de código de autorización de OIDC, protegido por PKCE.
3. El acceso puede restringirse con grupos permitidos y, si hace falta, con una lista heredada de usuarios permitidos.
4. Tras la autenticación, Poznote vincula la identidad en este orden: `sub` (`oidc_subject`), después `preferred_username` y después `email`.
5. Si la creación automática de usuarios está activada y ningún perfil coincide, Poznote crea uno automáticamente. Un perfil así **no tiene ninguna contraseña**: nunca pasó por la entrega de credenciales iniciales que hace un administrador al crear una cuenta, por lo que no acepta la contraseña por defecto. El inicio de sesión pasa por el proveedor, o bien un administrador define una contraseña explícita desde **Configuración > Herramientas de administración > Gestión de usuarios**.
6. Si `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, el formulario de usuario y contraseña se oculta y la página de inicio de sesión pasa a ser solo SSO.
7. Los clientes de la API REST pueden autenticarse con `Authorization: Bearer <OIDC JWT>` cuando OIDC está activado; Poznote valida el JWKS del proveedor, el emisor, la caducidad, la audiencia y los controles de acceso configurados.
8. Los clientes que no pueden realizar ningún flujo OIDC (extensión del navegador, aplicación móvil, scripts) usan en su lugar una [contraseña de aplicación](#contraseñas-de-aplicación), que cada usuario crea desde su propia configuración.

#### Configuración

OIDC se configura desde la **interfaz de administración**: ve a **Configuración > Herramientas de administración > OIDC / SSO**.

La mayoría de los ajustes (activación, emisor, nombre del proveedor, scopes, control de acceso, grupos y usuarios permitidos, creación automática de usuarios, comportamiento de HTTP Basic Auth, etc.) se gestionan desde esta página y se guardan en la base de datos.

Para la autenticación Bearer JWT de la API REST, configura **Audiencia JWT de la API** si tu proveedor emite tokens de acceso para una audiencia de API dedicada. Si se deja vacío, Poznote acepta como audiencia del JWT el Client ID de OIDC configurado.

Los siguientes ajustes siguen en el archivo `.env`:

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

Usa `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` si quieres ocultar el formulario local de usuario y contraseña y obligar a iniciar sesión solo con SSO. Es el único interruptor que bloquea la autenticación por contraseña: elimina el formulario, rechaza en el servidor los POST de contraseña y oculta el ajuste «Cambiar contraseña».

> **Recuperarse de una caída del proveedor de identidad.** Solo SSO significa exactamente eso: mientras `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, nadie puede iniciar sesión con contraseña, tampoco los administradores, así que no hay ninguna vía de escape desde el navegador. Es intencionado: un atacante que haya comprometido una cuenta de administrador no puede volver a activar el inicio de sesión por contraseña para garantizarse un acceso persistente. La recuperación requiere acceso al servidor: define `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false` en `.env`, reinicia el contenedor e inicia sesión con una contraseña local. Antes de activar el modo solo SSO, asegúrate de que al menos una cuenta de administrador tiene una contraseña explícita (**Configuración > Herramientas de administración > Gestión de usuarios**); si no, volver a cambiar el indicador no servirá de nada. Ten en cuenta que un perfil de administrador creado automáticamente por OIDC no tiene contraseña hasta que se le define una.

> **Cambio incompatible:** los antiguos ajustes de OIDC en `.env` ya no se leen, salvo `POZNOTE_OIDC_CLIENT_ID`, `POZNOTE_OIDC_CLIENT_SECRET` y `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`. Tras actualizar, vuelve a introducir los demás ajustes de OIDC desde la página de administración.

#### Ejemplo de control de acceso (grupos + aprovisionamiento automático)

Desde la página de administración de OIDC, configura:
- **Claim de grupos:** `groups`
- **Grupos permitidos:** `poznote`
- **Crear perfiles de usuario automáticamente:** activado

Si el aprovisionamiento automático está activado, Poznote genera un nombre de usuario a partir de los claims de OIDC (`preferred_username`, `nickname`, la parte local del correo electrónico, `name` y después `sub`) y guarda el subject de OIDC en el perfil creado.

</details>

## Contraseñas de aplicación

Las aplicaciones no pueden iniciar sesión a través de un proveedor de identidad como lo hace un navegador. Una **contraseña de aplicación** es una credencial independiente que creas para un único cliente (la extensión del navegador, un teléfono, un script) y que puedes revocar en cualquier momento, así nunca tienes que entregar la contraseña de tu cuenta.

Crea una desde **Configuración > Contraseñas de aplicación**: ponle un nombre, opcionalmente una fecha de caducidad, y copia el secreto generado. Se muestra una sola vez y nunca más. Después, en el cliente, introduce tu nombre de usuario habitual y la contraseña de aplicación donde pida una contraseña. Viaja como HTTP Basic Auth normal, así que todos los clientes existentes funcionan tal cual:

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

Una contraseña de aplicación solo llega a la API REST, y solo para su propio perfil: no puede abrir la interfaz web, llamar a un endpoint de administración, cambiar tu contraseña ni gestionar tu cuenta, ni siquiera cuando la cuenta es de administrador. Por eso una contraseña filtrada expone las notas de una sola cuenta y nada más, y revocarla cierra la brecha. En una instancia solo SSO, donde las cuentas creadas por OIDC no tienen contraseña alguna, es la única credencial que la API acepta mediante Basic Auth.

La lista completa de límites y los endpoints que gestionan las contraseñas de aplicación están en la [documentación de la API REST](API-REST.md#authentication).

## Tipos de notas

Poznote admite dos formatos principales de notas, cada uno adaptado a una forma de trabajar distinta.

<details>
<summary><strong>Notas HTML</strong></summary>
&nbsp;

*   **Editor:** edición WYSIWYG (lo que ves es lo que obtienes) directa.
*   **Almacenamiento:** se guardan como archivos `.html` en el directorio de datos del usuario. Al ser HTML estándar, pueden abrirse directamente en cualquier navegador web.
*   **Funciones exclusivas:**
    *   **Formato enriquecido:** soporte nativo de colores de texto, resaltado y elementos HTML estándar.
    *   **Interfaz interactiva:** manipulación directa de los elementos en el editor.
</details>

<details>
<summary><strong>Notas Markdown</strong></summary>
&nbsp;

*   **Editor:** editor de sintaxis Markdown con vista previa en tiempo real.
*   **Almacenamiento:** se guardan como archivos `.md` en el directorio de datos del usuario.
*   **Funciones exclusivas:**
    *   **Diagramas Mermaid:** soporte nativo para generar diagramas (diagramas de flujo, de secuencia, etc.) mediante bloques de código ` ```mermaid `.
    *   **Ecuaciones matemáticas:** soporte completo de LaTeX para fórmulas matemáticas con la sintaxis `$ inline $` y `$$ block $$`.
    *   **Portabilidad:** formato Markdown estándar compatible con cualquier editor externo o generador de sitios estáticos.
</details>

<details>
<summary><strong>Listas de tareas</strong></summary>
&nbsp;

*   **Uso:** gestiona tareas y proyectos con listas de verificación interactivas.
*   **Flujo de trabajo:** sigue el progreso con casillas que se pueden marcar directamente en el editor o en la lista de notas. Una barra de progreso muestra el grado de avance de cada lista.
*   **Opciones de las tareas:** cada tarea puede tener una fecha de vencimiento con hora opcional, una notificación de recordatorio que salta a la hora de vencimiento y una marca de importante, y puede moverse a otra lista.
*   **Página de tareas:** una página de Tareas dedicada, que se abre desde la barra de iconos de la izquierda, reúne en un solo lugar todas las tareas de tus listas de tareas y, opcionalmente, las casillas que hay dentro de las notas normales. Ofrece filtros de estado (pendientes, importantes, vencidas, con fecha de vencimiento, completadas), un filtro de texto y una vista de calendario de las tareas que tienen fecha de vencimiento.
*   **Colaboración pública:** las listas de tareas pueden compartirse mediante una URL pública. Si se conceden permisos de edición, los colaboradores externos pueden marcar elementos de la lista sin necesidad de una cuenta de Poznote.
</details>

<details>
<summary><strong>Atajos</strong></summary>
&nbsp;

*   **Funcionalidad:** crea una referencia a una nota existente en otra ubicación.
*   **Caso de uso:** permite referenciar una nota en dos lugares distintos a la vez. Por ejemplo, una nota puede estar en una carpeta de clasificación mientras su atajo aparece en un tablero Kanban para el seguimiento activo.
</details>

<details>
<summary><strong>Plantillas</strong></summary>
&nbsp;

*   **Funcionalidad:** reutiliza contenido ya escrito para estandarizar tu documentación, desde una nota completa hasta un fragmento breve.
*   **Configuración:** coloca las notas que quieres reutilizar en una carpeta llamada `Templates` (las subcarpetas también sirven). Un espacio de trabajo llamado `Templates` también funciona y se ofrece desde todos los espacios de trabajo. El nombre también se reconoce en el idioma de la interfaz (`Modèles`, `Vorlagen`, `Plantillas`, `Modelos`, `Шаблоны`, `模板`).
*   **Insertar en una nota:** escribe `/template` (o `/` seguido del título de la plantilla) en una nota HTML o Markdown y elige una plantilla: su contenido se pega en la posición del cursor, convertido si la plantilla y la nota no son del mismo tipo.
*   **Nueva nota a partir de una plantilla:** duplica la nota de la plantilla, o duplica una carpeta `Templates` completa para empezar un proyecto con una estructura de carpetas ya preparada.
</details>

<details>
<summary><strong>Notas diarias (Diario)</strong></summary>
&nbsp;

*   **Uso:** escribe una nota al día, al estilo de un diario, desde un tablero de Diario dedicado.
*   **Flujo de trabajo:** el botón «Crear la entrada de hoy» crea la nota del día (pasa a llamarse «Ir a la entrada de hoy» cuando ya existe), con la fecha actual como título y guardada automáticamente en una estructura de carpetas `Diary/YYYY/MM`.
*   **Vista de tablero:** las entradas se muestran como tarjetas agrupadas por mes, de la más reciente a la más antigua, con un filtro para encontrar rápidamente entradas pasadas.
*   **Vista continua:** el botón con forma de pergamino, junto a los controles de vista, cambia a una sola columna de lectura: cada entrada con su contenido completo, de la más reciente a la más antigua, cargadas a medida que te desplazas. El filtro también funciona ahí. Haz clic en una entrada, o en su lápiz, para editarla ahí mismo; los cambios se guardan mientras escribes.
*   **Formato:** las nuevas entradas se crean como notas HTML o Markdown, según el ajuste «Formato de las entradas del diario» de **Configuración > Comportamiento**.
</details>

## Instantáneas

Las instantáneas conservan versiones anteriores del contenido de una nota para que puedas volver a un estado previo desde el menú **Instantáneas** de la nota.

<details>
<summary><strong>Cómo funcionan las instantáneas</strong></summary>
<br>

*   **Automáticas:** se toma una instantánea la primera vez que se abre una nota cada día. Se conservan las 3 instantáneas automáticas más recientes por nota; este número puede cambiarse en **Configuración > Comportamiento > Instantáneas**.
*   **Manuales:** «Tomar instantánea ahora» añade una instantánea en cualquier momento, y también **Ctrl + Alt + S** (Cmd + Alt + S en Mac) con una nota abierta. Las instantáneas manuales son ilimitadas y no cuentan para ese número.
*   **Antes de una edición por IA:** se toma automáticamente una instantánea justo antes de que el [Asistente IA](#asistente-ia) o el [servidor MCP](#servidor-mcp) cambien el contenido de una nota, así una reescritura que sale mal se deshace con un clic. Estas instantáneas aparecen en el historial como «Antes del cambio de la IA» o «Antes del cambio por MCP», se omiten cuando la última instantánea ya contiene el mismo contenido, y se conservan las 20 más recientes por nota, un número que puedes cambiar en **Configuración → Instantáneas** (de 1 a 200) si tu instancia edita muchas notas mediante IA o MCP.
*   **Caducidad:** todas las instantáneas, automáticas o manuales, se eliminan 30 días después de tomarse. Una instantánea también puede eliminarse a mano desde la ventana de Instantáneas.
*   **Adjuntos e imágenes:** las instantáneas solo guardan el texto de la nota. Los adjuntos nunca se copian, así que un archivo al que hacen referencia varias instantáneas existe una sola vez en el disco. Un archivo quitado de una nota permanece en el disco, oculto en la nota, mientras alguna instantánea lo siga conteniendo, de modo que restaurar esa instantánea lo recupera. Se elimina definitivamente cuando caduca o se elimina la última instantánea que lo contiene, o cuando la nota se elimina de forma permanente. Por tanto, conservar más instantáneas nunca duplica archivos. Solo mantiene los archivos quitados durante más tiempo, 30 días como máximo.

</details>

## Personalización

Poznote ofrece varias opciones de personalización integradas directamente en la aplicación, sin necesidad de modificar ningún archivo de configuración.

<details>
<summary><strong>Ajustes de Pantalla, Comportamiento y Markdown</strong></summary>
<br>

En **Configuración > Pantalla** puedes configurar:

- **Fuente de la aplicación:** elige la tipografía usada en toda la interfaz
- **Tamaño de fuente:** ajusta el tamaño del texto de las notas, la barra lateral, los bloques de código y la página de configuración
- **Colores de notas:** elige la paleta que se ofrece al colorear una nota
- **Iconos por tipo de nota:** da a las listas de tareas y a las notas Markdown su propio icono en la lista de notas
- **Escalado de iconos del índice:** cambia el tamaño de los iconos del índice de notas
- **Orden de la barra de iconos:** reordena los botones de la barra de iconos de la izquierda y cambia su color (un clic derecho en un botón de la barra también abre el selector de color)
- **Ancho del contenido de la nota:** controla el ancho máximo del área del editor de notas
- **Vistas previas de adjuntos:** muestra los adjuntos como vistas previas dentro de la nota
- **Borde de imagen por defecto:** enmarca las imágenes insertadas sin añadir relleno
- **Resaltar el árbol de carpetas actual:** atenúa las notas y carpetas que quedan fuera de la jerarquía de carpetas en la que trabajas
- **Título de página de inicio de sesión:** cambia el título que se muestra en la página de inicio de sesión
- **Visibilidad de los elementos:** oculta los elementos de la interfaz que no usas, ver más abajo

En **Configuración > Comportamiento** puedes configurar:

- **Orden de clasificación de notas:** elige cómo se ordenan las notas en la lista
- **Filtro de antigüedad:** muestra solo las notas actualizadas en el número de días elegido
- **Instantáneas:** cuántas instantáneas automáticas se conservan por nota
- **Orden de inserción de tareas:** controla dónde se insertan las nuevas tareas
- **Mostrar notas después de las carpetas:** muestra las notas sin carpeta debajo de la lista de carpetas
- **Ajuste de línea en bloques de código:** activa o desactiva el ajuste de línea en los bloques de código
- **Formato de las entradas del diario:** crea las entradas del diario como notas HTML o Markdown
- El idioma de la interfaz, la zona horaria y el formato de fecha, los adjuntos y backlinks al final de una nota, el corrector ortográfico y los atajos de teclado

En **Configuración > Markdown** puedes configurar el modo de apertura, la fuente del editor, el Markdown con marco y a color, y los números de línea en los bloques de código.

El tema no es una tarjeta de esta página: el botón de la parte inferior de la barra de iconos de la izquierda recorre los temas, y un administrador elige cuáles ofrece en **Configuración > Herramientas de administración > Lista de temas**.

</details>

<details>
<summary><strong>Imagen de fondo del espacio de trabajo</strong></summary>
<br>

Puedes definir una imagen de fondo por espacio de trabajo: abre la página **Espacios de trabajo** y usa la acción **Fondo** del espacio de trabajo para subir una imagen y ajustar su opacidad, así cada espacio de trabajo tiene su propia identidad visual.

</details>

<details>
<summary><strong>Visibilidad de los elementos</strong></summary>
<br>

Poznote te permite despejar la interfaz ocultando los elementos que no usas.

Configúralo en **Configuración > Pantalla > Visibilidad de los elementos**.

- **Control detallado:** activa o desactiva la visibilidad de las tarjetas del panel, las acciones de la barra de herramientas, los elementos del menú de comandos y más. La insignia de fecha de creación de las notas (**Mostrar fecha de creación de la nota**) y el número de notas junto a cada carpeta (**Mostrar conteo de notas de carpetas**) también se activan y desactivan aquí.
- **Por usuario:** cada usuario puede tener su propia disposición de la interfaz.
- **Administradores:** la misma ventana muestra una segunda columna «Usuarios» junto a la columna «Yo» del propio administrador, para ocultar elementos a todos los usuarios de la instancia (excepto a los administradores).
- **Con búsqueda:** encuentra fácilmente el elemento que quieres ocultar con el filtro de la ventana de configuración.

</details>

<details>
<summary><strong>Personalización con CSS</strong></summary>
<br>

Si quieres ajustar las fuentes, los espaciados u otros detalles visuales más allá de las opciones integradas, puedes subir hojas de estilo adicionales que se aplican a todas las páginas HTML para todos los usuarios.

Configúralas en **Configuración > Herramientas de administración > Archivo CSS personalizado**.

Notas:

- Haz clic en **Subir archivo CSS** para seleccionar un archivo `.css` de tu equipo.
- Todos los archivos subidos se conservan, así que puedes guardar varios temas y cambiar de uno a otro sin volver a subirlos.
- La ventana muestra lo que está guardado: elige el que se aplicará a todos los usuarios, o **Sin CSS personalizado** para volver a la apariencia integrada, y haz clic en **Guardar**.
- Subir un archivo con el mismo nombre que uno ya guardado reemplaza ese tema.
- Los archivos se guardan en `data/css/` (tu volumen de Docker), así que sobreviven a las actualizaciones de la imagen.
- Haz clic en el icono de papelera junto a un tema para eliminar ese archivo de tu volumen.
- Poznote añade automáticamente un parámetro `v=` para invalidar la caché.
- La hoja de estilo se inyecta cerca del final de `<head>`, por lo que puede sobrescribir los estilos por defecto de la aplicación.
- Solo los administradores pueden subir, aplicar o eliminar un archivo CSS personalizado.

### La lista de temas

**Configuración > Herramientas de administración > Lista de temas** define lo que recorre el botón de tema de la parte inferior de la barra de iconos: un tema por clic, en el orden mostrado.

- Marca los temas integrados que quieres conservar y deja fuera los que nadie usa.
- Marca un archivo CSS guardado para ofrecerlo como tema propio. Recibe un icono de paleta y el nombre del archivo.
- Usa las flechas para definir el orden en el que el botón los recorre.
- Un tema personalizado se pinta sobre una base clara u oscura, algo que el archivo no puede indicar por sí solo: elígela junto al archivo. Es el valor que toma `data-theme`, así que una hoja de estilo escrita para el modo oscuro necesita **Oscuro** aquí.
- La lista es un ajuste global, así que todos recorren los mismos temas; el tema aplicado sigue siendo una elección de cada usuario.
- Quien esté usando un tema que quites de la lista pasa de inmediato al primer tema de la lista.
- Elegir un tema personalizado carga ese archivo solo para ese usuario, en lugar de la hoja de estilo aplicada a toda la instancia.
- Eliminar un archivo CSS también lo quita de la lista.
- Con un solo tema en la lista no hay nada que recorrer, así que el botón abre esta lista para un administrador y no hace nada para los demás.

**Antes de escribir CSS**, comprueba si un tema integrado ya hace lo que quieres: el botón de tema de la parte inferior de la barra de iconos recorre Claro, Oscuro, Negro, Lavanda, Sepia y Terminal.

### Ejemplos

Los colores, los espaciados, los radios y los grosores de fuente son tokens de diseño, así que la mayoría de los cambios son una breve lista de variables sobrescritas en lugar de una pelea con los selectores. La lista completa está en `src/public/css/tokens.css`.

**Cambiar el color de acento**

```css
:root {
    --pz-accent: #d6336c;
    --pz-accent-hover: #a61e4d;
    --pz-accent-rgb: 214, 51, 108;   /* same colour, channels only, used for tints */
}
html[data-theme='dark'] {
    --dm-accent: #f783ac;            /* lighter, because it sits on a dark ground */
}
```

Dos tokens en lugar de uno porque un *relleno* y una *etiqueta* no pueden tener el mismo color: `--pz-accent` rellena los botones, `--dm-accent` es el acento como texto en modo oscuro.

**Cambiar el color de los iconos de la barra de herramientas de la nota**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

Los iconos son máscaras CSS pintadas con `background-color: currentColor`, así que basta con `color`. Aquí hace falta `!important` porque algunos de esos iconos ya tienen un color propio (la estrella cuando una nota es favorita, el icono de compartir cuando está publicada, el clip cuando tiene adjuntos).

Para colorear un solo icono no hace falta CSS: haga clic derecho sobre él en la barra de herramientas de la nota o en la barra de iconos y elija un color. Estos colores se guardan por usuario y no afectan a los colores de estado anteriores.

**Dar un tono cálido a toda la interfaz**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**Escribir un tema completo**

Sobrescribe los tokens en `:root` para el modo claro y en `:root[data-theme='dark']` para el oscuro, y nada más. `src/public/css/README.md` documenta todos los tokens y muestra un ejemplo completo; los temas integrados Lavanda, Sepia y Terminal de `src/public/css/tokens.css` son exactamente lo mismo, escritos de la misma manera.

Hay algo a lo que un tema todavía no llega: unos pocos iconos que una regla de página colorea explícitamente se muestran con el gris genérico de los iconos en modo oscuro.

</details>

## Multiusuario

> No confundir con la función de [Varias instancias](#varias-instancias).

Poznote es multiusuario: cada perfil tiene sus propias notas, espacios de trabajo, etiquetas, carpetas, adjuntos y ajustes, e inicia sesión con su propio nombre de usuario o dirección de correo electrónico y su contraseña.

- **Gestión de usuarios**: los administradores crean, desactivan y gestionan perfiles desde **Configuración > Herramientas de administración > Gestión de usuarios**, y pueden dar a un usuario acceso a la cuenta de otro usuario sin transferir su propiedad.
- **Compartir**: las notas, las carpetas y los espacios de trabajo completos pueden compartirse con otros usuarios de la instancia, en solo lectura o editables, o públicamente mediante enlaces dedicados. Cuando varios usuarios pueden acceder a la misma nota, solo uno la edita a la vez y los demás ven quién tiene el bloqueo.
- **Editar la misma nota**: solo una persona edita a la vez. Cuando una nota está bloqueada, el banner de solo lectura ofrece **tomar el control**: la pantalla de la otra persona pasa a solo lectura y sus cambios sin guardar se quedan en su navegador, y se le ofrecen de nuevo cuando la nota queda libre. Una nota abierta recoge en pocos segundos los cambios hechos en otro sitio. En una nota **Markdown** con cambios sin guardar en ambos lados, los dos conjuntos de cambios se fusionan automáticamente cuando tocan líneas distintas, y un banner te deja elegir cuando se solapan. Las notas de texto enriquecido nunca se fusionan, eliges qué versión conservar. Mantén los scripts y demás código en bloques de código delimitados (```` ``` ````): el HTML sin procesar fuera de un bloque de código se sanea al guardar, lo que puede hacer que una fusión limpia parezca un conflicto.
- **Aislamiento de cuentas (modo SaaS)**: los administradores pueden impedir que los usuarios que no son administradores descubran las demás cuentas de la instancia, compartan con ellas o registren webhooks personales. Deja todo sin marcar para una instancia familiar o de equipo.

<details>
<summary><strong>Organización de los datos en el disco</strong></summary>
<br>

Poznote usa una base de datos maestra (`data/master.db`) para los datos de coordinación compartidos, y bases de datos y archivos independientes por usuario para el contenido real de las notas.

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

## Registro de actividad

Poznote guarda un historial de las operaciones sensibles realizadas en la instancia, para que los administradores puedan ver qué pasó, cuándo y quién lo hizo: inicios y cierres de sesión, cambios de cuentas y de cuotas, creación y compartición de espacios de trabajo, copias de seguridad y restauraciones, vaciado de la papelera y eliminaciones permanentes, contraseñas de aplicación. Está disponible en **Configuración > Herramientas de administración > Registro de actividad**, reservado a los administradores, y el icono de ayuda de la parte superior de la página enumera todas las operaciones registradas.

El registro anota que una operación tuvo lugar, no los datos que tocó: el contenido de las notas y las contraseñas nunca se escriben en él, y la actividad rutinaria, como escribir una nota o moverla a la papelera, se deja fuera. Las entradas se conservan 90 días por defecto (30, 90, 365 días o ilimitado), y el registro puede vaciarse desde la misma página.

## Webhooks

Poznote puede avisar a servicios externos cuando ocurre algo en la instancia, enviando webhooks salientes (peticiones HTTP POST con un contenido JSON) a los endpoints que registres, lo que permite conectarlo con herramientas de automatización como n8n, Zapier o tus propios scripts. Los administradores registran los eventos de la instancia (cuentas, cuotas, registros) en **Configuración > Herramientas de administración > Webhooks de administrador**, y cada usuario puede registrar endpoints para sus propias notas y recordatorios en **Configuración > Webhooks de usuario**.

Las entregas se firman con HMAC-SHA256 cuando el webhook tiene un secreto, y el contenido de las notas nunca se envía. Cada evento, los campos del contenido, la verificación de la firma y las garantías de entrega se describen en la **[documentación de Webhooks](WEBHOOKS.es.md)**.

## Sincronización Git

Poznote admite la sincronización automática y manual con **GitHub**, **GitLab** (gitlab.com o una instancia autoalojada) o **Forgejo**. Cada usuario configura su propio repositorio de forma independiente. No hay ningún repositorio global compartido.

La Sincronización Git se comunica con la API REST del proveedor por HTTPS, así que la autenticación siempre se basa en tokens. No se usan claves SSH.

<details>
<summary><strong>Cómo configurar la Sincronización Git</strong></summary>
<br>

**Paso 1: activar la función (administrador, en Configuración > Herramientas de administración)**

Activa **Sincronización Git** en la sección **Herramientas de administración** de la página de Configuración. Esto activa la Sincronización Git de forma global y hace que la tarjeta y la configuración de **Sincronización Git** de cada usuario estén disponibles en **Configuración**.

---

**Paso 2: cada usuario configura su propio repositorio (Configuración > Sincronización Git)**

| Campo | Descripción |
|---|---|
| Proveedor | `GitHub`, `GitLab` o `Forgejo` |
| URL base de la API | GitHub: se rellena automáticamente (solo lectura). GitLab: `https://gitlab.com/api/v4`, o la URL de tu instancia, por ejemplo `https://gitlab.example.com/api/v4`. Forgejo: la URL de tu instancia, por ejemplo `https://forgejo.example.com/api/v1` |
| Token de acceso | PAT de GitHub (`ghp_...`), token de GitLab con el scope `api` (`glpat-...`, token de acceso personal o de proyecto) o token de Forgejo (Settings > Applications) |
| Repositorio | Formato `owner/repo`. GitLab: la ruta completa del proyecto, incluidos los subgrupos, por ejemplo `group/subgroup/project` |
| Rama | Por defecto: `main` |
| Nombre / correo del autor | Se usan en los metadatos de los commits |

> 🔒 Los tokens de acceso se cifran en reposo con AES-256-GCM. Se genera automáticamente una clave de cifrado que se guarda en `data/.app_secret`.

---

**Sincronización automática**

Cuando el usuario la activa, Poznote automáticamente:
- **Recupera** al iniciar sesión
- **Envía** cada vez que se crea, actualiza o elimina una nota

El envío y la recuperación manuales también están disponibles con los botones **Enviar** y **Recuperar** de la barra de iconos de la izquierda.

---

**Espacios de trabajo sincronizados**

Por defecto se sincronizan todos los espacios de trabajo. En **Configuración > Sincronización Git**, cada usuario puede limitar la Sincronización Git a los espacios de trabajo seleccionados:

- Solo se envían y recuperan las notas y adjuntos de los espacios de trabajo seleccionados.
- Una recuperación nunca toca las notas de los demás espacios de trabajo.
- Un envío elimina del repositorio los archivos que quedan fuera de los espacios de trabajo seleccionados, así el repositorio siempre refleja exactamente el conjunto sincronizado.
- Los botones Enviar y Recuperar de la barra lateral, el envío automático y la propuesta de recuperación solo aparecen mientras se visualiza un espacio de trabajo sincronizado.

</details>

## Almacenamiento de adjuntos en S3

Por defecto, los adjuntos de las notas se guardan en el disco local. Los administradores pueden guardarlos en su lugar en un almacenamiento de objetos compatible con S3 (AWS S3, MinIO, Garage, Cloudflare R2, Backblaze B2, ...). El ajuste se aplica a todos los usuarios de la instancia.

<details>
<summary><strong>Cómo configurar el almacenamiento S3</strong></summary>
<br>

Configúralo en **Configuración > Adjuntos S3** (solo administradores).

- **Configuración**: URL del endpoint, región, bucket, clave de acceso, clave secreta y direccionamiento de tipo path-style, con una prueba de conexión integrada.
- **Migración**: mueve los archivos adjuntos existentes entre el disco local y el bucket, en ambos sentidos y para todos los usuarios. La migración se ejecuta por lotes y puede interrumpirse y reanudarse sin riesgo.
- **Privacidad**: los adjuntos se guardan en `attachments/{user id}/` dentro del bucket y siempre se sirven a través de Poznote, así que el bucket puede seguir siendo privado.
- **Cuotas**: se puede definir una cuota de almacenamiento S3 por usuario, y el uso de S3 aparece en las estadísticas de almacenamiento de administración.
- **Copias de seguridad**: las exportaciones zip incluyen por defecto los adjuntos de S3 (obtenidos del bucket sobre la marcha), tanto si se hacen desde la ventana de copia de seguridad como mediante la API REST o con las copias de seguridad S3 automáticas. Una opción de la ventana de copia de seguridad permite dejarlos fuera para obtener un archivo más ligero. Si no se puede leer el bucket mientras se genera un archivo, la exportación falla con un error en lugar de producir un archivo al que le faltan ficheros.

Mientras el almacenamiento S3 está activado, se rechaza la restauración de una copia de seguridad a la que le faltan algunos de los archivos adjuntos a los que hace referencia, porque una restauración completa reemplaza el contenido del bucket y los archivos que faltan se perderían. Hay dos formas de restaurar una copia así:

- **La más sencilla**: desactiva el interruptor «Almacenar adjuntos en S3» (conserva las credenciales), restaura la copia de seguridad y vuelve a activar el interruptor. Una restauración en modo local nunca toca el bucket, y los adjuntos que siguen guardados allí se siguen sirviendo. También es el camino adecuado en un servidor nuevo cuando el bucket está intacto, ya que la exportación de adjuntos de la otra opción necesita una instancia que aún conozca las notas.
- **Reconstruir un archivo completo**:
  1. Descarga la **Exportación de adjuntos** desde la ventana de copia de seguridad: contiene todos los adjuntos de tu cuenta en una carpeta `files/`.
  2. Descomprime la copia de seguridad, copia los archivos de `files/` en la carpeta `attachments/` de la copia y vuelve a comprimirla. Cuidado al volver a comprimir: selecciona el contenido de la copia (`database/`, `entries/`, `attachments/`, ...) y comprime esa selección, no la carpeta que lo contiene. Las carpetas deben estar en la raíz del zip; de lo contrario, la restauración indica que falta `database/poznote_backup.sql`.
  3. Restaura el zip reconstruido de la forma habitual.

> La Sincronización Git ignora los adjuntos mientras el almacenamiento S3 está activado.

</details>

## Copias de seguridad S3

Los administradores pueden enviar archivos de copia de seguridad completos (un ZIP por usuario, idéntico a la descarga de Copia de seguridad completa) a un bucket compatible con S3, manualmente o de forma automática según una programación. La configuración es independiente de la del almacenamiento de adjuntos en S3, así que las copias de seguridad pueden ir a otro bucket u otro proveedor.

<details>
<summary><strong>Cómo configurar las copias de seguridad S3</strong></summary>
<br>

Configúralo en **Configuración > Copias de seguridad S3** (solo administradores).

- **Interruptor general**: un interruptor en la parte superior de la página activa o desactiva toda la función. Cuando está desactivada, las copias automáticas se detienen y las secciones de copia de seguridad y restauración S3 desaparecen para todos los usuarios (el servidor también rechaza las acciones de autoservicio).
- **Configuración**: URL del endpoint, región, bucket, clave de acceso, clave secreta y direccionamiento de tipo path-style, con una prueba de conexión integrada.
- **Selección de usuarios**: unas casillas eligen qué usuarios cubren las copias de seguridad. Todos están marcados por defecto y, mientras todos lo estén, las cuentas nuevas se incluyen automáticamente.
- **Copias manuales**: un botón «Respaldar ahora» sube un archivo nuevo para cada usuario seleccionado, un usuario tras otro, con el progreso de cada uno. Funciona en cuanto la conexión está configurada, aunque las copias automáticas estén desactivadas.
- **Copias automáticas**: cuando están activadas, un proceso en segundo plano hace la copia de seguridad de los usuarios seleccionados con la frecuencia elegida (diaria, semanal o mensual). La primera ejecución tiene lugar a los pocos minutos de activarlas, las siguientes tras el intervalo elegido.
- **Conservación**: solo se conservan los N archivos más recientes por usuario, los más antiguos se eliminan del bucket después de cada copia (0 lo conserva todo).
- **Exploración**: la página lista los archivos que hay actualmente en el bucket, con acciones de descarga y eliminación.
- **Restauración**: los archivos se guardan en `backups/{user id}/` dentro del bucket y pueden restaurarse con la página estándar de [Restaurar / Importar](#restaurar--importar).
- **Autoservicio**: una vez configurado el bucket, cada usuario tiene una sección «Copias de seguridad S3» en su página de Copia de seguridad / Exportar para subir un archivo nuevo de su propia cuenta, y para descargar o eliminar sus archivos existentes. Una sección «Restaurar desde S3» en la página de Restaurar / Importar restaura su cuenta directamente desde uno de esos archivos.
- **Aislamiento de cuentas**: dos opciones («Copias S3 en la página de copias de seguridad» y «Restauración S3 en la página de restauración») desactivan estas secciones de autoservicio para los usuarios que no son administradores. Se aplican en el servidor, así que las acciones bloqueadas se rechazan incluso cuando se llaman directamente.

Cuando los adjuntos se guardan en S3 (almacenamiento de adjuntos en S3), se incluyen por defecto en los archivos, obtenidos del bucket sobre la marcha. Una opción permite dejarlos fuera de las copias de seguridad para obtener archivos más ligeros y ejecuciones más rápidas.

</details>

## Copia de seguridad / Exportar

Poznote incluye una función integrada de Copia de seguridad / Exportar, accesible desde Configuración.

<a id="complete-backup"></a>
<details>
<summary><strong>Copia de seguridad completa en zip de Poznote</strong></summary>
<br>

Un único ZIP que contiene la base de datos, todas las notas y los adjuntos de todos los espacios de trabajo:

  - Incluye un `index.html` en la raíz para la navegación sin conexión
  - Las notas se organizan por espacio de trabajo y por carpeta
  - Los adjuntos son accesibles mediante enlaces en los que se puede hacer clic

El archivo lo genera en segundo plano un proceso de trabajo, no la petición que lo inicia, así que una cuenta grande no puede chocar con un tiempo de espera del navegador o del proxy inverso. La página sigue el progreso del trabajo y la descarga empieza sola en cuanto el archivo está listo. Puedes salir de la página y volver, la preparación continúa. Un archivo preparado sigue disponible durante 24 horas, y un botón permite eliminarlo de inmediato.

#### Copias por usuario frente a copias completas

Poznote ofrece opciones de copia de seguridad flexibles:

**Desde la interfaz web (Configuración > Copia de seguridad / Exportar):**
- **Todos los usuarios** pueden hacer copias de seguridad de su propio perfil y restaurarlo
- **Los administradores** pueden elegir de qué perfil de usuario hacer la copia de seguridad o cuál restaurar
- Las copias de seguridad contienen la base de datos, las notas y los adjuntos del usuario

**Mediante API o script (solo administradores):**
- Copias de seguridad automatizadas con el script `backup-poznote.sh`
- Acceso programático mediante la API REST v1
- Requiere credenciales de administrador

**Alcance de las copias de seguridad:**

1. **Copias de seguridad por usuario**: se crean desde Configuración o mediante la API. Contienen *solo* los datos de un usuario concreto (su base de datos, sus notas y sus adjuntos).
2. **Copia de seguridad completa del sistema**: se crea manualmente copiando todo el directorio `/data`. Es la única forma de hacer a la vez una copia de la configuración maestra y de los datos de todos los usuarios.

```bash
# Copia de seguridad completa del sistema desde la línea de comandos
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>Exportar notas individuales</strong></summary>
<br>

Exporta notas individuales con el botón **Exportar** de la barra de herramientas de la nota:

  - **Notas HTML:** exportar a HTML, o a un único archivo HTML con las imágenes integradas
  - **Notas Markdown:** exportar a Markdown, a HTML, o a un único archivo HTML con las imágenes integradas
  - **Listas de tareas:** las mismas opciones, más una exportación JSON en bruto de la lista

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Copias de seguridad automatizadas con un script Bash</strong></summary>
<br>

Para programar copias de seguridad automatizadas mediante la API, puedes usar el script incluido `backup-poznote.sh`.

**IMPORTANTE:** solo los administradores pueden crear copias de seguridad mediante la API.
Usa la contraseña actual del perfil de administrador con el que te autenticas. En una instalación nueva, es la contraseña de administrador por defecto (`admin`) hasta que se cambie en Poznote. Una vez definida una contraseña personalizada, esa contraseña es la que se exige para las llamadas a la API.

**Ubicación del script:** `backup-poznote.sh` en la carpeta `tools` del repositorio de Poznote

**Uso por parte de un administrador:**

Los administradores pueden hacer la copia de seguridad de cualquier perfil de usuario: **no hace falta conocer los ID de usuario**, basta con el nombre de usuario:

```bash
# Copia de seguridad de tu propio perfil
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# Copia de seguridad del perfil de otro usuario (Nina)
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**Uso:**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**Ejemplo con crontab (un administrador hace la copia de seguridad de Nina):**

```bash
# Añadir al crontab para copias de seguridad automáticas dos veces al día
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**Explicación de los parámetros:**
- `'https://poznote.example.com'`: la URL de tu instancia de Poznote
- `'admin'`: nombre de usuario de administrador para la autenticación (debe ser un administrador)
- `'admin_password'`: contraseña actual de administrador del perfil usado para la API (`admin` por defecto hasta que se cambie, después la contraseña personalizada)
- `'Nina'`: nombre del usuario cuya copia de seguridad se hace
- `'/root/backups'`: directorio padre donde se guardarán las copias de seguridad (crea una carpeta `backups-poznote-<username>`)
- `'30'`: número de copias de seguridad que se conservan (las más antiguas se eliminan automáticamente)

**Cómo funciona el proceso de copia de seguridad:**

1. El script se autentica con credenciales de administrador
2. Busca automáticamente el ID de usuario a partir del nombre de usuario
3. Crea una copia de seguridad mediante la API
4. Llama a la API REST v1 de Poznote (`POST /api/v1/backups` con la cabecera `X-User-ID`)
5. Descarga localmente el ZIP de la copia de seguridad en `backups-poznote-<username>/`
6. Gestiona automáticamente la conservación (solo guarda el número indicado de copias recientes)

**Nota:** las copias de seguridad de cada usuario se guardan en carpetas separadas (`backups-poznote-Nina`, `backups-poznote-Tim`, etc.)

</details>


## Restaurar / Importar

Poznote ofrece opciones de restauración flexibles desde la interfaz web (**Configuración > Restaurar / Importar**) o, para los administradores, de forma programática mediante la API REST. Los usuarios pueden restaurar los datos de su propio perfil desde una copia de seguridad ZIP completa o importar archivos individuales, mientras que los administradores pueden gestionar las restauraciones en todo el sistema.

<a id="complete-restore"></a>
<details>
<summary><strong>Restauración completa desde una copia de seguridad zip de Poznote</strong></summary>
<br>

Sube el ZIP de la copia de seguridad completa para restaurarlo todo:

  - Reemplaza la base de datos y restaura todas las notas y los adjuntos
  - Funciona para todos los espacios de trabajo a la vez

No hay límite de tamaño en la práctica. El archivo se sube por fragmentos (un fragmento que falla se reintenta en lugar de perder toda la subida), se vuelve a ensamblar en el servidor y después lo extrae y restaura un proceso en segundo plano, así que ni el navegador ni un proxy inverso delante de la instancia pueden interrumpir la restauración por tiempo de espera. Una barra de progreso cubre todo el proceso: subida, extracción, base de datos, notas y, por último, adjuntos. Cuando termina la restauración, Poznote te pregunta qué espacio de trabajo quieres abrir.

La restauración desde un bucket S3 (consulta [Copias de seguridad S3](#copias-de-seguridad-s3)) se ejecuta como el mismo trabajo en segundo plano, así que obtener un archivo grande del bucket y restaurarlo tampoco depende de que una petición siga activa.

Si la subida no es posible en absoluto, la página de Restaurar / Importar también ofrece una alternativa de copia directa: copia el archivo en el contenedor de Poznote exactamente en `/tmp/backup_restore.zip` por SSH, recarga la página y restaura desde ahí.

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Importar archivos individuales</strong></summary>
<br>

Importa directamente una o varias notas HTML, Markdown o de texto:

  - Admite los tipos de archivo `.html`, `.md`, `.markdown`, `.txt` y `.json`
  - Se pueden seleccionar hasta 50 archivos a la vez, configurable en Configuración > Herramientas de administración > Límites de importación

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Importar un archivo ZIP</strong></summary>
<br>

Importa un archivo ZIP que contiene varias notas:

  - Admite los tipos de archivo `.html`, `.md`, `.markdown` o `.txt`
  - Los archivos ZIP pueden contener hasta 300 archivos, configurable en Configuración > Herramientas de administración > Límites de importación
  - Al importar un archivo ZIP, Poznote detecta y recrea automáticamente la estructura de carpetas

No hay límite de tamaño en la práctica para el archivo. Igual que en una restauración completa, se sube por fragmentos (un fragmento que falla se reintenta en lugar de perder toda la subida), se vuelve a ensamblar en el servidor y después lo procesa un proceso en segundo plano, así que ni el navegador ni un proxy inverso delante de la instancia pueden interrumpir la importación por tiempo de espera. Una barra de progreso cubre todo el proceso: subida, imágenes y adjuntos y, por último, notas.

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Migrar un vault de Obsidian</strong></summary>
<br>

Un vault de Obsidian es una carpeta de archivos Markdown, así que se importa tal cual, en un único archivo ZIP.

**Pasos**

1. Comprime la carpeta de tu vault en un archivo ZIP. No hace falta limpiar nada antes: las carpetas ocultas como `.obsidian` o `.trash` se ignoran.
2. En Poznote, abre **Configuración > Restaurar / Importar** y ve a la sección que importa archivos y archivos ZIP. Elige el workspace de destino (un workspace nuevo y vacío permite comprobar fácilmente el resultado), selecciona el ZIP e inicia la importación. Soltar el ZIP sobre la lista de notas de la página principal hace lo mismo.
3. Lee el resumen que aparece al final: indica el número de notas, carpetas, imágenes y archivos PDF importados, y nombra los archivos que no se pudieron importar.

Un ZIP puede contener hasta 300 notas (las imágenes y los PDF no cuentan), un límite que un administrador puede aumentar en Configuración > Herramientas de administración > Límites de importación. El tamaño del archivo no está limitado, consulta [Importar un archivo ZIP](#import-zip-notes).

**Lo que se conserva**

  - Notas: cada archivo `.md` se convierte en una nota Markdown con el nombre del archivo, o con el de la clave `title` de su front matter.
  - Carpetas: se recrea el árbol de carpetas del vault, subcarpetas incluidas. Cuando todo el vault está dentro de una única carpeta en la raíz del ZIP, esa carpeta se omite.
  - Etiquetas: la clave `tags` del front matter y una línea de `#tags` al principio de una nota. Los espacios de una etiqueta se convierten en guiones bajos.
  - Front matter: se leen `title`, `folder`, `tags`, `favorite`, `created` y `updated`, consulta [Soporte de front matter en Markdown](#markdown-front-matter).
  - Enlaces entre notas: `[[Título de la nota]]` funciona tal cual. Poznote lo resuelve por el título, lo muestra como enlace interno y lo cuenta en los backlinks y en el grafo.
  - Imágenes: `![[imagen.png]]`, `![[imagen.png|leyenda]]` y `![leyenda](imagen.png)` se convierten en adjuntos de la nota y se muestran en su sitio, esté donde esté la imagen en el vault (junto a las notas, en una subcarpeta o en una carpeta `attachments`).
  - Archivos PDF: un PDF enlazado desde una nota (`![[archivo.pdf]]`, `[[archivo.pdf]]` o un enlace Markdown) se adjunta a esa nota, y el enlace apunta al adjunto. Cualquier otro PDF, junto a las notas o en una carpeta `attachments`, se convierte en una nota con el nombre del archivo y el PDF como adjunto, en la carpeta que corresponde a su lugar en el vault.

**Lo que no se conserva**

  - Los enlaces con alias o a un encabezado (`[[Nota|alias]]`, `[[Nota#Encabezado]]`) permanecen en el texto pero no llevan a ninguna nota.
  - Las notas incrustadas (`![[Otra nota]]`) y el contenido de plugins: consultas Dataview, archivos `.canvas`, dibujos hechos con el plugin Excalidraw de Obsidian.
  - Las etiquetas escritas en medio de una nota quedan como texto.
  - Los archivos de otros tipos situados junto a las notas (audio, vídeo, documentos de Office) se ignoran. Adjúntalos después a la nota correspondiente.

Las imágenes y los PDF se localizan por su nombre de archivo, no por su ruta. Si dos archivos del vault tienen el mismo nombre, renombra uno antes de importar.

</details>

<a id="markdown-front-matter"></a>
<details>
<summary><strong>Soporte de front matter en Markdown</strong></summary>
<br>

Los archivos Markdown pueden incluir un front matter YAML para indicar los metadatos de la nota. Se admiten las siguientes claves:

  - `title`: sobrescribe el título de la nota (por defecto: el nombre del archivo sin extensión)
  - `folder`: sobrescribe la carpeta de destino. Un nombre simple debe coincidir con una carpeta que ya existe en el espacio de trabajo; una ruta como `Projects/2026` crea las carpetas que necesita.
  - `tags`: lista de etiquetas que se aplican a la nota. Admite tanto la sintaxis en línea `[tag1, tag2]` como la sintaxis en varias líneas
  - `favorite`: marca la nota como favorita (`true` o `false`)
  - `created`: define una fecha de creación personalizada (formato: `YYYY-MM-DD HH:MM:SS`)
  - `updated`: define una fecha de actualización personalizada (formato: `YYYY-MM-DD HH:MM:SS`)

Ejemplo con la sintaxis de lista en línea:
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

Ejemplo con la sintaxis en varias líneas:
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


## Vista sin conexión

La **📦 Copia de seguridad completa** crea una versión independiente de tus notas para consultarla sin conexión. Solo tienes que extraer el ZIP y abrir `index.html` en cualquier navegador web. Así puedes leer tus notas sin conexión, pero sin todas las funciones de Poznote: es una exportación de solo lectura.

## Varias instancias

> No confundir con la función [Multiusuario](#multiusuario).

Puedes ejecutar varias instancias aisladas de Poznote en el mismo servidor. Cada instancia tiene sus propios datos, su puerto y sus credenciales.

Ideal para:
- Alojar a distintos usuarios en el mismo servidor, cada uno con su propia instancia y su propia cuenta
- Probar nuevas funciones sin afectar a tu instancia de producción

Basta con repetir los pasos de instalación en directorios distintos y con puertos distintos.

### Ejemplo: instancias de Tom y Alice en el mismo servidor

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

## Asistente IA

Poznote incluye un chat de IA integrado que se conecta a una instancia local de [Ollama](https://ollama.com) o [LM Studio](https://lmstudio.ai), a un proveedor en la nube como [Anthropic (Claude)](https://www.anthropic.com) u OpenAI, o a cualquier servidor compatible con OpenAI. Busca y lee tus notas para responder a tus preguntas y, cuando se lo pides, las crea, las reescribe y las organiza, dentro del espacio de trabajo en el que abriste el chat.

Un administrador lo activa desde **Configuración → Herramientas de administración → Asistente IA**, y cada perfil obtiene entonces un botón **Asistente IA** en la barra de iconos de la izquierda. El servidor de IA se llama desde el servidor de Poznote, nunca desde tu navegador, así que con una instancia local de Ollama tus notas nunca salen de tu máquina.

Lo que puede hacer el asistente, la elección de un proveedor y de un modelo, las claves de API personales y la conexión de un servidor local desde el contenedor de Poznote se describen en la [documentación del Asistente IA](AI-ASSISTANT.es.md). Para que sea un asistente de IA externo (VS Code Copilot, Claude CLI...) quien gestione tus notas, consulta el [Servidor MCP](#servidor-mcp) más abajo.

## Transcripción (voz a texto)

Convierte la voz en texto de nota con un servidor de voz a texto que ejecutas tú mismo. Poznote no integra ningún modelo de voz: se comunica con cualquier servidor que exponga la API de audio de OpenAI (`POST /v1/audio/transcriptions`), como un Whisper autoalojado, así el audio nunca tiene que salir de tu máquina.

Cuando un administrador lo activa en **Configuración → Herramientas de administración → Transcripción**, aparece **Dictar** en **Insertar** dentro del menú de comandos, y un botón **Transcribir** en los adjuntos de audio.

La puesta en marcha de un servidor, la elección de un modelo y todo lo demás están en la [documentación de Transcripción](TRANSCRIPTION.es.md).

## Servidor MCP

Poznote incluye un servidor Model Context Protocol (MCP) que permite a asistentes de IA como GitHub Copilot o Claude CLI interactuar con tus notas en lenguaje natural. Por ejemplo:

- «Crea una nueva nota titulada 'Meeting Notes' con el contenido...»
- «Busca notas sobre 'Docker'»
- «Lista todas las notas de mi espacio de trabajo de Poznote»
- «Actualiza la nota 42 con nueva información»

El servidor MCP viene con el `docker-compose.yml` oficial y solo se publica en `127.0.0.1`, así que por defecto nada fuera de tu máquina puede alcanzarlo. La instalación, la configuración de los clientes, los cambios de puerto y de depuración, y cómo protegerlo con `POZNOTE_MCP_AUTH_TOKEN` cuando lo expones más allá se describen en la [documentación del Servidor MCP](MCP-SERVER.es.md).

## Extensión de Chrome

**Poznote URL Saver** es una extensión del navegador que guarda con un solo clic la URL, o incluso una captura de pantalla completa, de la página actual en tu instancia de Poznote. Instálala desde Chrome Web Store: [Instalar la extensión](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

La extensión se conecta a tu instancia con tu nombre de usuario y una [contraseña de aplicación](#contraseñas-de-aplicación). Los pasos de configuración están en la [documentación de la extensión de Chrome](CHROME-EXTENSION.es.md).

## Compartir con Poznote en Android

En Android, Poznote aparece en el menú **Compartir** del sistema una vez instalada la PWA. Comparte una página desde Chrome (o un enlace o texto desde cualquier aplicación), elige Poznote y se crea una nueva nota con el título de la página y un enlace en el que se puede hacer clic, sin necesidad de extensión.

Para usarlo:

1. Abre tu instancia de Poznote en Chrome para Android e instálala como aplicación (menú → **Añadir a pantalla de inicio** → **Instalar**).
2. En cualquier aplicación, toca **Compartir** y elige **Poznote**.

> Si Poznote no aparece enseguida en el menú de compartir, asegúrate de que la aplicación está instalada (no solo guardada como marcador). Si instalaste la PWA antes de que saliera esta función, Chrome detecta la nueva capacidad automáticamente al cabo de unos días, o de inmediato si reinstalas la aplicación.

## Documentación de la API

Poznote ofrece una API RESTful v1 completa para acceder de forma programática a las notas, carpetas, espacios de trabajo, etiquetas, adjuntos, copias de seguridad, ajustes y más.

Para la referencia completa de la API, con todos los endpoints, parámetros y ejemplos con curl, consulta la **[documentación de la API REST](API-REST.md)**.

### Inicio rápido

```bash
# Listar todas las notas del usuario con ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# Lo mismo, con una contraseña de aplicación creada en Configuración > Contraseñas de aplicación
# (funciona en instancias solo SSO; X-User-ID va implícito)
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# Crear una nota
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Documentación interactiva (Swagger)

Accede a **Swagger UI** directamente desde Poznote en `Settings > About > API REST` para explorar todos los endpoints, ver los esquemas de petición y respuesta, y probar las llamadas a la API de forma interactiva.

## Stack tecnológico

Poznote da prioridad a la sencillez y la portabilidad: sin frameworks complejos ni dependencias pesadas. Solo tecnologías web sencillas y fiables que garantizan que tus notas sigan siendo accesibles y estén bajo tu control.

**Arquitectura centrada en la privacidad:** Poznote funciona completamente en local, sin necesidad de conexiones externas para su funcionamiento. Todas las bibliotecas (Excalidraw, Mermaid, KaTeX) vienen incluidas y se sirven desde tu propia instancia. De serie, la única conexión saliente es una comprobación diaria de actualizaciones; las funciones opcionales que actives tú mismo (Sincronización Git, S3, un proveedor de IA, webhooks, SMTP, OIDC) son las únicas otras.

<details>
<summary>Si te interesa el stack tecnológico sobre el que está construido Poznote, <strong>échale un vistazo aquí.</strong></summary>

### Backend
- **PHP 8.x**: lenguaje de scripting del lado del servidor
- **SQLite 3**: base de datos relacional ligera basada en archivos

### Frontend
- **HTML5**: marcado y estructura
- **CSS3**: estilos y diseño adaptable
- **JavaScript (Vanilla)**: funciones interactivas y contenido dinámico
- **React + Vite**: cadena de compilación del componente Excalidraw (empaquetado como IIFE)
- **AJAX**: carga asíncrona de datos

### Bibliotecas
- **CodeMirror 6**: editor de código y texto extensible para la experiencia de edición Markdown
- **Excalidraw**: pizarra virtual para dibujar diagramas y bocetos
- **Mermaid**: biblioteca JavaScript del lado del cliente para generar diagramas y diagramas de flujo a partir de texto
- **KaTeX**: biblioteca JavaScript del lado del cliente para la composición rápida de fórmulas y el renderizado de ecuaciones matemáticas
- **Sortable.js**: biblioteca JavaScript para ordenar mediante arrastrar y soltar
- **highlight.js**: resaltado de sintaxis para los bloques de código
- **Swagger UI**: documentación interactiva de la API e interfaz de pruebas

### Almacenamiento
- **Archivos HTML/Markdown**: las notas se guardan como archivos HTML o Markdown simples en el sistema de archivos
- **Base de datos SQLite**: metadatos, etiquetas, relaciones y datos de usuario
- **Archivos adjuntos**: se guardan en el sistema de archivos local o, opcionalmente, en un almacenamiento de objetos compatible con S3

### Infraestructura
- **Nginx + PHP-FPM**: servidor web de alto rendimiento con FastCGI Process Manager
- **Alpine Linux**: imagen base segura y ligera
- **Docker**: contenedores para un despliegue sencillo y portable
- **Python 3.12 (Alpine)**: entorno de ejecución del servidor MCP con las bibliotecas httpx, uvicorn y fastmcp para la integración con asistentes de IA
</details>
