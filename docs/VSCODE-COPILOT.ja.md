<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <a href="VSCODE-COPILOT.de.md">Deutsch</a> ·
  <a href="VSCODE-COPILOT.es.md">Español</a> ·
  <a href="VSCODE-COPILOT.pt.md">Português</a> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <a href="VSCODE-COPILOT.zh-cn.md">简体中文</a> ·
  <a href="VSCODE-COPILOT.ko.md">한국어</a> ·
  <b>日本語</b>
</p>
<!-- /lang-selector -->

# VS Code CopilotでPoznote MCPサーバーを使う

このガイドでは、VS Code CopilotでPoznote MCPサーバーを設定して使う方法を説明します。

## 前提条件

- Visual Studio Codeがインストールされていること
- **GitHub Copilotのサブスクリプション**：有料（または試用版）の[GitHub Copilot](https://github.com/features/copilot)プランが必要です。VS CodeでCopilot Chat拡張機能を有効にしておいてください
- Poznote MCPサーバーが（Docker Composeで）起動していること
- MCPサーバーに127.0.0.1でアクセスできること（既定のポート：8045）

## 設定

### 1. MCPサーバーが起動していることを確認

MCPサーバーのコンテナーが起動していることを確認します。

```bash
docker ps | grep mcp
```

MCPサーバーが起動していれば、出力に表示されます。出力にあるポート番号（既定は8045）を控えておいてください。

### 2. VS Codeを設定

Poznote MCPサーバーを`mcp.json`ファイルに追加します。ファイルの場所はOSによって異なります。

- **Windows**：`C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux**：`~/.config/Code/User/mcp.json`
- **macOS**：`~/Library/Application Support/Code/User/mcp.json`

ファイルがない場合は、次の内容で作成してください。

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

> **メモ**：`docker-compose.yml`でポートを変更している場合は、`8045`を実際のMCPサーバーのポートに置き換えてください。

#### 認証トークンを使う

MCPサーバーを`POZNOTE_MCP_AUTH_TOKEN`付きで起動している場合（[受信用の認証トークン](MCP-SERVER.ja.md#受信用の認証トークン)を参照）は、同じトークンをヘッダーで指定してください。指定しないと、すべての呼び出しが`401 Unauthorized`で拒否されます。

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

トークンを`mcp.json`に書きたくない場合は、VS Codeに入力を求めさせることもできます。`"password": true`を指定した`inputs`のエントリを宣言し、`"Authorization": "Bearer ${input:poznote-token}"`のように参照します。

### 3. VS Codeを再読み込み

`mcp.json`を更新したら、変更を反映するためにVS Codeを再読み込みします。
- `Ctrl+Shift+P`（Macでは`Cmd+Shift+P`）を押す
- 「Reload Window」（日本語表示では「ウィンドウの再読み込み」）と入力してEnterを押す

## リモートサーバーの設定

Poznoteのインスタンスがリモートサーバーで動いている場合は、SSHのポートフォワーディングを使って安全に接続します。

### 1. SSHトンネルを作成

コマンドラインを使う場合は、通常のSSHトンネルを作成します。

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

PoznoteでVS Code Copilotを使っているあいだは、この接続を開いたままにしておいてください。

VS Code Remote SSH、Dev Containers、Codespacesでリモートのマシンにすでに接続している場合は、VS Codeの`PORTS`ビュー（日本語表示では「ポート」）から直接トンネルを作成することもできます。

1. VS Codeで`PORTS`パネルを開きます。
2. リモートのポート`8045`を転送します。
3. Copilotを使っているあいだは、転送したポートを有効なままにしておきます。
4. VS Codeが`8045`以外のローカルポートを割り当てた場合は、そのローカルポートを`mcp.json`で使います。

### 2. VS Codeを設定

ローカルにインストールした場合と同じ`mcp.json`の設定を使います。

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

SSHトンネルまたはVS Codeで転送したポートによって、リモートのMCPサーバーが手元のマシンに公開されるので、VS Codeは`127.0.0.1`に接続します。

## 使用例

設定が済んだら、VS CodeのCopilot Chatから自然な言葉で指示して、Poznoteのインスタンスを直接操作できます。

### 基本的な操作

```
# すべてのノートを一覧表示
@poznote ノートをすべて一覧表示して

# ノートを検索
@poznote 「docker」に関するノートを検索して

# 特定のノートを表示
@poznote ノート123を表示して

# ワークスペースを一覧表示
@poznote どんなワークスペースがある？

# フォルダーを一覧表示
@poznote ワークスペースにあるフォルダーをすべて表示して
```

### ノートの作成と更新

> **ワークスペース**：依頼の中でワークスペースを指定しないと、ノートは接続しているユーザーの既定のワークスペースに作成されます。混乱を避けるため、作成先のワークスペースを明示してください。例：*「ワークスペース『プロジェクト』に」*。

```
@poznote ワークスペース「プロジェクト」に、新機能についての内容で「議事録」というタイトルのノートを作成して

@poznote ノート456を、デプロイ手順についての新しい内容で更新して

@poznote ノート456を削除して（ゴミ箱に移動されます）

@poznote ワークスペース「個人」に「パスポートの更新」というノートを作成して、9月1日の午前9時にリマインドして

@poznote 「プロジェクト」というフォルダーを作成して
```

### リマインダー

```
@poznote ノート123について、来週の月曜日の午前8時にリマインドして

@poznote ノート123に、毎週月曜日の午前9時の繰り返しリマインダーを設定して

@poznote ノート123にリマインダーは設定されている？

@poznote ノート123のリマインダーを解除して
```

### タスクリスト

```
@poznote ノート123のタスクを表示して

@poznote ノート123に、期限が明日の午後6時30分でリマインダー付きのタスク「牛乳を買う」を追加して

@poznote ノート123に、毎週金曜日が期限のタスク「週報」を追加して

@poznote ノート123のタスク「牛乳を買う」を完了にして

@poznote ノート123のタスク「牛乳を買う」の期限を来週の月曜日に変更して

@poznote ノート123からタスク「牛乳を買う」を削除して
```

### 高度な操作

```
@poznote ノート789を複製して

@poznote ノート123をお気に入りに追加して

@poznote ノート456をフォルダー「プロジェクト」に移動して

@poznote ノート123をMarkdownに変換して

@poznote ノート123にリンクしているノートはどれ？

@poznote ノート123を公開リンクで共有して

@poznote 公開リンクで共有しているノートとフォルダーをすべて一覧表示して

@poznote 動いているPoznoteのバージョンは？
```

### フォルダーとワークスペース

```
@poznote フォルダー12の名前を「アーカイブ」に変更して

@poznote フォルダー12を削除して、中のノートをゴミ箱に移動して

@poznote 「仕事」というワークスペースを作成して

@poznote ワークスペース「仕事」の名前を「業務」に変更して

@poznote ワークスペース「業務」を削除して
```

### ゴミ箱と復元

```
@poznote ゴミ箱にあるノートをすべて表示して

@poznote ゴミ箱からノート123を復元して

@poznote ゴミ箱を空にして
```

### Git同期

```
@poznote Git同期の状態は？

@poznote ノートをGitにプッシュして

@poznote Gitからノートをプルして
```

### バックアップと設定

```
@poznote バックアップをすべて一覧表示して

@poznote データのバックアップを作成して

@poznote バックアップ「poznote_backup_2026-02-02_15-30-00.zip」から復元して

@poznote バックアップ「poznote_backup_2026-02-02_15-30-00.zip」を削除して

@poznote 設定「timezone」の値は？

@poznote 設定「timezone」を「Asia/Tokyo」にして
```

### ノートの内容を活用する

```
@poznote タグ「重要」が付いたノートをすべて要約してくれる？

@poznote トピックごとにノートをフォルダーに整理するのを手伝って

@poznote 議事録をもとに週報を作成して
```

## トラブルシューティング

### 接続の問題

VS Code CopilotがMCPサーバーに接続できない場合は、次の点を確認してください。

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

4. **mcp.jsonの構文を確認する**：
   JSONが正しく書けていること（末尾にカンマがない、引用符が正しいなど）を確かめてください。

### MCPサーバーが認識されない

VS CodeがPoznote MCPサーバーを認識しない場合は、次の点を確認してください。

1. `mcp.json`を編集したあとに、VS Codeを再読み込みしたこと
2. GitHub Copilotが有効になっていて、動作していること
3. VS Codeの出力パネルにエラーメッセージが出ていないこと：
   - 「View → Output」（日本語表示では「表示 → 出力」）を開く
   - ドロップダウンから「GitHub Copilot」を選ぶ

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

## 利用できるMCPツール

Poznote MCPサーバーには、VS Code Copilotが使える次のツールがあります。

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

ほとんどのツールは、省略可能な`user_id`パラメーターで対象のユーザープロフィールを指定できます。例外はシステムレベルのツールの`get_system_info`、`list_backups`、`create_backup`、`delete_backup`で、これらは`user_id`を受け付けません。対象のユーザーは、プロンプトの中で指定できます。

```
@poznote ユーザー2のノートを一覧表示して
```

## 高度な設定

### 複数のPoznoteインスタンス

複数のPoznoteインスタンスを動かしている場合は、それぞれ別の名前で設定できます。

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

あとは、名前を明示して参照します。
```
@poznote-work 仕事のノートを一覧表示して
```

### カスタムポートの設定

MCPサーバーを別のポートで動かしている場合は、`mcp.json`のURLを変更します。

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

## セキュリティに関する注意

⚠️ **重要**：MCPのエンドポイントにアクセスできる人は誰でも、すべてのノートを操作できます。既定では127.0.0.1からしかアクセスできません。それ以外からもアクセスできるようにする場合は、`POZNOTE_MCP_AUTH_TOKEN`を設定して、クライアントにBearerトークンの提示を求めてください（[認証トークンを使う](#認証トークンを使う)を参照）。

**既定の設定（安全）**：
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**リモートからアクセスする場合は、必ずSSHトンネルを使ってください。** 手順は「[リモートサーバーの設定](#リモートサーバーの設定)」のセクションで説明しています。

詳しくは[MCPサーバーのセキュリティ](MCP-SERVER.ja.md#セキュリティ)を参照してください。

## 参考資料

- [MCPサーバーのドキュメント](MCP-SERVER.ja.md)
- [VS CodeのMCPに関する公式ドキュメント](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Claude CLIの設定](CLAUDE-CLI.ja.md)
- [セキュリティに関する考慮事項](MCP-SERVER.ja.md#セキュリティ)

## サポート

問題が起きたときや質問があるときは、次のことを試してください。
- [MCPのドキュメント](MCP-SERVER.ja.md)を確認する
- MCPサーバーのログを確認する：`docker compose logs mcp-server`
- Poznote APIにアクセスできることを確認する
- VS Codeの出力パネルにエラーが出ていないか確認する
