<!-- lang-selector -->
<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->


<p align="center">
  <img src="images/poznote-logo-text.png" alt="Poznote Logo" width="400">
</p>

<h2 align="center">
Anotações poderosas, sem complicação.
</h2>

<h3 align="center">
Uma alternativa gratuita, auto-hospedada e de código aberto ao Notion, Obsidian, Evernote ou OneNote.
</h3>

<p align="center">
  <a href="https://github.com/timothepoznanski/poznote/releases"><img src="https://img.shields.io/github/v/release/timothepoznanski/poznote?label=release&color=1f6feb" alt="Latest release"></a>
  <a href="https://github.com/timothepoznanski/poznote/pkgs/container/poznote"><img src="https://img.shields.io/badge/ghcr.io-poznote-2496ed?logo=docker&logoColor=white" alt="Docker image"></a>
  <a href="https://github.com/timothepoznanski/poznote/blob/main/LICENCE"><img src="https://img.shields.io/github/license/timothepoznanski/poznote?color=44cc11" alt="License MIT"></a>
  <a href="https://github.com/timothepoznanski/poznote/stargazers"><img src="https://img.shields.io/github/stars/timothepoznanski/poznote?color=f5b400" alt="GitHub stars"></a>
  <a href="https://github.com/timothepoznanski/poznote/issues?q=is%3Aissue+is%3Aclosed"><img src="https://img.shields.io/github/issues-closed/timothepoznanski/poznote?label=issues%20closed&color=44cc11" alt="Closed issues"></a>
  <a href="https://github.com/timothepoznanski/poznote/discussions"><img src="https://img.shields.io/github/discussions/timothepoznanski/poznote?label=discussions&logo=github&color=8957e5" alt="GitHub Discussions"></a>
  <a href="https://demo.poznote.com"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live demo"></a>
</p>

<p align="center">
  <img src="images/pres1.png" alt="Poznote-light" width="100%">
</p>

### Recursos

Conheça todos os recursos [aqui](https://poznote.com/#features).

### Capturas de tela

Veja todas as capturas de tela [aqui](https://poznote.com/screenshots.html).

### Demonstração

https://demo.poznote.com

**Login**: poznote<br>
**Senha**: poznote

### Falam do Poznote

https://poznote.com/press.html

### Discord

Entre na comunidade para tirar dúvidas, compartilhar sua opinião ou acompanhar o desenvolvimento:

https://discord.gg/AWhWWSEkJ

## Sumário

- [Instalação](#instalação)
- [Acesso](#acesso)
- [Alterar as configurações](#alterar-as-configurações)
- [Atualizar o aplicativo](#atualizar-o-aplicativo)
- [Autenticação](#autenticação)
- [Senhas de aplicativo](#senhas-de-aplicativo)
- [Tipos de nota](#tipos-de-nota)
- [Instantâneos](#instantâneos)
- [Personalização](#personalização)
- [Multiusuário](#multiusuário)
- [Registro de atividade](#registro-de-atividade)
- [Webhooks](#webhooks)
- [Sincronização Git](#sincronização-git)
- [Armazenamento de anexos no S3](#armazenamento-de-anexos-no-s3)
- [Backups S3](#backups-s3)
- [Backup / Exportar](#backup--exportar)
- [Restaurar / Importar](#restaurar--importar)
- [Visualização offline](#visualização-offline)
- [Várias instâncias](#várias-instâncias)
- [Assistente IA](#assistente-ia)
- [Transcrição (fala para texto)](#transcrição-fala-para-texto)
- [Servidor MCP](#servidor-mcp)
- [Extensão do Chrome](#extensão-do-chrome)
- [Compartilhar com o Poznote no Android](#compartilhar-com-o-poznote-no-android)
- [Documentação da API](#documentação-da-api)
- [Tecnologias](#tecnologias)

## Instalação

> A imagem oficial é multiarquitetura (linux/amd64, linux/arm64) e funciona no Windows/macOS via Docker Desktop, bem como em dispositivos ARM64 como Raspberry Pi, sistemas NAS etc.

Escolha abaixo o método de instalação de sua preferência:

<a id="windows"></a>
<details>
<summary><strong>🖥️ Windows</strong></summary>

#### Passo 1: Pré-requisito

Instale e inicie o [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)

#### Passo 2: Implantar o Poznote

Crie um novo diretório:

```powershell
mkdir poznote
```

Entre no diretório do Poznote:
```powershell
cd poznote
```

Crie o arquivo de ambiente:

```powershell
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edite o arquivo `.env`:

```powershell
notepad .env
```

Baixe o arquivo de configuração do Docker Compose:

```powershell
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixe as imagens mais recentes do Poznote Webserver e do Poznote MCP:
```powershell
docker compose pull
```

Inicie os contêineres do Poznote:
```powershell
docker compose up -d
```

</details>

<a id="linux"></a>
<details>
<summary><strong>🐧 Linux</strong></summary>

#### Passo 1: Pré-requisito

1. Instale o [Docker engine](https://docs.docker.com/engine/install/)
2. Instale o [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Passo 2: Instalar o Poznote

Crie um novo diretório:
```bash
mkdir poznote
```

Entre no diretório do Poznote:
```bash
cd poznote
```

Crie o arquivo de ambiente:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edite o arquivo `.env`:
```bash
vi .env
```

Baixe o arquivo de configuração do Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixe as imagens mais recentes do Poznote Webserver e do Poznote MCP:
```bash
docker compose pull
```

Inicie os contêineres do Poznote:
```bash
docker compose up -d
```

</details>

<a id="macos"></a>
<details>
<summary><strong>🍎 macOS</strong></summary>

#### Passo 1: Pré-requisito

Instale e inicie o [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)

#### Passo 2: Implantar o Poznote

Crie um novo diretório:
```bash
mkdir poznote
```

Entre no diretório do Poznote:
```bash
cd poznote
```

Baixe o arquivo de ambiente:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edite o arquivo `.env`:
```bash
vi .env
```

Baixe o arquivo de configuração do Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixe as imagens mais recentes do Poznote Webserver e do Poznote MCP:
```bash
docker compose pull
```

Inicie os contêineres do Poznote:
```bash
docker compose up -d
```

</details>

<a id="cloud"></a>
<details>
<summary><strong>☁️ Nuvem</strong></summary><br>

Não quer administrar um servidor? O Poznote pode ser implantado na nuvem em poucos minutos.

Veja as opções de hospedagem em nuvem em [poznote.com/hosting.html](https://poznote.com/hosting.html).

</details>

<a id="proxmox"></a>
<details>
<summary><strong>🗄️ Proxmox VE</strong></summary><br>

Em um host Proxmox VE, o projeto Proxmox VE Community Scripts instala o Poznote em um contêiner próprio com um único comando, sem Docker: ele cria um LXC Debian 13 sem privilégios (1 vCPU, 512 MB de RAM e disco de 4 GB por padrão) e serve o Poznote com nginx e PHP dentro dele.

Execute isto no shell do host Proxmox:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/poznote.sh)"
```

O Poznote passa então a responder em `http://<container-ip>:8040`, com as mesmas credenciais padrão de qualquer outra instalação. Para atualizá-lo depois, execute `update` no console do contêiner.

Este script é escrito e mantido pela comunidade, não pelo Poznote. Consulte a [página do script do Poznote](https://community-scripts.org/scripts/poznote) para ver suas opções e observações.

</details>

<a id="kubernetes"></a>
<details>
<summary><strong>☸️ Kubernetes com Helm</strong></summary>

#### Passo 1: Pré-requisito

Instale o [Helm](https://helm.sh/docs/intro/install/) e verifique se o seu contexto Kubernetes aponta para o cluster onde você quer implantar o Poznote.

#### Passo 2: Implantar o Poznote

Adicione o repositório de charts do HelmForge:

```bash
helm repo add helmforge https://repo.helmforge.dev
```

Atualize o índice local de charts:

```bash
helm repo update
```

Instale o Poznote:

```bash
helm install poznote helmforge/poznote --namespace poznote --create-namespace
```

O chart Helm do Poznote é mantido pela comunidade HelmForge como uma opção de instalação nativa para Kubernetes. Consulte a [documentação do chart Poznote do HelmForge](https://helmforge.dev/docs/charts/poznote) para ver os valores, a persistência, a exposição do serviço, as probes, os contextos de segurança e outras configurações voltadas à produção.

</details>

<a id="rootless"></a>
<details>
<summary><strong>🔒 Rootless</strong></summary><br>

O Poznote também oferece uma variante rootless da imagem, que roda inteiramente como um usuário sem privilégios (uid/gid `1000`) em vez de root, para ambientes que proíbem root dentro dos contêineres (Kubernetes com `PodSecurityStandard` restrito, Podman rootless, `docker run --user` etc.). Ela funciona exatamente como a imagem padrão; as únicas diferenças são que escuta internamente na porta `8080` e não consegue corrigir a propriedade do seu diretório de dados na inicialização.

#### Passo 1: Pré-requisito

1. Instale o [Docker engine](https://docs.docker.com/engine/install/)
2. Instale o [Docker Compose](https://docs.docker.com/compose/install/linux)

#### Passo 2: Implantar o Poznote

Crie um novo diretório:
```bash
mkdir poznote
```

Entre no diretório do Poznote:
```bash
cd poznote
```

Crie o diretório de dados e defina uid/gid `1000` como proprietário (**obrigatório**: ao contrário da imagem padrão, o contêiner rootless não consegue corrigir essa propriedade sozinho na inicialização):
```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

Muitas vezes o `sudo` não é necessário aqui: se o seu usuário já tem o uid `1000`, o `chown` pode ser pulado, e no Podman/Docker rootless ele pode ser executado sem root, veja [Execução rootless](docs/TROUBLESHOOTING.pt.md#running-rootless).

Crie o arquivo de ambiente:
```bash
curl -o .env https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Edite o arquivo `.env`:
```bash
vi .env
```

Baixe o arquivo de configuração rootless do Docker Compose:
```bash
curl -o docker-compose.rootless.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.rootless.yml
```

Baixe as imagens rootless mais recentes do Poznote Webserver e do Poznote MCP:
```bash
docker compose -f docker-compose.rootless.yml pull
```

Inicie os contêineres do Poznote:
```bash
docker compose -f docker-compose.rootless.yml up -d
```

Para migrar uma instância existente do Poznote para a variante rootless, ou para mais detalhes, veja [Execução rootless](docs/TROUBLESHOOTING.pt.md#running-rootless) no Guia de solução de problemas.

</details>

<br>

> Se encontrar problemas na instalação, consulte o [Guia de solução de problemas](docs/TROUBLESHOOTING.pt.md).

## Acesso

Após a instalação, acesse o Poznote no seu navegador:

[http://localhost:8040](http://localhost:8040)


- Nome de usuário: `admin_change_me`
- Senha: `admin`
- Porta: `8040`

Renomeie a conta de administrador padrão e altere a senha padrão depois do primeiro login.

## Alterar as configurações

A maioria das configurações do dia a dia é alterada pela interface do Poznote. Use o arquivo `.env` apenas para valores de implantação/execução lidos quando os contêineres iniciam.

<details>
<summary><strong>Use o arquivo <code>.env</code> para</strong></summary>
<br>

- `HTTP_WEB_PORT`
- `POZNOTE_OIDC_CLIENT_ID`
- `POZNOTE_OIDC_CLIENT_SECRET`
- `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`
- Substituições opcionais de execução, como `POZNOTE_MCP_PORT` e `POZNOTE_DEBUG`
- `POZNOTE_PHP_FPM_MAX_CHILDREN` para alterar o número de requisições PHP simultâneas (padrão 10) em uma instância muito usada, veja o [Guia de solução de problemas](docs/TROUBLESHOOTING.pt.md#the-app-stops-answering-under-load)
- `POZNOTE_PHP_MEMORY_LIMIT` para alterar o limite de memória do PHP por requisição, em MB (padrão 512), veja o [Guia de solução de problemas](docs/TROUBLESHOOTING.pt.md#a-request-runs-out-of-memory)
- `POZNOTE_SETTINGS_PASSWORD` para pedir uma senha adicional antes de abrir a página de Configurações, vazio por padrão
- `POZNOTE_MCP_AUTH_TOKEN` para exigir um token bearer dos clientes MCP, veja [Servidor MCP](#servidor-mcp)

</details>

<details>
<summary><strong>Use a interface para</strong></summary>
<br>

- Configurações de administração/globais, como as configurações do provedor OIDC, a ativação da Sincronização Git, os limites de importação e o envio de CSS personalizado
- Configurações de usuário/perfil, como senhas de contas locais, tema, tamanhos de fonte, ordenação das notas, plano de fundo do espaço de trabalho e elementos ocultos da interface

</details>


### Modificar as configurações do sistema (`.env`)

Entre no diretório do Poznote:
```bash
cd poznote
```

Pare os contêineres do Poznote em execução:
```bash
docker compose down
```

Edite o arquivo `.env` com o editor de texto de sua preferência (por exemplo, `nano .env` ou `notepad .env`).

Salve o arquivo e inicie os contêineres novamente para aplicar as alterações:
```bash
docker compose up -d
```

## Atualizar o aplicativo

Entre no diretório do Poznote:
```bash
cd poznote
```

Pare os contêineres em execução antes de atualizar:
```bash
docker compose down
```

Baixe a configuração mais recente do Docker Compose:
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/timothepoznanski/poznote/main/docker-compose.yml
```

Baixe o `.env.template` mais recente:
```bash
curl -o .env.template https://raw.githubusercontent.com/timothepoznanski/poznote/main/.env.template
```

Use o sdiff para comparar com o `.env.template` e, se necessário, adicione as novas variáveis ao seu arquivo `.env`:
```bash
sdiff .env .env.template
```

Baixe as imagens mais recentes do Poznote Webserver e do Poznote MCP:
```bash
docker compose pull
```

Inicie os contêineres atualizados:
```bash
docker compose up -d
```

Seus dados ficam preservados no diretório `./data` e não são afetados pela atualização.

## Autenticação

O Poznote oferece vários métodos de autenticação, incluindo contas locais e provedores de identidade externos. Aplicativos e extensões que se comunicam com a API REST usam [senhas de aplicativo](#senhas-de-aplicativo), uma credencial à parte descrita na seção seguinte.

<details>
<summary><strong>Autenticação com contas locais</strong></summary>
<br>

O Poznote autentica os usuários no próprio perfil com um nome de usuário ou endereço de e-mail e uma senha.


#### Conta padrão

Em uma instalação nova, o Poznote cria um perfil de administrador ativo:

- Nome de usuário: `admin_change_me`
- Senha: `admin`

Altere a senha padrão e renomeie a conta depois do primeiro login.

#### Gerenciamento de senhas

As senhas são gerenciadas pela interface web do Poznote, não pelo `.env`:

- Os usuários podem alterar a própria senha em **Configurações > Mudar palavra-passe**.
- Os administradores podem definir uma senha personalizada para qualquer usuário ou redefini-la para o padrão em **Configurações > Ferramentas de administração > Gestão de utilizadores**.
- A opção **Lembrar-me por 30 dias** mantém a sessão por 30 dias.
- Alterar uma senha invalida os cookies "lembrar-me" existentes desse usuário.

#### Senhas padrão

- Contas de administrador: `admin`
- Contas de usuário comum: `user`

Enquanto um usuário não tiver alterado a senha, é usado o valor padrão acima. Assim que a senha é alterada pela interface, um hash bcrypt seguro é armazenado no banco de dados e passa a ter prioridade.

</details>

<a id="oidc"></a>
<details>
<summary><strong>Autenticação OIDC / SSO (opcional)</strong></summary>
<br>

O Poznote oferece suporte ao OpenID Connect (authorization code + PKCE) para integração de login único. Isso permite que os usuários façam login com provedores de identidade externos como Auth0, Keycloak, Azure AD ou Google Identity.

#### Como funciona

1. A página de login exibe um botão `Continue with [Provider Name]` quando o OIDC está ativado.
2. Os usuários se autenticam pelo fluxo authorization code do OIDC, protegido por PKCE.
3. O acesso pode ser restrito a grupos permitidos e, se necessário, a uma lista legada de usuários permitidos.
4. Após a autenticação, o Poznote vincula a identidade nesta ordem: `sub` (`oidc_subject`), depois `preferred_username`, depois `email`.
5. Se a criação automática de usuários estiver ativada e nenhum perfil corresponder, o Poznote cria um automaticamente. Esse perfil **não tem senha nenhuma**: ele nunca passou pela entrega das credenciais iniciais que um administrador faz ao criar uma conta, portanto não aceita a senha padrão. O login é feito pelo provedor, ou então um administrador define uma senha explícita em **Configurações > Ferramentas de administração > Gestão de utilizadores**.
6. Se `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, o formulário de nome de usuário/senha fica oculto e a página de login passa a aceitar apenas SSO.
7. Clientes da API REST podem se autenticar com `Authorization: Bearer <OIDC JWT>` quando o OIDC está ativado; o Poznote valida o JWKS do provedor, o emissor, a expiração, a audiência e os controles de acesso configurados.
8. Clientes que não conseguem executar nenhum fluxo OIDC (extensão de navegador, aplicativo móvel, scripts) usam uma [senha de aplicativo](#senhas-de-aplicativo), que cada usuário cria nas próprias configurações.

#### Configuração

O OIDC é configurado pela **interface de administração**: vá em **Configurações > Ferramentas de administração > OIDC / SSO**.

A maioria das configurações (ativação, emissor, nome do provedor, escopos, controle de acesso, grupos/usuários permitidos, criação automática de usuários, comportamento do HTTP Basic Auth etc.) é gerenciada nessa página e armazenada no banco de dados.

Para a autenticação Bearer JWT da API REST, configure **Audiência JWT da API** se o seu provedor emitir tokens de acesso para uma audiência de API dedicada. Quando o campo está vazio, o Poznote aceita o Client ID OIDC configurado como audiência do JWT.

As seguintes configurações continuam no arquivo `.env`:

```bash
POZNOTE_OIDC_CLIENT_ID=your_client_id
POZNOTE_OIDC_CLIENT_SECRET=your_client_secret
POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false
```

Use `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true` se quiser ocultar o formulário local de nome de usuário/senha e permitir apenas o login por SSO. Essa é a única opção que bloqueia a autenticação por senha: ela remove o formulário, recusa no servidor os POSTs de senha e oculta a configuração "Mudar palavra-passe".

> **Como recuperar o acesso quando o provedor de identidade cai.** Apenas SSO significa exatamente isso: enquanto `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=true`, ninguém consegue entrar com senha, nem mesmo os administradores, então não há saída de emergência pelo navegador. Isso é intencional, pois um invasor que tenha comprometido uma conta de administrador não consegue reativar o login por senha para garantir um acesso persistente. A recuperação exige acesso ao servidor: defina `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN=false` no `.env`, reinicie o contêiner e entre com uma senha local. Antes de ativar o modo apenas SSO, verifique se pelo menos uma conta de administrador tem uma senha explícita definida (**Configurações > Ferramentas de administração > Gestão de utilizadores**); caso contrário, voltar a opção atrás não vai adiantar. Observe que um perfil de administrador criado automaticamente pelo OIDC não tem senha até que uma seja definida.

> **Mudança incompatível:** as configurações OIDC anteriores no `.env` não são mais lidas, exceto `POZNOTE_OIDC_CLIENT_ID`, `POZNOTE_OIDC_CLIENT_SECRET` e `POZNOTE_OIDC_DISABLE_NORMAL_LOGIN`. Após a atualização, informe novamente as demais configurações OIDC na página de administração.

#### Exemplo de controle de acesso (grupos + provisionamento automático)

Na página de administração do OIDC, configure:
- **Claim de grupos:** `groups`
- **Grupos permitidos:** `poznote`
- **Criar automaticamente perfis de utilizador no primeiro login OIDC:** ativado

Se o provisionamento automático estiver ativado, o Poznote gera um nome de usuário a partir das claims OIDC (`preferred_username`, `nickname`, parte local do e-mail, `name`, depois `sub`) e armazena o subject OIDC no perfil criado.

</details>

## Senhas de aplicativo

Aplicativos não conseguem entrar por um provedor de identidade como um navegador consegue. Uma **senha de aplicativo** é uma credencial à parte que você cria para um único cliente (a extensão do navegador, um celular, um script) e pode revogar a qualquer momento, assim você nunca precisa entregar a senha da sua conta.

Crie uma em **Configurações > Senhas de aplicativo**: dê um nome, opcionalmente uma data de expiração, e copie o segredo gerado. Ele é exibido uma única vez e nunca mais. Depois, no cliente, informe o seu nome de usuário de sempre e a senha de aplicativo no campo de senha. Ela trafega como um HTTP Basic Auth comum, então todos os clientes existentes funcionam sem alterações:

```bash
curl -u 'username:pzn_2f7c…' https://YOUR_SERVER/api/v1/notes
```

Uma senha de aplicativo só alcança a API REST, e apenas para o próprio perfil: ela não pode abrir a interface web, chamar um endpoint de administração, alterar sua senha nem gerenciar sua conta, mesmo quando a conta é de administrador. Por isso uma senha vazada expõe as notas de uma única conta e nada mais, e revogá-la fecha a brecha. Em uma instância apenas SSO, onde as contas criadas pelo OIDC não têm senha nenhuma, ela é a única credencial que a API aceita via Basic Auth.

A lista completa de limites e os endpoints que gerenciam as senhas de aplicativo estão na [documentação da API REST](docs/API-REST.md#authentication).

## Tipos de nota

O Poznote oferece dois formatos principais de nota, cada um pensado para um fluxo de trabalho diferente.

<details>
<summary><strong>Notas HTML</strong></summary>
&nbsp;

*   **Editor:** edição WYSIWYG (What You See Is What You Get) direta.
*   **Armazenamento:** salvas como arquivos `.html` no diretório de dados do usuário. Como são HTML padrão, podem ser abertas diretamente em qualquer navegador.
*   **Recursos exclusivos:**
    *   **Formatação rica:** suporte nativo a cores de texto, realce e elementos HTML padrão.
    *   **Interface interativa:** manipulação direta dos elementos no editor.
</details>

<details>
<summary><strong>Notas Markdown</strong></summary>
&nbsp;

*   **Editor:** editor com sintaxe Markdown e pré-visualização em tempo real.
*   **Armazenamento:** salvas como arquivos `.md` no diretório de dados do usuário.
*   **Recursos exclusivos:**
    *   **Diagramas Mermaid:** suporte nativo à geração de diagramas (fluxogramas, diagramas de sequência etc.) com blocos de código ` ```mermaid `.
    *   **Equações matemáticas:** suporte robusto a LaTeX para fórmulas matemáticas com a sintaxe `$ inline $` e `$$ block $$`.
    *   **Portabilidade:** formato Markdown padrão, compatível com qualquer editor externo ou gerador de sites estáticos.
</details>

<details>
<summary><strong>Listas de tarefas</strong></summary>
&nbsp;

*   **Uso:** gerencie tarefas e projetos com checklists interativas.
*   **Fluxo de trabalho:** acompanhe o andamento com caixas de seleção que podem ser marcadas diretamente no editor ou na lista de notas. Uma barra de progresso mostra a conclusão de cada lista.
*   **Opções das tarefas:** cada tarefa pode ter uma data de vencimento com horário opcional, uma notificação de lembrete disparada no horário de vencimento e uma marcação de importante, e pode ser movida para outra lista.
*   **Página Tarefas:** uma página Tarefas dedicada, aberta pela barra de ícones à esquerda, reúne em um só lugar todas as tarefas das suas listas de tarefas e, opcionalmente, as caixas de seleção que estão dentro de notas comuns. Ela oferece filtros de status (a fazer, importantes, atrasadas, com data de vencimento, concluídas), um filtro de texto e uma visualização em calendário das tarefas que têm data de vencimento.
*   **Colaboração pública:** as listas de tarefas podem ser compartilhadas por uma URL pública. Se a permissão de edição for concedida, colaboradores externos podem marcar os itens da lista sem precisar de uma conta no Poznote.
</details>

<details>
<summary><strong>Atalhos</strong></summary>
&nbsp;

*   **Funcionalidade:** crie uma referência a uma nota existente em outro local.
*   **Caso de uso:** permite que uma nota seja referenciada em dois lugares diferentes ao mesmo tempo. Por exemplo, uma nota pode ficar em uma pasta de classificação enquanto o atalho dela aparece em um quadro Kanban para acompanhamento ativo.
</details>

<details>
<summary><strong>Modelos</strong></summary>
&nbsp;

*   **Funcionalidade:** reutilize conteúdo já escrito para padronizar sua documentação, de uma nota inteira a um pequeno trecho.
*   **Configuração:** coloque as notas que deseja reutilizar em uma pasta chamada `Templates` (subpastas são aceitas). Um espaço de trabalho chamado `Templates` também funciona e fica disponível a partir de todos os espaços de trabalho. O nome também é reconhecido no idioma da interface (`Modèles`, `Vorlagen`, `Plantillas`, `Modelos`, `Шаблоны`, `模板`).
*   **Inserir em uma nota:** digite `/template` (ou `/` seguido do título do modelo) em uma nota HTML ou Markdown e escolha um modelo: o conteúdo dele é colado no cursor, convertido se o modelo e a nota não forem do mesmo tipo.
*   **Nova nota a partir de um modelo:** duplique a nota do modelo, ou duplique uma pasta `Templates` inteira para começar um projeto com uma estrutura de pastas pronta.
</details>

<details>
<summary><strong>Notas diárias (Diário)</strong></summary>
&nbsp;

*   **Uso:** escreva uma nota por dia, no estilo de um diário, a partir de um quadro Diário dedicado.
*   **Fluxo de trabalho:** o botão "Criar a entrada de hoje" cria a nota do dia (ele passa a se chamar "Ir para a entrada de hoje" quando a nota já existe), com a data atual como título e armazenada automaticamente em uma estrutura de pastas `Diary/YYYY/MM`.
*   **Visualização em quadro:** as entradas são exibidas como cartões agrupados por mês, das mais recentes para as mais antigas, com um filtro para encontrar rapidamente entradas anteriores.
*   **Vista contínua:** o botão em forma de pergaminho, ao lado dos controles de visualização, muda para uma única coluna de leitura: cada entrada com seu conteúdo completo, das mais recentes para as mais antigas, carregadas conforme você rola a página. O filtro também funciona ali.
*   **Formato:** novas entradas são criadas como notas HTML ou Markdown, conforme a configuração "Formato das entradas do diário" em **Configurações > Comportamento**.
</details>

## Instantâneos

Os instantâneos guardam versões anteriores do conteúdo de uma nota para que você possa voltar a um estado anterior pelo menu **Instantâneos** da nota.

<details>
<summary><strong>Como funcionam os instantâneos</strong></summary>
<br>

*   **Automáticos:** um instantâneo é criado na primeira vez que a nota é aberta a cada dia. Os 3 instantâneos automáticos mais recentes são mantidos por nota; esse número pode ser alterado em **Configurações > Comportamento > Instantâneos**.
*   **Manuais:** "Criar instantâneo agora" adiciona um instantâneo a qualquer momento, assim como **Ctrl + Alt + S** (Cmd + Alt + S no Mac) com uma nota aberta. Os instantâneos manuais são ilimitados e não contam para esse número.
*   **Antes de uma edição por IA:** um instantâneo é criado automaticamente logo antes de o [Assistente IA](#assistente-ia) ou o [servidor MCP](#servidor-mcp) alterar o conteúdo de uma nota, então uma reescrita que dê errado pode ser desfeita com um clique. Esses instantâneos aparecem como "Antes da alteração pela IA" ou "Antes da alteração por MCP" no histórico, não são criados quando o instantâneo mais recente já tem o mesmo conteúdo, e os 20 mais recentes são mantidos por nota, número que você pode alterar em **Configurações → Instantâneos** (1 a 200) se a sua instância edita muitas notas por IA ou MCP.
*   **Expiração:** todo instantâneo, automático ou manual, é excluído 30 dias depois de criado. Um instantâneo também pode ser excluído manualmente na janela Instantâneos.
*   **Anexos e imagens:** os instantâneos armazenam apenas o texto da nota. Os anexos nunca são copiados, então um arquivo referenciado por vários instantâneos existe uma única vez no disco. Um arquivo removido de uma nota continua no disco, oculto na nota, enquanto algum instantâneo ainda o contiver, de modo que restaurar esse instantâneo o traz de volta. Ele é excluído definitivamente quando o último instantâneo que o contém expira ou é excluído, ou quando a nota é excluída permanentemente. Manter mais instantâneos, portanto, nunca duplica arquivos. Apenas mantém os arquivos removidos por mais tempo, 30 dias no máximo.

</details>

## Personalização

O Poznote oferece várias opções de personalização integradas diretamente no aplicativo, sem exigir alterações em arquivos de configuração.

<details>
<summary><strong>Configurações de Tela, Comportamento e Markdown</strong></summary>
<br>

Em **Configurações > Tela**, você pode configurar:

- **Fonte do aplicativo:** escolha a fonte usada em toda a interface
- **Tamanho da Fonte:** ajuste o tamanho do texto das notas, da barra lateral, dos blocos de código e da página de configurações
- **Cores das notas:** escolha a paleta oferecida ao colorir uma nota
- **Ícones por tipo de nota:** dê às listas de tarefas e às notas Markdown um ícone próprio na lista de notas
- **Escala de ícones do índice:** redimensione os ícones do índice de notas
- **Ordem da barra de ícones:** reordene os botões da barra de ícones à esquerda e altere a sua cor (um clique direito num botão da barra também abre o seletor de cor)
- **Largura do conteúdo da nota:** controle a largura máxima da área do editor de notas
- **Pré-visualizações de anexos:** exiba os anexos como pré-visualizações dentro da nota
- **Borda padrão de imagem:** emoldure as imagens inseridas sem adicionar espaçamento interno
- **Realçar a árvore de pastas atual:** esmaeça as notas e pastas fora da hierarquia de pastas em que você está trabalhando
- **Título da Página de Login:** altere o título exibido na página de login
- **Visibilidade dos elementos:** oculte os elementos da interface que você não usa, veja abaixo

Em **Configurações > Comportamento**, você pode configurar:

- **Ordem de classificação das notas:** escolha como as notas são ordenadas na lista
- **Filtro de antiguidade:** liste apenas as notas atualizadas dentro do número de dias escolhido
- **Instantâneos:** quantos instantâneos automáticos são mantidos por nota
- **Ordem de inserção das tarefas:** controle onde as novas tarefas são inseridas
- **Mostrar notas após as pastas:** liste as notas sem pasta abaixo da lista de pastas
- **Quebra de linha em blocos de código:** ative ou desative a quebra de linha nos blocos de código
- **Formato das entradas do diário:** crie as entradas do diário como notas HTML ou Markdown
- Idioma da interface, fuso horário e formato de data, anexos e backlinks no fim da nota, verificação ortográfica e atalhos de teclado

Em **Configurações > Markdown**, você pode configurar o modo de visualização padrão, a fonte do editor, o Markdown emoldurado e colorido e a numeração de linhas dos blocos de código.

O tema não é um cartão aqui: o botão na parte de baixo da barra de ícones à esquerda percorre os temas, e um administrador escolhe quais ele oferece em **Configurações > Ferramentas de administração > Lista de temas**.

</details>

<details>
<summary><strong>Imagem de fundo do espaço de trabalho</strong></summary>
<br>

Você pode definir uma imagem de fundo por espaço de trabalho: abra a página **Espaços de trabalho** e use a ação **Plano de fundo** do espaço de trabalho para enviar uma imagem e ajustar sua opacidade, dando a cada espaço de trabalho uma identidade visual própria.

</details>

<details>
<summary><strong>Visibilidade dos elementos</strong></summary>
<br>

O Poznote permite deixar a interface mais limpa ocultando os elementos que você não usa.

Configure isso em **Configurações > Tela > Visibilidade dos elementos**.

- **Controle granular:** ative ou desative a exibição de cartões da página inicial, ações da barra de ferramentas, itens do menu de barra (slash) e mais. O selo com a data de criação das notas (**Mostrar Data de Criação da Nota**) e a contagem de notas ao lado de cada pasta (**Mostrar Contagem de Notas das Pastas**) também são ligados e desligados aqui.
- **Por usuário:** cada usuário pode ter o próprio layout de interface.
- **Administradores:** a mesma janela mostra uma segunda coluna "Usuários" ao lado da coluna "Eu" do administrador, para ocultar elementos para todos os usuários da instância (exceto os administradores).
- **Pesquisável:** encontre facilmente o elemento que deseja ocultar usando o filtro da janela de configuração.

</details>

<details>
<summary><strong>Substituições com CSS personalizado</strong></summary>
<br>

Se você quiser ajustar fontes, espaçamentos ou outros detalhes visuais além das opções integradas, pode enviar folhas de estilo adicionais, aplicadas a todas as páginas HTML para todos os usuários.

Configure-as em **Configurações > Ferramentas de administração > Arquivo CSS personalizado**.

Observações:

- Clique em **Carregar arquivo CSS** para selecionar um arquivo `.css` no seu computador.
- Todo arquivo enviado é mantido, então você pode guardar vários temas e alternar entre eles sem precisar enviá-los de novo.
- A janela lista o que está armazenado: escolha o que será aplicado a todos os usuários, ou **Sem CSS personalizado** para voltar à aparência padrão, e clique em **Salvar**.
- Enviar um arquivo com o mesmo nome de um já armazenado substitui esse tema.
- Os arquivos ficam em `data/css/` (seu volume Docker), então sobrevivem às atualizações da imagem.
- Clique no ícone de lixeira ao lado de um tema para excluir esse arquivo do seu volume.
- O Poznote adiciona automaticamente um parâmetro `v=` para evitar problemas de cache.
- A folha de estilo é injetada perto do fim do `<head>`, então pode sobrescrever os estilos padrão do aplicativo.
- Apenas administradores podem enviar, aplicar ou excluir um arquivo CSS personalizado.

### A lista de temas

**Configurações > Ferramentas de administração > Lista de temas** define o que o botão de tema na parte de baixo da barra de ícones percorre: um tema por clique, na ordem exibida.

- Marque os temas integrados que você quer manter e deixe de fora os que ninguém usa.
- Marque um arquivo CSS armazenado para oferecê-lo como um tema próprio. Ele recebe um ícone de paleta e o nome do arquivo.
- Use as setas para definir a ordem em que o botão percorre os temas.
- Um tema personalizado é aplicado sobre uma base clara ou escura, algo que o arquivo não consegue indicar sozinho: escolha isso ao lado do arquivo. É esse o valor atribuído a `data-theme`, então uma folha de estilo escrita para o modo escuro precisa de **Escuro** aqui.
- A lista é uma configuração global, então todos percorrem os mesmos temas; qual deles fica aplicado continua sendo escolha de cada usuário.
- Quem estiver usando um tema que você retirar da lista passa imediatamente para o primeiro tema da lista.
- Escolher um tema personalizado carrega esse arquivo apenas para aquele usuário, no lugar da folha de estilo aplicada a toda a instância.
- Excluir um arquivo CSS também o remove da lista.
- Com um único tema na lista não há para onde avançar, então o botão abre essa lista para um administrador e não faz nada para os demais.

**Antes de escrever qualquer CSS**, verifique se um tema integrado já faz o que você quer: o botão de tema na parte de baixo da barra de ícones percorre Claro, Escuro, Preto, Lavanda, Sépia e Terminal.

### Exemplos

Cores, espaçamentos, raios e pesos de fonte são design tokens, então a maioria das alterações é uma lista curta de variáveis sobrescritas, e não uma briga com seletores. A lista completa está em `src/public/css/tokens.css`.

**Mudar a cor de destaque**

```css
:root {
    --pz-accent: #d6336c;
    --pz-accent-hover: #a61e4d;
    --pz-accent-rgb: 214, 51, 108;   /* same colour, channels only, used for tints */
}
html[data-theme='dark'] {
    --dm-accent: #f783ac;            /* lighter, because it sits on a dark ground */
}
```

Dois tokens em vez de um porque um *preenchimento* e um *rótulo* não podem ter a mesma cor: `--pz-accent` preenche os botões, `--dm-accent` é a cor de destaque aplicada ao texto no modo escuro.

**Recolorir os ícones da barra de ferramentas da nota**

```css
.note-edit-toolbar .toolbar-btn i,
.note-edit-toolbar .toolbar-btn [class*="lucide-"],
.note-edit-toolbar .toolbar-btn:hover i,
.note-edit-toolbar .toolbar-btn:hover [class*="lucide-"] {
    color: #e5322d !important;
}
```

Os ícones são máscaras CSS pintadas com `background-color: currentColor`, então `color` é tudo de que você precisa. O `!important` é necessário aqui porque alguns desses ícones já têm uma cor própria (a estrela quando a nota é favorita, o ícone de compartilhamento quando ela está publicada, o clipe quando ela tem anexos).

Para colorir um único ícone não é preciso CSS: clique com o botão direito nele na barra de ferramentas da nota ou na barra de ícones e escolha uma cor. Essas cores são salvas por usuário e não alteram as cores de estado acima.

**Deixar a interface inteira com tons quentes**

```css
:root {
    --pz-bg: #f6ecd8;          /* page and note background */
    --pz-surface: #efe0c4;     /* panels, cards, menus */
    --pz-text: #3b2c1a;
    --pz-border: #d4bd94;
}
```

**Escrever um tema completo**

Sobrescreva os tokens em `:root` para o modo claro e em `:root[data-theme='dark']` para o escuro, e nada mais. O `src/public/css/README.md` documenta todos os tokens e mostra um exemplo completo; os temas integrados Lavanda, Sépia e Terminal em `src/public/css/tokens.css` são exatamente isso, escritos da mesma forma.

Uma coisa que um tema ainda não alcança: alguns ícones que uma regra de página colore explicitamente aparecem no cinza genérico de ícone no modo escuro.

</details>

## Multiusuário

> Não confundir com o recurso [Várias instâncias](#várias-instâncias).

O Poznote é multiusuário: cada perfil tem as próprias notas, espaços de trabalho, tags, pastas, anexos e configurações, e entra com o próprio nome de usuário ou endereço de e-mail e senha.

- **Gerenciamento de usuários**: os administradores criam, desativam e gerenciam perfis em **Configurações > Ferramentas de administração > Gestão de utilizadores**, e podem dar a um usuário acesso à conta de outro usuário sem transferir a propriedade dela.
- **Compartilhamento**: notas, pastas e espaços de trabalho inteiros podem ser compartilhados com outros usuários da instância, somente leitura ou editáveis, ou publicamente por links dedicados. Quando vários usuários têm acesso à mesma nota, apenas um a edita por vez e os demais veem quem detém o bloqueio.
- **Isolamento de contas (modo SaaS)**: os administradores podem impedir que usuários que não são administradores descubram as outras contas da instância, compartilhem com elas ou cadastrem webhooks pessoais. Deixe tudo desmarcado para uma instância familiar ou de equipe.

<details>
<summary><strong>Organização dos dados no disco</strong></summary>
<br>

O Poznote usa um banco de dados mestre (`data/master.db`) para os dados de coordenação compartilhados, e bancos de dados e arquivos separados por usuário para o conteúdo das notas em si.

```
data/
├── master.db                    # Profiles, global settings, shared links, account access, edit locks
├── css/                         # Custom CSS files uploaded by an administrator
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/poznote.db  # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   ├── attachments/         # User's attachments
    │   ├── snapshots/           # Earlier versions of the user's notes
    │   ├── backgrounds/         # Workspace background images
    │   └── backups/             # Backup archives prepared for download
    ├── 2/                       # User ID 2
    └── ...
```

</details>

## Registro de atividade

O Poznote mantém um histórico das operações sensíveis realizadas na instância, para que os administradores possam ver o que aconteceu, quando e por quem: logins e logouts, alterações de contas e de cotas, criação e compartilhamento de espaços de trabalho, backups e restaurações, esvaziamento da lixeira e exclusões permanentes, senhas de aplicativo. Ele fica disponível em **Configurações > Ferramentas de administração > Registo de atividade**, restrito aos administradores, e o ícone de ajuda no topo da página lista todas as operações registradas.

O registro guarda o fato de que uma operação aconteceu, não os dados que ela afetou: o conteúdo das notas e as senhas nunca são gravados nele, e a atividade rotineira, como gravar uma nota ou movê-la para a lixeira, fica de fora. As entradas são mantidas por 90 dias por padrão (30, 90, 365 dias ou ilimitado), e o registro pode ser limpo na mesma página.

## Webhooks

O Poznote pode notificar serviços externos quando algo acontece na instância, enviando webhooks de saída (requisições HTTP POST com um payload JSON) para os endpoints que você cadastrar, o que permite conectá-lo a ferramentas de automação como n8n, Zapier ou seus próprios scripts. Os administradores cadastram os eventos da instância (contas, cotas, inscrições) em **Configurações > Ferramentas de administração > Webhooks de administrador**, e cada usuário pode cadastrar endpoints para as próprias notas e lembretes em **Configurações > Webhooks de usuário**.

As entregas são assinadas com HMAC-SHA256 quando o webhook tem um segredo, e o conteúdo das notas nunca é enviado. Todos os eventos, os campos do payload, a verificação da assinatura e as garantias de entrega estão descritos na **[documentação de Webhooks](docs/WEBHOOKS.pt.md)**.

## Sincronização Git

O Poznote oferece sincronização automática e manual com **GitHub**, **GitLab** (gitlab.com ou uma instância auto-hospedada) ou **Forgejo**. Cada usuário configura o próprio repositório de forma independente. Não existe um repositório global compartilhado.

A Sincronização Git se comunica com a API REST do provedor via HTTPS, então a autenticação é sempre baseada em token. Chaves SSH não são usadas.

<details>
<summary><strong>Como configurar a Sincronização Git</strong></summary>
<br>

**Passo 1: ativar o recurso (administrador, em Configurações > Ferramentas de administração)**

Ative a opção **Sincronização Git** na seção **Ferramentas de administração** da página de Configurações. Isso ativa a Sincronização Git globalmente e disponibiliza o cartão/configuração **Sincronização Git** de cada usuário em **Configurações**.

---

**Passo 2: cada usuário configura o próprio repositório (Configurações > Sincronização Git)**

| Campo | Descrição |
|---|---|
| Provedor | `GitHub`, `GitLab` ou `Forgejo` |
| URL base da API | GitHub: preenchida automaticamente (somente leitura). GitLab: `https://gitlab.com/api/v4`, ou a URL da sua instância, por exemplo `https://gitlab.example.com/api/v4`. Forgejo: a URL da sua instância, por exemplo `https://forgejo.example.com/api/v1` |
| Token de acesso | PAT do GitHub (`ghp_...`), token do GitLab com o escopo `api` (`glpat-...`, token de acesso pessoal ou de projeto) ou token do Forgejo (Settings > Applications) |
| Repositório | Formato `owner/repo`. GitLab: o caminho completo do projeto, incluindo subgrupos, por exemplo `group/subgroup/project` |
| Branch | Padrão: `main` |
| Nome / e-mail do autor | Usados nos metadados dos commits |

> 🔒 Os tokens de acesso são criptografados em repouso com AES-256-GCM. Uma chave de criptografia é gerada automaticamente e armazenada em `data/.app_secret`.

---

**Sincronização automática**

Quando ativada pelo usuário, o Poznote automaticamente:
- Faz **pull** no login
- Faz **push** a cada criação, atualização ou exclusão de nota

O push/pull manual também está disponível pelos botões **Enviar** e **Recuperar** da barra de ícones à esquerda.

---

**Espaços de trabalho sincronizados**

Por padrão, todos os espaços de trabalho são sincronizados. Em **Configurações > Sincronização Git**, cada usuário pode, em vez disso, restringir a Sincronização Git a espaços de trabalho selecionados:

- Apenas as notas e os anexos dos espaços de trabalho selecionados são enviados e recuperados.
- Um pull nunca mexe nas notas dos outros espaços de trabalho.
- Um push remove do repositório os arquivos que ficam fora dos espaços de trabalho selecionados, para que o repositório sempre espelhe exatamente o conjunto sincronizado.
- Os botões Enviar e Recuperar da barra lateral, o push automático e o aviso de pull só aparecem enquanto você visualiza um espaço de trabalho sincronizado.

</details>

## Armazenamento de anexos no S3

Por padrão, os anexos das notas são armazenados no disco local. Os administradores podem, em vez disso, armazená-los em um armazenamento de objetos compatível com S3 (AWS S3, MinIO, Garage, Cloudflare R2, Backblaze B2...). A configuração vale para todos os usuários da instância.

<details>
<summary><strong>Como configurar o armazenamento S3</strong></summary>
<br>

Configure isso em **Configurações > Anexos S3** (somente administradores).

- **Configuração**: URL do endpoint, região, bucket, chave de acesso, chave secreta e endereçamento path-style, com um teste de conexão integrado.
- **Migração**: mova os arquivos de anexos existentes entre o disco local e o bucket, nos dois sentidos e para todos os usuários. A migração é feita em lotes e pode ser interrompida e retomada com segurança.
- **Privacidade**: os anexos ficam em `attachments/{user id}/` no bucket e são sempre servidos pelo Poznote, então o bucket pode continuar privado.
- **Cotas**: é possível definir uma cota de armazenamento S3 por usuário, e o uso do S3 aparece nas estatísticas de armazenamento da administração.
- **Backups**: as exportações zip incluem por padrão os anexos do S3 (buscados no bucket na hora), sejam elas feitas pela janela de Backup, pela API REST ou pelos backups S3 automáticos. Uma opção na janela de Backup permite deixá-los de fora para um arquivo mais leve. Se o bucket não puder ser lido durante a montagem de um arquivo, a exportação falha com um erro em vez de gerar um arquivo com arquivos faltando.

Restaurar um backup em que faltam alguns dos arquivos de anexo que ele referencia é recusado enquanto o armazenamento S3 estiver ativado, porque uma restauração completa substitui o conteúdo do bucket e os arquivos ausentes seriam perdidos. Há duas formas de restaurar um backup assim:

- **A mais simples**: desligue a opção "Armazenar anexos no S3" (mantendo as credenciais), restaure o backup e ligue a opção novamente. Uma restauração em modo local nunca mexe no bucket, e os anexos que ainda estão armazenados lá continuam sendo servidos. Esse também é o caminho certo em um servidor novo com o bucket intacto, já que a exportação de anexos da outra opção precisa de uma instância que ainda conheça as notas.
- **Reconstruir um arquivo completo**:
  1. Baixe a **Exportação de anexos** na janela de Backup: ela contém todos os anexos da sua conta em uma pasta `files/`.
  2. Descompacte o backup, copie os arquivos de `files/` para a pasta `attachments/` do backup e compacte-o novamente. Cuidado ao recompactar: selecione o conteúdo do backup (`database/`, `entries/`, `attachments/`, ...) e compacte essa seleção, não a pasta que o contém. As pastas precisam ficar na raiz do zip; caso contrário, a restauração informa que `database/poznote_backup.sql` está faltando.
  3. Restaure o zip reconstruído normalmente.

> A Sincronização Git ignora os anexos enquanto o armazenamento S3 estiver ativado.

</details>

## Backups S3

Os administradores podem enviar arquivos de backup completos (um ZIP por usuário, idêntico ao download do Backup Completo) para um bucket compatível com S3, manualmente ou automaticamente de acordo com uma programação. A configuração é independente da do Armazenamento de anexos no S3, então os backups podem ir para outro bucket ou provedor.

<details>
<summary><strong>Como configurar os backups S3</strong></summary>
<br>

Configure isso em **Configurações > Backups S3** (somente administradores).

- **Chave geral**: uma opção no topo da página ativa ou desativa o recurso inteiro. Quando desativado, os backups automáticos param e as seções de backup e restauração S3 somem para todos os usuários (as ações de autoatendimento também são recusadas no servidor).
- **Configuração**: URL do endpoint, região, bucket, chave de acesso, chave secreta e endereçamento path-style, com um teste de conexão integrado.
- **Seleção de usuários**: caixas de seleção definem quais usuários são cobertos pelos backups. Todos vêm marcados por padrão e, enquanto todos estiverem marcados, as novas contas são incluídas automaticamente.
- **Backups manuais**: um botão "Fazer backup agora" envia um arquivo novo para cada usuário selecionado, um usuário por vez, com o progresso de cada um. Ele funciona assim que a conexão estiver configurada, mesmo com os backups automáticos desligados.
- **Backups automáticos**: quando ativados, um processo em segundo plano faz o backup dos usuários selecionados na frequência escolhida (diária, semanal ou mensal). A primeira execução acontece poucos minutos após a ativação, e as seguintes depois do intervalo escolhido.
- **Retenção**: apenas os N arquivos mais recentes são mantidos por usuário; os mais antigos são excluídos do bucket após cada backup (0 mantém tudo).
- **Navegação**: a página lista os arquivos que estão no bucket no momento, com ações de download e exclusão.
- **Restauração**: os arquivos ficam em `backups/{user id}/` no bucket e podem ser restaurados pela página padrão de [Restaurar / Importar](#restaurar--importar).
- **Autoatendimento**: depois que o bucket é configurado, cada usuário ganha uma seção "Backups S3" na página Backup / Exportar para enviar um arquivo novo da própria conta e para baixar ou excluir os arquivos existentes. Uma seção "Restaurar do S3" na página Restaurar / Importar restaura a conta diretamente a partir de um desses arquivos.
- **Isolamento de contas**: duas opções ("Backups S3 na página de backup" e "Restauração S3 na página de restauração") desativam essas seções de autoatendimento para usuários que não são administradores. Elas são aplicadas no servidor, então as ações bloqueadas são recusadas mesmo quando chamadas diretamente.

Quando os anexos estão armazenados no S3 (Armazenamento de anexos no S3), eles são incluídos nos arquivos por padrão, buscados no bucket na hora. Uma opção permite deixá-los de fora dos backups para arquivos mais leves e execuções mais rápidas.

</details>

## Backup / Exportar

O Poznote inclui funções integradas de Backup / Exportar, acessíveis pelas Configurações.

<a id="complete-backup"></a>
<details>
<summary><strong>Backup completo em zip do Poznote</strong></summary>
<br>

Um único ZIP com o banco de dados, todas as notas e os anexos de todos os espaços de trabalho:

  - Inclui um `index.html` na raiz para navegação offline
  - As notas são organizadas por espaço de trabalho e pasta
  - Os anexos ficam acessíveis por links clicáveis

O arquivo é montado em segundo plano por um processo de trabalho, e não durante a requisição que o inicia, então uma conta grande não esbarra no tempo limite do navegador ou de um proxy reverso. A página acompanha o progresso da tarefa, e o download começa sozinho quando o arquivo fica pronto. Você pode sair da página e voltar depois, a preparação continua. Um arquivo preparado fica disponível por 24 horas, e um botão permite excluí-lo na hora.

#### Backups por usuário e backups completos

O Poznote oferece opções de backup flexíveis:

**Pela interface web (Configurações > Backup / Exportar):**
- **Todos os usuários** podem fazer backup e restaurar o próprio perfil
- **Administradores** podem escolher de qual perfil de usuário fazer backup ou restauração
- Os backups contêm o banco de dados, as notas e os anexos do usuário

**Pela API/script (somente administradores):**
- Backups automatizados com o script `backup-poznote.sh`
- Acesso programático pela API REST v1
- Exige credenciais de administrador

**Abrangência dos backups:**

1. **Backups por usuário**: criados nas Configurações ou pela API. Contêm *apenas* os dados de um usuário específico (banco de dados, notas e anexos dele).
2. **Backup completo do sistema**: criado manualmente fazendo o backup de todo o diretório `/data`. É a única forma de fazer backup da configuração mestre e dos dados de todos os usuários de uma só vez.

```bash
# Backup completo do sistema pela linha de comando
tar -czvf poznote-full-backup.tar.gz data/
```

</details>

<a id="export-individual-notes"></a>
<details>
<summary><strong>Exportar notas individuais</strong></summary>
<br>

Exporte notas individuais com o botão **Exportar** da barra de ferramentas da nota:

  - **Notas HTML:** exportação para HTML, ou para um único arquivo HTML com as imagens incorporadas
  - **Notas Markdown:** exportação para Markdown, para HTML, ou para um único arquivo HTML com as imagens incorporadas
  - **Listas de tarefas:** as mesmas opções, além de uma exportação JSON bruta da lista

</details>

<a id="automated-backups-with-bash-script"></a>
<details>
<summary><strong>Backups automatizados com script Bash</strong></summary>
<br>

Para backups automatizados e programados pela API, você pode usar o script incluído `backup-poznote.sh`.

**IMPORTANTE:** apenas administradores podem criar backups pela API.
Use a senha atual do perfil de administrador com o qual você se autentica. Em uma instalação nova, essa é a senha padrão do administrador (`admin`) até ser alterada no Poznote. Depois que uma senha personalizada é definida, é ela que as chamadas de API exigem.

**Local do script:** `backup-poznote.sh` na pasta `tools` do repositório do Poznote

**Uso por administradores:**

Os administradores podem fazer backup de qualquer perfil de usuário, **sem precisar saber os IDs de usuário**, apenas o nome de usuário:

```bash
# Fazer backup do seu próprio perfil
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'admin' '/backups' '30'

# Fazer backup do perfil de outro usuário (Nina)
bash backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/backups' '30'
```

**Uso:**
```bash
bash backup-poznote.sh '<poznote_url>' '<admin_username>' '<admin_password>' '<target_username>' '<backup_directory>' '<retention_count>'
```

**Exemplo com crontab (administrador fazendo backup da Nina):**

```bash
# Adicionar ao crontab para backups automatizados duas vezes por dia
0 0,12 * * * bash /root/backup-poznote.sh 'https://poznote.example.com' 'admin' 'admin_password' 'Nina' '/root/backups' '30'
```

**Parâmetros explicados:**
- `'https://poznote.example.com'`: URL da sua instância do Poznote
- `'admin'`: nome de usuário do administrador para autenticação (precisa ser administrador)
- `'admin_password'`: senha atual do administrador para o perfil da API (padrão `admin` até ser alterada, depois a senha personalizada)
- `'Nina'`: nome de usuário de quem será feito o backup
- `'/root/backups'`: diretório pai onde os backups serão armazenados (cria a pasta `backups-poznote-<username>`)
- `'30'`: número de backups a manter (os mais antigos são excluídos automaticamente)

**Como funciona o processo de backup:**

1. O script se autentica com as credenciais de administrador
2. Busca automaticamente o ID do usuário a partir do nome de usuário
3. Cria um backup pela API
4. Chama a API REST v1 do Poznote (`POST /api/v1/backups` com o cabeçalho `X-User-ID`)
5. Baixa o ZIP do backup localmente em `backups-poznote-<username>/`
6. Gerencia a retenção automaticamente (mantém apenas o número especificado de backups recentes)

**Observação:** os backups de cada usuário ficam em pastas separadas (`backups-poznote-Nina`, `backups-poznote-Tim` etc.)

</details>


## Restaurar / Importar

O Poznote oferece opções de restauração flexíveis pela interface web (**Configurações > Restaurar / Importar**) ou, para administradores, de forma programática pela API REST. Os usuários podem restaurar os dados do próprio perfil a partir de um backup ZIP completo ou importar arquivos individuais, enquanto os administradores podem gerenciar restaurações em todo o sistema.

<a id="complete-restore"></a>
<details>
<summary><strong>Restauração completa a partir de um backup zip do Poznote</strong></summary>
<br>

Envie o ZIP do backup completo para restaurar tudo:

  - Substitui o banco de dados e restaura todas as notas e anexos
  - Funciona para todos os espaços de trabalho de uma vez

Não há limite de tamanho na prática. O arquivo é enviado em partes (uma parte que falha é reenviada, em vez de perder o envio inteiro), remontado no servidor e depois extraído e restaurado por um processo em segundo plano, de modo que nem o navegador nem um proxy reverso na frente da instância conseguem interromper a restauração por tempo limite. Uma barra de progresso cobre todo o processo: envio, extração, banco de dados, notas e, por fim, anexos. Ao terminar a restauração, o Poznote pergunta qual espaço de trabalho você quer abrir.

A restauração a partir de um bucket S3 (veja [Backups S3](#backups-s3)) é executada pela mesma tarefa em segundo plano, então buscar um arquivo grande no bucket e restaurá-lo também não depende de uma requisição continuar ativa.

Se o envio não for possível de forma alguma, a página Restaurar / Importar também oferece uma alternativa por cópia direta: copie o arquivo para dentro do contêiner do Poznote exatamente em `/tmp/backup_restore.zip` via SSH, recarregue a página e restaure a partir dali.

</details>

<a id="import-individual-notes"></a>
<details>
<summary><strong>Importar arquivos individuais</strong></summary>
<br>

Importe diretamente uma ou mais notas HTML, Markdown ou de texto:

  - Aceita os tipos de arquivo `.html`, `.md`, `.markdown`, `.txt` e `.json`
  - Até 50 arquivos podem ser selecionados de uma vez, valor configurável em Configurações > Ferramentas de administração > Limites de importação

</details>

<a id="import-zip-notes"></a>
<details>
<summary><strong>Importar arquivo ZIP</strong></summary>
<br>

Importe um arquivo ZIP contendo várias notas:

  - Aceita os tipos de arquivo `.html`, `.md`, `.markdown` ou `.txt`
  - Os arquivos ZIP podem conter até 300 arquivos, valor configurável em Configurações > Ferramentas de administração > Limites de importação
  - Ao importar um arquivo ZIP, o Poznote detecta e recria automaticamente a estrutura de pastas

Não há limite de tamanho na prática para o arquivo. Assim como na restauração completa, ele é enviado em partes (uma parte que falha é reenviada, em vez de perder o envio inteiro), remontado no servidor e depois processado por um processo em segundo plano, de modo que nem o navegador nem um proxy reverso na frente da instância conseguem interromper a importação por tempo limite. Uma barra de progresso cobre todo o processo: envio, imagens e anexos e, por fim, notas.

</details>

<a id="import-obsidian-notes"></a>
<details>
<summary><strong>Importar notas do Obsidian</strong></summary>
<br>

Importe um arquivo ZIP contendo várias notas do Obsidian:

  - Os arquivos ZIP podem conter até 300 arquivos, valor configurável em Configurações > Ferramentas de administração > Limites de importação
  - O Poznote detecta e recria automaticamente a estrutura de pastas
  - O Poznote detecta automaticamente as tags existentes a criar
  - O Poznote importa automaticamente as imagens se elas estiverem na raiz do arquivo zip

</details>

<details>
<summary><strong>Suporte a front matter em Markdown</strong></summary>
<br>

Os arquivos Markdown podem incluir front matter YAML para definir os metadados da nota. As seguintes chaves são aceitas:

  - `title`: substitui o título da nota (padrão: nome do arquivo sem a extensão)
  - `folder`: substitui a pasta de destino. Um nome simples precisa corresponder a uma pasta que já existe no espaço de trabalho; um caminho como `Projects/2026` cria as pastas necessárias.
  - `tags`: array de tags a aplicar à nota. Aceita tanto a sintaxe inline `[tag1, tag2]` quanto a de várias linhas
  - `favorite`: marca a nota como favorita (`true` ou `false`)
  - `created`: define uma data de criação personalizada (formato: `YYYY-MM-DD HH:MM:SS`)
  - `updated`: define uma data de atualização personalizada (formato: `YYYY-MM-DD HH:MM:SS`)

Exemplo com a sintaxe de array inline:
```yaml
---
title: My Important Note
folder: Projects
tags: [important, work]
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

Exemplo com a sintaxe de várias linhas:
```yaml
---
title: My Important Note
folder: Projects
tags:
  - important
  - work
favorite: true
created: 2024-01-15 10:30:00
updated: 2024-01-20 15:45:00
---
```

</details>


## Visualização offline

O **📦 Backup Completo** cria uma versão offline e independente das suas notas. Basta extrair o ZIP e abrir o `index.html` em qualquer navegador. Assim você pode ler suas notas offline, mas sem todas as funcionalidades do Poznote: é uma exportação somente leitura.

## Várias instâncias

> Não confundir com o recurso [Multiusuário](#multiusuário).

Você pode executar várias instâncias isoladas do Poznote no mesmo servidor. Cada instância tem os próprios dados, porta e credenciais.

Ideal para:
- Hospedar diferentes usuários no mesmo servidor, cada um com a própria instância e conta separadas
- Testar novos recursos sem afetar sua instância de produção

Basta repetir os passos de instalação em diretórios diferentes, com portas diferentes.

### Exemplo: instâncias de Tom e Alice no mesmo servidor

```
Server: my-server.com
├── Poznote-Tom
│   ├── Port: 8040
│   ├── URL: http://my-server.com:8040
│   ├── Container: poznote-tom-webserver-1
│   └── Data: ./poznote-tom/data/
│
└── Poznote-Alice
  ├── Port: YOUR_POZNOTE_API_PORT
  ├── URL: http://my-server.com:YOUR_POZNOTE_API_PORT
    ├── Container: poznote-alice-webserver-1
    └── Data: ./poznote-alice/data/
```

## Assistente IA

O Poznote inclui um chat de IA integrado que se conecta a uma instância local do [Ollama](https://ollama.com) ou do [LM Studio](https://lmstudio.ai), a um provedor em nuvem como a [Anthropic (Claude)](https://www.anthropic.com) ou a OpenAI, ou a qualquer servidor compatível com OpenAI. Ele pesquisa e lê suas notas para responder perguntas e, quando você pede, cria, reescreve e organiza as notas, dentro do espaço de trabalho em que você abriu o chat.

Um administrador o ativa em **Configurações → Ferramentas de administração → Assistente IA**, e cada perfil passa então a ter um botão **Assistente IA** na barra de ícones à esquerda. O servidor de IA é chamado pelo servidor do Poznote, nunca pelo seu navegador, então com uma instância local do Ollama suas notas nunca saem da sua máquina.

O que o assistente sabe fazer, a escolha de um provedor e de um modelo, as chaves de API pessoais e a conexão de um servidor local a partir do contêiner do Poznote estão descritos na [documentação do Assistente IA](docs/AI-ASSISTANT.pt.md). Para deixar um assistente de IA externo (VS Code Copilot, Claude CLI...) gerenciar suas notas, veja o [Servidor MCP](#servidor-mcp) abaixo.

## Transcrição (fala para texto)

Transforme voz em texto de nota com um servidor de fala para texto que você mesmo executa. O Poznote não embute nenhum modelo de fala: ele se comunica com qualquer servidor que exponha a API de áudio da OpenAI (`POST /v1/audio/transcriptions`), como um Whisper auto-hospedado, então o áudio nunca precisa sair da sua máquina.

Depois que um administrador ativa o recurso em **Configurações → Ferramentas de administração → Transcrição**, você ganha **Ditar** em **Inserir** no menu de barra (slash), e um botão **Transcrever** nos anexos de áudio.

A configuração de um servidor, a escolha do modelo e todo o resto estão na [documentação da Transcrição](docs/TRANSCRIPTION.pt.md).

## Servidor MCP

O Poznote inclui um servidor Model Context Protocol (MCP) que permite a assistentes de IA como o GitHub Copilot ou o Claude CLI interagir com suas notas em linguagem natural. Por exemplo:

- "Crie uma nova nota com o título 'Meeting Notes' e o conteúdo..."
- "Pesquise notas sobre 'Docker'"
- "Liste todas as notas do meu espaço de trabalho do Poznote"
- "Atualize a nota 42 com novas informações"

O servidor MCP vem com o `docker-compose.yml` oficial e é publicado apenas em `127.0.0.1`, então, por padrão, nada fora da sua máquina consegue acessá-lo. A instalação, a configuração dos clientes, as substituições de porta e de depuração, e como protegê-lo com `POZNOTE_MCP_AUTH_TOKEN` quando você o expõe mais estão descritos na [documentação do Servidor MCP](docs/MCP-SERVER.pt.md).

## Extensão do Chrome

O **Poznote URL Saver** é uma extensão de navegador que salva com um único clique a URL, ou até uma captura de tela da página inteira, da página atual na sua instância do Poznote. Instale-a pela Chrome Web Store: [Instalar a extensão](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

A extensão se conecta à sua instância com o seu nome de usuário e uma [senha de aplicativo](#senhas-de-aplicativo). Os passos de configuração estão na [documentação da extensão do Chrome](docs/CHROME-EXTENSION.pt.md).

## Compartilhar com o Poznote no Android

No Android, o Poznote aparece no menu **Compartilhar** do sistema depois que o PWA é instalado. Compartilhe uma página do Chrome (ou um link/texto de qualquer aplicativo), escolha o Poznote, e uma nova nota é criada com o título da página e um link clicável, sem precisar de extensão.

Para usar:

1. Abra sua instância do Poznote no Chrome para Android e instale-a como aplicativo (menu → **Adicionar à tela inicial** → **Instalar**).
2. Em qualquer aplicativo, toque em **Compartilhar** e escolha **Poznote**.

> Se o Poznote não aparecer no menu de compartilhamento logo de cara, verifique se o aplicativo está instalado (e não apenas salvo como favorito). Se você instalou o PWA antes do lançamento deste recurso, o Chrome reconhece a nova capacidade automaticamente depois de alguns dias, ou imediatamente se você reinstalar o aplicativo.

## Documentação da API

O Poznote oferece uma API RESTful v1 abrangente para acesso programático a notas, pastas, espaços de trabalho, tags, anexos, backups, configurações e muito mais.

Para a referência completa da API, com todos os endpoints, parâmetros e exemplos com curl, consulte a **[Documentação da API REST](docs/API-REST.md)**.

### Início rápido

```bash
# Listar todas as notas do usuário com ID 1
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes

# O mesmo, com uma senha de aplicativo criada em Configurações > Senhas de aplicativo
# (funciona em instâncias apenas SSO; o X-User-ID fica implícito)
curl -u 'username:pzn_2f7c…' http://YOUR_SERVER/api/v1/notes

# Criar uma nota
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "content": "Hello!", "type": "markdown"}' \
  http://YOUR_SERVER/api/v1/notes
```

### Documentação interativa (Swagger)

Acesse a **Swagger UI** diretamente no Poznote em `Settings > About > API REST` para navegar por todos os endpoints, ver os esquemas de requisição/resposta e testar chamadas à API de forma interativa.

## Tecnologias

O Poznote prioriza a simplicidade e a portabilidade: nada de frameworks complexos, nada de dependências pesadas. Apenas tecnologias web diretas e confiáveis, que garantem que suas notas continuem acessíveis e sob o seu controle.

**Arquitetura com privacidade em primeiro lugar:** o Poznote funciona inteiramente de forma local, sem precisar de conexões externas para operar. Todas as bibliotecas (Excalidraw, Mermaid, KaTeX) vêm empacotadas e são servidas pela sua própria instância. Na configuração padrão, a única conexão de saída é uma verificação diária de atualizações; os recursos opcionais que você mesmo ativa (Sincronização Git, S3, um provedor de IA, webhooks, SMTP, OIDC) são as únicas outras.

<details>
<summary>Se tiver interesse nas tecnologias sobre as quais o Poznote é construído, <strong>dê uma olhada aqui.</strong></summary>

### Backend
- **PHP 8.x**: linguagem de script do lado do servidor
- **SQLite 3**: banco de dados relacional leve, baseado em arquivo

### Frontend
- **HTML5**: marcação e estrutura
- **CSS3**: estilos e design responsivo
- **JavaScript (Vanilla)**: recursos interativos e conteúdo dinâmico
- **React + Vite**: cadeia de build do componente Excalidraw (empacotado como IIFE)
- **AJAX**: carregamento assíncrono de dados

### Bibliotecas
- **CodeMirror 6**: editor de código e texto extensível para a experiência de edição em Markdown
- **Excalidraw**: quadro branco virtual para esboçar diagramas e desenhos
- **Mermaid**: biblioteca JavaScript do lado do cliente para gerar diagramas e fluxogramas a partir de texto
- **KaTeX**: biblioteca JavaScript do lado do cliente para composição tipográfica rápida e renderização de equações matemáticas
- **Sortable.js**: biblioteca JavaScript para ordenação por arrastar e soltar
- **highlight.js**: realce de sintaxe para blocos de código
- **Swagger UI**: interface interativa de documentação e teste da API

### Armazenamento
- **Arquivos HTML/Markdown**: as notas são armazenadas como arquivos HTML ou Markdown simples no sistema de arquivos
- **Banco de dados SQLite**: metadados, tags, relacionamentos e dados de usuário
- **Anexos**: armazenados no sistema de arquivos local ou, opcionalmente, em um armazenamento de objetos compatível com S3

### Infraestrutura
- **Nginx + PHP-FPM**: servidor web de alto desempenho com o FastCGI Process Manager
- **Alpine Linux**: imagem base segura e leve
- **Docker**: conteinerização para implantação fácil e portabilidade
- **Python 3.12 (Alpine)**: ambiente de execução do servidor MCP com as bibliotecas httpx, uvicorn e fastmcp para integração com assistentes de IA
</details>
