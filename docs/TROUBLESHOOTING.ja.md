<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <a href="TROUBLESHOOTING.pt.md">Português</a> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a> ·
  <a href="TROUBLESHOOTING.ko.md">한국어</a> ·
  <b>日本語</b>
</p>
<!-- /lang-selector -->

# インストールのトラブルシューティング

<details>
<summary><strong>「mkdir()の警告（permission denied）」または「Connection failed」</strong></summary>
<br>

次のようなエラーが出ることがあります。
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- `database`フォルダーが、`www-data:www-data`ではなく`root:root`の所有で作られる

これは、特定の環境（Komodo、Portainerなど）でのDockerボリュームのマウントに関する既知の問題です。構成によっては、コンテナーがマウントしたボリュームの権限を変更できません。

**解決方法**：コンテナーを起動する前に、ホストマシンで正しい権限を設定します。

```bash
# Poznoteのディレクトリに移動する
cd poznote

# 正しい権限でdataディレクトリの構成を作る
mkdir -p data/database

# 所有者をUID 82（Alpine Linuxのwww-data）にする
sudo chown -R 82:82 data

# コンテナーを起動する
docker compose up -d
```

</details>

<details>
<summary><strong>「Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database」</strong></summary>
<br>

まず、コンテナーを停止してから起動し直し、データベースが初期化されるのを待ってください（ページを再読み込みしてください）。

それでも直らない場合は、コンテナーを停止して、`data`フォルダーの所有者を直します（UID/GIDは環境に合わせてください。例では1000:1000を使っています）。

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **メモ**：UID 82は、PoznoteのDockerイメージが使っているAlpine Linuxの`www-data`ユーザーに対応します。

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>rootlessで実行する（docker-compose.rootless.yml）</strong></summary>
<br>

Poznoteには、rootではなく、すべての処理を特権のないユーザー（uid/gid `1000`、ユーザー名`poznote`）で実行するrootlessイメージもあります。コンテナー内でrootを使うことを禁じている環境（Kubernetesの`PodSecurityStandard`のrestricted、rootlessのPodman、`docker run --user`など）向けです。

既定のイメージと違い、このイメージには、ホストのバインドマウントの所有者が合わないときに起動時に直してくれるrootのプロセスがありません。そのため、`./data`は**最初の起動の前にuid/gid 1000の所有にしておく必要があります**。

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

この手順を飛ばすと、コンテナーは起動直後に終了し、何を実行すればよいかを具体的に示すエラーを出します。

なお、この手順では`sudo`が要らないこともよくあります。

- ホストのユーザーのuidがすでに`1000`の場合（ほとんどのLinuxディストリビューションで最初に作られるユーザー）は、`mkdir -p data`で正しい所有者のディレクトリが作られるので、`chown`はまったく不要です。
- rootlessのPodmanやrootlessのDockerでは、代わりにユーザー名前空間の中でchownを実行します。root権限は一切要りません。

```bash
# rootless Podman
podman unshare chown -R 1000:1000 data
# rootless Docker
rootlesskit chown -R 1000:1000 data
```

新しくインストールする場合は、READMEの[rootlessでのインストール方法](README.ja.md#rootless)に従ってください。既存のPoznoteインスタンスを移行するには、インスタンスを停止し、データディレクトリをバックアップして所有者を変えてから、rootlessイメージを起動します。

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

rootlessイメージのWebサーバーは、コンテナーの内部で`80`ではなくポート`8080`で待ち受けます（非特権ポートしか使えないため）。ホスト側のポートは、これまでどおり`.env`の`HTTP_WEB_PORT`で決まります。

rootlessイメージを取得せずにソースからビルドするには、`docker-compose.rootless.yml`の`image:`の行を`build: { context: ., target: rootless }`に置き換えます（その場合は、このリポジトリのクローンが必要です）。

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong><code>network_mode: host</code>で実行する</strong></summary>
<br>

既定では、Dockerはホストのポートをコンテナーに割り当てます。Webサーバーはコンテナーの中でポート`80`（rootlessイメージでは`8080`）で待ち受け、ホスト側のポートは`HTTP_WEB_PORT`で決まります。`network_mode: host`ではこの割り当てがなく、コンテナーはホストのポートを直接使います。ところが、ホストのポート`80`は、たいていすでに別のWebサーバーやコンテナーが使っています。

Webサーバーが待ち受けるポートを、`.env`の`POZNOTE_LISTEN_PORT`で設定します（rootlessイメージでは1023より大きいポートにします）。

```bash
POZNOTE_LISTEN_PORT=8040
```

次に、`docker-compose.yml`（または`docker-compose.rootless.yml`）で、両方のサービスの`ports:`セクションを`network_mode: host`に置き換えます。MCPサーバーには、さらに2か所の変更が必要です。サービス名ではWebサーバーに接続できなくなるうえ、MCPサーバーのイメージはすべてのインターフェイスで待ち受けるため、hostモードではホストのすべてのインターフェイスで待ち受けることになるからです。接続先を新しいポートに向け、localhostだけで待ち受けるようにします。

```yaml
  mcp-server:
    image: ghcr.io/timothepoznanski/poznote-mcp:6
    restart: always
    network_mode: host
    command: ["sh", "-c", "poznote-mcp serve --host=127.0.0.1 --port=$${MCP_PORT}"]
    environment:
      POZNOTE_API_URL: http://127.0.0.1:${POZNOTE_LISTEN_PORT}/api/v1
      MCP_PORT: ${POZNOTE_MCP_PORT:-8045}
      POZNOTE_DEBUG: ${POZNOTE_DEBUG:-false}
      POZNOTE_USER_ID: ${POZNOTE_USER_ID:-1}
      POZNOTE_MCP_AUTH_TOKEN: ${POZNOTE_MCP_AUTH_TOKEN:-}
    volumes:
      - "./data:/var/www/html/data:ro"
    depends_on:
      - webserver
```

コンテナーを作り直します（再起動では環境変数が読み込み直されません）。

```bash
docker compose up -d --force-recreate
```

この値は、起動のたびにコンテナーの初期化スクリプトが適用します。無効な値はログに記録され、イメージの既定値が使われます。`HTTP_WEB_PORT`は使われなくなり、`POZNOTE_MCP_PORT`は、MCPサーバーが待ち受けるポートそのものを指定するようになります。現在の`docker-compose.yml`のヘルスチェックは`POZNOTE_LISTEN_PORT`に従います。手元のファイルがまだ`http://127.0.0.1/api/health`を呼んでいる場合は、ファイルをダウンロードし直すかURLを変更してください。そうしないと、コンテナーが`unhealthy`のままになるか、ポート`80`で応答する別の何かを確認してしまいます。

hostモードでは、Webサーバーはホストのすべてのインターフェイスで待ち受けます。ファイアウォールでそのポートへのアクセスを制限するか、リバースプロキシ経由でしか接続できないようにしてください。コンテナーの中ではnginxとPHPがUnixソケットで通信するため、Poznoteがホストのほかのポートを使うことはなく、複数のインスタンスを別々のポートで並べて動かせます。

</details>

<details>
<summary><strong>「このサイトにアクセスできません」（This site can't be reached）</strong></summary>
 <br>

ブラウザーに「このサイトにアクセスできません」（This site can't be reached）と表示される場合は、SELinuxが有効になっている可能性があります。その場合は、コンテナーのログを確認してください。

```bash
docker logs poznote-webserver-1
# podmanの場合
podman logs poznote-webserver-1
```

おそらく、次の行が見つかります。
- `chown: /var/www/html/data: Permission denied`

これは、DockerボリュームのSELinuxコンテキストが正しくない場合に起こります。特に、`/root`ディレクトリからインストールした場合によく起こります。

**解決方法**：どのディストリビューションでも正しく動作するように、Dockerボリュームには`:Z`サフィックスを付け、`/root`ディレクトリは避けることを強くおすすめします。

`docker-compose.yml`を編集して、ボリュームの定義に`:Z`を追加します。

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

または、`/opt/poznote`や`~/poznote`など、`/root`の外のディレクトリにPoznoteをインストールします。

</details>

<details>
<summary><strong>「ユーザー名またはパスワードが正しくありません」</strong></summary>
<br>

1. ユーザー名に「admin」または「admin_change_me」を指定し、自分のパスワードでログインしてみてください。
2. パスワードは`.env`ではなく、Poznoteの画面で管理します。画面でパスワードを変更するまでは、組み込みの既定値が使われます。管理者は`admin`、一般ユーザーは`user`です。
3. 管理者ではログインできるのに一般ユーザーではログインできない場合は、「ユーザー管理」パネルで、そのプロフィールが「有効」になっているかを確認してください。

</details>

<details>
<summary><strong>管理者のパスワードを忘れた</strong></summary>
<br>

ほかの管理者がまだログインできるなら、その管理者が「設定 > 管理ツール > ユーザー管理」から新しいパスワードを設定できます。そうでない場合は、マスターデータベースで直接リセットします。ホストのPoznoteディレクトリで、次を実行します（ホストに`sqlite3`コマンドラインツールがインストールされている必要があります。Poznoteのイメージには含まれていません）。

```bash
sudo sqlite3 data/master.db "UPDATE users SET password_hash=NULL, password_login_disabled=0 WHERE id=1;"
```

これで最初のアカウント（id 1。常に管理者）に保存されているパスワードが消え、組み込みの既定値が再び使われます。そのアカウントのユーザー名とパスワード`admin`でログインし、すぐに「設定 > パスワードを変更」でパスワードを変更してください。別のアカウントをリセットするには、`WHERE id=1`を`WHERE username='its_username'`に置き換えます。一般ユーザーの場合、パスワードは`user`に戻ります。

そのアカウントで2要素認証が有効な場合は、ログインフォームでパスワードのあとにコードも求められます。デバイスも失くした場合は、次の項目を参照してください。

</details>

<a id="two-factor-lockout"></a>
<details>
<summary><strong>2要素認証のせいでログインできない（デバイスとリカバリーコードを失くした）</strong></summary>
<br>

2要素認証を有効にしたときに渡されたリカバリーコードは、それぞれ1回ずつログインに使えます。コードの入力画面で「リカバリーコードを使う」を選んでください。リカバリーコードが1つも残っていない場合は、管理者が「設定 > 管理ツール > ユーザー管理」で、そのアカウントの「パスワード」ダイアログから2要素認証を無効にできます。

管理者が自分しかいない場合は、マスターデータベースで2要素目を直接削除します。ホストのPoznoteディレクトリで、次を実行します（ホストに`sqlite3`コマンドラインツールがインストールされている必要があります）。

```bash
sudo sqlite3 data/master.db "DELETE FROM user_totp_recovery_codes WHERE user_id=1; DELETE FROM user_totp WHERE user_id=1;"
```

`1`は対象のアカウントのidに置き換えます（idの一覧は`sudo sqlite3 data/master.db "SELECT id, username FROM users;"`で確認できます）。これでパスワードだけでログインできるようになり、そのアカウントに「30日間ログインしたままにする」で発行されたCookieは使えなくなります。2要素認証は「設定 > 2要素認証」から設定し直せます。

インスタンスで2要素認証が必須になっている場合（**設定 > 管理ツール > 2要素認証を必須にする**）、次回のログイン時にすぐ設定し直すよう求められます。必須設定そのものを解除するには、次のコマンドを実行します。

```bash
sudo sqlite3 data/master.db "UPDATE global_settings SET value='0' WHERE key='two_factor_required';"
```

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>負荷が高いとアプリが応答しなくなる（自動保存のエラー、「server reached pm.max_children」）</strong></summary>
<br>

PHPのリクエストは、固定数のphp-fpmワーカー（既定では10個）のプールで処理されます。短いリクエスト（自動保存、ポーリング、ページの読み込み）でプールが埋まることはありません。埋まるのは時間のかかるリクエストで、ストリーミング中のAIチャットの回答、S3の呼び出し、Git同期、大きなファイルのアップロードなどです。すべてのワーカーがふさがると、ほかのリクエストはすべて待たされ、保存時にブラウザーにネットワークエラーが表示されます。コンテナーのログには次のように出力されます。

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

負荷の高いインスタンス（複数のユーザー、AIチャット、S3やGit同期を使っている場合）では、`.env`の`POZNOTE_PHP_FPM_MAX_CHILDREN`変数でプールを大きくし、コンテナーを作り直してください（再起動では環境変数が読み込み直されません）。

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

処理中のワーカーは、1つあたり約25〜30MBのメモリを使います。待機中のワーカーは値にかかわらず少ないので、メモリが1GBのホストなら20でも安全で、512MBのホストなら10が適当です。この値は、起動のたびにコンテナーの初期化スクリプトが適用します。無効な値はログに記録され、イメージの既定値が使われます。

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>リクエストが「Allowed memory size exhausted」で失敗する</strong></summary>
<br>

既定では、PHPのリクエストはそれぞれ最大512MBまでメモリを使えます。これは上限であって、あらかじめ確保される量ではありません（待機中のワーカーは約25MBです）。この上限の役割は、暴走したリクエストがホストを道連れにするのではなく、PHPのログに読める行を残して失敗するようにすることです。

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

バックアップ、復元、エクスポート、ダウンロードはディスクに少しずつ書き出すため、アカウント内のデータ量にかかわらず数MBしか必要としません。そのため、この上限に達するのは、1つで数十MBあるノートを扱うときだけのはずです。バックアップやダウンロードで上限に達した場合はバグなので、ログの行を添えて報告してください。

上限を上げるには、`.env`で`POZNOTE_PHP_MEMORY_LIMIT`（MB単位の整数）を設定し、コンテナーを作り直します（再起動では環境変数が読み込み直されません）。

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

ホストのメモリより大きな値には、絶対にしないでください。マシンにあるメモリを超えたリクエストは、何のメッセージもなくカーネルに強制終了され、コンテナー全体が巻き添えになることもあります。メモリが512MBのホストでは、既定値のままにしてください。この値は、起動のたびにコンテナーの初期化スクリプトが適用します。無効な値はログに記録され、イメージの既定値が使われます。

</details>

<a id="this-address-is-not-allowed"></a>
<details>
<summary><strong>「This address is not allowed: it must be a public internet host」</strong></summary>
<br>

管理者ではないユーザーが、Webhook、Git同期、または自分用のAIサーバー、文字起こしサーバー、MCPサーバーに、ローカルネットワーク上のマシンやサーバー自身のアドレスを入力しました。これらのアドレスに接続できるのは管理者だけです。管理者は「設定 > 管理ツール > 連携 > ローカルネットワークへのアクセス」で、そのホストを許可できます。[管理者以外のユーザーによるローカルネットワークへのアクセス](README.ja.md#local-network-access)を参照してください。

ホストがすでに一覧にあるのにメッセージが消えない場合は、Poznoteのコンテナーがそのホスト名を名前解決できていません。内部ネットワークについて何も漏らさないように、どちらの場合もわざと同じメッセージにしています。コンテナーの中から名前を確認してください。

```bash
docker compose exec webserver getent hosts ollama.lan
```

コマンドが何も出力しない場合は、ホスト名の代わりに、ホストのIPアドレスかネットワークを一覧に入力してください。

</details>
