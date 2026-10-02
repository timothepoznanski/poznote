<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <a href="VSCODE-COPILOT.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="VSCODE-COPILOT.pt.md">Português</a> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <a href="VSCODE-COPILOT.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Usar el servidor MCP de Poznote con VS Code Copilot

Esta guía explica cómo configurar y usar el servidor MCP de Poznote con VS Code Copilot.

## Requisitos previos

- Visual Studio Code instalado
- **Suscripción a GitHub Copilot:** se necesita un plan de pago (o de prueba) de [GitHub Copilot](https://github.com/features/copilot), con la extensión Copilot Chat activada en VS Code
- El servidor MCP de Poznote en ejecución (mediante Docker Compose)
- El servidor MCP accesible en 127.0.0.1 (puerto por defecto: 8045)

## Configuración

### 1. Comprobar que el servidor MCP está en ejecución

Comprueba que el contenedor de tu servidor MCP está en ejecución:

```bash
docker ps | grep mcp
```

Deberías ver el servidor MCP en ejecución. Anota el número de puerto que aparece en la salida (por defecto 8045).

### 2. Configurar VS Code

Añade el servidor MCP de Poznote a tu archivo `mcp.json`. Su ubicación depende de tu sistema operativo:

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

Si el archivo no existe, créalo con la siguiente configuración:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    }
  }
}
```

> **Nota:** sustituye `8045` por el puerto real de tu servidor MCP si lo has personalizado en tu `docker-compose.yml`.

#### Usar un token de autenticación

Si el servidor MCP se inició con `POZNOTE_MCP_AUTH_TOKEN` (consulta [Token de autenticación entrante](MCP-SERVER.es.md#token-de-autenticación-entrante)), añade la cabecera correspondiente, o todas las llamadas se rechazarán con `401 Unauthorized`:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Para no guardar el token en `mcp.json`, VS Code puede pedírtelo: declara una entrada `inputs` con `"password": true` y haz referencia a ella como `"Authorization": "Bearer ${input:poznote-token}"`.

### 3. Recargar VS Code

Después de modificar `mcp.json`, recarga VS Code para que los cambios surtan efecto:
- Pulsa `Ctrl+Shift+P` (o `Cmd+Shift+P` en Mac)
- Escribe "Reload Window" y pulsa Intro

## Configuración con un servidor remoto

Si tu instancia de Poznote se ejecuta en un servidor remoto, usa la redirección de puertos SSH para conectarte de forma segura.

### 1. Establecer el túnel SSH

Si prefieres la línea de comandos, crea un túnel SSH clásico:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Mantén esta conexión abierta mientras uses VS Code Copilot con Poznote.

Si ya estás conectado a la máquina remota mediante VS Code Remote SSH, Dev Containers o Codespaces, también puedes crear el túnel directamente desde VS Code en la vista `PORTS`:

1. Abre el panel `PORTS` en VS Code.
2. Reenvía el puerto remoto `8045`.
3. Mantén activo el puerto reenviado mientras uses Copilot.
4. Si VS Code asigna un puerto local distinto de `8045`, usa ese puerto local en `mcp.json`.

### 2. Configurar VS Code

Usa la misma configuración de `mcp.json` que para una instalación local:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    }
  }
}
```

El túnel SSH o el puerto reenviado por VS Code expone el servidor MCP remoto en tu máquina local, así que VS Code se conecta a `127.0.0.1`.

## Ejemplos de uso

Una vez configurado, puedes interactuar con tu instancia de Poznote directamente desde VS Code, en lenguaje natural, en Copilot Chat:

### Operaciones básicas

```
# Listar todas las notas
@poznote Lista todas mis notas

# Buscar notas
@poznote Busca notas sobre "docker"

# Obtener una nota concreta
@poznote Muéstrame la nota 123

# Listar los espacios de trabajo
@poznote ¿Qué espacios de trabajo tengo?

# Listar las carpetas
@poznote Muéstrame todas las carpetas de mi espacio de trabajo
```

### Crear y actualizar notas

> **Espacio de trabajo**: si no indicas el espacio de trabajo en tu petición, la nota se crea en el espacio de trabajo por defecto del usuario conectado. Nombra explícitamente el espacio de trabajo de destino para evitar cualquier confusión, por ejemplo: *"en el espacio de trabajo 'Projets'"*.

```
@poznote Crea una nota titulada "Meeting Notes" en el espacio de trabajo "Projets" con contenido sobre la nueva función

@poznote Actualiza la nota 456 con contenido nuevo sobre el proceso de despliegue

@poznote Elimina la nota 456 (la mueve a la papelera)

@poznote Crea una nota "Renew passport" en el espacio de trabajo "Perso" y recuérdamela el 1 de septiembre a las 9 de la mañana

@poznote Crea una carpeta llamada "Projects"
```

### Recordatorios

```
@poznote Recuérdame la nota 123 el próximo lunes a las 8 de la mañana

@poznote Pon un recordatorio semanal en la nota 123, todos los lunes a las 9 de la mañana

@poznote ¿Tiene un recordatorio la nota 123?

@poznote Quita el recordatorio de la nota 123
```

### Listas de tareas

```
@poznote Muéstrame las tareas de la nota 123

@poznote Añade a la nota 123 una tarea "Buy milk" para mañana a las 18:30 con un recordatorio

@poznote Añade una tarea "Weekly report" a la nota 123, con vencimiento todos los viernes

@poznote Marca como hecha la tarea "Buy milk" de la nota 123

@poznote Pasa la fecha de vencimiento de la tarea "Buy milk" de la nota 123 al próximo lunes

@poznote Elimina la tarea "Buy milk" de la nota 123
```

### Operaciones avanzadas

```
@poznote Duplica la nota 789

@poznote Marca la nota 123 como favorita

@poznote Mueve la nota 456 a la carpeta "Projects"

@poznote Convierte la nota 123 a Markdown

@poznote ¿Qué notas enlazan a la nota 123?

@poznote Activa el uso compartido público de la nota 123

@poznote Lista todas mis notas y carpetas compartidas públicamente

@poznote ¿Qué versión de Poznote estoy usando?
```

### Carpetas y espacios de trabajo

```
@poznote Renombra la carpeta 12 a "Archive"

@poznote Elimina la carpeta 12 y mueve sus notas a la papelera

@poznote Crea un espacio de trabajo llamado "Work"

@poznote Renombra el espacio de trabajo "Work" a "Job"

@poznote Elimina el espacio de trabajo "Job"
```

### Papelera y restauración

```
@poznote Muéstrame todas las notas de la papelera

@poznote Restaura la nota 123 desde la papelera

@poznote Vacía la papelera
```

### Sincronización Git

```
@poznote ¿Cuál es el estado de la sincronización Git?

@poznote Envía mis notas a Git

@poznote Recupera las notas desde Git
```

### Copias de seguridad y ajustes

```
@poznote Lista todas las copias de seguridad

@poznote Crea una copia de seguridad de mis datos

@poznote Restaura la copia de seguridad poznote_backup_2026-02-02_15-30-00.zip

@poznote Elimina la copia de seguridad poznote_backup_2026-02-02_15-30-00.zip

@poznote ¿Cuál es el valor del ajuste "timezone"?

@poznote Pon el ajuste "timezone" en "Europe/Paris"
```

### Trabajar con el contenido

```
@poznote ¿Puedes resumir todas mis notas con la etiqueta "important"?

@poznote Ayúdame a organizar mis notas en carpetas según sus temas

@poznote Crea un informe semanal a partir de mis notas de reuniones
```

## Resolución de problemas

### Problemas de conexión

Si VS Code Copilot no puede conectarse al servidor MCP:

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

4. **Verifica la sintaxis de mcp.json:**
   Asegúrate de que tu JSON es válido (sin comas finales, con las comillas correctas, etc.)

### El servidor MCP no se reconoce

Si VS Code no reconoce el servidor MCP de Poznote:

1. Comprueba que has recargado VS Code después de editar `mcp.json`
2. Verifica que GitHub Copilot está activado y en funcionamiento
3. Revisa el panel de salida de VS Code por si hay mensajes de error:
   - View → Output (Ver → Salida)
   - Selecciona "GitHub Copilot" en la lista desplegable

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

## Herramientas MCP disponibles

El servidor MCP de Poznote ofrece las siguientes herramientas, que VS Code Copilot puede usar:

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
- `add_subtask`: añade una subtarea a una tarea de una nota de lista de tareas
- `update_subtask`: renombra una subtarea, o la marca como hecha o pendiente
- `delete_subtask`: elimina una subtarea de una tarea

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

La mayoría de las herramientas aceptan un parámetro opcional `user_id` para dirigirse a perfiles de usuario concretos. Las excepciones son las herramientas de nivel de sistema `get_system_info`, `list_backups`, `create_backup` y `delete_backup`, que no aceptan `user_id`. Puedes indicarlo en tus peticiones:

```
@poznote Lista las notas del usuario 2
```

## Configuración avanzada

### Varias instancias de Poznote

Si ejecutas varias instancias de Poznote, puedes configurarlas con nombres distintos:

```json
{
  "servers": {
    "poznote-personal": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    },
    "poznote-work": {
      "type": "http",
      "url": "http://127.0.0.1:9045/mcp"
    }
  }
}
```

Después haz referencia a ellas explícitamente:
```
@poznote-work Lista mis notas de trabajo
```

### Configurar un puerto personalizado

Si tu servidor MCP se ejecuta en otro puerto, actualiza la URL en `mcp.json`:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:YOUR_PORT/mcp"
    }
  }
}
```

## Notas de seguridad

⚠️ **Importante:** cualquiera que pueda llegar al endpoint MCP puede gestionar todas las notas. Por defecto solo es accesible desde 127.0.0.1; si lo expones más allá, define `POZNOTE_MCP_AUTH_TOKEN` para que los clientes tengan que presentar un token bearer (consulta [Usar un token de autenticación](#usar-un-token-de-autenticación)).

**Configuración por defecto (segura):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Para el acceso remoto, usa siempre un túnel SSH** como se describe en la sección [Configuración con un servidor remoto](#configuración-con-un-servidor-remoto).

Todos los detalles: [Seguridad del servidor MCP](MCP-SERVER.es.md#seguridad).

## Recursos

- [Documentación principal del servidor MCP](MCP-SERVER.es.md)
- [Documentación oficial de MCP en VS Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Configuración de Claude CLI](CLAUDE-CLI.es.md)
- [Consideraciones de seguridad](MCP-SERVER.es.md#seguridad)

## Soporte

Para problemas o preguntas:
- Consulta la [documentación principal de MCP](MCP-SERVER.es.md)
- Revisa los logs del servidor MCP: `docker compose logs mcp-server`
- Comprueba que la API de Poznote es accesible
- Revisa el panel de salida de VS Code por si hay errores
