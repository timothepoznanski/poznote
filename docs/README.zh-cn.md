<!-- lang-selector -->
<p align="center">
  <a href="../README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.ru.md">Русский</a> ·
  <b>简体中文</b>
</p>
<!-- /lang-selector -->


<p align="center">
  <img src="../images/poznote-logo-text.png" alt="Poznote Logo" width="400">
</p>

<h2 align="center">
强大的笔记工具，毫不繁琐。
</h2>

<h3 align="center">
一款免费、自托管、开源的 Notion、Obsidian、Evernote 或 OneNote 替代品。
</h3>

<p align="center">
  <a href="https://github.com/timothepoznanski/poznote/releases"><img src="https://img.shields.io/github/v/release/timothepoznanski/poznote?label=release&color=1f6feb" alt="Latest release"></a>
  <a href="https://github.com/timothepoznanski/poznote/pkgs/container/poznote"><img src="https://img.shields.io/badge/ghcr.io-poznote-2496ed?logo=docker&logoColor=white" alt="Docker image"></a>
  <a href="https://github.com/timothepoznanski/poznote/blob/main/LICENCE"><img src="https://img.shields.io/github/license/timothepoznanski/poznote?color=44cc11" alt="License MIT"></a>
  <a href="https://github.com/timothepoznanski/poznote/stargazers"><img src="https://img.shields.io/github/stars/timothepoznanski/poznote?color=f5b400" alt="GitHub stars"></a>
  <a href="https://github.com/timothepoznanski/poznote/issues?q=is%3Aissue+is%3Aclosed"><img src="https://img.shields.io/github/issues-closed/timothepoznanski/poznote?label=issues%20closed&color=44cc11" alt="Closed issues"></a>
  <a href="https://github.com/timothepoznanski/poznote/discussions"><img src="https://img.shields.io/github/discussions/timothepoznanski/poznote?label=discussions&logo=github&color=8957e5" alt="GitHub Discussions"></a>
  <a href="https://demo.poznote.com"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live demo"></a>
</p>

<p align="center">
  <img src="../images/pres1.png" alt="Poznote-light" width="100%">
</p>

### 功能

在[这里](https://poznote.com/#features)了解全部功能。

### 截图

在[这里](https://poznote.com/screenshots.html)查看全部截图。

### 演示

https://demo.poznote.com

**用户名**：poznote<br>
**密码**：poznote

### 媒体报道

https://poznote.com/press.html

### Discord

加入社区，提出问题、分享反馈或关注开发进展：

https://discord.gg/AWhWWSEkJ

## 目录

- [安装](#安装)
- [访问](#访问)
- [修改设置](#修改设置)
- [更新应用](#更新应用)
- [身份验证](#身份验证)
- [应用密码](#应用密码)
- [笔记类型](#笔记类型)
- [快照](#快照)
- [个性化](#个性化)
- [多用户](#多用户)
- [活动日志](#活动日志)
- [Webhook](#webhook)
- [Git 同步](#git-同步)
- [S3 附件存储](#s3-附件存储)
- [S3 备份](#s3-备份)
- [备份 / 导出](#备份--导出)
- [还原 / 导入](#还原--导入)
- [离线浏览](#离线浏览)
- [多实例](#多实例)
- [AI 助手](#ai-助手)
- [转录（语音转文字）](#转录语音转文字)
- [MCP 服务器](#mcp-服务器)
- [Chrome 扩展](#chrome-扩展)
- [在 Android 上分享到 Poznote](#在-android-上分享到-poznote)
- [API 文档](#api-文档)
- [技术栈](#技术栈)

## 安装

> 官方镜像为多架构镜像（linux/amd64、linux/arm64），可通过 Docker Desktop 在 Windows/macOS 上运行，也支持 Raspberry Pi、NAS 等 ARM64 设备。

请在下方选择您偏好的安装方式：

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### 第 1 步：前提条件

安装并启动 [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### 第 2 步：部署 Poznote

创建一个新目录：

```powershell
mkdir poznote
```

进入 Poznote 目录：
```powershell
cd poznote
```

创建环境变量文件：

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

编辑 `.env` 文件：

```powershell
notepad .env
```

下载 Docker Compose 配置文件：

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

下载最新的 Poznote Webserver 和 Poznote MCP 镜像：
```powershell
docker compose pull
```

启动 Poznote 容器：
```powershell
docker compose up -d
```

</details>

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### 第 1 步：前提条件

1. 安装 [Docker engine](https://docs.docker.com/engine/install/)
2. 安装 [Docker Compose](https://docs.docker.com/compose/install/linux)

#### 第 2 步：安装 Poznote

创建一个新目录：
```bash
mkdir poznote
```

进入 Poznote 目录：
```bash
cd poznote
```

创建环境变量文件：
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

编辑 `.env` 文件：
```bash
vi .env
```

下载 Docker Compose 配置文件：
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

下载最新的 Poznote Webserver 和 Poznote MCP 镜像：
```bash
docker compose pull
```

启动 Poznote 容器：
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### 第 1 步：前提条件

安装并启动 [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### 第 2 步：部署 Poznote

创建一个新目录：
```bash
mkdir poznote
```

进入 Poznote 目录：
```bash
cd poznote
```

下载环境变量文件：
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

编辑 `.env` 文件：
```bash
vi .env
```

下载 Docker Compose 配置文件：
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

下载最新的 Poznote Webserver 和 Poznote MCP 镜像：
```bash
docker compose pull
```

启动 Poznote 容器：
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ 云端</strong></summary><br>

不想自己管理服务器？Poznote 可以在几分钟内部署到云端。

云托管方案请见 [poznote.com/hosting.html](https://poznote.com/hosting.html)。

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

在 Proxmox VE 主机上，Proxmox VE Community Scripts 项目只需一条命令即可将 Poznote 安装到独立的容器中，全程无需 Docker：它会创建一个非特权的 Debian 13 LXC（默认 1 个 vCPU、512 MB 内存和 4 GB 磁盘），并在其中通过 nginx 和 PHP 提供 Poznote 服务。

在 Proxmox 主机的 shell 中运行：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

之后即可通过 `http://<container-ip>:8040` 访问 Poznote，默认凭据与其他安装方式相同。以后如需更新，在容器控制台中运行 `update` 即可。

该脚本由社区编写和维护，并非由 Poznote 提供。其选项和说明请参阅 [Poznote 脚本页面](https://community-scripts.org/scripts/poznote)。

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ 使用 Helm 部署到 Kubernetes</strong></summary>

#### 第 1 步：前提条件

安装 [Helm](https://helm.sh/docs/intro/install/)，并确保您的 Kubernetes 上下文指向要部署 Poznote 的集群。

#### 第 2 步：部署 Poznote

添加 HelmForge chart 仓库：

```bash
helm repo add helmforge https://repo.helmforge.dev
```

更新本地 chart 索引：

```bash
helm repo update
```

安装 Poznote：

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

Poznote Helm chart 由 HelmForge 社区维护，是一种 Kubernetes 原生的安装方式。关于 values、持久化、服务暴露、探针、安全上下文以及其他面向生产环境的设置，请参阅 [HelmForge Poznote chart 文档](https://helmforge.dev/docs/charts/poznote)。

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

Poznote 还提供一个 rootless 镜像变体，完全以非特权用户（uid/gid `1000`）而非 root 身份运行，适用于禁止在容器内使用 root 的环境（Kubernetes 受限的 `PodSecurityStandard`、rootless Podman、`docker run --user` 等）。它的用法与默认镜像完全相同，唯一的区别是它在内部监听 `8080` 端口，并且无法在启动时修正数据目录的所有权。

#### 第 1 步：前提条件

1. 安装 [Docker engine](https://docs.docker.com/engine/install/)
2. 安装 [Docker Compose](https://docs.docker.com/compose/install/linux)

#### 第 2 步：部署 Poznote

创建一个新目录：
```bash
mkdir poznote
```

进入 Poznote 目录：
```bash
cd poznote
```

创建数据目录，并将其所有者设为 uid/gid `1000`（**必需**：与默认镜像不同，rootless 容器无法在启动时自行修正所有权）：
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

这里通常不需要 `sudo`：如果您的用户 uid 已经是 `1000`，可以跳过 `chown`；在 rootless Podman/Docker 上，它无需 root 权限即可运行，参见[以 rootless 方式运行](TROUBLESHOOTING.zh-cn.md#running-rootless)。

创建环境变量文件：
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

编辑 `.env` 文件：
```bash
vi .env
```

下载 rootless 版 Docker Compose 配置文件：
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

下载最新的 Poznote rootless Webserver 和 Poznote MCP 镜像：
```bash
docker compose -f docker-compose.rootless.yml pull
```

启动 Poznote 容器：
```bash
docker compose -f docker-compose.rootless.yml up -d
```

如需将现有的 Poznote 实例迁移到 rootless 变体，或了解更多细节，请参阅故障排除指南中的[以 rootless 方式运行](TROUBLESHOOTING.zh-cn.md#running-rootless)。

</details>

<br>

> 如果在安装过程中遇到问题，请参阅[故障排除指南](TROUBLESHOOTING.zh-cn.md)。

## 访问

安装完成后，在浏览器中访问 Poznote：

[http://localhost:8040](http://localhost:8040)


- 用户名：`admin_change_me`
- 密码：`admin`
- 端口：`8040`

首次登录后，请重命名默认管理员账户并修改默认密码。

## 修改设置

大多数日常设置都在 Poznote 界面中修改。`.env` 文件只用于容器启动时读取的部署/运行时参数。

<details>
<summary><strong>以下内容使用 <code>.env</code> 文件</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- 可选的运行时覆盖参数，例如 `POZNOTE_MCP_PORT` 和 `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN`，用于在繁忙的实例上调整同时处理的 PHP 请求数（默认 10），参见[故障排除指南](TROUBLESHOOTING.zh-cn.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT`，用于调整每个请求的 PHP 内存上限，单位为 MB（默认 512），参见[故障排除指南](TROUBLESHOOTING.zh-cn.md#a-request-runs-out-of-memory)
- `POZNOTE_SETTINGS_PASSWORD`，用于在打开设置页面前额外要求输入一个密码，默认留空
- `POZNOTE_MCP_AUTH_TOKEN`，用于要求 MCP 客户端提供 bearer token，参见 [MCP 服务器](#mcp-服务器)

</details>

<details>
<summary><strong>以下内容使用界面</strong></summary>
<br>

- 管理员/全局设置，例如 OIDC 提供商设置、启用 Git 同步、导入限制以及上传自定义 CSS
- 用户/个人资料设置，例如本地账户密码、主题、字体大小、笔记排序、工作区背景以及隐藏的界面元素

</details>


### 修改系统设置（`.env`）

进入您的 Poznote 目录：
```bash
cd poznote
```

停止正在运行的 Poznote 容器：
```bash
docker compose down
```

使用您喜欢的文本编辑器编辑 `.env` 文件（例如 `nano .env` 或 `notepad .env`）。

保存文件，然后重新启动容器以应用更改：
```bash
docker compose up -d
```

## 更新应用

进入您的 Poznote 目录：
```bash
cd poznote
```

更新前先停止正在运行的容器：
```bash
docker compose down
```

下载最新的 Docker Compose 配置：
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

下载最新的 `.env.template`：
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

使用 sdiff 对比 `.env.template`，如有需要，将新增的变量添加到您的 `.env` 文件中：
```bash
sdiff .env .env.template
```

下载最新的 Poznote Webserver 和 Poznote MCP 镜像：
```bash
docker compose pull
```

启动更新后的容器：
```bash
docker compose up -d
```

您的数据保存在 `./data` 目录中，不会受到更新的影响。

## 身份验证

Poznote 支持多种身份验证方式，包括本地账户和外部身份提供商。与 REST API 通信的应用和扩展使用[应用密码](#应用密码)，这是一种独立的凭据，下一节会详细介绍。

<details>
<summary><strong>本地账户身份验证</strong></summary>
<br>

Poznote 通过用户名或电子邮件地址加密码，对照用户的个人资料进行身份验证。


#### 默认账户

全新安装时，Poznote 会创建一个处于启用状态的管理员资料：

- 用户名：`admin_change_me`
- 密码：`admin`

首次登录后，请修改默认密码并重命名该账户。

#### 密码管理

密码通过 Poznote 网页界面管理，而不是通过 `.env`：

- 用户可以在 **设置 > 修改密码** 中修改自己的密码。
- 管理员可以在 **设置 > 管理工具 > 用户管理** 中为任意用户设置自定义密码，或将其重置为默认密码。
- **保持登录 30 天** 选项会将会话保留 30 天。
- 修改密码后，该用户现有的“保持登录”cookie 将全部失效。

#### 默认密码

- 管理员账户：`admin`
- 普通用户账户：`user`

用户尚未修改密码时，使用上面的默认值。一旦通过界面修改了密码，数据库中就会存储一个安全的 bcrypt 哈希，并优先使用该密码。

</details>

<a id="oidc"></a>
<details>
<summary><strong>OIDC / SSO 身份验证（可选）</strong></summary>
<br>

Poznote 支持 OpenID Connect（授权码 + PKCE），用于集成单点登录。用户可以借此通过 Auth0、Keycloak、Azure AD 或 Google Identity 等外部身份提供商登录。

#### 工作原理

1. 启用 OIDC 后，登录页面会显示一个 `Continue with [Provider Name]` 按钮。
2. 用户通过受 PKCE 保护的 OIDC 授权码流程进行身份验证。
3. 可以通过允许的组来限制访问，如有需要，还可以使用旧版的允许用户列表。
4. 身份验证完成后，Poznote 按以下顺序关联身份：`sub`（`oidc_subject`），然后是 `preferred_username`，最后是 `email`。
5. 如果启用了自动创建用户且没有匹配的资料，Poznote 会自动创建一个。这样创建的资料**完全没有密码**：它没有经过管理员创建账户时的初始凭据交接流程，因此不接受默认密码。登录需通过身份提供商进行，或者由管理员在 **设置 > 管理工具 > 用户管理** 中为其设置明确的密码。
6. 如果 `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`，用户名/密码表单将被隐藏，登录页面变为仅支持 SSO。
7. 启用 OIDC 后，REST API 客户端可以使用 `Authorization: Bearer <OIDC JWT>` 进行身份验证；Poznote 会校验提供商的 JWKS、issuer、过期时间、audience 以及已配置的访问控制。
8. 完全无法执行 OIDC 流程的客户端（浏览器扩展、移动应用、脚本）改用[应用密码](#应用密码)，每个用户可在自己的设置中创建。

#### 配置

OIDC 在**管理界面**中配置：前往 **设置 > 管理工具 > OIDC / SSO**。

大多数设置（启用状态、issuer、提供商名称、scopes、访问控制、允许的组/用户、自动创建用户、HTTP Basic Auth 行为等）都在此页面管理，并存储在数据库中。

对于 REST API 的 Bearer JWT 身份验证，如果您的提供商为专用的 API audience 签发访问令牌，请配置 **API JWT 受众**。留空时，Poznote 接受已配置的 OIDC Client ID 作为 JWT audience。

以下设置仍保留在 `.env` 文件中：

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

如果要隐藏本地用户名/密码表单并强制仅使用 SSO 登录，请设置 `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`。这是唯一能阻止密码身份验证的开关：它会移除表单，在服务器端拒绝密码 POST 请求，并隐藏“修改密码”设置。

> **身份提供商故障时如何恢复。** 仅 SSO 就是字面意思：只要 `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`，任何人（包括管理员）都无法使用密码登录，因此浏览器内没有任何应急入口。这是有意为之，因为攻破了管理员账户的攻击者无法重新启用密码登录来为自己留下持久的入口。恢复需要服务器访问权限：在 `.env` 中设置 `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false`，重启容器，然后使用本地密码登录。启用仅 SSO 之前，请确保至少有一个管理员账户设置了明确的密码（**设置 > 管理工具 > 用户管理**），否则把开关改回去也无济于事。请注意，由 OIDC 自动创建的管理员资料在设置密码之前是没有密码的。

> **破坏性变更：** `.env` 中以前的 OIDC 设置不再被读取，`POZNOTE_OIDC_CLIENT_ID`、`POZNOTE_OIDC_CLIENT_SECRET` 和 `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN` 除外。升级后，请在管理页面中重新填写其他 OIDC 设置。

#### 访问控制示例（组 + 自动创建）

在 OIDC 管理页面中配置：
- **Groups Claim：** `groups`
- **允许的组：** `poznote`
- **首次通过 OIDC 登录时自动创建用户资料：** 启用

如果启用了自动创建，Poznote 会根据 OIDC claims（`preferred_username`、`nickname`、电子邮件的本地部分、`name`，最后是 `sub`）生成用户名，并将 OIDC subject 存储在所创建的资料中。

</details>

## 应用密码

应用无法像浏览器那样通过身份提供商登录。**应用密码**是您为某个客户端（浏览器扩展、手机、脚本）单独创建的凭据，可以随时撤销，因此您永远不必交出账户密码。

在 **设置 > 应用密码** 中创建：为其命名，可选设置过期时间，然后复制生成的密钥。密钥只显示一次，之后不会再显示。然后在客户端中，在要求输入密码的地方填写您平常的用户名和应用密码即可。它以普通的 HTTP Basic Auth 方式传输，因此所有现有客户端都可以直接使用：

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

应用密码只能访问 REST API，而且仅限其所属资料：它无法打开网页界面、调用管理端点、修改您的密码或管理您的账户，即使账户是管理员也不行。因此，泄露的应用密码只会暴露一个账户的笔记，不会波及更多内容，撤销它即可堵住漏洞。在仅 SSO 的实例上，由 OIDC 创建的账户完全没有密码，应用密码是 API 通过 Basic Auth 接受的唯一凭据。

完整的限制列表以及管理应用密码的端点见 [REST API 文档](API-REST.md#authentication)。

## 笔记类型

Poznote 支持两种主要的笔记格式，分别适用于不同的工作流程。

<details>
<summary><strong>HTML 笔记</strong></summary>
&nbsp;

*   **编辑器：** 直接进行所见即所得（WYSIWYG）编辑。
*   **存储：** 以 `.html` 文件保存在用户数据目录中。由于它们是标准 HTML，可以直接用任何浏览器打开。
*   **独有功能：**
    *   **富文本格式：** 原生支持文字颜色、高亮以及标准 HTML 元素。
    *   **交互式界面：** 在编辑器中直接操作元素。
</details>

<details>
<summary><strong>Markdown 笔记</strong></summary>
&nbsp;

*   **编辑器：** 带实时预览的 Markdown 语法编辑器。
*   **存储：** 以 `.md` 文件保存在用户数据目录中。
*   **独有功能：**
    *   **Mermaid 图表：** 原生支持通过 ` ```mermaid ` 代码块生成图表（流程图、时序图等）。
    *   **数学公式：** 完善的 LaTeX 支持，使用 `$ inline $` 和 `$$ block $$` 语法书写数学公式。
    *   **可移植性：** 标准 Markdown 格式，兼容任何外部编辑器或静态网站生成器。
</details>

<details>
<summary><strong>任务列表</strong></summary>
&nbsp;

*   **用途：** 使用交互式清单管理任务和项目。
*   **工作流程：** 通过复选框跟踪进度，复选框可以直接在编辑器或笔记列表中勾选。进度条会显示每个列表的完成情况。
*   **任务选项：** 每个任务都可以设置截止日期（可附带时间）、在截止时间触发的提醒通知以及重要标记，还可以移动到其他列表。
*   **任务页面：** 从左侧图标栏打开的专用任务页面，会把所有任务列表中的任务集中到一处，还可以选择包含普通笔记中的复选框。它提供状态筛选（待办、重要、已逾期、有日期、已完成）、文本筛选，以及显示带截止日期任务的日历视图。
*   **公开协作：** 任务列表可以通过公开 URL 共享。如果授予了编辑权限，外部协作者无需 Poznote 账户即可勾选列表中的条目。
</details>

<details>
<summary><strong>快捷方式</strong></summary>
&nbsp;

*   **功能：** 在另一个位置创建指向现有笔记的引用。
*   **使用场景：** 让同一条笔记同时出现在两个不同的位置。例如，一条笔记可以放在分类文件夹中，而它的快捷方式则出现在看板上，便于跟踪进度。
</details>

<details>
<summary><strong>模板</strong></summary>
&nbsp;

*   **功能：** 重复使用预先写好的内容来统一文档格式，既可以是完整的笔记，也可以是一小段文字。
*   **设置：** 把要重复使用的笔记放进名为 `Templates` 的文件夹（可以包含子文件夹）。名为 `Templates` 的工作区同样有效，并且在所有工作区中都可以使用。该名称也支持界面语言中的对应名称（`Modèles`、`Vorlagen`、`Plantillas`、`Modelos`、`Шаблоны`、`模板`）。
*   **插入到笔记中：** 在 HTML 或 Markdown 笔记中输入 `/template`（或 `/` 加模板标题），然后选择一个模板：其内容会粘贴到光标处，如果模板与笔记类型不同，还会自动转换。
*   **从模板新建笔记：** 复制模板笔记，或者复制整个 `Templates` 文件夹，以现成的文件夹结构开始一个项目。
</details>

<details>
<summary><strong>每日笔记（日记）</strong></summary>
&nbsp;

*   **用途：** 在专门的日记面板中，以日志的形式每天写一条笔记。
*   **工作流程：** “创建今日日记”按钮会创建当天的笔记（笔记已存在时，按钮显示为“前往今日日记”），标题为当前日期，并自动存放在 `Diary/YYYY/MM` 文件夹结构中。
*   **面板视图：** 条目以卡片形式按月分组显示，最新的排在最前面，并提供筛选功能，便于快速找到以前的条目。
*   **连续阅读视图：** 视图控件旁的卷轴按钮会切换为单列阅读模式：每篇日记显示完整内容，最新的排在最前面，随滚动逐步加载。筛选功能同样适用。点击日记或其铅笔图标即可就地编辑，更改会在输入时自动保存。
*   **格式：** 新条目会创建为 HTML 或 Markdown 笔记，取决于 **设置 > 行为** 中的“日记条目格式”设置。
</details>

## 快照

快照会保留笔记内容的早期版本，您可以通过笔记的 **快照** 菜单恢复到之前的状态。

<details>
<summary><strong>快照的工作方式</strong></summary>
<br>

*   **自动：** 每天首次打开笔记时会创建一个快照。每条笔记保留最近 3 个自动快照，这个数量可以在 **设置 > 行为 > 快照** 中修改。
*   **手动：** “立即创建快照”可以随时添加一个快照，在打开笔记时按 **Ctrl + Alt + S**（Mac 上为 Cmd + Alt + S）也可以。手动快照数量不限，也不计入上述数量。
*   **AI 编辑之前：** 在 [AI 助手](#ai-助手)或 [MCP 服务器](#mcp-服务器)修改笔记内容之前，会自动创建一个快照，因此如果改写出了问题，只需点一下即可撤销。这些快照在历史记录中标记为“AI 修改前”或“MCP 修改前”，如果最新的快照已经包含相同内容则会跳过；每条笔记保留最近 20 个，如果您的实例经常通过 AI 或 MCP 编辑笔记，可以在 **设置 → 快照** 中修改这个数量（1 到 200）。
*   **过期：** 所有快照（无论自动还是手动）都会在创建 30 天后删除。也可以在快照对话框中手动删除快照。
*   **附件和图片：** 快照只存储笔记文本。附件从不复制，因此被多个快照引用的文件在磁盘上只有一份。从笔记中移除的文件，只要仍有快照包含它，就会保留在磁盘上（在笔记中不可见），恢复该快照即可找回。当包含它的最后一个快照过期或被删除，或者笔记被永久删除时，该文件才会被彻底删除。因此，保留更多快照永远不会复制文件，只会让被移除的文件保留更长时间，最多 30 天。

</details>

## 个性化

Poznote 在应用内直接提供多种个性化选项，无需修改任何配置文件。

<details>
<summary><strong>显示、行为和 Markdown 设置</strong></summary>
<br>

在 **设置 > 显示** 中，您可以配置：

- **应用字体：** 选择整个界面使用的字体
- **字体大小：** 调整笔记、侧边栏、代码块和设置页面的文字大小
- **笔记颜色：** 选择为笔记着色时提供的调色板
- **按笔记类型显示图标：** 在笔记列表中为任务列表和 Markdown 笔记使用各自的图标
- **索引页图标缩放：** 调整笔记索引中图标的大小
- **图标侧边栏顺序：** 重新排列左侧图标栏中的按钮并更改其颜色（在图标栏的按钮上点击右键也可打开颜色选择）
- **笔记内容宽度：** 控制笔记编辑区域的最大宽度
- **附件预览：** 在笔记中以预览形式显示附件
- **默认图片边框：** 为插入的图片加上边框，不添加内边距
- **突出显示当前文件夹树：** 淡化当前所在文件夹层级之外的笔记和文件夹
- **登录页面标题：** 修改登录页面上显示的标题
- **元素可见性：** 隐藏您不使用的界面元素，详见下文

在 **设置 > 行为** 中，您可以配置：

- **笔记排序规则：** 选择列表中笔记的排列方式
- **笔记时间筛选：** 只列出在指定天数内更新过的笔记
- **快照：** 每条笔记保留多少个自动快照
- **任务列表插入顺序：** 控制新任务插入的位置
- **在文件夹后显示笔记：** 将不在文件夹中的笔记列在文件夹列表下方
- **代码块自动换行：** 启用或禁用代码块中的自动换行
- **日记条目格式：** 将日记条目创建为 HTML 或 Markdown 笔记
- 界面语言、时区和日期格式、笔记底部的附件和 Backlinks、拼写检查以及键盘快捷键

在 **设置 > Markdown** 中，您可以配置默认打开模式、Markdown 编辑器字体、带边框和彩色的 Markdown，以及代码块行号。

主题不在这里以卡片形式出现：左侧图标栏底部的按钮用于依次切换主题，由管理员在 **设置 > 管理工具 > 主题列表** 中选择它提供哪些主题。

</details>

<details>
<summary><strong>工作区背景图片</strong></summary>
<br>

您可以为每个工作区设置背景图片：打开 **工作区** 页面，使用该工作区的 **背景** 操作上传图片并调整其不透明度，让每个工作区都拥有独特的视觉风格。

</details>

<details>
<summary><strong>元素可见性</strong></summary>
<br>

Poznote 允许您隐藏不使用的元素，让界面更加简洁。

在 **设置 > 显示 > 元素可见性** 中配置。

- **精细控制：** 可以切换仪表盘卡片、工具栏操作、斜杠菜单项等元素的可见性。笔记上的创建日期标记（**显示笔记创建日期**）和每个文件夹旁的笔记数量（**显示文件夹笔记数量**）也在这里开启或关闭。
- **按用户设置：** 每个用户都可以拥有自己独特的界面布局。
- **管理员：** 同一对话框中，在管理员自己的“我”列旁边还会显示第二列“用户”，用于为实例的所有用户（管理员除外）隐藏元素。
- **可搜索：** 使用配置对话框中的筛选框，轻松找到要隐藏的元素。

</details>

<details>
<summary><strong>自定义 CSS 覆盖</strong></summary>
<br>

如果您想在内置选项之外调整字体、间距或其他视觉细节，可以上传额外的样式表，它们会应用到所有用户的每个 HTML 页面。

在 **设置 > 管理工具 > 自定义 CSS 文件** 中配置。

说明：

- 点击 **上传 CSS 文件**，从您的电脑中选择一个 `.css` 文件。
- 所有上传的文件都会保留，因此您可以存储多个主题并在它们之间切换，无需重新上传。
- 对话框会列出已存储的文件：选择要应用到所有用户的那个，或选择 **不使用自定义 CSS** 恢复内置外观，然后点击 **保存**。
- 上传与已存储文件同名的文件，会替换该主题。
- 这些文件存储在 `data/css/`（您的 Docker 卷）中，因此镜像更新后依然保留。
- 点击主题旁边的垃圾桶图标，可以从卷中删除该文件。
- Poznote 会自动附加用于绕过缓存的 `v=` 参数。
- 样式表注入在 `<head>` 的末尾附近，因此可以覆盖应用的默认样式。
- 只有管理员可以上传、应用或删除自定义 CSS 文件。

### 主题列表

**设置 > 管理工具 > 主题列表** 决定了图标栏底部的主题按钮依次切换哪些主题：每点击一次切换一个主题，按显示的顺序进行。

- 勾选要保留的内置主题，不勾选没人使用的主题。
- 勾选一个已存储的 CSS 文件，即可将其作为独立主题提供。它会带有调色板图标，并以文件名命名。
- 使用箭头设置按钮切换主题的顺序。
- 自定义主题是在浅色或深色底色之上绘制的，而文件本身无法说明这一点：请在文件旁边选择底色。这就是 `data-theme` 的取值，因此为深色模式编写的样式表需要在这里选择 **深色**。
- 该列表是全局设置，所以每个人切换的主题都相同；具体应用哪个主题仍由每个用户自己选择。
- 正在使用某个主题的用户，如果该主题被移出列表，会立即切换到列表中的第一个主题。
- 选择自定义主题时，只会为该用户加载该文件，并取代在整个实例范围内应用的样式表。
- 删除 CSS 文件时，它也会从列表中移除。
- 如果列表中只有一个主题，就没有可切换的对象，因此该按钮对管理员会打开这个列表，对其他人则不起作用。

**在编写任何 CSS 之前**，先看看是否已有内置主题能满足您的需求：图标栏底部的主题按钮会依次切换浅色、深色、纯黑、薰衣草、棕褐和终端主题。

### 示例

颜色、间距、圆角和字重都是设计令牌（design token），因此大多数修改只需覆盖几个变量，而不必与选择器较劲。完整列表见 `src/public/css/tokens.css`。

**修改强调色**

```css
:root {
    --pz-accent: #d6336c;
    --pz-accent-hover: #a61e4d;
    --pz-accent-rgb: 214, 51, 108;   /* same colour, channels only, used for tints */
}
html[data-theme='dark'] {
    --dm-accent: #f783ac;            /* lighter, because it sits on a dark ground */
}
```

之所以用两个令牌而不是一个，是因为*填充色*和*文字色*不能是同一种颜色：`--pz-accent` 用于填充按钮，`--dm-accent` 则是深色模式下作为文字的强调色。

**为笔记工具栏图标重新着色**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

图标是用 `background-color: currentColor` 绘制的 CSS 遮罩，因此只需设置 `color`。这里需要 `!important`，是因为其中几个图标本身已经带有颜色（笔记被收藏时的星标、笔记被发布时的分享图标、笔记带有附件时的回形针）。

只想给单个图标上色时无需 CSS：在笔记工具栏或图标侧边栏中右键点击该图标并选择颜色即可。这些颜色按用户保存，不会影响上述状态颜色。

**让整个界面变得温暖**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**编写完整主题**

在 `:root` 上覆盖浅色令牌，在 `:root[data-theme='dark']` 上覆盖深色令牌，仅此而已。`src/public/css/README.md` 记录了每个令牌并给出了完整示例；`src/public/css/tokens.css` 中内置的薰衣草、棕褐和终端主题也是同样的东西，写法完全一样。

主题目前还有一处无法覆盖：少数由页面规则显式着色的图标，在深色模式下会显示为通用的图标灰色。

</details>

## 多用户

> 请勿与[多实例](#多实例)功能混淆。

Poznote 支持多用户：每个资料都有自己的笔记、工作区、标签、文件夹、附件和设置，并使用自己的用户名或电子邮件地址和密码登录。

- **用户管理**：管理员可以在 **设置 > 管理工具 > 用户管理** 中创建、停用和管理资料，还可以授权一个用户访问另一个用户的账户，而不转移其所有权。
- **共享**：笔记、文件夹乃至整个工作区都可以与实例上的其他用户共享（只读或可编辑），也可以通过专用链接公开共享。当多个用户可以访问同一条笔记时，同一时间只有一人编辑，其他人可以看到当前是谁持有锁。
- **租户隔离（SaaS 模式）**：管理员可以禁止非管理员用户发现实例中的其他账户、与之共享或注册个人 Webhook。如果是家庭或团队实例，全部保持不勾选即可。

<details>
<summary><strong>磁盘上的数据布局</strong></summary>
<br>

Poznote 使用一个主数据库（`data/master.db`）存放共享的协调数据，并为每个用户使用单独的数据库和文件来存放实际的笔记内容。

```
data/
├── master.db                    # Profiles, global settings, shared links, account access, edit locks
├── css/                         # Custom CSS files uploaded by an administrator
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/poznote.db  # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   ├── attachments/         # User's attachments
    │   ├── snapshots/           # Earlier versions of the user's notes
    │   ├── backgrounds/         # Workspace background images
    │   └── backups/             # Backup archives prepared for download
    ├── 2/                       # User ID 2
    └── ...
```

</details>

## 活动日志

Poznote 会记录在实例上执行的敏感操作的历史，让管理员可以了解发生了什么、何时发生以及由谁执行：登录和注销、账户和配额变更、工作区的创建和共享、备份和还原、清空回收站和永久删除、应用密码。该功能位于 **设置 > 管理工具 > 活动日志**，仅限管理员使用，页面顶部的帮助图标会列出所有被记录的操作。

日志只记录某个操作发生过，而不记录它涉及的数据：笔记内容和密码从不写入日志，编写笔记或将笔记移到回收站等日常活动也不会被记录。记录默认保留 90 天（可选 30、90、365 天或无限期），还可以在同一页面中清空日志。

## Webhook

Poznote 可以在实例上发生某些事件时通知外部服务，方法是向您注册的端点发送出站 Webhook（带 JSON 负载的 HTTP POST 请求），从而接入 n8n、Zapier 或您自己的脚本等自动化工具。管理员在 **设置 > 管理工具 > 管理员 Webhook** 中注册实例事件（账户、配额、注册），每个用户都可以在 **设置 > 用户 Webhook** 中为自己的笔记和提醒注册端点。

当 Webhook 设置了密钥时，投递会使用 HMAC-SHA256 签名，笔记内容从不发送。所有事件、负载字段、签名验证和投递保证都在 **[Webhook 文档](WEBHOOKS.zh-cn.md)** 中说明。

## Git 同步

Poznote 支持与 **GitHub**、**GitLab**（gitlab.com 或自托管实例）或 **Forgejo** 进行自动和手动同步。每个用户独立配置自己的仓库，不存在共享的全局仓库。

Git 同步通过 HTTPS 调用提供商的 REST API，因此始终使用基于令牌的身份验证，不使用 SSH 密钥。

<details>
<summary><strong>如何配置 Git 同步</strong></summary>
<br>

**第 1 步：启用该功能（管理员操作，位于设置 > 管理工具）**

在设置页面的 **管理工具** 部分中启用 **Git 同步**。这会在全局范围内启用 Git 同步，并使用户级的 **Git 同步** 卡片/配置出现在 **设置** 中。

---

**第 2 步：每个用户配置自己的仓库（设置 > Git 同步）**

| 字段 | 说明 |
|---|---|
| 提供商 | `GitHub`、`GitLab` 或 `Forgejo` |
| API 基础 URL | GitHub：自动填写（只读）。GitLab：`https://gitlab.com/api/v4`，或您的实例 URL，例如 `https://gitlab.example.com/api/v4`。Forgejo：您的实例 URL，例如 `https://forgejo.example.com/api/v1` |
| 访问令牌 | GitHub PAT（`ghp_...`）、具有 `api` 权限范围的 GitLab 令牌（`glpat-...`，个人或项目访问令牌）或 Forgejo 令牌（Settings > Applications） |
| 仓库 | `owner/repo` 格式。GitLab：完整的项目路径，包括子组，例如 `group/subgroup/project` |
| 分支 | 默认：`main` |
| 作者名称 / 电子邮件 | 用于提交的元数据 |

> 🔒 访问令牌使用 AES-256-GCM 加密存储。加密密钥会自动生成并存储在 `data/.app_secret` 中。

---

**自动同步**

用户启用后，Poznote 会自动：
- 在登录时**拉取**
- 在每次创建、更新或删除笔记时**推送**

也可以通过左侧图标栏中的 **推送** 和 **拉取** 按钮手动推送/拉取。

---

**同步的工作区**

默认情况下，所有工作区都会同步。每个用户也可以在 **设置 > Git 同步** 中将 Git 同步限制在所选的工作区：

- 只推送和拉取所选工作区中的笔记和附件。
- 拉取永远不会影响其他工作区中的笔记。
- 推送会删除仓库中不属于所选工作区的文件，因此仓库始终与同步的集合完全一致。
- 侧边栏的推送和拉取按钮、自动推送以及拉取提示，只在浏览已同步的工作区时出现。

</details>

## S3 附件存储

默认情况下，笔记附件存储在本地磁盘上。管理员也可以改为将它们存储在兼容 S3 的对象存储中（AWS S3、MinIO、Garage、Cloudflare R2、Backblaze B2 等）。该设置适用于实例的所有用户。

<details>
<summary><strong>如何配置 S3 存储</strong></summary>
<br>

在 **设置 > S3 附件** 中配置（仅限管理员）。

- **配置**：端点 URL、区域、存储桶、Access Key、Secret Key 以及 Path-style 寻址，并内置连接测试。
- **迁移**：在本地磁盘和存储桶之间双向迁移现有的附件文件，覆盖所有用户。迁移分批进行，可以安全地中断并继续。
- **隐私**：附件存储在存储桶的 `attachments/{user id}/` 下，并始终通过 Poznote 提供，因此存储桶可以保持私有。
- **配额**：可以为每个用户设置 S3 存储配额，S3 用量会显示在管理员存储统计中。
- **备份**：无论是通过备份窗口、REST API 还是自动 S3 备份生成的 Zip 导出，默认都包含 S3 附件（即时从存储桶获取）。备份窗口中有一个选项可以不包含它们，以得到更小的归档。如果在构建归档时无法读取存储桶，导出会报错失败，而不会生成缺少文件的归档。

启用 S3 存储时，如果备份缺少其引用的部分附件文件，还原会被拒绝，因为完整还原会替换存储桶的内容，缺失的文件将会丢失。还原这类备份有两种方法：

- **最简单**：关闭“将附件存储到 S3”开关（保留凭据），还原备份，然后重新打开开关。本地模式下的还原永远不会触碰存储桶，仍存储在其中的附件会继续正常提供。当存储桶完好无损时，这也是在全新服务器上的正确做法，因为另一种方法中的附件导出需要一个仍然知道这些笔记的实例。
- **重建完整归档**：
  1. 从备份窗口下载 **附件导出**：其中的 `files/` 文件夹包含您账户的所有附件。
  2. 解压备份，将 `files/` 中的文件复制到备份的 `attachments/` 文件夹，然后重新压缩。重新压缩时请注意：选中备份的内容（`database/`、`entries/`、`attachments/` 等）并压缩这些选中项，而不是压缩包含它们的文件夹。这些文件夹必须位于 zip 的根目录，否则还原时会提示缺少 `database/poznote_backup.sql`。
  3. 按正常方式还原重建后的 zip。

> 启用 S3 存储时，Git 同步会忽略附件。

</details>

## S3 备份

管理员可以将完整备份归档（每个用户一个 ZIP，与完整备份下载的内容相同）手动或按计划自动发送到兼容 S3 的存储桶。该配置独立于 S3 附件存储的配置，因此备份可以使用不同的存储桶或提供商。

<details>
<summary><strong>如何配置 S3 备份</strong></summary>
<br>

在 **设置 > S3 备份** 中配置（仅限管理员）。

- **总开关**：页面顶部的开关用于启用或禁用整个功能。禁用后，自动备份停止，S3 备份和恢复部分对所有用户隐藏（服务器端也会拒绝自助操作）。
- **配置**：端点 URL、区域、存储桶、Access Key、Secret Key 以及 Path-style 寻址，并内置连接测试。
- **用户选择**：通过复选框选择备份覆盖哪些用户。默认勾选所有人，并且在所有人都被勾选时，新账户会自动包含在内。
- **手动备份**：“立即备份”按钮会为每个选中的用户上传一份新的归档，一次处理一个用户，并显示每个用户的进度。只要配置好连接即可使用，即使自动备份处于关闭状态。
- **自动备份**：启用后，后台工作进程会按所选频率（每天、每周或每月）备份选中的用户。首次运行会在启用后几分钟内进行，之后按所选间隔运行。
- **保留**：每个用户只保留最近的 N 个归档，每次备份后会从存储桶中删除较旧的归档（0 表示全部保留）。
- **浏览**：页面会列出存储桶中当前的归档，并提供下载和删除操作。
- **还原**：归档存储在存储桶的 `backups/{user id}/` 下，可以通过标准的[还原 / 导入](#还原--导入)页面进行还原。
- **自助服务**：存储桶配置完成后，每个用户的备份 / 导出页面上都会出现“S3 备份”部分，可以上传自己账户的新归档，以及下载或删除已有的归档。还原 / 导入页面上的“从 S3 恢复”部分可以直接从其中某个归档还原账户。
- **租户隔离**：两个选项（“备份页面上的 S3 备份”和“恢复页面上的 S3 恢复”）可以为非管理员用户禁用这些自助服务部分。这些限制在服务器端强制执行，因此即使直接调用，被屏蔽的操作也会被拒绝。

当附件存储在 S3 中（S3 附件存储）时，归档默认会包含它们，即时从存储桶获取。有一个选项可以将它们排除在备份之外，以获得更小的归档和更快的运行速度。

</details>

## 备份 / 导出

Poznote 内置备份 / 导出功能，可通过设置访问。

<a id="complete-backup"></a>
<details>
<summary><strong>完整备份为 Poznote zip</strong></summary>
<br>

单个 ZIP 文件，包含数据库、所有笔记以及所有工作区的附件：

  - 根目录包含一个 `index.html`，用于离线浏览
  - 笔记按工作区和文件夹组织
  - 附件可以通过可点击的链接访问

归档由后台工作进程构建，而不是在发起备份的请求中生成，因此即使账户很大，也不会触发浏览器或反向代理的超时。页面会跟踪任务进度，文件准备好后会自动开始下载。您可以离开页面稍后再回来，准备工作会继续进行。准备好的归档会保留 24 小时，也可以通过按钮立即删除。

#### 按用户备份与完整备份

Poznote 提供灵活的备份选项：

**通过网页界面（设置 > 备份 / 导出）：**
- **所有用户**都可以备份和还原自己的资料
- **管理员**可以选择要备份或还原的用户资料
- 备份包含该用户的数据库、笔记和附件

**通过 API/脚本（仅限管理员）：**
- 使用 `backup-poznote.sh` 脚本进行自动备份
- 通过 REST API v1 以编程方式访问
- 需要管理员凭据

**备份范围：**

1. **按用户备份**：在设置中或通过 API 创建。*仅*包含属于特定用户的数据（其数据库、笔记和附件）。
2. **完整系统备份**：通过手动备份整个 `/data` 目录创建。这是一次性备份主配置和所有用户数据的唯一方法。

```bash
# 通过 CLI 进行完整系统备份
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>导出单条笔记</strong></summary>
<br>

使用笔记工具栏中的 **导出** 按钮导出单条笔记：

  - **HTML 笔记：** 导出为 HTML，或导出为嵌入图片的单个 HTML 文件
  - **Markdown 笔记：** 导出为 Markdown、HTML，或嵌入图片的单个 HTML 文件
  - **任务列表：** 选项相同，另外还可以将列表导出为原始 JSON

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>使用 Bash 脚本自动备份</strong></summary>
<br>

如需通过 API 定时自动备份，可以使用附带的 `backup-poznote.sh` 脚本。

**重要：** 只有管理员可以通过 API 创建备份。
请使用您用于身份验证的管理员资料的当前密码。全新安装时，在 Poznote 中修改之前，该密码就是默认管理员密码（`admin`）。一旦设置了自定义密码，API 调用就需要使用该自定义密码。

**脚本位置：** Poznote 仓库 `tools` 文件夹中的 `backup-poznote.sh`

**管理员用法：**

管理员可以备份任意用户资料，**无需知道用户 ID**，只需提供用户名：

```bash
# 备份您自己的资料
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# 备份其他用户（Nina）的资料
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**用法：**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**crontab 示例（管理员备份 Nina）：**

```bash
# 添加到 crontab，每天自动备份两次
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**参数说明：**
- `'https://poznote.example.com'`：您的 Poznote 实例 URL
- `'admin'`：用于身份验证的管理员用户名（必须是管理员）
- `'admin_password'`：API 所用资料的当前管理员密码（修改前默认为 `admin`，修改后为自定义密码）
- `'Nina'`：要备份的目标用户名
- `'/root/backups'`：存放备份的上级目录（会创建 `backups-poznote-<username>` 文件夹）
- `'30'`：要保留的备份数量（较旧的备份会被自动删除）

**备份流程如下：**

1. 脚本使用管理员凭据进行身份验证
2. 根据用户名自动查找用户 ID
3. 通过 API 创建备份
4. 调用 Poznote REST API v1（带 `X-User-ID` 请求头的 `POST /api/v1/backups`）
5. 将备份 ZIP 下载到本地的 `backups-poznote-<username>/`
6. 自动管理保留策略（只保留指定数量的最近备份）

**注意：** 每个用户的备份存放在不同的文件夹中（`backups-poznote-Nina`、`backups-poznote-Tim` 等）

</details>


## 还原 / 导入

Poznote 通过网页界面（**设置 > 还原 / 导入**）提供灵活的还原选项，管理员也可以通过 REST API 以编程方式进行还原。用户可以从完整的 ZIP 备份还原自己的资料数据，或导入单个文件，而管理员可以管理整个系统范围内的还原。

<a id="complete-restore"></a>
<details>
<summary><strong>从 Poznote zip 备份完整还原</strong></summary>
<br>

上传完整备份 ZIP 即可还原所有内容：

  - 替换数据库，还原所有笔记和附件
  - 一次性适用于所有工作区

实际上没有大小限制。归档会分片上传（某个分片失败时会重试，而不会导致整个上传作废），在服务器上重新组装，然后由后台工作进程解压并还原，因此无论是浏览器还是实例前面的反向代理，都不会让还原超时。进度条覆盖整个流程：上传、解压、数据库、笔记，最后是附件。还原完成后，Poznote 会询问您要打开哪个工作区。

从 S3 存储桶还原（参见 [S3 备份](#s3-备份)）也作为同样的后台任务运行，因此从存储桶获取大型归档并进行还原，同样不依赖于请求一直保持连接。

如果完全无法上传，还原 / 导入页面还提供直接复制的备用方案：通过 SSH 将归档复制到 Poznote 容器中的 `/tmp/backup_restore.zip`（路径必须完全一致），刷新页面，然后从那里还原。

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>导入单个文件</strong></summary>
<br>

直接导入一个或多个 HTML、Markdown 或文本笔记：

  - 支持 `.html`、`.md`、`.markdown`、`.txt` 和 `.json` 文件类型
  - 一次最多可选择 50 个文件，可在 设置 > 管理工具 > 导入限制 中配置

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>导入 ZIP 文件</strong></summary>
<br>

导入包含多条笔记的 ZIP 归档：

  - 支持 `.html`、`.md`、`.markdown` 或 `.txt` 文件类型
  - ZIP 归档最多可包含 300 个文件，可在 设置 > 管理工具 > 导入限制 中配置
  - 导入 ZIP 归档时，Poznote 会自动检测并重建文件夹结构

归档实际上没有大小限制。与完整还原一样，它会分片上传（某个分片失败时会重试，而不会导致整个上传作废），在服务器上重新组装，然后由后台工作进程处理，因此无论是浏览器还是实例前面的反向代理，都不会让导入超时。进度条覆盖整个流程：上传、图片和附件，最后是笔记。

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>导入 Obsidian 笔记</strong></summary>
<br>

导入包含多条 Obsidian 笔记的 ZIP 归档：

  - ZIP 归档最多可包含 300 个文件，可在 设置 > 管理工具 > 导入限制 中配置
  - Poznote 会自动检测并重建文件夹结构
  - Poznote 会自动检测已有的标签并创建
  - 如果图片位于 zip 文件的根目录，Poznote 会自动导入它们

</details>

<details>
<summary><strong>Markdown Front Matter 支持</strong></summary>
<br>

Markdown 文件可以包含 YAML front matter 来指定笔记元数据。支持以下键：

  - `title`：覆盖笔记标题（默认：不含扩展名的文件名）
  - `folder`：覆盖目标文件夹。纯名称必须与工作区中已存在的文件夹匹配；`Projects/2026` 这样的路径则会创建所需的文件夹。
  - `tags`：要应用到笔记的标签数组。同时支持行内 `[tag1, tag2]` 和多行语法
  - `favorite`：将笔记标记为收藏（`true` 或 `false`）
  - `created`：设置自定义创建日期（格式：`YYYY-MM-DD HH:MM:SS`）
  - `updated`：设置自定义更新日期（格式：`YYYY-MM-DD HH:MM:SS`）

行内数组语法示例：
```yaml
---
title: My Important Note
folder: Projects
tags: [important, work]
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

多行语法示例：
```yaml
---
title: My Important Note
folder: Projects
tags:
  - important
  - work
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

</details>


## 离线浏览

**📦 完整备份** 会为您的笔记创建一个独立的离线版本。只需解压 ZIP，然后在任意浏览器中打开 `index.html` 即可。这样您可以离线阅读笔记，但没有 Poznote 的完整功能，它只是一个只读导出。

## 多实例

> 请勿与[多用户](#多用户)功能混淆。

您可以在同一台服务器上运行多个相互隔离的 Poznote 实例。每个实例都有自己的数据、端口和凭据。

非常适合：
- 在同一台服务器上为不同用户托管，每个用户都有各自独立的实例和账户
- 测试新功能，而不影响生产实例

只需在不同的目录中使用不同的端口重复安装步骤即可。

### 示例：同一台服务器上的 Tom 和 Alice 实例

```
Server: my-server.com
├── Poznote-Tom
│   ├── Port: 8040
│   ├── URL: http://my-server.com:8040
│   ├── Container: poznote-tom-webserver-1
│   └── Data: ./poznote-tom/data/
│
└── Poznote-Alice
  ├── Port: YOUR_POZNOTE_API_PORT
  ├── URL: http://my-server.com:YOUR_POZNOTE_API_PORT
    ├── Container: poznote-alice-webserver-1
    └── Data: ./poznote-alice/data/
```

## AI 助手

Poznote 内置 AI 聊天功能，可以连接本地的 [Ollama](https://ollama.com) 或 [LM Studio](https://lmstudio.ai) 实例、[Anthropic (Claude)](https://www.anthropic.com)、OpenAI 等云服务提供商，或任何兼容 OpenAI 的服务器。它会搜索和阅读您的笔记来回答问题，并在您提出要求时创建、改写和整理笔记，范围仅限您打开聊天时所在的工作区。

管理员在 **设置 → 管理工具 → AI 助手** 中启用后，每个资料的左侧图标栏中都会出现 **AI 助手** 按钮。AI 服务器由 Poznote 服务器调用，绝不会从您的浏览器调用，因此使用本地 Ollama 实例时，您的笔记永远不会离开您的机器。

助手能做什么、如何选择提供商和模型、个人 API 密钥，以及如何从 Poznote 容器连接本地服务器，请参阅 [AI 助手文档](AI-ASSISTANT.zh-cn.md)。如果想让外部 AI 助手（VS Code Copilot、Claude CLI 等）来管理您的笔记，请参阅下文的 [MCP 服务器](#mcp-服务器)。

## 转录（语音转文字）

使用您自己运行的语音转文字服务器，将语音转换为笔记文本。Poznote 不内置任何语音模型：它可以与任何提供 OpenAI 音频 API（`POST /v1/audio/transcriptions`）的服务器通信，例如自托管的 Whisper，因此音频完全不必离开您的机器。

管理员在 **设置 → 管理工具 → 转录** 中启用后，斜杠菜单的 **插入** 下会出现 **听写**，音频附件上也会出现 **转录** 按钮。

服务器的搭建、模型的选择以及其他所有内容，请参阅[转录文档](TRANSCRIPTION.zh-cn.md)。

## MCP 服务器

Poznote 包含一个 Model Context Protocol (MCP) 服务器，让 GitHub Copilot 或 Claude CLI 等 AI 助手可以通过自然语言操作您的笔记。例如：

- “创建一条标题为 'Meeting Notes' 的新笔记，内容为……”
- “搜索关于 'Docker' 的笔记”
- “列出我的 Poznote 工作区中的所有笔记”
- “用新信息更新笔记 42”

MCP 服务器随官方 `docker-compose.yml` 一起提供，并且只发布在 `127.0.0.1` 上，因此默认情况下，您机器之外的任何设备都无法访问它。安装、客户端配置、端口和调试的覆盖参数，以及在进一步暴露它时如何用 `POZNOTE_MCP_AUTH_TOKEN` 加以保护，请参阅 [MCP 服务器文档](MCP-SERVER.zh-cn.md)。

## Chrome 扩展

**Poznote URL Saver** 是一款浏览器扩展，只需点击一下，即可将当前页面的 URL 甚至整页截图保存到您的 Poznote 实例。从 Chrome 网上应用店安装：[安装扩展](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

扩展使用您的用户名和一个[应用密码](#应用密码)连接到您的实例。配置步骤请参阅 [Chrome 扩展文档](CHROME-EXTENSION.zh-cn.md)。

## 在 Android 上分享到 Poznote

在 Android 上安装 PWA 后，Poznote 会出现在系统的 **分享** 菜单中。在 Chrome 中分享一个页面（或在任意应用中分享链接/文本），选择 Poznote，就会创建一条包含页面标题和可点击链接的新笔记，无需安装扩展。

使用方法：

1. 在 Android 上用 Chrome 打开您的 Poznote 实例，并将其安装为应用（菜单 → **添加到主屏幕** → **安装**）。
2. 在任意应用中点按 **分享**，然后选择 **Poznote**。

> 如果 Poznote 没有立即出现在分享菜单中，请确认应用已安装（而不仅仅是一个书签）。如果您在此功能发布之前就安装了 PWA，Chrome 会在几天后自动获取这项新功能，重新安装应用则可以立即生效。

## API 文档

Poznote 提供全面的 RESTful API v1，可以通过编程方式访问笔记、文件夹、工作区、标签、附件、备份、设置等。

包含所有端点、参数和 curl 示例的完整 API 参考，请参阅 **[REST API 文档](API-REST.md)**。

### 快速开始

```bash
# 列出用户 ID 1 的所有笔记
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# 同上，改用在 设置 > 应用密码 中创建的应用密码
# （适用于仅 SSO 的实例；X-User-ID 会自动确定）
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# 创建笔记
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### 交互式文档（Swagger）

在 Poznote 中通过 `Settings > About > API REST` 直接访问 **Swagger UI**，即可浏览所有端点、查看请求/响应结构，并以交互方式测试 API 调用。

## 技术栈

Poznote 注重简洁和可移植性：没有复杂的框架，没有沉重的依赖，只使用直接、可靠的 Web 技术，确保您的笔记始终可访问并由您掌控。

**隐私优先的架构：** Poznote 完全在本地运行，其功能不需要任何外部连接。所有库（Excalidraw、Mermaid、KaTeX）都已打包，并由您自己的实例提供。开箱即用时，唯一的出站连接是每天一次的更新检查；除此之外，只有您自行开启的可选功能（Git 同步、S3、AI 提供商、Webhook、SMTP、OIDC）才会产生出站连接。

<details>
<summary>如果您对构建 Poznote 所用的技术栈感兴趣，<strong>请点击这里查看。</strong></summary>

### 后端
- **PHP 8.x**：服务器端脚本语言
- **SQLite 3**：轻量级、基于文件的关系型数据库

### 前端
- **HTML5**：标记与结构
- **CSS3**：样式与响应式设计
- **JavaScript (Vanilla)**：交互功能与动态内容
- **React + Vite**：Excalidraw 组件的构建工具链（打包为 IIFE）
- **AJAX**：异步数据加载

### 库
- **CodeMirror 6**：可扩展的代码和文本编辑器，用于 Markdown 编辑体验
- **Excalidraw**：用于绘制图表和草图的虚拟白板
- **Mermaid**：根据文本生成图表和流程图的客户端 JavaScript 库
- **KaTeX**：用于快速排版和渲染数学公式的客户端 JavaScript 库
- **Sortable.js**：用于拖放排序的 JavaScript 库
- **highlight.js**：代码块语法高亮
- **Swagger UI**：交互式 API 文档与测试界面

### 存储
- **HTML/Markdown 文件**：笔记以纯 HTML 或 Markdown 文件的形式存储在文件系统中
- **SQLite 数据库**：元数据、标签、关联关系和用户数据
- **文件附件**：存储在本地文件系统中，也可以选择存储在兼容 S3 的对象存储中

### 基础设施
- **Nginx + PHP-FPM**：高性能 Web 服务器，搭配 FastCGI 进程管理器
- **Alpine Linux**：安全、轻量的基础镜像
- **Docker**：容器化，便于部署和移植
- **Python 3.12 (Alpine)**：MCP 服务器运行时，使用 httpx、uvicorn 和 fastmcp 库实现 AI 助手集成
</details>
