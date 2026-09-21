<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <b>简体中文</b>
</p>
<!-- /lang-selector -->

# 安装故障排除

<details>
<summary><strong>“mkdir() 警告（permission denied）或 Connection failed”</strong></summary>
<br>

如果您遇到以下错误：
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- `database` 文件夹以 `root:root` 而不是 `www-data:www-data` 身份创建

这是某些环境（Komodo、Portainer 等）中 Docker 卷挂载的已知问题。在某些配置下，容器无法更改已挂载卷的权限。

**解决方法：** 在启动容器之前，先在宿主机上设置正确的权限：

```bash
# 进入您的 Poznote 目录
cd poznote

# 以正确的权限创建数据目录结构
mkdir -p data/database

# 将所有者设为 UID 82（Alpine Linux 中的 www-data）
sudo chown -R 82:82 data

# 启动容器
docker compose up -d
```

</details>

<details>
<summary><strong>“Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database”</strong></summary>
<br>

首先，尝试停止并重新启动容器，然后等待数据库初始化完成（刷新页面）。

如果这样仍然无效，请停止容器并修正 `data` 文件夹的所有者（请根据您的环境调整 UID/GID，示例使用 1000:1000）：

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **注意：** UID 82 对应 Alpine Linux 中的 `www-data` 用户，Poznote Docker 镜像使用的就是该用户。

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>以 rootless 方式运行（docker-compose.rootless.yml）</strong></summary>
<br>

Poznote 还提供一个 rootless 镜像变体，它完全以非特权用户（uid/gid `1000`，用户名 `poznote`）而非 root 身份运行，适用于禁止在容器内使用 root 的环境（Kubernetes 受限的 `PodSecurityStandard`、rootless Podman、`docker run --user` 等）。

与默认镜像不同，该变体在启动时没有可用的 root 进程来修正不匹配的宿主机绑定挂载的所有者，因此 **在首次启动之前，`./data` 必须归 uid/gid 1000 所有**：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

如果跳过这一步，容器会在启动时立即退出，并给出一条错误信息，准确说明需要运行什么命令。

注意，这一步通常不需要 `sudo`：

- 如果您的宿主机用户的 uid 已经是 `1000`（大多数 Linux 发行版上创建的第一个用户），`mkdir -p data` 创建的目录所有者就是正确的，完全可以跳过 `chown`。
- 使用 rootless Podman 或 rootless Docker 时，请改为在用户命名空间内运行 chown，无需任何 root 权限：

```bash
# rootless Podman
podman unshare chown -R 1000:1000 data
# rootless Docker
rootlesskit chown -R 1000:1000 data
```

全新安装请按照 README 中的 [Rootless 安装方法](README.zh-cn.md#rootless) 进行。要迁移现有的 Poznote 实例，请先停止它，备份数据目录并重新设置其所有者，然后启动 rootless 变体：

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

rootless 网页服务器在内部监听 `8080` 端口而不是 `80`（只能使用非特权端口）；`.env` 中的 `HTTP_WEB_PORT` 仍然控制宿主机侧的端口，保持不变。

如果要从源码构建 rootless 镜像而不是拉取镜像，请将 `docker-compose.rootless.yml` 中的 `image:` 行替换为 `build: { context: ., target: rootless }`（此时需要克隆本仓库）。

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>使用 <code>network_mode: host</code> 运行</strong></summary>
<br>

默认情况下，Docker 会把宿主机端口映射到容器：网页服务器在容器内监听 `80` 端口（rootless 镜像为 `8080`），`HTTP_WEB_PORT` 决定宿主机上的端口。使用 `network_mode: host` 时没有端口映射，容器直接占用宿主机的端口，而宿主机的 `80` 端口通常已被其他网页服务器或容器占用。

在 `.env` 中用 `POZNOTE_LISTEN_PORT` 设置网页服务器监听的端口（rootless 镜像需使用大于 1023 的端口）：

```bash
POZNOTE_LISTEN_PORT=8040
```

然后在 `docker-compose.yml`（或 `docker-compose.rootless.yml`）中，把两个服务的 `ports:` 部分替换为 `network_mode: host`。MCP 服务器还需要两处修改：它无法再通过服务名访问网页服务器，而且它的镜像监听所有网络接口，在 host 模式下就是宿主机的所有网络接口。请将它指向新端口，并绑定到 localhost：

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

重新创建容器（重启不会重新加载环境变量）：

```bash
docker compose up -d --force-recreate
```

该值由容器的初始化脚本在每次启动时应用；如果值无效，会在日志中报告，并保留镜像的默认值。`HTTP_WEB_PORT` 不再使用，`POZNOTE_MCP_PORT` 现在用于设置 MCP 服务器监听的端口。当前 `docker-compose.yml` 的健康检查会跟随 `POZNOTE_LISTEN_PORT`：如果您的文件仍在访问 `http://127.0.0.1/api/health`，请重新下载该文件或修改 URL，否则容器会一直处于 `unhealthy` 状态，或检查的是 `80` 端口上其他应答的服务。

在 host 模式下，网页服务器监听宿主机的所有网络接口：请用防火墙过滤该端口，或只允许通过反向代理访问。容器内部的 nginx 与 PHP 通过 unix 套接字通信，因此 Poznote 不会占用宿主机上的其他端口，多个实例可以在不同端口上并行运行。

</details>

<details>
<summary><strong>“This site can't be reached”</strong></summary>
 <br>

如果浏览器显示“This site can't be reached”，可能是因为启用了 SELinux。这种情况下，请查看容器日志：

```bash
docker logs poznote-webserver-1
# 或者使用 podman
podman logs poznote-webserver-1
```

您很可能会看到：
- `chown: /var/www/html/data: Permission denied`

当 Docker 卷没有正确的 SELinux 上下文时就会出现这种情况，尤其是在 `/root` 目录下安装时。

**解决方法：** 我们强烈建议为 Docker 卷使用 `:Z` 后缀，并避免使用 `/root` 目录，以确保在所有发行版上都能正常运行。

编辑 `docker-compose.yml`，在卷定义中添加 `:Z`：

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

或者，将 Poznote 安装到 `/root` 以外的目录，例如 `/opt/poznote` 或 `~/poznote`。

</details>

<details>
<summary><strong>“用户名或密码错误”</strong></summary>
<br>

1. 尝试使用“admin”或“admin_change_me”以及您的密码登录。
2. 密码通过 Poznote 界面管理，而不是通过 `.env`。在界面中修改密码之前，使用内置的默认密码：管理员为 `admin`，普通用户为 `user`。
3. 如果您能以管理员身份登录，却无法以普通用户身份登录，请在“用户管理”面板中检查该用户资料是否被标记为 **激活**。

</details>

<details>
<summary><strong>管理员密码丢失</strong></summary>
<br>

如果另一位管理员仍能登录，可以在 **Settings > Admin Tools > User Management** 中为您设置新密码。否则，请直接在主数据库中重置。在主机上的 Poznote 目录中执行（主机上需安装 `sqlite3` 命令行工具，Poznote 镜像中不包含它）：

```bash
sudo sqlite3 data/master.db "UPDATE users SET password_hash=NULL, password_login_disabled=0 WHERE id=1;"
```

这会清除第一个账户（id 1，始终是管理员）已保存的密码，内置默认值随之重新生效：使用该账户的用户名和密码 `admin` 登录，然后立即在 **Settings > Change Password** 中修改。要重置其他账户，请将 `WHERE id=1` 替换为 `WHERE username='其用户名'`；普通用户会回退到密码 `user`。

如果该账户启用了双重身份验证，登录表单在密码之后仍会要求输入验证码。如果设备也丢失了，请参阅下一条。

</details>

<a id="two-factor-lockout"></a>
<details>
<summary><strong>被双重身份验证锁在门外（设备和恢复代码均已丢失）</strong></summary>
<br>

启用双重身份验证时获得的每个恢复代码都可用于登录一次：在验证码界面选择 **Use a recovery code**。如果一个都没有，管理员可以在 **Settings > Admin Tools > User Management** 中您账户的密码对话框里为您停用双重身份验证。

如果您是唯一的管理员，请直接在主数据库中移除第二重验证。在主机上的 Poznote 目录中执行（主机上需安装 `sqlite3` 命令行工具）：

```bash
sudo sqlite3 data/master.db "DELETE FROM user_totp_recovery_codes WHERE user_id=1; DELETE FROM user_totp WHERE user_id=1;"
```

将 `1` 替换为该账户的 id（`sudo sqlite3 data/master.db "SELECT id, username FROM users;"` 可列出所有账户）。之后仅凭密码即可登录，为该账户签发的 “Remember me” cookie 将失效，并且可以在 **Settings > Two-factor authentication** 中重新设置双重身份验证。

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>应用在高负载下停止响应（自动保存出错，“server reached pm.max_children”）</strong></summary>
<br>

PHP 请求由固定数量的 php-fpm 工作进程组成的进程池处理，默认 10 个。短请求（自动保存、轮询、页面加载）永远不会占满它。长请求则会：正在流式传输的 AI 聊天回答、S3 调用、git 同步、大文件上传。一旦所有工作进程都在忙，其他请求都要等待，浏览器在保存时会显示网络错误，容器日志中会出现：

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

在繁忙的实例上（多个用户，或使用了 AI 聊天、S3、git 同步），请在 `.env` 中通过 `POZNOTE_PHP_FPM_MAX_CHILDREN` 变量扩大进程池，然后重新创建容器（重启不会重新加载环境变量）：

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

每个忙碌的工作进程大约占用 25-30 MB 内存，而无论取值多少，空闲工作进程都很少，因此在 1 GB 内存的主机上设为 20 是安全的，512 MB 的主机则适合设为 10。该值由容器的初始化脚本在每次启动时应用；如果值无效，会在日志中报告，并保留镜像的默认值。

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>请求失败并提示“Allowed memory size exhausted”</strong></summary>
<br>

默认情况下，每个 PHP 请求最多可使用 512 MB 内存。这是一个上限，而不是预留量（一个空闲工作进程大约占用 25 MB），它的作用是让失控的请求失败，并在 PHP 日志中留下一行可读的信息，而不是拖垮整台主机：

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

备份、恢复、导出和下载都以流式方式写入磁盘，无论账户有多大，都只需要几 MB 内存，因此只有单条笔记达到几十 MB 时才会出现这种情况。如果备份或下载触发了这个错误，那就是一个 bug，请连同日志行一起报告。

要提高该上限，请在 `.env` 中设置 `POZNOTE_PHP_MEMORY_LIMIT`（以 MB 为单位的整数），然后重新创建容器（重启不会重新加载环境变量）：

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

切勿将其设置得高于主机的内存：超出机器实际内存的请求会被内核直接杀死，不会留下任何信息，还可能连带整个容器一起崩溃。在 512 MB 内存的主机上，请保持默认值。该值由容器的初始化脚本在每次启动时应用；如果值无效，会在日志中报告，并保留镜像的默认值。

</details>
