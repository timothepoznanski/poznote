# Poznote Transcription (speech to text)

Dictate into a note, or turn an audio attachment into text, using a speech-to-text server you run yourself.

Poznote embeds no speech model. It talks to a server exposing the OpenAI audio API, `POST /v1/audio/transcriptions`, which every Whisper distribution worth self-hosting speaks. Point it at a container on your own machine and the audio never leaves it.

> [!TIP]
> This is separate from the [AI Assistant](AI-ASSISTANT.md). The two are configured independently and can use different servers, or you can enable one without the other.

## What it does

Once configured, two things appear.

**Dictate**, in the slash menu of every note. Type `/` and pick **Dictate** (or type `/dict`, `/voice`, `/transcribe`). A dialog opens, recording starts, and a level bar shows the microphone is actually picking something up. Stop the recording and the transcript comes back in a text box, where you can correct it before it goes into the note. Click **Insert** and the text lands where your cursor was, in a rich-text note or in a Markdown one.

There is also a checkbox, **Also attach the recording to this note**. Leave it unticked, which is the default, and the audio is discarded once the text comes back. Tick it and the recording is saved as an ordinary attachment, so you can listen to it again or transcribe it a second time with a better model.

**Transcribe**, on audio attachments. Open the attachments dialog of a note and any `mp3`, `wav`, `ogg`, `m4a` or `flac` file gets a microphone button next to the eye and the bin. It sends the stored file to the transcription server, no re-upload, and offers the text the same way. This is the one to use for a voice memo recorded on your phone and dropped into Poznote.

Recordings stop on their own after 10 minutes, so a tab left recording cannot hand the server an hour of audio.

## Enabling it

Go to **Settings → Admin Tools → Transcription** (administrator only) and pick a server:

| Server | URL | API key |
|---|---|---|
| **Speaches** (local) | Pre-filled with your Docker host address, port `8000` | Only if you configured one |
| **whisper.cpp** (local) | Pre-filled with your Docker host address, port `8080` | Not needed |
| **LocalAI** (local) | Pre-filled with your Docker host address, port `8080` | Not needed |
| **OpenAI** (cloud) | Set automatically | Required |
| **Other** | Any base URL exposing the OpenAI audio API | Depends on the server |

Then use **Check access and list models**, which verifies the server is reachable and fills the **Model** suggestions with what it offers.

Finally, tick the users allowed to use it. Access is granted profile by profile, like the AI assistant: nobody has it until you add them, new profiles included.

### The model field

Unlike the AI assistant, the model is a free text field with suggestions rather than a dropdown, because the servers disagree about what `/v1/models` means:

- **Speaches** and **LocalAI** list their models, and the check fills the suggestions. Pick one, for example `Systran/faster-whisper-small`.
- **whisper.cpp** serves the single model it was started with and lists nothing. The check still confirms the server is reachable; type any name you like into the field, it is sent and ignored. A value is required either way.

Bigger models are more accurate and slower. On CPU, `small` is the usual compromise; `large-v3` is noticeably better on accents and background noise but wants a GPU to stay comfortable.

### Spoken language

Leave **Spoken language** empty and the server detects the language, which is what Whisper is good at. Set a two-letter code (`en`, `fr`, `de`, ...) when you always dictate in the same language and short sentences keep getting mistaken for another one.

## Running a transcription server

Any of these works. They all speak `POST /v1/audio/transcriptions`.

### Speaches

The most complete of the three: it downloads models on demand, lists them, and holds several at once.

```bash
docker run --rm -d --name speaches -p 8000:8000 \
  -v speaches-cache:/home/ubuntu/.cache/huggingface \
  ghcr.io/speaches-ai/speaches:latest-cpu
```

Then set the server URL to your Docker host on port `8000` and the model to `Systran/faster-whisper-small`.

Swap `latest-cpu` for the CUDA image and add `--gpus all` if you have an NVIDIA card.

### whisper.cpp

Lighter, one model per container, no model listing.

```bash
docker run --rm -d --name whisper-server -p 8080:8080 \
  ghcr.io/ggml-org/whisper.cpp:main-server \
  --model /models/ggml-base.en.bin --host 0.0.0.0 --port 8080
```

### LocalAI

Worth it if you already run LocalAI for text models: the same instance serves transcription.

## Reaching a local server from the container

Poznote runs inside Docker, so `localhost` in the settings means the Poznote container itself, not your machine. This is the single most common reason a correctly running server looks unreachable.

The URL field is pre-filled with the right host for your setup. It is `host.docker.internal` on Docker Desktop, and the container's default gateway on Linux. The same rules as the AI assistant apply, and they are covered in detail in [Local servers and Docker networking](AI-ASSISTANT.md#local-servers-and-docker-networking).

If the transcription server runs in a container too, the simplest arrangement is to put both on the same Docker network and use the service name, for example `http://speaches:8000`.

## Personal servers

The administrator can tick **Allow personal transcription servers**. Every user then gets a **My transcription server** card in their own settings, where they can enter their own server, model, language and API key. When a user does so, their audio goes to that server instead of the instance one, whether or not they appear in the allowed-users list.

Personal API keys are encrypted at rest with the instance secret, the same way the AI assistant and Git Sync store theirs.

## Privacy and what is stored

The recording is uploaded to Poznote and forwarded to the transcription server from there, never from your browser. That is deliberate: the transcription server usually sits on a private network the browser cannot reach, and its API key has no business being handed to a page.

Poznote keeps no copy. The audio lives in PHP's temporary upload file for the length of one request and is gone when it ends, unless you tick **Also attach the recording to this note**, which saves it as an ordinary attachment subject to the usual storage quota.

With a local Whisper server, nothing leaves your machine at any point. With OpenAI selected, the audio is sent to OpenAI.

## The microphone needs HTTPS

Browsers only expose a microphone on a secure origin. Over plain `http` on anything but `localhost`, **Dictate** reports that it needs HTTPS and records nothing. This is a browser rule, not a Poznote setting: put Poznote behind HTTPS, which you want anyway, and it works.

Transcribing an audio attachment is unaffected, since nothing is recorded.

## Troubleshooting

**"Failed to connect ..."**
The URL is wrong or the server is not running. See [Reaching a local server from the container](#reaching-a-local-server-from-the-container). Check the server answers from inside the Poznote container:

```bash
docker exec poznote-webserver-1 wget -qO- http://host.docker.internal:8000/v1/models
```

**"HTTP 422" or a message about the model**
The model name is not one this server has. Use **Check access and list models** and pick from the suggestions, or check what your server was started with.

**"The server heard nothing in this recording"**
The transcription came back empty, which is Whisper's honest answer to silence. Watch the level bar while recording: if it never moves, the browser is recording the wrong input device.

**Dictate is not in the slash menu**
Either transcription is off, or your profile is not in the allowed-users list, or the configuration is missing a URL or a model. All three are on the **Transcription** settings page.

**The transcript never comes back on long recordings**
Whisper on CPU can take longer than the audio itself. Poznote waits up to 15 minutes. If you are hitting that, use a smaller model or a GPU.
