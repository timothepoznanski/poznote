<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <b>简体中文</b> ·
  <a href="MCP-SERVER.ko.md">한국어</a> ·
  <a href="MCP-SERVER.ja.md">日本語</a> ·
  <a href="MCP-SERVER.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Poznote MCP 服务器

适用于 Poznote 的 MCP（Model Context Protocol）服务器，让您通过自然语言借助 AI 管理笔记。

该服务器**仅支持 HTTP 传输**（MCP Streamable HTTP）。

> [!TIP]
> 想直接在 Poznote 中与本地模型（例如 Ollama）聊天？这并不需要 MCP 服务器，请改用内置的 [AI 助手](AI-ASSISTANT.zh-cn.md)（**设置 → 管理工具 → AI 助手**）。MCP 服务器用于将支持 MCP 的*外部*助手连接到您的笔记；Ollama 本身只是模型运行时，不是 MCP 客户端，无法直接连接到 MCP 服务器。

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

## 快速开始

选择您喜欢的 AI 助手：

- **[VS Code Copilot](VSCODE-COPILOT.zh-cn.md)：** 将 Poznote 集成到您的编辑器中
- **[Claude CLI](CLAUDE-CLI.zh-cn.md)：** 在命令行中使用 Poznote

---

## 工作原理

MCP 服务器充当 AI 助手与您的 Poznote 实例之间的桥梁。

### 组件

- **`server.py`**：MCP 服务器（HTTP / Streamable HTTP）
  - 在 `http://127.0.0.1:8045/mcp` 暴露 MCP 端点
  - 定义用于管理笔记的工具（操作）
  - 协调 AI 与 Poznote API 之间的调用

- **`client.py`**：Poznote REST API 的 HTTP 客户端
  - 执行 HTTP 请求（GET、POST、PATCH、DELETE）
  - 使用共享的 MCP 服务令牌处理 Poznote API 身份验证

### 通信流程

1. AI 助手（VS Code Copilot 或 Claude CLI）连接到 MCP 服务器
2. MCP 服务器调用 Poznote REST API
3. 结果返回给 AI 助手

在浏览器中打开的 Poznote 标签页会在几秒内获取通过 MCP 所做的更改：侧边栏树和打开的笔记会就地刷新（如果笔记有未保存的编辑，则会显示重新加载横幅）。仅仅在浏览器中打开一条笔记并不会阻止 MCP 写入；只有当笔记正被同一账户的其他用户或公开分享链接的访客编辑时，才会返回 HTTP 423 错误。

## 功能

### 工具（操作）
- `get_note`：按 ID 获取指定笔记及其完整内容
- `list_notes`：分页列出工作区中的笔记（`limit`/`offset`，结果中包含工作区真实的 `total`）
- `search_notes`：按文本查询搜索笔记，可选创建日期范围
- `create_note`：创建新笔记，可选择基于模板创建和/或设置截止日期/提醒
- `update_note`：更新现有笔记、移动笔记，和/或设置其截止日期/提醒
- `delete_note`：按 ID 删除笔记
- `get_reminder`：获取笔记当前设置的提醒
- `set_reminder`：设置或替换笔记的提醒，可选重复间隔
- `remove_reminder`：移除笔记的提醒
- `list_reminders`：列出已经触发且尚未忽略的提醒通知（界面上铃铛的消息流）；即将到来的提醒无法列出
- `list_tasks`：列出任务列表笔记中的任务，包括 ID、截止日期和标记
- `list_all_tasks`：列出工作区内所有笔记的待办任务，最紧急的排在前面，并支持筛选（截止日期、重要性、已完成任务、笔记内的复选框）
- `add_task`：向任务列表笔记添加单个任务，可选截止日期和提醒
- `update_task`：更新单个任务（文本、截止日期、提醒、重要标记）
- `complete_task`：将任务标记为已完成，或重新打开
- `delete_task`：从任务列表笔记中删除单个任务
- `add_subtask`：为任务列表笔记中的某个任务添加子任务
- `update_subtask`：重命名子任务，或将其标记为已完成或未完成
- `delete_subtask`：删除任务的单个子任务
- `create_folder`：按名称或路径创建文件夹（`folder_path="Projects/2026/Q3"` 一次调用即可创建整条路径），或用 `is_diary=true` 创建日记根文件夹
- `list_folders`：列出工作区中的所有文件夹，包括路径和日记标记
- `list_workspaces`：列出所有可用的工作区
- `list_tags`：列出笔记中使用的所有标签（去重）
- `list_templates`：列出可供 `create_note` 的 `from_template_id` 使用的模板笔记
- `get_trash`：列出当前回收站中的所有笔记
- `empty_trash`：永久删除回收站中的所有笔记
- `delete_trash_note`：从回收站中永久删除单条笔记，而不是清空整个回收站
- `restore_note`：从回收站恢复笔记
- `list_snapshots`：列出笔记已保存的历史版本，包括每次 AI 或 MCP 改写前所做的安全快照
- `get_snapshot`：读取笔记某个历史版本的内容，不会改动笔记本身
- `restore_snapshot`：将笔记回滚到它的某个快照（必须提供 `snapshot_key` 或 `date`）
- `duplicate_note`：创建现有笔记的副本
- `toggle_favorite`：切换笔记的收藏状态
- `list_attachments`：列出指定笔记的所有附件
- `add_attachment`：根据文件的 base64 内容将其附加到笔记（图片、日志、PDF 等）
- `move_note`：将笔记移动到另一个工作区和/或文件夹，保留其 ID
- `move_folder`：将文件夹（连同其子文件夹和笔记）移到另一个父文件夹下和/或另一个工作区中
- `move_note_to_folder`：将笔记移动到指定文件夹
- `remove_note_from_folder`：将笔记移出当前文件夹（移到根目录）
- `share_note`：为笔记启用公开分享并获取公开 URL
- `unshare_note`：禁用笔记的公开分享
- `get_note_share_status`：获取笔记当前的分享状态和公开 URL
- `get_folder_share_status`：获取文件夹当前的分享状态和公开 URL
- `list_shared`：列出所有公开分享的笔记和文件夹
- `list_shared_with_me`：列出其他用户与此用户资料分享的笔记和文件夹
- `get_backlinks`：获取所有链接到（引用）指定笔记的笔记
- `convert_note`：在 HTML 和 Markdown 格式之间转换笔记
- `rename_folder`：重命名现有文件夹
- `delete_folder`：删除文件夹并将其中的笔记移到回收站
- `create_workspace`：创建新工作区
- `rename_workspace`：重命名现有工作区
- `delete_workspace`：删除工作区（不能删除最后一个）
- `get_git_sync_status`：获取 Git 同步的当前状态（GitHub/GitLab/Forgejo）
- `git_push`：将本地笔记强制推送到已配置的 Git 仓库
- `git_pull`：从已配置的 Git 仓库强制拉取笔记
- `get_system_info`：获取 Poznote 安装的版本信息
- `list_backups`：列出所有可用的系统备份
- `create_backup`：触发创建新的系统备份
- `restore_backup`：还原备份文件（替换当前用户数据）
- `delete_backup`：删除指定的备份文件
- `get_app_setting`：获取指定应用设置的值
- `update_app_setting`：更新指定应用设置的值

**调用会落到哪个工作区。** 在 `create_note`、`create_folder` 和 `list_folders` 中始终指定 `workspace`（文件夹总是属于某一个工作区）：这是唯一能确保结果的方式。省略时，服务器按固定顺序解析，从不猜测：先使用 `mcp_default_workspace` 设置（前提是它指向一个存在的工作区），其次在账户只有一个工作区时使用该工作区。如果有多个工作区且未设置默认值，调用会被拒绝，并在回复中列出这些工作区，而不是把笔记放进恰好排在第一位的工作区（以前这个工作区会自行变化，例如第一次归档笔记时创建了“Archives”）。可以用 `update_app_setting("mcp_default_workspace", "<name>")` 设置默认工作区。

**附件。** `add_attachment(note_id, filename, content_base64)` 将文件存储到笔记上，效果与在 Web 界面中拖放完全相同，因此无需人工介入即可附加生成的图表或日志文件；内容也可以是 `data:` URI。Poznote 自身的规则仍然适用，因此可执行文件类型和已满的存储配额会被拒绝，并附上原因。文件字节以 base64 编码的形式随工具调用传输，因此该工具将上传大小限制为 25 MB，更大的文件请使用 Web 界面。

**移动。** `move_note` 和 `move_folder` 是移动而不是复制：ID、内容、历史记录以及指向笔记的链接都会保留。在 `update_note` 中，`workspace` 表示在哪里*查找该笔记*；真正移动笔记的参数是 `target_workspace`。如果笔记更换了工作区却没有指定目标工作区中的文件夹，它会落到该工作区的根目录，因为原来的文件夹属于它离开的那个工作区。移动文件夹时，其子文件夹及其中的所有笔记会一并移动。

**文件夹。** 所有接受文件夹参数的工具接受的内容都相同：名称，或以斜杠分隔的路径。`create_note(folder="Diary/2026/08")` 会沿路径创建缺失的层级；`create_folder(folder_path=…)` 对文件夹做同样的事；`list_notes(folder_id=…)` 在服务器端将列表限定在一个文件夹内，因此其 `total` 只统计该文件夹。当工作区中只有一个文件夹使用某个名称时，仅用名称即可访问任意层级的该现有文件夹，而不会在根目录再创建一个；如果有多个文件夹同名，调用会被拒绝并列出它们，此时请传入完整路径或 ID。

**日记。** 日记不只是一个名为 Diary 的文件夹：它是带有 `is_diary` 标记的根文件夹，界面中的“新建日记条目”按钮会把带日期的笔记归档到带标记的根文件夹中。用 `create_folder(folder_name="Journal", is_diary=true)` 创建日记，`list_folders` 会告诉您哪些文件夹是日记。如果传入的名称已被某个根文件夹使用，该文件夹会变为日记并保留其中的笔记。日记条目本身就是普通笔记：用 `create_note(folder="Journal/2026/09")` 归档即可。

**模板。** 模板是存放在名为 `Templates` 的文件夹（其下任意层级均算在内）中，或位于同名工作区中任意位置的普通笔记；所有内置语言中的该词都能被识别，因此 `Modèles` 文件夹同样有效。`list_templates` 返回模板及其 ID，`create_note(from_template_id=…)` 基于其中一个模板创建新笔记，格式与模板本身一致；如果要求 `note_type="markdown"`，HTML 模板会被转换，方式与编辑器中的 `/template` 命令相同。模板不能用来创建任务列表或绘图。如果同时传入 `content`，其内容会追加在模板正文之后。

**提醒与任务。** `reminder_at`（用于 `create_note`/`update_note` 和 `set_reminder`）是 ISO 日期时间，例如 `2026-09-01T09:00:00+02:00`；请包含时区偏移，否则时间会按 UTC 解析。任务截止日期（`due_at`）则不同：它们是本地挂钟时间，格式为 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:MM`，不带偏移，按用户配置的时区解析；只有日期没有时间时，会在 09:00 提醒。重复间隔使用 `<count><unit>` 格式，单位为 `i`/`h`/`d`/`w`/`m`/`y`，例如 `30i`、`1d` 或 `2w`。

任务工具一次只处理一个任务：先调用 `list_tasks` 获取任务 ID，再调用 `add_task`、`update_task`、`complete_task` 或 `delete_task`。每次调用只携带该任务，因此客户端永远不需要读取整个任务列表再发回一个全新的数组，两个调用方编辑不同任务时也不会互相覆盖。Poznote 将笔记的任务存储为一个 JSON 数组，服务器每次调用都会重写它，因此单次调用的工作量仍会随列表长度增长。通知会自动保持同步，完成或删除任务时会撤销其待发送的提醒。任务可以包含子任务，且仅限一层：`list_tasks` 会在任务的 `subtasks` 数组中返回它们及其各自的 ID，`add_subtask`、`update_subtask` 和 `delete_subtask` 每次修改其中一个。子任务只有文本和完成状态，勾选子任务不会使其所属任务完成。

**版本历史与撤销。** 在 AI 助手或 MCP 服务器改写笔记之前，Poznote 会先为该笔记创建一个安全快照，因此一次失误的 `update_note` 是可以撤销的。`list_snapshots` 列出为某条笔记保留的快照，每个快照都带有标识这类安全副本的 `origin`（`ai` 或 `mcp`）；`get_snapshot` 在不改动笔记的情况下读取其中一个，`restore_snapshot` 则把它的内容写回去。`restore_snapshot` 会覆盖当前内容，因此必须提供 `snapshot_key` 或 `date`，而不会退回到当天的快照。它不会事先保存这些内容：被替换的内容会丢失，除非已有快照包含它。Poznote 界面将快照称为修订版本：用户在笔记的**修订版本**页面中浏览和比较它们，因此有关修订版本或版本历史的请求对应的就是这些工具。

**跨笔记视图。** `list_all_tasks` 回答整个工作区“还有什么要做”，而 `list_tasks` 只覆盖单条笔记。它返回两类条目，通过 `source` 区分：任务列表笔记中的任务，其 ID 可配合 `update_task` 和 `delete_task` 使用；以及写在普通笔记里的复选框，其 ID 只是笔记中的位置，无法这样使用。`list_reminders` 返回已经触发且未被忽略的通知，API 最多返回 50 条。它并不是未来事项的视图：Poznote 没有列出未来提醒的接口，这些提醒需要用 `get_reminder` 逐条笔记读取。

大多数工具接受可选的 `user_id` 参数，用于指定特定的用户资料。提供该参数时，MCP 服务器会为该请求发送 `X-User-ID` 标头，让您无需更改全局 MCP 环境即可在不同用户资料之间创建或读取笔记。例外的是系统级工具 `get_system_info`、`list_backups`、`create_backup` 和 `delete_backup`，它们不接受 `user_id`。要更改未传入 `user_id` 时使用的默认用户资料，请参阅[默认用户资料](#默认用户资料)。

---

## 服务器安装

MCP 服务器已包含在官方 Poznote `docker-compose.yml` 中，并会自动运行。

### 配置

MCP 服务器使用 `docker-compose.yml` 中的默认值：

```bash
# MCP 服务器端口默认为 8045
# 调试日志默认关闭（false）
```

Poznote 会自动在 `data/.mcp_token` 中生成 MCP 服务令牌。`mcp-server` 容器通过共享卷 `./data:/var/www/html/data:ro` 读取该文件，因此无需在 `.env` 中保存密码。

要在某次启动时覆盖端口和调试设置，请使用内联环境变量重建 MCP 容器：

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

简单执行 `docker compose restart mcp-server` 不会重新加载更新后的环境变量。

#### 按用途选择模式

MCP 服务器以三种方式之一识别其客户端。区分它们的关键在于**由谁决定请求作用于哪个 Poznote 账户**：

| 您的情况 | 模式 | 由谁决定账户 |
|---|---|---|
| 只有您自己，客户端在同一台机器上（VS Code、Claude CLI） | 经典模式，即默认模式，可选配[入站令牌](#入站身份验证令牌) | 服务器配置：`POZNOTE_USER_ID`（默认为用户资料 `1`），或请求通过 `user_id` 指定的任意用户资料 |
| 多人使用、聊天应用（ChatGPT、Claude、Gemini），或访问公开服务器的 VS Code / Claude Code | [从聊天应用登录](#从聊天应用登录chatgptclaudegemini)（`POZNOTE_MCP_AUTH_PROVIDER=poznote`） | 登录的人：始终是其本人的账户 |
| 已持有您的身份提供方（Keycloak、Authentik 等）所签发令牌的 agent | [按调用方身份认证](#按调用方身份认证可选)（`userinfo` 或 `introspection`） | 与令牌身份关联的用户资料 |

一旦多人共用一个 MCP 服务器，请使用第二种模式：在经典模式下，每个客户端都能访问每个账户。

#### 默认用户资料

默认情况下，MCP 服务器以用户资料 `1`（第一个管理员）的身份运行。要将服务器固定到其他用户资料，请在启动容器时设置 `POZNOTE_USER_ID`：

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

此后所有工具调用都作用于该用户资料，除非请求显式传入 `user_id` 参数，该参数对该请求仍然优先。该值必须是数字形式的用户资料 ID；其他任何值都会被忽略，并在 MCP 日志中写入警告，同时使用默认值 `1`。

#### 入站身份验证令牌

默认情况下，MCP 端点接受任何能够访问它的客户端，这是安全的，因为端口只发布在 `127.0.0.1` 上。如果您将端口暴露到本机之外（反向代理、局域网、裸机安装），请设置 `POZNOTE_MCP_AUTH_TOKEN`，服务器将要求每个请求都带有 `Authorization: Bearer <token>` 标头，否则返回 `401 Unauthorized`：

```bash
# 生成一次高强度令牌
openssl rand -hex 32

# 将其写入 .env
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# 重建 MCP 容器，使其读取新的环境变量
docker compose up -d --force-recreate mcp-server
```

然后在客户端配置中添加相同的标头：参见 [VS Code Copilot](VSCODE-COPILOT.zh-cn.md#使用身份验证令牌) 和 [Claude CLI](CLAUDE-CLI.zh-cn.md#使用身份验证令牌)。首尾空白会被忽略，因此从密钥文件中读取、末尾带换行符的令牌仍然有效。值为空时端点保持开放。启动日志中的一行会告诉您当前启用的是哪种模式。

此令牌与 `data/.mcp_token` 相互独立：后者由 MCP 服务器用于与 Poznote API *通信*，前者则是*您的 AI 助手*必须向 MCP 服务器出示的令牌。

#### 从聊天应用登录（ChatGPT、Claude、Gemini）

连接远程 MCP 服务器的聊天应用，例如 ChatGPT（以及 Codex 应用）、Claude Desktop 和 claude.ai，或 Gemini，不接受粘贴的令牌：它们希望服务器引导它们完成 OAuth 登录。设置 `POZNOTE_MCP_AUTH_PROVIDER=poznote` 后，由 Poznote 自己承担这一角色：

1. 您在应用中将 `https://mcp.example.com/mcp` 添加为连接器，如有客户端 ID 和密钥字段，请留空：应用会自行注册。应用通常把这一项放在设置中，称为自定义连接器或远程 MCP 服务器，有些应用只在特定套餐中或开发者模式下提供。
2. 应用打开 Poznote 的登录页面。您照常登录（密码、双重验证或 SSO）。
3. 同意页面会显示应用的名称、它将把您送回的地址以及它将使用的账户，始终是您自己的账户（绝不会是您被授予访问权限的其他账户），并让您选择访问级别：**只读**、**读取和编辑**或**完全访问**，即三个[工具范围](#工具范围)级别。
4. 您点击**允许**后，该应用只能访问这个账户，且只能以该级别访问。

因此，一个 MCP 服务器即可服务整个实例，每个人只能访问自己的笔记（以及与其共享的工作区）。**设置 → 我的账户 → 已连接的应用**会列出这些连接，可以断开其中任意一个，并向每个人提供要粘贴的连接器地址。

要求：

- 聊天应用从互联网连接（ChatGPT 和 claude.ai 从它们自己的服务器连接），因此 MCP 服务器和 Poznote 都必须能从那里通过 **HTTPS** 访问。请将 MCP 服务器放在反向代理之后，并使用**独立的（子）域名**，例如 `https://mcp.example.com`：OAuth 发现文档由该地址的根路径提供。代理将流量转发到哪里，取决于代理运行在哪里：
  - 直接安装在服务器上：代理到 `127.0.0.1:8045`（即 `docker-compose.yml` 发布的端口，`POZNOTE_MCP_PORT`）；
  - 本身运行在 Docker 中（Nginx Proxy Manager、Traefik、Caddy 等）：`127.0.0.1` 指向的会是代理自己的容器。请将代理接入 Poznote 的 Docker 网络，`docker network connect poznote_default <proxy-container>`（该网络以您的 `docker-compose.yml` 所在文件夹命名，参见 `docker network ls`），并代理到 `mcp-server:8045`。
- Poznote 自身的 `/oauth/` 页面前面不能再有另一道登录（例如代理上的 Authelia 或 Authentik 等前置认证，即 forward auth）：应用会从它们的服务器调用其中部分页面，没有浏览器来显示登录页面。
- 在 `.env` 中设置两个变量，然后重建容器（`docker compose up -d --force-recreate mcp-server`）。较旧的 `docker-compose.yml` 不会把它们传入容器：请先下载最新版本。之后，MCP 日志会在启动时显示 `OAuth sign-in through Poznote enabled`。

```bash
POZNOTE_MCP_AUTH_PROVIDER=poznote
# MCP 服务器的公开 URL，不含 /mcp
POZNOTE_MCP_PUBLIC_URL=https://mcp.example.com
```

- Poznote 的公开 URL（用户在此登录）是**设置 → 管理工具 → 管理员 Webhook**中的**实例 URL**，即提醒邮件和 Webhook 使用的那个（为空时使用 `.env` 中的 `POZNOTE_APP_URL`）。如果两者都未设置，它会从管理员的浏览器自动填入；请确认它是人们从互联网访问 Poznote 的地址。更改会在一分钟内同步到 MCP 服务器，无需重启。**已连接的应用**窗口会向管理员显示当前使用的地址，如果它是本地地址或普通 http 地址，会显示警告。

如果无法正常工作：

- **应用提示找不到服务器的授权（OAuth）设置。** 请从您网络之外的一台机器打开 `https://mcp.example.com/.well-known/oauth-protected-resource/mcp` 和 `https://mcp.example.com/.well-known/oauth-authorization-server`：两者都必须返回 JSON。第二个返回 `503` 表示 Poznote 的公开 URL 尚未设置；完全没有响应则表示反向代理无法访问 MCP 服务器。
- **应用打开的登录页面无法加载。** 应用无法访问该实例 URL：请查看**已连接的应用**中的警告，并在**管理员 Webhook → 实例 URL**中修正。
- **MCP 日志在启动时没有显示 `OAuth sign-in through Poznote enabled`。** 变量没有传入容器：请检查 `.env` 和 `docker-compose.yml`，然后重建容器（仅 `restart` 不够）。
- **登录成功，但之后每个请求都失败。** 连接器 URL 必须恰好是 `POZNOTE_MCP_PUBLIC_URL` 后接 `/mcp`；否则 MCP 日志会显示 `Rejecting a token issued for ...`。
- `docker compose logs mcp-server` 会说明服务器拒绝了什么以及原因；`POZNOTE_DEBUG=true` 还会记录每个请求。

适用于每个连接的规则：

- 连接只要在使用就一直有效：应用每小时续期一次访问权限，连续 90 天未使用后必须重新登录。已断开的应用最多还能继续工作 `POZNOTE_MCP_AUTH_CACHE_TTL` 秒（默认 60）。
- `POZNOTE_MCP_SCOPE` 仍是每个连接的上限：以**完全访问**连接到设置为 `write` 的服务器，得到的是 `write`。
- 作用于整个实例的工具（备份、全局设置、系统信息）需要管理员账户，并且请求不能通过 `user_id` 指定其他账户。
- 已连接的应用不能更改账户数据的发送去向：Git 同步的仓库、服务器和令牌，以及 AI 助手和语音输入的地址与密钥。它仍然可以向您配置的仓库推送并从中拉取。
- 启用此模式时，`POZNOTE_MCP_AUTH_TOKEN` 会被忽略。

#### 按调用方身份认证（可选）

上文的 `POZNOTE_MCP_AUTH_TOKEN` 是单一共享密钥：所有客户端都出示同一个令牌，
服务器以单一身份运行。当多个人或多个 agent 共用一个 MCP 实例时，无法区分彼此。

设置 `POZNOTE_MCP_AUTH_PROVIDER` 即可切换到按调用方身份认证：每个客户端出示
**自己的**令牌，该令牌会向外部身份提供方校验，并映射到该调用方的 Poznote 配置
文件。一个实例，多个调用方，各自被正确识别。

这些变量与其他变量一样写在 `.env` 中。它们通过 `mcp-server` 服务的
`environment:` 块传入 MCP 容器，而较旧的 `docker-compose.yml` 中没有这些条目，
此时它们会被静默忽略。如果要设置这些变量，请先下载最新的 `docker-compose.yml`
（参见[更新应用](README.zh-cn.md#更新应用)），并确认 MCP 日志在启动时显示
`Per-caller authentication enabled`。

| variable | default | meaning |
|---|---|---|
| `POZNOTE_MCP_AUTH_PROVIDER` | *(未设置，功能关闭)* | `userinfo` or `introspection` (`poznote` is described [above](#从聊天应用登录chatgptclaudegemini)) |
| `POZNOTE_MCP_AUTH_URL` | *(必填)* | provider endpoint |
| `POZNOTE_MCP_IDENTITY_MATCH` | `oidc_subject:sub` | ordered `<profile-field>:<claim>` pairs |
| `POZNOTE_MCP_AUTH_AUDIENCE` | *(未设置，功能关闭)* | expected `aud`, comma separated; refuses a token issued for another application |
| `POZNOTE_MCP_AUTH_HEADER` | `Authorization` | the header this server sends **to the provider** |
| `POZNOTE_MCP_AUTH_CLIENT_ID` / `_CLIENT_SECRET` | *(未设置，功能关闭)* | `introspection` only, sent as HTTP Basic |
| `POZNOTE_MCP_AUTH_TIMEOUT` | `5` | seconds |
| `POZNOTE_MCP_AUTH_CACHE_TTL` | `60` | seconds a resolved token/profile is cached |

`userinfo` 使用调用方的 bearer 令牌执行 `GET <url>`，即 OpenID Connect 的
UserInfo 端点。令牌从不在本地校验，因此不透明令牌与 JWT 同样可用，也没有需要维护
的 JWKS 或密钥轮换面。`introspection` 以 `token=<token>` 执行 `POST <url>`
（RFC 7662）；响应中带有 `active: false` 表示令牌无效。

`POZNOTE_MCP_IDENTITY_MATCH` 中第一个存在**且恰好匹配一个配置文件**的 claim
胜出。配置文件字段即 `GET /api/v1/admin/users` 返回的字段。默认只比对 subject。
按 `preferred_username` 或 `email` 比对也可用，但更弱：Poznote 自身的登录只在
邮箱已验证时才比对邮箱，而在允许用户自行修改这些字段的提供方上，用户可能因此占用
他人的配置文件。请有意为之再启用。

匹配到两个配置文件的值会因歧义而被拒绝，而不匹配任何配置文件的身份会被直接拒绝：
它绝不会回退到默认配置文件，因为默认配置文件是配置文件 1，即第一个管理员。已停用
的配置文件永远不会成为候选。

启用前需要了解两点后果：

- **显式的 `user_id` 参数只能与解析出的配置文件一致。** 大多数工具都接受该参数，
  因此指向其他配置文件的值会被拒绝，而不是被采纳。
- **不带 `user_id` 的工具**（`get_system_info`、`list_backups`、`create_backup`、
  `delete_backup`）以服务器的默认配置文件运行，因此仅限解析出的配置文件为管理员
  的调用方使用。

设置了 `POZNOTE_MCP_AUTH_PROVIDER` 时，其优先级高于
`POZNOTE_MCP_AUTH_TOKEN`；若该令牌仍然设置，服务器会记录一条警告。

#### 工具范围

默认情况下，服务器公开所有工具。`POZNOTE_MCP_SCOPE` 将其限制为三个级别之一，这对无人值守运行的 agent 很有用，因为笔记内容可能会引导它调用一个本不该调用的工具：

| 级别 | 工具 |
|---|---|
| `read` | 仅限不做任何更改的工具：获取、列出、搜索、反向链接、修订版本、分享状态、系统信息、设置 |
| `write` | `read` 的全部工具，外加可以撤销的更改：笔记、任务、提醒、文件夹、移动、附件、将笔记移入回收站、从回收站或修订版本恢复 |
| `admin` *（默认）* | 全部工具，包括无法撤销的操作（清空回收站、从回收站中永久删除）、工作区、备份、Git 同步、应用设置和公开分享 |

```bash
# 在 .env 中
POZNOTE_MCP_SCOPE=read

# 重建 MCP 容器，使其读取新的环境变量
docker compose up -d --force-recreate mcp-server
```

高于该级别的工具根本不会注册：客户端看不到它，而且无论客户端被告知了什么，对它的调用都会作为未知工具被拒绝。启动日志会显示级别以及公开的工具数量。未知的值会让服务器停止运行，而不是退回到 `admin`。

使用共享令牌时，级别作用于整个服务器：要为两个客户端设置不同级别，请再运行一个 MCP 容器，并为其配置独立的 `POZNOTE_MCP_SCOPE`、端口和 `POZNOTE_MCP_AUTH_TOKEN`。

使用[按调用方身份认证](#按调用方身份认证可选)时，每个调用方都可以根据其令牌中的某个 claim 获得自己的级别。`POZNOTE_MCP_SCOPE_MAP` 列出 `<claim value>=<level>` 键值对，从 `POZNOTE_MCP_SCOPE_CLAIM` 指定的 claim 中读取（默认 `scope`，即以空格分隔的 OAuth 作用域；`groups` 或 `roles` 这类列表型 claim 也可以）：

```bash
# 身份提供方授予每个客户端的 OAuth 作用域
POZNOTE_MCP_SCOPE_MAP=poznote.read=read,poznote.write=write,poznote.admin=admin

# 或者使用组，适用于将组写入令牌的提供方
POZNOTE_MCP_SCOPE_CLAIM=groups
POZNOTE_MCP_SCOPE_MAP=/poznote-agents=read,/poznote-users=write,/poznote-admins=admin
```

调用方获得其 claim 所映射到的最高级别，但绝不会高于 `POZNOTE_MCP_SCOPE`，高于该级别的工具不会出现在它的工具列表中，调用时也会被拒绝。claim 未映射到任何级别的调用方会被直接拒绝（`401`），而不是获得服务器的级别，原因会写入日志。未设置 `POZNOTE_MCP_SCOPE_MAP` 时，所有调用方都获得服务器的级别。

每个工具还带有标准的 MCP 注解 `readOnlyHint` 和 `destructiveHint`，因此自行筛选工具或要求确认工具调用的客户端可以依赖它们。

#### 调试模式

在启动命令中设置 `POZNOTE_DEBUG=true`，可将日志级别从 `INFO` 切换为 `DEBUG`。正常使用时请改回 `false`。只识别完全小写的 `true` 和 `false`。其他任何值都会被视为 `false`，并在 MCP 日志中写入警告。Web 服务器的容忍度更高，还接受 `1`、`on` 或 `yes`。发送到 Poznote API 的每个 HTTP 请求、从 AI 助手收到的每个工具调用以及每个响应，都会详细写入容器日志。可用它来诊断连接或身份验证问题：

```bash
docker compose logs -f mcp-server
```

正常使用时请保持关闭，日常并不需要这些额外的详细信息。

### 启动服务器

```bash
docker-compose up -d
```

### 验证安装

```bash
# 检查容器是否正在运行
docker ps | grep mcp

# 测试端点
curl http://127.0.0.1:8045/mcp
```

要禁用 MCP 服务器，请在 `docker-compose.yml` 中注释掉 `mcp-server` 服务。

---

## 客户端设置

配置您的 AI 助手以连接到 MCP 服务器：

### **VS Code Copilot**
完整设置指南：**[VSCODE-COPILOT.md](VSCODE-COPILOT.zh-cn.md)**

### **Claude CLI**
完整设置指南：**[CLAUDE-CLI.md](CLAUDE-CLI.zh-cn.md)**

### **ChatGPT, Claude Desktop / claude.ai, Gemini**
聊天应用通过 Poznote 登录：参见**[从聊天应用登录](#从聊天应用登录chatgptclaudegemini)**。

---

## 安全

能够访问 MCP 端点的客户端可以做什么，取决于[模式](#按用途选择模式)。

**经典模式**（默认）。任何能够访问该端点的人，都可以读取、创建、修改和删除每个用户资料中的每一条笔记（工具接受 `user_id` 参数），还可以触发备份、还原和设置更改。以下两层防护可以避免这成为问题：

1. **网络可达性。** 默认情况下，只能从本机访问该端点。
2. **入站 Bearer 令牌**（可选）。设置 `POZNOTE_MCP_AUTH_TOKEN` 后，每个请求都必须携带 `Authorization: Bearer <token>`。

使用默认的 `docker-compose.yml` 时，仅第 1 层就已足够。一旦端口可以从您无法完全掌控的地方访问，请加上第 2 层。

**从聊天应用登录，以及按调用方身份认证。** 每个请求都必须携带绑定到某一个人账户的令牌，因此客户端只能访问该账户，且只能以授予它的级别访问。这种情况下，端点本就应当可以从互联网访问，并位于 HTTPS 之后：聊天应用从它们自己的服务器连接。

无论哪种模式，[工具范围](#工具范围)都可以限制客户端能做的操作。

### 为什么仅限 127.0.0.1 既正常又安全

MCP 容器在容器*内部*监听 `0.0.0.0`，这是 Docker 端口映射正常工作所必需的，但端口在宿主机上**只发布在 `127.0.0.1`**，从不发布在公网接口上：

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

这是有意为之，也是正确的配置：只有运行在同一台机器上的进程（或您明确建立的 SSH 隧道）才能连接。使用默认配置时无需担心。

### 在 Docker 之外运行 MCP 服务器

如果您用 `pip` 安装 MCP 服务器并自行运行 `poznote-mcp serve`（systemd、Proxmox LXC 等），前面没有 Docker 端口映射，因此绑定地址就很重要：

- `poznote-mcp serve` **默认绑定到 `127.0.0.1`**。除非您清楚为什么需要其他设置，否则请保留默认值。
- 如果必须绑定到 `0.0.0.0`（另一台主机上的反向代理、VPN 接口），请同时设置 `POZNOTE_MCP_AUTH_TOKEN`。当服务器在非回环地址上监听且没有令牌时，会在启动时记录警告。
- 旧版本默认绑定到 `0.0.0.0`：请显式传入 `--host=127.0.0.1`（或在不使用 `serve` 子命令运行时设置 `MCP_HOST=127.0.0.1`）。

### 远程访问

在经典模式下，如果 Poznote 运行在远程服务器上，而您想从工作站连接，请使用 SSH 端口转发，**不要**公开暴露端口（使用[从聊天应用登录](#从聊天应用登录chatgptclaudegemini)时，在 HTTPS 之后暴露端口正是目的所在，本节不适用）：

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

然后照常将 AI 助手指向 `http://127.0.0.1:8045/mcp`。

### 生产环境

如果必须通过网络路由 MCP 服务器，请用以下方式保护它：
- `POZNOTE_MCP_AUTH_TOKEN`（参见[入站身份验证令牌](#入站身份验证令牌)），或[通过 Poznote 登录](#从聊天应用登录chatgptclaudegemini)，让每个客户端拥有绑定到单个账户、可撤销的独立令牌，并在其前面使用 HTTPS，避免令牌以明文传输
- VPN（Tailscale、WireGuard）
- 可选：带有自身身份验证或 IP 白名单的反向代理（nginx、Caddy），作为额外的一层防护，但使用从聊天应用登录时除外：这些应用从它们自己的、不断变化的地址连接，也无法应对另一道登录，因此端点及其 `/.well-known/` 文档必须保持可访问

### MCP 服务器如何向 Poznote 进行身份验证

MCP 服务器使用存储在 `data/.mcp_token` 中的内部 Bearer 令牌连接 Poznote REST API。Poznote 会自动创建该令牌，Docker Compose 配置会将 `./data` 以只读方式挂载到 MCP 容器中，因此令牌永远不需要放在 `.env` 里。

由于该令牌标识的是 MCP 服务器，当携带它的请求要修改笔记内容或任务（`update_note`、`add_task`、`update_task`、`complete_task`、`delete_task`、`add_subtask`、`update_subtask`、`delete_subtask`）时，Poznote 会在修改前为笔记创建快照。快照在笔记的**修订版本**页面中显示为“MCP 编辑前”，因此如果 AI 重写时丢失了内容，一键即可恢复。如果最新的快照已包含相同内容，则不会再创建快照；每条笔记保留最近 20 个安全快照（AI 编辑前和 MCP 编辑前），如果 MCP 服务器的编辑量大到一个下午就能用完 20 个，可以在**设置 → 修订版本**中调高这个数量（最多 200）。

---

## 使用示例

配置完成后，即可用自然语言与 Poznote 交互：

```
列出工作区 'Poznote' 中的所有笔记
搜索关于 'MCP' 的笔记
根据这次讨论创建一条标题为 'Meeting Notes' 的笔记
用新内容更新笔记 123
将笔记 456 移动到文件夹 'Projects'
```

详细的使用示例和故障排除：
- VS Code Copilot：[VSCODE-COPILOT.md](VSCODE-COPILOT.zh-cn.md#使用示例)
- Claude CLI：[CLAUDE-CLI.md](CLAUDE-CLI.zh-cn.md#使用示例)

---

## 支持与资源

- **[VS Code Copilot 设置 →](VSCODE-COPILOT.zh-cn.md)**
- **[Claude CLI 设置 →](CLAUDE-CLI.zh-cn.md)**

遇到问题时：
- 查看 MCP 服务器日志：`docker compose logs mcp-server`
- 确认 Poznote API 可以访问
- 参阅各客户端的故障排除指南
