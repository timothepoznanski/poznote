<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <a href="VSCODE-COPILOT.de.md">Deutsch</a> ·
  <a href="VSCODE-COPILOT.es.md">Español</a> ·
  <a href="VSCODE-COPILOT.pt.md">Português</a> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <b>简体中文</b> ·
  <a href="VSCODE-COPILOT.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# 在 VS Code Copilot 中使用 Poznote MCP 服务器

本指南介绍如何在 VS Code Copilot 中配置和使用 Poznote MCP 服务器。

## 前提条件

- 已安装 Visual Studio Code
- **GitHub Copilot 订阅：** 需要付费（或试用）的 [GitHub Copilot](https://github.com/features/copilot) 套餐，并在 VS Code 中启用 Copilot Chat 扩展
- Poznote MCP 服务器正在运行（通过 Docker Compose）
- 可以通过 127.0.0.1 访问 MCP 服务器（默认端口：8045）

## 配置

### 1. 确认 MCP 服务器正在运行

检查 MCP 服务器容器是否正在运行：

```bash
docker ps | grep mcp
```

您应该能看到 MCP 服务器正在运行。记下输出中的端口号（默认为 8045）。

### 2. 配置 VS Code

将 Poznote MCP 服务器添加到 `mcp.json` 文件中。文件位置取决于您的操作系统：

- **Windows：** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux：** `~/.config/Code/User/mcp.json`
- **macOS：** `~/Library/Application Support/Code/User/mcp.json`

如果该文件不存在，请用以下配置创建它：

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

> **注意：** 如果您在 `docker-compose.yml` 中自定义了 MCP 服务器端口，请将 `8045` 替换为实际端口。

#### 使用身份验证令牌

如果 MCP 服务器启动时设置了 `POZNOTE_MCP_AUTH_TOKEN`（参见[入站身份验证令牌](MCP-SERVER.zh-cn.md#入站身份验证令牌)），请添加对应的标头，否则每次调用都会被拒绝并返回 `401 Unauthorized`：

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

如果不想把令牌写在 `mcp.json` 中，可以让 VS Code 提示您输入：声明一个带有 `"password": true` 的 `inputs` 条目，并以 `"Authorization": "Bearer ${input:poznote-token}"` 的形式引用它。

### 3. 重新加载 VS Code

更新 `mcp.json` 后，重新加载 VS Code 使更改生效：
- 按 `Ctrl+Shift+P`（Mac 上为 `Cmd+Shift+P`）
- 输入“Reload Window”并按 Enter

## 远程服务器设置

如果您的 Poznote 实例运行在远程服务器上，请使用 SSH 端口转发进行安全连接。

### 1. 建立 SSH 隧道

如果您习惯使用命令行，可以创建一个传统的 SSH 隧道：

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

在 VS Code Copilot 中使用 Poznote 期间，请保持此连接处于打开状态。

如果您已经通过 VS Code Remote SSH、Dev Containers 或 Codespaces 连接到远程机器，也可以直接在 VS Code 的 `PORTS` 视图中创建隧道：

1. 在 VS Code 中打开 `PORTS` 面板。
2. 转发远程端口 `8045`。
3. 使用 Copilot 期间保持该转发端口处于活动状态。
4. 如果 VS Code 分配的本地端口不是 `8045`，请在 `mcp.json` 中使用该本地端口。

### 2. 配置 VS Code

使用与本地安装相同的 `mcp.json` 配置：

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

SSH 隧道或 VS Code 转发端口会将远程 MCP 服务器暴露到您的本地机器，因此 VS Code 连接的是 `127.0.0.1`。

## 使用示例

配置完成后，您可以直接在 VS Code 的 Copilot Chat 中用自然语言与 Poznote 实例交互：

### 基本操作

```
# 列出所有笔记
@poznote 列出我的所有笔记

# 搜索笔记
@poznote 搜索关于 "docker" 的笔记

# 获取指定笔记
@poznote 显示笔记 123

# 列出工作区
@poznote 我有哪些工作区？

# 列出文件夹
@poznote 显示我的工作区中的所有文件夹
```

### 创建和更新笔记

> **工作区**：如果您在请求中没有指定工作区，笔记会创建在当前连接用户的默认工作区中。请明确写出目标工作区以避免混淆，例如：*“在工作区 'Projets' 中”*。

```
@poznote 在工作区 "Projets" 中创建一条标题为 "Meeting Notes" 的笔记，内容关于新功能

@poznote 用关于部署流程的新内容更新笔记 456

@poznote 删除笔记 456（会移到回收站）

@poznote 在工作区 "Perso" 中创建笔记 "Renew passport"，并在 9 月 1 日上午 9 点提醒我

@poznote 创建一个名为 "Projects" 的文件夹
```

### 提醒

```
@poznote 下周一上午 8 点提醒我查看笔记 123

@poznote 为笔记 123 设置每周提醒，每周一上午 9 点

@poznote 笔记 123 有提醒吗？

@poznote 移除笔记 123 的提醒
```

### 任务列表

```
@poznote 显示笔记 123 的任务

@poznote 在笔记 123 中添加任务 "Buy milk"，明天下午 6:30 截止，并设置提醒

@poznote 在笔记 123 中添加任务 "Weekly report"，每周五截止

@poznote 将笔记 123 里的任务 "Buy milk" 标记为已完成

@poznote 将笔记 123 里任务 "Buy milk" 的截止日期改到下周一

@poznote 从笔记 123 中删除任务 "Buy milk"
```

### 高级操作

```
@poznote 复制笔记 789

@poznote 将笔记 123 标记为收藏

@poznote 将笔记 456 移动到文件夹 "Projects"

@poznote 将笔记 123 转换为 Markdown

@poznote 哪些笔记链接到了笔记 123？

@poznote 为笔记 123 启用公开分享

@poznote 列出我公开分享的所有笔记和文件夹

@poznote 我运行的 Poznote 是哪个版本？
```

### 文件夹和工作区

```
@poznote 将文件夹 12 重命名为 "Archive"

@poznote 删除文件夹 12，并将其中的笔记移到回收站

@poznote 创建一个名为 "Work" 的工作区

@poznote 将工作区 "Work" 重命名为 "Job"

@poznote 删除工作区 "Job"
```

### 回收站与恢复

```
@poznote 显示回收站中的所有笔记

@poznote 从回收站恢复笔记 123

@poznote 清空回收站
```

### Git 同步

```
@poznote Git 同步状态如何？

@poznote 将我的笔记推送到 Git

@poznote 从 Git 拉取笔记
```

### 备份与设置

```
@poznote 列出所有备份

@poznote 为我的数据创建一个备份

@poznote 还原备份 poznote_backup_2026-02-02_15-30-00.zip

@poznote 删除备份 poznote_backup_2026-02-02_15-30-00.zip

@poznote "timezone" 设置是什么？

@poznote 将 "timezone" 设置为 "Europe/Paris"
```

### 处理内容

```
@poznote 你能汇总我所有带 "important" 标签的笔记吗？

@poznote 帮我按主题把笔记整理到文件夹中

@poznote 根据我的会议笔记写一份周报
```

## 故障排除

### 连接问题

如果 VS Code Copilot 无法连接到 MCP 服务器：

1. **检查 MCP 服务器是否正在运行：**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   （将 `8045` 替换为您配置的端口）

2. **确认 Docker 容器状态：**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **检查端口绑定：**
   确保 `docker-compose.yml` 中的端口绑定到 127.0.0.1：
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

4. **检查 mcp.json 语法：**
   确保 JSON 有效（没有尾随逗号、引号正确等）

### MCP 服务器未被识别

如果 VS Code 无法识别 Poznote MCP 服务器：

1. 确认编辑 `mcp.json` 后已重新加载 VS Code
2. 确认 GitHub Copilot 已启用并处于活动状态
3. 在 VS Code 输出面板中查看是否有错误信息：
   - View → Output（查看 → 输出）
   - 在下拉列表中选择“GitHub Copilot”

### 身份验证错误

MCP 服务器使用存储在 `data/.mcp_token` 中的共享令牌向 Poznote 进行身份验证。

请检查以下几点：
- Poznote 主机上存在 `./data/.mcp_token`
- `mcp-server` 服务挂载了 `./data:/var/www/html/data:ro`
- 升级到基于令牌的 MCP 配置后，webserver 容器至少重建过一次

### 调试模式

通过使用内联环境变量重建容器，为 MCP 服务器启用调试日志：

```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

只识别完全小写的 `true` 和 `false`。其他任何值都会被视为 `false`，并在 MCP 日志中写入警告。

然后查看日志：
```bash
docker compose logs -f mcp-server
```

## 可用的 MCP 工具

Poznote MCP 服务器提供以下可供 VS Code Copilot 使用的工具：

### 笔记管理
- `get_note`：按 ID 获取指定笔记
- `list_notes`：列出所有笔记
- `search_notes`：按文本查询搜索笔记，可选创建日期范围
- `create_note`：创建新笔记，可选设置截止日期/提醒
- `update_note`：更新现有笔记，和/或设置其截止日期/提醒
- `delete_note`：删除笔记
- `duplicate_note`：复制笔记
- `convert_note`：在 HTML 和 Markdown 之间转换笔记
- `get_backlinks`：获取链接到某条笔记的笔记

### 提醒
- `get_reminder`：获取笔记上设置的提醒
- `set_reminder`：设置或替换笔记的提醒，可选重复间隔
- `remove_reminder`：移除笔记的提醒

### 任务
- `list_tasks`：列出任务列表笔记中的任务，包括 ID 和截止日期
- `add_task`：添加单个任务，可选截止日期和提醒
- `update_task`：更新单个任务（文本、截止日期、提醒、重要标记）
- `complete_task`：将任务标记为已完成，或重新打开
- `delete_task`：从任务列表笔记中删除单个任务
- `add_subtask`：为任务列表笔记中的某个任务添加子任务
- `update_subtask`：重命名子任务，或将其标记为已完成或未完成
- `delete_subtask`：删除任务的单个子任务

### 整理
- `create_folder`：创建新文件夹
- `list_folders`：列出所有文件夹
- `rename_folder`：重命名文件夹
- `delete_folder`：删除文件夹并将其中的笔记移到回收站
- `list_workspaces`：列出所有工作区
- `create_workspace`：创建新工作区
- `rename_workspace`：重命名工作区
- `delete_workspace`：删除工作区（不能删除最后一个）
- `list_tags`：列出所有标签
- `move_note_to_folder`：将笔记移动到文件夹
- `remove_note_from_folder`：将笔记移出文件夹
- `toggle_favorite`：切换收藏状态

### 回收站管理
- `get_trash`：列出回收站中的笔记
- `restore_note`：从回收站恢复
- `empty_trash`：清空回收站

### 分享
- `share_note`：启用公开分享
- `unshare_note`：禁用公开分享
- `get_note_share_status`：获取分享状态
- `list_shared`：列出所有公开分享的笔记和文件夹

### 附件
- `list_attachments`：列出笔记附件

### Git 同步
- `get_git_sync_status`：获取 Git 同步状态
- `git_push`：推送到 Git 仓库
- `git_pull`：从 Git 仓库拉取

### 系统
- `get_system_info`：获取 Poznote 版本信息
- `list_backups`：列出系统备份
- `create_backup`：创建备份
- `restore_backup`：还原备份（替换当前用户数据）
- `delete_backup`：删除备份文件
- `get_app_setting`：获取应用设置
- `update_app_setting`：更新应用设置

### 多用户支持

大多数工具接受可选的 `user_id` 参数，用于指定特定的用户资料。例外的是系统级工具 `get_system_info`、`list_backups`、`create_backup` 和 `delete_backup`，它们不接受 `user_id`。您可以在提示中指定：

```
@poznote 列出用户 2 的笔记
```

## 高级配置

### 多个 Poznote 实例

如果您运行了多个 Poznote 实例，可以用不同的名称分别配置：

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

然后显式引用它们：
```
@poznote-work 列出我的工作笔记
```

### 自定义端口配置

如果您的 MCP 服务器运行在其他端口上，请更新 `mcp.json` 中的 URL：

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

## 安全注意事项

⚠️ **重要：** 任何能够访问 MCP 端点的人都可以管理所有笔记。默认情况下只能从 127.0.0.1 访问；如果您将其进一步暴露，请设置 `POZNOTE_MCP_AUTH_TOKEN`，让客户端必须出示 Bearer 令牌（参见[使用身份验证令牌](#使用身份验证令牌)）。

**默认配置（安全）：**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**远程访问请始终使用 SSH 隧道**，具体方法见[远程服务器设置](#远程服务器设置)一节。

完整说明：[MCP 服务器安全](MCP-SERVER.zh-cn.md#安全)。

## 资源

- [MCP 服务器主文档](MCP-SERVER.zh-cn.md)
- [VS Code MCP 官方文档](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Claude CLI 设置](CLAUDE-CLI.zh-cn.md)
- [安全注意事项](MCP-SERVER.zh-cn.md#安全)

## 支持

遇到问题或有疑问时：
- 查阅 [MCP 主文档](MCP-SERVER.zh-cn.md)
- 查看 MCP 服务器日志：`docker compose logs mcp-server`
- 确认 Poznote API 可以访问
- 在 VS Code 输出面板中查看错误
