<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a> ·
  <b>한국어</b>
</p>
<!-- /lang-selector -->

# Poznote 음성 텍스트 변환(STT)

직접 운영하는 음성 텍스트 변환 서버로 노트에 받아쓰거나 오디오 첨부 파일을 텍스트로 변환할 수 있습니다.

Poznote에는 음성 모델이 내장되어 있지 않습니다. 자체 호스팅 Whisper처럼 OpenAI 오디오 API의 `POST /v1/audio/transcriptions`를 제공하는 서버에 오디오를 보냅니다. 해당 서버를 Poznote와 같은 컴퓨터에서 실행하면 오디오가 그 컴퓨터 밖으로 나가지 않습니다.

> [!TIP]
> [AI 어시스턴트](AI-ASSISTANT.ko.md)와 별도 기능입니다. 각각 독립적으로 설정하며 서로 다른 서버를 사용하거나 둘 중 하나만 활성화할 수 있습니다.

- [빠른 시작](#빠른-시작)
- [주요 기능](#주요-기능)
- [설정](#설정)
- [변환 서버 실행](#변환-서버-실행)
- [Poznote에서 서버 접속](#poznote에서-서버-접속)
- [제한](#제한)
- [브라우저 요구 사항](#브라우저-요구-사항)
- [개인 서버](#개인-서버)
- [개인정보와 저장되는 데이터](#개인정보와-저장되는-데이터)
- [문제 해결](#문제-해결)
- [기능 제거](#기능-제거)

## 빠른 시작

Poznote와 같은 Docker Compose 프로젝트에서 [Speaches](https://github.com/speaches-ai/speaches)를 실행하는 가장 간단한 구성입니다. 아래 명령은 원문 작성자가 그대로 실행해 확인한 예시입니다.

**1. `docker-compose.yml`에 서버를 추가하세요.** `webserver` 옆에 새 서비스를 추가하고 파일 끝에 볼륨을 선언합니다.

```yaml
services:
  # ... webserver와 mcp-server는 유지 ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

`ports:`가 없는 것은 의도된 구성입니다. Poznote는 프로젝트 내부 네트워크로 서버에 접속하며 외부에는 공개하지 않습니다. [이 구성이 중요한 이유](#poznote에서-서버-접속)를 참고하세요.

**2. 시작하세요.**

```bash
docker compose up -d speaches
```

이미지 크기는 약 2 GB입니다.

**3. 모델을 내려받으세요.** Speaches는 모델 없이 시작하며 자동으로 내려받지 않습니다. 설치되지 않은 모델에 변환을 요청하면 `Model '...' is not installed locally` 오류가 발생합니다. 같은 네트워크의 Poznote 컨테이너를 통해 내려받으세요.

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

몇 초 뒤 `Model 'Systran/faster-whisper-small' downloaded`로 응답합니다(약 480 MB). 모델은 `speaches-cache` 볼륨에 저장되어 재시작 후에도 유지됩니다.

**4. Poznote를 설정하세요.** **설정 → 관리 도구 → 음성 텍스트 변환 (STT)**에서 다음을 진행합니다.

- **음성 텍스트 변환 활성화** 켜기
- **Speaches(로컬)** 선택 후 URL에 `http://speaches:8000` 입력
- **접속 확인 및 모델 목록 조회** 실행 후 **모델**에서 `Systran/faster-whisper-small` 선택
- 본인을 포함해 사용을 허용할 사용자 선택
- 저장

**5. 시험하세요.** HTTPS 또는 `localhost`로 노트를 다시 여세요([브라우저 요구 사항](#브라우저-요구-사항) 참고). `/dict`를 입력하고 마이크를 허용한 뒤 말하고 녹음을 중지하세요.

## 주요 기능

설정 후 두 위치에서 음성 텍스트 변환을 사용할 수 있습니다.

### 받아쓰기

서식 있는 텍스트와 마크다운 노트의 슬래시 메뉴에서 **삽입 → 미디어 → 오디오 녹음**을 선택하거나, 휴대폰 키보드 위 편집 도구 모음을 사용하세요. `/dict`, `/voice`, `/transcribe`를 입력하면 하위 메뉴까지 검색해 바로 찾습니다.

대화상자에서 **시작**을 누르면 녹음이 시작됩니다. 처음에는 브라우저가 마이크 권한을 요청합니다. 음량 표시로 실제 입력을 확인하고 타이머로 경과 시간과 관리자가 정한 최대 길이를 확인할 수 있습니다(예: `1:12 / 10:00`).

변환을 사용할 수 있으면 타이머 아래에 **음성 언어** 메뉴가 있습니다. 설정의 기본 언어로 시작하며 변경은 이번 녹음에만 적용됩니다. **자동 감지**를 선택하면 기본 언어 설정과 관계없이 서버가 언어를 판별합니다.

녹음을 중지한 뒤 처리 방식을 고릅니다. **오디오 삽입**은 변환 없이 오디오 플레이어로 노트에 넣습니다. **텍스트로 변환**은 서버로 전송하며 기능 사용 권한이 있을 때만 표시됩니다. 최대 길이에 도달하면 자동으로 중지하고 두 버튼 중 하나를 선택할 때까지 기다립니다.

변환 결과는 노트에 넣기 전에 수정할 수 있는 텍스트 상자에 표시됩니다. **삽입**을 누르면 기존 커서 위치에 넣습니다. 실패하면 두 버튼이 다시 나타나 오디오를 삽입하거나 변환을 재시도할 수 있습니다.

**녹음 파일도 이 노트에 첨부**는 기본적으로 해제되어 있으며 결과를 받으면 오디오를 버립니다. 선택하면 `dictation-<date>.<ext>`라는 일반 첨부 파일로 함께 저장하여 다시 듣거나 더 나은 모델로 나중에 변환할 수 있습니다.

**취소**, Escape, 대화상자 밖 클릭은 녹음 중에도 마이크를 중지하고 녹음을 버립니다.

### 오디오 첨부 파일 변환

노트의 **첨부 파일** 페이지에서 오디오 파일의 다운로드와 삭제 사이에 회색 마이크 버튼이 표시됩니다. 휴대폰 음성 메모를 업로드한 뒤 이 버튼으로 변환할 수 있습니다.

노트로 돌아가 같은 대화상자를 엽니다. 저장된 파일을 다시 업로드하지 않고 변환하며 결과를 검토할 수 있습니다. **삽입**은 노트가 첨부 파일을 참조하면 바로 뒤에, 그렇지 않으면 노트 끝에 넣습니다.

파일명이 `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac`, `aac`로 끝나거나 기록된 유형이 `audio/...`이면 오디오로 봅니다. Windows 음성 녹음기가 `.m4a`를 `video/mp4`로 업로드하므로 의도적으로 확장자를 우선합니다. 소리가 포함되어 있어도 동영상 파일(`mp4`, `webm`)에는 버튼이 표시되지 않습니다.

다른 곳에서 노트를 편집 중이면 결과를 삽입하지 않습니다. 텍스트 상자에 남으므로 복사할 수 있습니다.

## 설정

모든 설정은 관리자 전용 **설정 → 관리 도구 → 음성 텍스트 변환 (STT)**에 있습니다.

| 설정 | 기능 |
|---|---|
| **음성 텍스트 변환 활성화** | 아래 인스턴스 설정의 전체 활성화 스위치입니다. |
| **허용된 사용자** | 인스턴스 서버를 사용할 프로필입니다. 새 프로필을 포함해 선택하기 전에는 누구도 접근할 수 없습니다. |
| **변환 서버** | URL을 채우고 API 키 입력란을 표시하거나 숨기는 사전 설정입니다. Speaches, whisper.cpp, LocalAI, OpenAI, 기타를 지원합니다. |
| **서버 URL** | 서버 기본 URL(예: `http://speaches:8000`). `/v1`이나 전체 `/v1/audio/transcriptions` 경로도 허용합니다. |
| **API 키** | `Authorization: Bearer`로 전달합니다. 로컬 서버는 보통 필요 없고 OpenAI는 필요합니다. |
| **접속 확인 및 모델 목록 조회** | 서버 응답을 확인하고 모델 제안 목록을 채웁니다. |
| **모델** | 매 요청에 보내는 모델 이름입니다. 값을 무시하는 서버에서도 필수입니다. |
| **음성 언어** | `en`, `fr`, `de` 같은 두 글자 코드입니다. 비워 두면 서버가 감지합니다. 녹음 대화상자의 기본 선택값이며 녹음별로 변경할 수 있습니다. |
| **최대 녹음 길이** | 1~60분, 기본 10분입니다. **오디오 녹음**은 이 길이에 도달하면 중지하고 **오디오 삽입** 또는 **텍스트로 변환**을 기다립니다. 변환 기능이 없으면 즉시 오디오를 삽입합니다. 첨부 파일에는 적용되지 않습니다. |
| **개인 변환 서버 허용** | 각 사용자가 개인 서버를 설정할 수 있습니다. [개인 서버](#개인-서버) 참고. |

### 모델 선택

모든 서버가 모델 목록을 제공하지는 않으므로(whisper.cpp 등), 모델 입력란은 드롭다운 대신 제안 목록이 있는 자유 입력 방식입니다. Speaches에서는 음성 인식 모델만 나열하며 내려받은 음성 합성용 목소리는 제외합니다.

큰 모델은 더 정확하지만 느립니다. CPU에서는 보통 `small`이 절충안입니다. 같은 프랑스어 문장에 `Systran/faster-whisper-tiny`는 “ceci est en test de dicter vocale d'opposnade”를, `Systran/faster-whisper-small`은 “ceci est un test de dictée vocale”를 반환할 정도로 차이가 있습니다. `large-v3` 같은 큰 모델은 억양과 잡음에 더 강하지만 원활한 사용에는 GPU가 필요합니다.

4코어 CPU의 `small` 기준으로 짧은 문장은 약 6초, 서버 시작 후 첫 요청은 모델을 메모리에 올리느라 약 20초 걸립니다. `small` 모델을 올린 Speaches는 약 1.5 GB RAM을 사용합니다.

### 음성 언어

**음성 언어**를 비우면 서버가 자동 감지합니다. Whisper가 잘 수행하는 작업입니다. 항상 같은 언어로 받아쓰고 짧은 문장이 다른 언어로 오인된다면 언어 코드를 지정하세요.

## 변환 서버 실행

`file`, `model`, `response_format=json`, 선택적 `language` 필드를 가진 multipart form data로 `POST /v1/audio/transcriptions`를 받고 `{"text": "..."}`로 응답하는 서버가 필요합니다.

### Speaches(권장)

모델 목록과 여러 모델을 지원하며 Chrome·Firefox의 WebM, M4A, WAV를 추가 설정 없이 읽는 가장 완전한 선택지입니다. Docker Compose 설정은 [빠른 시작](#빠른-시작)을 참고하세요.

Poznote 컨테이너에서 모델 관리:

```bash
# 내려받을 수 있는 모델 조회
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# 다운로드, 조회, 삭제
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

다운로드에는 Speaches 컨테이너의 인터넷 접속이 필요하지만 변환에는 필요하지 않습니다.

NVIDIA GPU가 있다면 `latest-cpu` 대신 CUDA 이미지를 사용하고 서비스에 GPU 접근 권한을 부여하세요. [Speaches 문서](https://speaches.ai)를 참고하세요.

### whisper.cpp

Speaches보다 가볍지만 서버당 모델 하나만 지원하며 모델 목록을 제공하지 않습니다. 올바른 옵션을 주면 Poznote와 잘 작동합니다. 기본 설정은 OpenAI 경로, 영어 이외 언어, WAV 이외 형식을 지원하지 않습니다.

**1. 서비스 추가:** `docker-compose.yml`에 다음을 추가하세요.

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
> 위 예시처럼 `command`를 원소 하나인 목록으로 유지하세요. 이미지는 `bash -c`로 명령을 실행하며 일반 문자열은 별도 인수로 나뉘어 `whisper-server`가 옵션 없이 실행됩니다(`bash`가 실행하는 명령에 옵션이 전달되지 않음). 오류 안내 없이 영어 전용·WAV 전용, 컨테이너 내부 `127.0.0.1`, `/inference` 경로라는 기본값으로 시작하므로 로그만으로 문제를 알아채기 어렵습니다.

**2. 다국어 모델 다운로드:** 시작 전에 볼륨에 모델을 내려받으세요. 모델 파일이 없으면 시작을 거부합니다. 이미지에는 영어만 이해하는 `ggml-base.en.bin`만 포함됩니다.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. 시작하세요.**

```bash
docker compose up -d whisper
```

각 옵션의 역할:

| 옵션 | 기본값 | Poznote에 필요한 이유 |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | 기본 제공 모델은 영어 전용입니다. |
| `-l auto` | `en` | 없으면 다른 언어 음성이 왜곡된 영어로 변환됩니다. |
| `--convert` | 비활성화 | 브라우저는 WebM, 휴대폰은 M4A로 녹음합니다. 없으면 WAV만 받습니다. 이미지의 ffmpeg를 사용합니다. |
| `--host 0.0.0.0` | `127.0.0.1` | 없으면 컨테이너 외부에서 접근할 수 없습니다. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | Poznote가 호출하는 경로입니다. |

**4. Poznote 설정:** **whisper.cpp(로컬)**를 선택하고 URL에 `http://whisper:8080`을 입력한 뒤 모델 이름을 입력하세요. whisper.cpp는 이름을 무시하고 시작 시 지정한 파일을 사용하지만 입력은 필수입니다. **접속 확인 및 모델 목록 조회**에서 모델 목록을 제공하지 않는다고 안내하는 것이 정상입니다.

### OpenAI

**OpenAI**를 선택하면 URL이 자동 설정되며 API 키가 필요합니다. `whisper-1` 같은 OpenAI 변환 모델을 사용하세요. 오디오는 OpenAI로 전송됩니다.

### LocalAI와 기타 서버

이 절의 요청 형식을 지원하면 **LocalAI** 또는 **기타** 사전 설정으로 OpenAI 호환 서버를 사용할 수 있습니다. 설치 방법은 [LocalAI 문서](https://localai.io) 등 각 서버의 문서를 참고하세요.

## Poznote에서 서버 접속

Poznote는 브라우저가 아닌 자신의 컨테이너에서 변환 서버를 호출합니다. URL은 컨테이너 내부에서 접근 가능해야 하며 그곳의 `localhost`는 Poznote 컨테이너 자신입니다.

**권장: 같은 Docker 네트워크에서 포트 공개 없이 사용.** 같은 Compose 프로젝트의 서비스는 네트워크를 공유하고 서비스 이름으로 접속합니다. 기본 `docker-compose.yml`의 `mcp-server`가 `http://webserver:80`에 접속하는 방식이며 위 예시의 `http://speaches:8000`과 `http://whisper:8080`도 같습니다.

> [!CAUTION]
> 공인 IP가 있는 컴퓨터의 변환 서버에 `ports: - "8000:8000"`을 추가하지 마세요. Speaches와 whisper.cpp는 기본 인증이 없어 인터넷 전체에 무료 변환 서비스를 공개하게 됩니다. `127.0.0.1:8000:8000` 바인딩은 안전하지만 Poznote 컨테이너가 그 주소로 접근하지 못합니다. 공유 네트워크에서는 어느 쪽도 필요하지 않습니다.

별도 `docker run` 컨테이너로 실행한다면 포트를 공개하는 대신 Poznote 네트워크에 연결하세요. 다음으로 네트워크 이름을 찾습니다.

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

이후 `--network <that-network>`로 서버를 시작하고 URL에 컨테이너 이름을 사용하세요.

다른 컴퓨터나 Docker 밖의 호스트 서버에는 컨테이너에서 접근 가능한 주소를 사용하세요. AI 어시스턴트와 같은 규칙이 적용됩니다. [로컬 서버와 Docker 네트워크](AI-ASSISTANT.ko.md#로컬-서버와-docker-네트워크)를 참고하세요.

Poznote의 실행 위치에서 서버 응답 확인:

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## 제한

- **녹음 길이:** **최대 녹음 길이** 설정, 기본 10분. 브라우저에서 제한합니다.
- **업로드 크기:** 변환에 보내는 녹음 또는 첨부 파일당 100 MB.
- **변환 시간:** Poznote는 최대 570초 기다립니다. 자체 nginx의 요청 제한 600초보다 약간 짧아 느린 변환에도 오류 페이지만 나타나는 대신 읽을 수 있는 안내가 표시됩니다.
- **리버스 프록시 시간 제한:** 앞단 프록시가 더 일찍 요청을 끊을 수 있습니다. nginx 기본값은 60초, Nginx Proxy Manager는 90초입니다. 변환이 그보다 길면 완료 가능해도 `HTTP 504`가 발생합니다. Poznote 호스트의 읽기 시간 제한을 늘리거나(nginx 및 Nginx Proxy Manager의 **Advanced** 탭: `proxy_read_timeout 600s;`) 녹음을 짧게 하세요.

## 브라우저 요구 사항

**HTTPS.** 브라우저는 HTTPS 또는 `localhost`처럼 안전한 출처에서만 마이크를 허용합니다. 다른 주소의 일반 `http`에서는 **오디오 녹음**이 HTTPS 필요 안내를 표시하며 녹음하지 않습니다. 첨부 파일 변환에는 녹음이 없어 영향이 없습니다.

**`Permissions-Policy` 헤더.** Poznote는 자신의 출처만 허용하는 `microphone=(self)`를 보냅니다. 앞단 프록시가 별도 `Permissions-Policy` 헤더를 추가하면 이를 덮어쓸 수 있습니다. `microphone=()`는 사이트 권한과 관계없이 마이크를 차단합니다. “Poznote was not allowed to use the microphone” 안내가 나타나면 프록시의 헤더를 제거하거나 그곳에도 `microphone=(self)`를 설정하세요.

## 개인 서버

관리자가 **개인 변환 서버 허용**을 켜면 각 사용자 설정에 **내 변환 서버** 카드가 나타납니다. 서버, URL, 키, 모델, 언어를 설정할 수 있습니다. 사용자가 켜면 허용 사용자 목록 포함 여부와 관계없이 인스턴스 서버 대신 개인 서버로 오디오를 보냅니다.

최대 녹음 길이는 관리자의 설정을 따릅니다.

개인 API 키는 AI 어시스턴트와 Git 동기화 키처럼 인스턴스 비밀 키로 암호화되어 저장됩니다.

## 개인정보와 저장되는 데이터

녹음은 Poznote로 업로드된 뒤 변환 서버로 전달됩니다. 변환 서버는 대개 브라우저에서 접근할 수 없는 네트워크에 있고 API 키도 페이지에 전달하면 안 되므로 의도된 방식입니다.

Poznote는 사본을 보관하지 않습니다. 오디오는 요청 동안 PHP의 임시 업로드 파일에 있습니다. **녹음 파일도 이 노트에 첨부**를 선택하면 일반 첨부 파일로 저장되어 사용 저장 공간에 포함됩니다.

위 설명대로 Speaches나 whisper.cpp를 구성하면 해당 컴퓨터에서 처리되며 인터넷으로 전송되지 않습니다.

- Google이나 Apple에 오디오를 보내는 브라우저 내장 음성 인식 대신 MediaRecorder로 녹음합니다.
- 녹음은 Poznote 서버로만 전송되며 Poznote는 변환 설정의 URL로만 전달합니다. 다른 호스트에 접속하지 않습니다.
- 인터넷 접속은 설치 시 모델을 내려받을 때만 필요합니다. 컨테이너의 인터넷을 끊어도 변환은 작동합니다.
- 변환된 텍스트는 직접 입력한 것처럼 노트에 저장됩니다.

> [!WARNING]
> **OpenAI** 사전 설정은 예외입니다. 모든 녹음을 OpenAI 서버로 보냅니다. 사전 설정 중 URL이 고정되어 숨겨지는 유일한 항목입니다. URL 입력란이 표시되는 설정은 해당 URL의 서버로 오디오를 보냅니다.

## 문제 해결

**브라우저에서 허용했는데 “Poznote was not allowed to use the microphone” 표시**
권한 확인 전에 차단되는 상황입니다. 브라우저에 도달하는 헤더를 확인하세요.

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

`microphone=(self)`여야 합니다. [브라우저 요구 사항](#브라우저-요구-사항)을 참고하세요.

**“The microphone needs HTTPS” 표시**
`localhost` 이외 주소의 일반 `http`로 접속했습니다. HTTPS로 제공하세요.

**녹음 시 변환 버튼 없음**
기능이 꺼져 있거나 프로필이 허용 목록에 없거나 URL·모델 설정이 없습니다. **오디오 녹음** 자체는 항상 **삽입 → 미디어**에 있으며 `/dict`로 찾습니다.

**첨부 파일에 마이크 버튼 없음**
오디오로 인식하지 못했거나([오디오 첨부 파일 변환](#오디오-첨부-파일-변환)의 목록 참고) 프로필에 변환 권한이 없습니다.

**“Failed to connect to ...” 표시**
URL이 잘못되었거나 서버가 꺼져 있거나 Poznote에서 접근 가능한 네트워크에 없습니다. [Poznote에서 서버 접속](#poznote에서-서버-접속)을 참고하세요.

**“HTTP 404: Model '...' is not installed locally” 표시**
Speaches에 모델이 없습니다. [빠른 시작](#빠른-시작)의 3단계로 내려받으세요.

**whisper.cpp 접속 확인에서 “HTTP 404” 표시**
**기타** 대신 **whisper.cpp**를 선택하세요. 모델 목록을 제공하지 않는 서버의 404를 정상으로 해석하는 사전 설정입니다. 변환 요청도 404라면 `--inference-path /v1/audio/transcriptions` 없이 실행된 것입니다. 대개 `command`를 문자열로 작성한 경우입니다. [whisper.cpp](#whispercpp)의 경고를 참고하세요.

**프랑스어 등 영어 이외 음성이 영어 또는 의미 없는 결과로 변환됨**
whisper.cpp에 `-l auto`가 없거나 기본 `ggml-base.en.bin`을 사용하고 있습니다. 다국어 모델과 `-l auto`를 사용하세요.

**whisper.cpp에서 WAV는 되지만 녹음은 실패**
`--convert`가 빠졌습니다.

**긴 녹음에서 “HTTP 504” 표시**
변환 완료 전에 리버스 프록시가 끊었습니다. [제한](#제한)의 프록시 시간 제한을 참고하세요.

**“The transcription server did not answer within 570 seconds” 표시**
현재 하드웨어와 모델로 처리하기에는 녹음이 너무 깁니다. 녹음을 나누거나 **최대 녹음 길이**를 줄이거나 작은 모델 또는 GPU를 사용하세요.

**“The server heard nothing in this recording” 표시**
Whisper가 무음에 대해 빈 텍스트를 반환했습니다. 녹음 중 음량 표시가 움직이지 않으면 브라우저가 다른 입력 기기를 사용하고 있습니다.

**“This note cannot be edited from here right now” 표시**
다른 곳에서 편집 중이라 삽입하지 않았습니다. 상자에서 복사하거나 다른 편집기를 닫고 다시 시도하세요.

**첫 변환만 느림**
처음 사용할 때 모델을 메모리에 올립니다. CPU의 `small`은 약 20초 걸립니다.

## 기능 제거

설정에서 **음성 텍스트 변환 활성화**를 끄고 `docker-compose.yml`의 서비스를 제거한 뒤 다음을 실행하세요.

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls`로 프로젝트 이름이 앞에 붙은 정확한 볼륨 이름을 확인할 수 있습니다.
