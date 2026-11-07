<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a> ·
  <a href="CLAUDE-CLI.ko.md">한국어</a> ·
  <b>日本語</b> ·
  <a href="CLAUDE-CLI.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Claude CLIでPoznote MCPサーバーを使う

このガイドでは、Claude CLI（コマンドラインインターフェイス）でPoznote MCPサーバーを設定して使う方法を説明します。

## 前提条件

- **Anthropicのアカウント**：Claude CLIは、Claudeのサブスクリプション、または[Anthropic APIキー](https://console.anthropic.com/)でサインインします。APIキーを使う場合は、CLIを使う前に設定してください。
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLIがインストールされていること（`npm install -g @anthropic-ai/claude-code`）
- Poznote MCPサーバーが（Docker Composeで）起動していること
- MCPサーバーに127.0.0.1でアクセスできること（既定のポート：8045）

## インストール

### 1. MCPサーバーが起動していることを確認

MCPサーバーのコンテナーが起動していることを確認します。

```bash
docker ps | grep mcp
```

MCPサーバーが起動していれば、出力に表示されます。出力にあるポート番号（既定は8045）を控えておいてください。

### 2. Claude CLIにMCPサーバーを追加

HTTPトランスポートを使って、Poznote MCPサーバーを追加します。

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **メモ**：`docker-compose.yml`でポートを変更している場合は、`8045`を実際のMCPサーバーのポートに置き換えてください。

#### 認証トークンを使う

MCPサーバーを`POZNOTE_MCP_AUTH_TOKEN`付きで起動している場合（[受信用の認証トークン](MCP-SERVER.ja.md#受信用の認証トークン)を参照）は、同じトークンをヘッダーで渡してください。渡さないと、すべての呼び出しが`401 Unauthorized`で拒否されます。

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

設定の保存先は、`--scope`オプションによって変わります。
- **ローカル（既定）**：`~/.claude.json`。コマンドを実行したディレクトリでだけ使えます
- **ユーザー（`--scope user`）**：`~/.claude.json`。すべてのプロジェクトで使えます
- **プロジェクト（`--scope project`）**：プロジェクトのルートにある`.mcp.json`。コミットしてチームで共有するためのものです

### 3. 設定を確認

設定済みのMCPサーバーを一覧表示します。
```bash
claude mcp list
```

一覧に`poznote`がHTTPのURLとともに表示されます。

### 4. サーバーの詳細を表示

Poznote MCPサーバーの詳しい情報を表示します。
```bash
claude mcp get poznote
```

## 使用例

設定が済んだら、自然な言葉で指示してPoznoteのインスタンスを操作できます。

### 基本的な問い合わせ

```bash
# すべてのノートを一覧表示
claude "Poznoteのノートをすべて一覧表示して"

# ノートを検索
claude "Poznoteで「docker」に関するノートを検索して"

# 特定のノートを表示
claude "Poznoteのノート123を表示して"

# ワークスペースを一覧表示
claude "Poznoteにはどんなワークスペースがある？"

# フォルダーを一覧表示
claude "Poznoteのワークスペースにあるフォルダーをすべて表示して"
```

### ノートの作成と更新

```bash
# 新しいノートを作成
# 重要：作成先のワークスペースは必ず指定してください。指定しない場合、サーバーは
# mcp_default_workspace設定、またはアカウントに1つだけあるワークスペースを使い、
# ワークスペースが複数あってこの設定が空のときは呼び出しを拒否します。
claude "Poznoteのワークスペース「プロジェクト」に、タイトルが「議事録」、内容が「新機能についての議論」のノートを作成して"

# 既存のノートを更新
claude "Poznoteのノート456を、デプロイ手順についての新しい内容で更新して"

# ノートを削除（ゴミ箱に移動）
claude "Poznoteのノート456を削除して"

# リマインダー付きのノートを一度に作成
claude "Poznoteのワークスペース「個人」に「パスポートの更新」というノートを作成して、9月1日の午前9時にリマインドして"

# フォルダーを作成
claude "Poznoteに「プロジェクト」というフォルダーを作成して"
```

### リマインダー

```bash
# 既存のノートにリマインダーを設定
claude "Poznoteのノート123について、来週の月曜日の午前8時にリマインドして"

# 繰り返しのリマインダーを設定
claude "Poznoteのノート123に、毎週月曜日の午前9時の繰り返しリマインダーを設定して"

# リマインダーを確認
claude "Poznoteのノート123にリマインダーは設定されている？"

# リマインダーを解除
claude "Poznoteのノート123のリマインダーを解除して"
```

### タスクリスト

```bash
# タスクリストのノートにあるタスクを一覧表示
claude "Poznoteのノート123のタスクを表示して"

# 期限とリマインダー付きのタスクを追加
claude "Poznoteのノート123に、期限が明日の午後6時30分でリマインダー付きのタスク「牛乳を買う」を追加して"

# 繰り返しのタスクを追加
claude "Poznoteのノート123に、毎週金曜日が期限のタスク「週報」を追加して"

# タスクを完了にする
claude "Poznoteのノート123のタスク「牛乳を買う」を完了にして"

# タスクを更新または削除
claude "Poznoteのノート123のタスク「牛乳を買う」の期限を来週の月曜日に変更して"
claude "Poznoteのノート123からタスク「牛乳を買う」を削除して"
```

### 高度な操作

```bash
# ノートを複製
claude "Poznoteのノート789を複製して"

# お気に入りを切り替え
claude "Poznoteのノート123をお気に入りに追加して"

# ノートをフォルダーに移動
claude "Poznoteのノート456をフォルダー「プロジェクト」に移動して"

# ノートをHTMLとMarkdownのあいだで変換
claude "Poznoteのノート123をMarkdownに変換して"

# あるノートにリンクしているノートを探す
claude "Poznoteでノート123にリンクしているノートはどれ？"

# ノートを共有
claude "Poznoteのノート123を公開リンクで共有して"

# 公開リンクで共有しているものをすべて一覧表示
claude "Poznoteで公開リンクで共有しているノートとフォルダーをすべて一覧表示して"

# システムの情報を取得
claude "動いているPoznoteのバージョンは？"
```

### フォルダーとワークスペース

```bash
# フォルダーの名前を変更、または削除
claude "Poznoteのフォルダー12の名前を「アーカイブ」に変更して"
claude "Poznoteのフォルダー12を削除して、中のノートをゴミ箱に移動して"

# ワークスペースを管理
claude "Poznoteに「仕事」というワークスペースを作成して"
claude "Poznoteのワークスペース「仕事」の名前を「業務」に変更して"
claude "Poznoteのワークスペース「業務」を削除して"
```

### 設定

```bash
# 設定を読み取る
claude "Poznoteの設定「timezone」の値は？"

# 設定を変更
claude "Poznoteの設定「timezone」を「Asia/Tokyo」にして"
```

### ゴミ箱と復元

```bash
# ゴミ箱を表示
claude "Poznoteのゴミ箱にあるノートをすべて表示して"

# ノートを復元
claude "Poznoteのゴミ箱からノート123を復元して"

# ゴミ箱を空にする
claude "Poznoteのゴミ箱を空にして"
```

### Git同期

```bash
# Git同期の状態を確認
claude "PoznoteのGit同期の状態は？"

# Gitにプッシュ
claude "PoznoteのノートをGitにプッシュして"

# Gitからプル
claude "GitからPoznoteにノートをプルして"
```

### バックアップ

```bash
# バックアップを一覧表示
claude "Poznoteのバックアップをすべて一覧表示して"

# バックアップを作成
claude "Poznoteのデータのバックアップを作成して"

# バックアップから復元（⚠️ 現在のユーザーのデータがすべて置き換えられます）
claude "Poznoteのバックアップ「poznote_backup_2026-02-02_15-30-00.zip」から復元して"

# バックアップファイルを削除
claude "Poznoteのバックアップ「poznote_backup_2026-02-02_15-30-00.zip」を削除して"
```

## 対話モード

Claudeとノートについて会話できる対話型のセッションを開始します。

```bash
claude
```

あとは、普段の言葉で質問します。
- 「タグ『重要』が付いたノートをすべて表示してくれる？」
- 「先週の議事録をすべてまとめた要約を作って」
- 「ノートをフォルダーに整理するのを手伝って」

## 設定のオプション

### カスタムポートを使う

MCPサーバーを別のポートで動かしている場合は、次のように指定します（ポートは`docker-compose.yml`の`POZNOTE_MCP_PORT`の設定で確認できます）。
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### サーバーの登録を削除

Claude CLIからPoznote MCPサーバーの登録を削除するには、次を実行します。
```bash
claude mcp remove poznote
```

### 複数のインスタンス

複数のPoznoteインスタンスを別々のポートで動かしている場合は、それぞれ別の名前で設定できます。
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

あとは、問い合わせの中でどのインスタンスを使うかを指定します。
```bash
claude "poznote-workのノートを一覧表示して"
```

## トラブルシューティング

### 接続の問題

Claude CLIがMCPサーバーに接続できない場合は、次の点を確認してください。

1. **MCPサーバーが起動しているか確認する**：
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   （`8045`は設定したポートに置き換えてください）

2. **Dockerコンテナーの状態を確認する**：
   ```bash
   docker ps | grep mcp
   docker compose logs mcp-server
   ```

3. **ポートのバインドを確認する**：
   `docker-compose.yml`で、ポートが127.0.0.1にバインドされていることを確かめてください。
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### 認証エラー

MCPサーバーは、`data/.mcp_token`に保存されている共有トークンを使ってPoznoteに認証します。

次の点を確認してください。
- Poznoteのホストに`./data/.mcp_token`があること
- `mcp-server`サービスが`./data:/var/www/html/data:ro`をマウントしていること
- トークン方式のMCP設定に更新したあと、`webserver`のコンテナーを少なくとも1回作り直していること

### デバッグモード

コマンドの先頭で環境変数を指定してコンテナーを作り直すと、MCPサーバーのデバッグログが有効になります。
```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

認識される値は、小文字の`true`と`false`だけです。それ以外の値は`false`として扱われ、MCPのログに警告が書き込まれます。

そのあと、ログを確認します。
```bash
docker compose logs -f mcp-server
```

## セキュリティに関する注意

⚠️ **重要**：MCPのエンドポイントにアクセスできる人は誰でも、すべてのノートを操作できます。既定では127.0.0.1からしかアクセスできません。それ以外からもアクセスできるようにする場合は、`POZNOTE_MCP_AUTH_TOKEN`を設定して、クライアントにBearerトークンの提示を求めてください（[認証トークンを使う](#認証トークンを使う)を参照）。

**既定の設定（安全）**：
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**リモートからアクセスするには、SSHトンネルを使います**：
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

詳しくは[MCPサーバーのセキュリティ](MCP-SERVER.ja.md#セキュリティ)を参照してください。

## 利用できるMCPツール

サーバーには、ノート、タスク、リマインダー、フォルダー、ワークスペース、タグ、添付ファイル、リビジョン、共有、Git同期、バックアップのためのツールがあります。それぞれのツールと役割は[MCPサーバーのドキュメント](MCP-SERVER.ja.md#機能)に1つずつ載っており、この一覧が最新に保たれているのはそこだけです。

### マルチユーザー対応

ほとんどのツールは、省略可能な`user_id`パラメーターで対象のユーザープロフィールを指定できます。例外はシステムレベルのツールの`get_system_info`、`list_backups`、`create_backup`、`delete_backup`で、これらは`user_id`を受け付けません。
```bash
claude "Poznoteでユーザー2のノートを一覧表示して"
```

## 関連ドキュメント

- [MCPサーバーのドキュメント](MCP-SERVER.ja.md)
- [VS Code Copilotの設定](VSCODE-COPILOT.ja.md)
- [セキュリティに関する考慮事項](MCP-SERVER.ja.md#セキュリティ)

## サポート

問題が起きたときや質問があるときは、次のことを試してください。
- [MCPのドキュメント](MCP-SERVER.ja.md)を確認する
- MCPサーバーのログを確認する：`docker compose logs mcp-server`
- Poznote APIにアクセスできることを確認する
