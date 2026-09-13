<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Servidor MCP de Poznote

Servidor MCP (Model Context Protocol) para Poznote: permite gestionar las notas con IA mediante lenguaje natural.

Este servidor admite **únicamente el transporte HTTP** (MCP Streamable HTTP).

> [!TIP]
> ¿Buscas un chat con un modelo local (por ejemplo Ollama) directamente dentro de Poznote? Para eso no necesitas el servidor MCP: usa en su lugar el [Asistente IA](AI-ASSISTANT.es.md) integrado (**Configuración → Herramientas de administración → Asistente IA**). El servidor MCP sirve para conectar a tus notas asistentes *externos* compatibles con MCP; Ollama por sí solo es un entorno de ejecución de modelos, no un cliente MCP, y no puede conectarse a él directamente.

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

## Inicio rápido

Elige tu asistente de IA preferido:

- **[VS Code Copilot](VSCODE-COPILOT.es.md):** integra Poznote en tu editor
- **[Claude CLI](CLAUDE-CLI.es.md):** usa Poznote desde la línea de comandos

---

## Cómo funciona

El servidor MCP actúa como puente entre los asistentes de IA y tu instancia de Poznote.

### Componentes

- **`server.py`**: servidor MCP (HTTP / Streamable HTTP)
  - Expone el endpoint MCP en `http://127.0.0.1:8045/mcp`
  - Define las herramientas (acciones) para gestionar las notas
  - Orquesta las llamadas entre la IA y la API de Poznote

- **`client.py`**: cliente HTTP para la API REST de Poznote
  - Realiza las peticiones HTTP (GET, POST, PATCH, DELETE)
  - Gestiona la autenticación en la API de Poznote con el token de servicio MCP compartido

### Flujo de comunicación

1. El asistente de IA (VS Code Copilot o Claude CLI) se conecta al servidor MCP
2. El servidor MCP llama a la API REST de Poznote
3. Los resultados se devuelven al asistente de IA

Una pestaña de Poznote abierta en el navegador recoge en pocos segundos los cambios hechos a través de MCP: el árbol de la barra lateral y la nota abierta se actualizan en su sitio (o muestran un aviso de recarga cuando la nota tiene cambios sin guardar). Una nota que simplemente está abierta en el navegador no bloquea las escrituras MCP; solo una nota que está editando otro usuario de la misma cuenta, o un visitante desde un enlace público compartido, responde con un error HTTP 423.

## Funciones

### Herramientas (acciones)
- `get_note`: obtiene una nota concreta por su ID con todo su contenido
- `list_notes`: lista las notas de un espacio de trabajo, página a página (`limit`/`offset`, con el `total` real del espacio de trabajo en el resultado)
- `search_notes`: busca notas por texto, con un intervalo opcional de fechas de creación
- `create_note`: crea una nota nueva, opcionalmente a partir de una plantilla y/o con fecha de vencimiento/recordatorio
- `update_note`: actualiza una nota existente, la mueve y/o define su fecha de vencimiento/recordatorio
- `delete_note`: elimina una nota por su ID
- `get_reminder`: obtiene el recordatorio definido actualmente en una nota
- `set_reminder`: define o sustituye el recordatorio de una nota, con un intervalo de repetición opcional
- `remove_reminder`: quita el recordatorio de una nota
- `list_tasks`: lista las tareas de una nota de lista de tareas, con sus ID, fechas de vencimiento e indicadores
- `add_task`: añade una única tarea a una nota de lista de tareas, con fecha de vencimiento y recordatorio opcionales
- `update_task`: actualiza una tarea (texto, fecha de vencimiento, recordatorio, indicador de importante)
- `complete_task`: marca una tarea como hecha, o la vuelve a abrir
- `delete_task`: elimina una tarea de una nota de lista de tareas
- `create_folder`: crea una carpeta, por nombre o por ruta (`folder_path="Projects/2026/Q3"` crea toda la cadena en una sola llamada), o una raíz de diario con `is_diary=true`
- `list_folders`: lista todas las carpetas de un espacio de trabajo, con sus rutas y sus indicadores de diario
- `list_workspaces`: lista todos los espacios de trabajo disponibles
- `list_tags`: lista todas las etiquetas únicas usadas en las notas
- `list_templates`: lista las notas plantilla a partir de las que puede empezar `from_template_id` de `create_note`
- `get_trash`: lista todas las notas que están en la papelera
- `empty_trash`: elimina definitivamente todas las notas de la papelera
- `restore_note`: restaura una nota desde la papelera
- `duplicate_note`: crea un duplicado de una nota existente
- `toggle_favorite`: activa o desactiva el estado de favorita de una nota
- `list_attachments`: lista todos los archivos adjuntos de una nota concreta
- `add_attachment`: adjunta un archivo a una nota a partir de su contenido en base64 (imagen, log, PDF, …)
- `move_note`: mueve una nota a otro espacio de trabajo y/o carpeta, conservando su id
- `move_folder`: mueve una carpeta (con sus subcarpetas y notas) bajo otra carpeta padre y/o a otro espacio de trabajo
- `move_note_to_folder`: mueve una nota a una carpeta concreta
- `remove_note_from_folder`: saca una nota de su carpeta actual (la mueve a la raíz)
- `share_note`: activa el uso compartido público de una nota y obtiene la URL pública
- `unshare_note`: desactiva el uso compartido público de una nota
- `get_note_share_status`: obtiene el estado actual de uso compartido y la URL pública de una nota
- `list_shared`: lista todas las notas y carpetas compartidas públicamente
- `get_backlinks`: obtiene todas las notas que enlazan a (hacen referencia a) una nota concreta
- `convert_note`: convierte una nota entre los formatos HTML y Markdown
- `rename_folder`: renombra una carpeta existente
- `delete_folder`: elimina una carpeta y mueve sus notas a la papelera
- `create_workspace`: crea un espacio de trabajo nuevo
- `rename_workspace`: renombra un espacio de trabajo existente
- `delete_workspace`: elimina un espacio de trabajo (no se puede eliminar el último)
- `get_git_sync_status`: obtiene el estado actual de la sincronización Git (GitHub/GitLab/Forgejo)
- `git_push`: fuerza el envío de las notas locales al repositorio Git configurado
- `git_pull`: fuerza la recuperación de las notas desde el repositorio Git configurado
- `get_system_info`: obtiene información de versión de la instalación de Poznote
- `list_backups`: lista todas las copias de seguridad del sistema disponibles
- `create_backup`: lanza la creación de una nueva copia de seguridad del sistema
- `restore_backup`: restaura un archivo de copia de seguridad (sustituye los datos actuales del usuario)
- `delete_backup`: elimina un archivo de copia de seguridad concreto
- `get_app_setting`: obtiene el valor de un ajuste concreto de la aplicación
- `update_app_setting`: actualiza el valor de un ajuste concreto de la aplicación

**A qué espacio de trabajo va una llamada.** Indica siempre el `workspace` en `create_note`, `create_folder` y `list_folders` (las carpetas siempre pertenecen a un espacio de trabajo): es la única forma de estar seguro. Cuando se omite, el servidor lo resuelve en un orden fijo y nunca adivina: el ajuste `mcp_default_workspace` cuando nombra un espacio de trabajo que existe, y después el único espacio de trabajo de la cuenta cuando solo tiene uno. Con varios espacios de trabajo y sin ese ajuste, la llamada se rechaza y la respuesta los enumera, en lugar de dejar la nota en el espacio de trabajo que resulte quedar primero en el orden (que antes cambiaba por sí solo, por ejemplo la primera vez que archivar una nota creaba "Archives"). Define el valor por defecto con `update_app_setting("mcp_default_workspace", "<name>")`.

**Archivos adjuntos.** `add_attachment(note_id, filename, content_base64)` guarda un archivo en una nota exactamente como lo hace arrastrar y soltar en la interfaz web, de modo que un gráfico generado o un archivo de log se pueden adjuntar sin intervención humana; se acepta una URI `data:` como contenido. Las reglas propias de Poznote siguen aplicándose, así que un tipo ejecutable o una cuota de almacenamiento llena se devuelven como un rechazo con el motivo. Los bytes viajan codificados en base64 dentro de la llamada a la herramienta, por lo que la herramienta limita una subida a 25 MB y remite a la interfaz web para cualquier archivo mayor.

**Mover elementos.** `move_note` y `move_folder` mueven, no copian: los ids, el contenido, el historial y los enlaces que apuntan a una nota se conservan. En `update_note`, `workspace` indica dónde *buscar la nota*; el argumento que la mueve es `target_workspace`. Una nota que cambia de espacio de trabajo sin recibir una carpeta del destino queda en la raíz de ese espacio de trabajo, ya que su carpeta anterior pertenece al espacio de trabajo que ha dejado. Una carpeta se lleva consigo sus subcarpetas y todas las notas que contienen.

**Carpetas.** Todas las herramientas que reciben una carpeta aceptan lo mismo: un nombre o una ruta separada por barras. `create_note(folder="Diary/2026/08")` crea los niveles que faltan por el camino; `create_folder(folder_path=…)` hace lo mismo para una carpeta; `list_notes(folder_id=…)` limita un listado a una carpeta en el lado del servidor, de modo que su `total` cuenta solo esa carpeta. Un nombre sin ruta llega a una carpeta existente a cualquier profundidad cuando solo una carpeta del espacio de trabajo lo lleva, en lugar de crear una segunda en la raíz; cuando varias lo llevan, la llamada se rechaza y las enumera, así que indica la ruta completa o el id.

**Diarios.** Un diario no es simplemente una carpeta llamada Diario: es una carpeta raíz con el indicador `is_diary`, y el botón "Nueva entrada de diario" de la interfaz guarda sus notas fechadas en esa raíz marcada. Crea uno con `create_folder(folder_name="Journal", is_diary=true)`, y `list_folders` te indica qué carpetas son diarios. Pasar un nombre que ya lleva una carpeta raíz convierte esa carpeta en diario y conserva sus notas. Las entradas de diario en sí son notas normales: guárdalas con `create_note(folder="Journal/2026/09")`.

**Plantillas.** Una plantilla es una nota normal guardada en una carpeta llamada `Templates` (cuenta cualquier profundidad por debajo) o en cualquier lugar de un espacio de trabajo con ese nombre; la palabra se reconoce en todos los idiomas incluidos, así que una carpeta `Modèles` también funciona. `list_templates` las devuelve con sus ids, y `create_note(from_template_id=…)` crea una nota nueva a partir de una de ellas, en el formato propio de la plantilla; pide `note_type="markdown"` y una plantilla HTML se convierte, igual que la convierte el comando `/template` en el editor. Una plantilla no puede servir de base para una lista de tareas ni para un dibujo. Si además pasas `content`, se añade después del cuerpo de la plantilla.

**Recordatorios y tareas.** `reminder_at` (en `create_note`/`update_note` y `set_reminder`) es una fecha y hora ISO como `2026-09-01T09:00:00+02:00`; incluye un desfase horario, o la hora se interpreta como UTC. Las fechas de vencimiento de las tareas (`due_at`) son distintas: son valores de hora local, `YYYY-MM-DD` o `YYYY-MM-DDTHH:MM` sin desfase, que se resuelven según la zona horaria configurada por el usuario, y una fecha sin hora avisa a las 09:00. Los intervalos de repetición usan `<count><unit>` con la unidad `i`/`h`/`d`/`w`/`m`/`y`, por ejemplo `30i`, `1d` o `2w`.

Las herramientas de tareas trabajan con una tarea cada vez: llama a `list_tasks` para obtener los ID de las tareas y después a `add_task`, `update_task`, `complete_task` o `delete_task`. Cada llamada solo lleva esa tarea, de modo que un cliente nunca lee una lista de tareas para devolver un array completo nuevo, y dos clientes que editan tareas distintas no pueden sobrescribirse entre sí. Poznote guarda las tareas de una nota como un único array JSON, que el servidor reescribe en cada llamada, así que el trabajo que hace una llamada sigue creciendo con la longitud de la lista. Las notificaciones se mantienen sincronizadas automáticamente, y completar o eliminar una tarea retira su recordatorio pendiente.

La mayoría de las herramientas aceptan un argumento opcional `user_id` para dirigirse a un perfil de usuario concreto. Cuando se indica, el servidor MCP envía la cabecera `X-User-ID` en esa petición, lo que te permite crear o leer notas en distintos perfiles sin cambiar el entorno MCP global. Las excepciones son las herramientas de nivel de sistema `get_system_info`, `list_backups`, `create_backup` y `delete_backup`, que no aceptan `user_id`. Para cambiar el perfil por defecto que se usa cuando no se pasa ningún `user_id`, consulta [Perfil de usuario por defecto](#perfil-de-usuario-por-defecto).

---

## Instalación del servidor

El servidor MCP está incluido en el `docker-compose.yml` oficial de Poznote y se ejecuta automáticamente.

### Configuración

El servidor MCP usa los valores por defecto de `docker-compose.yml`:

```bash
# El puerto del servidor MCP es 8045 por defecto
# El registro de depuración está desactivado (false) por defecto
```

Poznote genera automáticamente el token de servicio MCP en `data/.mcp_token`. El contenedor `mcp-server` lee ese archivo a través del volumen compartido `./data:/var/www/html/data:ro`, así que no hay ninguna contraseña que guardar en `.env`.

Para cambiar el puerto y la depuración en un solo arranque, vuelve a crear el contenedor MCP con variables de entorno en línea:

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Un simple `docker compose restart mcp-server` no recarga las variables de entorno modificadas.

#### Perfil de usuario por defecto

Por defecto, el servidor MCP funciona como el perfil de usuario `1` (el primer administrador). Para fijar el servidor a otro perfil, define `POZNOTE_USER_ID` al arrancar el contenedor:

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

Todas las llamadas a herramientas se aplican entonces a ese perfil, salvo que una petición pase un argumento `user_id` explícito, que sigue teniendo prioridad para esa petición. El valor debe ser un ID de perfil numérico; cualquier otro valor se ignora con una advertencia en los logs de MCP y se usa el valor por defecto `1`.

#### Token de autenticación entrante

Por defecto, el endpoint MCP acepta a cualquier cliente que pueda llegar a él, lo cual es seguro porque el puerto solo se publica en `127.0.0.1`. Si expones el puerto más allá de tu máquina (proxy inverso, LAN, instalación bare-metal), define `POZNOTE_MCP_AUTH_TOKEN` y el servidor exigirá una cabecera `Authorization: Bearer <token>` en cada petición, y responderá `401 Unauthorized` en caso contrario:

```bash
# Genera un token robusto una sola vez
openssl rand -hex 32

# Ponlo en .env
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# Vuelve a crear el contenedor MCP para que tome el nuevo entorno
docker compose up -d --force-recreate mcp-server
```

Después añade la misma cabecera a la configuración de tu cliente: consulta [VS Code Copilot](VSCODE-COPILOT.es.md#usar-un-token-de-autenticación) y [Claude CLI](CLAUDE-CLI.es.md#usar-un-token-de-autenticación). Los espacios en blanco al principio y al final se ignoran, así que un token leído de un archivo de secretos con un salto de línea final sigue funcionando. Un valor vacío deja el endpoint abierto. La línea de log del arranque indica qué modo está activo.

Este token es distinto de `data/.mcp_token`: aquel lo usa el servidor MCP para comunicarse *con* la API de Poznote, este es el que *tu asistente de IA* debe presentar al servidor MCP.

#### Modo de depuración

Define `POZNOTE_DEBUG=true` en el comando de arranque para cambiar el nivel de log de `INFO` a `DEBUG`. Vuelve a ponerlo en `false` para el uso normal. Solo se reconocen los valores exactos en minúsculas `true` y `false`. Cualquier otro valor se trata como `false` y se escribe una advertencia en los logs de MCP. El servidor web es más tolerante y también acepta `1`, `on` o `yes`. Cada petición HTTP enviada a la API de Poznote, cada llamada a herramienta recibida del asistente de IA y cada respuesta se escriben en detalle en los logs del contenedor. Úsalo para diagnosticar problemas de conexión o de autenticación:

```bash
docker compose logs -f mcp-server
```

Déjalo desactivado en el uso normal: el nivel de detalle adicional no hace falta en el día a día.

### Iniciar el servidor

```bash
docker-compose up -d
```

### Verificar la instalación

```bash
# Comprueba que el contenedor está en ejecución
docker ps | grep mcp

# Prueba el endpoint
curl http://127.0.0.1:8045/mcp
```

Para desactivar el servidor MCP, comenta el servicio `mcp-server` en `docker-compose.yml`.

---

## Configuración del cliente

Configura tu asistente de IA para que se conecte al servidor MCP:

### **VS Code Copilot**
Guía de configuración completa: **[VSCODE-COPILOT.md](VSCODE-COPILOT.es.md)**

### **Claude CLI**
Guía de configuración completa: **[CLAUDE-CLI.md](CLAUDE-CLI.es.md)**

---

## Seguridad

Cualquiera que pueda llegar al endpoint MCP puede leer, crear, modificar y eliminar todas las notas de todos los perfiles (las herramientas aceptan un argumento `user_id`), y también puede lanzar copias de seguridad, restauraciones y cambios de configuración. Dos capas evitan que eso sea un problema:

1. **Accesibilidad de red.** Por defecto, el endpoint solo es accesible desde la máquina local.
2. **Token bearer entrante** (opcional). Define `POZNOTE_MCP_AUTH_TOKEN` y cada petición deberá llevar `Authorization: Bearer <token>`.

Con el `docker-compose.yml` por defecto, la capa 1 basta por sí sola. Añade la capa 2 en cuanto el puerto sea accesible desde algún lugar que no controlas por completo.

### Por qué limitarse a 127.0.0.1 es normal y seguro

El contenedor MCP escucha en `0.0.0.0` *dentro* del contenedor, algo que Docker necesita para que funcione la asignación de puertos, pero el puerto se publica **solo en `127.0.0.1`** del host, nunca en una interfaz pública:

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

Es intencionado y es la configuración correcta: solo pueden conectarse los procesos que se ejecutan en la misma máquina (o los túneles SSH que configures explícitamente). Con la configuración por defecto no hay nada de qué preocuparse.

### Ejecutar el servidor MCP fuera de Docker

Si instalas el servidor MCP con `pip` y ejecutas `poznote-mcp serve` tú mismo (systemd, Proxmox LXC, ...), no hay ninguna asignación de puertos de Docker delante, así que la dirección de escucha importa:

- `poznote-mcp serve` escucha en **`127.0.0.1` por defecto**. Mantén ese valor salvo que sepas por qué necesitas otro.
- Si tienes que escuchar en `0.0.0.0` (un proxy inverso en otro host, una interfaz VPN), define también `POZNOTE_MCP_AUTH_TOKEN`. El servidor registra una advertencia al arrancar cuando escucha en una dirección que no es loopback sin token.
- Las versiones antiguas escuchaban en `0.0.0.0` por defecto: pasa `--host=127.0.0.1` explícitamente (o define `MCP_HOST=127.0.0.1` al ejecutarlo sin el subcomando `serve`).

### Acceso remoto

Si Poznote se ejecuta en un servidor remoto y quieres conectarte desde tu equipo, usa la redirección de puertos SSH, y **no** expongas el puerto públicamente:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Después apunta tu asistente de IA a `http://127.0.0.1:8045/mcp` como de costumbre.

### Entornos de producción

Si tienes que hacer pasar el servidor MCP por una red, protégelo con:
- `POZNOTE_MCP_AUTH_TOKEN` (consulta [Token de autenticación entrante](#token-de-autenticación-entrante)), y HTTPS delante para que el token no viaje en claro
- Una VPN (Tailscale, WireGuard)
- Opcionalmente, un proxy inverso con su propia autenticación o lista de IP permitidas (nginx, Caddy) como capa adicional

### Cómo se autentica el servidor MCP en Poznote

El servidor MCP se conecta a la API REST de Poznote con un token Bearer interno guardado en `data/.mcp_token`. Poznote crea este token automáticamente, y la configuración de Docker Compose monta `./data` en solo lectura en el contenedor MCP, de modo que el token nunca tiene que estar en `.env`.

Como ese token identifica al servidor MCP, Poznote toma una instantánea de una nota justo antes de que una petición que lo lleva modifique el contenido o las tareas de la nota (`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`). Aparece como "Antes del cambio por MCP" en el menú Instantáneas de la nota, así que una reescritura de la IA que haya perdido contenido se puede restaurar con un clic. No se toma ninguna instantánea cuando la más reciente ya contiene el mismo contenido, y se conservan las 20 más recientes por nota, un número que conviene aumentar en **Configuración → Instantáneas** (hasta 200) cuando el servidor MCP edita lo suficiente como para agotar 20 en una tarde.

---

## Ejemplos de uso

Una vez configurado, interactúa con Poznote en lenguaje natural:

```
Lista todas las notas del espacio de trabajo 'Poznote'
Busca notas sobre 'MCP'
Crea una nota titulada 'Meeting Notes' sobre la conversación
Actualiza la nota 123 con contenido nuevo
Mueve la nota 456 a la carpeta 'Projects'
```

Para ejemplos de uso detallados y resolución de problemas:
- VS Code Copilot: [VSCODE-COPILOT.md](VSCODE-COPILOT.es.md#ejemplos-de-uso)
- Claude CLI: [CLAUDE-CLI.md](CLAUDE-CLI.es.md#ejemplos-de-uso)

---

## Soporte y recursos

- **[Configuración de VS Code Copilot →](VSCODE-COPILOT.es.md)**
- **[Configuración de Claude CLI →](CLAUDE-CLI.es.md)**

Para cualquier problema:
- Consulta los logs del servidor MCP: `docker compose logs mcp-server`
- Comprueba que la API de Poznote es accesible
- Consulta las guías de resolución de problemas de cada cliente
