# Poznote 기여 안내

기여해 주셔서 감사합니다. 핵심 두 가지를 쉽게 확인할 수 있도록 짧게 정리했습니다.

## 1. PR 대상은 `main`이 아닌 `dev`

`main`은 릴리스 브랜치이며 `dev`에서 병합한 변경만 받습니다. `main`을 대상으로 제출한 PR은 그대로 병합할 수 없습니다.

`dev`에서 시작해 `dev`를 대상으로 제출하세요.

```bash
git clone https://github.com/<your-username>/poznote.git
cd poznote
git checkout dev
git checkout -b my-feature
```

GitHub에서 PR을 열면 기본 대상이 `main`입니다. base 브랜치를 `dev`로 바꾸세요.

이미 `main`에서 작업했다면 제출 전에 `dev` 위로 리베이스하세요. 그렇지 않으면 `main`의 누적 병합 커밋까지 포함됩니다.

```bash
git remote add upstream https://github.com/timothepoznanski/poznote.git
git fetch upstream
git rebase upstream/dev
```

## 2. GitHub 계정에 연결된 이메일로 커밋

GitHub는 작성자 이메일로 기여자를 식별합니다. `you@MacBook-Pro.local` 같은 로컬·임의 주소를 쓰면 계정에 기여가 연결되지 않으며 병합 후에는 고치기 어렵습니다.

현재 이메일을 확인하세요.

```bash
git config user.email
```

**GitHub > Settings > Emails**에 등록된 주소가 아니라면 같은 페이지의 noreply 주소를 사용하세요.

```bash
git config user.email "ID+username@users.noreply.github.com"
```

실제 이메일을 공개하지 않으면서 기여 기록을 연결할 수 있습니다.

잘못된 이메일로 이미 푸시했다면 커밋을 수정하고 본인 작업 브랜치에 다시 푸시하세요.

```bash
git commit --amend --author="username <ID+username@users.noreply.github.com>"
git push --force-with-lease
```

## 검사

PR에는 PHP 문법, PHP 단위 테스트, 스타일시트, JavaScript, 번역 문서의 다섯 검사가 자동 실행됩니다. 첫 기여는 관리자의 실행 승인이 필요할 수 있습니다.

로컬 실행은 필수는 아닙니다. 먼저 확인하려면 CI와 같은 명령을 사용하세요.

```bash
php tests/run.php                                     # 단위 테스트
php tools/css-check.php                               # 스타일시트
find . -name "*.php" -print0 | xargs -0 -n1 php -l >/dev/null   # PHP 문법
npx --yes oxlint@1.55.0 src poznote-url-saver build    # JavaScript
python3 tools/docs-i18n.py check                      # 번역 문서
```

처음 세 검사는 PHP, JavaScript 검사는 Node, 문서 검사는 Python 3만 필요합니다. JavaScript의 `correctness` 오류만 빌드를 실패시키며 기존 경고는 남겨도 됩니다.

## 개발 인스턴스 실행

`docker-compose-dev.yml`은 `./src`와 `./data`를 연결하므로 재빌드 없이 소스 수정이 반영됩니다.

```bash
cp .env.template .env    # HTTP_WEB_PORT 설정
docker compose -f docker-compose-dev.yml up -d --build
```

변경을 내려받은 후에는 `--build`를 유지하세요. nginx 설정은 저장소에서 마운트하지만 나머지 `docker/` 설정은 이미지에 포함되므로 서로 일치해야 합니다.

## 작업 관례

- PR 하나에는 주제 하나만 담으세요. 작고 명확할수록 검토가 빠릅니다.
- 다크 모드는 `src/public/css/dark-mode/`에 `html[data-theme='dark'] X` 형태로 작성하세요. 작은따옴표와 표기를 유지하세요. [CSS 안내](../src/public/css/README.md)를 참고하세요.
- 사용자에게 보이는 문구는 하드코딩하지 말고 번역 도우미를 사용하세요.
- README와 `docs/`의 문서(`API-REST.md` 제외)는 앱의 각 지원 언어로 제공됩니다. 파일명은 `docs/README.fr.md`, `docs/WEBHOOKS.de.md` 같은 형식입니다. 영어 문구만 바꾸는 것은 CI를 통과하지만 제목·코드 블록·이미지·링크를 추가하거나 제거하면 번역도 함께 맞춰야 합니다. 문서 작업을 관리자에게 맡기고 싶다면 PR에 명시하세요. 번역할 때 영어판과 같은 제목 구조와 순서를 유지하고 링크 대상과 앵커는 우선 영어판 그대로 둔 뒤 `python3 tools/docs-i18n.py fix`와 `python3 tools/docs-i18n.py check`를 실행하세요.
- `src/public/js/excalidraw-dist`나 `src/public/js/codemirror-dist`의 생성된 번들은 직접 고치지 마세요. `build/`의 소스를 수정하고 재빌드하세요.

## 버그와 아이디어

버그는 [이슈](https://github.com/timothepoznanski/poznote/issues), 기능 아이디어와 질문은 [토론](https://github.com/timothepoznanski/poznote/discussions)에 남겨 주세요.

원문: [CONTRIBUTING.md](../CONTRIBUTING.md)
