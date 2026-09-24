<!-- lang-selector -->
<p align="center">
  <b>English</b> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote Transcription (speech to text)

Dictate into a note, or turn an audio attachment into text, using a speech-to-text server you run yourself.

Poznote embeds no speech model. It sends the audio to a server exposing the OpenAI audio API, `POST /v1/audio/transcriptions`, such as a self-hosted Whisper. Run that server next to Poznote and the audio never leaves your machine.

> [!TIP]
> This is separate from the [AI Assistant](AI-ASSISTANT.md). The two are configured independently and can use different servers, or you can enable one without the other.

- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Settings](#settings)
- [Running a transcription server](#running-a-transcription-server)
- [Reaching the server from Poznote](#reaching-the-server-from-poznote)
- [Limits](#limits)
- [Browser requirements](#browser-requirements)
- [Personal servers](#personal-servers)
- [Privacy and what is stored](#privacy-and-what-is-stored)
- [Troubleshooting](#troubleshooting)
- [Removing it](#removing-it)

## Quick start

The shortest path, with [Speaches](https://github.com/speaches-ai/speaches) running in the same Docker Compose project as Poznote. Every command below was run as written.

**1. Add the server to your `docker-compose.yml`**, as a new service next to `webserver`, and declare its volume at the bottom of the file:

```yaml
services:
  # ... webserver and mcp-server stay as they are ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

There is no `ports:` section on purpose: Poznote reaches the server over the project's internal network, and nothing is exposed to the outside. See [why this matters](#reaching-the-server-from-poznote).

**2. Start it:**

```bash
docker compose up -d speaches
```

The image is about 2 GB.

**3. Download a model.** Speaches starts with no model at all and does not fetch one on its own: a transcription asked of a model it has not downloaded fails with `Model '...' is not installed locally`. Download one through the Poznote container, which is on the same network:

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

It answers `Model 'Systran/faster-whisper-small' downloaded` after a few seconds (about 480 MB). The model stays in the `speaches-cache` volume across restarts.

**4. Configure Poznote.** Go to **Settings → Admin Tools → Transcription** and:

- turn on **Enable transcription**;
- pick **Speaches (local)** and set the URL to `http://speaches:8000`;
- click **Check access and list models**, then pick `Systran/faster-whisper-small` in **Model**;
- tick the users allowed to use it, yourself included;
- save.

**5. Try it.** Reload a note over HTTPS (or through `localhost`, see [browser requirements](#browser-requirements)), type `/dict`, allow the microphone, speak, and stop.

## What it does

Once configured, transcription appears in two places.

### Dictate

Dictation goes through **Record audio**, under **Insert** and **Media** in the slash menu of every note, rich text and Markdown alike, and on the editing bar above the keyboard on a phone. Typing `/dict`, `/voice` or `/transcribe` finds it directly, since the filter searches submenus.

A dialog opens, and recording starts when you press **Start**, which is also when the browser asks for the microphone the first time. A level bar shows the microphone is actually picking something up, and the timer shows the elapsed time against the maximum length set by the administrator, for example `1:12 / 10:00`.

With transcription available, a **Spoken language** menu sits under the timer. It starts on the language set in the configuration, marked as the default, and changing it only applies to this recording. **Detect automatically** lets the server work out the language even when the configuration sets one.

What happens to the recording is chosen when you stop it. **Insert the audio** puts it in the note as an audio player, with no transcription. **Transcribe** sends it to the server, and only shows when transcription is available to you. When the recording reaches the maximum length it stops on its own and waits for one of the two buttons.

The transcript comes back in a text box where you can correct it before it goes into the note. **Insert** puts it where your cursor was. If the transcription fails, both buttons come back, so the recording can still go in as audio or be sent again.

The **Also attach the recording to this note** checkbox is unticked by default, and the audio is then discarded once the text comes back. Tick it and the recording is also saved as an ordinary attachment named `dictation-<date>.<ext>`, so you can listen to it again or transcribe it later with a better model.

**Cancel**, Escape or a click outside the dialog stops the microphone and drops the recording, even halfway through.

### Transcribe an audio attachment

On a note's **Attachments** page, every audio file gets a grey microphone button, between download and delete. This is the one for a voice memo recorded on your phone and uploaded to Poznote.

It takes you back to the note and opens the same dialog: the file is transcribed from storage, without being uploaded again, and the text is offered for review. **Insert** puts it right after the attachment when the note references it, and at the end of the note otherwise.

A file counts as audio when its name ends in `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac` or `aac`, or when its recorded type is `audio/...`. The extension wins over the type on purpose: Windows uploads a Voice Recorder `.m4a` as `video/mp4`. Video files (`mp4`, `webm`) are not offered, even though they contain sound.

If the note is open and being edited somewhere else, the text is not inserted: it stays in the box so you can copy it.

## Settings

Everything is on **Settings → Admin Tools → Transcription** (administrator only).

| Setting | What it does |
|---|---|
| **Enable transcription** | Master switch for the instance configuration below. |
| **Users allowed** | Profiles that may use the instance server. Nobody has access until ticked, new profiles included. |
| **Transcription server** | Presets that fill the URL and show or hide the API key: Speaches, whisper.cpp, LocalAI, OpenAI, or Other. |
| **Server URL** | Base URL of the server, for example `http://speaches:8000`. `/v1` and the full `/v1/audio/transcriptions` path are accepted too. |
| **API key** | Sent as `Authorization: Bearer`. Local servers usually need none; OpenAI does. |
| **Check access and list models** | Confirms the server answers and fills the model suggestions. |
| **Model** | The model name sent with each request. Required for every server, even the ones that ignore it. |
| **Spoken language** | Two-letter code such as `en`, `fr` or `de`, or empty to let the server detect it. The recording dialog preselects it, and its menu can override it for one recording. |
| **Maximum recording length** | In minutes, from 1 to 60, 10 by default. **Record audio** stops on its own when it gets there, and then waits for **Insert the audio** or **Transcribe**. Without transcription, it inserts the audio right away. Attachments are not affected. |
| **Allow personal transcription servers** | Lets every user set their own server, see [Personal servers](#personal-servers). |

### Choosing a model

The model field is free text with suggestions rather than a dropdown, because not every server lists its models (whisper.cpp does not). On Speaches, the check lists only speech recognition models, and leaves out any text-to-speech voice you may have downloaded.

Bigger models are more accurate and slower. On CPU, `small` is the usual compromise. The difference is not subtle: on the same French sentence, `Systran/faster-whisper-tiny` returned "ceci est en test de dicter vocale d'opposnade" where `Systran/faster-whisper-small` returned "ceci est un test de dictée vocale". Larger models such as `large-v3` handle accents and noise better still, but want a GPU to stay comfortable.

For scale, on a 4-core CPU with `small`: a short sentence takes about 6 seconds, and the first request after the server starts takes about 20, while the model loads into memory. Speaches uses about 1.5 GB of RAM with `small` loaded.

### Spoken language

Leave **Spoken language** empty and the server detects the language, which is what Whisper does well. Set a code when you always dictate in the same language and short sentences get mistaken for another one.

## Running a transcription server

Poznote needs a server that accepts `POST /v1/audio/transcriptions` as multipart form data with the fields `file`, `model`, `response_format=json` and, optionally, `language`, and answers `{"text": "..."}`.

### Speaches (recommended)

The most complete option: it lists its models, can hold several, and reads WebM (what Chrome and Firefox record), M4A and WAV without extra configuration. The [Quick start](#quick-start) sets it up with Docker Compose.

Managing models, from the Poznote container:

```bash
# Browse what can be downloaded
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# Download, list, delete
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Downloading needs internet access from the Speaches container. Transcribing does not.

With an NVIDIA GPU, use the CUDA image instead of `latest-cpu` and give the service access to the GPU; see the [Speaches documentation](https://speaches.ai).

### whisper.cpp

Lighter than Speaches, with one model per server and no model listing. It works well with Poznote, but only with the right flags: its defaults do not speak the OpenAI route, nor any language but English, nor any format but WAV.

**1. Add the service** to `docker-compose.yml`:

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
> Keep `command` as a one-element list, exactly as above. The image runs its command through `bash -c`, and the plain string form gets split into separate arguments, so `bash` runs `whisper-server` with no flags at all. It then starts silently with its defaults: English only, WAV only, listening on `127.0.0.1` inside its container, on `/inference`. Nothing in the logs says anything went wrong.

**2. Download a multilingual model** into the volume, before starting the service: the server refuses to start without its model file, and the image only ships `ggml-base.en.bin`, which understands English and nothing else.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. Start it:**

```bash
docker compose up -d whisper
```

What each flag is for:

| Flag | Default | Why Poznote needs it |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | The bundled model is English only. |
| `-l auto` | `en` | Without it, speech in any other language comes back mangled into English. |
| `--convert` | off | Browsers record WebM, phones produce M4A; without it only WAV is accepted. Uses the ffmpeg shipped in the image. |
| `--host 0.0.0.0` | `127.0.0.1` | Otherwise nothing outside the container can reach it. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | The route Poznote calls. |

**4. In Poznote**, pick **whisper.cpp (local)**, set the URL to `http://whisper:8080`, and type any model name: whisper.cpp ignores it and uses the file it was started with, but the field is required. **Check access and list models** then reports that the server lists no model, which is the expected answer from a working whisper.cpp.

### OpenAI

Pick **OpenAI**: the URL is set for you, and an API key is required. Use one of OpenAI's transcription models, for example `whisper-1`. The audio is sent to OpenAI.

### LocalAI and other servers

LocalAI and other OpenAI-compatible servers work through the **LocalAI** or **Other** presets, as long as they meet the request format at the top of this section. Their setup is not walked through here; see their own documentation, for example [LocalAI's](https://localai.io).

## Reaching the server from Poznote

Poznote calls the transcription server from its own container, never from your browser. So the URL must be reachable from inside the Poznote container, and `localhost` there means the Poznote container itself.

**Recommended: the same Docker network, no published port.** Services of one Compose project share a network and reach each other by service name. That is how the `mcp-server` service of the stock `docker-compose.yml` reaches `http://webserver:80`, and how Poznote reaches `http://speaches:8000` or `http://whisper:8080` above.

> [!CAUTION]
> Do not add `ports: - "8000:8000"` to the transcription server on a machine with a public IP. Speaches and whisper.cpp have no authentication by default, so that would publish a free transcription service to the whole internet. Binding it to `127.0.0.1:8000:8000` is safe, but the Poznote container then cannot reach it; the shared network needs neither.

If the server runs as a separate `docker run` container, attach it to Poznote's network rather than publishing a port. Find the network name with:

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

then start the server with `--network <that-network>` and use its container name in the URL.

For a server on another machine, or on the Docker host outside Docker, use an address the Poznote container can reach. The same rules as for the AI assistant apply, see [Local servers and Docker networking](AI-ASSISTANT.md#local-servers-and-docker-networking).

To check the server answers from where Poznote stands:

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## Limits

- **Recording length:** the **Maximum recording length** setting, 10 minutes by default. It is enforced in the browser.
- **Upload size:** 100 MB per recording or attachment sent for transcription.
- **Transcription time:** Poznote waits up to 570 seconds for the server, just under the 600 seconds its own nginx allows a request, so that a slow transcription ends with a readable message rather than a bare error page.
- **Reverse proxy timeout:** a proxy in front of Poznote can cut the request much earlier. nginx defaults to 60 seconds, and Nginx Proxy Manager to 90. A transcription taking longer then fails with `HTTP 504`, although it would have completed. Either raise the proxy's read timeout for your Poznote host (for nginx and Nginx Proxy Manager's **Advanced** tab: `proxy_read_timeout 600s;`), or keep recordings short enough to transcribe within it.

## Browser requirements

**HTTPS.** Browsers only give a page the microphone on a secure origin: HTTPS, or `localhost`. Over plain `http` on any other address, **Record audio** says it needs HTTPS and records nothing. Transcribing an attachment is unaffected, since nothing is recorded.

**The `Permissions-Policy` header.** Poznote sends `microphone=(self)`, which allows its own origin and refuses every other. If a reverse proxy in front adds its own `Permissions-Policy` header, it can override Poznote's, and a `microphone=()` there makes the browser refuse the microphone whatever the site permission says. The dialog then shows "Poznote was not allowed to use the microphone". Remove the header at the proxy, or set `microphone=(self)` there too.

## Personal servers

The administrator can tick **Allow personal transcription servers**. Every user then gets a **My transcription server** card in their own settings, with the same server, URL, key, model and language fields. When a user enables it, their audio goes to their server instead of the instance one, whether or not they are in the allowed-users list.

The maximum recording length stays the administrator's setting.

Personal API keys are encrypted at rest with the instance secret, like the AI assistant and Git Sync keys.

## Privacy and what is stored

The recording is uploaded to Poznote and forwarded to the transcription server from there. That is deliberate: the transcription server usually sits on a network the browser cannot reach, and its API key has no business reaching a page.

Poznote keeps no copy. The audio lives in PHP's temporary upload file for the length of one request, unless you tick **Also attach the recording to this note**, which saves it as an ordinary attachment that counts toward your storage.

With Speaches or whisper.cpp set up as described above, everything is processed on your machine and nothing goes online:

- The browser records with MediaRecorder, not with the browser's built-in speech recognition, which would send the audio to Google or Apple.
- The recording goes to your Poznote server only, and Poznote forwards it only to the URL set on the Transcription page. No other host is contacted.
- The only internet access is the model download, once, at install time. Transcribing works with the container cut off from the internet.
- The transcribed text lands in your note like text you typed, and nowhere else.

> [!WARNING]
> The **OpenAI** preset is the exception: every recording is sent to OpenAI's servers. It is the only preset that does this, and the only one whose URL is fixed and hidden. If the Transcription page shows a URL field, the audio stays with the server at that URL.

## Troubleshooting

**"Poznote was not allowed to use the microphone", but the browser says it is allowed**
Something is refusing it before the permission is consulted. Check the header that reaches the browser:

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

It must read `microphone=(self)`. See [Browser requirements](#browser-requirements).

**"The microphone needs HTTPS"**
You are on plain `http` at an address other than `localhost`. Serve Poznote over HTTPS.

**No Transcribe button when recording**
Transcription is off, your profile is not in the allowed-users list, or the configuration has no URL or no model. **Record audio** itself is always there, under **Insert** and **Media**; `/dict` finds it.

**No microphone button on an attachment**
The file is not recognised as audio (see the list in [Transcribe an audio attachment](#transcribe-an-audio-attachment)), or transcription is not available to your profile.

**"Failed to connect to ..."**
The URL is wrong, or the server is not running, or it is not on a network Poznote can reach. See [Reaching the server from Poznote](#reaching-the-server-from-poznote).

**"HTTP 404: Model '...' is not installed locally"**
Speaches has not downloaded that model. Download it, see step 3 of the [Quick start](#quick-start).

**"HTTP 404" from Check access, with whisper.cpp**
Pick the **whisper.cpp** preset rather than **Other**: whisper.cpp has no model listing, and only its preset reads that 404 as a working server. If transcriptions themselves return 404, the server is running without `--inference-path /v1/audio/transcriptions`, which usually means `command` was written as a string, see the warning under [whisper.cpp](#whispercpp).

**French (or any non-English) speech comes back as English, or as nonsense**
whisper.cpp is running without `-l auto`, or with the bundled `ggml-base.en.bin` model. Use a multilingual model and `-l auto`.

**Recordings fail but WAV files work, on whisper.cpp**
`--convert` is missing.

**"HTTP 504" on longer recordings**
A reverse proxy cut the request before the transcription finished. See the reverse proxy timeout in [Limits](#limits).

**"The transcription server did not answer within 570 seconds"**
The recording is too long for this model on this hardware. Record less at a time, lower the **Maximum recording length**, or use a smaller model or a GPU.

**"The server heard nothing in this recording"**
Whisper returned empty text, its honest answer to silence. Watch the level bar while recording: if it never moves, the browser is using the wrong input device.

**"This note cannot be edited from here right now"**
The note is being edited elsewhere, so the text was not inserted. Copy it from the box, or close the other editor and try again.

**The first transcription is slow, the next ones are fast**
The server loads the model into memory on first use, about 20 seconds for `small` on CPU.

## Removing it

Turn off **Enable transcription** in the settings, then remove the service from `docker-compose.yml` and:

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` shows the exact volume name, prefixed with your project name.
