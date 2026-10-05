<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <b>한국어</b>
</p>
<!-- /lang-selector -->

# 웹훅

Poznote는 등록한 엔드포인트에 JSON을 담은 HTTP POST 요청인 **발신 웹훅**을 보내 인스턴스의 이벤트를 외부 서비스에 알릴 수 있습니다. n8n, Zapier, 자체 스크립트 등 자동화 도구에 연결할 수 있습니다.

Poznote는 웹훅을 **발신**하기만 합니다. 이메일 발송, 워크플로 실행, 기록 등 수신 후 처리는 수신자가 결정하며 Poznote 외부에서 수행됩니다.

## 목차

- [개요](#개요)
- [웹훅 관리](#웹훅-관리)
- [전송](#전송)
  - [요청 형식](#요청-형식)
  - [페이로드 공통 구조](#페이로드-공통-구조)
  - [서명 검증](#서명-검증)
  - [전송 보장 범위](#전송-보장-범위)
- [노트 직접 링크(인스턴스 URL)](#노트-직접-링크인스턴스-url)
- [공통 페이로드 객체](#공통-페이로드-객체)
  - [data.user 객체](#datauser-객체)
  - [data.note 객체](#datanote-객체)
- [이벤트 설명](#이벤트-설명)
  - [인스턴스 이벤트](#인스턴스-이벤트)
  - [사용자 이벤트](#사용자-이벤트)
  - [테스트 ping](#테스트-ping)
- [개인정보와 보안](#개인정보와-보안)
- [수신 서버 예시](#수신-서버-예시)

## 개요

웹훅은 두 가지 독립된 범위로 나뉩니다.

| 범위 | 관리 위치 | 사용자 | 이벤트 |
|---|---|---|---|
| **관리자 웹훅** | **설정 > 관리 도구 > 관리자 웹훅** | 관리자만 | 인스턴스 이벤트: `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached` |
| **사용자 웹훅** | **설정 > 사용자 웹훅** | 모든 계정(사용자 기능 제한으로 차단된 경우 제외) | 본인 콘텐츠 이벤트: `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

격리 규칙은 엄격합니다. 사용자 이벤트는 해당 계정이 등록한 엔드포인트에만 전달됩니다. 다른 사용자의 노트나 알림은 전달되지 않습니다. 인스턴스 이벤트는 구독한 모든 관리자 웹훅에 전달됩니다.

## 웹훅 관리

관리자 또는 사용자 웹훅 페이지에서 다음을 설정합니다.

- **엔드포인트 URL:** `http://` 또는 `https://`로 시작해야 합니다.
- **설명(선택):** “새 노트를 Notion에 저장하는 n8n 워크플로”처럼 용도를 적습니다. 목록에서 구분하기 위한 설명이며 엔드포인트에 전송하지 않습니다.
- **비밀 키(선택):** 지정하면 HMAC-SHA256으로 서명해 수신자가 발신자를 인증할 수 있습니다. [서명 검증](#서명-검증)을 참고하세요.
- **이벤트:** 엔드포인트가 구독할 이벤트를 선택합니다.

각 웹훅 행의 **...** 작업 메뉴에는 다음이 있습니다.

- **편집:** URL, 설명, 비밀 키, 이벤트를 변경합니다. 현재값을 채운 양식이 웹훅 아래에 열립니다.
- **테스트 전송:** 즉시 [ping](#테스트-ping)을 보내고 HTTP 결과를 표시합니다.
- **비활성화 / 활성화:** 등록을 삭제하지 않고 전송을 중지하거나 재개합니다.
- **삭제:** 확인 후 웹훅을 제거합니다.

마지막 전송의 HTTP 상태 코드 또는 연결 오류와 시각도 표시됩니다.

같은 URL을 두 번 등록할 수 있지만 각 등록이 별도로 이벤트를 보내므로 수신자는 중복을 받습니다.

## 전송

### 요청 형식

모든 전송은 JSON 본문과 다음 헤더가 있는 HTTP `POST`입니다.

| 헤더 | 값 |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | 이벤트 이름(예: `note.created`) |
| `X-Poznote-Delivery` | 고유 전송 ID(본문의 `delivery_id`와 동일) |
| `X-Poznote-Signature-256` | 원본 본문의 `sha256=<hex HMAC>`. 비밀 키가 있을 때만 포함 |

### 페이로드 공통 구조

공통 구조는 같고 이벤트별로 `data`만 달라집니다.

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| 필드 | 유형 | 설명 |
|---|---|---|
| `event` | string | 이벤트 이름. [이벤트 설명](#이벤트-설명) 참고 |
| `delivery_id` | string | 전송별 고유한 32자리 16진수. 같은 이벤트를 받는 두 웹훅도 ID는 다름 |
| `created_at` | string | 전송 시각, ISO 8601(UTC) |
| `data` | object | 아래에 설명된 이벤트별 페이로드 |

### 서명 검증

비밀 키가 있으면 Poznote는 `X-Poznote-Signature-256: sha256=<signature>`를 보냅니다. 서명은 **원본 요청 본문**에 비밀 키를 적용한 HMAC-SHA256이며 GitHub 웹훅과 같은 방식입니다. JSON 해석 전에 원본 바이트로 검증하고 상수 시간 비교를 사용하세요.

```js
// Node.js
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader
    && expected.length === signatureHeader.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

```python
# Python
import hashlib, hmac

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
```

유효한 서명이 없으면 거부하세요. URL을 아는 사람은 누구나 가짜 이벤트를 POST로 보낼 수 있습니다.

### 전송 보장 범위

- 전송은 **최선 노력 방식의 동기 처리**이며 연결과 응답에 5초 제한을 둡니다. 느리거나 실패하는 엔드포인트가 가입·노트 생성 같은 원래 작업을 실패시키지는 않습니다.
- **2xx** 응답은 성공으로 처리합니다. 리디렉션은 **따라가지 않습니다**.
- 인스턴스 이벤트와 `note.created`, `note.shared`의 실패는 **재시도하지 않습니다**.
- **알림 이벤트는 예외**이며 *최소 한 번* 전달합니다. 모든 구독 엔드포인트가 수락해야 발송 완료로 표시하며, 아니면 백그라운드 작업자가 전체 이벤트를 5분 간격으로 최대 5회 시도합니다. 정상 엔드포인트도 중복을 받을 수 있으므로 `data.reminder.id`로 중복을 제거하세요.
- 첫 알림 웹훅 등록 전에 이미 시간이 지난 알림은 건너뛰어 과거 알림이 한꺼번에 전송되지 않습니다.

## 노트 직접 링크(인스턴스 URL)

노트를 참조하는 페이로드는 `data.note.url`에 다음 형태의 직접 링크를 포함할 수 있습니다.

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

링크는 **설정 > 관리 도구 > 관리자 웹훅**의 **인스턴스 URL**에서 지정한 공개 주소로 만듭니다(관리자 전용). 알림 이메일과 같은 값을 사용하므로 한쪽에서 설정하면 둘 다 적용됩니다. REST API의 `smtp_app_url` 설정이나 대체값인 `POZNOTE_APP_URL` 또는 `APP_URL` 환경 변수로도 설정할 수 있습니다.

인스턴스 URL이 없으면 `data.note.url`은 `null`이며 링크를 포함하지 않습니다.

## 공통 페이로드 객체

### data.user 객체

인스턴스 이벤트는 관련 계정을 `user` 객체로 설명합니다.

```json
{
  "user": {
    "id": 7,
    "username": "nina",
    "email": "nina@example.com",
    "first_name": "Nina",
    "last_name": "Martin",
    "source": "admin"
  }
}
```

| 필드 | 유형 | 설명 |
|---|---|---|
| `id` | integer | Poznote 사용자 ID |
| `username` | string | 로그인 사용자 이름 |
| `email` | string or null | 이메일 주소. 없으면 `null` |
| `first_name` | string | 이름. 빈 값 가능 |
| `last_name` | string | 성. 빈 값 가능 |
| `source` | string | 이벤트 발생 주체. `user.*`에 포함되며 한도 이벤트에는 없음. `admin`(관리자 UI), `api`(REST API), `oidc`(SSO 로그인·자동 생성), `self`(본인 계정 작업) |

사용자 객체에는 비밀번호, 비밀번호 해시, OIDC 토큰이 포함되지 않습니다.

### data.note 객체

사용자 이벤트는 관련 노트를 `note` 객체로 설명합니다. 필드는 이벤트에 따라 다르며 아래 각 예시에서 확인할 수 있습니다.

| 필드 | 유형 | 설명 |
|---|---|---|
| `id` | integer | [REST API](API-REST.md)에서 사용하는 노트 ID(`GET /api/v1/notes/{id}`) |
| `heading` | string | 노트 제목 |
| `type` | string | `note`(HTML) 또는 `markdown` |
| `workspace` | string | 노트가 속한 작업 공간 |
| `folder` | string | 노트가 속한 폴더 |
| `created` | string | 생성 시각 |
| `url` | string or null | 직접 링크. [인스턴스 URL](#노트-직접-링크인스턴스-url)이 없으면 `null` |

**노트 본문은 전송하지 않으며** 메타데이터만 보냅니다.

## 이벤트 설명

### 인스턴스 이벤트

**설정 > 관리 도구 > 관리자 웹훅**에서 관리하며 구독한 모든 관리자 웹훅에 전달합니다.

#### user.created

관리자, REST API 또는 SSO 자동 가입으로 계정이 생성되었습니다.

```json
{
  "event": "user.created",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "user": {
      "id": 7,
      "username": "nina",
      "email": "nina@example.com",
      "first_name": "Nina",
      "last_name": "Martin",
      "language": "fr",
      "source": "oidc"
    }
  }
}
```

`data.user.source`는 `admin`, `api`, `oidc`입니다.

`data.user.language`는 저장된 UI 언어 코드이며,
계정에 언어 설정이 없으면 `en`을 사용합니다.

#### user.updated

사용자 이름, 이메일, 이름, 성, 관리자 역할이 변경되었습니다. 실제 변경이 없으면 발생하지 않습니다.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| 필드 | 설명 |
|---|---|
| `data.user` | 변경 **후** 프로필 |
| `data.changed_fields` | 변경 필드 배열: `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source`는 `admin`, `api`, `oidc`, `self`입니다.

#### settings.language_changed

설정 또는 REST API `PUT /api/v1/settings/language`에서 UI 언어를 명시적으로 변경했습니다. 로그인 시 브라우저 언어 자동 적용만으로는 발생하지 않지만 시작 안내에서 감지된 언어를 확정하면 발생합니다. 시작 안내 밖에서는 기존 언어를 다시 선택해도 발생하지 않습니다. 구독한 모든 관리자 웹훅에 전달됩니다.

```json
{
  "data": {
    "user": {
      "id": 7,
      "username": "nina",
      "email": "nina@example.com",
      "first_name": "Nina",
      "last_name": "Martin"
    },
    "language": "fr",
    "previous_language": "en",
    "source": "ui"
  }
}
```

| 필드 | 설명 |
|---|---|
| `data.user` | 언어를 변경한 계정의 프로필 |
| `data.language` | 새 UI 언어 코드(`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | 변경 전 언어. 저장된 값이 없으면 `null` |
| `data.source` | `ui`(웹 화면) 또는 `api`(Basic·Bearer 인증 REST API 클라이언트) |

#### user.activated / user.deactivated

계정이 재활성화되거나 로그인할 수 없도록 비활성화되었습니다. 활성 상태와 다른 필드가 함께 변경되면 활성 상태에는 `user.activated`/`user.deactivated`, 나머지에는 별도 `user.updated`를 발생시킵니다.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

계정이 삭제되었습니다. 페이로드는 **삭제 전** 프로필을 포함합니다. `data.user.source`는 `admin`, `api`, `self`(본인 계정 삭제)입니다.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

인스턴스 최대 사용자 수에 도달해 SSO 가입을 거부했습니다. 운영자는 거절된 가입을 실시간으로 알 수 있습니다.

```json
{
  "data": {
    "max_users": 10,
    "attempted": {
      "username": "newcomer",
      "email": "newcomer@example.com"
    }
  }
}
```

| 필드 | 설명 |
|---|---|
| `data.max_users` | 설정한 사용자 수 한도 |
| `data.attempted.username` | 거부된 가입의 사용자 이름. 알 수 없으면 `null` |
| `data.attempted.email` | 거부된 가입의 이메일. 알 수 없으면 `null` |

#### quota.notes_reached

계정이 노트 수 한도(휴지통 포함)에 도달해 작업을 차단했습니다.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin" },
    "quota": {
      "max_notes": 500,
      "note_count": 500
    }
  }
}
```

#### quota.storage_reached

계정이 저장 공간 한도에 도달해 본문 쓰기나 첨부 파일 업로드를 차단했습니다.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin" },
    "quota": {
      "max_storage_bytes": 1073741824,
      "used_bytes": 1073700000,
      "requested_bytes": 250000
    }
  }
}
```

| 필드 | 설명 |
|---|---|
| `data.quota.max_storage_bytes` | 설정한 바이트 한도 |
| `data.quota.used_bytes` | 현재 사용 바이트 |
| `data.quota.requested_bytes` | 거부된 쓰기 크기 |
| `data.quota.pool` | 로컬 저장 공간 대신 S3 첨부 한도에 걸렸을 때만 `"s3"`로 포함 |

> **빈도 제한:** 한도 이벤트는 사용자·이벤트 종류별 시간당 최대 한 번 전송합니다. 반복해서 한도에 도달해도 엔드포인트에 요청이 몰리지 않습니다. 한도 이벤트의 `data.user`에는 `source`가 없습니다.

### 사용자 이벤트

**설정 > 사용자 웹훅**에서 관리하며 이벤트를 발생시킨 계정의 엔드포인트에만 전달합니다. 따라서 `user` 객체를 포함하지 않습니다. 엔드포인트 자체가 계정 소속이며 노트 ID가 대상을 식별합니다.

관리자는 **설정 > 관리 도구 > 사용자 기능 제한**의 **사용자 웹훅** 옵션으로 일반 사용자에게 차단할 수 있습니다. 차단하면 페이지 접근과 이벤트 전송이 모두 중지되며 관리자는 영향을 받지 않습니다.

#### note.created

웹 화면이나 REST API로 계정에 노트를 생성했습니다.

```json
{
  "event": "note.created",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "type": "markdown",
      "workspace": "Poznote",
      "folder": "Work",
      "created": "2026-08-09 12:34:56",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "source": "ui"
  }
}
```

`data.source`는 `ui`(웹 화면) 또는 `api`(Basic·Bearer 인증 REST API 클라이언트)입니다.

#### note.shared

계정의 노트에 공개 공유 링크를 발행했습니다.

```json
{
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "workspace": "Poznote",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "share": {
      "token": "d41d8cd98f00b204e9800998ecf8427e",
      "url": "https://poznote.example.com/share/d41d8cd98f00b204e9800998ecf8427e",
      "has_password": false,
      "updated": false
    }
  }
}
```

| 필드 | 설명 |
|---|---|
| `data.share.token` | 공개 공유 토큰 |
| `data.share.url` | 공개 공유 URL |
| `data.share.has_password` | 비밀번호 보호 여부 |
| `data.share.updated` | 최초 공유는 `false`, 이미 공유한 노트의 링크 재생성은 `true` |

#### reminder.due / reminder.due_title / reminder.due_minimal

노트 알림의 실행 시각에 도달했습니다. 이메일과 독립적으로 백그라운드 알림 작업자가 발생시키므로 SMTP가 없어도 작동합니다.

인스턴스 밖으로 보낼 데이터 양에 맞게 다음 세 가지 중 구독하세요.

**`reminder.due`**: 전체 페이로드. 노트 제목과 알림 메시지 포함

```json
{
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "workspace": "Poznote",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "reminder": {
      "id": 17,
      "message": "Prepare the agenda",
      "trigger_at": "2026-08-09 14:00:00"
    }
  }
}
```

**`reminder.due_title`**: 같은 조건이지만 알림 메시지 제외

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**: 식별자만 전송하며 노트 내용은 보내지 않습니다. 필요하면 수신자가 [REST API](API-REST.md)로 상세 정보를 조회할 수 있습니다.

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **최소 한 번 전송:** 모든 엔드포인트가 수락할 때까지 5분 간격으로 최대 5회 시도하므로 같은 알림을 여러 번 받을 수 있습니다. `data.reminder.id`로 중복을 제거하세요.

### 테스트 ping

웹훅 페이지의 **테스트** 버튼은 선택한 엔드포인트에 `ping`을 보내고 HTTP 결과를 표시합니다. 실제 이벤트와 같은 공통 구조와 서명 규칙을 사용합니다.

```json
{
  "event": "ping",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "message": "Poznote webhook test"
  }
}
```

## 개인정보와 보안

- **노트 본문은 인스턴스 밖으로 보내지 않습니다.** 페이로드는 ID, 제목, 작업 공간, 폴더, 시각 등 메타데이터만 포함합니다. 제목도 보내지 않으려면 `reminder.due_minimal`을 사용하세요.
- **인증 정보 미포함.** 사용자 객체에 비밀번호, 해시, 토큰이 없습니다.
- **엄격한 계정별 범위.** 사용자 이벤트는 발생시킨 계정의 엔드포인트에만 전송합니다.
- **발신자 인증.** 비밀 키를 설정하고 매 요청의 `X-Poznote-Signature-256`을 검증하세요. 엔드포인트 URL 자체는 공개 정보로 취급해야 합니다.
- **사용자 기능 제한.** “사용자 웹훅” 제한은 일반 사용자의 메타데이터 외부 전송을 막으며 UI와 실제 전송 단계에 모두 적용됩니다.
- 실패한 전송은 엔드포인트 URL과 실패 상태를 PHP 오류 로그에 기록합니다.

## 수신 서버 예시

서명을 검증하고 이벤트에 반응하는 최소 Node.js 수신 서버입니다.

```js
const crypto = require('crypto');
const http = require('http');

const SECRET = process.env.POZNOTE_WEBHOOK_SECRET;

http.createServer((req, res) => {
  let chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const sig = req.headers['x-poznote-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.writeHead(401).end();
      return;
    }

    const payload = JSON.parse(raw.toString());
    switch (payload.event) {
      case 'note.created':
        console.log(`New note #${payload.data.note.id}: ${payload.data.note.heading}`);
        break;
      case 'reminder.due':
        console.log(`Reminder: ${payload.data.reminder.message} (note ${payload.data.note.id})`);
        break;
    }

    res.writeHead(200).end('ok');
  });
}).listen(9099);
```

동일한 비밀 키로 `http://your-host:9099/`에 웹훅을 등록하고 **테스트**를 누르면 `ping` 전송을 확인할 수 있습니다.
