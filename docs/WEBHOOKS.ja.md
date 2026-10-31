<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <a href="WEBHOOKS.ko.md">한국어</a> ·
  <b>日本語</b> ·
  <a href="WEBHOOKS.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Webhook

Poznoteは、インスタンスで何かが起きたときに、**送信Webhook**（outgoing webhook）で外部のサービスに知らせることができます。送信Webhookは、JSONのペイロードを付けたHTTP POSTリクエストとして、登録したエンドポイントに送信されます。これを使うと、n8n、Zapier、自作のスクリプトなどの自動化ツールにPoznoteを簡単に組み込めます。

Poznoteが行うのは、Webhookの**送信**だけです。受け取ったエンドポイントでの処理（メールの送信、ワークフローの起動、イベントの記録など）は、何をするかはすべて受信側が決めるものであり、Poznoteの範囲外です。

## 目次

- [概要](#概要)
- [Webhookの管理](#webhookの管理)
- [送信](#送信)
  - [リクエストの形式](#リクエストの形式)
  - [ペイロードの共通構造](#ペイロードの共通構造)
  - [署名の検証](#署名の検証)
  - [送信の保証](#送信の保証)
- [ノートへの直接リンク（インスタンスのURL）](#ノートへの直接リンクインスタンスのurl)
- [共通のペイロードオブジェクト](#共通のペイロードオブジェクト)
  - [data.userオブジェクト](#datauserオブジェクト)
  - [data.noteオブジェクト](#datanoteオブジェクト)
- [イベントリファレンス](#イベントリファレンス)
  - [インスタンスのイベント](#インスタンスのイベント)
  - [ユーザーのイベント](#ユーザーのイベント)
  - [テスト用のping](#テスト用のping)
- [プライバシーとセキュリティ](#プライバシーとセキュリティ)
- [受信側の例](#受信側の例)

## 概要

Webhookには、互いに独立した2つのレベルがあります。

| レベル | 管理する場所 | 使えるユーザー | イベント |
|---|---|---|---|
| **管理者用Webhook** | 「設定 > 管理ツール > 管理者用Webhook」 | 管理者のみ | インスタンスのイベント：`user.created`、`user.updated`、`user.activated`、`user.deactivated`、`user.deleted`、`settings.language_changed`、`signup.cap_reached`、`quota.notes_reached`、`quota.storage_reached`、`backup.completed`、`backup.failed` |
| **ユーザーのWebhook** | 「設定 > ユーザーのWebhook」 | すべてのアカウント（テナント分離でブロックされている場合を除く） | そのアカウント自身のコンテンツに関するイベント：`note.created`、`note.shared`、`reminder.due`、`reminder.due_title`、`reminder.due_minimal` |

分離のルールは厳格です。ユーザーのイベントは、そのイベントを発生させたアカウントが登録したエンドポイントにだけ送信されます。あるユーザーのノートやリマインダーが、別のユーザーのエンドポイントに届くことはありません。インスタンスのイベントは、購読しているすべての管理者用Webhookに送信されます。

## Webhookの管理

Webhookのページ（管理者用またはユーザー用）では、各Webhookを次の項目で定義します。

- **エンドポイントURL**：`http://`または`https://`で始まる必要があります。
- **説明**（任意）：エンドポイントの用途を表す短いメモです。たとえば「新しいノートをNotionに登録するn8nのワークフロー」のように書きます。一覧で複数のエンドポイントを見分けるために表示されるもので、エンドポイントに送信されることはありません。
- **シークレット**（任意）：設定すると、すべての送信がHMAC-SHA256で署名され、受信側が送信元を認証できるようになります。[署名の検証](#署名の検証)を参照してください。
- **イベント**：このエンドポイントが購読するイベント（全イベントのうちの一部）です。

登録した各Webhookには、操作メニュー（その行にある「...」ボタン）があり、次の操作ができます。

- **編集**：エンドポイントURL、説明、シークレット、購読するイベントを変更します。フォームはそのWebhookのすぐ下に、現在の値が入力された状態で開きます。
- **テストを送信**：[ping](#テスト用のping)イベントをすぐに送信し、HTTPの結果を表示します。
- **無効にする** / **有効にする**：登録を削除せずに、送信を停止または再開します。
- **削除**：確認のうえで、Webhookを削除します。

ページには、各Webhookの最後の送信の結果（HTTPステータスコード、またはエンドポイントに到達できなかった場合はそのエラー）と、その日時も表示されます。

同じURLを2回登録することもできます。ただし、それぞれの登録が、購読しているすべてのイベントについて個別に送信を受けるため、エンドポイントには重複したリクエストが届きます。

## 送信

### リクエストの形式

送信は、どれもJSONの本文と次のヘッダーを付けたHTTP `POST`です。

| ヘッダー | 値 |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | イベント名（例：`note.created`） |
| `X-Poznote-Delivery` | 送信ごとに一意のID（本文の`delivery_id`と同じ値） |
| `X-Poznote-Signature-256` | 生の本文に対する`sha256=<hex HMAC>`（16進数のHMAC）。Webhookにシークレットがある場合にだけ付きます |

### ペイロードの共通構造

どのペイロードも同じ共通構造（エンベロープ）を持ち、イベントごとに変わるのは`data`だけです。

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `event` | string | イベント名。[イベントリファレンス](#イベントリファレンス)を参照してください |
| `delivery_id` | string | 16進数の32文字で、送信ごとに一意です。同じイベントを受け取る2つのWebhookには、異なるIDが付きます |
| `created_at` | string | 送信日時を表すISO 8601形式のタイムスタンプ（UTC） |
| `data` | object | イベント固有のペイロード。内容はイベントごとに後述します |

### 署名の検証

Webhookにシークレットがある場合、Poznoteは`X-Poznote-Signature-256: sha256=<signature>`を送信します。この署名は、シークレットをキーとした**リクエストの生の本文**のHMAC-SHA256です（GitHubのWebhookと同じ方式）。JSONを解析する前に生のバイト列に対して検証し、比較には定数時間の比較を使ってください。

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

有効な署名のないリクエストは拒否してください。エンドポイントのURLを知った人は誰でも、偽のイベントをPOSTできるからです。

### 送信の保証

- 送信は**ベストエフォートかつ同期的**に行われ、接続と応答のタイムアウトは5秒です。エンドポイントが遅かったり失敗したりしても、イベントのもとになった操作（登録、ノートの作成など）が妨げられることはありません。
- **2xx**の応答であれば、送信は成功したとみなされます。リダイレクトには**従いません**。
- インスタンスのイベント、`note.created`、`note.shared`の送信に失敗した場合、**再試行は行われません**。
- **リマインダーのイベントは例外**で、*少なくとも1回*送信されます。リマインダーが送信済みになるのは、購読しているすべてのエンドポイントが受け付けた場合だけです。そうでない場合は、バックグラウンドワーカーがイベント全体を再試行します（5分間隔で最大5回）。そのため、正常なエンドポイントにも同じリマインダーのイベントが重複して届くことがあるので、`data.reminder.id`で重複を除いてください。
- アカウントが最初のリマインダー用のWebhookを登録する前に通知時刻を過ぎていたリマインダーは、スキップされます。そのため、Webhookを有効にしても、たまっていたリマインダーがまとめてエンドポイントに押し寄せることはありません。

## ノートへの直接リンク（インスタンスのURL）

ノートを参照するペイロードには、`data.note.url`にノートへの直接リンクを含めることができます。形式は次のとおりです。

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

このリンクは、Poznoteインスタンスの公開URLである**インスタンスのURL**をもとに作られます。インスタンスのURLは、「設定 > 管理ツール > 管理者用Webhook」の「インスタンスのURL」セクションで設定します（管理者のみ）。リマインダーのメールで使うインスタンスのURLと同じ値なので、一方で設定すれば両方に反映されます。REST API（`smtp_app_url`設定）で設定することもでき、代わりの手段として環境変数`POZNOTE_APP_URL`（または`APP_URL`）でも設定できます。Poznote経由で[MCPサーバー](MCP-SERVER.ja.md)にログインするチャットアプリも、このアドレスに送られます。値が空のあいだは、管理者が初めてPoznoteを使ったときに、そのブラウザーから値が設定されます。それ以降は、ここで変更したときにだけ変わります。

インスタンスのURLが設定されていない場合、`data.note.url`は`null`になり、ペイロードにリンクは含まれません。

## 共通のペイロードオブジェクト

### data.userオブジェクト

インスタンスのイベントでは、対象のアカウントを`user`オブジェクトで表します。

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

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | integer | PoznoteのユーザーID |
| `username` | string | ログインに使うユーザー名 |
| `email` | stringまたはnull | メールアドレス。プロフィールにない場合は`null` |
| `first_name` | string | 名。空の場合もあります |
| `last_name` | string | 姓。空の場合もあります |
| `source` | string | イベントの発生元。`user.*`のイベントにはあり、上限のイベントにはありません。値：`admin`（管理画面）、`api`（REST API）、`oidc`（SSOでのログインまたは自動プロビジョニング）、`self`（ユーザーが自分のアカウントを操作した場合） |

ユーザーオブジェクトに、パスワード、パスワードのハッシュ、OIDCのトークンが含まれることはありません。

### data.noteオブジェクト

ユーザーのイベントでは、対象のノートを`note`オブジェクトで表します。含まれるフィールドはイベントによって異なり（各イベントの例を後述します）、次の中から選ばれます。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | integer | ノートID。[REST API](API-REST.md)（`GET /api/v1/notes/{id}`）で使えます |
| `heading` | string | ノートのタイトル |
| `type` | string | `note`（HTML）または`markdown` |
| `workspace` | string | ノートがあるワークスペース |
| `folder` | string | ノートがあるフォルダー |
| `created` | string | 作成日時 |
| `url` | stringまたはnull | ノートへの直接リンク。[インスタンスのURL](#ノートへの直接リンクインスタンスのurl)が設定されていない場合は`null` |

ノートの**内容が送信されることはなく**、送られるのはメタデータだけです。

## イベントリファレンス

### インスタンスのイベント

「設定 > 管理ツール > 管理者用Webhook」で管理します。購読しているすべての管理者用Webhookに送信されます。

#### user.created

ユーザーアカウントが作成されたときに送信されます。作成元は、管理者、REST API、SSOの自動プロビジョニングによる登録のいずれかです。

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

`data.user.source`は`admin`、`api`、`oidc`のいずれかです。

`data.user.language`は、アカウントに保存されているインターフェースの言語コードです。アカウントでまだ言語が設定されていない場合は`en`になります。

#### user.updated

ユーザーのプロフィール（ユーザー名、メールアドレス、名、姓、管理者権限）が変更されたときに送信されます。実際には何も変わっていない場合は送信されません。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| フィールド | 説明 |
|---|---|
| `data.user` | 更新**後**のプロフィール |
| `data.changed_fields` | 変更された項目の配列。`username`、`email`、`first_name`、`last_name`、`is_admin`のいずれか |

`data.user.source`は`admin`、`api`、`oidc`、`self`のいずれかです。

#### settings.language_changed

ユーザーのインターフェースの言語が、設定で（またはREST APIの`PUT /api/v1/settings/language`で）明示的に変更されたときに送信されます。ログイン時にブラウザーの言語を自動で採用しただけでは、このイベントは送信されません。ただし、スタートアップガイドで、検出された言語を確定した場合は送信されます。スタートアップガイド以外では、選んだ言語がすでに使っている言語と同じ場合は何も送信されません。このイベントは、購読しているすべての管理者用Webhookに送信されます。

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

| フィールド | 説明 |
|---|---|
| `data.user` | 言語を変更したアカウントのプロフィール |
| `data.language` | 新しいインターフェースの言語コード（`en`、`fr`、`de`、`es`、`pt`、`ru`、`zh-cn`、...） |
| `data.previous_language` | 変更前の言語。アカウントにまだ言語が保存されていなかった場合は`null` |
| `data.source` | `ui`（Webインターフェース）または`api`（BasicまたはBearerの資格情報で認証したREST APIクライアント） |

#### user.activated / user.deactivated

ユーザーアカウントが再び有効にされたとき、または無効にされてログインできなくなったときに送信されます。有効かどうかのフラグが、ほかのプロフィールの項目と同時に変わった場合、Poznoteはフラグについて`user.activated`/`user.deactivated`を送信し、それ以外の変更については別に`user.updated`を送信します。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

ユーザーアカウントが削除されたときに送信されます。ペイロードには、**削除前の時点の**プロフィールが含まれます。`data.user.source`は`admin`、`api`、`self`（ユーザーが自分のアカウントを削除した場合）のいずれかです。

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

インスタンスのユーザー数が上限に達したため、SSOでの登録が拒否されたときに送信されます。これにより運用者は、取りこぼした登録をリアルタイムで把握できます。

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

| フィールド | 説明 |
|---|---|
| `data.max_users` | 設定されているユーザー数の上限 |
| `data.attempted.username` | 拒否された登録で使われるはずだったユーザー名。不明な場合は`null` |
| `data.attempted.email` | 拒否された登録のメールアドレス。不明な場合は`null` |

#### quota.notes_reached

アカウントがノート数の上限（ゴミ箱のノートを含む）に達したため、ユーザーの操作がブロックされたときに送信されます。

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

アカウントがストレージの上限に達したため、ユーザーの操作（ノートの書き込みまたは添付ファイルのアップロード）がブロックされたときに送信されます。

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

| フィールド | 説明 |
|---|---|
| `data.quota.max_storage_bytes` | 設定されている上限（バイト単位） |
| `data.quota.used_bytes` | 現在の使用量（バイト単位） |
| `data.quota.requested_bytes` | 拒否された書き込みのサイズ |
| `data.quota.pool` | ブロックされたアップロードの対象が、ローカルのストレージではなくS3の添付ファイルの上限だった場合にだけ、値`"s3"`で含まれます |

> **送信の抑制**：上限のイベントは、ユーザーごと、イベントの種類ごとに、1時間に最大1回までしか送信されません。そのため、ユーザーが何度も上限に達しても、エンドポイントにイベントが押し寄せることはありません。上限のイベントでは、`data.user`に`source`フィールドはありません。

#### backup.completed / backup.failed

各設定ページで指定したスケジュールによる、S3バケットまたはローカルフォルダーへの自動バックアップ、または管理者が「今すぐバックアップ」で開始したバックアップが終わったときに送信されます。イベントはユーザーごとではなく、実行ごとに1回送信されます。選択したすべてのユーザーがエラーなくバックアップされた場合は`backup.completed`です。少なくとも1人のユーザーで失敗した場合、古いアーカイブを削除できなかった場合、保存先に到達できなかった場合、誰もバックアップされなかった場合は`backup.failed`です。ユーザーが自分のアカウントについて開始したバックアップでは、これらのイベントは送信されません。

```json
{
  "event": "backup.failed",
  "delivery_id": "…",
  "created_at": "2026-10-16T03:00:12+00:00",
  "data": {
    "backup": {
      "target": "s3",
      "trigger": "auto",
      "users": 3,
      "backed_up": 2,
      "errors": ["nina: Access Denied"]
    }
  }
}
```

| フィールド | 説明 |
|---|---|
| `data.backup.target` | `s3`（S3のバックアップ用バケット）または`local`（ローカルのバックアップ用フォルダー） |
| `data.backup.trigger` | `auto`（スケジュールによる実行）または`manual`（管理者が開始した実行） |
| `data.backup.users` | 実行の対象として選択されたユーザーの数 |
| `data.backup.backed_up` | 書き込まれたアーカイブの数 |
| `data.backup.errors` | エラーメッセージ（最大10件）。1人のユーザーに関するものには、先頭にユーザー名が付きます。`backup.completed`では空です |

> **healthchecks.ioでの監視**：Webhookを2つ登録します。1つはチェックのping URL（`https://hc-ping.com/<uuid>`）で、`backup.completed`を購読します。もう1つは同じURLの末尾に`/fail`を付けたもので、`backup.failed`を購読します。チェックの期間はバックアップの頻度に合わせてください。ワーカーが停止したり、実行中にクラッシュしたりするとイベントが送信されないので、pingが届かないことでアラートが発生します。

### ユーザーのイベント

「設定 > ユーザーのWebhook」で管理します。イベントを発生させたアカウントが登録したエンドポイントにだけ送信されます。そのため、これらのペイロードには`user`オブジェクトが含まれません。エンドポイントはそのアカウントのものであり、対象はノートIDで特定できるからです。

管理者は、テナント分離のオプション「ユーザーのWebhook」（「設定 > 管理ツール > テナント分離」）で、管理者以外のユーザーがこの機能を使えないようにできます。ブロックされている場合、管理者以外のユーザーはこのページを開けず、そのユーザーのイベントも送信されません。管理者は影響を受けません。

#### note.created

アカウントでノートが作成されたときに送信されます。画面からの作成とREST APIからの作成のどちらも対象です。

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

`data.source`は`ui`（Webインターフェース）または`api`（BasicまたはBearerの資格情報で認証したREST APIクライアント）です。

#### note.shared

アカウントのノートの公開リンクが発行されたときに送信されます。

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

| フィールド | 説明 |
|---|---|
| `data.share.token` | 公開リンクのトークン |
| `data.share.url` | 公開リンクのURL |
| `data.share.has_password` | リンクがパスワードで保護されているかどうか |
| `data.share.updated` | 新たに共有されたノートでは`false`、すでに共有されていたノートのリンクが再発行された場合は`true` |

#### reminder.due / reminder.due_title / reminder.due_minimal

アカウントのノートのリマインダーが、通知時刻になったときに送信されます。このイベントは、メールでの通知とは別に、バックグラウンドのリマインダーワーカーが送信します。そのため、SMTPが設定されていなくても送信されます。

3つの種類を使い分けることで、インスタンスの外に出るデータの量を選べます。受信側に合ったものを購読してください。

**`reminder.due`**：すべてを含むペイロードです。ノートのタイトルとリマインダーのメッセージを含みます。

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

**`reminder.due_title`**：送信のタイミングは同じですが、リマインダーのメッセージは含みません。

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**：識別子だけを含み、ノートの内容はインスタンスの外に出ません。必要に応じて、受信側は[REST API](API-REST.md)で詳細を取得できます。

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **少なくとも1回の送信**：リマインダーのイベントは、購読しているすべてのエンドポイントが受け付けるまで再試行されます（5分間隔で最大5回）。そのため、エンドポイントが同じリマインダーを複数回受け取ることがあります。`data.reminder.id`で重複を除いてください。

### テスト用のping

Webhookのページにある「テストを送信」ボタンは、選択したエンドポイントに`ping`イベントを送信し、HTTPの結果を表示します。実際のイベントと同じ共通構造と署名のルールに従います。

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

## プライバシーとセキュリティ

- **ノートの内容はインスタンスの外に出ません**。ペイロードに含まれるのはメタデータ（ID、タイトル、ワークスペース、フォルダー、タイムスタンプ）だけです。タイトルもエンドポイントに送りたくない場合は、`reminder.due_minimal`を使ってください。
- **ペイロードに資格情報は含まれません**。ユーザーオブジェクトに、パスワード、ハッシュ、トークンが含まれることはありません。
- **アカウントごとに厳格に分離**。ユーザーのイベントは、そのイベントを発生させたアカウントのエンドポイントにだけ送信されます。
- **送信元を認証してください**。シークレットを設定し、すべてのリクエストで`X-Poznote-Signature-256`ヘッダーを検証してください。エンドポイントのURLを秘密情報として扱わず、公開されうるものとして扱ってください。
- **テナント分離**。テナント分離のオプション「ユーザーのWebhook」を使うと、管理者以外のユーザーが自分のノートのメタデータを外部のエンドポイントに中継できなくなります。この制限は、画面と送信時の両方で適用されます。
- 送信に失敗した場合は、エンドポイントのURLと失敗のステータスがPHPのエラーログに記録されます。

## 受信側の例

署名を検証して、イベントに応じて処理する最小限のNode.jsの受信側です。

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

一致するシークレットを設定したWebhookを`http://your-host:9099/`に向けて「テストを送信」を押すと、`ping`の送信が届くことを確認できます。
