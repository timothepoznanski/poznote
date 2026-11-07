<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <a href="VSCODE-COPILOT.de.md">Deutsch</a> ·
  <a href="VSCODE-COPILOT.es.md">Español</a> ·
  <a href="VSCODE-COPILOT.pt.md">Português</a> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <a href="VSCODE-COPILOT.zh-cn.md">简体中文</a> ·
  <b>한국어</b> ·
  <a href="VSCODE-COPILOT.ja.md">日本語</a> ·
  <a href="VSCODE-COPILOT.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# VS Code Copilot에서 Poznote MCP 서버 사용

VS Code Copilot에서 Poznote MCP 서버를 설정하고 사용하는 방법을 설명합니다.

## 사전 준비

- Visual Studio Code 설치
- **GitHub Copilot 구독:** 유료 또는 체험 [GitHub Copilot](https://github.com/features/copilot) 요금제와 활성화된 VS Code Copilot Chat 확장 프로그램 필요
- Docker Compose로 실행 중인 Poznote MCP 서버
- 127.0.0.1에서 접근 가능한 MCP 서버(기본 포트: 8045)

## 설정

### 1. MCP 서버 실행 확인

MCP 서버 컨테이너가 실행 중인지 확인하세요.

```bash
docker ps | grep mcp
```

실행 중인 MCP 서버가 표시되어야 합니다. 출력의 포트를 확인하세요(기본값: 8045).

### 2. VS Code 설정

`mcp.json`에 Poznote MCP 서버를 추가하세요. 파일 위치는 운영체제에 따라 다릅니다.

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

파일이 없으면 다음 설정으로 생성하세요.

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

> **참고:** `docker-compose.yml`에서 포트를 변경했다면 `8045`를 실제 MCP 서버 포트로 바꾸세요.

#### 인증 토큰 사용

MCP 서버에 `POZNOTE_MCP_AUTH_TOKEN`을 설정했다면([수신 연결 인증 토큰](MCP-SERVER.ko.md#수신-연결-인증-토큰) 참고) 동일한 헤더를 추가하세요. 없으면 모든 호출이 `401 Unauthorized`로 거부됩니다.

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

토큰을 `mcp.json`에 저장하지 않고 VS Code가 입력을 요청하도록 할 수도 있습니다. `"password": true`가 있는 `inputs` 항목을 선언하고 `"Authorization": "Bearer ${input:poznote-token}"`으로 참조하세요.

### 3. VS Code 다시 불러오기

`mcp.json` 변경 후 적용하려면 VS Code를 다시 불러오세요.
- `Ctrl+Shift+P`(Mac은 `Cmd+Shift+P`) 누르기
- “Reload Window” 입력 후 Enter 누르기

## 원격 서버 설정

원격 서버에서 Poznote를 실행한다면 SSH 포트 전달로 안전하게 연결하세요.

### 1. SSH 터널 연결

명령줄에서는 다음으로 SSH 터널을 생성하세요.

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

VS Code Copilot에서 Poznote를 사용하는 동안 연결을 유지하세요.

VS Code Remote SSH, Dev Containers, Codespaces로 이미 원격 컴퓨터에 연결했다면 `PORTS` 화면에서 직접 터널을 만들 수도 있습니다.

1. VS Code의 `PORTS` 패널 열기
2. 원격 포트 `8045` 전달
3. Copilot을 사용하는 동안 전달 상태 유지
4. `8045` 이외의 로컬 포트가 할당되면 `mcp.json`에 해당 포트 사용

### 2. VS Code 설정

로컬 설치와 같은 `mcp.json` 설정을 사용하세요.

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

SSH 터널이나 VS Code 포트 전달을 통해 원격 MCP 서버에 로컬 컴퓨터에서 접근하므로 VS Code는 `127.0.0.1`로 연결합니다.

## 사용 예시

설정 후 VS Code의 Copilot Chat에서 자연어로 Poznote를 사용할 수 있습니다.

### 기본 작업

```
# 모든 노트 조회
@poznote 내 노트를 모두 보여줘

# 노트 검색
@poznote "docker"에 관한 노트를 찾아줘

# 특정 노트 조회
@poznote 123번 노트를 보여줘

# 작업 공간 조회
@poznote 어떤 작업 공간이 있어?

# 폴더 조회
@poznote 내 작업 공간의 폴더를 모두 보여줘
```

### 노트 생성 및 수정

> **작업 공간:** *“'Projets' 작업 공간에”*처럼 요청에 대상 작업 공간을 명시하세요. 지정하지 않으면 서버가 `mcp_default_workspace` 설정이나 계정의 유일한 작업 공간을 사용하며, 작업 공간이 여러 개이고 그 설정이 비어 있으면 호출을 거부합니다.

```
@poznote "Projets" 작업 공간에 "Meeting Notes" 노트를 만들고 새 기능에 관한 내용을 넣어줘

@poznote 456번 노트에 배포 절차에 관한 새 내용을 넣어줘

@poznote 456번 노트를 삭제해줘(휴지통으로 이동)

@poznote "Perso" 작업 공간에 "Renew passport" 노트를 만들고 9월 1일 오전 9시에 알려줘

@poznote "Projects" 폴더를 만들어줘
```

### 알림

```
@poznote 123번 노트를 다음 월요일 오전 8시에 알려줘

@poznote 123번 노트에 매주 월요일 오전 9시 알림을 설정해줘

@poznote 123번 노트에 알림이 있어?

@poznote 123번 노트 알림을 제거해줘
```

### 할 일 목록

```
@poznote 123번 노트의 할 일을 보여줘

@poznote 123번 노트에 내일 오후 6시 30분 마감과 알림이 있는 "Buy milk" 할 일을 추가해줘

@poznote 123번 노트에 매주 금요일 마감인 "Weekly report" 할 일을 추가해줘

@poznote 123번 노트의 "Buy milk" 할 일을 완료해줘

@poznote 123번 노트의 "Buy milk" 마감일을 다음 월요일로 바꿔줘

@poznote 123번 노트의 "Buy milk" 할 일을 삭제해줘
```

### 고급 작업

```
@poznote 789번 노트를 복제해줘

@poznote 123번 노트를 즐겨찾기에 추가해줘

@poznote 456번 노트를 "Projects" 폴더로 옮겨줘

@poznote 123번 노트를 마크다운으로 변환해줘

@poznote 123번 노트를 링크하는 노트가 뭐야?

@poznote 123번 노트의 공개 공유를 켜줘

@poznote 공개 공유한 내 노트와 폴더를 모두 보여줘

@poznote 내 Poznote 버전이 뭐야?
```

### 폴더와 작업 공간

```
@poznote 12번 폴더 이름을 "Archive"로 바꿔줘

@poznote 12번 폴더를 삭제하고 노트를 휴지통으로 옮겨줘

@poznote "Work" 작업 공간을 만들어줘

@poznote "Work" 작업 공간 이름을 "Job"으로 바꿔줘

@poznote "Job" 작업 공간을 삭제해줘
```

### 휴지통과 복원

```
@poznote 휴지통의 노트를 모두 보여줘

@poznote 휴지통의 123번 노트를 복원해줘

@poznote 휴지통을 비워줘
```

### Git 동기화

```
@poznote Git 동기화 상태가 어때?

@poznote 내 노트를 Git으로 보내줘

@poznote Git에서 노트를 가져와줘
```

### 백업과 설정

```
@poznote 모든 백업을 보여줘

@poznote 내 데이터를 백업해줘

@poznote poznote_backup_2026-02-02_15-30-00.zip 백업을 복원해줘

@poznote poznote_backup_2026-02-02_15-30-00.zip 백업을 삭제해줘

@poznote "timezone" 설정이 뭐야?

@poznote "timezone"을 "Europe/Paris"로 설정해줘
```

### 본문 작업

```
@poznote "important" 태그의 내 노트를 모두 요약해줘

@poznote 주제별 폴더로 노트 정리를 도와줘

@poznote 회의 노트로 주간 보고서를 만들어줘
```

## 문제 해결

### 연결 문제

VS Code Copilot이 MCP 서버에 연결하지 못하면 다음을 확인하세요.

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

4. **mcp.json 문법 확인:**
   끝 쉼표나 잘못된 따옴표가 없는 유효한 JSON인지 확인하세요.

### MCP 서버를 인식하지 못함

VS Code가 Poznote MCP 서버를 인식하지 못하면:

1. `mcp.json` 수정 후 VS Code를 다시 불러왔는지 확인
2. GitHub Copilot 활성화 및 동작 여부 확인
3. VS Code 출력 패널의 오류 확인
   - View → Output
   - 선택 목록에서 “GitHub Copilot” 선택

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

## 사용 가능한 MCP 도구

서버는 노트, 작업, 알림, 폴더, 워크스페이스, 태그, 첨부 파일, 리비전, 공유, Git 동기화, 백업을 위한 도구를 제공합니다. 각 도구와 그 역할은 [MCP 서버 문서](MCP-SERVER.ko.md#기능)에 하나씩 정리되어 있으며, 그 목록은 그곳에서만 최신으로 유지됩니다.

### 다중 사용자 지원

대부분의 도구는 선택적 `user_id`로 특정 사용자 프로필을 지정합니다. 시스템 도구인 `get_system_info`, `list_backups`, `create_backup`, `delete_backup`에는 `user_id`가 없습니다. 요청에서 다음처럼 지정할 수 있습니다.

```
@poznote 사용자 2의 노트를 보여줘
```

## 고급 설정

### 여러 Poznote 인스턴스

인스턴스가 여러 개라면 다른 이름으로 설정할 수 있습니다.

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

이후 대상을 명시적으로 지정하세요.
```
@poznote-work 내 업무 노트를 보여줘
```

### 사용자 지정 포트

MCP 서버 포트가 다르면 `mcp.json`의 URL을 수정하세요.

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

## 보안 참고 사항

⚠️ **중요:** MCP 엔드포인트에 접근할 수 있는 사람은 모든 노트를 관리할 수 있습니다. 기본적으로 127.0.0.1에서만 접근 가능합니다. 접근 범위를 넓히면 `POZNOTE_MCP_AUTH_TOKEN`을 설정해 클라이언트가 Bearer 토큰을 제시하도록 하세요([인증 토큰 사용](#인증-토큰-사용) 참고).

**기본 구성(안전):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**원격 접속에는 항상 SSH 터널을 사용하세요.** [원격 서버 설정](#원격-서버-설정)을 참고하세요.

자세한 내용: [MCP 서버 보안](MCP-SERVER.ko.md#보안).

## 참고 자료

- [MCP 서버 기본 문서](MCP-SERVER.ko.md)
- [VS Code MCP 공식 문서](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Claude CLI 설정](CLAUDE-CLI.ko.md)
- [보안 고려 사항](MCP-SERVER.ko.md#보안)

## 지원

문제나 질문이 있다면 다음을 확인하세요.
- [MCP 기본 문서](MCP-SERVER.ko.md) 확인
- MCP 서버 로그 검토: `docker compose logs mcp-server`
- Poznote API 접근 가능 여부 확인
- VS Code 출력 패널의 오류 확인
