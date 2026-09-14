<!-- lang-selector -->
<p align="center">
  <a href="AI-ASSISTANT.md">English</a> ·
  <a href="AI-ASSISTANT.fr.md">Français</a> ·
  <a href="AI-ASSISTANT.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="AI-ASSISTANT.pt.md">Português</a> ·
  <a href="AI-ASSISTANT.ru.md">Русский</a> ·
  <a href="AI-ASSISTANT.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Asistente IA de Poznote

Chat de IA integrado capaz de buscar y leer tus notas. Funciona con una instancia local de [Ollama](https://ollama.com) o [LM Studio](https://lmstudio.ai), con un proveedor en la nube como [Anthropic (Claude)](https://www.anthropic.com) u OpenAI, o con cualquier servidor compatible con OpenAI.

> [!TIP]
> ¿Prefieres conectar un asistente de IA *externo* (VS Code Copilot, Claude CLI...) a tus notas? Consulta la [documentación del servidor MCP](MCP-SERVER.es.md).

## Qué hace

Una vez configurado, aparece un botón **Asistente IA** en la barra de iconos de la izquierda, en la página de notas y en el Panel, y abre ahí mismo el panel de chat. El panel se acopla a la derecha, conserva su estado abierto y su ancho de una página a otra, y la conversación te acompaña entre ambas.

El asistente dispone de herramientas para **buscar y leer tus notas**, y las usa por su cuenta: pregúntale "¿qué dicen mis notas sobre X?", pídele un resumen de varias notas o deja que encuentre esa nota que recuerdas a medias. Las respuestas se transmiten en tiempo real y se muestran en Markdown.

Cuando se lo pides explícitamente, también puede actuar sobre tus notas:

- **escribir**: crear una nota, renombrarla o reescribir su contenido;
- **organizar**: añadir o quitar etiquetas, listar, crear y renombrar carpetas, mover notas entre ellas, marcar notas y carpetas como favoritas;
- **fechas**: poner o quitar un recordatorio en una nota (único o periódico); el asistente conoce la fecha y la hora actuales en tu zona horaria, así que "recuérdamelo el próximo lunes a las 9" funciona;
- **tareas**: añadir, marcar, desmarcar, renombrar o eliminar las tareas de una nota de lista de tareas, incluidas sus fechas de vencimiento y recordatorios, y marcar o desmarcar una casilla dentro de una nota normal, sin reescribir el resto;
- **eliminar**: mover a la papelera una nota, o una carpeta con sus subcarpetas y todas sus notas. Todo se puede restaurar desde la página Papelera: el asistente no tiene forma de eliminar nada definitivamente, ni ninguna herramienta para vaciar la papelera.

La nota que tienes abierta forma parte del contexto: di "mejora el formato de esta nota" o "añade una conclusión aquí" y el asistente trabaja sobre ella, sin necesidad de indicar un id ni un título. Lee la última versión guardada por el editor, y "esta nota" te sigue si abres otra nota durante la conversación. Si nombras otra nota en tu pregunta, esa sigue teniendo prioridad. En el Panel no hay ninguna nota abierta, así que ahí debes nombrar la nota a la que te refieres.

Dos líneas encima del campo de entrada muestran con qué trabaja el asistente: el **espacio de trabajo** en el que se ejecutan todas las herramientas y la **nota** a la que se refiere "esta nota" cuando hay una abierta.

Cuando el asistente edita o crea una nota, la nota abierta y la barra lateral se actualizan solas en cuanto termina la respuesta, sin necesidad de recargar la página. Si tienes cambios sin guardar en la nota que acaba de editar, aparece en su lugar un aviso: recarga la nota, o conserva y guarda tu propia versión.

El asistente lee y escribe el contenido de las notas en Markdown. Las notas de texto enriquecido (HTML) se convierten sobre la marcha en ambos sentidos, con el mismo conversor que la acción **Convertir nota**, de modo que una reescritura conserva títulos, listas, enlaces, tablas e imágenes; el formato enriquecido, como los colores o las fuentes, no se conserva. Una nota demasiado larga para que el asistente la lea completa se rechaza para la reescritura en lugar de truncarse.

Antes de que el asistente modifique el contenido de una nota (reescritura, casilla, tarea), Poznote toma una instantánea de la versión actual, etiquetada "Antes del cambio de la IA" en el menú **Instantáneas** de la nota. Si el resultado no es el que querías, restaura esa instantánea. La instantánea se omite cuando la más reciente ya contiene el mismo contenido, una sola respuesta que modifica la misma nota varias veces solo toma una, y se conservan las 20 más recientes por nota, un número que puedes cambiar en **Configuración → Instantáneas** (de 1 a 200).

El asistente está **limitado al espacio de trabajo actual**: solo ve, busca y edita las notas del espacio de trabajo en el que abriste el chat, y las notas nuevas se crean ahí. Para preguntar sobre otro espacio de trabajo, cambia a él primero. En un Panel que muestra varios espacios de trabajo, el primer clic en el botón indica sobre qué espacio de trabajo actuará el asistente y pregunta si quieres continuar.

La conversación se conserva mientras la pestaña del navegador siga abierta (sobrevive a las recargas de página) y puede borrarse en cualquier momento con el botón de papelera de la cabecera del panel.

## Activar el asistente

Ve a **Configuración → Herramientas de administración → Asistente IA** (solo administradores) y elige un proveedor:

| Proveedor | URL | Clave API |
|---|---|---|
| **Ollama** (local) | Depende de dónde se ejecute Ollama (contenedor o host), consulta [Servidores locales y redes de Docker](#servidores-locales-y-redes-de-docker) | No necesaria |
| **LM Studio** (local) | Rellenada previamente con la dirección de tu host Docker, puerto `1234`, consulta la [Opción 2](#opción-2-ollama-instalado-en-el-host) | No necesaria |
| **Anthropic** (nube) | Se define automáticamente | Obligatoria |
| **OpenAI** (nube) | Se define automáticamente | Obligatoria |
| **Otro (URL personalizada)** | Cualquier URL base compatible con OpenAI | Depende del servidor |

Después usa **Comprobar el acceso y listar los modelos**, que verifica que el servidor es accesible y rellena la lista desplegable **Modelo** con los modelos que ofrece. La lista permanece vacía hasta que esa comprobación tiene éxito, así que este es el paso que te permite elegir un modelo.

La configuración se aplica a toda la instancia: una vez activada por el administrador, todos los perfiles de usuario tienen el chat.

### Claves de API personales

La misma página ofrece la opción **Permitir claves API personales**. Cuando está activada, cada usuario tiene una tarjeta **Mi asistente de IA** en su propia configuración, para dirigir el chat a su propio servidor, proveedor y clave de API en lugar de los configurados para la instancia.

## Elegir un modelo

Elige un modelo compatible con **llamadas a herramientas** (también llamadas "function calling"), por ejemplo `qwen3`, `llama3.1` o `mistral`. Las llamadas a herramientas son lo que permite al asistente recorrer tus notas: con un modelo que no las admite, el chat sigue funcionando (un aviso te lo indica) pero no puede acceder a tus notas por su cuenta.

### Esfuerzo de razonamiento

Los modelos de razonamiento (OpenAI GPT-5 y la serie o, `gpt-oss` en Ollama, ...) aceptan un **esfuerzo de razonamiento** que define cuánto tiempo piensa el modelo antes de responder. Lo controla el campo **Esfuerzo de razonamiento** de la página de configuración: **Auto** (el valor por defecto) no envía nada y deja la elección al proveedor, mientras que **Ninguno**, **Mínimo**, **Bajo**, **Medio**, **Alto** y **Muy alto** se envían como parámetro `reasoning_effort` en cada petición. Los valores que un modelo no acepta los rechaza el proveedor y se muestran como error en el chat.

Algunos modelos de OpenAI rechazan las llamadas a herramientas en la API de chat completions salvo que el esfuerzo de razonamiento sea `none`. El chat muestra entonces un aviso indicando que el asistente no puede consultar tus notas: pon **Esfuerzo de razonamiento** en **Ninguno** para recuperar las herramientas.

## Servidores locales y redes de Docker

El servidor de IA se llama **desde el servidor de Poznote**, nunca desde tu navegador. Como Poznote se ejecuta en un contenedor Docker, la URL que configures debe ser accesible *desde dentro de ese contenedor*.

Para un Ollama local hay **dos configuraciones posibles**, ambas totalmente compatibles:

| Configuración | URL que configurar | Configuración de red |
|---|---|---|
| [**Opción 1**: Ollama como contenedor Docker](#opción-1-ollama-como-contenedor-docker-la-más-sencilla) | `http://ollama:11434` | Ninguna |
| [**Opción 2**: Ollama instalado en el host](#opción-2-ollama-instalado-en-el-host) | La dirección de tu host, vista desde el contenedor | Obligatoria, es la parte en la que más gente se atasca |

Elige la opción 1 si empiezas desde cero. Elige la opción 2 si Ollama ya está instalado en tu máquina o también lo usan otras aplicaciones.

### Opción 1: Ollama como contenedor Docker (la más sencilla)

Con diferencia, la configuración más sencilla es no implicar al host en absoluto: añade Ollama como otro servicio en el mismo `docker-compose.yml` que Poznote:

```yaml
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: always
    volumes:
      - "./ollama:/root/.ollama"
```

luego inícialo y descarga un modelo:

```bash
docker compose up -d
docker exec ollama ollama pull qwen3
```

En la configuración del Asistente IA, sustituye la URL rellenada previamente por `http://ollama:11434`. Los servicios de un mismo archivo compose comparten una red Docker y se comunican entre sí por el nombre del servicio, así que no hay nada más que configurar: ningún puerto que publicar, ningún `OLLAMA_HOST` que definir, y Ollama nunca queda expuesto fuera de la red Docker. Si tu archivo compose define `networks` personalizadas, pon `ollama` en la misma red que el servicio de Poznote.

Para la aceleración por GPU dentro del contenedor, consulta la [documentación de la imagen Docker de Ollama](https://hub.docker.com/r/ollama/ollama).

### Opción 2: Ollama instalado en el host

Si Ollama se ejecuta directamente en la máquina host (instalación estándar desde [ollama.com](https://ollama.com)), o si usas LM Studio, Poznote también puede acceder a él, pero el contenedor tiene que encontrar el camino de vuelta al host a través de las redes de Docker. Los apartados siguientes explican cómo.

#### Por qué `localhost` no funciona

`http://localhost:11434` o `http://127.0.0.1:11434` **no** funcionarán: dentro del contenedor, `localhost` es el propio contenedor, no la máquina que ejecuta Ollama. Docker da a cada contenedor su propia pila de red aislada: la misma máquina física, dos "localhost" distintos.

Para llegar al host, el contenedor debe pasar por la **puerta de enlace** de su red Docker, que es una dirección IP que pertenece al host.

#### Encontrar la URL correcta

Poznote rellena previamente el campo URL con su mejor estimación de la dirección de tu host Docker, en este orden:

1. `host.docker.internal` si se resuelve dentro del contenedor (siempre en Docker Desktop para Windows/macOS; en Linux solo si lo asignas, ver más abajo);
2. si no, la IP de la puerta de enlace predeterminada del contenedor (por ejemplo `http://172.17.0.1:11434`), leída de su tabla de rutas.

La URL rellenada previamente suele funcionar sin más. Si necesitas comprobarla tú mismo, desde el host:

```bash
docker exec <poznote-webserver-container> ip route | grep default
# default via 172.17.0.1 dev eth0   ← la IP de la puerta de enlace es tu host, visto desde el contenedor
```

En Linux puedes hacer que `host.docker.internal` esté disponible (como en Docker Desktop) añadiendo esto al servicio `webserver` de tu `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

y después `docker compose up -d`. La URL pasa a ser `http://host.docker.internal:11434`, estable e idéntica en todas las máquinas.

#### Hacer que Ollama escuche para el contenedor

Por defecto, Ollama solo escucha en `127.0.0.1`, la interfaz loopback del host, que es inaccesible desde cualquier contenedor incluso con la IP de puerta de enlace correcta. Debes definir `OLLAMA_HOST` para que escuche en una interfaz a la que el contenedor pueda llegar.

Con la instalación estándar en Linux (systemd):

```bash
sudo systemctl edit ollama
```

añade:

```ini
[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
```

y después:

```bash
sudo systemctl restart ollama
```

Qué dirección usar:

- **`172.17.0.1` (el bridge `docker0`, recomendado en Linux)**: accesible desde todos los contenedores, existe en todas las instalaciones de Docker y no está expuesta al exterior. Comprueba la IP de tu `docker0` con `ip addr show docker0` (es `172.17.0.1` salvo que hayas personalizado los pools de direcciones de Docker).
- **`0.0.0.0`** (todas las interfaces): la más sencilla, pero expone Ollama en **todas** las interfaces de la máquina. Ollama no tiene autenticación, así que si tu máquina tiene una IP pública, úsala solo detrás de un cortafuegos que bloquee el puerto (por ejemplo `ufw deny 11434`). Sin problema en una máquina doméstica detrás de NAT.
- La puerta de enlace de una red Compose concreta (por ejemplo `192.168.48.1`): funciona, pero Docker asigna automáticamente estas subredes al crear la red y pueden cambiar si la red se vuelve a crear, así que evítala.

En Docker Desktop (Windows/macOS) con Ollama ejecutándose en el host, `OLLAMA_HOST=0.0.0.0` es la opción habitual; la máquina no suele estar expuesta directamente, y `host.docker.internal` llega entonces a ella sin configuración adicional.

**LM Studio** funciona igual: en la configuración de su servidor, activa "Serve on Local Network" (equivale a escuchar en `0.0.0.0`), o solo escuchará en `127.0.0.1`.

#### Comprobar la conectividad

Desde el host, comprueba en qué escucha realmente Ollama:

```bash
ss -tlnp | grep 11434
```

y prueba la URL exacta que usará Poznote, desde dentro del contenedor:

```bash
docker exec <poznote-webserver-container> curl -s -m 3 http://172.17.0.1:11434/
# "Ollama is running"
```

Si esto no devuelve nada, el problema está en la dirección en la que escucha Ollama o en un cortafuegos, no en Poznote. El botón **Comprobar el acceso y listar los modelos** de la página de configuración realiza la misma comprobación y rellena la lista de modelos si tiene éxito.

## Errores de conexión

Una petición que falla antes de que el servidor de IA haya respondido nada (un tiempo de espera de DNS agotado, una conexión rechazada, una negociación TLS que nunca termina) se envía de nuevo automáticamente, hasta tres intentos seguidos con una breve pausa entre ellos. Mientras tanto el chat muestra una línea *reintentando*, y no se pierde nada porque el servidor no había empezado a responder. Si el último intento también falla, el error aparece en el chat con un botón **Reintentar** que envía el mismo mensaje otra vez sin tener que volver a escribirlo.

Un error que ocurre una vez que la respuesta ha empezado a llegar no se reintenta, ya que parte de la respuesta está ya en pantalla: usa el botón **Reintentar**.

## Privacidad

El servidor de IA se llama desde el servidor de Poznote, nunca desde tu navegador. Con una instancia local de Ollama o LM Studio, tus notas y conversaciones nunca salen de tu máquina. Con un proveedor en la nube, las partes de tus notas que el asistente lee para responder se envían a ese proveedor.
