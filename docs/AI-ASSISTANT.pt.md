<!-- lang-selector -->
<p align="center">
  <a href="AI-ASSISTANT.md">English</a> ·
  <a href="AI-ASSISTANT.fr.md">Français</a> ·
  <a href="AI-ASSISTANT.de.md">Deutsch</a> ·
  <a href="AI-ASSISTANT.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="AI-ASSISTANT.ru.md">Русский</a> ·
  <a href="AI-ASSISTANT.zh-cn.md">简体中文</a>
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
- **tarefas**: adicionar, marcar, desmarcar, renomear ou remover as tarefas de uma nota do tipo lista de tarefas, incluindo prazos e lembretes, e marcar ou desmarcar uma caixa de seleção dentro de uma nota comum, sem reescrever o resto dela;
- **excluir**: mover para a lixeira uma nota, ou uma pasta com suas subpastas e todas as notas delas. Tudo pode ser restaurado na página Lixeira: o assistente não tem como excluir nada definitivamente, nem ferramenta para esvaziar a lixeira.

A nota que você tem aberta faz parte do contexto: diga "melhore a formatação desta nota" ou "adicione uma conclusão aqui" e o assistente trabalha nela, sem precisar de id nem de título. Ele lê a última versão salva pelo editor, e "esta nota" acompanha você se abrir outra nota durante a conversa. Citar outra nota na sua pergunta continua tendo prioridade. No Painel nenhuma nota fica aberta, então, ali, indique a nota a que você se refere.

Duas linhas acima do campo de entrada mostram com o que o assistente está trabalhando: o **espaço de trabalho** em que todas as ferramentas são executadas e a **nota** a que "esta nota" se refere, quando há uma aberta.

Quando o assistente edita ou cria uma nota, a nota aberta e a barra lateral são atualizadas sozinhas assim que a resposta termina, sem precisar recarregar a página. Se você tiver alterações não salvas na nota que ele acabou de editar, aparece um banner no lugar disso: recarregue a nota ou mantenha e salve a sua própria versão.

O assistente lê e escreve o conteúdo das notas em Markdown. Notas em rich text (HTML) são convertidas na hora, nos dois sentidos, com o mesmo conversor da ação **Converter nota**, de modo que uma reescrita preserva títulos, listas, links, tabelas e imagens; a formatação rica, como cores ou fontes, não é preservada. Uma nota longa demais para o assistente ler por inteiro é recusada para reescrita, em vez de ser truncada.

Antes de o assistente alterar o conteúdo de uma nota (reescrita, caixa de seleção, tarefa), o Poznote cria um instantâneo da versão atual, identificado como "Antes da alteração pela IA" no menu **Instantâneos** da nota. Se o resultado não for o que você queria, restaure esse instantâneo. O instantâneo não é criado quando o mais recente já contém o mesmo conteúdo, uma única resposta que altera a mesma nota várias vezes gera apenas um, e os 20 mais recentes são mantidos por nota, um número que você pode alterar em **Configurações → Instantâneos** (de 1 a 200).

O assistente fica **limitado ao espaço de trabalho atual**: ele só vê, pesquisa e edita as notas do espaço de trabalho em que você abriu o chat, e as novas notas são criadas nele. Para perguntar sobre outro espaço de trabalho, mude para ele primeiro. Em um Painel que mostra vários espaços de trabalho, o primeiro clique no botão informa em qual espaço de trabalho o assistente vai agir e pergunta se você deseja continuar.

A conversa é mantida enquanto a aba do navegador ficar aberta (ela sobrevive a recarregamentos da página) e pode ser apagada a qualquer momento com o botão de lixeira no cabeçalho do painel.

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

## Privacidade

O servidor de IA é chamado a partir do servidor Poznote, nunca do seu navegador. Com uma instância local do Ollama ou do LM Studio, suas notas e conversas nunca saem da sua máquina. Com um provedor na nuvem, as partes das suas notas que o assistente lê para responder são enviadas a esse provedor.
