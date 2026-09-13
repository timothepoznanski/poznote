<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Usar el servidor MCP de Poznote con Claude CLI

Esta guía explica cómo configurar y usar el servidor MCP de Poznote con Claude CLI (interfaz de línea de comandos).

## Requisitos previos

- **Clave API de Anthropic:** Claude CLI requiere una [clave API de Anthropic](https://console.anthropic.com/) de pago. Defínela antes de usar la CLI:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI instalado (`npm install -g @anthropic-ai/claude-cli` o similar)
- El servidor MCP de Poznote en ejecución (mediante Docker Compose)
- El servidor MCP accesible en 127.0.0.1 (puerto por defecto: 8045)

## Instalación

### 1. Comprobar que el servidor MCP está en ejecución

Comprueba que el contenedor de tu servidor MCP está en ejecución:

```bash
docker ps | grep mcp
```

Deberías ver el servidor MCP en ejecución. Anota el número de puerto que aparece en la salida (por defecto 8045).

### 2. Añadir el servidor MCP a Claude CLI

Añade el servidor MCP de Poznote con el transporte HTTP:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **Nota:** sustituye `8045` por el puerto real de tu servidor MCP si lo has personalizado en tu `docker-compose.yml`.

#### Usar un token de autenticación

Si el servidor MCP se inició con `POZNOTE_MCP_AUTH_TOKEN` (consulta [Token de autenticación entrante](MCP-SERVER.es.md#token-de-autenticación-entrante)), pasa el mismo token como cabecera, o todas las llamadas se rechazarán con `401 Unauthorized`:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

El lugar donde se guarda la configuración depende de la opción `--scope`:
- **Local (predeterminado):** `~/.claude.json`, disponible solo en el directorio donde ejecutaste el comando
- **Usuario (`--scope user`):** `~/.claude.json`, disponible en todos tus proyectos
- **Proyecto (`--scope project`):** `.mcp.json` en la raíz del proyecto, pensado para versionarlo y compartirlo con tu equipo

### 3. Verificar la configuración

Lista todos los servidores MCP configurados:
```bash
claude mcp list
```

Deberías ver `poznote` en la lista con su URL HTTP.

### 4. Ver los detalles del servidor

Obtén información detallada sobre el servidor MCP de Poznote:
```bash
claude mcp get poznote
```

## Ejemplos de uso

Una vez configurado, puedes interactuar con tu instancia de Poznote mediante órdenes en lenguaje natural:

### Consultas básicas

```bash
# Listar todas las notas
claude "Lista todas mis notas de Poznote"

# Buscar notas
claude "Busca notas sobre 'docker' en Poznote"

# Obtener una nota concreta
claude "Muéstrame la nota 123 de Poznote"

# Listar los espacios de trabajo
claude "¿Qué espacios de trabajo tengo en Poznote?"

# Listar las carpetas
claude "Muéstrame todas las carpetas de mi espacio de trabajo de Poznote"
```

### Crear y actualizar notas

```bash
# Crear una nota nueva
# IMPORTANTE: si no indicas el espacio de trabajo, la nota se crea en el
# espacio de trabajo por defecto del usuario conectado. Indica siempre el espacio de trabajo de destino.
claude "Crea una nota en Poznote titulada 'Meeting Notes' en el espacio de trabajo 'Projets' con el contenido 'Conversación sobre la nueva función'"

# Actualizar una nota existente
claude "Actualiza la nota 456 de Poznote con contenido nuevo sobre el proceso de despliegue"

# Eliminar una nota (la mueve a la papelera)
claude "Elimina la nota 456 de Poznote"

# Crear una nota con un recordatorio, en un solo paso
claude "Crea una nota 'Renew passport' en el espacio de trabajo 'Perso' de Poznote y recuérdamela el 1 de septiembre a las 9 de la mañana"

# Crear una carpeta
claude "Crea una carpeta llamada 'Projects' en Poznote"
```

### Recordatorios

```bash
# Poner un recordatorio en una nota existente
claude "Recuérdame la nota 123 de Poznote el próximo lunes a las 8 de la mañana"

# Poner un recordatorio periódico
claude "Pon un recordatorio semanal en la nota 123 de Poznote, todos los lunes a las 9 de la mañana"

# Consultar un recordatorio
claude "¿Tiene un recordatorio la nota 123 de Poznote?"

# Quitar un recordatorio
claude "Quita el recordatorio de la nota 123 de Poznote"
```

### Listas de tareas

```bash
# Listar las tareas de una nota de lista de tareas
claude "Muéstrame las tareas de la nota 123 de Poznote"

# Añadir una tarea con fecha de vencimiento y recordatorio
claude "Añade a la nota 123 de Poznote una tarea 'Buy milk' para mañana a las 18:30 con un recordatorio"

# Añadir una tarea periódica
claude "Añade una tarea 'Weekly report' a la nota 123 de Poznote, con vencimiento todos los viernes"

# Completar una tarea
claude "Marca como hecha la tarea 'Buy milk' de la nota 123 en Poznote"

# Actualizar o eliminar una tarea
claude "Pasa la fecha de vencimiento de la tarea 'Buy milk' de la nota 123 al próximo lunes en Poznote"
claude "Elimina la tarea 'Buy milk' de la nota 123 en Poznote"
```

### Operaciones avanzadas

```bash
# Duplicar una nota
claude "Duplica la nota 789 en Poznote"

# Cambiar el estado de favorita
claude "Marca la nota 123 como favorita en Poznote"

# Mover una nota a una carpeta
claude "Mueve la nota 456 a la carpeta 'Projects' en Poznote"

# Convertir una nota entre HTML y Markdown
claude "Convierte la nota 123 de Poznote a Markdown"

# Encontrar las notas que enlazan a una nota
claude "¿Qué notas enlazan a la nota 123 en Poznote?"

# Compartir una nota
claude "Activa el uso compartido público de la nota 123 en Poznote"

# Listar todo lo compartido públicamente
claude "Lista todas mis notas y carpetas compartidas públicamente en Poznote"

# Obtener información del sistema
claude "¿Qué versión de Poznote estoy usando?"
```

### Carpetas y espacios de trabajo

```bash
# Renombrar o eliminar una carpeta
claude "Renombra la carpeta 12 a 'Archive' en Poznote"
claude "Elimina la carpeta 12 en Poznote y mueve sus notas a la papelera"

# Gestionar los espacios de trabajo
claude "Crea un espacio de trabajo llamado 'Work' en Poznote"
claude "Renombra el espacio de trabajo 'Work' a 'Job' en Poznote"
claude "Elimina el espacio de trabajo 'Job' en Poznote"
```

### Ajustes

```bash
# Leer un ajuste
claude "¿Cuál es el valor del ajuste 'timezone' en Poznote?"

# Actualizar un ajuste
claude "Pon el ajuste 'timezone' en 'Europe/Paris' en Poznote"
```

### Papelera y restauración

```bash
# Ver la papelera
claude "Muéstrame todas las notas de la papelera de Poznote"

# Restaurar una nota
claude "Restaura la nota 123 desde la papelera de Poznote"

# Vaciar la papelera
claude "Vacía la papelera de Poznote"
```

### Sincronización Git

```bash
# Consultar el estado de la sincronización Git
claude "¿Cuál es el estado de la sincronización Git en Poznote?"

# Enviar a Git
claude "Envía mis notas de Poznote a Git"

# Recuperar desde Git
claude "Recupera las notas desde Git en Poznote"
```

### Copias de seguridad

```bash
# Listar las copias de seguridad
claude "Lista todas las copias de seguridad de Poznote"

# Crear una copia de seguridad
claude "Crea una copia de seguridad de mis datos de Poznote"

# Restaurar una copia de seguridad (⚠️ sustituye todos los datos actuales del usuario)
claude "Restaura la copia de seguridad de Poznote poznote_backup_2026-02-02_15-30-00.zip"

# Eliminar un archivo de copia de seguridad
claude "Elimina la copia de seguridad de Poznote poznote_backup_2026-02-02_15-30-00.zip"
```

## Modo interactivo

Inicia una sesión interactiva en la que puedes conversar con Claude sobre tus notas:

```bash
claude
```

Después haz tus preguntas con naturalidad:
- "¿Puedes mostrarme todas mis notas con la etiqueta 'important'?"
- "Haz un resumen de todas mis notas de reuniones de la semana pasada"
- "Ayúdame a organizar mis notas en carpetas"

## Opciones de configuración

### Usar un puerto personalizado

Si tu servidor MCP se ejecuta en otro puerto (busca el ajuste `POZNOTE_MCP_PORT` en tu `docker-compose.yml`):
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### Quitar el servidor

Para quitar el servidor MCP de Poznote de Claude CLI:
```bash
claude mcp remove poznote
```

### Varias instancias

Si ejecutas varias instancias de Poznote en puertos distintos, puedes configurarlas con nombres distintos:
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

Después indica en tus consultas qué instancia usar:
```bash
claude "Lista las notas de poznote-work"
```

## Resolución de problemas

### Problemas de conexión

Si Claude CLI no puede conectarse al servidor MCP:

1. **Comprueba si el servidor MCP está en ejecución:**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   (Sustituye `8045` por el puerto que hayas configurado)

2. **Verifica el estado del contenedor Docker:**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **Comprueba la asignación del puerto:**
   Asegúrate de que el puerto está asociado a 127.0.0.1 en `docker-compose.yml`:
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### Errores de autenticación

El servidor MCP se autentica en Poznote con el token compartido guardado en `data/.mcp_token`.

Comprueba estos puntos:
- `./data/.mcp_token` existe en el host de Poznote
- el servicio `mcp-server` monta `./data:/var/www/html/data:ro`
- el contenedor webserver se ha vuelto a crear al menos una vez después de actualizar a la configuración MCP basada en token

### Modo de depuración

Activa el registro de depuración del servidor MCP volviendo a crear el contenedor con una variable de entorno en línea:
```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Solo se reconocen los valores exactos en minúsculas `true` y `false`. Cualquier otro valor se trata como `false` y se escribe una advertencia en los logs de MCP.

Después consulta los logs:
```bash
docker compose logs -f mcp-server
```

## Notas de seguridad

⚠️ **Importante:** cualquiera que pueda llegar al endpoint MCP puede gestionar todas las notas. Por defecto solo es accesible desde 127.0.0.1; si lo expones más allá, define `POZNOTE_MCP_AUTH_TOKEN` para que los clientes tengan que presentar un token bearer (consulta [Usar un token de autenticación](#usar-un-token-de-autenticación)).

**Configuración por defecto (segura):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Para el acceso remoto, usa un túnel SSH:**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Todos los detalles: [Seguridad del servidor MCP](MCP-SERVER.es.md#seguridad).

## Herramientas MCP disponibles

El servidor MCP de Poznote ofrece las siguientes herramientas:

### Gestión de notas
- `get_note`: obtiene una nota concreta por su ID
- `list_notes`: lista todas las notas
- `search_notes`: busca notas por texto, con un intervalo opcional de fechas de creación
- `create_note`: crea una nota nueva, opcionalmente con fecha de vencimiento/recordatorio
- `update_note`: actualiza una nota existente y/o define su fecha de vencimiento/recordatorio
- `delete_note`: elimina una nota
- `duplicate_note`: duplica una nota
- `convert_note`: convierte una nota entre HTML y Markdown
- `get_backlinks`: obtiene las notas que enlazan a una nota

### Recordatorios
- `get_reminder`: obtiene el recordatorio definido en una nota
- `set_reminder`: define o sustituye el recordatorio de una nota, con un intervalo de repetición opcional
- `remove_reminder`: quita el recordatorio de una nota

### Tareas
- `list_tasks`: lista las tareas de una nota de lista de tareas, con sus ID y fechas de vencimiento
- `add_task`: añade una única tarea, con fecha de vencimiento y recordatorio opcionales
- `update_task`: actualiza una tarea (texto, fecha de vencimiento, recordatorio, indicador de importante)
- `complete_task`: marca una tarea como hecha, o la vuelve a abrir
- `delete_task`: elimina una tarea de una nota de lista de tareas

### Organización
- `create_folder`: crea una carpeta nueva
- `list_folders`: lista todas las carpetas
- `rename_folder`: renombra una carpeta
- `delete_folder`: elimina una carpeta y mueve sus notas a la papelera
- `list_workspaces`: lista todos los espacios de trabajo
- `create_workspace`: crea un espacio de trabajo nuevo
- `rename_workspace`: renombra un espacio de trabajo
- `delete_workspace`: elimina un espacio de trabajo (no se puede eliminar el último)
- `list_tags`: lista todas las etiquetas
- `move_note_to_folder`: mueve una nota a una carpeta
- `remove_note_from_folder`: saca una nota de su carpeta
- `toggle_favorite`: cambia el estado de favorita

### Gestión de la papelera
- `get_trash`: lista las notas de la papelera
- `restore_note`: restaura desde la papelera
- `empty_trash`: vacía la papelera

### Uso compartido
- `share_note`: activa el uso compartido público
- `unshare_note`: desactiva el uso compartido público
- `get_note_share_status`: obtiene el estado de uso compartido
- `list_shared`: lista todas las notas y carpetas compartidas públicamente

### Archivos adjuntos
- `list_attachments`: lista los archivos adjuntos de una nota

### Sincronización Git
- `get_git_sync_status`: obtiene el estado de la sincronización Git
- `git_push`: envía al repositorio Git
- `git_pull`: recupera desde el repositorio Git

### Sistema
- `get_system_info`: obtiene la información de versión de Poznote
- `list_backups`: lista las copias de seguridad del sistema
- `create_backup`: crea una copia de seguridad
- `restore_backup`: restaura una copia de seguridad (sustituye los datos actuales del usuario)
- `delete_backup`: elimina un archivo de copia de seguridad
- `get_app_setting`: obtiene un ajuste de la aplicación
- `update_app_setting`: actualiza un ajuste de la aplicación

### Soporte multiusuario

La mayoría de las herramientas aceptan un parámetro opcional `user_id` para dirigirse a perfiles de usuario concretos. Las excepciones son las herramientas de nivel de sistema `get_system_info`, `list_backups`, `create_backup` y `delete_backup`, que no aceptan `user_id`.
```bash
claude "Lista las notas del usuario 2 en Poznote"
```

## Documentación relacionada

- [Documentación principal del servidor MCP](MCP-SERVER.es.md)
- [Configuración de VS Code Copilot](VSCODE-COPILOT.es.md)
- [Consideraciones de seguridad](MCP-SERVER.es.md#seguridad)

## Soporte

Para problemas o preguntas:
- Consulta la [documentación principal de MCP](MCP-SERVER.es.md)
- Revisa los logs del servidor MCP: `docker compose logs mcp-server`
- Comprueba que la API de Poznote es accesible
