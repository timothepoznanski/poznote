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
  <b>日本語</b>
</p>
<!-- /lang-selector -->

# Claude CLIでPoznote MCPサーバーを使う

このガイドでは、Claude CLI（コマンドラインインターフェイス）でPoznote MCPサーバーを設定して使う方法を説明します。

## 前提条件

- **Anthropic APIキー**：Claude CLIを使うには、有料の[Anthropic APIキー](https://console.anthropic.com/)が必要です。CLIを使う前に設定してください。
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLIがインストールされていること（`npm install -g @anthropic-ai/claude-cli`などで）
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
# 重要：ワークスペースを指定しないと、ノートは接続しているユーザーの
# 既定のワークスペースに作成されます。作成先のワークスペースは必ず指定してください。
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

Poznote MCPサーバーには、次のツールがあります。

### ノートの管理
- `get_note` - IDを指定してノートを取得
- `list_notes` - すべてのノートを一覧表示
- `search_notes` - テキストでノートを検索（作成日の範囲も指定可能）
- `create_note` - 新しいノートを作成（期限やリマインダーも設定可能）
- `update_note` - 既存のノートを更新、または期限やリマインダーを設定
- `delete_note` - ノートを削除
- `duplicate_note` - ノートを複製
- `convert_note` - ノートをHTMLとMarkdownのあいだで変換
- `get_backlinks` - あるノートにリンクしているノートを取得

### リマインダー
- `get_reminder` - ノートに設定されたリマインダーを取得
- `set_reminder` - ノートのリマインダーを設定または置き換え（繰り返しの間隔も指定可能）
- `remove_reminder` - ノートのリマインダーを解除

### タスク
- `list_tasks` - タスクリストのノートにあるタスクを、IDと期限とともに一覧表示
- `add_task` - タスクを1件追加（期限とリマインダーも指定可能）
- `update_task` - タスクを1件更新（テキスト、期限、リマインダー、重要フラグ）
- `complete_task` - タスクを完了にする、または未完了に戻す
- `delete_task` - タスクリストのノートからタスクを1件削除
- `add_subtask` - タスクリストのノートにあるタスクに、サブタスクを追加
- `update_subtask` - サブタスクの名前を変更、または完了・未完了を切り替え
- `delete_subtask` - タスクのサブタスクを1件削除

### 整理
- `create_folder` - 新しいフォルダーを作成
- `list_folders` - すべてのフォルダーを一覧表示
- `rename_folder` - フォルダーの名前を変更
- `delete_folder` - フォルダーを削除し、中のノートをゴミ箱に移動
- `list_workspaces` - すべてのワークスペースを一覧表示
- `create_workspace` - 新しいワークスペースを作成
- `rename_workspace` - ワークスペースの名前を変更
- `delete_workspace` - ワークスペースを削除（最後の1つは削除できない）
- `list_tags` - すべてのタグを一覧表示
- `move_note_to_folder` - ノートをフォルダーに移動
- `remove_note_from_folder` - ノートをフォルダーから外す
- `toggle_favorite` - お気に入りの状態を切り替え

### ゴミ箱の管理
- `get_trash` - ゴミ箱にあるノートを一覧表示
- `restore_note` - ゴミ箱から復元
- `empty_trash` - ゴミ箱を空にする

### 共有
- `share_note` - 公開リンクで共有
- `unshare_note` - 公開リンクでの共有を解除
- `get_note_share_status` - 共有の状態を取得
- `list_shared` - 公開リンクで共有しているノートとフォルダーをすべて一覧表示
- `list_shared_with_me` - ほかのユーザーからこのプロフィールに共有されているノートとフォルダーを一覧表示

### 添付ファイル
- `list_attachments` - ノートの添付ファイルを一覧表示

### Git同期
- `get_git_sync_status` - Git同期の状態を取得
- `git_push` - Gitリポジトリにプッシュ
- `git_pull` - Gitリポジトリからプル

### システム
- `get_system_info` - Poznoteのバージョン情報を取得
- `list_backups` - システムのバックアップを一覧表示
- `create_backup` - バックアップを作成
- `restore_backup` - バックアップから復元（現在のユーザーのデータは置き換えられる）
- `delete_backup` - バックアップファイルを削除
- `get_app_setting` - アプリケーションの設定を取得
- `update_app_setting` - アプリケーションの設定を変更

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
