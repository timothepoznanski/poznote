<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <b>简体中文</b>
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
- `list_tasks`：列出任务列表笔记中的任务，包括 ID、截止日期和标记
- `add_task`：向任务列表笔记添加单个任务，可选截止日期和提醒
- `update_task`：更新单个任务（文本、截止日期、提醒、重要标记）
- `complete_task`：将任务标记为已完成，或重新打开
- `delete_task`：从任务列表笔记中删除单个任务
- `create_folder`：按名称或路径创建文件夹（`folder_path="Projects/2026/Q3"` 一次调用即可创建整条路径），或用 `is_diary=true` 创建日记根文件夹
- `list_folders`：列出工作区中的所有文件夹，包括路径和日记标记
- `list_workspaces`：列出所有可用的工作区
- `list_tags`：列出笔记中使用的所有标签（去重）
- `list_templates`：列出可供 `create_note` 的 `from_template_id` 使用的模板笔记
- `get_trash`：列出当前回收站中的所有笔记
- `empty_trash`：永久删除回收站中的所有笔记
- `restore_note`：从回收站恢复笔记
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
- `list_shared`：列出所有公开分享的笔记和文件夹
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

任务工具一次只处理一个任务：先调用 `list_tasks` 获取任务 ID，再调用 `add_task`、`update_task`、`complete_task` 或 `delete_task`。每次调用只携带该任务，因此客户端永远不需要读取整个任务列表再发回一个全新的数组，两个调用方编辑不同任务时也不会互相覆盖。Poznote 将笔记的任务存储为一个 JSON 数组，服务器每次调用都会重写它，因此单次调用的工作量仍会随列表长度增长。通知会自动保持同步，完成或删除任务时会撤销其待发送的提醒。

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

---

## 安全

任何能够访问 MCP 端点的人，都可以读取、创建、修改和删除每个用户资料中的每一条笔记（工具接受 `user_id` 参数），还可以触发备份、还原和设置更改。以下两层防护可以避免这成为问题：

1. **网络可达性。** 默认情况下，只能从本机访问该端点。
2. **入站 Bearer 令牌**（可选）。设置 `POZNOTE_MCP_AUTH_TOKEN` 后，每个请求都必须携带 `Authorization: Bearer <token>`。

使用默认的 `docker-compose.yml` 时，仅第 1 层就已足够。一旦端口可以从您无法完全掌控的地方访问，请加上第 2 层。

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

如果 Poznote 运行在远程服务器上，而您想从工作站连接，请使用 SSH 端口转发，**不要**公开暴露端口：

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

然后照常将 AI 助手指向 `http://127.0.0.1:8045/mcp`。

### 生产环境

如果必须通过网络路由 MCP 服务器，请用以下方式保护它：
- `POZNOTE_MCP_AUTH_TOKEN`（参见[入站身份验证令牌](#入站身份验证令牌)），并在其前面使用 HTTPS，避免令牌以明文传输
- VPN（Tailscale、WireGuard）
- 可选：带有自身身份验证或 IP 白名单的反向代理（nginx、Caddy），作为额外的一层防护

### MCP 服务器如何向 Poznote 进行身份验证

MCP 服务器使用存储在 `data/.mcp_token` 中的内部 Bearer 令牌连接 Poznote REST API。Poznote 会自动创建该令牌，Docker Compose 配置会将 `./data` 以只读方式挂载到 MCP 容器中，因此令牌永远不需要放在 `.env` 里。

由于该令牌标识的是 MCP 服务器，当携带它的请求要修改笔记内容或任务（`update_note`、`add_task`、`update_task`、`complete_task`、`delete_task`）时，Poznote 会在修改前为笔记创建快照。快照在笔记的快照菜单中显示为“MCP 修改前”，因此如果 AI 重写时丢失了内容，一键即可恢复。如果最新的快照已包含相同内容，则不会再创建快照；每条笔记保留最近 20 个此类快照，如果 MCP 服务器的编辑量大到一个下午就能用完 20 个，可以在**设置 → 快照**中调高这个数量（最多 200）。

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
