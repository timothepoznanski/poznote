<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a> ·
  <a href="MCP-SERVER.ko.md">한국어</a> ·
  <a href="MCP-SERVER.ja.md">日本語</a> ·
  <a href="MCP-SERVER.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Servidor MCP do Poznote

Servidor MCP (Model Context Protocol) para o Poznote: permite gerenciar notas com IA usando linguagem natural.

Este servidor suporta **somente o transporte HTTP** (MCP Streamable HTTP).

> [!TIP]
> Procura um chat com um modelo local (por exemplo o Ollama) diretamente dentro do Poznote? Para isso você não precisa do servidor MCP: use o [Assistente IA](AI-ASSISTANT.pt.md) integrado (**Configurações → Ferramentas de administração → Assistente IA**). O servidor MCP serve para conectar assistentes *externos* compatíveis com MCP às suas notas; o Ollama sozinho é um runtime de modelos, não um cliente MCP, e não consegue se conectar a ele diretamente.

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

## Início rápido

Escolha o seu assistente de IA preferido:

- **[VS Code Copilot](VSCODE-COPILOT.pt.md):** Integre o Poznote ao seu editor
- **[Claude CLI](CLAUDE-CLI.pt.md):** Use o Poznote pela linha de comando

---

## Como funciona

O servidor MCP funciona como uma ponte entre os assistentes de IA e a sua instância do Poznote.

### Componentes

- **`server.py`**: servidor MCP (HTTP / Streamable HTTP)
  - Expõe o endpoint MCP em `http://127.0.0.1:8045/mcp`
  - Define as ferramentas (ações) de gerenciamento de notas
  - Orquestra as chamadas entre a IA e a API do Poznote

- **`client.py`**: cliente HTTP da API REST do Poznote
  - Executa as requisições HTTP (GET, POST, PATCH, DELETE)
  - Cuida da autenticação na API do Poznote com o token de serviço MCP compartilhado

### Fluxo de comunicação

1. O assistente de IA (VS Code Copilot ou Claude CLI) se conecta ao servidor MCP
2. O servidor MCP chama a API REST do Poznote
3. Os resultados são devolvidos ao assistente de IA

Uma aba do Poznote aberta no navegador recebe as alterações feitas via MCP em poucos segundos: a árvore da barra lateral e a nota aberta são atualizadas no lugar (ou mostram um banner de recarregamento quando a nota tem edições não salvas). Uma nota que está simplesmente aberta no navegador não bloqueia as gravações via MCP; só uma nota que está sendo editada por outro usuário da mesma conta, ou por um visitante em um link de compartilhamento público, responde com um erro HTTP 423.

## Funcionalidades

### Ferramentas (ações)
- `get_note`: obtém uma nota específica pelo ID, com o conteúdo completo
- `list_notes`: lista as notas de um espaço de trabalho, uma página por vez (`limit`/`offset`, com o `total` real do espaço de trabalho no resultado)
- `search_notes`: pesquisa notas por texto, com um intervalo opcional de datas de criação
- `create_note`: cria uma nova nota, opcionalmente a partir de um modelo e/ou com prazo/lembrete
- `update_note`: atualiza uma nota existente, move a nota e/ou define o prazo/lembrete dela
- `delete_note`: exclui uma nota pelo ID
- `get_reminder`: obtém o lembrete atualmente definido em uma nota
- `set_reminder`: define ou substitui o lembrete de uma nota, com um intervalo de repetição opcional
- `remove_reminder`: remove o lembrete de uma nota
- `list_reminders`: lista as notificações de lembrete que já dispararam e continuam pendentes (o fluxo do sino da interface); lembretes futuros não podem ser listados
- `list_tasks`: lista as tarefas de uma nota do tipo lista de tarefas, com seus IDs, prazos e marcadores
- `list_all_tasks`: lista as tarefas pendentes de todas as notas de um espaço de trabalho, as mais urgentes primeiro, com filtros (prazo, importância, tarefas concluídas, caixas de seleção dentro das notas)
- `add_task`: adiciona uma única tarefa a uma nota do tipo lista de tarefas, com prazo e lembrete opcionais
- `update_task`: atualiza uma tarefa (texto, prazo, lembrete, marcador de importante)
- `complete_task`: marca uma tarefa como concluída ou a reabre
- `delete_task`: exclui uma tarefa de uma nota do tipo lista de tarefas
- `add_subtask`: adiciona uma subtarefa a uma tarefa de uma nota do tipo lista de tarefas
- `update_subtask`: renomeia uma subtarefa, ou a marca como concluída ou pendente
- `delete_subtask`: exclui uma subtarefa de uma tarefa
- `create_folder`: cria uma pasta, pelo nome ou pelo caminho (`folder_path="Projects/2026/Q3"` cria a cadeia inteira em uma só chamada), ou uma raiz de diário com `is_diary=true`
- `list_folders`: lista todas as pastas de um espaço de trabalho, com seus caminhos e marcadores de diário
- `list_workspaces`: lista todos os espaços de trabalho disponíveis
- `list_tags`: lista todas as tags distintas usadas nas notas
- `list_templates`: lista as notas modelo que podem servir de ponto de partida para o `from_template_id` de `create_note`
- `get_trash`: lista todas as notas que estão na lixeira
- `empty_trash`: exclui definitivamente todas as notas da lixeira
- `delete_trash_note`: exclui definitivamente uma única nota da lixeira, em vez de esvaziar a lixeira inteira
- `restore_note`: restaura uma nota da lixeira
- `list_snapshots`: lista as versões anteriores salvas de uma nota, incluindo o instantâneo de segurança feito antes de cada reescrita pela IA ou pelo MCP
- `get_snapshot`: lê o conteúdo de uma versão anterior de uma nota, sem alterar a nota
- `restore_snapshot`: restaura uma nota ao estado de um de seus instantâneos (um `snapshot_key` ou uma `date` é obrigatório)
- `duplicate_note`: cria uma cópia de uma nota existente
- `toggle_favorite`: alterna o status de favorito de uma nota
- `list_attachments`: lista todos os anexos de uma nota específica
- `add_attachment`: anexa um arquivo a uma nota a partir do conteúdo em base64 (imagem, log, PDF, …)
- `move_note`: move uma nota para outro espaço de trabalho e/ou outra pasta, mantendo o id dela
- `move_folder`: move uma pasta (com suas subpastas e notas) para outra pasta pai e/ou outro espaço de trabalho
- `move_note_to_folder`: move uma nota para uma pasta específica
- `remove_note_from_folder`: remove uma nota da pasta atual (move a nota para a raiz)
- `share_note`: ativa o compartilhamento público de uma nota e obtém a URL pública
- `unshare_note`: desativa o compartilhamento público de uma nota
- `get_note_share_status`: obtém o status atual de compartilhamento e a URL pública de uma nota
- `get_folder_share_status`: obtém o status atual de compartilhamento e a URL pública de uma pasta
- `list_shared`: lista todas as notas e pastas compartilhadas publicamente
- `list_shared_with_me`: lista as notas e pastas que outros usuários compartilharam com este perfil
- `get_backlinks`: obtém todas as notas que apontam para (fazem referência a) uma nota específica
- `convert_note`: converte uma nota entre os formatos HTML e Markdown
- `rename_folder`: renomeia uma pasta existente
- `delete_folder`: exclui uma pasta e move as notas dela para a lixeira
- `create_workspace`: cria um novo espaço de trabalho
- `rename_workspace`: renomeia um espaço de trabalho existente
- `delete_workspace`: exclui um espaço de trabalho (não é possível excluir o último)
- `get_git_sync_status`: obtém o status atual da sincronização Git (GitHub/GitLab/Forgejo)
- `git_push`: força o envio das notas locais para o repositório Git configurado
- `git_pull`: força o recebimento das notas do repositório Git configurado
- `get_system_info`: obtém informações de versão da instalação do Poznote
- `list_backups`: lista todos os backups do sistema disponíveis
- `create_backup`: dispara a criação de um novo backup do sistema
- `restore_backup`: restaura um arquivo de backup (substitui os dados atuais do usuário)
- `delete_backup`: exclui um arquivo de backup específico
- `get_app_setting`: obtém o valor de uma configuração específica do aplicativo
- `update_app_setting`: atualiza o valor de uma configuração específica do aplicativo

**Para qual espaço de trabalho vai uma chamada.** Sempre informe o `workspace` em `create_note`, `create_folder` e `list_folders` (as pastas sempre pertencem a um espaço de trabalho): é a única forma de ter certeza. Quando ele é omitido, o servidor o determina em uma ordem fixa e nunca tenta adivinhar: primeiro a configuração `mcp_default_workspace`, quando ela indica um espaço de trabalho que existe, depois o único espaço de trabalho da conta, quando ela tem apenas um. Com vários espaços de trabalho e sem essa configuração, a chamada é recusada e a resposta lista os espaços de trabalho, em vez de colocar a nota no que por acaso aparece primeiro na ordenação (o que antes mudava sozinho, por exemplo na primeira vez que arquivar uma nota criava "Archives"). Defina o padrão com `update_app_setting("mcp_default_workspace", "<name>")`.

**Anexos.** `add_attachment(note_id, filename, content_base64)` armazena um arquivo em uma nota exatamente como faz um arrastar e soltar na interface web, de modo que um gráfico gerado ou um arquivo de log pode ser anexado sem intervenção humana; uma URI `data:` é aceita como conteúdo. As regras do próprio Poznote continuam valendo, então um tipo executável ou uma cota de armazenamento cheia voltam como uma recusa acompanhada do motivo. Os bytes trafegam codificados em base64 dentro da chamada da ferramenta, por isso a ferramenta limita um upload a 25 MB e indica a interface web para qualquer arquivo maior.

**Mover itens.** `move_note` e `move_folder` movem, não copiam: ids, conteúdo, histórico e os links que apontam para uma nota são todos preservados. Em `update_note`, `workspace` indica onde *procurar a nota*; o argumento que a move é `target_workspace`. Uma nota que muda de espaço de trabalho sem receber uma pasta do destino vai para a raiz desse espaço de trabalho, já que a pasta antiga dela pertence ao espaço de trabalho que ela deixou. Uma pasta leva junto suas subpastas e todas as notas que elas contêm.

**Pastas.** Toda ferramenta que recebe uma pasta aceita a mesma coisa: um nome ou um caminho separado por barras. `create_note(folder="Diary/2026/08")` cria os níveis que faltam pelo caminho; `create_folder(folder_path=…)` faz o mesmo para uma pasta; `list_notes(folder_id=…)` restringe uma listagem a uma pasta no lado do servidor, de modo que o `total` conta só essa pasta. Um nome simples alcança uma pasta existente em qualquer profundidade quando só uma pasta do espaço de trabalho tem esse nome, em vez de criar uma segunda na raiz; quando várias têm, a chamada é recusada e as lista, então passe o caminho completo ou o id.

**Diários.** Um diário não é só uma pasta chamada Diário: é uma pasta raiz com o marcador `is_diary`, e o botão "Nova entrada de diário" da interface coloca as notas datadas nessa raiz marcada. Crie um com `create_folder(folder_name="Journal", is_diary=true)`; `list_folders` informa quais pastas são diários. Passar um nome que uma pasta raiz já tem transforma essa pasta em diário e mantém as notas dela. As entradas de diário em si são notas comuns: coloque-as no lugar certo com `create_note(folder="Journal/2026/09")`.

**Modelos.** Um modelo é uma nota comum guardada em uma pasta chamada `Templates` (qualquer nível abaixo dela conta) ou em qualquer lugar de um espaço de trabalho com esse nome; a palavra é reconhecida em todos os idiomas incluídos, então uma pasta `Modèles` também funciona. `list_templates` retorna os modelos com seus ids, e `create_note(from_template_id=…)` cria uma nova nota a partir de um deles, no formato do próprio modelo; peça `note_type="markdown"` e um modelo HTML é convertido, do mesmo jeito que o comando `/template` o converte no editor. Um modelo não pode dar origem a uma lista de tarefas nem a um desenho. Passar também `content` acrescenta esse conteúdo depois do corpo do modelo.

**Lembretes e tarefas.** `reminder_at` (em `create_note`/`update_note` e `set_reminder`) é uma data e hora ISO, como `2026-09-01T09:00:00+02:00`; inclua um offset, senão o horário é interpretado como UTC. Os prazos das tarefas (`due_at`) são diferentes: são valores de horário local, `YYYY-MM-DD` ou `YYYY-MM-DDTHH:MM` sem offset, interpretados no fuso horário configurado pelo usuário, e uma data sem hora gera o lembrete às 09:00. Os intervalos de repetição usam `<count><unit>`, com a unidade `i`/`h`/`d`/`w`/`m`/`y`, por exemplo `30i`, `1d` ou `2w`.

As ferramentas de tarefas tratam de uma tarefa por vez: chame `list_tasks` para obter os IDs das tarefas e depois `add_task`, `update_task`, `complete_task` ou `delete_task`. Cada chamada leva apenas aquela tarefa, então um cliente nunca lê uma lista de tarefas para devolver um array inteiro novo, e dois chamadores editando tarefas diferentes não conseguem sobrescrever o trabalho um do outro. O Poznote armazena as tarefas de uma nota como um único array JSON, que o servidor reescreve a cada chamada, então o trabalho feito por uma chamada ainda cresce com o tamanho da lista. As notificações ficam sincronizadas automaticamente, e concluir ou excluir uma tarefa cancela o lembrete pendente dela. Uma tarefa pode ter subtarefas, em um único nível: `list_tasks` as devolve no array `subtasks` da tarefa com seus próprios IDs, e `add_subtask`, `update_subtask` e `delete_subtask` alteram uma por vez. Uma subtarefa tem apenas um texto e um estado de concluída ou pendente, e marcá-la nunca conclui a tarefa a que pertence.

**Histórico de versões e desfazer.** O Poznote faz um instantâneo de segurança de uma nota logo antes de o assistente de IA ou o servidor MCP reescrevê-la, de modo que um `update_note` infeliz pode ser desfeito. `list_snapshots` mostra os instantâneos guardados de uma nota, cada um com um `origin` que identifica essas cópias de segurança (`ai` ou `mcp`); `get_snapshot` lê um deles sem tocar na nota, e `restore_snapshot` recoloca o conteúdo. `restore_snapshot` sobrescreve o conteúdo atual, por isso exige um `snapshot_key` ou uma `date` em vez de recorrer ao instantâneo do dia. Ele não salva esse conteúdo antes: o que ele substitui se perde, a menos que um instantâneo já o contenha. A interface do Poznote chama os instantâneos de revisões: eles são consultados e comparados na página **Revisões** da nota, então um pedido sobre revisões ou histórico de versões corresponde a essas ferramentas.

**Visões transversais.** `list_all_tasks` responde ao que ainda falta fazer em todo um espaço de trabalho, enquanto `list_tasks` cobre apenas uma nota. Ele devolve dois tipos de item, distinguidos por `source`: tarefas de uma nota do tipo lista de tarefas, cujos IDs funcionam com `update_task` e `delete_task`, e caixas de seleção escritas dentro de notas comuns, cujo ID é apenas uma posição na nota e não pode ser usado assim. `list_reminders` devolve as notificações já disparadas e não descartadas, limitadas a 50 pela API. Não é uma visão do que está por vir: o Poznote não tem nenhum endpoint para lembretes futuros, que são lidos nota a nota com `get_reminder`.

A maioria das ferramentas aceita um argumento opcional `user_id` para direcionar a chamada a um perfil de usuário específico. Quando ele é informado, o servidor MCP envia o cabeçalho `X-User-ID` nessa requisição, o que permite criar ou ler notas em perfis diferentes sem alterar o ambiente MCP global. As exceções são as ferramentas de nível de sistema `get_system_info`, `list_backups`, `create_backup` e `delete_backup`, que não aceitam `user_id`. Para mudar o perfil padrão usado quando nenhum `user_id` é passado, veja [Perfil de usuário padrão](#perfil-de-usuário-padrão).

---

## Instalação do servidor

O servidor MCP está incluído no `docker-compose.yml` oficial do Poznote e é executado automaticamente.

### Configuração

O servidor MCP usa os valores padrão do `docker-compose.yml`:

```bash
# A porta do servidor MCP é 8045 por padrão
# O log de depuração é false por padrão
```

O Poznote gera automaticamente o token de serviço MCP em `data/.mcp_token`. O contêiner `mcp-server` lê esse arquivo pelo volume compartilhado `./data:/var/www/html/data:ro`, então não há senha para guardar no `.env`.

Para sobrescrever a porta e o modo de depuração em uma inicialização, recrie o contêiner MCP com variáveis de ambiente inline:

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Um simples `docker compose restart mcp-server` não recarrega as variáveis de ambiente atualizadas.

#### Qual modo para qual uso

O servidor MCP identifica seus clientes de uma de três maneiras. A pergunta que as diferencia é **quem decide em qual conta do Poznote uma requisição atua**:

| A sua situação | Modo | Quem decide a conta |
|---|---|---|
| Só você, com um cliente na mesma máquina (VS Code, Claude CLI) | Clássico, o padrão, opcionalmente com um [token de entrada](#token-de-autenticação-de-entrada) | A configuração do servidor: `POZNOTE_USER_ID` (perfil `1` por padrão), ou qualquer perfil que uma requisição indicar com `user_id` |
| Várias pessoas, aplicativos de chat (ChatGPT, Claude, Gemini), ou VS Code / Claude Code acessando um servidor público | [Login a partir de aplicativos de chat](#login-a-partir-de-aplicativos-de-chat-chatgpt-claude-gemini) (`POZNOTE_MCP_AUTH_PROVIDER=poznote`) | A pessoa que faz login: sempre a própria conta |
| Agentes que já têm tokens do seu provedor de identidade (Keycloak, Authentik, ...) | [Autenticação por chamador](#autenticação-por-chamador-opcional) (`userinfo` ou `introspection`) | O perfil vinculado à identidade do token |

Assim que várias pessoas compartilharem um mesmo servidor MCP, use o segundo modo: no modo clássico, qualquer cliente pode alcançar todas as contas.

#### Perfil de usuário padrão

Por padrão, o servidor MCP opera como o perfil de usuário `1` (o primeiro administrador). Para fixar o servidor em outro perfil, defina `POZNOTE_USER_ID` ao iniciar o contêiner:

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

Todas as chamadas de ferramentas passam então a se aplicar a esse perfil, a menos que uma requisição passe um argumento `user_id` explícito, que continua tendo prioridade nessa requisição. O valor precisa ser um ID numérico de perfil; qualquer outro valor é ignorado com um aviso nos logs do MCP, e o padrão `1` é usado.

#### Token de autenticação de entrada

Por padrão, o endpoint MCP aceita qualquer cliente que consiga alcançá-lo, o que é seguro porque a porta só é publicada em `127.0.0.1`. Se você expuser a porta além da sua máquina (proxy reverso, rede local, instalação bare-metal), defina `POZNOTE_MCP_AUTH_TOKEN` e o servidor passará a exigir um cabeçalho `Authorization: Bearer <token>` em todas as requisições, respondendo `401 Unauthorized` caso contrário:

```bash
# Gere um token forte uma única vez
openssl rand -hex 32

# Coloque-o no .env
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# Recrie o contêiner MCP para que ele leia o novo ambiente
docker compose up -d --force-recreate mcp-server
```

Depois adicione o mesmo cabeçalho à configuração do seu cliente: veja [VS Code Copilot](VSCODE-COPILOT.pt.md#usar-um-token-de-autenticação) e [Claude CLI](CLAUDE-CLI.pt.md#usar-um-token-de-autenticação). Espaços em branco no início e no fim são ignorados, então um token lido de um arquivo de segredos com uma quebra de linha no final continua funcionando. Um valor vazio mantém o endpoint aberto. A linha de log da inicialização informa qual modo está ativo.

Esse token é diferente de `data/.mcp_token`: aquele é usado pelo servidor MCP para falar *com* a API do Poznote, este é o que *o seu assistente de IA* precisa apresentar ao servidor MCP.

#### Login a partir de aplicativos de chat (ChatGPT, Claude, Gemini)

Os aplicativos de chat que se conectam a um servidor MCP remoto, como o ChatGPT (e o aplicativo Codex), o Claude Desktop e o claude.ai, ou o Gemini, não aceitam um token colado: eles esperam que o servidor os conduza por um login OAuth. Com `POZNOTE_MCP_AUTH_PROVIDER=poznote`, o próprio Poznote assume esse papel:

1. Você adiciona `https://mcp.example.com/mcp` como conector no aplicativo, deixando vazios os campos de ID e segredo do cliente, se houver: o aplicativo se registra sozinho. Os aplicativos guardam isso nas configurações, geralmente como conectores personalizados ou servidores MCP remotos, e alguns só oferecem esse recurso em determinados planos ou em um modo de desenvolvedor.
2. O aplicativo abre a página de login do Poznote. Você faz login como sempre (senha, autenticação de dois fatores ou SSO).
3. Uma página de consentimento mostra o nome do aplicativo, para onde ele vai levar você de volta e a conta que vai usar, sempre a sua (nunca uma conta à qual você recebeu acesso), e permite escolher o nível de acesso: **Somente leitura**, **Leitura e edição** ou **Acesso total**, os três níveis do [escopo das ferramentas](#escopo-das-ferramentas).
4. Você clica em **Permitir**, e o aplicativo só acessa essa conta, nesse nível.

Assim, um único servidor MCP atende a instância inteira, e cada pessoa acessa apenas as próprias notas (e os espaços de trabalho compartilhados com ela). **Configurações → Minha conta → Aplicativos conectados** lista as conexões, permite desconectar qualquer uma delas e mostra a cada um o endereço do conector para colar.

Requisitos:

- O aplicativo de chat se conecta pela internet (o ChatGPT e o claude.ai a partir dos próprios servidores), então o servidor MCP e o Poznote precisam estar acessíveis para ele via **HTTPS**. Coloque o servidor MCP atrás do seu proxy reverso em **um (sub)domínio próprio**, por exemplo `https://mcp.example.com`: os documentos de descoberta OAuth são servidos na raiz desse endereço. Para onde o proxy encaminha o tráfego depende de onde ele roda:
  - instalado diretamente no servidor: encaminhe para `127.0.0.1:8045` (a porta que o `docker-compose.yml` publica, `POZNOTE_MCP_PORT`);
  - rodando ele mesmo no Docker (Nginx Proxy Manager, Traefik, Caddy, ...): `127.0.0.1` seria o próprio contêiner do proxy. Conecte o proxy à rede Docker do Poznote, `docker network connect poznote_default <proxy-container>` (a rede tem o nome da pasta do seu `docker-compose.yml`, veja `docker network ls`), e encaminhe para `mcp-server:8045`.
- As páginas `/oauth/` do próprio Poznote precisam estar acessíveis sem outro login na frente delas (autenticação delegada, conhecida como forward auth, como Authelia ou Authentik no seu proxy): os aplicativos chamam algumas delas a partir dos próprios servidores, sem navegador para exibir uma página de login.
- Duas variáveis no `.env`, depois recrie o contêiner (`docker compose up -d --force-recreate mcp-server`). Um `docker-compose.yml` mais antigo não as repassa ao contêiner: baixe primeiro o mais recente. Os logs do MCP então mostram `OAuth sign-in through Poznote enabled` na inicialização.

```bash
POZNOTE_MCP_AUTH_PROVIDER=poznote
# URL pública do servidor MCP, sem /mcp
POZNOTE_MCP_PUBLIC_URL=https://mcp.example.com
```

- A URL pública do Poznote, onde as pessoas fazem login, é a **URL da instância** de **Configurações → Ferramentas de administração → Webhooks de administrador**, a usada pelos e-mails de lembrete e pelos webhooks (`POZNOTE_APP_URL` no `.env` enquanto ela estiver vazia). Quando nenhuma das duas está definida, ela se preenche sozinha a partir do navegador de um administrador; verifique se é o endereço pelo qual as pessoas acessam o Poznote pela internet. Uma alteração chega ao servidor MCP em menos de um minuto, sem precisar reiniciar. A janela **Aplicativos conectados** mostra aos administradores o endereço em uso, com um aviso quando ele é local ou em http simples.

Se não funcionar:

- **O aplicativo diz que não encontra as configurações de autorização (OAuth) do servidor.** De uma máquina fora da sua rede, abra `https://mcp.example.com/.well-known/oauth-protected-resource/mcp` e `https://mcp.example.com/.well-known/oauth-authorization-server`: os dois precisam responder com JSON. Um `503` no segundo significa que a URL pública do Poznote não está definida; nenhuma resposta significa que o proxy reverso não alcança o servidor MCP.
- **O aplicativo abre uma página de login que não carrega.** A URL da instância não está acessível para o aplicativo: veja o aviso em **Aplicativos conectados** e corrija-a em **Webhooks de administrador → URL da instância**.
- **Os logs do MCP não mostram `OAuth sign-in through Poznote enabled` na inicialização.** As variáveis não chegam ao contêiner: verifique o `.env` e o `docker-compose.yml`, depois recrie o contêiner (um `restart` não basta).
- **O login funciona, mas depois todas as requisições falham.** A URL do conector precisa ser exatamente `POZNOTE_MCP_PUBLIC_URL` seguida de `/mcp`; caso contrário, os logs do MCP dizem `Rejecting a token issued for ...`.
- `docker compose logs mcp-server` informa o que o servidor recusou e por quê; `POZNOTE_DEBUG=true` acrescenta cada requisição.

Regras que valem para toda conexão:

- Uma conexão dura enquanto for usada: o aplicativo renova seu acesso a cada hora e precisa fazer login de novo após 90 dias sem uso. Um aplicativo desconectado pode continuar funcionando por até `POZNOTE_MCP_AUTH_CACHE_TTL` segundos (60 por padrão).
- `POZNOTE_MCP_SCOPE` continua limitando cada conexão: **Acesso total** a um servidor configurado como `write` recebe `write`.
- As ferramentas que agem sobre toda a instância (backups, configurações globais, informações do sistema) exigem a conta de um administrador, e uma requisição não pode indicar outra conta com `user_id`.
- Um aplicativo conectado não pode mudar para onde os dados da conta são enviados: o repositório, o servidor e o token da sincronização Git, nem os endereços e chaves do assistente de IA e do ditado. Ele ainda pode enviar para o repositório que você configurou e puxar dele.
- `POZNOTE_MCP_AUTH_TOKEN` é ignorado enquanto esse modo está ativo.

#### Autenticação por chamador (opcional)

O `POZNOTE_MCP_AUTH_TOKEN` acima é um único segredo partilhado: todos os
clientes apresentam o mesmo token e o servidor atua como um único perfil.
Quando várias pessoas ou agentes partilham uma instância MCP, isso não permite
distingui-los.

Definir `POZNOTE_MCP_AUTH_PROVIDER` muda para autenticação por chamador: cada
cliente apresenta **o seu próprio** token, que é resolvido junto de um
fornecedor de identidade externo e associado ao perfil Poznote desse chamador.
Uma instância, muitos chamadores, cada um corretamente identificado.

Estas variáveis vão no `.env`, como as outras. Chegam ao contentor MCP através
do bloco `environment:` do serviço `mcp-server`, que um `docker-compose.yml`
mais antigo não inclui: nesse caso são ignoradas sem aviso. Se as definir,
descarregue primeiro o `docker-compose.yml` mais recente (consulte
[Atualizar o aplicativo](README.pt.md#atualizar-o-aplicativo)) e verifique se os
logs do MCP mostram `Per-caller authentication enabled` no arranque.

| variable | default | meaning |
|---|---|---|
| `POZNOTE_MCP_AUTH_PROVIDER` | *(não definido, funcionalidade desligada)* | `userinfo` or `introspection` (`poznote` is described [above](#login-a-partir-de-aplicativos-de-chat-chatgpt-claude-gemini)) |
| `POZNOTE_MCP_AUTH_URL` | *(obrigatório)* | provider endpoint |
| `POZNOTE_MCP_IDENTITY_MATCH` | `oidc_subject:sub` | ordered `<profile-field>:<claim>` pairs |
| `POZNOTE_MCP_AUTH_AUDIENCE` | *(não definido, funcionalidade desligada)* | expected `aud`, comma separated; refuses a token issued for another application |
| `POZNOTE_MCP_AUTH_HEADER` | `Authorization` | the header this server sends **to the provider** |
| `POZNOTE_MCP_AUTH_CLIENT_ID` / `_CLIENT_SECRET` | *(não definido, funcionalidade desligada)* | `introspection` only, sent as HTTP Basic |
| `POZNOTE_MCP_AUTH_TIMEOUT` | `5` | seconds |
| `POZNOTE_MCP_AUTH_CACHE_TTL` | `60` | seconds a resolved token/profile is cached |

`userinfo` executa `GET <url>` com o token bearer do chamador, o ponto de acesso
UserInfo do OpenID Connect. O token nunca é verificado localmente, por isso os
tokens opacos funcionam tão bem como os JWT, e não há qualquer superfície de
JWKS ou de rotação de chaves a manter. `introspection` executa `POST <url>` com
`token=<token>` (RFC 7662); uma resposta com `active: false` é um token
inválido.

Vence a primeira claim de `POZNOTE_MCP_IDENTITY_MATCH` que esteja presente **e
corresponda a exatamente um perfil**. Os campos de perfil são os devolvidos por
`GET /api/v1/admin/users`. Por predefinição apenas o sujeito é comparado.
Comparar por `preferred_username` ou `email` é possível mas mais fraco, porque o
início de sessão do próprio Poznote só compara um email quando está verificado,
e um fornecedor que permita editar esses campos deixaria um utilizador reclamar
outro perfil. Ative-o deliberadamente.

Um valor que corresponda a dois perfis é recusado por ambiguidade, e uma
identidade que não corresponda a nenhum perfil é recusada desde logo: nunca
recorre a um perfil predefinido, porque o predefinido é o perfil 1, o primeiro
administrador. Um perfil desativado nunca é candidato.

Duas consequências a conhecer antes de o ativar:

- **Um argumento `user_id` explícito só pode corresponder ao perfil resolvido.**
  A maioria das ferramentas aceita esse argumento, por isso um que nomeie outro
  perfil é recusado em vez de obedecido.
- **As ferramentas que não levam `user_id`** (`get_system_info`, `list_backups`,
  `create_backup`, `delete_backup`) atuam como o perfil predefinido do servidor,
  pelo que ficam limitadas a chamadores cujo perfil resolvido seja
  administrador.

Com `POZNOTE_MCP_AUTH_PROVIDER` definido, tem precedência sobre
`POZNOTE_MCP_AUTH_TOKEN`, e o servidor registra um aviso se esse token ainda
estiver definido.

#### Escopo das ferramentas

Por padrão, o servidor expõe todas as ferramentas. `POZNOTE_MCP_SCOPE` o limita a um de três níveis, o que é útil para um agente que roda sem supervisão, já que o conteúdo de uma nota poderia levá-lo a uma ferramenta que ele nunca deveria chamar:

| nível | ferramentas |
|---|---|
| `read` | apenas ferramentas que não alteram nada: obter, listar, pesquisar, backlinks, revisões, status de compartilhamento, informações do sistema, configurações |
| `write` | `read`, mais as alterações que podem ser desfeitas: notas, tarefas, lembretes, pastas, movimentações, anexos, mover uma nota para a lixeira, restaurar da lixeira ou de uma revisão |
| `admin` *(padrão)* | tudo, incluindo o que não pode ser desfeito (esvaziar a lixeira, excluir dela), espaços de trabalho, backups, sincronização Git, configurações do aplicativo e compartilhamento público |

```bash
# No .env
POZNOTE_MCP_SCOPE=read

# Recrie o contêiner MCP para que ele leia o novo ambiente
docker compose up -d --force-recreate mcp-server
```

Uma ferramenta acima do nível nem chega a ser registrada: os clientes não a veem, e uma chamada a ela é recusada como ferramenta desconhecida, independentemente do que tenha sido informado ao cliente. O log de inicialização mostra o nível e quantas ferramentas estão expostas. Um valor desconhecido interrompe o servidor em vez de recorrer a `admin`.

Com o token compartilhado, o nível vale para o servidor inteiro: para dar níveis diferentes a dois clientes, execute um segundo contêiner MCP com seu próprio `POZNOTE_MCP_SCOPE`, sua própria porta e seu próprio `POZNOTE_MCP_AUTH_TOKEN`.

Com a [autenticação por chamador](#autenticação-por-chamador-opcional), cada chamador pode receber seu próprio nível a partir de uma claim do seu token. `POZNOTE_MCP_SCOPE_MAP` lista pares `<claim value>=<level>`, lidos da claim indicada por `POZNOTE_MCP_SCOPE_CLAIM` (padrão `scope`, os escopos OAuth separados por espaços; uma claim do tipo lista, como `groups` ou `roles`, também funciona):

```bash
# Escopos OAuth concedidos a cada cliente pelo provedor de identidade
POZNOTE_MCP_SCOPE_MAP=poznote.read=read,poznote.write=write,poznote.admin=admin

# Ou grupos, para provedores que os colocam no token
POZNOTE_MCP_SCOPE_CLAIM=groups
POZNOTE_MCP_SCOPE_MAP=/poznote-agents=read,/poznote-users=write,/poznote-admins=admin
```

Um chamador recebe o nível mais alto ao qual sua claim corresponde, nunca acima de `POZNOTE_MCP_SCOPE`, e as ferramentas acima desse nível ficam ocultas da sua lista de ferramentas e são recusadas quando chamadas. Um chamador cuja claim não corresponde a nenhum nível é recusado de imediato (`401`), em vez de receber o nível do servidor, e o motivo é registrado no log. Sem `POZNOTE_MCP_SCOPE_MAP`, todo chamador recebe o nível do servidor.

Cada ferramenta também traz as anotações MCP padrão `readOnlyHint` e `destructiveHint`, então os clientes que filtram as ferramentas ou pedem confirmação delas por conta própria podem contar com elas.

#### Modo de depuração

Defina `POZNOTE_DEBUG=true` no comando de inicialização para mudar o nível de log de `INFO` para `DEBUG`. Volte para `false` no uso normal. Apenas os valores exatos em minúsculas `true` e `false` são reconhecidos. Qualquer outro valor é tratado como `false`, e um aviso é gravado nos logs do MCP. O servidor web é mais tolerante e também aceita `1`, `on` ou `yes`. Cada requisição HTTP enviada à API do Poznote, cada chamada de ferramenta recebida do assistente de IA e cada resposta são registradas em detalhe nos logs do contêiner. Use esse modo para diagnosticar problemas de conexão ou de autenticação:

```bash
docker compose logs -f mcp-server
```

Deixe-o desativado no uso normal: a verbosidade extra não é necessária no dia a dia.

### Iniciar o servidor

```bash
docker-compose up -d
```

### Verificar a instalação

```bash
# Verifique se o contêiner está em execução
docker ps | grep mcp

# Teste o endpoint
curl http://127.0.0.1:8045/mcp
```

Para desativar o servidor MCP, comente o serviço `mcp-server` no `docker-compose.yml`.

---

## Configuração do cliente

Configure o seu assistente de IA para se conectar ao servidor MCP:

### **VS Code Copilot**
Guia completo de configuração: **[VSCODE-COPILOT.md](VSCODE-COPILOT.pt.md)**

### **Claude CLI**
Guia completo de configuração: **[CLAUDE-CLI.md](CLAUDE-CLI.pt.md)**

### **ChatGPT, Claude Desktop / claude.ai, Gemini**
Os aplicativos de chat fazem login pelo Poznote: veja **[Login a partir de aplicativos de chat](#login-a-partir-de-aplicativos-de-chat-chatgpt-claude-gemini)**.

---

## Segurança

O que um cliente que alcança o endpoint MCP pode fazer depende do [modo](#qual-modo-para-qual-uso).

**Modo clássico** (o padrão). Qualquer pessoa que consiga alcançar o endpoint pode ler, criar, modificar e excluir todas as notas de todos os perfis (as ferramentas aceitam um argumento `user_id`), além de disparar backups, restaurações e alterações de configurações. Duas camadas evitam que isso seja um problema:

1. **Acessibilidade de rede.** Por padrão, o endpoint só é acessível a partir da máquina local.
2. **Token bearer de entrada** (opcional). Defina `POZNOTE_MCP_AUTH_TOKEN` e toda requisição precisará trazer `Authorization: Bearer <token>`.

Com o `docker-compose.yml` padrão, a camada 1 sozinha basta. Adicione a camada 2 sempre que a porta ficar acessível a partir de algum lugar que você não controla totalmente.

**Login a partir de aplicativos de chat, e autenticação por chamador.** Toda requisição precisa trazer um token vinculado à conta de uma única pessoa, então um cliente só alcança essa conta, no nível que recebeu. Aqui o endpoint deve ficar acessível pela internet, atrás de HTTPS: os aplicativos de chat se conectam a partir dos próprios servidores.

Em qualquer modo, um [escopo das ferramentas](#escopo-das-ferramentas) restringe o que um cliente pode fazer.

### Por que escutar só em 127.0.0.1 é normal e seguro

O contêiner MCP escuta em `0.0.0.0` *dentro* do contêiner, o que o Docker exige para o mapeamento de portas funcionar, mas a porta é publicada **somente em `127.0.0.1`** do host, nunca em uma interface pública:

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

Isso é intencional e é a configuração correta: só processos rodando na mesma máquina (ou túneis SSH que você configurar explicitamente) conseguem se conectar. Não há nada com que se preocupar na configuração padrão.

### Executar o servidor MCP fora do Docker

Se você instalar o servidor MCP com `pip` e executar `poznote-mcp serve` por conta própria (systemd, Proxmox LXC, ...), não há mapeamento de portas do Docker na frente dele, então o endereço de escuta importa:

- `poznote-mcp serve` escuta em **`127.0.0.1` por padrão**. Mantenha esse padrão, a menos que saiba por que precisa de outra coisa.
- Se precisar escutar em `0.0.0.0` (um proxy reverso em outro host, uma interface de VPN), defina também `POZNOTE_MCP_AUTH_TOKEN`. O servidor registra um aviso na inicialização quando escuta em um endereço que não é de loopback sem token.
- Versões mais antigas escutavam em `0.0.0.0` por padrão: passe `--host=127.0.0.1` explicitamente (ou defina `MCP_HOST=127.0.0.1` ao executar sem o subcomando `serve`).

### Acesso remoto

No modo clássico, se o Poznote roda em um servidor remoto e você quer se conectar a partir da sua estação de trabalho, use o redirecionamento de portas do SSH e **não** exponha a porta publicamente (com o [login a partir de aplicativos de chat](#login-a-partir-de-aplicativos-de-chat-chatgpt-claude-gemini), expô-la atrás de HTTPS é justamente o objetivo, e esta seção não se aplica):

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Depois aponte o seu assistente de IA para `http://127.0.0.1:8045/mcp`, como de costume.

### Ambientes de produção

Se você precisar rotear o servidor MCP por uma rede, proteja-o com:
- `POZNOTE_MCP_AUTH_TOKEN` (veja [Token de autenticação de entrada](#token-de-autenticação-de-entrada)), ou o [login pelo Poznote](#login-a-partir-de-aplicativos-de-chat-chatgpt-claude-gemini) para que cada cliente tenha o próprio token revogável vinculado a uma única conta, com HTTPS na frente para que o token não trafegue em texto claro
- Uma VPN (Tailscale, WireGuard)
- Opcionalmente, um proxy reverso com autenticação própria ou lista de IPs permitidos (nginx, Caddy) como camada extra, exceto com o login a partir de aplicativos de chat: os aplicativos se conectam a partir dos próprios endereços, que mudam, e não conseguem responder a outro login, então o endpoint e seus documentos `/.well-known/` precisam continuar acessíveis

### Como o servidor MCP se autentica no Poznote

O servidor MCP se conecta à API REST do Poznote com um token Bearer interno armazenado em `data/.mcp_token`. O Poznote cria esse token automaticamente, e a configuração do Docker Compose monta `./data` como somente leitura no contêiner MCP, de modo que o token nunca precisa ficar no `.env`.

Como esse token identifica o servidor MCP, o Poznote cria um instantâneo de uma nota logo antes de uma requisição que o traz alterar o conteúdo ou as tarefas da nota (`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`, `add_subtask`, `update_subtask`, `delete_subtask`). Ele aparece como "Antes da edição MCP" na página **Revisões** da nota, então uma reescrita da IA que perdeu conteúdo pode ser desfeita com um clique. Nenhum instantâneo é criado quando o mais recente já contém o mesmo conteúdo, e os 20 instantâneos de segurança mais recentes (Antes da edição IA e Antes da edição MCP) são mantidos por nota, um número que você pode aumentar em **Configurações → Revisões** (até 200) quando o servidor MCP edita o bastante para esgotar 20 em uma tarde.

---

## Exemplos de uso

Depois de configurado, interaja com o Poznote usando linguagem natural:

```
Liste todas as notas do espaço de trabalho 'Poznote'
Pesquise notas sobre 'MCP'
Crie uma nota com o título 'Meeting Notes' sobre a discussão
Atualize a nota 123 com um novo conteúdo
Mova a nota 456 para a pasta 'Projects'
```

Para exemplos de uso detalhados e solução de problemas:
- VS Code Copilot: [VSCODE-COPILOT.md](VSCODE-COPILOT.pt.md#exemplos-de-uso)
- Claude CLI: [CLAUDE-CLI.md](CLAUDE-CLI.pt.md#exemplos-de-uso)

---

## Suporte e recursos

- **[Configuração do VS Code Copilot →](VSCODE-COPILOT.pt.md)**
- **[Configuração do Claude CLI →](CLAUDE-CLI.pt.md)**

Em caso de problemas:
- Verifique os logs do servidor MCP: `docker compose logs mcp-server`
- Verifique se a API do Poznote está acessível
- Consulte os guias de solução de problemas de cada cliente
