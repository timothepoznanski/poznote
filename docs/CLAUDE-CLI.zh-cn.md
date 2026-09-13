<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <b>简体中文</b>
</p>
<!-- /lang-selector -->

# 在 Claude CLI 中使用 Poznote MCP 服务器

本指南介绍如何在 Claude CLI（命令行界面）中配置和使用 Poznote MCP 服务器。

## 前提条件

- **Anthropic API 密钥：** Claude CLI 需要付费的 [Anthropic API 密钥](https://console.anthropic.com/)。使用 CLI 之前请先设置：
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- 已安装 Claude CLI（`npm install -g @anthropic-ai/claude-cli` 或类似方式）
- Poznote MCP 服务器正在运行（通过 Docker Compose）
- 可以通过 127.0.0.1 访问 MCP 服务器（默认端口：8045）

## 安装

### 1. 确认 MCP 服务器正在运行

检查 MCP 服务器容器是否正在运行：

```bash
docker ps | grep mcp
```

您应该能看到 MCP 服务器正在运行。记下输出中的端口号（默认为 8045）。

### 2. 将 MCP 服务器添加到 Claude CLI

使用 HTTP 传输添加 Poznote MCP 服务器：

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **注意：** 如果您在 `docker-compose.yml` 中自定义了 MCP 服务器端口，请将 `8045` 替换为实际端口。

#### 使用身份验证令牌

如果 MCP 服务器启动时设置了 `POZNOTE_MCP_AUTH_TOKEN`（参见[入站身份验证令牌](MCP-SERVER.zh-cn.md#入站身份验证令牌)），请以标头形式传入相同的令牌，否则每次调用都会被拒绝并返回 `401 Unauthorized`：

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

配置的保存位置取决于 `--scope` 选项：
- **本地（默认）：** `~/.claude.json`，仅在运行该命令的目录中可用
- **用户（`--scope user`）：** `~/.claude.json`，在您的所有项目中可用
- **项目（`--scope project`）：** 项目根目录下的 `.mcp.json`，用于提交到仓库并与团队共享

### 3. 验证配置

列出所有已配置的 MCP 服务器：
```bash
claude mcp list
```

您应该能在列表中看到 `poznote` 及其 HTTP URL。

### 4. 查看服务器详情

获取 Poznote MCP 服务器的详细信息：
```bash
claude mcp get poznote
```

## 使用示例

配置完成后，您就可以用自然语言命令与 Poznote 实例交互：

### 基本查询

```bash
# 列出所有笔记
claude "列出我在 Poznote 中的所有笔记"

# 搜索笔记
claude "在 Poznote 中搜索关于 'docker' 的笔记"

# 获取指定笔记
claude "显示 Poznote 中的笔记 123"

# 列出工作区
claude "我在 Poznote 中有哪些工作区？"

# 列出文件夹
claude "显示我的 Poznote 工作区中的所有文件夹"
```

### 创建和更新笔记

```bash
# 创建新笔记
# 重要：如果不指定工作区，笔记会创建在当前连接用户的
# 默认工作区中。请始终指定目标工作区。
claude "在 Poznote 的工作区 'Projets' 中创建一条标题为 'Meeting Notes' 的笔记，内容为 '关于新功能的讨论'"

# 更新现有笔记
claude "用关于部署流程的新内容更新 Poznote 中的笔记 456"

# 删除笔记（移到回收站）
claude "删除 Poznote 中的笔记 456"

# 一步创建带提醒的笔记
claude "在 Poznote 的工作区 'Perso' 中创建笔记 'Renew passport'，并在 9 月 1 日上午 9 点提醒我"

# 创建文件夹
claude "在 Poznote 中创建一个名为 'Projects' 的文件夹"
```

### 提醒

```bash
# 为现有笔记设置提醒
claude "下周一上午 8 点提醒我查看 Poznote 中的笔记 123"

# 设置重复提醒
claude "为 Poznote 中的笔记 123 设置每周提醒，每周一上午 9 点"

# 查看提醒
claude "Poznote 中的笔记 123 有提醒吗？"

# 移除提醒
claude "移除 Poznote 中笔记 123 的提醒"
```

### 任务列表

```bash
# 列出任务列表笔记中的任务
claude "显示 Poznote 中笔记 123 的任务"

# 添加带截止日期和提醒的任务
claude "在 Poznote 的笔记 123 中添加任务 'Buy milk'，明天下午 6:30 截止，并设置提醒"

# 添加重复任务
claude "在 Poznote 的笔记 123 中添加任务 'Weekly report'，每周五截止"

# 完成任务
claude "在 Poznote 中将笔记 123 里的任务 'Buy milk' 标记为已完成"

# 更新或删除任务
claude "在 Poznote 中将笔记 123 里任务 'Buy milk' 的截止日期改到下周一"
claude "从 Poznote 的笔记 123 中删除任务 'Buy milk'"
```

### 高级操作

```bash
# 复制笔记
claude "复制 Poznote 中的笔记 789"

# 切换收藏
claude "将 Poznote 中的笔记 123 标记为收藏"

# 将笔记移动到文件夹
claude "将 Poznote 中的笔记 456 移动到文件夹 'Projects'"

# 在 HTML 和 Markdown 之间转换笔记
claude "将 Poznote 中的笔记 123 转换为 Markdown"

# 查找链接到某条笔记的笔记
claude "Poznote 中有哪些笔记链接到了笔记 123？"

# 分享笔记
claude "为 Poznote 中的笔记 123 启用公开分享"

# 列出所有公开分享的内容
claude "列出我在 Poznote 中公开分享的所有笔记和文件夹"

# 获取系统信息
claude "我运行的 Poznote 是哪个版本？"
```

### 文件夹和工作区

```bash
# 重命名或删除文件夹
claude "在 Poznote 中将文件夹 12 重命名为 'Archive'"
claude "删除 Poznote 中的文件夹 12，并将其中的笔记移到回收站"

# 管理工作区
claude "在 Poznote 中创建一个名为 'Work' 的工作区"
claude "在 Poznote 中将工作区 'Work' 重命名为 'Job'"
claude "删除 Poznote 中的工作区 'Job'"
```

### 设置

```bash
# 读取设置
claude "Poznote 中的 'timezone' 设置是什么？"

# 更新设置
claude "在 Poznote 中将 'timezone' 设置为 'Europe/Paris'"
```

### 回收站与恢复

```bash
# 查看回收站
claude "显示 Poznote 回收站中的所有笔记"

# 恢复笔记
claude "从 Poznote 回收站中恢复笔记 123"

# 清空回收站
claude "清空 Poznote 回收站"
```

### Git 同步

```bash
# 查看 Git 同步状态
claude "Poznote 的 Git 同步状态如何？"

# 推送到 Git
claude "将我的 Poznote 笔记推送到 Git"

# 从 Git 拉取
claude "从 Git 拉取笔记到 Poznote"
```

### 备份

```bash
# 列出备份
claude "列出所有 Poznote 备份"

# 创建备份
claude "为我的 Poznote 数据创建一个备份"

# 还原备份（⚠️ 会替换当前所有用户数据）
claude "还原 Poznote 备份 poznote_backup_2026-02-02_15-30-00.zip"

# 删除备份文件
claude "删除 Poznote 备份 poznote_backup_2026-02-02_15-30-00.zip"
```

## 交互模式

启动交互式会话，就您的笔记与 Claude 展开对话：

```bash
claude
```

然后自然地提问：
- “您能显示我所有带 'important' 标签的笔记吗？”
- “为我上周的所有会议笔记写一份摘要”
- “帮我把笔记整理到文件夹中”

## 配置选项

### 使用自定义端口

如果您的 MCP 服务器运行在其他端口上（查看 `docker-compose.yml` 中的 `POZNOTE_MCP_PORT` 设置）：
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### 移除服务器

从 Claude CLI 中移除 Poznote MCP 服务器：
```bash
claude mcp remove poznote
```

### 多个实例

如果您在不同端口上运行多个 Poznote 实例，可以用不同的名称分别配置：
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

然后在查询中指定要使用的实例：
```bash
claude "列出 poznote-work 中的笔记"
```

## 故障排除

### 连接问题

如果 Claude CLI 无法连接到 MCP 服务器：

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

## 安全注意事项

⚠️ **重要：** 任何能够访问 MCP 端点的人都可以管理所有笔记。默认情况下只能从 127.0.0.1 访问；如果您将其进一步暴露，请设置 `POZNOTE_MCP_AUTH_TOKEN`，让客户端必须出示 Bearer 令牌（参见[使用身份验证令牌](#使用身份验证令牌)）。

**默认配置（安全）：**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**远程访问请使用 SSH 隧道：**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

完整说明：[MCP 服务器安全](MCP-SERVER.zh-cn.md#安全)。

## 可用的 MCP 工具

Poznote MCP 服务器提供以下工具：

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

大多数工具接受可选的 `user_id` 参数，用于指定特定的用户资料。例外的是系统级工具 `get_system_info`、`list_backups`、`create_backup` 和 `delete_backup`，它们不接受 `user_id`。
```bash
claude "列出 Poznote 中用户 2 的笔记"
```

## 相关文档

- [MCP 服务器主文档](MCP-SERVER.zh-cn.md)
- [VS Code Copilot 设置](VSCODE-COPILOT.zh-cn.md)
- [安全注意事项](MCP-SERVER.zh-cn.md#安全)

## 支持

遇到问题或有疑问时：
- 查阅 [MCP 主文档](MCP-SERVER.zh-cn.md)
- 查看 MCP 服务器日志：`docker compose logs mcp-server`
- 确认 Poznote API 可以访问
