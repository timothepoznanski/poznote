<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a> ·
  <b>한국어</b>
</p>
<!-- /lang-selector -->

# 설치 문제 해결

<details>
<summary><strong>“mkdir() 경고(권한 거부) 또는 연결 실패”</strong></summary>
<br>

다음 오류가 발생한다면:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- `database` 폴더 소유자가 `www-data:www-data`가 아닌 `root:root`로 생성됨

Komodo, Portainer 등 일부 환경의 Docker 볼륨 마운트에서 알려진 문제입니다. 구성에 따라 컨테이너가 마운트된 볼륨의 권한을 바꾸지 못합니다.

**해결:** 컨테이너 시작 전에 호스트에서 올바른 권한을 설정하세요.

```bash
# Poznote 디렉터리로 이동
cd poznote

# 올바른 권한으로 데이터 디렉터리 구조 생성
mkdir -p data/database

# UID 82(Alpine Linux의 www-data)로 소유권 설정
sudo chown -R 82:82 data

# 컨테이너 시작
docker compose up -d
```

</details>

<details>
<summary><strong>“Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database”</strong></summary>
<br>

먼저 컨테이너를 중지했다가 다시 시작하고 DB 초기화를 기다리며 페이지를 새로고침하세요.

해결되지 않으면 컨테이너를 중지하고 `data` 폴더 소유자를 수정하세요. UID/GID는 환경에 맞춰야 합니다(예시는 1000:1000).

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **참고:** Poznote Docker 이미지가 사용하는 Alpine Linux에서 UID 82는 `www-data` 사용자입니다.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>루트 권한 없이 실행(docker-compose.rootless.yml)</strong></summary>
<br>

Poznote는 root 대신 일반 사용자(uid/gid `1000`, 이름 `poznote`)로 실행되는 rootless 이미지도 제공합니다. 컨테이너 안의 root를 금지하는 환경(Kubernetes 제한 `PodSecurityStandard`, rootless Podman, `docker run --user` 등)에서 사용할 수 있습니다.

기본 이미지와 달리 시작 시 호스트 마운트의 소유권을 수정할 root 프로세스가 없습니다. **처음 시작하기 전에 `./data`의 소유자가 uid/gid 1000이어야 합니다.**

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

생략하면 필요한 명령을 안내하는 오류와 함께 컨테이너가 즉시 종료됩니다.

이 작업에는 대개 `sudo`가 필요하지 않습니다.

- 호스트 사용자의 uid가 이미 `1000`이면(대부분 Linux에서 처음 만든 사용자) `mkdir -p data`로 올바른 소유자가 설정되므로 `chown`을 생략할 수 있습니다.
- rootless Podman이나 Docker에서는 root 권한 없이 사용자 네임스페이스 안에서 소유권을 변경하세요.

```bash
# rootless Podman
podman unshare chown -R 1000:1000 data
# rootless Docker
rootlesskit chown -R 1000:1000 data
```

새 설치는 README의 [rootless 설치 방법](README.ko.md#rootless)을 따르세요. 기존 인스턴스는 중지하고 데이터를 백업한 뒤 디렉터리 소유자를 변경하고 rootless 이미지를 시작하세요.

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

rootless 웹 서버의 내부 포트는 `80` 대신 비특권 포트 `8080`입니다. 호스트 포트는 이전과 같이 `.env`의 `HTTP_WEB_PORT`로 지정합니다.

소스에서 빌드하려면 `docker-compose.rootless.yml`의 `image:`를 `build: { context: ., target: rootless }`로 바꾸세요. 저장소 복제가 필요합니다.

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong><code>network_mode: host</code>로 실행</strong></summary>
<br>

기본적으로 Docker는 호스트 포트를 컨테이너에 매핑합니다. 웹 서버는 내부 `80`(rootless는 `8080`)에서 접속을 받고 `HTTP_WEB_PORT`가 호스트 포트를 정합니다. `network_mode: host`에는 매핑이 없습니다. 컨테이너가 호스트 포트를 직접 사용하며 `80`은 대개 다른 웹 서버나 컨테이너가 사용 중입니다.

`.env`의 `POZNOTE_LISTEN_PORT`로 웹 서버 수신 포트를 설정하세요(rootless는 1023보다 큰 포트).

```bash
POZNOTE_LISTEN_PORT=8040
```

이후 `docker-compose.yml` 또는 `docker-compose.rootless.yml`의 두 서비스에서 `ports:`를 `network_mode: host`로 바꾸세요. MCP 서버도 두 가지 수정이 필요합니다. 서비스 이름으로 웹 서버를 찾지 못하므로 새 포트로 연결해야 하며, 모든 인터페이스를 사용하는 이미지의 기본값 대신 localhost에 바인딩해야 합니다.

```yaml
  mcp-server:
    image: ghcr.io/timothepoznanski/poznote-mcp:6
    restart: always
    network_mode: host
    command: ["sh", "-c", "poznote-mcp serve --host=127.0.0.1 --port=$${MCP_PORT}"]
    environment:
      POZNOTE_API_URL: http://127.0.0.1:${POZNOTE_LISTEN_PORT}/api/v1
      MCP_PORT: ${POZNOTE_MCP_PORT:-8045}
      POZNOTE_DEBUG: ${POZNOTE_DEBUG:-false}
      POZNOTE_USER_ID: ${POZNOTE_USER_ID:-1}
      POZNOTE_MCP_AUTH_TOKEN: ${POZNOTE_MCP_AUTH_TOKEN:-}
    volumes:
      - "./data:/var/www/html/data:ro"
    depends_on:
      - webserver
```

컨테이너를 재생성하세요. 재시작만으로는 환경 변수 변경을 읽지 않습니다.

```bash
docker compose up -d --force-recreate
```

초기화 스크립트는 매 시작 시 값을 적용하며 잘못된 값은 로그에 기록하고 기본값을 유지합니다. `HTTP_WEB_PORT`는 더 이상 사용하지 않고 `POZNOTE_MCP_PORT`는 MCP의 수신 포트를 정합니다. 현재 `docker-compose.yml`의 상태 확인은 `POZNOTE_LISTEN_PORT`를 따릅니다. 아직 `http://127.0.0.1/api/health`를 사용한다면 파일을 다시 받거나 URL을 수정하세요. 그렇지 않으면 `unhealthy`로 남거나 포트 `80`의 다른 서비스를 확인합니다.

host 모드에서 웹 서버는 호스트의 모든 인터페이스에서 접속을 받습니다. 방화벽으로 제한하거나 리버스 프록시를 통해서만 접속하도록 하세요. nginx와 PHP는 내부 Unix 소켓으로 통신하므로 추가 호스트 포트는 사용하지 않으며 서로 다른 포트로 여러 인스턴스를 실행할 수 있습니다.

</details>

<details>
<summary><strong>“사이트에 연결할 수 없음”</strong></summary>
 <br>

브라우저에 “This site can't be reached”가 나타나면 SELinux가 활성화되어 있을 수 있습니다. 컨테이너 로그를 확인하세요.

```bash
docker logs poznote-webserver-1
# 또는 podman 사용
podman logs poznote-webserver-1
```

다음 메시지가 나타날 수 있습니다.
- `chown: /var/www/html/data: Permission denied`

특히 `/root`에 설치할 때 Docker 볼륨의 SELinux 컨텍스트가 올바르지 않으면 발생합니다.

**해결:** 여러 배포판에서 정상 작동하도록 볼륨에 `:Z`를 붙이고 `/root` 설치를 피하는 것을 권장합니다.

`docker-compose.yml`의 볼륨 정의에 `:Z`를 추가하세요.

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

또는 `/opt/poznote`, `~/poznote`처럼 `/root` 밖에 설치하세요.

</details>

<details>
<summary><strong>“사용자 이름 또는 비밀번호가 올바르지 않음”</strong></summary>
<br>

1. “admin” 또는 “admin_change_me”와 설정한 비밀번호로 로그인해 보세요.
2. 비밀번호는 `.env`가 아니라 Poznote 화면에서 관리합니다. 변경 전에는 기본값인 관리자 `admin`, 일반 사용자 `user`를 사용합니다.
3. 관리자는 로그인되지만 일반 사용자는 안 되면 사용자 관리에서 프로필이 **활성** 상태인지 확인하세요.

</details>

<details>
<summary><strong>관리자 비밀번호 분실</strong></summary>
<br>

다른 관리자가 로그인할 수 있으면 **설정 > 관리자 도구 > 사용자 관리**에서 새 비밀번호를 지정할 수 있습니다. 그렇지 않으면 마스터 DB에서 직접 초기화하세요. 호스트의 Poznote 디렉터리에서 실행합니다. `sqlite3` 명령줄 도구는 호스트에 설치해야 하며 Poznote 이미지에 포함되지 않습니다.

```bash
sudo sqlite3 data/master.db "UPDATE users SET password_hash=NULL, password_login_disabled=0 WHERE id=1;"
```

첫 계정(ID 1, 항상 관리자)의 저장된 비밀번호를 지워 기본값을 다시 사용하게 합니다. 해당 사용자 이름과 `admin`으로 로그인한 뒤 **설정 > 비밀번호 변경**에서 즉시 변경하세요. 다른 계정은 `WHERE id=1`을 `WHERE username='its_username'`으로 바꾸세요. 일반 사용자 기본값은 `user`입니다.

2단계 인증이 켜져 있으면 비밀번호 다음에 코드를 요청합니다. 기기도 분실했다면 다음 항목을 확인하세요.

</details>

<a id="two-factor-lockout"></a>
<details>
<summary><strong>2단계 인증으로 로그인 불가(기기와 복구 코드 분실)</strong></summary>
<br>

활성화 때 받은 복구 코드는 각각 한 번 로그인할 수 있습니다. 코드 화면에서 **복구 코드 사용**을 선택하세요. 코드가 없으면 관리자가 **설정 > 관리자 도구 > 사용자 관리**의 해당 계정 비밀번호 창에서 2단계 인증을 끌 수 있습니다.

유일한 관리자라면 마스터 DB에서 두 번째 인증 요소를 직접 제거하세요. 호스트의 Poznote 디렉터리에서 실행하며 `sqlite3`가 설치되어 있어야 합니다.

```bash
sudo sqlite3 data/master.db "DELETE FROM user_totp_recovery_codes WHERE user_id=1; DELETE FROM user_totp WHERE user_id=1;"
```

`1`을 계정 ID로 바꾸세요(`sudo sqlite3 data/master.db "SELECT id, username FROM users;"`로 조회). 비밀번호만으로 다시 로그인할 수 있으며 해당 계정의 로그인 유지 쿠키는 무효화됩니다. **설정 > 2단계 인증**에서 다시 설정하세요.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>부하가 걸리면 응답 중단(자동 저장 오류, “server reached pm.max_children”)</strong></summary>
<br>

PHP 요청은 기본 10개의 php-fpm 작업 프로세스가 처리합니다. 자동 저장·조회·페이지 로드 같은 짧은 요청보다 AI 스트리밍, S3 호출, Git 동기화, 대용량 업로드 같은 긴 요청이 모두를 점유할 수 있습니다. 이때 다른 요청은 대기하며 저장 시 브라우저에 네트워크 오류, 컨테이너 로그에 다음이 나타납니다.

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

여러 사용자, AI 채팅, S3, Git 동기화를 사용하는 인스턴스는 `.env`의 `POZNOTE_PHP_FPM_MAX_CHILDREN`을 늘리고 컨테이너를 재생성하세요. 재시작만으로는 환경 변수 변경을 읽지 않습니다.

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

작업 중인 프로세스는 약 25~30 MB를 사용하고 설정값과 관계없이 유휴 프로세스는 소수입니다. 따라서 RAM 1 GB에서 20, 512 MB에서 10이 원문의 권장값입니다. 초기화 스크립트가 매 시작 시 적용하며 잘못된 값은 로그에 기록하고 기본값을 유지합니다.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>“Allowed memory size exhausted”로 요청 실패</strong></summary>
<br>

PHP 요청당 기본 메모리 상한은 512 MB입니다. 예약 메모리가 아닌 상한이며 유휴 프로세스는 약 25 MB입니다. 과도한 요청이 호스트 전체를 멈추는 대신 PHP 로그에 원인을 기록하고 실패하도록 합니다.

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

백업·복원·내보내기·다운로드는 디스크로 스트리밍하므로 계정 크기에 관계없이 수 MB만 필요합니다. 수십 MB짜리 노트 하나에서나 발생할 수 있습니다. 백업이나 다운로드에서 발생하면 버그이므로 로그와 함께 제보하세요.

상한을 늘리려면 `.env`의 `POZNOTE_PHP_MEMORY_LIMIT`을 정수 MB로 설정하고 컨테이너를 재생성하세요. 재시작만으로는 환경 변수 변경을 읽지 않습니다.

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

호스트 메모리보다 높게 설정하지 마세요. 실제 메모리를 넘는 요청은 커널이 안내 없이 종료하며 컨테이너 전체가 종료될 수 있습니다. 512 MB 호스트에서는 기본값을 유지하세요. 초기화 스크립트가 매 시작 시 적용하며 잘못된 값은 로그에 기록하고 기본값을 유지합니다.

</details>
