<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a> ·
  <b>한국어</b> ·
  <a href="CLAUDE-CLI.ja.md">日本語</a> ·
  <a href="CLAUDE-CLI.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Claude CLI에서 Poznote MCP 서버 사용

이 문서는 Claude CLI(명령줄 인터페이스)에서 Poznote MCP 서버를 설정하고 사용하는 방법을 설명합니다.

## 사전 준비

- **Anthropic 계정:** Claude CLI는 Claude 구독 또는 [Anthropic API 키](https://console.anthropic.com/)로 로그인합니다. API 키를 쓰는 경우 CLI 사용 전에 설정하세요.
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI 설치(`npm install -g @anthropic-ai/claude-code`)
- Docker Compose로 실행 중인 Poznote MCP 서버
- 127.0.0.1에서 접근 가능한 MCP 서버(기본 포트: 8045)

## 설치

### 1. MCP 서버 실행 확인

MCP 서버 컨테이너가 실행 중인지 확인하세요.

```bash
docker ps | grep mcp
```

실행 중인 MCP 서버가 표시되어야 합니다. 출력의 포트를 확인하세요(기본값: 8045).

### 2. Claude CLI에 MCP 서버 추가

HTTP 전송 방식으로 Poznote MCP 서버를 추가하세요.

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **참고:** `docker-compose.yml`에서 포트를 변경했다면 `8045`를 실제 MCP 서버 포트로 바꾸세요.

#### 인증 토큰 사용

MCP 서버에 `POZNOTE_MCP_AUTH_TOKEN`을 설정했다면([수신 연결 인증 토큰](MCP-SERVER.ko.md#수신-연결-인증-토큰) 참고) 동일한 토큰을 헤더로 전달하세요. 전달하지 않으면 모든 호출이 `401 Unauthorized`로 거부됩니다.

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

설정 저장 위치는 `--scope` 옵션에 따라 다릅니다.
- **로컬(기본값):** `~/.claude.json`. 명령을 실행한 디렉터리에서만 사용 가능
- **사용자(`--scope user`):** `~/.claude.json`. 모든 프로젝트에서 사용 가능
- **프로젝트(`--scope project`):** 프로젝트 루트의 `.mcp.json`. 커밋하여 팀과 공유하는 용도

### 3. 설정 확인

설정된 MCP 서버 목록을 확인하세요.
```bash
claude mcp list
```

목록에 HTTP URL과 함께 `poznote`가 표시되어야 합니다.

### 4. 서버 상세 정보 확인

Poznote MCP 서버의 상세 정보를 조회하세요.
```bash
claude mcp get poznote
```

## 사용 예시

설정 후 자연어 명령으로 Poznote 인스턴스와 상호작용할 수 있습니다.

### 기본 조회

```bash
# 모든 노트 조회
claude "Poznote의 내 노트를 모두 보여줘"

# 노트 검색
claude "Poznote에서 'docker'에 관한 노트를 찾아줘"

# 특정 노트 조회
claude "Poznote의 123번 노트를 보여줘"

# 작업 공간 조회
claude "Poznote에 어떤 작업 공간이 있어?"

# 폴더 조회
claude "내 Poznote 작업 공간의 폴더를 모두 보여줘"
```

### 노트 생성 및 수정

```bash
# 새 노트 생성
# 중요: 대상 작업 공간을 항상 지정하세요. 지정하지 않으면 서버가 mcp_default_workspace
# 설정이나 계정의 유일한 작업 공간을 사용하며, 작업 공간이 여러 개이고 그 설정이
# 비어 있으면 호출을 거부합니다.
claude "Poznote의 'Projets' 작업 공간에 'Meeting Notes'라는 노트를 만들고 'Discussion about the new feature' 내용을 넣어줘"

# 기존 노트 수정
claude "Poznote의 456번 노트에 배포 절차에 관한 새 내용을 넣어줘"

# 노트 삭제(휴지통으로 이동)
claude "Poznote의 456번 노트를 삭제해줘"

# 노트와 알림을 한 번에 생성
claude "Poznote의 'Perso' 작업 공간에 'Renew passport' 노트를 만들고 9월 1일 오전 9시에 알려줘"

# 폴더 생성
claude "Poznote에 'Projects' 폴더를 만들어줘"
```

### 알림

```bash
# 기존 노트의 알림 설정
claude "Poznote의 123번 노트를 다음 월요일 오전 8시에 알려줘"

# 반복 알림 설정
claude "Poznote의 123번 노트에 매주 월요일 오전 9시 알림을 설정해줘"

# 알림 확인
claude "Poznote의 123번 노트에 알림이 있어?"

# 알림 제거
claude "Poznote의 123번 노트 알림을 제거해줘"
```

### 할 일 목록

```bash
# 할 일 목록 노트의 할 일 조회
claude "Poznote의 123번 노트 할 일을 보여줘"

# 마감일과 알림이 있는 할 일 추가
claude "Poznote의 123번 노트에 내일 오후 6시 30분 마감과 알림이 있는 'Buy milk' 할 일을 추가해줘"

# 반복 할 일 추가
claude "Poznote의 123번 노트에 매주 금요일 마감인 'Weekly report' 할 일을 추가해줘"

# 할 일 완료
claude "Poznote의 123번 노트에서 'Buy milk' 할 일을 완료해줘"

# 할 일 수정 또는 삭제
claude "Poznote의 123번 노트에서 'Buy milk' 마감일을 다음 월요일로 옮겨줘"
claude "Poznote의 123번 노트에서 'Buy milk' 할 일을 삭제해줘"
```

### 고급 작업

```bash
# 노트 복제
claude "Poznote의 789번 노트를 복제해줘"

# 즐겨찾기 전환
claude "Poznote의 123번 노트를 즐겨찾기에 추가해줘"

# 노트를 폴더로 이동
claude "Poznote의 456번 노트를 'Projects' 폴더로 옮겨줘"

# HTML과 마크다운 간 노트 변환
claude "Poznote의 123번 노트를 마크다운으로 변환해줘"

# 해당 노트를 링크하는 노트 찾기
claude "Poznote의 123번 노트를 링크하는 노트가 뭐야?"

# 노트 공유
claude "Poznote의 123번 노트 공개 공유를 켜줘"

# 공개 공유 항목 전체 조회
claude "Poznote의 공개 공유 노트와 폴더를 모두 보여줘"

# 시스템 정보 조회
claude "내 Poznote 버전이 뭐야?"
```

### 폴더와 작업 공간

```bash
# 폴더 이름 변경 또는 삭제
claude "Poznote의 12번 폴더 이름을 'Archive'로 바꿔줘"
claude "Poznote의 12번 폴더를 삭제하고 노트를 휴지통으로 옮겨줘"

# 작업 공간 관리
claude "Poznote에 'Work' 작업 공간을 만들어줘"
claude "Poznote의 'Work' 작업 공간 이름을 'Job'으로 바꿔줘"
claude "Poznote의 'Job' 작업 공간을 삭제해줘"
```

### 설정

```bash
# 설정 조회
claude "Poznote의 'timezone' 설정이 뭐야?"

# 설정 변경
claude "Poznote의 'timezone'을 'Europe/Paris'로 설정해줘"
```

### 휴지통과 복원

```bash
# 휴지통 조회
claude "Poznote 휴지통의 노트를 모두 보여줘"

# 노트 복원
claude "Poznote 휴지통의 123번 노트를 복원해줘"

# 휴지통 비우기
claude "Poznote 휴지통을 비워줘"
```

### Git 동기화

```bash
# Git 동기화 상태 확인
claude "Poznote의 Git 동기화 상태가 어때?"

# Git으로 푸시(보내기)
claude "Poznote 노트를 Git으로 보내줘"

# Git에서 가져오기(풀)
claude "Git에서 Poznote로 노트를 가져와줘"
```

### 백업

```bash
# 백업 목록 조회
claude "Poznote 백업을 모두 보여줘"

# 백업 생성
claude "내 Poznote 데이터를 백업해줘"

# 백업 복원(⚠️ 현재 사용자 데이터 전체 교체)
claude "Poznote 백업 poznote_backup_2026-02-02_15-30-00.zip을 복원해줘"

# 백업 파일 삭제
claude "Poznote 백업 poznote_backup_2026-02-02_15-30-00.zip을 삭제해줘"
```

## 대화형 모드

노트에 관해 Claude와 대화할 수 있는 대화형 세션을 시작하세요.

```bash
claude
```

이후 자연스럽게 질문하세요.
- “'important' 태그가 있는 노트를 모두 보여줘.”
- “지난주 회의 노트를 모두 요약해줘.”
- “노트를 폴더별로 정리하는 걸 도와줘.”

## 설정 옵션

### 사용자 지정 포트

MCP 서버가 다른 포트에서 실행된다면 `docker-compose.yml`의 `POZNOTE_MCP_PORT` 설정을 확인하세요.
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### 서버 제거

Claude CLI에서 Poznote MCP 서버를 제거하려면 다음을 실행하세요.
```bash
claude mcp remove poznote
```

### 여러 인스턴스

여러 Poznote 인스턴스를 서로 다른 포트에서 실행한다면 각기 다른 이름으로 설정할 수 있습니다.
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

이후 질문에서 사용할 인스턴스를 지정하세요.
```bash
claude "poznote-work의 노트를 보여줘"
```

## 문제 해결

### 연결 문제

Claude CLI가 MCP 서버에 연결하지 못하면 다음을 확인하세요.

1. **MCP 서버 실행 여부:**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   `8045`를 설정한 포트로 바꾸세요.

2. **Docker 컨테이너 상태:**
   ```bash
   docker ps | grep mcp
   docker compose logs mcp-server
   ```

3. **포트 바인딩:**
   `docker-compose.yml`에서 포트가 127.0.0.1에 바인딩되어 있는지 확인하세요.
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### 인증 오류

MCP 서버는 `data/.mcp_token`에 저장된 공유 토큰으로 Poznote에 인증합니다.

다음을 확인하세요.
- Poznote 호스트에 `./data/.mcp_token`이 있는지
- `mcp-server` 서비스에 `./data:/var/www/html/data:ro`가 마운트되어 있는지
- 토큰 기반 MCP 구성으로 업데이트한 뒤 웹 서버 컨테이너를 한 번 이상 재생성했는지

### 디버그 모드

환경 변수를 명령에 지정해 MCP 서버 컨테이너를 재생성하면 디버그 로그를 활성화할 수 있습니다.
```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

소문자 `true`와 `false`만 인식합니다. 다른 값은 `false`로 처리되며 MCP 로그에 경고가 기록됩니다.

이후 로그를 확인하세요.
```bash
docker compose logs -f mcp-server
```

## 보안 참고 사항

⚠️ **중요:** MCP 엔드포인트에 접근할 수 있는 사람은 모든 노트를 관리할 수 있습니다. 기본적으로 127.0.0.1에서만 접근 가능합니다. 접근 범위를 넓히면 `POZNOTE_MCP_AUTH_TOKEN`을 설정해 클라이언트가 Bearer 토큰을 제시하도록 하세요([인증 토큰 사용](#인증-토큰-사용) 참고).

**기본 구성(안전):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**원격 접속에는 SSH 터널 사용:**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

자세한 내용: [MCP 서버 보안](MCP-SERVER.ko.md#보안).

## 사용 가능한 MCP 도구

서버는 노트, 작업, 알림, 폴더, 워크스페이스, 태그, 첨부 파일, 리비전, 공유, Git 동기화, 백업을 위한 도구를 제공합니다. 각 도구와 그 역할은 [MCP 서버 문서](MCP-SERVER.ko.md#기능)에 하나씩 정리되어 있으며, 그 목록은 그곳에서만 최신으로 유지됩니다.

### 다중 사용자 지원

대부분의 도구는 선택적 `user_id` 매개변수로 특정 사용자 프로필을 지정할 수 있습니다. 시스템 도구인 `get_system_info`, `list_backups`, `create_backup`, `delete_backup`에는 `user_id`가 없습니다.
```bash
claude "Poznote의 사용자 2 노트를 보여줘"
```

## 관련 문서

- [MCP 서버 기본 문서](MCP-SERVER.ko.md)
- [VS Code Copilot 설정](VSCODE-COPILOT.ko.md)
- [보안 고려 사항](MCP-SERVER.ko.md#보안)

## 지원

문제나 질문이 있다면 다음을 확인하세요.
- [MCP 기본 문서](MCP-SERVER.ko.md) 확인
- MCP 서버 로그 검토: `docker compose logs mcp-server`
- Poznote API 접근 가능 여부 확인
