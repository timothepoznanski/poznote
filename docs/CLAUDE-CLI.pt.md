<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Usar o servidor MCP do Poznote com o Claude CLI

Este guia explica como configurar e usar o servidor MCP do Poznote com o Claude CLI (interface de linha de comando).

## Pré-requisitos

- **Chave de API da Anthropic:** o Claude CLI exige uma [chave de API da Anthropic](https://console.anthropic.com/) paga. Defina-a antes de usar a CLI:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI instalado (`npm install -g @anthropic-ai/claude-cli` ou similar)
- Servidor MCP do Poznote em execução (via Docker Compose)
- Servidor MCP acessível em 127.0.0.1 (porta padrão: 8045)

## Instalação

### 1. Verificar se o servidor MCP está em execução

Confira se o contêiner do servidor MCP está em execução:

```bash
docker ps | grep mcp
```

O servidor MCP deve aparecer em execução. Anote o número da porta na saída (o padrão é 8045).

### 2. Adicionar o servidor MCP ao Claude CLI

Adicione o servidor MCP do Poznote usando o transporte HTTP:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **Observação:** substitua `8045` pela porta real do seu servidor MCP se você a personalizou no `docker-compose.yml`.

#### Usar um token de autenticação

Se o servidor MCP foi iniciado com `POZNOTE_MCP_AUTH_TOKEN` (veja [Token de autenticação de entrada](MCP-SERVER.pt.md#token-de-autenticação-de-entrada)), passe o mesmo token como cabeçalho; caso contrário, todas as chamadas serão rejeitadas com `401 Unauthorized`:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

O local onde a configuração é salva depende da opção `--scope`:
- **Local (padrão):** `~/.claude.json`, disponível apenas no diretório onde você executou o comando
- **Usuário (`--scope user`):** `~/.claude.json`, disponível em todos os seus projetos
- **Projeto (`--scope project`):** `.mcp.json` na raiz do projeto, feito para ser versionado e compartilhado com sua equipe

### 3. Verificar a configuração

Liste todos os servidores MCP configurados:
```bash
claude mcp list
```

`poznote` deve aparecer na lista, com a URL HTTP dele.

### 4. Ver os detalhes do servidor

Obtenha informações detalhadas sobre o servidor MCP do Poznote:
```bash
claude mcp get poznote
```

## Exemplos de uso

Depois de configurado, você pode interagir com a sua instância do Poznote usando comandos em linguagem natural:

### Consultas básicas

```bash
# Listar todas as notas
claude "Liste todas as minhas notas do Poznote"

# Pesquisar notas
claude "Pesquise notas sobre 'docker' no Poznote"

# Obter uma nota específica
claude "Mostre a nota 123 do Poznote"

# Listar os espaços de trabalho
claude "Quais espaços de trabalho eu tenho no Poznote?"

# Listar as pastas
claude "Mostre todas as pastas do meu espaço de trabalho do Poznote"
```

### Criar e atualizar notas

```bash
# Criar uma nova nota
# IMPORTANTE: se você não especificar o espaço de trabalho, a nota é criada no
# espaço de trabalho padrão do usuário conectado. Especifique sempre o espaço de destino.
claude "Crie uma nota no Poznote com o título 'Meeting Notes' no espaço de trabalho 'Projets' e o conteúdo 'Discussão sobre a nova funcionalidade'"

# Atualizar uma nota existente
claude "Atualize a nota 456 no Poznote com um novo conteúdo sobre o processo de implantação"

# Excluir uma nota (move a nota para a lixeira)
claude "Exclua a nota 456 no Poznote"

# Criar uma nota com lembrete, em uma única etapa
claude "Crie uma nota 'Renew passport' no espaço de trabalho 'Perso' no Poznote e me lembre no dia 1º de setembro às 9h"

# Criar uma pasta
claude "Crie uma pasta chamada 'Projects' no Poznote"
```

### Lembretes

```bash
# Definir um lembrete em uma nota existente
claude "Me lembre da nota 123 no Poznote na próxima segunda-feira às 8h"

# Definir um lembrete recorrente
claude "Defina um lembrete semanal na nota 123 no Poznote, toda segunda-feira às 9h"

# Consultar um lembrete
claude "A nota 123 no Poznote tem um lembrete?"

# Remover um lembrete
claude "Remova o lembrete da nota 123 no Poznote"
```

### Listas de tarefas

```bash
# Listar as tarefas de uma nota do tipo lista de tarefas
claude "Mostre as tarefas da nota 123 no Poznote"

# Adicionar uma tarefa com prazo e lembrete
claude "Adicione à nota 123 no Poznote uma tarefa 'Buy milk' com prazo para amanhã às 18h30 e um lembrete"

# Adicionar uma tarefa recorrente
claude "Adicione uma tarefa 'Weekly report' à nota 123 no Poznote, com prazo toda sexta-feira"

# Concluir uma tarefa
claude "Marque a tarefa 'Buy milk' da nota 123 como concluída no Poznote"

# Atualizar ou excluir uma tarefa
claude "Mude o prazo da tarefa 'Buy milk' da nota 123 para a próxima segunda-feira no Poznote"
claude "Exclua a tarefa 'Buy milk' da nota 123 no Poznote"
```

### Operações avançadas

```bash
# Duplicar uma nota
claude "Duplique a nota 789 no Poznote"

# Alternar favorito
claude "Marque a nota 123 como favorita no Poznote"

# Mover uma nota para uma pasta
claude "Mova a nota 456 para a pasta 'Projects' no Poznote"

# Converter uma nota entre HTML e Markdown
claude "Converta a nota 123 do Poznote para Markdown"

# Encontrar as notas que apontam para uma nota
claude "Quais notas apontam para a nota 123 no Poznote?"

# Compartilhar uma nota
claude "Ative o compartilhamento público da nota 123 no Poznote"

# Listar tudo o que está compartilhado publicamente
claude "Liste todas as minhas notas e pastas compartilhadas publicamente no Poznote"

# Obter informações do sistema
claude "Qual versão do Poznote estou usando?"
```

### Pastas e espaços de trabalho

```bash
# Renomear ou excluir uma pasta
claude "Renomeie a pasta 12 para 'Archive' no Poznote"
claude "Exclua a pasta 12 no Poznote e mova as notas dela para a lixeira"

# Gerenciar espaços de trabalho
claude "Crie um espaço de trabalho chamado 'Work' no Poznote"
claude "Renomeie o espaço de trabalho 'Work' para 'Job' no Poznote"
claude "Exclua o espaço de trabalho 'Job' no Poznote"
```

### Configurações

```bash
# Ler uma configuração
claude "Qual é o valor da configuração 'timezone' no Poznote?"

# Atualizar uma configuração
claude "Defina a configuração 'timezone' como 'Europe/Paris' no Poznote"
```

### Lixeira e restauração

```bash
# Ver a lixeira
claude "Mostre todas as notas da lixeira do Poznote"

# Restaurar uma nota
claude "Restaure a nota 123 da lixeira do Poznote"

# Esvaziar a lixeira
claude "Esvazie a lixeira do Poznote"
```

### Sincronização Git

```bash
# Verificar o status da sincronização Git
claude "Qual é o status da sincronização Git no Poznote?"

# Enviar para o Git
claude "Envie minhas notas do Poznote para o Git"

# Receber do Git
claude "Traga as notas do Git para o Poznote"
```

### Backups

```bash
# Listar os backups
claude "Liste todos os backups do Poznote"

# Criar um backup
claude "Crie um backup dos meus dados do Poznote"

# Restaurar um backup (⚠️ substitui todos os dados atuais do usuário)
claude "Restaure o backup do Poznote poznote_backup_2026-02-02_15-30-00.zip"

# Excluir um arquivo de backup
claude "Exclua o backup do Poznote poznote_backup_2026-02-02_15-30-00.zip"
```

## Modo interativo

Inicie uma sessão interativa em que você pode conversar com o Claude sobre suas notas:

```bash
claude
```

Depois, faça perguntas naturalmente:
- "Você pode me mostrar todas as minhas notas com a tag 'important'?"
- "Crie um resumo de todas as minhas notas de reunião da semana passada"
- "Me ajude a organizar minhas notas em pastas"

## Opções de configuração

### Usar uma porta personalizada

Se o seu servidor MCP roda em outra porta (confira a configuração `POZNOTE_MCP_PORT` no seu `docker-compose.yml`):
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### Remover o servidor

Para remover o servidor MCP do Poznote do Claude CLI:
```bash
claude mcp remove poznote
```

### Várias instâncias

Se você roda várias instâncias do Poznote em portas diferentes, pode configurá-las com nomes diferentes:
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

Depois, especifique qual instância usar nas suas consultas:
```bash
claude "Liste as notas do poznote-work"
```

## Solução de problemas

### Problemas de conexão

Se o Claude CLI não consegue se conectar ao servidor MCP:

1. **Verifique se o servidor MCP está em execução:**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   (Substitua `8045` pela porta que você configurou)

2. **Verifique o status do contêiner Docker:**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **Verifique o mapeamento da porta:**
   Confirme que a porta está vinculada a 127.0.0.1 no `docker-compose.yml`:
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### Erros de autenticação

O servidor MCP se autentica no Poznote com o token compartilhado armazenado em `data/.mcp_token`.

Verifique estes pontos:
- `./data/.mcp_token` existe no host do Poznote
- o serviço `mcp-server` monta `./data:/var/www/html/data:ro`
- o contêiner webserver foi recriado pelo menos uma vez depois da atualização para a configuração MCP baseada em token

### Modo de depuração

Ative o log de depuração do servidor MCP recriando o contêiner com uma variável de ambiente inline:
```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Apenas os valores exatos em minúsculas `true` e `false` são reconhecidos. Qualquer outro valor é tratado como `false`, e um aviso é gravado nos logs do MCP.

Depois confira os logs:
```bash
docker compose logs -f mcp-server
```

## Notas de segurança

⚠️ **Importante:** qualquer pessoa que consiga alcançar o endpoint MCP pode gerenciar todas as notas. Por padrão, ele só é acessível a partir de 127.0.0.1; se você o expuser além disso, defina `POZNOTE_MCP_AUTH_TOKEN` para que os clientes precisem apresentar um token bearer (veja [Usar um token de autenticação](#usar-um-token-de-autenticação)).

**Configuração padrão (segura):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Para acesso remoto, use um túnel SSH:**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Todos os detalhes: [Segurança do servidor MCP](MCP-SERVER.pt.md#segurança).

## Ferramentas MCP disponíveis

O servidor MCP do Poznote oferece as seguintes ferramentas:

### Gerenciamento de notas
- `get_note`: obtém uma nota específica pelo ID
- `list_notes`: lista todas as notas
- `search_notes`: pesquisa notas por texto, com um intervalo opcional de datas de criação
- `create_note`: cria uma nova nota, opcionalmente com prazo/lembrete
- `update_note`: atualiza uma nota existente e/ou define o prazo/lembrete dela
- `delete_note`: exclui uma nota
- `duplicate_note`: duplica uma nota
- `convert_note`: converte uma nota entre HTML e Markdown
- `get_backlinks`: obtém as notas que apontam para uma nota

### Lembretes
- `get_reminder`: obtém o lembrete definido em uma nota
- `set_reminder`: define ou substitui o lembrete de uma nota, com um intervalo de repetição opcional
- `remove_reminder`: remove o lembrete de uma nota

### Tarefas
- `list_tasks`: lista as tarefas de uma nota do tipo lista de tarefas, com seus IDs e prazos
- `add_task`: adiciona uma única tarefa, com prazo e lembrete opcionais
- `update_task`: atualiza uma tarefa (texto, prazo, lembrete, marcador de importante)
- `complete_task`: marca uma tarefa como concluída ou a reabre
- `delete_task`: exclui uma tarefa de uma nota do tipo lista de tarefas

### Organização
- `create_folder`: cria uma nova pasta
- `list_folders`: lista todas as pastas
- `rename_folder`: renomeia uma pasta
- `delete_folder`: exclui uma pasta e move as notas dela para a lixeira
- `list_workspaces`: lista todos os espaços de trabalho
- `create_workspace`: cria um novo espaço de trabalho
- `rename_workspace`: renomeia um espaço de trabalho
- `delete_workspace`: exclui um espaço de trabalho (não é possível excluir o último)
- `list_tags`: lista todas as tags
- `move_note_to_folder`: move uma nota para uma pasta
- `remove_note_from_folder`: remove uma nota da pasta
- `toggle_favorite`: alterna o status de favorito

### Gerenciamento da lixeira
- `get_trash`: lista as notas da lixeira
- `restore_note`: restaura da lixeira
- `empty_trash`: esvazia a lixeira

### Compartilhamento
- `share_note`: ativa o compartilhamento público
- `unshare_note`: desativa o compartilhamento público
- `get_note_share_status`: obtém o status de compartilhamento
- `list_shared`: lista todas as notas e pastas compartilhadas publicamente

### Anexos
- `list_attachments`: lista os anexos de uma nota

### Sincronização Git
- `get_git_sync_status`: obtém o status da sincronização Git
- `git_push`: envia para o repositório Git
- `git_pull`: recebe do repositório Git

### Sistema
- `get_system_info`: obtém informações da versão do Poznote
- `list_backups`: lista os backups do sistema
- `create_backup`: cria um backup
- `restore_backup`: restaura um backup (substitui os dados atuais do usuário)
- `delete_backup`: exclui um arquivo de backup
- `get_app_setting`: obtém uma configuração do aplicativo
- `update_app_setting`: atualiza uma configuração do aplicativo

### Suporte a vários usuários

A maioria das ferramentas aceita um parâmetro opcional `user_id` para direcionar a chamada a perfis de usuário específicos. As exceções são as ferramentas de nível de sistema `get_system_info`, `list_backups`, `create_backup` e `delete_backup`, que não aceitam `user_id`.
```bash
claude "Liste as notas do usuário 2 no Poznote"
```

## Documentação relacionada

- [Documentação principal do servidor MCP](MCP-SERVER.pt.md)
- [Configuração do VS Code Copilot](VSCODE-COPILOT.pt.md)
- [Considerações de segurança](MCP-SERVER.pt.md#segurança)

## Suporte

Para problemas ou dúvidas:
- Consulte a [documentação principal do MCP](MCP-SERVER.pt.md)
- Analise os logs do servidor MCP: `docker compose logs mcp-server`
- Verifique se a API do Poznote está acessível
