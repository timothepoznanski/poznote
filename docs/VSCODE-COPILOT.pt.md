<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <a href="VSCODE-COPILOT.de.md">Deutsch</a> ·
  <a href="VSCODE-COPILOT.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <a href="VSCODE-COPILOT.zh-cn.md">简体中文</a> ·
  <a href="VSCODE-COPILOT.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Usar o servidor MCP do Poznote com o VS Code Copilot

Este guia explica como configurar e usar o servidor MCP do Poznote com o VS Code Copilot.

## Pré-requisitos

- Visual Studio Code instalado
- **Assinatura do GitHub Copilot:** é necessário um plano pago (ou de avaliação) do [GitHub Copilot](https://github.com/features/copilot), com a extensão Copilot Chat ativada no VS Code
- Servidor MCP do Poznote em execução (via Docker Compose)
- Servidor MCP acessível em 127.0.0.1 (porta padrão: 8045)

## Configuração

### 1. Verificar se o servidor MCP está em execução

Confira se o contêiner do servidor MCP está em execução:

```bash
docker ps | grep mcp
```

O servidor MCP deve aparecer em execução. Anote o número da porta na saída (o padrão é 8045).

### 2. Configurar o VS Code

Adicione o servidor MCP do Poznote ao seu arquivo `mcp.json`. O local depende do seu sistema operacional:

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

Se o arquivo não existir, crie-o com a seguinte configuração:

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

> **Observação:** substitua `8045` pela porta real do seu servidor MCP se você a personalizou no `docker-compose.yml`.

#### Usar um token de autenticação

Se o servidor MCP foi iniciado com `POZNOTE_MCP_AUTH_TOKEN` (veja [Token de autenticação de entrada](MCP-SERVER.pt.md#token-de-autenticação-de-entrada)), adicione o cabeçalho correspondente; caso contrário, todas as chamadas serão rejeitadas com `401 Unauthorized`:

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

Para manter o token fora do `mcp.json`, o VS Code pode pedi-lo a você: declare uma entrada `inputs` com `"password": true` e faça referência a ela como `"Authorization": "Bearer ${input:poznote-token}"`.

### 3. Recarregar o VS Code

Depois de atualizar o `mcp.json`, recarregue o VS Code para que as alterações entrem em vigor:
- Pressione `Ctrl+Shift+P` (ou `Cmd+Shift+P` no Mac)
- Digite "Reload Window" e pressione Enter

## Configuração de servidor remoto

Se a sua instância do Poznote roda em um servidor remoto, use o redirecionamento de portas do SSH para se conectar com segurança.

### 1. Estabelecer o túnel SSH

Se você prefere a linha de comando, crie um túnel SSH clássico:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Mantenha essa conexão aberta enquanto usa o VS Code Copilot com o Poznote.

Se você já está conectado à máquina remota pelo VS Code Remote SSH, Dev Containers ou Codespaces, também pode criar o túnel diretamente no VS Code, na visualização `PORTS`:

1. Abra o painel `PORTS` no VS Code.
2. Encaminhe a porta remota `8045`.
3. Mantenha a porta encaminhada ativa enquanto usa o Copilot.
4. Se o VS Code atribuir uma porta local diferente de `8045`, use essa porta local no `mcp.json`.

### 2. Configurar o VS Code

Use a mesma configuração do `mcp.json` da instalação local:

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

O túnel SSH ou a porta encaminhada pelo VS Code expõe o servidor MCP remoto na sua máquina local, então o VS Code se conecta a `127.0.0.1`.

## Exemplos de uso

Depois de configurado, você pode interagir com a sua instância do Poznote diretamente no VS Code, usando linguagem natural no Copilot Chat:

### Operações básicas

```
# Listar todas as notas
@poznote Liste todas as minhas notas

# Pesquisar notas
@poznote Pesquise notas sobre "docker"

# Obter uma nota específica
@poznote Mostre a nota 123

# Listar os espaços de trabalho
@poznote Quais espaços de trabalho eu tenho?

# Listar as pastas
@poznote Mostre todas as pastas do meu espaço de trabalho
```

### Criar e atualizar notas

> **Espaço de trabalho**: se você não especificar o espaço de trabalho no pedido, a nota é criada no espaço de trabalho padrão do usuário conectado. Indique explicitamente o espaço de trabalho de destino para evitar qualquer confusão, por exemplo: *"no espaço de trabalho 'Projets'"*.

```
@poznote Crie uma nota com o título "Meeting Notes" no espaço de trabalho "Projets" com um conteúdo sobre a nova funcionalidade

@poznote Atualize a nota 456 com um novo conteúdo sobre o processo de implantação

@poznote Exclua a nota 456 (ela vai para a lixeira)

@poznote Crie uma nota "Renew passport" no espaço de trabalho "Perso" e me lembre no dia 1º de setembro às 9h

@poznote Crie uma pasta chamada "Projects"
```

### Lembretes

```
@poznote Me lembre da nota 123 na próxima segunda-feira às 8h

@poznote Defina um lembrete semanal na nota 123, toda segunda-feira às 9h

@poznote A nota 123 tem um lembrete?

@poznote Remova o lembrete da nota 123
```

### Listas de tarefas

```
@poznote Mostre as tarefas da nota 123

@poznote Adicione à nota 123 uma tarefa "Buy milk" com prazo para amanhã às 18h30 e um lembrete

@poznote Adicione uma tarefa "Weekly report" à nota 123, com prazo toda sexta-feira

@poznote Marque a tarefa "Buy milk" da nota 123 como concluída

@poznote Mude o prazo da tarefa "Buy milk" da nota 123 para a próxima segunda-feira

@poznote Exclua a tarefa "Buy milk" da nota 123
```

### Operações avançadas

```
@poznote Duplique a nota 789

@poznote Marque a nota 123 como favorita

@poznote Mova a nota 456 para a pasta "Projects"

@poznote Converta a nota 123 para Markdown

@poznote Quais notas apontam para a nota 123?

@poznote Ative o compartilhamento público da nota 123

@poznote Liste todas as minhas notas e pastas compartilhadas publicamente

@poznote Qual versão do Poznote estou usando?
```

### Pastas e espaços de trabalho

```
@poznote Renomeie a pasta 12 para "Archive"

@poznote Exclua a pasta 12 e mova as notas dela para a lixeira

@poznote Crie um espaço de trabalho chamado "Work"

@poznote Renomeie o espaço de trabalho "Work" para "Job"

@poznote Exclua o espaço de trabalho "Job"
```

### Lixeira e restauração

```
@poznote Mostre todas as notas da lixeira

@poznote Restaure a nota 123 da lixeira

@poznote Esvazie a lixeira
```

### Sincronização Git

```
@poznote Qual é o status da sincronização Git?

@poznote Envie minhas notas para o Git

@poznote Traga as notas do Git
```

### Backups e configurações

```
@poznote Liste todos os backups

@poznote Crie um backup dos meus dados

@poznote Restaure o backup poznote_backup_2026-02-02_15-30-00.zip

@poznote Exclua o backup poznote_backup_2026-02-02_15-30-00.zip

@poznote Qual é o valor da configuração "timezone"?

@poznote Defina a configuração "timezone" como "Europe/Paris"
```

### Trabalhar com o conteúdo

```
@poznote Você pode resumir todas as minhas notas com a tag "important"?

@poznote Me ajude a organizar minhas notas em pastas de acordo com os assuntos delas

@poznote Crie um relatório semanal com base nas minhas notas de reunião
```

## Solução de problemas

### Problemas de conexão

Se o VS Code Copilot não consegue se conectar ao servidor MCP:

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

4. **Verifique a sintaxe do mcp.json:**
   Confirme que o seu JSON é válido (sem vírgulas sobrando no final, aspas corretas etc.)

### Servidor MCP não reconhecido

Se o VS Code não reconhece o servidor MCP do Poznote:

1. Confirme que você recarregou o VS Code depois de editar o `mcp.json`
2. Verifique se o GitHub Copilot está habilitado e ativo
3. Procure mensagens de erro no painel de saída do VS Code:
   - View → Output
   - Selecione "GitHub Copilot" na lista suspensa

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

## Ferramentas MCP disponíveis

O servidor MCP do Poznote oferece as seguintes ferramentas, que o VS Code Copilot pode usar:

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
- `add_subtask`: adiciona uma subtarefa a uma tarefa de uma nota do tipo lista de tarefas
- `update_subtask`: renomeia uma subtarefa, ou a marca como concluída ou pendente
- `delete_subtask`: exclui uma subtarefa de uma tarefa

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

A maioria das ferramentas aceita um parâmetro opcional `user_id` para direcionar a chamada a perfis de usuário específicos. As exceções são as ferramentas de nível de sistema `get_system_info`, `list_backups`, `create_backup` e `delete_backup`, que não aceitam `user_id`. Você pode indicar isso nos seus prompts:

```
@poznote Liste as notas do usuário 2
```

## Configuração avançada

### Várias instâncias do Poznote

Se você roda várias instâncias do Poznote, pode configurá-las com nomes diferentes:

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

Depois, faça referência a elas explicitamente:
```
@poznote-work Liste minhas notas de trabalho
```

### Configuração de porta personalizada

Se o seu servidor MCP roda em outra porta, atualize a URL no `mcp.json`:

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

## Notas de segurança

⚠️ **Importante:** qualquer pessoa que consiga alcançar o endpoint MCP pode gerenciar todas as notas. Por padrão, ele só é acessível a partir de 127.0.0.1; se você o expuser além disso, defina `POZNOTE_MCP_AUTH_TOKEN` para que os clientes precisem apresentar um token bearer (veja [Usar um token de autenticação](#usar-um-token-de-autenticação)).

**Configuração padrão (segura):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Para acesso remoto, use sempre um túnel SSH**, como descrito na seção [Configuração de servidor remoto](#configuração-de-servidor-remoto).

Todos os detalhes: [Segurança do servidor MCP](MCP-SERVER.pt.md#segurança).

## Recursos

- [Documentação principal do servidor MCP](MCP-SERVER.pt.md)
- [Documentação oficial do VS Code sobre MCP](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Configuração do Claude CLI](CLAUDE-CLI.pt.md)
- [Considerações de segurança](MCP-SERVER.pt.md#segurança)

## Suporte

Para problemas ou dúvidas:
- Consulte a [documentação principal do MCP](MCP-SERVER.pt.md)
- Analise os logs do servidor MCP: `docker compose logs mcp-server`
- Verifique se a API do Poznote está acessível
- Procure erros no painel de saída do VS Code
