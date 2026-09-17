<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <b>Русский</b> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Устранение неполадок при установке

<details>
<summary><strong>Предупреждения «mkdir() (permission denied)» или «Connection failed»</strong></summary>
<br>

Если вы видите ошибки вроде:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- Папка `database` создаётся с владельцем `root:root` вместо `www-data:www-data`

Это известная проблема с монтированием томов Docker в некоторых средах (Komodo, Portainer и т. д.). В некоторых конфигурациях контейнер не может изменить права доступа на смонтированных томах.

**Решение:** перед запуском контейнера задайте правильные права доступа на хост-машине:

```bash
# Перейдите в каталог Poznote
cd poznote

# Создайте структуру каталога data с правильными правами доступа
mkdir -p data/database

# Назначьте владельцем UID 82 (www-data в Alpine Linux)
sudo chown -R 82:82 data

# Запустите контейнер
docker compose up -d
```

</details>

<details>
<summary><strong>«Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database»</strong></summary>
<br>

Сначала попробуйте остановить и снова запустить контейнер и дождаться инициализации базы данных (обновите страницу).

Если это не помогло, остановите контейнер и исправьте владельца папки `data` (подставьте UID/GID для своей системы, в примере используется 1000:1000):

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Примечание:** UID 82 соответствует пользователю `www-data` в Alpine Linux, на котором основан Docker-образ Poznote.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Запуск без root (docker-compose.rootless.yml)</strong></summary>
<br>

Poznote также поставляется в варианте образа rootless, который полностью работает от имени непривилегированного пользователя (uid/gid `1000`, имя пользователя `poznote`), а не от root. Он предназначен для сред, где root внутри контейнеров запрещён (Kubernetes с ограниченным `PodSecurityStandard`, Podman без root, `docker run --user` и т. д.).

В отличие от образа по умолчанию, в этом варианте при запуске нет процесса с правами root, который мог бы исправить владельца несовпадающего bind mount с хоста, поэтому `./data` **должен принадлежать uid/gid 1000 до первого запуска**:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Если пропустить этот шаг, контейнер сразу завершается при запуске с ошибкой, в которой точно указано, что нужно выполнить.

Обратите внимание, что `sudo` для этого шага часто не нужен:

- Если у вашего пользователя на хосте уже uid `1000` (первый пользователь, создаваемый в большинстве дистрибутивов Linux), `mkdir -p data` создаст каталог с нужным владельцем, и `chown` можно полностью пропустить.
- С Podman или Docker в режиме rootless выполните chown внутри пространства имён пользователя, без каких-либо прав root:

```bash
# Podman в режиме rootless
podman unshare chown -R 1000:1000 data
# Docker в режиме rootless
rootlesskit chown -R 1000:1000 data
```

Для новой установки следуйте разделу [Установка без root](README.ru.md#rootless) в README. Чтобы перенести существующий экземпляр Poznote, остановите его, сделайте резервную копию и смените владельца каталога данных, затем запустите вариант rootless:

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

Веб-сервер rootless внутри контейнера слушает порт `8080` вместо `80` (доступны только непривилегированные порты); `HTTP_WEB_PORT` из вашего `.env` по-прежнему задаёт порт на стороне хоста без изменений.

Чтобы собрать образ rootless из исходного кода, а не скачивать его, замените строку `image:` в `docker-compose.rootless.yml` на `build: { context: ., target: rootless }` (тогда потребуется клон этого репозитория).

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>Запуск с <code>network_mode: host</code></strong></summary>
<br>

По умолчанию Docker сопоставляет порт хоста с контейнером: веб-сервер слушает порт `80` внутри контейнера (`8080` для rootless-образа), а `HTTP_WEB_PORT` задаёт порт на хосте. С `network_mode: host` сопоставления нет. Контейнер напрямую занимает порты хоста, где порт `80` обычно уже принадлежит другому веб-серверу или контейнеру.

Задайте порт, который слушает веб-сервер, через `POZNOTE_LISTEN_PORT` в `.env` (для rootless-образа порт выше 1023):

```bash
POZNOTE_LISTEN_PORT=8040
```

Затем в `docker-compose.yml` (или `docker-compose.rootless.yml`) замените раздел `ports:` обоих сервисов на `network_mode: host`. Серверу MCP нужны ещё два изменения: он больше не может обратиться к веб-серверу по имени сервиса, а его образ слушает все интерфейсы, что в режиме host означает все интерфейсы хоста. Направьте его на новый порт и привяжите к localhost:

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

Пересоздайте контейнеры (перезапуск не перечитывает переменные окружения):

```bash
docker compose up -d --force-recreate
```

Значение применяется скриптом инициализации контейнера при каждом запуске; недопустимое значение отмечается в логе, и сохраняется значение образа по умолчанию. `HTTP_WEB_PORT` больше не используется, а `POZNOTE_MCP_PORT` теперь задаёт порт, который слушает сервер MCP. Проверка работоспособности в текущем `docker-compose.yml` следует за `POZNOTE_LISTEN_PORT`: если ваш файл всё ещё обращается к `http://127.0.0.1/api/health`, скачайте его заново или измените URL, иначе контейнер останется `unhealthy` или будет проверять то, что ещё отвечает на порту `80`.

В режиме host веб-сервер слушает все интерфейсы хоста: фильтруйте порт межсетевым экраном или оставьте его доступным только через ваш обратный прокси. Внутри контейнера nginx и PHP общаются через unix-сокет, поэтому Poznote не занимает на хосте других портов, и несколько экземпляров могут работать рядом на разных портах.

</details>

<details>
<summary><strong>«This site can't be reached»</strong></summary>
 <br>

Если браузер показывает «This site can't be reached», возможно, у вас включён SELinux. В этом случае проверьте логи контейнера:

```bash
docker logs poznote-webserver-1
# или с podman
podman logs poznote-webserver-1
```

Скорее всего, вы увидите:
- `chown: /var/www/html/data: Permission denied`

Это происходит, когда у томов Docker нет правильного контекста SELinux, особенно при установке из каталога `/root`.

**Решение:** настоятельно рекомендуем использовать суффикс `:Z` для томов Docker и не использовать каталог `/root`, чтобы всё корректно работало во всех дистрибутивах.

Отредактируйте `docker-compose.yml`, добавив `:Z` к определениям томов:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Либо установите Poznote в каталог вне `/root`, например в `/opt/poznote` или `~/poznote`.

</details>

<details>
<summary><strong>«Неверное имя пользователя или пароль»</strong></summary>
<br>

1. Попробуйте войти как «admin» или «admin_change_me» со своим паролем.
2. Пароли управляются через интерфейс Poznote, а не через `.env`. Пока пароль не изменён в интерфейсе, действуют встроенные значения по умолчанию: `admin` для администраторов, `user` для обычных пользователей.
3. Если вы можете войти как администратор, но не как обычный пользователь, проверьте, отмечен ли профиль как **Активен** в панели «Управление пользователями».

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>Приложение перестаёт отвечать под нагрузкой (ошибки автосохранения, «server reached pm.max_children»)</strong></summary>
<br>

PHP-запросы обслуживаются фиксированным пулом рабочих процессов php-fpm, по умолчанию их 10. Короткие запросы (автосохранение, опросы, загрузка страниц) никогда его не заполняют. Длинные заполняют: потоковая передача ответа ИИ-чата, обращение к S3, синхронизация с Git, загрузка большого файла. Когда все рабочие процессы заняты, все остальные запросы ждут, браузер при сохранении показывает сетевую ошибку, а в логе контейнера появляется:

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

На нагруженном экземпляре (несколько пользователей, используются ИИ-чат, S3 или синхронизация с Git) увеличьте пул с помощью переменной `POZNOTE_PHP_FPM_MAX_CHILDREN` в `.env`, затем пересоздайте контейнер (перезапуск не перечитывает переменные окружения):

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Каждый занятый рабочий процесс расходует около 25-30 МБ памяти, а простаивающих процессов немного при любом значении, так что 20 безопасно на хосте с 1 ГБ, а 10 подходит для хоста с 512 МБ. Значение применяется скриптом инициализации контейнера при каждом запуске; недопустимое значение отмечается в логе, и сохраняется значение образа по умолчанию.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>Запрос завершается ошибкой «Allowed memory size exhausted»</strong></summary>
<br>

По умолчанию каждый PHP-запрос может использовать до 512 МБ. Это потолок, а не резервирование (простаивающий рабочий процесс занимает около 25 МБ), и его задача в том, чтобы вышедший из-под контроля запрос завершался понятной строкой в логе PHP, а не обрушивал хост:

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Резервное копирование, восстановление, экспорт и скачивание работают с диском потоково и требуют всего несколько МБ независимо от объёма учётной записи, поэтому такое должно случаться только с отдельной заметкой размером в десятки МБ. Если в этот предел упирается резервное копирование или скачивание, это ошибка: сообщите о ней, приложив строку из лога.

Чтобы увеличить лимит, задайте `POZNOTE_PHP_MEMORY_LIMIT` в `.env` (целое число МБ), затем пересоздайте контейнер (перезапуск не перечитывает переменные окружения):

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

Никогда не задавайте значение больше объёма памяти хоста: запрос, превысивший доступную машине память, завершается ядром без какого-либо сообщения и может увлечь за собой весь контейнер. На хосте с 512 МБ оставьте значение по умолчанию. Значение применяется скриптом инициализации контейнера при каждом запуске; недопустимое значение отмечается в логе, и сохраняется значение образа по умолчанию.

</details>
