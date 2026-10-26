<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a> ·
  <b>한국어</b>
</p>
<!-- /lang-selector -->

# Poznote MCP 서버

Poznote용 MCP(Model Context Protocol) 서버입니다. 자연어로 AI를 통해 노트를 관리할 수 있습니다.

이 서버는 **HTTP 전송만** 지원합니다(MCP Streamable HTTP).

> [!TIP]
> Poznote 안에서 Ollama 같은 로컬 모델과 직접 채팅하려면 MCP 서버가 필요하지 않습니다. 내장 [AI 어시스턴트](AI-ASSISTANT.ko.md)를 사용하세요(**설정 > 관리자 도구 > AI 어시스턴트**). MCP 서버는 MCP를 지원하는 *외부* 어시스턴트를 노트에 연결하는 용도입니다. Ollama 자체는 모델 실행 환경이며 MCP 클라이언트가 아니므로 직접 연결할 수 없습니다.

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

## 빠른 시작

사용할 AI 어시스턴트를 선택하세요.

- **[VS Code Copilot](VSCODE-COPILOT.ko.md):** 편집기에 Poznote 연결
- **[Claude CLI](CLAUDE-CLI.ko.md):** 명령줄에서 Poznote 사용

---

## 동작 방식

MCP 서버는 AI 어시스턴트와 Poznote 인스턴스를 연결합니다.

### 구성 요소

- **`server.py`**: MCP 서버(HTTP / Streamable HTTP)
  - `http://127.0.0.1:8045/mcp`에 MCP 엔드포인트 제공
  - 노트 관리 도구(작업) 정의
  - AI와 Poznote API 사이의 호출 조정

- **`client.py`**: Poznote REST API용 HTTP 클라이언트
  - HTTP 요청 수행(GET, POST, PATCH, DELETE)
  - 공유 MCP 서비스 토큰으로 Poznote API 인증 처리

### 통신 흐름

1. AI 어시스턴트(VS Code Copilot 또는 Claude CLI)가 MCP 서버에 연결
2. MCP 서버가 Poznote REST API 호출
3. 결과를 AI 어시스턴트에 반환

브라우저에 열린 Poznote 탭은 MCP를 통한 변경을 몇 초 안에 반영합니다. 사이드바 트리와 열린 노트가 자동 갱신되며, 저장하지 않은 편집 내용이 있으면 다시 불러오기 안내가 표시됩니다. 단순히 브라우저에 열려 있는 노트는 MCP 쓰기를 막지 않습니다. 같은 계정의 다른 사용자나 공개 공유 링크의 방문자가 편집 중인 노트만 HTTP 423 오류를 반환합니다.

## 기능

### 도구(작업)
- `get_note`: ID로 특정 노트의 전체 본문 조회
- `list_notes`: 작업 공간의 노트를 페이지 단위로 조회(`limit`/`offset`, 결과에 실제 전체 개수인 `total` 포함)
- `search_notes`: 텍스트로 노트 검색. 생성 날짜 범위 지정 가능
- `create_note`: 새 노트 생성. 템플릿, 마감일, 알림 지정 가능
- `update_note`: 기존 노트 수정·이동 및 마감일·알림 설정
- `delete_note`: ID로 노트 삭제
- `get_reminder`: 노트에 설정된 알림 조회
- `set_reminder`: 노트 알림 설정 또는 교체. 반복 간격 지정 가능
- `remove_reminder`: 노트 알림 제거
- `list_reminders`: 이미 발생했으며 아직 확인하지 않은 알림 조회(UI의 종 모양 알림 목록). 예정된 알림은 조회 불가
- `list_tasks`: 할 일 목록 노트의 할 일과 ID·마감일·상태 조회
- `list_all_tasks`: 작업 공간 전체 노트의 미완료 할 일을 급한 순서로 조회. 마감일·중요·완료·노트 내 체크리스트 필터 지원
- `add_task`: 할 일 목록 노트에 할 일 하나 추가. 마감일·알림 지정 가능
- `update_task`: 할 일 하나 수정(내용, 마감일, 알림, 중요 표시)
- `complete_task`: 할 일 완료 또는 완료 취소
- `delete_task`: 할 일 목록 노트에서 할 일 하나 삭제
- `add_subtask`: 할 일 아래에 하위 할 일 추가
- `update_subtask`: 하위 할 일 이름 변경 또는 완료·완료 취소
- `delete_subtask`: 하위 할 일 하나 삭제
- `create_folder`: 이름이나 경로로 폴더 생성(`folder_path="Projects/2026/Q3"`는 전체 경로를 한 번에 생성). `is_diary=true`로 일기 루트 생성 가능
- `list_folders`: 작업 공간의 모든 폴더와 경로·일기 표시 조회
- `list_workspaces`: 사용 가능한 모든 작업 공간 조회
- `list_tags`: 노트에서 사용하는 고유 태그 전체 조회
- `list_templates`: `create_note`의 `from_template_id`로 사용할 템플릿 노트 조회
- `get_trash`: 휴지통의 모든 노트 조회
- `empty_trash`: 휴지통의 모든 노트 영구 삭제
- `delete_trash_note`: 휴지통 전체 대신 노트 하나 영구 삭제
- `restore_note`: 휴지통에서 노트 복원
- `list_snapshots`: AI 또는 MCP 재작성 전에 생성한 편집 보호 스냅샷을 포함해 노트의 이전 버전 조회
- `get_snapshot`: 노트를 변경하지 않고 이전 버전 하나의 내용 읽기
- `restore_snapshot`: 노트를 스냅샷 버전으로 되돌리기(`snapshot_key` 또는 `date` 필요)
- `duplicate_note`: 기존 노트 복제
- `toggle_favorite`: 노트의 즐겨찾기 상태 전환
- `list_attachments`: 특정 노트의 모든 첨부 파일 조회
- `add_attachment`: Base64 내용으로 파일 첨부(이미지, 로그, PDF 등)
- `move_note`: ID를 유지하며 노트를 다른 작업 공간 또는 폴더로 이동
- `move_folder`: 하위 폴더와 노트를 포함해 폴더를 다른 부모 폴더 또는 작업 공간으로 이동
- `move_note_to_folder`: 노트를 특정 폴더로 이동
- `remove_note_from_folder`: 현재 폴더에서 노트를 꺼내 루트로 이동
- `share_note`: 노트 공개 공유 활성화 및 공개 URL 조회
- `unshare_note`: 노트 공개 공유 비활성화
- `get_note_share_status`: 노트의 현재 공유 상태와 공개 URL 조회
- `get_folder_share_status`: 폴더의 현재 공유 상태와 공개 URL 조회
- `list_shared`: 공개 공유된 모든 노트와 폴더 조회
- `list_shared_with_me`: 다른 사용자가 이 프로필에 공유한 노트와 폴더 조회
- `get_backlinks`: 특정 노트로 연결되는 모든 노트 조회
- `convert_note`: HTML과 마크다운 간 노트 변환
- `rename_folder`: 기존 폴더 이름 변경
- `delete_folder`: 폴더 삭제 및 포함된 노트를 휴지통으로 이동
- `create_workspace`: 새 작업 공간 생성
- `rename_workspace`: 기존 작업 공간 이름 변경
- `delete_workspace`: 작업 공간 삭제(마지막 작업 공간은 삭제 불가)
- `get_git_sync_status`: 현재 Git 동기화 상태 조회(GitHub/GitLab/Forgejo)
- `git_push`: 설정한 Git 저장소로 로컬 노트 강제 푸시
- `git_pull`: 설정한 Git 저장소에서 노트 강제 가져오기
- `get_system_info`: Poznote 설치 버전 정보 조회
- `list_backups`: 사용 가능한 모든 시스템 백업 조회
- `create_backup`: 새 시스템 백업 생성
- `restore_backup`: 백업 파일 복원(현재 사용자 데이터 교체)
- `delete_backup`: 특정 백업 파일 삭제
- `get_app_setting`: 특정 앱 설정값 조회
- `update_app_setting`: 특정 앱 설정값 변경

**호출의 대상 작업 공간.** `create_note`, `create_folder`, `list_folders`에서는 항상 `workspace`를 지정하세요. 폴더는 작업 공간 하나에 속하므로 이를 지정해야 대상이 확실합니다. 생략하면 서버는 추측하지 않고 정해진 순서로 결정합니다. 존재하는 작업 공간을 가리키는 `mcp_default_workspace` 설정을 먼저 사용하고, 그렇지 않으면 계정에 작업 공간이 하나뿐일 때 그 공간을 사용합니다. 작업 공간이 여러 개이고 기본값이 없으면 호출을 거부하고 목록을 반환합니다. 정렬상 첫 번째 공간에 임의로 저장하지 않습니다. 과거에는 보관 기능이 “Archives”를 처음 만들 때 대상이 바뀌는 일이 있었습니다. `update_app_setting("mcp_default_workspace", "<name>")`으로 기본값을 설정하세요.

**첨부 파일.** `add_attachment(note_id, filename, content_base64)`는 웹 UI에 끌어다 놓는 것과 같은 방식으로 파일을 첨부합니다. 사람이 직접 조작하지 않아도 생성한 차트나 로그를 첨부할 수 있으며 `data:` URI도 지원합니다. 실행 파일 제한이나 저장 공간 한도 등 Poznote의 규칙은 그대로 적용되며, 거부되면 이유가 반환됩니다. 파일 내용이 도구 호출 안에서 Base64로 전달되므로 업로드는 25 MB로 제한됩니다. 더 큰 파일은 웹 UI를 사용하세요.

**이동.** `move_note`와 `move_folder`는 복사가 아닌 이동입니다. ID, 본문, 이력, 노트를 가리키는 링크가 유지됩니다. `update_note`의 `workspace`는 노트를 *찾을 위치*이며 실제 이동 대상은 `target_workspace`입니다. 다른 작업 공간으로 옮기면서 대상 폴더를 지정하지 않으면 새 작업 공간의 루트에 놓입니다. 기존 폴더는 이전 작업 공간 소속이기 때문입니다. 폴더를 옮기면 하위 폴더와 포함된 모든 노트도 함께 이동합니다.

**폴더.** 폴더를 받는 모든 도구는 이름 또는 슬래시로 구분된 경로를 받습니다. `create_note(folder="Diary/2026/08")`는 경로 중 없는 폴더를 생성하고, `create_folder(folder_path=…)`도 같습니다. `list_notes(folder_id=…)`는 서버에서 폴더 하나로 범위를 제한하며 `total`도 해당 폴더만 셉니다. 같은 이름의 폴더가 작업 공간에 하나뿐이면 깊이에 관계없이 기존 폴더를 사용합니다. 루트에 중복 생성하지 않습니다. 여러 폴더가 같은 이름을 쓰면 호출을 거부하고 목록을 반환하므로 전체 경로나 ID를 지정하세요.

**일기.** 일기는 이름만 Diary인 폴더가 아니라 `is_diary` 표시가 있는 루트 폴더입니다. UI의 “새 일기 작성” 버튼은 해당 루트에 날짜별 노트를 저장합니다. `create_folder(folder_name="Journal", is_diary=true)`로 만들고 `list_folders`로 일기 폴더를 확인할 수 있습니다. 기존 루트 폴더 이름을 전달하면 노트를 유지하며 해당 폴더를 일기로 바꿉니다. 일기 항목은 일반 노트이므로 `create_note(folder="Journal/2026/09")`로 저장하세요.

**템플릿.** 템플릿은 `Templates` 폴더(모든 하위 경로 포함) 또는 같은 이름의 작업 공간에 보관한 일반 노트입니다. 각 지원 언어의 이름도 인식하므로 `Modèles` 폴더도 사용할 수 있습니다. `list_templates`는 ID를 포함해 템플릿을 반환합니다. `create_note(from_template_id=…)`는 템플릿 형식으로 새 노트를 시작합니다. `note_type="markdown"`을 지정하면 편집기의 `/template` 명령처럼 HTML 템플릿을 변환합니다. 템플릿으로 할 일 목록이나 그림을 시작할 수는 없습니다. `content`도 전달하면 템플릿 본문 뒤에 추가됩니다.

**알림과 할 일.** `create_note`/`update_note`와 `set_reminder`의 `reminder_at`은 `2026-09-01T09:00:00+02:00` 같은 ISO 날짜·시간입니다. 오프셋을 포함하지 않으면 UTC로 해석합니다. 할 일 마감일인 `due_at`은 다릅니다. 오프셋 없는 `YYYY-MM-DD` 또는 `YYYY-MM-DDTHH:MM` 형태의 현지 시간으로 사용자 시간대에 따라 해석합니다. 시간 없는 날짜는 09:00에 알립니다. 반복 간격은 `<count><unit>` 형식이며 단위는 `i`/`h`/`d`/`w`/`m`/`y`입니다(예: `30i`, `1d`, `2w`).

할 일 도구는 한 번에 하나를 다룹니다. `list_tasks`로 ID를 조회한 뒤 `add_task`, `update_task`, `complete_task`, `delete_task`를 호출하세요. 클라이언트가 전체 목록을 읽어 새 배열로 보내지 않으므로 서로 다른 할 일을 편집하는 두 호출이 상대 작업을 덮어쓰지 않습니다. 서버는 노트의 할 일을 하나의 JSON 배열로 저장하고 매 호출마다 다시 쓰므로 목록이 길수록 호출당 작업량은 늘어납니다. 알림은 자동으로 동기화되며 할 일을 완료하거나 삭제하면 대기 중인 알림도 제거됩니다. 하위 할 일은 한 단계만 지원합니다. `list_tasks`는 각 ID를 가진 `subtasks` 배열을 반환하며 `add_subtask`, `update_subtask`, `delete_subtask`로 하나씩 변경합니다. 하위 할 일에는 내용과 완료 표시만 있고, 완료해도 상위 할 일이 자동 완료되지 않습니다.

**버전 이력과 실행 취소.** AI 어시스턴트나 MCP 서버가 노트를 다시 작성하기 직전에 편집 보호 스냅샷을 만들므로 잘못된 `update_note`를 되돌릴 수 있습니다. `list_snapshots`는 각 스냅샷의 출처인 `origin`을 반환하며 보호 사본은 `ai` 또는 `mcp`로 식별됩니다. `get_snapshot`은 노트를 변경하지 않고 내용을 읽으며 `restore_snapshot`은 내용을 복원합니다. `restore_snapshot`은 현재 내용을 덮어쓰므로 오늘의 스냅샷을 임의로 고르지 않으며 `snapshot_key` 또는 `date`를 요구합니다. 덮어쓰기 전에 현재 내용을 저장하지 않으므로 이미 스냅샷에 보관되어 있지 않다면 덮어쓴 내용은 사라집니다. Poznote 화면에서는 스냅샷을 수정 이력이라고 부르며 **수정 이력** 페이지에서 조회·비교할 수 있습니다. 따라서 수정 이력이나 버전 이력에 관한 요청은 이 도구에 대응합니다.

**여러 노트 조회.** `list_all_tasks`는 작업 공간 전체에서 “남은 할 일”을 조회하고 `list_tasks`는 노트 하나만 다룹니다. 반환 항목은 `source`로 구분합니다. 할 일 목록 노트의 항목 ID는 `update_task`와 `delete_task`에 사용할 수 있지만, 일반 노트의 체크박스 ID는 노트 안의 위치일 뿐이므로 같은 방식으로 변경할 수 없습니다. `list_reminders`는 발생했지만 아직 해제하지 않은 알림을 API 한도인 50개까지 반환합니다. 앞으로 발생할 알림을 보여주는 기능이 아닙니다. 예정된 알림의 목록 엔드포인트는 없으며 `get_reminder`로 노트별 조회해야 합니다.

대부분의 도구는 선택적 `user_id`로 특정 사용자 프로필을 지정합니다. 지정하면 해당 요청에 `X-User-ID` 헤더를 보내며 MCP의 전역 환경을 변경하지 않고 다른 프로필의 노트를 생성·조회할 수 있습니다. 시스템 도구인 `get_system_info`, `list_backups`, `create_backup`, `delete_backup`에는 `user_id`가 없습니다. 생략 시 기본 프로필 변경은 [기본 사용자 프로필](#기본-사용자-프로필)을 참고하세요.

---

## 서버 설치

MCP 서버는 공식 Poznote `docker-compose.yml`에 포함되어 자동으로 실행됩니다.

### 설정

MCP 서버는 `docker-compose.yml`의 기본값을 사용합니다.

```bash
# MCP 서버 기본 포트: 8045
# 디버그 로그 기본값: false
```

Poznote는 `data/.mcp_token`에 MCP 서비스 토큰을 자동 생성합니다. `mcp-server` 컨테이너는 공유 볼륨 `./data:/var/www/html/data:ro`에서 읽으므로 `.env`에 비밀번호를 보관할 필요가 없습니다.

한 번의 실행에서 포트와 디버그 설정을 변경하려면 환경 변수를 명령에 지정해 MCP 컨테이너를 재생성하세요.

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

`docker compose restart mcp-server`만으로는 변경된 환경 변수를 다시 읽지 않습니다.

#### 용도별 모드 선택

MCP 서버는 세 가지 방식 중 하나로 클라이언트를 식별합니다. 이들을 구분하는 기준은 **요청이 어떤 Poznote 계정에 작용할지 누가 정하는가**입니다.

| 상황 | 모드 | 계정을 정하는 주체 |
|---|---|---|
| 혼자서 같은 컴퓨터의 클라이언트로 사용(VS Code, Claude CLI) | 클래식(기본값), 필요하면 [수신 연결 인증 토큰](#수신-연결-인증-토큰) 추가 | 서버 설정: `POZNOTE_USER_ID`(기본값은 프로필 `1`) 또는 요청이 `user_id`로 지정하는 모든 프로필 |
| 여러 사용자, 채팅 앱(ChatGPT, Claude, Gemini), 또는 공개 서버에 접속하는 VS Code / Claude Code | [채팅 앱에서 로그인](#채팅-앱에서-로그인chatgpt-claude-gemini)(`POZNOTE_MCP_AUTH_PROVIDER=poznote`) | 로그인한 사람: 항상 본인 계정 |
| ID 공급자(Keycloak, Authentik 등)의 토큰을 이미 가진 에이전트 | [호출자별 인증](#호출자별-인증선택-사항)(`userinfo` 또는 `introspection`) | 토큰의 ID에 연결된 프로필 |

여러 사람이 MCP 서버 하나를 함께 쓴다면 두 번째 모드를 사용하세요. 클래식 모드에서는 모든 클라이언트가 모든 계정에 접근할 수 있습니다.

#### 기본 사용자 프로필

기본적으로 사용자 프로필 `1`(첫 관리자)로 동작합니다. 다른 프로필을 기본값으로 쓰려면 컨테이너 시작 시 `POZNOTE_USER_ID`를 설정하세요.

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

명시적 `user_id`가 없는 도구 호출은 모두 해당 프로필에 적용됩니다. 요청에 `user_id`가 있으면 그 값이 우선합니다. 기본값은 숫자 프로필 ID여야 하며 다른 값은 MCP 로그에 경고를 남기고 무시되어 `1`을 사용합니다.

#### 수신 연결 인증 토큰

기본적으로 MCP 엔드포인트는 접근 가능한 모든 클라이언트를 허용합니다. 포트가 `127.0.0.1`에만 공개되어 있어 안전합니다. 리버스 프록시, LAN, 직접 설치 등으로 접근 범위를 넓히면 `POZNOTE_MCP_AUTH_TOKEN`을 설정하세요. 모든 요청에 `Authorization: Bearer <token>` 헤더를 요구하며 없으면 `401 Unauthorized`를 반환합니다.

```bash
# 강력한 토큰을 한 번 생성
openssl rand -hex 32

# .env에 입력
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# 새 환경 설정을 적용하도록 MCP 컨테이너 재생성
docker compose up -d --force-recreate mcp-server
```

클라이언트 설정에도 동일한 헤더를 추가하세요. [VS Code Copilot](VSCODE-COPILOT.ko.md#인증-토큰-사용)과 [Claude CLI](CLAUDE-CLI.ko.md#인증-토큰-사용)를 참고하세요. 앞뒤 공백은 무시하므로 비밀 파일에서 읽은 토큰에 끝 줄바꿈이 있어도 작동합니다. 빈 값이면 엔드포인트를 개방 상태로 둡니다. 시작 로그에 현재 모드가 표시됩니다.

이 토큰은 `data/.mcp_token`과 별개입니다. 파일의 토큰은 MCP 서버가 *Poznote API에* 접속할 때 사용하며, 이 설정값은 *AI 어시스턴트*가 MCP 서버에 제시하는 토큰입니다.

#### 채팅 앱에서 로그인(ChatGPT, Claude, Gemini)

ChatGPT(및 Codex 앱), Claude Desktop과 claude.ai, Gemini처럼 원격 MCP 서버에 연결하는 채팅 앱은 토큰을 붙여 넣는 방식을 지원하지 않습니다. 대신 서버가 OAuth 로그인 과정으로 안내해 주기를 기대합니다. `POZNOTE_MCP_AUTH_PROVIDER=poznote`를 설정하면 Poznote가 직접 이 역할을 맡습니다.

1. 앱에서 `https://mcp.example.com/mcp`를 커넥터로 추가하고, 클라이언트 ID와 시크릿 입력란이 있으면 비워 둡니다. 앱이 스스로 등록합니다. 앱은 이 항목을 설정에 두며 보통 사용자 지정 커넥터 또는 원격 MCP 서버라고 부릅니다. 일부 앱은 특정 요금제나 개발자 모드에서만 제공합니다.
2. 앱이 Poznote 로그인 페이지를 엽니다. 평소처럼 로그인합니다(비밀번호, 2단계 인증 또는 SSO).
3. 동의 페이지에 앱 이름, 돌아갈 주소, 앱이 사용할 계정이 표시됩니다. 이 계정은 항상 본인 계정이며, 접근 권한을 받은 다른 계정은 해당되지 않습니다. 그리고 접근 수준을 선택할 수 있습니다. 접근 수준은 **읽기 전용**, **읽기 및 편집**, **전체 접근**이며, 세 가지 [도구 범위](#도구-범위) 수준에 해당합니다.
4. **허용**을 클릭하면 앱은 해당 계정에만, 해당 수준으로만 접근합니다.

따라서 MCP 서버 하나로 인스턴스 전체를 지원하며, 각 사용자는 자신의 노트(및 자신과 공유된 작업 공간)에만 접근합니다. **설정 > 내 계정 > 연결된 앱**에서 연결 목록을 보고 원하는 연결을 해제할 수 있으며, 앱에 붙여 넣을 커넥터 주소도 모든 사용자에게 표시됩니다.

요구 사항은 다음과 같습니다.

- 채팅 앱은 인터넷을 통해 연결하므로(ChatGPT와 claude.ai는 자체 서버에서 연결), MCP 서버와 Poznote 모두 그 앱에서 **HTTPS**로 접근할 수 있어야 합니다. MCP 서버는 리버스 프록시 뒤 **별도의 (하위) 도메인**에 두세요. 예를 들어 `https://mcp.example.com`을 사용합니다. OAuth 검색 문서는 이 주소의 루트에서 제공됩니다. 프록시가 트래픽을 보낼 곳은 프록시가 실행되는 위치에 따라 다릅니다.
  - 서버에 직접 설치한 경우: `127.0.0.1:8045`(`docker-compose.yml`이 공개하는 포트, `POZNOTE_MCP_PORT`)로 프록시합니다.
  - 프록시 자체가 Docker에서 실행되는 경우(Nginx Proxy Manager, Traefik, Caddy 등): `127.0.0.1`은 프록시 자신의 컨테이너를 가리키게 됩니다. `docker network connect poznote_default <proxy-container>`로 프록시를 Poznote의 Docker 네트워크에 연결하고(네트워크 이름은 `docker-compose.yml`이 있는 폴더 이름을 따르며 `docker network ls`로 확인할 수 있습니다), `mcp-server:8045`로 프록시합니다.
- Poznote 자체의 `/oauth/` 페이지는 앞단에 별도 로그인 없이 접근할 수 있어야 합니다(프록시에 설정한 Authelia, Authentik 같은 포워드 인증). 앱은 그중 일부를 자체 서버에서 호출하며, 로그인 페이지를 보여 줄 브라우저가 없습니다.
- `.env`에 변수 두 개를 설정한 뒤 컨테이너를 재생성하세요(`docker compose up -d --force-recreate mcp-server`). 이전 버전의 `docker-compose.yml`은 이 변수를 컨테이너에 전달하지 않으므로 먼저 최신 버전을 내려받으세요. 그러면 시작 시 MCP 로그에 `OAuth sign-in through Poznote enabled`가 표시됩니다.

```bash
POZNOTE_MCP_AUTH_PROVIDER=poznote
# MCP 서버 공개 URL(/mcp 제외)
POZNOTE_MCP_PUBLIC_URL=https://mcp.example.com
```

- 사용자가 로그인하는 Poznote 공개 URL은 **설정 > 관리자 도구 > 관리자 웹훅**의 **인스턴스 URL**이며, 알림 이메일과 웹훅이 사용하는 URL입니다(비어 있는 동안에는 `.env`의 `POZNOTE_APP_URL`). 둘 다 설정되지 않았다면 관리자의 브라우저에서 자동으로 채워지므로, 인터넷에서 Poznote에 접속하는 주소가 맞는지 확인하세요. 변경 내용은 재시작 없이 1분 이내에 MCP 서버에 반영됩니다. 관리자는 **연결된 앱** 창에서 사용 중인 주소를 볼 수 있으며, 로컬 주소나 일반 http 주소라면 경고가 표시됩니다.

작동하지 않는다면 다음을 확인하세요.

- **앱이 서버의 인증(OAuth) 설정을 찾을 수 없다고 표시합니다.** 네트워크 외부의 컴퓨터에서 `https://mcp.example.com/.well-known/oauth-protected-resource/mcp`와 `https://mcp.example.com/.well-known/oauth-authorization-server`를 열어 보세요. 둘 다 JSON으로 응답해야 합니다. 두 번째 주소가 `503`을 반환하면 Poznote 공개 URL이 설정되지 않은 것입니다. 아무 응답이 없다면 리버스 프록시가 MCP 서버에 도달하지 못하는 것입니다.
- **앱이 연 로그인 페이지가 로드되지 않습니다.** 앱이 인스턴스 URL에 접근할 수 없는 것입니다. **연결된 앱**의 경고를 확인하고 **관리자 웹훅 > 인스턴스 URL**에서 수정하세요.
- **시작 시 MCP 로그에 `OAuth sign-in through Poznote enabled`가 표시되지 않습니다.** 변수가 컨테이너에 전달되지 않는 것입니다. `.env`와 `docker-compose.yml`을 확인한 뒤 컨테이너를 재생성하세요(`restart`로는 부족합니다).
- **로그인은 되지만 이후 모든 요청이 실패합니다.** 커넥터 URL은 정확히 `POZNOTE_MCP_PUBLIC_URL` 뒤에 `/mcp`를 붙인 값이어야 합니다. 그렇지 않으면 MCP 로그에 `Rejecting a token issued for ...`가 표시됩니다.
- `docker compose logs mcp-server`에서 서버가 무엇을 왜 거부했는지 확인할 수 있습니다. `POZNOTE_DEBUG=true`를 설정하면 모든 요청도 기록됩니다.

모든 연결에 적용되는 규칙은 다음과 같습니다.

- 연결은 사용하는 동안 유지됩니다. 앱은 1시간마다 접근 권한을 갱신하며, 90일 동안 사용하지 않으면 다시 로그인해야 합니다. 연결을 해제한 앱도 최대 `POZNOTE_MCP_AUTH_CACHE_TTL`초(기본값 60) 동안 계속 작동할 수 있습니다.
- `POZNOTE_MCP_SCOPE`는 여전히 모든 연결의 상한입니다. `write`로 설정된 서버에 **전체 접근**으로 연결하면 `write`를 받습니다.
- 인스턴스 전체에 작용하는 도구(백업, 전역 설정, 시스템 정보)는 관리자 계정이 필요하며, 요청에서 `user_id`로 다른 계정을 지정할 수 없습니다.
- 연결된 앱은 계정 데이터가 전송되는 곳을 바꿀 수 없습니다. Git 동기화의 저장소, 서버, 토큰과 AI 어시스턴트 및 받아쓰기의 주소와 키가 이에 해당합니다. 사용자가 설정한 저장소로 푸시하고 그곳에서 풀하는 것은 계속 가능합니다.
- 이 모드가 켜져 있는 동안 `POZNOTE_MCP_AUTH_TOKEN`은 무시됩니다.

#### 호출자별 인증(선택 사항)

위의 `POZNOTE_MCP_AUTH_TOKEN`은 하나의 공유 비밀입니다. 모든 클라이언트가 같은
토큰을 제시하고, 서버는 단일 프로필로 동작합니다. 여러 사람이나 에이전트가 하나의
MCP 인스턴스를 공유하면 이를 구분할 수 없습니다.

`POZNOTE_MCP_AUTH_PROVIDER`를 설정하면 호출자별 인증으로 전환됩니다. 각
클라이언트가 **자신의** 토큰을 제시하고, 이 토큰은 외부 ID 공급자에서 확인되어 그
호출자의 Poznote 프로필에 매핑됩니다. 하나의 인스턴스, 여러 호출자, 각자 정확히
식별됩니다.

이 변수들은 다른 변수와 마찬가지로 `.env`에 설정합니다. 이 변수들은
`mcp-server` 서비스의 `environment:` 블록을 통해 MCP 컨테이너에 전달되는데, 이전
버전의 `docker-compose.yml`에는 이 항목이 없어 아무 경고 없이 무시됩니다. 이
변수를 설정한다면 먼저 최신 `docker-compose.yml`을 내려받고
([앱 업데이트](README.ko.md#앱-업데이트) 참고), 시작 시 MCP 로그에
`Per-caller authentication enabled`가 표시되는지 확인하세요.

| variable | default | meaning |
|---|---|---|
| `POZNOTE_MCP_AUTH_PROVIDER` | *(설정하지 않음, 기능 꺼짐)* | `userinfo` or `introspection` (`poznote` is described [above](#채팅-앱에서-로그인chatgpt-claude-gemini)) |
| `POZNOTE_MCP_AUTH_URL` | *(필수)* | provider endpoint |
| `POZNOTE_MCP_IDENTITY_MATCH` | `oidc_subject:sub` | ordered `<profile-field>:<claim>` pairs |
| `POZNOTE_MCP_AUTH_AUDIENCE` | *(설정하지 않음, 기능 꺼짐)* | expected `aud`, comma separated; refuses a token issued for another application |
| `POZNOTE_MCP_AUTH_HEADER` | `Authorization` | the header this server sends **to the provider** |
| `POZNOTE_MCP_AUTH_CLIENT_ID` / `_CLIENT_SECRET` | *(설정하지 않음, 기능 꺼짐)* | `introspection` only, sent as HTTP Basic |
| `POZNOTE_MCP_AUTH_TIMEOUT` | `5` | seconds |
| `POZNOTE_MCP_AUTH_CACHE_TTL` | `60` | seconds a resolved token/profile is cached |

`userinfo`는 호출자의 Bearer 토큰으로 `GET <url>`을 수행합니다. OpenID Connect
UserInfo 엔드포인트입니다. 토큰은 로컬에서 검증되지 않으므로 불투명 토큰도 JWT와
똑같이 동작하며, 관리할 JWKS나 키 교체 표면이 없습니다. `introspection`은
`token=<token>`으로 `POST <url>`을 수행합니다(RFC 7662). `active: false`를 담은
응답은 유효하지 않은 토큰입니다.

`POZNOTE_MCP_IDENTITY_MATCH`에서 존재하면서 **정확히 하나의 프로필과 일치하는**
첫 번째 클레임이 선택됩니다. 프로필 필드는 `GET /api/v1/admin/users`가 반환하는
것입니다. 기본값은 subject만 비교합니다. `preferred_username`이나 `email`로
비교하는 것도 가능하지만 더 약합니다. Poznote 자체 로그인은 이메일이 확인된
경우에만 비교하며, 사용자가 그 필드를 수정할 수 있는 공급자에서는 다른 프로필을
차지할 수 있기 때문입니다. 필요할 때만 명시적으로 켜십시오.

두 프로필과 일치하는 값은 모호하므로 거부되고, 어떤 프로필과도 일치하지 않는
ID는 그대로 거부됩니다. 기본값은 첫 번째 관리자인 프로필 1이므로 기본 프로필로
대체되지 않습니다. 비활성화된 프로필은 후보가 되지 않습니다.

활성화하기 전에 알아 두어야 할 두 가지 결과가 있습니다.

- **명시적인 `user_id` 인수는 확인된 프로필과 일치할 때만 허용됩니다.** 대부분의
  도구가 이 인수를 받으므로, 다른 프로필을 지정한 값은 따르지 않고 거부합니다.
- **`user_id`를 받지 않는 도구**(`get_system_info`, `list_backups`,
  `create_backup`, `delete_backup`)는 서버의 기본 프로필로 동작하므로, 확인된
  프로필이 관리자인 호출자로 제한됩니다.

`POZNOTE_MCP_AUTH_PROVIDER`가 설정되면 `POZNOTE_MCP_AUTH_TOKEN`보다 우선하며,
그 토큰이 여전히 설정되어 있으면 서버가 경고를 기록합니다.

#### 도구 범위

기본적으로 서버는 모든 도구를 공개합니다. `POZNOTE_MCP_SCOPE`로 세 가지 수준 중 하나로 제한할 수 있습니다. 노트 내용이 에이전트를 절대 호출해서는 안 되는 도구로 유도할 수 있으므로, 무인으로 실행되는 에이전트에 유용합니다.

| 수준 | 도구 |
|---|---|
| `read` | 아무것도 변경하지 않는 도구만: 조회, 목록, 검색, 백링크, 수정 이력, 공유 상태, 시스템 정보, 설정 |
| `write` | `read`에 더해 되돌릴 수 있는 변경: 노트, 할 일, 알림, 폴더, 이동, 첨부 파일, 노트를 휴지통으로 이동, 휴지통 또는 수정 이력에서 복원 |
| `admin` *(기본값)* | 되돌릴 수 없는 작업(휴지통 비우기, 휴지통에서 영구 삭제), 작업 공간, 백업, Git 동기화, 앱 설정, 공개 공유를 포함한 모든 도구 |

```bash
# .env에 입력
POZNOTE_MCP_SCOPE=read

# 새 환경 설정을 적용하도록 MCP 컨테이너 재생성
docker compose up -d --force-recreate mcp-server
```

수준보다 높은 도구는 아예 등록되지 않습니다. 클라이언트에 보이지 않으며, 클라이언트가 무엇을 전달받았든 해당 도구 호출은 알 수 없는 도구로 거부됩니다. 시작 로그에 수준과 공개된 도구 수가 표시됩니다. 알 수 없는 값이면 `admin`으로 대체하지 않고 서버가 중지됩니다.

공유 토큰을 사용하면 수준은 서버 전체에 적용됩니다. 두 클라이언트에 서로 다른 수준을 주려면 별도의 `POZNOTE_MCP_SCOPE`, 포트, `POZNOTE_MCP_AUTH_TOKEN`을 가진 두 번째 MCP 컨테이너를 실행하세요.

[호출자별 인증](#호출자별-인증선택-사항)을 사용하면 각 호출자가 토큰의 클레임에 따라 자신만의 수준을 받을 수 있습니다. `POZNOTE_MCP_SCOPE_MAP`은 `<claim value>=<level>` 쌍을 나열하며, 이 값은 `POZNOTE_MCP_SCOPE_CLAIM`이 지정한 클레임에서 읽습니다. 기본값은 공백으로 구분된 OAuth 스코프인 `scope`이며, `groups`나 `roles` 같은 목록형 클레임도 사용할 수 있습니다.

```bash
# ID 공급자가 각 클라이언트에 부여한 OAuth 스코프
POZNOTE_MCP_SCOPE_MAP=poznote.read=read,poznote.write=write,poznote.admin=admin

# 또는 토큰에 그룹을 넣는 공급자라면 그룹 사용
POZNOTE_MCP_SCOPE_CLAIM=groups
POZNOTE_MCP_SCOPE_MAP=/poznote-agents=read,/poznote-users=write,/poznote-admins=admin
```

호출자는 클레임이 매핑되는 가장 높은 수준을 받지만 `POZNOTE_MCP_SCOPE`를 넘지는 않으며, 그보다 높은 도구는 도구 목록에서 숨겨지고 호출하면 거부됩니다. 클레임이 어떤 수준에도 매핑되지 않는 호출자는 서버의 수준을 받는 대신 바로 거부(`401`)되며, 그 이유가 로그에 기록됩니다. `POZNOTE_MCP_SCOPE_MAP`이 없으면 모든 호출자가 서버의 수준을 받습니다.

모든 도구에는 표준 MCP 어노테이션인 `readOnlyHint`와 `destructiveHint`도 붙어 있으므로, 자체적으로 도구를 필터링하거나 확인을 요청하는 클라이언트는 이를 활용할 수 있습니다.

#### 디버그 모드

시작 명령에 `POZNOTE_DEBUG=true`를 지정하면 로그 수준이 `INFO`에서 `DEBUG`로 바뀝니다. 평소에는 `false`로 두세요. 소문자 `true`와 `false`만 인식하며 다른 값은 경고와 함께 `false`로 처리합니다. 웹 서버는 `1`, `on`, `yes`도 허용합니다. Poznote API에 보낸 모든 HTTP 요청, AI 어시스턴트의 도구 호출, 응답이 컨테이너 로그에 상세히 기록됩니다. 연결 및 인증 문제 진단에 사용하세요.

```bash
docker compose logs -f mcp-server
```

평소에는 비활성화하세요. 일상 사용에는 상세 로그가 필요하지 않습니다.

### 서버 시작

```bash
docker-compose up -d
```

### 설치 확인

```bash
# 컨테이너 실행 확인
docker ps | grep mcp

# 엔드포인트 시험
curl http://127.0.0.1:8045/mcp
```

MCP 서버를 끄려면 `docker-compose.yml`의 `mcp-server` 서비스를 주석 처리하세요.

---

## 클라이언트 설정

AI 어시스턴트가 MCP 서버에 연결하도록 설정하세요.

### **VS Code Copilot**
전체 설정 안내: **[VSCODE-COPILOT.md](VSCODE-COPILOT.ko.md)**

### **Claude CLI**
전체 설정 안내: **[CLAUDE-CLI.md](CLAUDE-CLI.ko.md)**

### **ChatGPT, Claude Desktop / claude.ai, Gemini**
채팅 앱은 Poznote를 통해 로그인합니다. **[채팅 앱에서 로그인](#채팅-앱에서-로그인chatgpt-claude-gemini)**을 참고하세요.

---

## 보안

MCP 엔드포인트에 접근하는 클라이언트가 할 수 있는 작업은 [모드](#용도별-모드-선택)에 따라 다릅니다.

**클래식 모드**(기본값). 엔드포인트에 접근할 수 있는 사람은 모든 프로필의 노트를 읽고 생성·수정·삭제할 수 있습니다(도구의 `user_id` 인수). 백업, 복원, 설정 변경도 가능합니다. 두 단계로 접근을 제한합니다.

1. **네트워크 접근 범위.** 기본적으로 로컬 컴퓨터에서만 접속할 수 있습니다.
2. **수신 Bearer 토큰(선택 사항).** `POZNOTE_MCP_AUTH_TOKEN`을 설정하면 모든 요청에 `Authorization: Bearer <token>`이 필요합니다.

기본 `docker-compose.yml`에서는 첫 단계만으로 충분합니다. 완전히 통제하지 못하는 위치에서도 포트에 접근할 수 있다면 두 번째 단계도 적용하세요.

**채팅 앱에서 로그인과 호출자별 인증.** 모든 요청에 한 사람의 계정에 묶인 토큰이 있어야 하므로, 클라이언트는 그 계정에만, 부여받은 수준으로만 접근합니다. 이 경우 엔드포인트는 HTTPS 뒤에 두고 인터넷에서 접근할 수 있게 하는 것이 전제입니다. 채팅 앱은 자체 서버에서 연결하기 때문입니다.

어떤 모드에서든 [도구 범위](#도구-범위)로 클라이언트가 할 수 있는 작업을 좁힐 수 있습니다.

### 127.0.0.1에만 공개하는 이유

Docker 포트 매핑을 위해 컨테이너 *내부*에서는 `0.0.0.0`으로 접속을 받지만, 호스트에서는 공개 인터페이스가 아닌 **`127.0.0.1`에만** 포트를 공개합니다.

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

의도된 올바른 구성입니다. 같은 컴퓨터의 프로세스나 명시적으로 설정한 SSH 터널만 연결할 수 있습니다. 기본 구성에서는 추가 공개를 걱정할 필요가 없습니다.

### Docker 없이 MCP 서버 실행

`pip`로 설치해 `poznote-mcp serve`를 직접 실행한다면(systemd, Proxmox LXC 등) Docker 포트 매핑이 없으므로 바인딩 주소가 중요합니다.

- `poznote-mcp serve`는 **기본적으로 `127.0.0.1`**에 바인딩합니다. 다른 주소가 필요한 이유를 알지 못하면 기본값을 유지하세요.
- 다른 호스트의 프록시나 VPN 인터페이스 때문에 `0.0.0.0`이 필요하다면 `POZNOTE_MCP_AUTH_TOKEN`도 설정하세요. 루프백 이외의 주소에서 토큰 없이 접속을 받으면 시작 시 경고가 기록됩니다.
- 이전 버전은 기본적으로 `0.0.0.0`에 바인딩했습니다. `--host=127.0.0.1`을 명시하세요(`serve` 하위 명령 없이 실행하면 `MCP_HOST=127.0.0.1` 설정).

### 원격 접속

클래식 모드에서, 원격 서버에서 Poznote를 실행하고 작업용 컴퓨터에서 연결하려면 SSH 포트 전달을 사용하세요. 포트를 외부에 공개하지 **마세요**([채팅 앱에서 로그인](#채팅-앱에서-로그인chatgpt-claude-gemini)에서는 HTTPS 뒤로 공개하는 것이 바로 목적이므로 이 섹션이 적용되지 않습니다).

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

이후 평소처럼 AI 어시스턴트에 `http://127.0.0.1:8045/mcp`를 설정하세요.

### 운영 환경

MCP 서버에 네트워크로 접근해야 한다면 다음으로 보호하세요.
- `POZNOTE_MCP_AUTH_TOKEN`([수신 연결 인증 토큰](#수신-연결-인증-토큰) 참고) 또는 클라이언트마다 하나의 계정에 묶인 철회 가능한 토큰을 발급하는 [Poznote를 통한 로그인](#채팅-앱에서-로그인chatgpt-claude-gemini), 그리고 토큰 평문 전송을 막는 HTTPS
- VPN(Tailscale, WireGuard)
- 추가 보호를 위한 자체 인증 또는 IP 허용 목록이 있는 리버스 프록시(nginx, Caddy, 선택 사항). 단, 채팅 앱에서 로그인을 사용할 때는 제외합니다. 앱은 계속 바뀌는 자체 주소에서 연결하며 별도의 로그인에 응답할 수 없으므로 엔드포인트와 `/.well-known/` 문서에 계속 접근할 수 있어야 합니다.

### MCP 서버의 Poznote 인증 방식

MCP 서버는 `data/.mcp_token`의 내부 Bearer 토큰으로 Poznote REST API에 연결합니다. Poznote가 자동 생성하며 Docker Compose가 `./data`를 MCP 컨테이너에 읽기 전용으로 마운트하므로 `.env`에 보관할 필요가 없습니다.

이 토큰이 MCP 서버임을 식별하므로 토큰을 가진 요청이 노트 본문이나 할 일을 변경하기 직전에 스냅샷을 생성합니다(`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`, `add_subtask`, `update_subtask`, `delete_subtask`). 노트의 **수정 이력** 페이지에 “MCP 편집 전”으로 표시되어 AI 재작성으로 누락된 내용을 복원할 수 있습니다. 최신 스냅샷과 본문이 같으면 건너뛰며 노트별로 최근 편집 보호 스냅샷(AI 편집 전 및 MCP 편집 전) 20개를 보관합니다. 편집량이 많다면 **설정 > 작업 > 수정 이력**에서 최대 200개로 늘릴 수 있습니다.

---

## 사용 예시

설정 후 자연어로 Poznote를 사용하세요.

```
'Poznote' 작업 공간의 노트를 모두 보여줘
'MCP'에 관한 노트를 찾아줘
토론 내용으로 'Meeting Notes' 노트를 만들어줘
123번 노트에 새 내용을 넣어줘
456번 노트를 'Projects' 폴더로 옮겨줘
```

자세한 사용 예시와 문제 해결:
- VS Code Copilot: [VSCODE-COPILOT.md](VSCODE-COPILOT.ko.md#사용-예시)
- Claude CLI: [CLAUDE-CLI.md](CLAUDE-CLI.ko.md#사용-예시)

---

## 지원 및 참고 자료

- **[VS Code Copilot 설정 →](VSCODE-COPILOT.ko.md)**
- **[Claude CLI 설정 →](CLAUDE-CLI.ko.md)**

문제가 발생하면:
- MCP 서버 로그 확인: `docker compose logs mcp-server`
- Poznote API 접근 가능 여부 확인
- 클라이언트별 문제 해결 문서 확인
