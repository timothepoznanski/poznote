<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Transcripción en Poznote (voz a texto)

Dicta en una nota, o convierte un adjunto de audio en texto, con un servidor de voz a texto que ejecutas tú mismo.

Poznote no incluye ningún modelo de voz. Envía el audio a un servidor que expone la API de audio de OpenAI, `POST /v1/audio/transcriptions`, como un Whisper autoalojado. Ejecuta ese servidor junto a Poznote y el audio nunca saldrá de tu máquina.

> [!TIP]
> Esta función es independiente del [Asistente IA](AI-ASSISTANT.es.md). Ambos se configuran por separado y pueden usar servidores distintos, o puedes activar uno sin el otro.

- [Inicio rápido](#inicio-rápido)
- [Qué hace](#qué-hace)
- [Configuración](#configuración)
- [Ejecutar un servidor de transcripción](#ejecutar-un-servidor-de-transcripción)
- [Acceder al servidor desde Poznote](#acceder-al-servidor-desde-poznote)
- [Límites](#límites)
- [Requisitos del navegador](#requisitos-del-navegador)
- [Servidores personales](#servidores-personales)
- [Privacidad y datos almacenados](#privacidad-y-datos-almacenados)
- [Solución de problemas](#solución-de-problemas)
- [Desinstalación](#desinstalación)

## Inicio rápido

El camino más corto, con [Speaches](https://github.com/speaches-ai/speaches) ejecutándose en el mismo proyecto de Docker Compose que Poznote. Todos los comandos de abajo se ejecutaron tal como están escritos.

**1. Añade el servidor a tu `docker-compose.yml`**, como un servicio nuevo junto a `webserver`, y declara su volumen al final del archivo:

```yaml
services:
  # ... webserver y mcp-server se quedan como están ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

No hay sección `ports:` a propósito: Poznote accede al servidor a través de la red interna del proyecto y no se expone nada al exterior. Consulta [por qué es importante](#acceder-al-servidor-desde-poznote).

**2. Inícialo:**

```bash
docker compose up -d speaches
```

La imagen ocupa unos 2 GB.

**3. Descarga un modelo.** Speaches arranca sin ningún modelo y no descarga ninguno por su cuenta: una transcripción que pide un modelo que no ha descargado falla con `Model '...' is not installed locally`. Descarga uno a través del contenedor de Poznote, que está en la misma red:

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Al cabo de unos segundos responde `Model 'Systran/faster-whisper-small' downloaded` (unos 480 MB). El modelo se conserva en el volumen `speaches-cache` entre reinicios.

**4. Configura Poznote.** Ve a **Configuración → Herramientas de administración → Transcripción** y:

- activa **Activar la transcripción**;
- elige **Speaches (local)** e indica la URL `http://speaches:8000`;
- haz clic en **Comprobar el acceso y listar los modelos** y luego elige `Systran/faster-whisper-small` en **Modelo**;
- marca los usuarios autorizados a usarla, tú incluido;
- guarda.

**5. Pruébalo.** Recarga una nota por HTTPS (o a través de `localhost`, consulta los [requisitos del navegador](#requisitos-del-navegador)), escribe `/dict`, permite el acceso al micrófono, habla y detén la grabación.

## Qué hace

Una vez configurada, la transcripción aparece en dos lugares.

### Dictar

El dictado pasa por **Grabar audio**, en **Insertar** y **Multimedia** dentro del menú de comandos de cada nota, tanto de texto enriquecido como Markdown, y en la barra de edición situada sobre el teclado en un teléfono. Al escribir `/dict`, `/voice` o `/transcribe` aparece directamente, ya que el filtro también busca en los submenús.

Se abre un cuadro de diálogo, y la grabación empieza cuando pulsas **Iniciar**, que es también cuando el navegador pide el micrófono la primera vez. Una barra de nivel muestra que el micrófono realmente capta sonido, y el temporizador indica el tiempo transcurrido frente a la duración máxima fijada por el administrador, por ejemplo `1:12 / 10:00`.

Cuando la transcripción está disponible, bajo el temporizador aparece un menú **Idioma hablado**. Empieza en el idioma definido en la configuración, marcado como predeterminado, y cambiarlo solo afecta a esta grabación. **Detectar automáticamente** deja que el servidor reconozca el idioma aunque la configuración fije uno.

Lo que se hace con la grabación se elige al detenerla. **Insertar el audio** la coloca en la nota como un reproductor de audio, sin transcripción. **Transcribir** la envía al servidor, y solo aparece cuando la transcripción está disponible para ti. Cuando la grabación alcanza la duración máxima, se detiene sola y espera a que pulses uno de los dos botones.

La transcripción vuelve en un cuadro de texto donde puedes corregirla antes de que pase a la nota. **Insertar** la coloca donde estaba tu cursor. Si la transcripción falla, los dos botones vuelven a aparecer, de modo que la grabación aún puede insertarse como audio o enviarse de nuevo.

La casilla **Adjuntar también la grabación a esta nota** está desmarcada por defecto, y en ese caso el audio se descarta en cuanto llega el texto. Si la marcas, la grabación también se guarda como un adjunto normal llamado `dictation-<date>.<ext>`, para que puedas volver a escucharla o transcribirla más adelante con un modelo mejor.

**Cancelar**, la tecla Escape o un clic fuera del cuadro de diálogo detienen el micrófono y descartan la grabación, incluso a mitad.

### Transcribir un adjunto de audio

En la página **Adjuntos** de una nota, cada archivo de audio tiene un botón gris con un micrófono, entre los de descargar y eliminar. Es el que necesitas para una nota de voz grabada con el teléfono y subida a Poznote.

Te devuelve a la nota y abre el mismo cuadro de diálogo: el archivo se transcribe desde el almacenamiento, sin volver a subirlo, y el texto se te ofrece para revisarlo. **Insertar** lo coloca justo después del adjunto cuando la nota hace referencia a él, y al final de la nota en caso contrario.

Un archivo se considera audio cuando su nombre termina en `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac` o `aac`, o cuando su tipo registrado es `audio/...`. La extensión prevalece sobre el tipo a propósito: Windows sube un `.m4a` de la Grabadora de voz como `video/mp4`. Los archivos de video (`mp4`, `webm`) no ofrecen esta opción, aunque contengan sonido.

Si la nota está abierta y se está editando en otro lugar, el texto no se inserta: se queda en el cuadro para que puedas copiarlo.

## Configuración

Todo se encuentra en **Configuración → Herramientas de administración → Transcripción** (solo administradores).

| Ajuste | Qué hace |
|---|---|
| **Activar la transcripción** | Interruptor general de la configuración de la instancia que se describe abajo. |
| **Usuarios autorizados** | Perfiles que pueden usar el servidor de la instancia. Nadie tiene acceso hasta que se marca, incluidos los perfiles nuevos. |
| **Servidor de transcripción** | Preajustes que rellenan la URL y muestran u ocultan la clave API: Speaches, whisper.cpp, LocalAI, OpenAI u Otro. |
| **URL del servidor** | URL base del servidor, por ejemplo `http://speaches:8000`. También se aceptan `/v1` y la ruta completa `/v1/audio/transcriptions`. |
| **Clave API** | Se envía como `Authorization: Bearer`. Los servidores locales no suelen necesitarla; OpenAI sí. |
| **Comprobar el acceso y listar los modelos** | Confirma que el servidor responde y rellena las sugerencias de modelos. |
| **Modelo** | El nombre del modelo que se envía con cada petición. Obligatorio para todos los servidores, incluso para los que lo ignoran. |
| **Idioma hablado** | Código de dos letras como `en`, `fr` o `de`, o vacío para que el servidor lo detecte. La ventana de grabación lo preselecciona, y su menú permite cambiarlo para una grabación. |
| **Duración máxima de grabación** | En minutos, de 1 a 60, 10 por defecto. Al llegar a ese límite, **Grabar audio** se detiene solo y espera a que elijas **Insertar el audio** o **Transcribir**. Sin transcripción, inserta el audio directamente. No afecta a los adjuntos. |
| **Permitir servidores de transcripción personales** | Permite que cada usuario configure su propio servidor, consulta [Servidores personales](#servidores-personales). |

### Elegir un modelo

El campo del modelo es de texto libre con sugerencias, en lugar de una lista desplegable, porque no todos los servidores listan sus modelos (whisper.cpp no lo hace). En Speaches, la comprobación solo lista los modelos de reconocimiento de voz y deja fuera las voces de síntesis que hayas podido descargar.

Los modelos más grandes son más precisos y más lentos. En CPU, `small` es el término medio habitual. La diferencia no es sutil: con la misma frase en francés, `Systran/faster-whisper-tiny` devolvió «ceci est en test de dicter vocale d'opposnade», mientras que `Systran/faster-whisper-small` devolvió «ceci est un test de dictée vocale». Los modelos más grandes, como `large-v3`, gestionan aún mejor los acentos y el ruido, pero necesitan una GPU para funcionar con soltura.

Como referencia, en una CPU de 4 núcleos con `small`: una frase corta tarda unos 6 segundos, y la primera petición después de arrancar el servidor tarda unos 20, mientras el modelo se carga en memoria. Speaches usa aproximadamente 1,5 GB de RAM con `small` cargado.

### Idioma hablado

Si dejas **Idioma hablado** vacío, el servidor detecta el idioma, algo que Whisper hace bien. Indica un código cuando dictes siempre en el mismo idioma y las frases cortas se confundan con otro.

## Ejecutar un servidor de transcripción

Poznote necesita un servidor que acepte `POST /v1/audio/transcriptions` como datos de formulario multipart con los campos `file`, `model`, `response_format=json` y, opcionalmente, `language`, y que responda `{"text": "..."}`.

### Speaches (recomendado)

La opción más completa: lista sus modelos, puede tener varios y lee WebM (lo que graban Chrome y Firefox), M4A y WAV sin configuración adicional. El [Inicio rápido](#inicio-rápido) lo instala con Docker Compose.

Gestión de modelos, desde el contenedor de Poznote:

```bash
# Ver lo que se puede descargar
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# Descargar, listar, eliminar
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Para descargar se necesita acceso a internet desde el contenedor de Speaches. Para transcribir, no.

Con una GPU NVIDIA, usa la imagen CUDA en lugar de `latest-cpu` y da al servicio acceso a la GPU; consulta la [documentación de Speaches](https://speaches.ai).

### whisper.cpp

Más ligero que Speaches, con un solo modelo por servidor y sin listado de modelos. Funciona bien con Poznote, pero solo con los parámetros adecuados: con sus valores por defecto no expone la ruta de OpenAI, no entiende otro idioma que el inglés ni acepta otro formato que WAV.

**1. Añade el servicio** a `docker-compose.yml`:

```yaml
services:
  whisper:
    image: ghcr.io/ggml-org/whisper.cpp:main
    restart: always
    volumes:
      - "whisper-models:/models"
    command: ["/app/build/bin/whisper-server -m /models/ggml-small.bin -l auto --convert --host 0.0.0.0 --port 8080 --inference-path /v1/audio/transcriptions"]

volumes:
  whisper-models:
```

> [!WARNING]
> Mantén `command` como una lista de un solo elemento, exactamente como arriba. La imagen ejecuta su comando mediante `bash -c`, y la forma de cadena simple se divide en argumentos separados, de modo que `bash` ejecuta `whisper-server` sin ningún parámetro. El servidor arranca entonces en silencio con sus valores por defecto: solo inglés, solo WAV, escuchando en `127.0.0.1` dentro de su contenedor, en `/inference`. Nada en los registros indica que algo haya ido mal.

**2. Descarga un modelo multilingüe** en el volumen antes de iniciar el servicio: el servidor se niega a arrancar sin su archivo de modelo, y la imagen solo incluye `ggml-base.en.bin`, que entiende inglés y nada más.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. Inícialo:**

```bash
docker compose up -d whisper
```

Para qué sirve cada parámetro:

| Parámetro | Valor por defecto | Por qué lo necesita Poznote |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | El modelo incluido solo entiende inglés. |
| `-l auto` | `en` | Sin él, la voz en cualquier otro idioma vuelve deformada en inglés. |
| `--convert` | desactivado | Los navegadores graban en WebM y los teléfonos producen M4A; sin él solo se acepta WAV. Usa el ffmpeg incluido en la imagen. |
| `--host 0.0.0.0` | `127.0.0.1` | Si no, nada fuera del contenedor puede acceder a él. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | La ruta a la que llama Poznote. |

**4. En Poznote**, elige **whisper.cpp (local)**, indica la URL `http://whisper:8080` y escribe cualquier nombre de modelo: whisper.cpp lo ignora y usa el archivo con el que se inició, pero el campo es obligatorio. **Comprobar el acceso y listar los modelos** indica entonces que el servidor no lista ningún modelo, que es la respuesta esperada de un whisper.cpp que funciona.

### OpenAI

Elige **OpenAI**: la URL se rellena automáticamente y se requiere una clave API. Usa uno de los modelos de transcripción de OpenAI, por ejemplo `whisper-1`. El audio se envía a OpenAI.

### LocalAI y otros servidores

LocalAI y otros servidores compatibles con OpenAI funcionan con los preajustes **LocalAI** u **Otro**, siempre que respeten el formato de petición descrito al principio de esta sección. Su instalación no se detalla aquí; consulta su propia documentación, por ejemplo [la de LocalAI](https://localai.io).

## Acceder al servidor desde Poznote

Poznote llama al servidor de transcripción desde su propio contenedor, nunca desde tu navegador. Por lo tanto, la URL debe ser accesible desde dentro del contenedor de Poznote, y allí `localhost` significa el propio contenedor de Poznote.

**Recomendado: la misma red de Docker, sin puerto publicado.** Los servicios de un mismo proyecto de Compose comparten una red y se comunican entre sí por el nombre del servicio. Así es como el servicio `mcp-server` del `docker-compose.yml` estándar accede a `http://webserver:80`, y como Poznote accede a `http://speaches:8000` o `http://whisper:8080` en los ejemplos anteriores.

> [!CAUTION]
> No añadas `ports: - "8000:8000"` al servidor de transcripción en una máquina con IP pública. Speaches y whisper.cpp no tienen autenticación por defecto, así que publicarías un servicio de transcripción gratuito para todo internet. Vincularlo a `127.0.0.1:8000:8000` es seguro, pero entonces el contenedor de Poznote no puede acceder a él; la red compartida no necesita ni lo uno ni lo otro.

Si el servidor se ejecuta como un contenedor independiente con `docker run`, conéctalo a la red de Poznote en lugar de publicar un puerto. Obtén el nombre de la red con:

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

y luego inicia el servidor con `--network <that-network>` y usa el nombre de su contenedor en la URL.

Para un servidor en otra máquina, o en el host de Docker fuera de Docker, usa una dirección a la que pueda llegar el contenedor de Poznote. Se aplican las mismas reglas que para el asistente IA, consulta [Servidores locales y redes de Docker](AI-ASSISTANT.es.md#servidores-locales-y-redes-de-docker).

Para comprobar que el servidor responde desde la posición de Poznote:

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## Límites

- **Duración de la grabación:** el ajuste **Duración máxima de grabación**, 10 minutos por defecto. Se aplica en el navegador.
- **Tamaño de subida:** 100 MB por grabación o adjunto enviado a transcribir.
- **Tiempo de transcripción:** Poznote espera al servidor hasta 570 segundos, justo por debajo de los 600 segundos que su propio nginx permite por petición, para que una transcripción lenta termine con un mensaje legible en lugar de una página de error sin más.
- **Tiempo de espera del proxy inverso:** un proxy delante de Poznote puede cortar la petición mucho antes. nginx usa 60 segundos por defecto, y Nginx Proxy Manager 90. Una transcripción que tarde más falla entonces con `HTTP 504`, aunque se habría completado. Aumenta el tiempo de lectura del proxy para tu host de Poznote (en nginx y en la pestaña **Advanced** de Nginx Proxy Manager: `proxy_read_timeout 600s;`), o mantén las grabaciones lo bastante cortas como para transcribirse dentro de ese margen.

## Requisitos del navegador

**HTTPS.** Los navegadores solo dan acceso al micrófono a una página con origen seguro: HTTPS o `localhost`. Por `http` simple en cualquier otra dirección, **Grabar audio** indica que necesita HTTPS y no graba nada. Transcribir un adjunto no se ve afectado, ya que no se graba nada.

**La cabecera `Permissions-Policy`.** Poznote envía `microphone=(self)`, que permite su propio origen y rechaza todos los demás. Si un proxy inverso situado delante añade su propia cabecera `Permissions-Policy`, puede sustituir la de Poznote, y un `microphone=()` en ella hace que el navegador rechace el micrófono diga lo que diga el permiso del sitio. El cuadro de diálogo muestra entonces «No se permitió a Poznote usar el micrófono». Elimina la cabecera en el proxy, o establece también allí `microphone=(self)`.

## Servidores personales

El administrador puede marcar **Permitir servidores de transcripción personales**. Cada usuario obtiene entonces una tarjeta **Mi servidor de transcripción** en su propia configuración, con los mismos campos de servidor, URL, clave, modelo e idioma. Cuando un usuario la activa, su audio va a su servidor en lugar de al de la instancia, esté o no en la lista de usuarios autorizados.

La duración máxima de grabación sigue siendo la que fija el administrador.

Las claves API personales se cifran en reposo con el secreto de la instancia, igual que las claves del asistente IA y de Git Sync.

## Privacidad y datos almacenados

La grabación se sube a Poznote y desde allí se reenvía al servidor de transcripción. Es algo deliberado: el servidor de transcripción suele estar en una red a la que el navegador no puede acceder, y su clave API no tiene por qué llegar a una página web.

Poznote no guarda ninguna copia. El audio vive en el archivo temporal de subida de PHP durante una sola petición, salvo que marques **Adjuntar también la grabación a esta nota**, que lo guarda como un adjunto normal que cuenta para tu almacenamiento.

Con Speaches o whisper.cpp configurado como se describe arriba, todo se procesa en tu máquina y nada sale a internet:

- El navegador graba con MediaRecorder, no con el reconocimiento de voz integrado del navegador, que enviaría el audio a Google o Apple.
- La grabación va solo a tu servidor Poznote, y Poznote la reenvía solo a la URL configurada en la página Transcripción. No se contacta con ningún otro servidor.
- El único acceso a internet es la descarga del modelo, una vez, durante la instalación. La transcripción funciona con el contenedor desconectado de internet.
- El texto transcrito llega a tu nota como texto escrito a mano, y a ningún otro sitio.

> [!WARNING]
> El preajuste **OpenAI** es la excepción: cada grabación se envía a los servidores de OpenAI. Es el único preajuste que lo hace, y el único cuya URL es fija y está oculta. Si la página Transcripción muestra un campo URL, el audio se queda en el servidor de esa URL.

## Solución de problemas

**«No se permitió a Poznote usar el micrófono», pero el navegador dice que está permitido**
Algo lo está rechazando antes de que se consulte el permiso. Comprueba la cabecera que llega al navegador:

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

Debe indicar `microphone=(self)`. Consulta [Requisitos del navegador](#requisitos-del-navegador).

**«El micrófono necesita HTTPS»**
Estás usando `http` simple en una dirección distinta de `localhost`. Sirve Poznote por HTTPS.

**No aparece el botón Transcribir al grabar**
La transcripción está desactivada, tu perfil no está en la lista de usuarios autorizados o la configuración no tiene URL o modelo. **Grabar audio** en sí siempre está disponible, en **Insertar** y **Multimedia**; `/dict` lo encuentra.

**No hay botón de micrófono en un adjunto**
El archivo no se reconoce como audio (consulta la lista en [Transcribir un adjunto de audio](#transcribir-un-adjunto-de-audio)), o la transcripción no está disponible para tu perfil.

**«Failed to connect to ...»**
La URL es incorrecta, el servidor no se está ejecutando o no está en una red a la que Poznote pueda acceder. Consulta [Acceder al servidor desde Poznote](#acceder-al-servidor-desde-poznote).

**«HTTP 404: Model '...' is not installed locally»**
Speaches no ha descargado ese modelo. Descárgalo, consulta el paso 3 del [Inicio rápido](#inicio-rápido).

**«HTTP 404» al comprobar el acceso, con whisper.cpp**
Elige el preajuste **whisper.cpp** en lugar de **Otro**: whisper.cpp no lista modelos, y solo su preajuste interpreta ese 404 como un servidor que funciona. Si las propias transcripciones devuelven 404, el servidor se está ejecutando sin `--inference-path /v1/audio/transcriptions`, lo que suele significar que `command` se escribió como cadena, consulta la advertencia en [whisper.cpp](#whispercpp).

**La voz en francés (o en cualquier idioma que no sea inglés) vuelve en inglés, o sin sentido**
whisper.cpp se está ejecutando sin `-l auto`, o con el modelo incluido `ggml-base.en.bin`. Usa un modelo multilingüe y `-l auto`.

**Las grabaciones fallan pero los archivos WAV funcionan, con whisper.cpp**
Falta `--convert`.

**«HTTP 504» en grabaciones largas**
Un proxy inverso cortó la petición antes de que terminara la transcripción. Consulta el tiempo de espera del proxy inverso en [Límites](#límites).

**«El servidor de transcripción no respondió en 570 segundos»**
La grabación es demasiado larga para este modelo en este hardware. Graba fragmentos más cortos, reduce la **Duración máxima de grabación** o usa un modelo más pequeño o una GPU.

**«El servidor no oyó nada en esta grabación»**
Whisper devolvió un texto vacío, su respuesta honesta ante el silencio. Observa la barra de nivel mientras grabas: si nunca se mueve, el navegador está usando el dispositivo de entrada equivocado.

**«Esta nota no se puede editar desde aquí en este momento»**
La nota se está editando en otro lugar, así que el texto no se insertó. Cópialo del cuadro, o cierra el otro editor y vuelve a intentarlo.

**La primera transcripción es lenta y las siguientes son rápidas**
El servidor carga el modelo en memoria la primera vez que se usa, unos 20 segundos para `small` en CPU.

## Desinstalación

Desactiva **Activar la transcripción** en la configuración, luego elimina el servicio de `docker-compose.yml` y ejecuta:

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` muestra el nombre exacto del volumen, precedido del nombre de tu proyecto.
