<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <b>简体中文</b> ·
  <a href="WEBHOOKS.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Webhook

当实例上发生某些事情时，Poznote 可以通过发送 **传出 Webhook** 来通知外部服务：即带有 JSON 负载的 HTTP POST 请求，投递到您注册的端点。这样就能轻松地将 Poznote 接入 n8n、Zapier 或您自己的脚本等自动化工具。

Poznote 只负责 **发出** Webhook。接收端点如何处理这些请求（发送邮件、触发工作流、记录事件等）完全由接收方决定，与 Poznote 无关。

## 目录

- [概览](#概览)
- [管理 Webhook](#管理-webhook)
- [投递](#投递)
  - [请求格式](#请求格式)
  - [负载封装结构](#负载封装结构)
  - [验证签名](#验证签名)
  - [投递保证](#投递保证)
- [笔记直达链接（实例 URL）](#笔记直达链接实例-url)
- [通用负载对象](#通用负载对象)
  - [data.user 对象](#datauser-对象)
  - [data.note 对象](#datanote-对象)
- [事件参考](#事件参考)
  - [实例事件](#实例事件)
  - [用户事件](#用户事件)
  - [测试 ping](#测试-ping)
- [隐私与安全](#隐私与安全)
- [接收端示例](#接收端示例)

## 概览

Webhook 分为两个相互独立的级别：

| 级别 | 管理位置 | 适用对象 | 事件 |
|---|---|---|---|
| **管理员 Webhook** | **设置 > 管理工具 > 管理员 Webhook** | 仅限管理员 | 实例事件：`user.created`、`user.updated`、`user.activated`、`user.deactivated`、`user.deleted`、`settings.language_changed`、`signup.cap_reached`、`quota.notes_reached`、`quota.storage_reached` |
| **用户 Webhook** | **设置 > 用户 Webhook** | 所有账户（除非被租户隔离禁用） | 与账户自身内容相关的事件：`note.created`、`note.shared`、`reminder.due`、`reminder.due_title`、`reminder.due_minimal` |

隔离规则非常严格：用户事件只会投递到产生该事件的账户所注册的端点。一个用户的笔记和提醒永远不会到达另一个用户的端点。实例事件会发送到所有订阅了该事件的管理员 Webhook。

## 管理 Webhook

在 Webhook 页面（管理员或用户）中，每个 Webhook 由以下内容定义：

- **端点 URL**：必须以 `http://` 或 `https://` 开头。
- **描述**（可选）：简要说明该端点的用途，例如“把新笔记归档到 Notion 的 n8n 工作流”。它会显示在列表中，用于区分多个端点，绝不会发送给端点。
- **密钥**（可选）：设置后，每次投递都会使用 HMAC-SHA256 签名，以便接收方验证发送者的身份。参见[验证签名](#验证签名)。
- **事件**：该端点订阅的事件子集。

每个已注册的 Webhook 都有一个操作菜单（所在行的 **...** 按钮），提供以下选项：

- **编辑**：修改端点 URL、描述、密钥和订阅的事件。表单会直接在该 Webhook 下方展开，并预先填入当前值。
- **发送测试**：立即发送一个 [ping](#测试-ping) 事件，并显示 HTTP 结果。
- **禁用** / **启用**：停止或恢复投递，而不删除该注册。
- **删除**：确认后删除该 Webhook。

页面还会显示每个 Webhook 最近一次投递的结果（HTTP 状态码，或者无法访问端点时的错误信息）及其时间戳。

允许重复注册同一个 URL，但每个条目都会针对其订阅的每个事件收到各自的投递，因此端点会收到重复的请求。

## 投递

### 请求格式

每次投递都是一个带 JSON 请求体的 HTTP `POST` 请求，并包含以下请求头：

| 请求头 | 值 |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | 事件名称，例如 `note.created` |
| `X-Poznote-Delivery` | 唯一的投递 id（与请求体中的 `delivery_id` 值相同） |
| `X-Poznote-Signature-256` | 原始请求体的 `sha256=<hex HMAC>`。仅当 Webhook 设置了密钥时才存在 |

### 负载封装结构

所有负载共用同一个封装结构，只有 `data` 随事件而变化：

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `event` | string | 事件名称，参见[事件参考](#事件参考) |
| `delivery_id` | string | 32 个十六进制字符，每次投递唯一。两个 Webhook 收到同一事件时，id 各不相同 |
| `created_at` | string | 投递的 ISO 8601 时间戳（UTC） |
| `data` | object | 特定于事件的负载，下文按事件分别说明 |

### 验证签名

当 Webhook 设置了密钥时，Poznote 会发送 `X-Poznote-Signature-256: sha256=<signature>`，其中签名是以密钥对 **原始请求体** 计算的 HMAC-SHA256（与 GitHub Webhook 的方案相同）。请在进行任何 JSON 解析之前，基于原始字节进行验证，并使用恒定时间比较：

```js
// Node.js
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader
    && expected.length === signatureHeader.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

```python
# Python
import hashlib, hmac

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
```

应当拒绝没有有效签名的请求：任何发现了端点 URL 的人都可以向它 POST 伪造的事件。

### 投递保证

- 投递是 **尽力而为且同步的**，连接和响应超时均为 5 秒。缓慢或出错的端点永远不会破坏产生该事件的操作（注册、创建笔记）。
- 收到任何 **2xx** 响应即视为投递成功。**不会跟随** 重定向。
- 实例事件、`note.created` 和 `note.shared` 投递失败后 **不会重试**。
- **提醒事件是例外**：它们 *至少投递一次*。只有当所有订阅的端点都接受了提醒，该提醒才会被标记为已发送；否则后台工作进程会重试整个事件（最多 5 次，每次间隔 5 分钟）。因此，正常工作的端点可能会收到重复的提醒事件，应根据 `data.reminder.id` 去重。
- 在账户注册第一个提醒 Webhook 之前就已到期的提醒会被跳过，因此启用 Webhook 不会让积压的全部提醒涌向端点。

## 笔记直达链接（实例 URL）

引用了笔记的负载可以在 `data.note.url` 中携带一个直达链接，格式如下：

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

该链接基于 **实例 URL** 生成，即您的 Poznote 实例的公开 URL，在 **设置 > 管理工具 > 管理员 Webhook** 的 **实例 URL** 部分中配置（仅限管理员）。它与提醒邮件使用的实例 URL 是同一个值，因此在一处设置即对两者同时生效。也可以通过 REST API（`smtp_app_url` 设置）进行设置，或者作为后备方案，使用 `POZNOTE_APP_URL`（或 `APP_URL`）环境变量。

未配置实例 URL 时，`data.note.url` 为 `null`，负载中不包含链接。

## 通用负载对象

### data.user 对象

实例事件使用 `user` 对象描述相关账户：

```json
{
  "user": {
    "id": 7,
    "username": "nina",
    "email": "nina@example.com",
    "first_name": "Nina",
    "last_name": "Martin",
    "source": "admin"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer | Poznote 用户 id |
| `username` | string | 登录用户名 |
| `email` | string 或 null | 邮箱地址，用户资料中没有邮箱时为 `null` |
| `first_name` | string | 名，可能为空 |
| `last_name` | string | 姓，可能为空 |
| `source` | string | 触发该事件的人或来源。出现在 `user.*` 事件中，配额事件中没有。取值：`admin`（管理界面）、`api`（REST API）、`oidc`（SSO 登录或自动创建）、`self`（用户对自己的账户进行操作） |

user 对象永远不包含密码、密码哈希或 OIDC 令牌。

### data.note 对象

用户事件使用 `note` 对象描述相关笔记。具体包含哪些字段取决于事件（下文每个事件都给出了各自的示例），字段取自以下列表：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer | 笔记 id，可用于 [REST API](API-REST.md)（`GET /api/v1/notes/{id}`） |
| `heading` | string | 笔记标题 |
| `type` | string | `note`（HTML）或 `markdown` |
| `workspace` | string | 笔记所在的工作区 |
| `folder` | string | 笔记所在的文件夹 |
| `created` | string | 创建时间戳 |
| `url` | string 或 null | 笔记的直达链接，未配置[实例 URL](#笔记直达链接实例-url) 时为 `null` |

笔记 **内容永远不会发送**，只发送元数据。

## 事件参考

### 实例事件

在 **设置 > 管理工具 > 管理员 Webhook** 中管理。投递到所有订阅了该事件的管理员 Webhook。

#### user.created

创建了一个用户账户：由管理员创建、通过 REST API 创建，或者通过 SSO 自动创建的注册。

```json
{
  "event": "user.created",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "user": {
      "id": 7,
      "username": "nina",
      "email": "nina@example.com",
      "first_name": "Nina",
      "last_name": "Martin",
      "language": "fr",
      "source": "oidc"
    }
  }
}
```

`data.user.source` 为 `admin`、`api` 或 `oidc`。

`data.user.language` 是该账户保存的界面语言代码，如果账户尚未确定语言偏好，默认为 `en`。

#### user.updated

用户资料发生了变化：用户名、邮箱、名、姓或管理员角色。如果实际上没有任何变化，则不会发出该事件。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| 字段 | 说明 |
|---|---|
| `data.user` | 更新 **之后** 的用户资料 |
| `data.changed_fields` | 列出变更内容的数组，取值范围为 `username`、`email`、`first_name`、`last_name`、`is_admin` |

`data.user.source` 为 `admin`、`api`、`oidc` 或 `self`。

#### settings.language_changed

用户在设置中（或通过 REST API `PUT /api/v1/settings/language`）明确更改了界面语言。登录时根据浏览器自动采用的语言本身不会发出该事件，但在入门向导中确认检测到的语言时会发出。在入门向导之外，如果所选语言就是当前正在使用的语言，则不会发出任何事件。该事件会投递到所有订阅了它的管理员 Webhook。

```json
{
  "data": {
    "user": {
      "id": 7,
      "username": "nina",
      "email": "nina@example.com",
      "first_name": "Nina",
      "last_name": "Martin"
    },
    "language": "fr",
    "previous_language": "en",
    "source": "ui"
  }
}
```

| 字段 | 说明 |
|---|---|
| `data.user` | 更改了语言的账户的用户资料 |
| `data.language` | 新的界面语言代码（`en`、`fr`、`de`、`es`、`pt`、`ru`、`zh-cn` 等） |
| `data.previous_language` | 更改之前的语言，账户尚未保存任何语言时为 `null` |
| `data.source` | `ui`（Web 界面）或 `api`（使用 Basic 或 Bearer 凭据认证的 REST API 客户端） |

#### user.activated / user.deactivated

用户账户被重新启用，或者被停用而无法再登录。当启用标志与其他资料字段同时发生变化时，Poznote 会针对该标志发出 `user.activated`/`user.deactivated`，并针对其余字段另外发出一个 `user.updated`。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

用户账户已被删除。负载携带的是 **删除之前** 的用户资料。`data.user.source` 为 `admin`、`api` 或 `self`（用户删除了自己的账户）。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

由于实例已达到最大用户数，一次 SSO 注册被拒绝，这样运维人员可以实时了解到流失的注册。

```json
{
  "data": {
    "max_users": 10,
    "attempted": {
      "username": "newcomer",
      "email": "newcomer@example.com"
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `data.max_users` | 配置的用户数上限 |
| `data.attempted.username` | 被拒绝的注册原本会使用的用户名，未知时为 `null` |
| `data.attempted.email` | 被拒绝的注册的邮箱，未知时为 `null` |

#### quota.notes_reached

由于账户已达到笔记配额（包括回收站中的笔记），一项用户操作被阻止。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin" },
    "quota": {
      "max_notes": 500,
      "note_count": 500
    }
  }
}
```

#### quota.storage_reached

由于账户已达到存储配额，一项用户操作（写入笔记或上传附件）被阻止。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin" },
    "quota": {
      "max_storage_bytes": 1073741824,
      "used_bytes": 1073700000,
      "requested_bytes": 250000
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `data.quota.max_storage_bytes` | 配置的上限，以字节为单位 |
| `data.quota.used_bytes` | 当前用量，以字节为单位 |
| `data.quota.requested_bytes` | 被拒绝的写入的大小 |
| `data.quota.pool` | 仅当被阻止的上传针对的是 S3 附件配额而不是本地存储时才会出现，值为 `"s3"` |

> **限流：** 配额事件会被限流，每个用户、每种事件类型每小时最多投递一次，因此反复触及上限的用户不会让请求涌向端点。在配额事件中，`data.user` 没有 `source` 字段。

### 用户事件

在 **设置 > 用户 Webhook** 中管理。只投递到产生该事件的账户所注册的端点，因此这些负载不携带 `user` 对象：端点属于该账户，而笔记 id 标识了目标。

管理员可以通过 **用户 Webhook** 租户隔离选项（**设置 > 管理工具 > 租户隔离**）为非管理员用户禁用此功能。禁用后，非管理员用户无法打开该页面，其事件也不会被分发；管理员永远不受影响。

#### note.created

账户中创建了一条笔记，来自界面或 REST API。

```json
{
  "event": "note.created",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "type": "markdown",
      "workspace": "Poznote",
      "folder": "Work",
      "created": "2026-08-09 12:34:56",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "source": "ui"
  }
}
```

`data.source` 为 `ui`（Web 界面）或 `api`（使用 Basic 或 Bearer 凭据认证的 REST API 客户端）。

#### note.shared

为账户的某条笔记发布了公开分享链接。

```json
{
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "workspace": "Poznote",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "share": {
      "token": "d41d8cd98f00b204e9800998ecf8427e",
      "url": "https://poznote.example.com/share/d41d8cd98f00b204e9800998ecf8427e",
      "has_password": false,
      "updated": false
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `data.share.token` | 公开分享令牌 |
| `data.share.url` | 公开分享 URL |
| `data.share.has_password` | 链接是否受密码保护 |
| `data.share.updated` | 新分享的笔记为 `false`；笔记此前已分享、链接被重新生成时为 `true` |

#### reminder.due / reminder.due_title / reminder.due_minimal

账户的某条笔记提醒到达了触发时间。该事件由后台提醒工作进程发出，与邮件通道相互独立，因此即使没有配置 SMTP 也会触发。

这三种变体让您可以选择有多少数据离开实例；请订阅适合接收方的那一种：

**`reminder.due`**，完整负载，包含笔记标题和提醒消息：

```json
{
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "workspace": "Poznote",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "reminder": {
      "id": 17,
      "message": "Prepare the agenda",
      "trigger_at": "2026-08-09 14:00:00"
    }
  }
}
```

**`reminder.due_title`**，触发条件相同，但不含提醒消息：

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**，仅包含标识符，不会有任何笔记内容离开实例。如有需要，接收方可以通过 [REST API](API-REST.md) 获取详细信息：

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **至少投递一次：** 提醒事件会一直重试，直到所有订阅的端点都接受为止（最多 5 次，每次间隔 5 分钟），因此端点可能会多次收到同一个提醒。请根据 `data.reminder.id` 去重。

### 测试 ping

Webhook 页面上的 **发送测试** 按钮会向所选端点发送一个 `ping` 事件，并报告 HTTP 结果。它遵循与真实事件相同的封装结构和签名规则：

```json
{
  "event": "ping",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "message": "Poznote webhook test"
  }
}
```

## 隐私与安全

- **笔记内容永远不会离开实例。** 负载只携带元数据：id、标题、工作区、文件夹、时间戳。如果连标题都不应到达端点，请使用 `reminder.due_minimal`。
- **负载中不含凭据。** user 对象永远不包含密码、哈希或令牌。
- **严格按账户划分范围。** 用户事件只投递到产生该事件的账户的端点。
- **验证发送者身份。** 请设置密钥，并在每个请求上验证 `X-Poznote-Signature-256` 请求头；端点 URL 本身必须被视为公开信息。
- **租户隔离。** “用户 Webhook”租户隔离选项可以阻止非管理员用户将其笔记元数据转发到外部端点，该限制在界面和分发时都会执行。
- 投递失败会连同端点 URL 和失败状态一起记录到 PHP 错误日志中。

## 接收端示例

一个验证签名并响应事件的最简 Node.js 接收端：

```js
const crypto = require('crypto');
const http = require('http');

const SECRET = process.env.POZNOTE_WEBHOOK_SECRET;

http.createServer((req, res) => {
  let chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const sig = req.headers['x-poznote-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.writeHead(401).end();
      return;
    }

    const payload = JSON.parse(raw.toString());
    switch (payload.event) {
      case 'note.created':
        console.log(`New note #${payload.data.note.id}: ${payload.data.note.heading}`);
        break;
      case 'reminder.due':
        console.log(`Reminder: ${payload.data.reminder.message} (note ${payload.data.note.id})`);
        break;
    }

    res.writeHead(200).end('ok');
  });
}).listen(9099);
```

将一个 Webhook 指向 `http://your-host:9099/` 并设置匹配的密钥，点击 **发送测试**，您应该就能看到 `ping` 投递到达。
