<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <b>简体中文</b>
</p>
<!-- /lang-selector -->

# Poznote 转录（语音转文字）

使用您自己运行的语音转文字服务器，在笔记中听写，或将音频附件转换为文字。

Poznote 不内置任何语音模型。它会把音频发送到提供 OpenAI 音频 API（`POST /v1/audio/transcriptions`）的服务器，例如自托管的 Whisper。将该服务器与 Poznote 部署在一起，音频就永远不会离开您的机器。

> [!TIP]
> 这与 [AI 助手](AI-ASSISTANT.zh-cn.md) 相互独立。两者分别配置，可以使用不同的服务器，也可以只启用其中一个。

- [快速开始](#快速开始)
- [功能说明](#功能说明)
- [设置](#设置)
- [运行转录服务器](#运行转录服务器)
- [从 Poznote 访问服务器](#从-poznote-访问服务器)
- [限制](#限制)
- [浏览器要求](#浏览器要求)
- [个人服务器](#个人服务器)
- [隐私与存储内容](#隐私与存储内容)
- [故障排除](#故障排除)
- [移除](#移除)

## 快速开始

最简单的方式是让 [Speaches](https://github.com/speaches-ai/speaches) 与 Poznote 运行在同一个 Docker Compose 项目中。下面的每条命令都按原样实际运行过。

**1. 将服务器添加到 `docker-compose.yml`**，作为 `webserver` 旁边的一个新服务，并在文件末尾声明它的卷：

```yaml
services:
  # ... webserver 和 mcp-server 保持不变 ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

这里特意没有 `ports:` 部分：Poznote 通过项目的内部网络访问该服务器，不会向外部暴露任何端口。参见[这一点为何重要](#从-poznote-访问服务器)。

**2. 启动：**

```bash
docker compose up -d speaches
```

镜像大小约为 2 GB。

**3. 下载模型。** Speaches 启动时不带任何模型，也不会自行下载：如果请求使用尚未下载的模型进行转录，会失败并返回 `Model '...' is not installed locally`。请通过同一网络中的 Poznote 容器下载模型：

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

几秒钟后它会返回 `Model 'Systran/faster-whisper-small' downloaded`（约 480 MB）。模型保存在 `speaches-cache` 卷中，重启后依然存在。

**4. 配置 Poznote。** 前往 **设置 → 管理工具 → 转录**，然后：

- 打开 **启用转录**；
- 选择 **Speaches (local)**，并将 URL 设为 `http://speaches:8000`；
- 点击 **检查访问并列出模型**，然后在 **模型** 中选择 `Systran/faster-whisper-small`；
- 勾选允许使用该功能的用户，包括您自己；
- 保存。

**5. 试用。** 通过 HTTPS（或通过 `localhost`，参见[浏览器要求](#浏览器要求)）重新加载一条笔记，输入 `/dict`，允许使用麦克风，说话，然后停止。

## 功能说明

配置完成后，转录功能会出现在两个地方。

### 听写

听写通过 **录音** 进行，它位于每条笔记斜杠菜单的 **插入** 和 **媒体** 下，富文本笔记和 Markdown 笔记均可使用；在手机上，它也位于键盘上方的编辑栏中。由于筛选会搜索子菜单，输入 `/dict`、`/voice` 或 `/transcribe` 即可直接找到它。

对话框打开后，点击**开始**即可录音，浏览器也会在此时首次请求麦克风权限。音量条表明麦克风确实在拾音，计时器显示已录制的时长以及管理员设置的最长时长，例如 `1:12 / 10:00`。

可以转录时，计时器下方会出现**口述语言**菜单。它默认选中配置中设置的语言（标注为默认），修改只对本次录音生效。选择**自动检测**时，即使配置指定了语言，也会由服务器自行识别。

录音如何处理，在停止录音时选择。**插入音频** 会将其作为音频播放器放入笔记，不进行转录。**转录** 会将其发送到服务器，仅在您可以使用转录功能时显示。录音达到最长时长时会自动停止，并等待您点击这两个按钮之一。

转录文本会显示在一个文本框中，您可以在它插入笔记之前进行修改。**插入** 会将其放到光标原先所在的位置。如果转录失败，两个按钮都会重新出现，因此录音仍可作为音频插入，或重新发送。

**同时将录音附加到此笔记** 复选框默认不勾选，此时文字返回后音频即被丢弃。勾选后，录音还会保存为名为 `dictation-<date>.<ext>` 的普通附件，方便您重新收听，或以后用更好的模型重新转录。

点击 **取消**、按 Escape 键或点击对话框外部，都会关闭麦克风并丢弃录音，即使录到一半也是如此。

### 转录音频附件

在笔记的 **附件** 页面上，每个音频文件的下载和删除按钮之间都有一个灰色麦克风按钮。用手机录制并上传到 Poznote 的语音备忘录，就用这个按钮转录。

点击后会回到笔记并打开同一个对话框：文件直接从存储中转录，无需再次上传，转录文本会先供您审阅。如果笔记中引用了该附件，**插入** 会将文本放在附件之后，否则放在笔记末尾。

文件名以 `mp3`、`wav`、`ogg`、`oga`、`opus`、`m4a`、`flac` 或 `aac` 结尾，或者记录的类型为 `audio/...` 时，该文件即被视为音频。扩展名优先于类型是有意为之：Windows 会把“录音机”生成的 `.m4a` 以 `video/mp4` 类型上传。视频文件（`mp4`、`webm`）即使包含声音，也不会提供此按钮。

如果该笔记正在其他地方打开并编辑，文本不会被插入：它会保留在文本框中，方便您复制。

## 设置

所有设置都位于 **设置 → 管理工具 → 转录**（仅限管理员）。

| 设置 | 作用 |
|---|---|
| **启用转录** | 下方实例配置的总开关。 |
| **允许的用户** | 可以使用实例服务器的用户资料。在勾选之前任何人都无权访问，新建的用户资料也是如此。 |
| **转录服务器** | 预设选项，会自动填写 URL 并显示或隐藏 API 密钥：Speaches、whisper.cpp、LocalAI、OpenAI 或“其他”。 |
| **服务器 URL** | 服务器的基础 URL，例如 `http://speaches:8000`。也接受 `/v1` 以及完整的 `/v1/audio/transcriptions` 路径。 |
| **API 密钥** | 以 `Authorization: Bearer` 形式发送。本地服务器通常不需要，OpenAI 则需要。 |
| **检查访问并列出模型** | 确认服务器有响应，并填充模型建议列表。 |
| **模型** | 每次请求时发送的模型名称。所有服务器都必须填写，即使是会忽略它的服务器。 |
| **口述语言** | 两个字母的代码，例如 `en`、`fr` 或 `de`；留空则由服务器自动检测。录音对话框会预先选中该语言，并可通过其菜单为单次录音更改。 |
| **最长录音时长** | 以分钟为单位，范围 1 到 60，默认 10。达到该时长时，**录音** 会自动停止，然后等待您选择 **插入音频** 或 **转录**。如果没有转录功能，它会立即插入音频。不影响附件。 |
| **允许使用个人转录服务器** | 允许每个用户设置自己的服务器，参见[个人服务器](#个人服务器)。 |

### 选择模型

模型字段是带建议的自由文本框，而不是下拉列表，因为并非所有服务器都会列出自己的模型（whisper.cpp 就不会）。在 Speaches 上，检查只会列出语音识别模型，您可能下载过的文字转语音音色不会出现在列表中。

模型越大越准确，但速度也越慢。在 CPU 上，`small` 通常是折中的选择。差别相当明显：对同一句法语，`Systran/faster-whisper-tiny` 返回的是“ceci est en test de dicter vocale d'opposnade”，而 `Systran/faster-whisper-small` 返回的是“ceci est un test de dictée vocale”。`large-v3` 等更大的模型对口音和噪音的处理还要更好，但需要 GPU 才能运行得比较流畅。

作为参考，在 4 核 CPU 上使用 `small`：一句短句大约需要 6 秒，而服务器启动后的第一次请求需要把模型加载到内存中，大约要 20 秒。加载 `small` 后，Speaches 大约占用 1.5 GB 内存。

### 口述语言

将 **口述语言** 留空时，服务器会自动检测语言，这正是 Whisper 擅长的。如果您总是用同一种语言听写，而短句常被误识别为其他语言，请设置语言代码。

## 运行转录服务器

Poznote 需要一个这样的服务器：它接受以 multipart 表单数据发送的 `POST /v1/audio/transcriptions` 请求，字段为 `file`、`model`、`response_format=json` 以及可选的 `language`，并返回 `{"text": "..."}`。

### Speaches（推荐）

功能最完整的选项：它能列出自己的模型，可以同时保存多个模型，并且无需额外配置即可读取 WebM（Chrome 和 Firefox 录制的格式）、M4A 和 WAV。[快速开始](#快速开始) 介绍了如何使用 Docker Compose 部署它。

从 Poznote 容器中管理模型：

```bash
# 浏览可以下载的模型
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# 下载、列出、删除
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

下载模型需要 Speaches 容器能够访问互联网，转录则不需要。

如果有 NVIDIA GPU，请使用 CUDA 镜像代替 `latest-cpu`，并让该服务能够访问 GPU，详见 [Speaches 文档](https://speaches.ai)。

### whisper.cpp

比 Speaches 更轻量，每个服务器只运行一个模型，且不提供模型列表。它与 Poznote 配合良好，但必须使用正确的参数：按默认设置，它既不提供 OpenAI 路由，也只支持英语和 WAV 格式。

**1. 添加服务** 到 `docker-compose.yml` 中：

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
> `command` 必须保持为只有一个元素的列表，与上面完全一致。该镜像通过 `bash -c` 运行命令，而普通字符串形式会被拆分成多个独立参数，结果 `bash` 运行 `whisper-server` 时不带任何参数。它随后会以默认设置悄无声息地启动：仅支持英语，仅支持 WAV，在容器内监听 `127.0.0.1`，路由为 `/inference`。日志中不会有任何出错的提示。

**2. 下载多语言模型** 到卷中，并且要在启动服务之前完成：缺少模型文件时服务器会拒绝启动，而镜像只自带 `ggml-base.en.bin`，它只能识别英语。

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. 启动：**

```bash
docker compose up -d whisper
```

各参数的作用：

| 参数 | 默认值 | Poznote 为何需要它 |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | 自带的模型仅支持英语。 |
| `-l auto` | `en` | 不加此参数时，其他任何语言的语音都会被错误地转成英语。 |
| `--convert` | 关闭 | 浏览器录制的是 WebM，手机生成的是 M4A；不加此参数时只接受 WAV。它使用镜像自带的 ffmpeg。 |
| `--host 0.0.0.0` | `127.0.0.1` | 否则容器外部无法访问它。 |
| `--inference-path /v1/audio/transcriptions` | `/inference` | Poznote 调用的路由。 |

**4. 在 Poznote 中**，选择 **whisper.cpp (local)**，将 URL 设为 `http://whisper:8080`，并随意填写一个模型名称：whisper.cpp 会忽略它，使用启动时指定的模型文件，但该字段是必填的。随后 **检查访问并列出模型** 会报告服务器没有列出任何模型，对于正常运行的 whisper.cpp 来说，这正是预期的结果。

### OpenAI

选择 **OpenAI**：URL 会自动填好，并且必须提供 API 密钥。请使用 OpenAI 的转录模型之一，例如 `whisper-1`。音频会被发送到 OpenAI。

### LocalAI 和其他服务器

LocalAI 和其他兼容 OpenAI 的服务器可以通过 **LocalAI** 或 **其他** 预设使用，只要它们符合本节开头所述的请求格式即可。这里不详细介绍它们的部署方法，请参阅各自的文档，例如 [LocalAI 的文档](https://localai.io)。

## 从 Poznote 访问服务器

Poznote 从自己的容器中调用转录服务器，而不是从您的浏览器调用。因此，该 URL 必须能从 Poznote 容器内部访问，而在容器内部，`localhost` 指的是 Poznote 容器本身。

**推荐：使用同一个 Docker 网络，不发布端口。** 同一个 Compose 项目中的服务共享一个网络，并通过服务名互相访问。默认 `docker-compose.yml` 中的 `mcp-server` 服务正是这样访问 `http://webserver:80` 的，上文中 Poznote 访问 `http://speaches:8000` 或 `http://whisper:8080` 也是如此。

> [!CAUTION]
> 在拥有公网 IP 的机器上，不要为转录服务器添加 `ports: - "8000:8000"`。Speaches 和 whisper.cpp 默认没有身份验证，这样做等于向整个互联网公开一个免费的转录服务。绑定到 `127.0.0.1:8000:8000` 是安全的，但这样 Poznote 容器就无法访问它；而共享网络两者都不需要。

如果服务器是用 `docker run` 单独运行的容器，请将它连接到 Poznote 的网络，而不是发布端口。用以下命令查找网络名称：

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

然后使用 `--network <that-network>` 启动服务器，并在 URL 中使用它的容器名。

如果服务器位于另一台机器上，或者在 Docker 主机上但不在 Docker 中运行，请使用 Poznote 容器能够访问的地址。规则与 AI 助手相同，参见[本地服务器与 Docker 网络](AI-ASSISTANT.zh-cn.md#本地服务器与-docker-网络)。

要从 Poznote 所在的位置检查服务器是否有响应：

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## 限制

- **录音时长：** 由 **最长录音时长** 设置决定，默认 10 分钟。该限制在浏览器中执行。
- **上传大小：** 每个送去转录的录音或附件最大 100 MB。
- **转录时间：** Poznote 最多等待服务器 570 秒，略低于其自带 nginx 允许单个请求的 600 秒，这样转录过慢时会以一条可读的消息结束，而不是一个光秃秃的错误页面。
- **反向代理超时：** Poznote 前面的代理可能会更早切断请求。nginx 默认 60 秒，Nginx Proxy Manager 默认 90 秒。耗时更长的转录会以 `HTTP 504` 失败，尽管它本可以完成。您可以为 Poznote 主机调高代理的读取超时（对于 nginx 以及 Nginx Proxy Manager 的 **Advanced** 选项卡：`proxy_read_timeout 600s;`），或者让录音足够短，以便在该时间内完成转录。

## 浏览器要求

**HTTPS。** 浏览器只在安全来源（HTTPS 或 `localhost`）上允许页面使用麦克风。在其他地址上通过普通 `http` 访问时，**录音** 会提示需要 HTTPS，并且不会录音。转录附件不受影响，因为它无需录音。

**`Permissions-Policy` 响应头。** Poznote 发送 `microphone=(self)`，允许其自身来源并拒绝所有其他来源。如果前面的反向代理添加了自己的 `Permissions-Policy` 响应头，它可能会覆盖 Poznote 的设置；如果其中写的是 `microphone=()`，无论网站权限如何设置，浏览器都会拒绝使用麦克风。此时对话框会显示“Poznote 未获准使用麦克风”。请在代理上删除该响应头，或者在那里同样设置 `microphone=(self)`。

## 个人服务器

管理员可以勾选 **允许使用个人转录服务器**。之后每个用户都会在自己的设置中看到 **我的转录服务器** 卡片，其中包含同样的服务器、URL、密钥、模型和语言字段。用户启用后，其音频会发送到自己的服务器，而不是实例服务器，无论该用户是否在允许的用户列表中。

最长录音时长仍由管理员设置。

与 AI 助手和 Git 同步的密钥一样，个人 API 密钥使用实例机密加密存储。

## 隐私与存储内容

录音会先上传到 Poznote，再由 Poznote 转发给转录服务器。这是有意的设计：转录服务器通常位于浏览器无法访问的网络中，而且它的 API 密钥也不应该出现在网页上。

Poznote 不保留任何副本。音频只在一次请求期间存在于 PHP 的临时上传文件中，除非您勾选了 **同时将录音附加到此笔记**，这样它会被保存为普通附件，并计入您的存储空间。

如果按上文所述部署 Speaches 或 whisper.cpp，所有处理都在您的机器上完成，没有任何数据上传到互联网：

- 浏览器使用 MediaRecorder 录音，而不是浏览器内置的语音识别，后者会把音频发送给 Google 或 Apple。
- 录音只发送到您的 Poznote 服务器，Poznote 只把它转发到「转录」页面配置的 URL。不会联系任何其他主机。
- 唯一的互联网访问是下载模型，仅在安装时进行一次。容器断开互联网后，转录依然正常工作。
- 转录出的文本会像您手动输入一样进入笔记，不会去往任何其他地方。

> [!WARNING]
> **OpenAI** 预设是例外：每段录音都会发送到 OpenAI 的服务器。它是唯一这样做的预设，也是唯一 URL 固定且隐藏的预设。如果「转录」页面显示 URL 字段，音频就只会到达该 URL 对应的服务器。

## 故障排除

**“Poznote 未获准使用麦克风”，但浏览器显示已允许**
在权限被查询之前，已经有其他东西拒绝了麦克风。检查到达浏览器的响应头：

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

它必须为 `microphone=(self)`。参见[浏览器要求](#浏览器要求)。

**“麦克风需要 HTTPS”**
您正在通过普通 `http` 访问 `localhost` 以外的地址。请通过 HTTPS 提供 Poznote。

**录音时没有转录按钮**
说明转录功能未开启，或您的用户资料不在允许的用户列表中，或配置中缺少 URL 或模型。**录音** 本身始终存在，位于 **插入** 和 **媒体** 下；`/dict` 能找到它。

**附件上没有麦克风按钮**
该文件未被识别为音频（参见[转录音频附件](#转录音频附件)中的列表），或者您的用户资料无法使用转录功能。

**“Failed to connect to ...”**
URL 错误，或者服务器未运行，或者它不在 Poznote 可以访问的网络中。参见[从 Poznote 访问服务器](#从-poznote-访问服务器)。

**“HTTP 404: Model '...' is not installed locally”**
Speaches 尚未下载该模型。请下载它，参见[快速开始](#快速开始)的第 3 步。

**使用 whisper.cpp 时，检查访问返回“HTTP 404”**
请选择 **whisper.cpp** 预设，而不是 **其他**：whisper.cpp 没有模型列表，只有它的预设会把这个 404 视为服务器正常运行。如果转录请求本身也返回 404，说明服务器运行时没有带 `--inference-path /v1/audio/transcriptions`，这通常意味着 `command` 被写成了字符串，参见 [whisper.cpp](#whispercpp) 下的警告。

**法语（或任何非英语）语音被转成了英语，或者变成了乱码**
whisper.cpp 运行时没有带 `-l auto`，或者使用的是自带的 `ggml-base.en.bin` 模型。请使用多语言模型并加上 `-l auto`。

**使用 whisper.cpp 时，录音转录失败，但 WAV 文件正常**
缺少 `--convert`。

**较长的录音出现“HTTP 504”**
反向代理在转录完成之前切断了请求。参见[限制](#限制)中的反向代理超时。

**“转录服务器在 570 秒内没有响应”**
对于这台硬件上的这个模型来说，录音太长了。请每次少录一些，调低 **最长录音时长**，或者使用更小的模型或 GPU。

**“服务器在此录音中没有听到任何内容”**
Whisper 返回了空文本，这是它对静音的如实回应。录音时请留意音量条：如果它始终不动，说明浏览器使用了错误的输入设备。

**“此笔记当前无法在此处编辑”**
该笔记正在其他地方编辑，因此文本未被插入。请从文本框中复制文本，或者关闭另一个编辑器后重试。

**第一次转录很慢，之后就快了**
服务器在首次使用时会把模型加载到内存中，在 CPU 上加载 `small` 大约需要 20 秒。

## 移除

在设置中关闭 **启用转录**，然后从 `docker-compose.yml` 中删除该服务，并运行：

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` 会显示确切的卷名，卷名以您的项目名称为前缀。
