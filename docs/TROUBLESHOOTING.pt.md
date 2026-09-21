<!-- lang-selector -->
<p align="center">
  <a href="TROUBLESHOOTING.md">English</a> ·
  <a href="TROUBLESHOOTING.fr.md">Français</a> ·
  <a href="TROUBLESHOOTING.de.md">Deutsch</a> ·
  <a href="TROUBLESHOOTING.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="TROUBLESHOOTING.ru.md">Русский</a> ·
  <a href="TROUBLESHOOTING.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Solução de problemas de instalação

<details>
<summary><strong>"Avisos de mkdir() (permission denied) ou Connection failed"</strong></summary>
<br>

Se você encontrar erros como:
- `Warning: mkdir(): Permission denied in /var/www/html/db_connect.php`
- `Connection failed: SQLSTATE[HY000] [14] unable to open database file`
- A pasta `database` é criada com `root:root` em vez de `www-data:www-data`

Este é um problema conhecido com a montagem de volumes do Docker em certos ambientes (Komodo, Portainer, etc.). Em algumas configurações, o contêiner não consegue alterar as permissões dos volumes montados.

**Solução:** antes de iniciar o contêiner, defina as permissões corretas na máquina host:

```bash
# Vá para o diretório do Poznote
cd poznote

# Crie a estrutura do diretório de dados com as permissões corretas
mkdir -p data/database

# Defina o proprietário como UID 82 (www-data no Alpine Linux)
sudo chown -R 82:82 data

# Inicie o contêiner
docker compose up -d
```

</details>

<details>
<summary><strong>"Connection failed: SQLSTATE[HY000]: General error: 8 attempt to write a readonly database"</strong></summary>
<br>

Primeiro, tente parar e reiniciar o contêiner e aguarde a inicialização do banco de dados (atualize a página).

Se isso não funcionar, pare o contêiner e corrija o proprietário da pasta `data` (adapte o UID/GID à sua configuração, o exemplo usa 1000:1000):

```bash
docker compose down
sudo chown 1000:1000 -R data
```

> 💡 **Observação:** o UID 82 corresponde ao usuário `www-data` no Alpine Linux, que é usado pela imagem Docker do Poznote.

</details>

<a id="running-rootless"></a>
<details>
<summary><strong>Execução rootless (docker-compose.rootless.yml)</strong></summary>
<br>

O Poznote também oferece uma variante rootless da imagem, que roda inteiramente como um usuário sem privilégios (uid/gid `1000`, nome de usuário `poznote`) em vez de root, para ambientes que proíbem root dentro dos contêineres (`PodSecurityStandard` restrito do Kubernetes, Podman rootless, `docker run --user`, etc.).

Ao contrário da imagem padrão, essa variante não tem nenhum processo root disponível na inicialização para corrigir o proprietário de um bind mount do host com dono incorreto, então `./data` **precisa pertencer ao uid/gid 1000 antes da primeira inicialização**:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Se essa etapa for pulada, o contêiner encerra imediatamente na inicialização com um erro que explica exatamente o que executar.

Observe que muitas vezes o `sudo` não é necessário nessa etapa:

- Se o seu usuário no host já tem o uid `1000` (o primeiro usuário criado na maioria das distribuições Linux), `mkdir -p data` cria o diretório com o proprietário certo e o `chown` pode ser totalmente dispensado.
- Com Podman rootless ou Docker rootless, execute o chown dentro do namespace de usuário, sem nenhum privilégio de root:

```bash
# rootless Podman
podman unshare chown -R 1000:1000 data
# rootless Docker
rootlesskit chown -R 1000:1000 data
```

Para uma instalação nova, siga o [método de instalação rootless](README.pt.md#rootless) no README. Para migrar uma instância existente do Poznote, pare-a, faça backup do diretório de dados e altere o proprietário dele, depois inicie a variante rootless:

```bash
docker compose down
sudo chown -R 1000:1000 data
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
docker compose -f docker-compose.rootless.yml pull
docker compose -f docker-compose.rootless.yml up -d
```

O servidor web rootless escuta internamente na porta `8080` em vez de `80` (apenas portas sem privilégios); `HTTP_WEB_PORT` do seu `.env` continua controlando a porta do lado do host, sem mudanças.

Para construir a imagem rootless a partir do código-fonte em vez de baixá-la, substitua a linha `image:` do `docker-compose.rootless.yml` por `build: { context: ., target: rootless }` (é necessário então um clone deste repositório).

</details>

<a id="running-with-host-network"></a>
<details>
<summary><strong>Executar com <code>network_mode: host</code></strong></summary>
<br>

Por padrão, o Docker mapeia uma porta do host para o contêiner: o servidor web escuta na porta `80` dentro do contêiner (`8080` na imagem rootless), e `HTTP_WEB_PORT` escolhe a porta no host. Com `network_mode: host` não há mapeamento. O contêiner ocupa diretamente as portas do host, onde a porta `80` geralmente já pertence a outro servidor web ou contêiner.

Defina a porta em que o servidor web escuta com `POZNOTE_LISTEN_PORT` no `.env` (com a imagem rootless, uma porta acima de 1023):

```bash
POZNOTE_LISTEN_PORT=8040
```

Em seguida, no `docker-compose.yml` (ou `docker-compose.rootless.yml`), substitua a seção `ports:` dos dois serviços por `network_mode: host`. O servidor MCP precisa de mais duas mudanças: ele não consegue mais alcançar o servidor web pelo nome do serviço, e a imagem dele escuta em todas as interfaces, o que no modo host significa todas as interfaces do host. Aponte-o para a nova porta e restrinja-o ao localhost:

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

Recrie os contêineres (um reinício não recarrega as variáveis de ambiente):

```bash
docker compose up -d --force-recreate
```

O valor é aplicado pelo script de inicialização do contêiner a cada início; um valor inválido é informado no log e o padrão da imagem é mantido. `HTTP_WEB_PORT` deixa de ser usado, e `POZNOTE_MCP_PORT` passa a definir a porta em que o servidor MCP escuta. O healthcheck do `docker-compose.yml` atual segue `POZNOTE_LISTEN_PORT`: se o seu ainda chama `http://127.0.0.1/api/health`, baixe o arquivo de novo ou altere a URL; caso contrário, o contêiner fica `unhealthy` ou verifica o que mais responder na porta `80`.

No modo host, o servidor web escuta em todas as interfaces do host: filtre a porta com o seu firewall, ou deixe-a acessível apenas pelo seu proxy reverso. Dentro do contêiner, o nginx e o PHP se comunicam por um socket unix, então o Poznote não ocupa nenhuma outra porta no host e várias instâncias podem rodar lado a lado em portas diferentes.

</details>

<details>
<summary><strong>"This site can't be reached"</strong></summary>
 <br>

Se você vir "This site can't be reached" no navegador, talvez o SELinux esteja ativado. Nesse caso, verifique os logs do contêiner:

```bash
docker logs poznote-webserver-1
# ou com podman
podman logs poznote-webserver-1
```

Provavelmente você encontrará:
- `chown: /var/www/html/data: Permission denied`

Isso acontece quando os volumes do Docker não têm o contexto SELinux correto, especialmente ao instalar a partir do diretório `/root`.

**Solução:** recomendamos fortemente usar o sufixo `:Z` nos volumes do Docker e evitar o diretório `/root`, para garantir o funcionamento correto em todas as distribuições.

Edite o seu `docker-compose.yml` para adicionar `:Z` às definições de volume:

```yaml
volumes:
  - ./data:/var/www/html/data:Z
```

Como alternativa, instale o Poznote em um diretório fora de `/root`, como `/opt/poznote` ou `~/poznote`.

</details>

<details>
<summary><strong>"Nome de usuário ou senha incorretos"</strong></summary>
<br>

1. Tente entrar com "admin" ou "admin_change_me" e a sua senha.
2. As senhas são gerenciadas pela interface do Poznote, não pelo `.env`. Enquanto uma senha não for alterada na interface, valem os padrões embutidos: `admin` para administradores, `user` para usuários comuns.
3. Se você consegue entrar como administrador mas não como usuário comum, verifique se o perfil está marcado como **Ativo** no painel Gestão de utilizadores.

</details>

<details>
<summary><strong>Senha de administrador perdida</strong></summary>
<br>

Se outro administrador ainda conseguir entrar, ele pode definir uma nova senha para você em **Settings > Admin Tools > User Management**. Caso contrário, redefina a senha direto no banco de dados mestre. A partir do seu diretório do Poznote, no host (a ferramenta de linha de comando `sqlite3` precisa estar instalada nele, ela não faz parte da imagem do Poznote):

```bash
sudo sqlite3 data/master.db "UPDATE users SET password_hash=NULL, password_login_disabled=0 WHERE id=1;"
```

Isso apaga a senha salva da primeira conta (id 1, sempre administrador), e o padrão embutido volta a valer: entre com o nome de usuário dessa conta e a senha `admin`, e troque-a em seguida em **Settings > Change Password**. Para redefinir outra conta, troque `WHERE id=1` por `WHERE username='nome_do_usuario'`; um usuário comum volta para a senha `user`.

Se a autenticação de dois fatores estiver ativada nessa conta, o formulário de login continua pedindo um código depois da senha. Veja a próxima entrada se o aparelho também foi perdido.

</details>

<a id="two-factor-lockout"></a>
<details>
<summary><strong>Bloqueado pela autenticação de dois fatores (aparelho e códigos de recuperação perdidos)</strong></summary>
<br>

Cada código de recuperação entregue ao ativar a autenticação de dois fatores permite entrar uma vez: na tela do código, escolha **Use a recovery code**. Sem nenhum deles, um administrador pode desativar a autenticação de dois fatores para você em **Settings > Admin Tools > User Management**, na janela da senha da sua conta.

Se você for o único administrador, remova o segundo fator direto no banco de dados mestre. A partir do seu diretório do Poznote, no host (a ferramenta de linha de comando `sqlite3` precisa estar instalada nele):

```bash
sudo sqlite3 data/master.db "DELETE FROM user_totp_recovery_codes WHERE user_id=1; DELETE FROM user_totp WHERE user_id=1;"
```

Troque `1` pelo id da conta (`sudo sqlite3 data/master.db "SELECT id, username FROM users;"` lista todas). A senha sozinha volta a permitir o login, os cookies "Remember me" emitidos para essa conta deixam de funcionar, e a autenticação de dois fatores pode ser configurada de novo em **Settings > Two-factor authentication**.

</details>

<a id="the-app-stops-answering-under-load"></a>
<details>
<summary><strong>O aplicativo para de responder sob carga (erros de salvamento automático, "server reached pm.max_children")</strong></summary>
<br>

As requisições PHP são atendidas por um pool fixo de workers do php-fpm, 10 por padrão. Requisições curtas (salvamento automático, sondagens, carregamento de páginas) nunca o enchem. As longas enchem: uma resposta do chat de IA sendo transmitida, uma chamada ao S3, uma sincronização git, um upload grande. Quando todos os workers estão ocupados, todas as outras requisições esperam, o navegador mostra um erro de rede ao salvar e o log do contêiner diz:

```
WARNING: [pool www] server reached pm.max_children setting (10), consider raising it
```

Aumente o pool em uma instância movimentada (vários usuários, chat de IA, S3 ou sincronização git em uso) com a variável `POZNOTE_PHP_FPM_MAX_CHILDREN` no `.env` e recrie o contêiner (uma reinicialização não recarrega as variáveis de ambiente):

```bash
POZNOTE_PHP_FPM_MAX_CHILDREN=20
docker compose up -d --force-recreate webserver
```

Cada worker ocupado consome cerca de 25-30 MB de memória, e os workers ociosos são poucos seja qual for o valor, então 20 é seguro em um host com 1 GB e 10 cabe em um host com 512 MB. O valor é aplicado pelo script de inicialização do contêiner a cada início; um valor inválido é informado no log e o padrão da imagem é mantido.

</details>

<a id="a-request-runs-out-of-memory"></a>
<details>
<summary><strong>Uma requisição falha com "Allowed memory size exhausted"</strong></summary>
<br>

Cada requisição PHP pode usar até 512 MB por padrão. Isso é um teto, não uma reserva (um worker ocioso pesa cerca de 25 MB), e a função dele é fazer uma requisição descontrolada falhar com uma linha legível no log do PHP em vez de derrubar o host:

```
PHP Fatal error:  Allowed memory size of 536870912 bytes exhausted (tried to allocate ...) in ...
```

Backups, restaurações, exportações e downloads são transmitidos para o disco e precisam de poucos MB seja qual for o tamanho da conta, então isso só deveria acontecer com uma única nota de dezenas de MB. Um backup ou um download que atinja o limite é um bug: por favor, relate-o com a linha do log.

Para aumentar o limite, defina `POZNOTE_PHP_MEMORY_LIMIT` no `.env` (um número inteiro de MB) e recrie o contêiner (uma reinicialização não recarrega as variáveis de ambiente):

```bash
POZNOTE_PHP_MEMORY_LIMIT=1024
docker compose up -d --force-recreate webserver
```

Nunca defina um valor acima da memória do host: uma requisição que ultrapassa o que a máquina tem é encerrada pelo kernel sem nenhuma mensagem e pode derrubar o contêiner inteiro junto. Em um host com 512 MB, mantenha o padrão. O valor é aplicado pelo script de inicialização do contêiner a cada início; um valor inválido é informado no log e o padrão da imagem é mantido.

</details>
