<!-- lang-selector -->
<p align="center">
  <a href="AI-ASSISTANT.md">English</a> ·
  <a href="AI-ASSISTANT.fr.md">Français</a> ·
  <a href="AI-ASSISTANT.de.md">Deutsch</a> ·
  <a href="AI-ASSISTANT.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="AI-ASSISTANT.ru.md">Русский</a> ·
  <a href="AI-ASSISTANT.zh-cn.md">简体中文</a> ·
  <a href="AI-ASSISTANT.ko.md">한국어</a> ·
  <a href="AI-ASSISTANT.ja.md">日本語</a> ·
  <a href="AI-ASSISTANT.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Assistente IA do Poznote

Chat de IA integrado que pode pesquisar e ler suas notas. Funciona com uma instância local do [Ollama](https://ollama.com) ou do [LM Studio](https://lmstudio.ai), com um provedor na nuvem como a [Anthropic (Claude)](https://www.anthropic.com) ou a OpenAI, ou com qualquer servidor compatível com OpenAI.

> [!TIP]
> Na verdade, quer conectar um assistente de IA *externo* (VS Code Copilot, Claude CLI...) às suas notas? Consulte a [documentação do servidor MCP](MCP-SERVER.pt.md).

## O que ele faz

Depois de configurado, um botão **Assistente IA** aparece na barra de ícones à esquerda, na página de notas e no Painel, e abre o painel de chat ali mesmo. O painel fica encaixado à direita, mantém o estado aberto e a largura de uma página para a outra, e a conversa acompanha você entre as duas.

O assistente tem ferramentas para **pesquisar e ler suas notas** e as usa por conta própria: pergunte "o que minhas notas dizem sobre X?", peça um resumo que abranja várias notas ou deixe que ele encontre aquela nota de que você mal se lembra. As respostas chegam em streaming e são renderizadas como Markdown.

Quando você pede explicitamente, ele também pode agir sobre suas notas:

- **escrever**: criar uma nota, renomear uma nota ou reescrever o conteúdo dela;
- **organizar**: adicionar ou remover tags, listar, criar e renomear pastas, mover notas entre elas, marcar notas e pastas como favoritas;
- **datas**: definir ou remover um lembrete em uma nota (único ou recorrente); o assistente conhece a data e a hora atuais no seu fuso horário, então "me lembre na próxima segunda às 9h" funciona;
- **tarefas**: adicionar, marcar, desmarcar, renomear ou remover as tarefas de uma nota do tipo lista de tarefas e suas subtarefas, incluindo os prazos e lembretes das tarefas, e marcar ou desmarcar uma caixa de seleção dentro de uma nota comum, sem reescrever o resto dela;
- **excluir**: mover para a lixeira uma nota, ou uma pasta com suas subpastas e todas as notas delas. Tudo pode ser restaurado na página Lixeira: o assistente não tem como excluir nada definitivamente, nem ferramenta para esvaziar a lixeira.

A nota que você tem aberta faz parte do contexto: diga "melhore a formatação desta nota" ou "adicione uma conclusão aqui" e o assistente trabalha nela, sem precisar de id nem de título. Ele lê a última versão salva pelo editor, e "esta nota" acompanha você se abrir outra nota durante a conversa. Citar outra nota na sua pergunta continua tendo prioridade. No Painel nenhuma nota fica aberta, então, ali, indique a nota a que você se refere.

Duas linhas acima do campo de entrada mostram com o que o assistente está trabalhando: o **espaço de trabalho** em que todas as ferramentas são executadas e a **nota** a que "esta nota" se refere, quando há uma aberta.

Quando o assistente edita ou cria uma nota, a nota aberta e a barra lateral são atualizadas sozinhas assim que a resposta termina, sem precisar recarregar a página. Se você tiver alterações não salvas na nota que ele acabou de editar, aparece um banner no lugar disso: recarregue a nota ou mantenha e salve a sua própria versão.

O assistente lê e escreve o conteúdo das notas em Markdown. Notas em rich text (HTML) são convertidas na hora, nos dois sentidos, com o mesmo conversor da ação **Converter nota**, de modo que uma reescrita preserva títulos, listas, links, tabelas e imagens; a formatação rica, como cores ou fontes, não é preservada. O assistente lê uma nota longa em várias partes. Para alterar alguns trechos, ele substitui apenas esses, seja qual for o tamanho da nota. Para reescrever uma nota longa por inteiro, ele precisa primeiro lê-la toda; caso contrário, a reescrita é recusada em vez de ser truncada, e a nova versão precisa caber em uma única resposta do modelo.

Antes de o assistente alterar o conteúdo de uma nota (reescrita, caixa de seleção, tarefa), o Poznote salva uma revisão da versão atual, identificada como "Antes da edição IA" na página **Revisões** da nota (o ícone de histórico na barra de ferramentas da nota). Se o resultado não for o que você queria, restaure essa revisão, ou abra antes a aba Alterações dela para ver o que o assistente mudou. A revisão não é criada quando a mais recente já contém o mesmo conteúdo, uma única resposta que altera a mesma nota várias vezes gera apenas uma, e as 20 revisões de segurança mais recentes (Antes da edição IA e Antes da edição MCP) são mantidas por nota, um número que você pode alterar em **Configurações → Revisões** (de 1 a 200).

O assistente fica **limitado ao espaço de trabalho atual**: ele só vê, pesquisa e edita as notas do espaço de trabalho em que você abriu o chat, e as novas notas são criadas nele. Para perguntar sobre outro espaço de trabalho, mude para ele primeiro. Em um Painel que mostra vários espaços de trabalho, o assistente pesquisa e lê as notas de todos eles de uma vez: é assim que se faz uma pergunta que abrange vários espaços de trabalho. Ali ele é somente leitura e não cria, edita, organiza nem exclui nada. Para alterar uma nota que ele encontrou, abra a nota ou o espaço de trabalho dela e peça ali.

As conversas ficam guardadas no servidor Poznote, no seu próprio banco de dados ao lado das suas notas, e pertencem somente a você: quem trabalha em um espaço de trabalho que você compartilhou tem as suas próprias. No cabeçalho do painel, o botão de mais inicia uma nova conversa e o botão de histórico lista as dez últimas do espaço de trabalho, para retomar uma delas ou apagá-la; o botão de lixeira apaga a conversa exibida. O histórico acompanha você de um navegador ou dispositivo para outro, e recarregar a página traz de volta a conversa que a aba tinha aberta.

## Ativar o assistente

Acesse **Configurações → Ferramentas de administração → Assistente IA** (somente administradores) e escolha um provedor:

| Provedor | URL | Chave de API |
|---|---|---|
| **Ollama** (local) | Depende de onde o Ollama é executado (contêiner ou host), veja [Servidores locais e rede Docker](#servidores-locais-e-rede-docker) | Não é necessária |
| **LM Studio** (local) | Pré-preenchida com o endereço do seu host Docker, porta `1234`, veja a [Opção 2](#opção-2-ollama-instalado-no-host) | Não é necessária |
| **Anthropic** (nuvem) | Definida automaticamente | Obrigatória |
| **OpenAI** (nuvem) | Definida automaticamente | Obrigatória |
| **Outro (URL personalizada)** | Qualquer URL base compatível com OpenAI | Depende do servidor |

Em seguida, use **Verificar o acesso e listar os modelos**, que confirma que o servidor está acessível e preenche a lista suspensa **Modelo** com os modelos que ele oferece. A lista fica vazia até essa verificação dar certo, então é essa etapa que permite escolher um modelo.

A configuração vale para a instância inteira: depois de ativada pelo administrador, todos os perfis de usuário ganham o chat.

### Chaves de API pessoais

A mesma página oferece a opção **Permitir chaves de API pessoais**. Quando ela está ativada, cada usuário ganha um cartão **O meu assistente de IA** nas próprias configurações, para apontar o chat para o próprio servidor, provedor e chave de API em vez dos configurados para a instância.

## Escolher um modelo

Escolha um modelo que suporte **chamada de ferramentas** (também conhecida como "function calling"), por exemplo `qwen3`, `llama3.1` ou `mistral`. A chamada de ferramentas é o que permite ao assistente navegar pelas suas notas: com um modelo que não a suporta, o chat continua funcionando (um aviso informa isso), mas não consegue acessar suas notas por conta própria.

### Esforço de raciocínio

Modelos de raciocínio (OpenAI GPT-5 e série o, `gpt-oss` no Ollama, ...) aceitam um **esforço de raciocínio** que define quanto tempo o modelo pensa antes de responder. O campo **Esforço de raciocínio** da página de configurações controla isso: **Auto** (o padrão) não envia nada e deixa a escolha para o provedor, enquanto **Nenhum**, **Mínimo**, **Baixo**, **Médio**, **Alto** e **Muito alto** são enviados como o parâmetro `reasoning_effort` de cada requisição. Valores que um modelo não aceita são rejeitados pelo provedor e informados como erro no chat.

Alguns modelos da OpenAI recusam a chamada de ferramentas na API de chat completions, a menos que o esforço de raciocínio seja `none`. O chat então mostra um aviso dizendo que o assistente não pode navegar pelas suas notas: defina **Esforço de raciocínio** como **Nenhum** para recuperar as ferramentas.

### Cabeçalhos personalizados

Um gateway colocado à frente dos modelos (LiteLLM, OpenRouter, Cloudflare AI Gateway, Helicone, ...) espera muitas vezes cabeçalhos próprios, para identificar quem chama ou atribuir o consumo. O campo **Cabeçalhos personalizados** da página de definições recebe-os, um por linha, no formato `Nome: valor`:

```
x-litellm-customer-id: poznote
```

São enviados com cada pedido ao servidor de IA, incluindo a verificação da ligação. O campo é proposto para todos os fornecedores, tanto na configuração da instância como numa configuração pessoal. Com a Anthropic, uma chave de API de organização que não está associada a nenhum workspace precisa de `anthropic-workspace-id: wrkspc_...`. Com a OpenAI, `OpenAI-Organization` e `OpenAI-Project` escolhem a organização ou o projeto faturado.

Os valores são guardados cifrados e nunca mais são mostrados: um cabeçalho guardado aparece como `Nome: ••••••••`. Deixe uma linha como está para manter o seu valor, escreva de novo o valor para o alterar e apague a linha para remover o cabeçalho.

Os cabeçalhos que estruturam o pedido (`Host`, `Content-Type`, `Content-Length`, `Accept`, ...) são recusados, tal como `Authorization`, que é definido pelo campo **Chave de API**. Com a Anthropic, `x-api-key` e `anthropic-version` também são recusados, porque o Poznote os define. Os nomes e os valores estão limitados a caracteres ASCII simples, com 20 cabeçalhos no máximo.

Cada pedido leva também `User-Agent: Poznote/<version>`, para que os registos de um gateway mostrem de onde vem. Uma linha `User-Agent` nos cabeçalhos personalizados substitui-o.

## Instruções personalizadas

Cada utilizador pode dar ao assistente instruções permanentes em **Definições → O meu assistente de IA → Instruções personalizadas**, por exemplo «Quando escrever uma nota em inglês, adicione abaixo a tradução para russo, e vice-versa». O texto (até 4000 caracteres) é enviado ao modelo com cada mensagem, seja qual for a configuração que responde, a da instância ou a sua. Use-o para preferências duradouras como o tom, o idioma ou o formato das notas que o assistente escreve. Não altera o que o assistente pode fazer: as notas continuam a ser modificadas apenas quando o pede. Deixe o campo vazio para não enviar nada.

## Prompts guardados

Os prompts que você envia com frequência, como «Verifique a gramática e a estrutura desta nota e sugira melhorias» ou «Que perguntas de acompanhamento devo fazer?», podem ser salvos em **Definições → O meu assistente de IA → Prompts guardados**: um nome e um texto para cada um, até 30 prompts. No chat, o botão do raio ao lado da entrada mostra a lista, e um clique em um deles envia o texto como a sua mensagem, sobre a nota aberta quando ele fala de «esta nota». O que você estava digitando continua na entrada. Ao contrário das instruções personalizadas, um prompt guardado só é enviado quando você o escolhe. **Gerir os prompts guardados**, no fim da lista, abre as configurações. Para remover um prompt, clique na lixeira dele ou apague o texto e salve.

## Ferramentas externas (servidores MCP)

O assistente pode chamar ferramentas oferecidas por servidores [MCP](https://modelcontextprotocol.io) remotos além das suas, por exemplo um serviço de pesquisa na web, para consultar informações atuais antes de responder ou de escrever uma nota. É o sentido inverso do [servidor MCP do Poznote](MCP-SERVER.pt.md), que permite a outros assistentes aceder às suas notas.

A funcionalidade está desativada por padrão. Um administrador ativa-a em **Configurações → Ferramentas de administração → Assistente IA**, secção **Ferramentas externas**, com **Permitir ferramentas externas**, e adiciona aí os servidores: um nome, o URL do ponto de acesso MCP (por exemplo `https://mcp.exa.ai/mcp`), uma chave de API opcional enviada como token Bearer e cabeçalhos personalizados opcionais para os servidores que esperam a chave de outra forma. O Poznote liga-se ao servidor, lê as ferramentas que ele oferece e lista-as com uma caixa de seleção cada, para que escolha quais o assistente pode chamar. Estes servidores são oferecidos aos utilizadores autorizados a usar o assistente da instância. Com **Permitir que os utilizadores liguem os seus próprios servidores**, cada utilizador recebe também uma secção **Ferramentas externas** em **Definições → O meu assistente de IA**, para servidores usados apenas nas suas próprias conversas.

Só são suportados servidores acessíveis por HTTP (transporte Streamable HTTP) com uma chave de API ou cabeçalhos personalizados: os servidores iniciados como processo local (stdio, `npx ...`) e os que exigem OAuth não são suportados. Tal como o servidor de IA, um servidor MCP é chamado a partir do servidor Poznote, por isso o seu URL tem de ser acessível de dentro do contentor. As ferramentas são lidas ao adicionar um servidor e ao clicar em **Verificar e atualizar ferramentas**: uma ferramenta que o servidor adicione ou reformule mais tarde não é usada até atualizar.

Quando há um servidor ligado, aparece um botão em forma de globo junto ao campo de entrada do chat. Ele ativa e desativa as ferramentas externas, e a escolha fica guardada no seu navegador. Cada chamada é mostrada na conversa com o servidor, a ferramenta e o que lhe foi enviado.

O que uma ferramenta externa devolve vem de fora do Poznote, por exemplo de uma página web, e pode conter texto escrito para enganar o modelo. O assistente tem instruções para o tratar como dados e é guardada uma revisão antes de qualquer nota ser alterada, mas uma instrução não é uma garantia. Para excluir alterações indesejadas, abra **Definições → O meu assistente de IA**, secção **Ferramentas do assistente**, e desmarque as ferramentas da lista **Alterar as suas notas**: o assistente continua a poder ler as suas notas e pesquisar na web, mas já não pode alterar nada. Tenha também em conta que o que o assistente envia a uma ferramenta externa sai da sua instância.

## Servidores locais e rede Docker

O servidor de IA é chamado **a partir do servidor Poznote**, nunca do seu navegador. Como o Poznote é executado em um contêiner Docker, a URL que você configurar precisa estar acessível *de dentro desse contêiner*.

Para um Ollama local, há **duas configurações possíveis**, ambas totalmente suportadas:

| Cenário | URL a configurar | Configuração de rede |
|---|---|---|
| [**Opção 1**: Ollama como contêiner Docker](#opção-1-ollama-como-contêiner-docker-mais-simples) | `http://ollama:11434` | Nenhuma |
| [**Opção 2**: Ollama instalado no host](#opção-2-ollama-instalado-no-host) | O endereço do seu host, visto de dentro do contêiner | Necessária, é a parte em que muita gente se atrapalha |

Escolha a opção 1 se estiver começando do zero. Escolha a opção 2 se o Ollama já estiver instalado na sua máquina ou também for usado por outros aplicativos.

### Opção 1: Ollama como contêiner Docker (mais simples)

De longe, a configuração mais fácil é não envolver o host: adicione o Ollama como mais um serviço no mesmo `docker-compose.yml` do Poznote:

```yaml
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: always
    volumes:
      - "./ollama:/root/.ollama"
```

depois inicie-o e baixe um modelo:

```bash
docker compose up -d
docker exec ollama ollama pull qwen3
```

Nas configurações do Assistente IA, substitua a URL pré-preenchida por `http://ollama:11434`. Os serviços de um mesmo arquivo compose compartilham uma rede Docker e se alcançam pelo nome do serviço, então não há mais nada a configurar: nenhuma porta a publicar, nenhum `OLLAMA_HOST` a definir, e o Ollama nunca fica exposto fora da rede Docker. Se o seu arquivo compose define `networks` personalizadas, coloque o `ollama` na mesma rede que o serviço do Poznote.

Para aceleração por GPU dentro do contêiner, consulte a [documentação da imagem Docker do Ollama](https://hub.docker.com/r/ollama/ollama).

### Opção 2: Ollama instalado no host

Se o Ollama é executado diretamente na máquina host (instalação padrão a partir de [ollama.com](https://ollama.com)) ou se você usa o LM Studio, o Poznote também consegue alcançá-lo, mas o contêiner precisa encontrar o caminho de volta até o host pela rede Docker. As subseções abaixo explicam como.

#### Por que `localhost` não funciona

`http://localhost:11434` ou `http://127.0.0.1:11434` **não** vão funcionar: dentro do contêiner, `localhost` é o próprio contêiner, não a máquina onde o Ollama roda. O Docker dá a cada contêiner sua própria pilha de rede isolada: mesma máquina física, dois "localhost" diferentes.

Para chegar ao host, o contêiner precisa passar pelo **gateway** da sua rede Docker, que é um endereço IP pertencente ao host.

#### Encontrar a URL certa

O Poznote pré-preenche o campo de URL com a melhor estimativa do endereço do seu host Docker, nesta ordem:

1. `host.docker.internal`, se esse nome for resolvido dentro do contêiner (sempre no Docker Desktop para Windows/macOS; no Linux, só se você o mapear, veja abaixo);
2. caso contrário, o IP do gateway padrão do contêiner (por exemplo `http://172.17.0.1:11434`), lido da tabela de rotas dele.

A URL pré-preenchida geralmente funciona de primeira. Se precisar conferir por conta própria, a partir do host:

```bash
docker exec <poznote-webserver-container> ip route | grep default
# default via 172.17.0.1 dev eth0   ← o IP do gateway é o seu host, visto de dentro do contêiner
```

No Linux, você pode disponibilizar `host.docker.internal` (como no Docker Desktop) adicionando isto ao serviço `webserver` do seu `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

e depois `docker compose up -d`. A URL passa a ser `http://host.docker.internal:11434`, estável e idêntica em todas as máquinas.

#### Fazer o Ollama escutar o contêiner

Por padrão, o Ollama escuta apenas em `127.0.0.1`, o loopback do host, que é inacessível para qualquer contêiner, mesmo com o IP de gateway certo. Você precisa definir `OLLAMA_HOST` para que ele escute em uma interface que o contêiner consiga alcançar.

Com a instalação padrão no Linux (systemd):

```bash
sudo systemctl edit ollama
```

adicione:

```ini
[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
```

depois:

```bash
sudo systemctl restart ollama
```

Em qual endereço escutar:

- **`172.17.0.1` (a bridge `docker0`, recomendado no Linux)**: acessível a partir de todos os contêineres, existe em toda instalação do Docker e não fica exposto ao mundo externo. Confira o IP da sua `docker0` com `ip addr show docker0` (é `172.17.0.1`, a menos que você tenha personalizado os pools de endereços do Docker).
- **`0.0.0.0`** (todas as interfaces): o mais simples, mas expõe o Ollama em **todas** as interfaces da máquina. O Ollama não tem autenticação, então, se a sua máquina tiver um IP público, use isso apenas atrás de um firewall que bloqueie a porta (por exemplo `ufw deny 11434`). Sem problema em uma máquina doméstica atrás de NAT.
- O gateway de uma rede Compose específica (por exemplo `192.168.48.1`): funciona, mas essas sub-redes são atribuídas automaticamente pelo Docker quando a rede é criada e podem mudar se a rede for recriada, então evite essa opção.

No Docker Desktop (Windows/macOS) com o Ollama rodando no host, `OLLAMA_HOST=0.0.0.0` é a escolha habitual; normalmente a máquina não fica diretamente exposta, e `host.docker.internal` então a alcança sem nenhuma configuração extra.

O **LM Studio** funciona do mesmo jeito: nas configurações do servidor dele, ative "Serve on Local Network" (equivalente a escutar em `0.0.0.0`); caso contrário, ele só vai escutar em `127.0.0.1`.

#### Verificar a conectividade

A partir do host, verifique em que endereço o Ollama realmente está escutando:

```bash
ss -tlnp | grep 11434
```

e teste a URL exata que o Poznote vai usar, de dentro do contêiner:

```bash
docker exec <poznote-webserver-container> curl -s -m 3 http://172.17.0.1:11434/
# "Ollama is running"
```

Se isso não retornar nada, o problema está no endereço de escuta do Ollama ou em um firewall, não no Poznote. O botão **Verificar o acesso e listar os modelos** da página de configurações faz a mesma verificação e, quando dá certo, preenche a lista de modelos.

## Erros de conexão

Uma requisição que falha antes de o servidor de IA ter respondido qualquer coisa (tempo de DNS esgotado, conexão recusada, negociação TLS que nunca termina) é enviada novamente de forma automática, até três tentativas seguidas com uma breve pausa entre elas. Enquanto isso o chat mostra uma linha *tentando novamente*, e nada se perde porque o servidor não tinha começado a responder. Se a última tentativa também falhar, o erro aparece no chat com um botão **Tentar novamente** que envia a mesma mensagem outra vez sem precisar digitá-la de novo.

Um erro que ocorre depois que a resposta já começou a chegar não é repetido, já que parte da resposta já está na tela: use o botão **Tentar novamente**.

## Privacidade

O servidor de IA é chamado a partir do servidor Poznote, nunca do seu navegador. Com uma instância local do Ollama ou do LM Studio, suas notas e conversas nunca saem da sua máquina. Com um provedor na nuvem, as partes das suas notas que o assistente lê para responder são enviadas a esse provedor. Com as ferramentas externas ativadas, o que o assistente lhes envia, por exemplo uma consulta de pesquisa, vai para os servidores que ligou.
