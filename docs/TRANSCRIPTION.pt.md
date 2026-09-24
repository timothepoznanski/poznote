<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Transcrição no Poznote (fala para texto)

Dite uma nota, ou transforme um anexo de áudio em texto, usando um servidor de fala para texto que você mesmo hospeda.

O Poznote não embute nenhum modelo de fala. Ele envia o áudio para um servidor que expõe a API de áudio da OpenAI, `POST /v1/audio/transcriptions`, como um Whisper auto-hospedado. Rode esse servidor ao lado do Poznote e o áudio nunca sai da sua máquina.

> [!TIP]
> Isso é independente do [Assistente IA](AI-ASSISTANT.pt.md). Os dois são configurados separadamente e podem usar servidores diferentes, ou você pode ativar um sem o outro.

- [Início rápido](#início-rápido)
- [O que ela faz](#o-que-ela-faz)
- [Configurações](#configurações)
- [Rodar um servidor de transcrição](#rodar-um-servidor-de-transcrição)
- [Acessar o servidor a partir do Poznote](#acessar-o-servidor-a-partir-do-poznote)
- [Limites](#limites)
- [Requisitos do navegador](#requisitos-do-navegador)
- [Servidores pessoais](#servidores-pessoais)
- [Privacidade e o que é armazenado](#privacidade-e-o-que-é-armazenado)
- [Solução de problemas](#solução-de-problemas)
- [Remover](#remover)

## Início rápido

O caminho mais curto, com o [Speaches](https://github.com/speaches-ai/speaches) rodando no mesmo projeto Docker Compose que o Poznote. Todos os comandos abaixo foram executados exatamente como estão escritos.

**1. Adicione o servidor ao seu `docker-compose.yml`**, como um novo serviço ao lado de `webserver`, e declare o volume dele no final do arquivo:

```yaml
services:
  # ... webserver e mcp-server continuam como estão ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

Não há seção `ports:` de propósito: o Poznote acessa o servidor pela rede interna do projeto, e nada fica exposto para fora. Veja [por que isso importa](#acessar-o-servidor-a-partir-do-poznote).

**2. Inicie o serviço:**

```bash
docker compose up -d speaches
```

A imagem tem cerca de 2 GB.

**3. Baixe um modelo.** O Speaches começa sem nenhum modelo e não baixa nenhum sozinho: uma transcrição pedida a um modelo que ele não baixou falha com `Model '...' is not installed locally`. Baixe um pelo contêiner do Poznote, que está na mesma rede:

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Depois de alguns segundos, ele responde `Model 'Systran/faster-whisper-small' downloaded` (cerca de 480 MB). O modelo fica no volume `speaches-cache` entre reinicializações.

**4. Configure o Poznote.** Vá em **Configurações → Ferramentas de administração → Transcrição** e:

- ligue a opção **Ativar a transcrição**;
- escolha **Speaches (local)** e defina a URL como `http://speaches:8000`;
- clique em **Verificar o acesso e listar os modelos** e escolha `Systran/faster-whisper-small` em **Modelo**;
- marque os usuários autorizados a usá-la, incluindo você;
- salve.

**5. Experimente.** Recarregue uma nota por HTTPS (ou por `localhost`, veja os [requisitos do navegador](#requisitos-do-navegador)), digite `/dict`, permita o microfone, fale e pare.

## O que ela faz

Depois de configurada, a transcrição aparece em dois lugares.

### Ditar

O ditado passa por **Gravar áudio**, em **Inserir** e **Mídia** no menu de comandos de toda nota, tanto em texto formatado quanto em Markdown, e na barra de edição acima do teclado no celular. Digitar `/dict`, `/voice` ou `/transcribe` encontra o item diretamente, já que o filtro também pesquisa nos submenus.

Uma caixa de diálogo se abre, e a gravação começa quando você toca em **Iniciar**, que é também quando o navegador pede o microfone pela primeira vez. Uma barra de nível mostra que o microfone está realmente captando algo, e o cronômetro mostra o tempo decorrido em relação à duração máxima definida pelo administrador, por exemplo `1:12 / 10:00`.

Quando a transcrição está disponível, um menu **Idioma falado** fica abaixo do cronômetro. Ele começa no idioma definido na configuração, marcado como padrão, e mudá-lo vale apenas para esta gravação. **Detectar automaticamente** deixa o servidor reconhecer o idioma mesmo quando a configuração define um.

O que acontece com a gravação é escolhido quando você a para. **Inserir o áudio** a coloca na nota como um reprodutor de áudio, sem transcrição. **Transcrever** a envia ao servidor, e só aparece quando a transcrição está disponível para você. Quando a gravação atinge a duração máxima, ela para sozinha e espera um dos dois botões.

A transcrição volta em uma caixa de texto onde você pode corrigi-la antes que ela entre na nota. **Inserir** a coloca onde estava o seu cursor. Se a transcrição falhar, os dois botões voltam, para que a gravação ainda possa entrar como áudio ou ser enviada de novo.

A caixa de seleção **Anexar também a gravação a esta nota** vem desmarcada por padrão, e o áudio é então descartado assim que o texto volta. Marque-a e a gravação também é salva como um anexo comum chamado `dictation-<date>.<ext>`, para você ouvi-la de novo ou transcrevê-la mais tarde com um modelo melhor.

**Cancelar**, Escape ou um clique fora da caixa de diálogo desliga o microfone e descarta a gravação, mesmo no meio.

### Transcrever um anexo de áudio

Na página **Anexos** de uma nota, todo arquivo de áudio ganha um botão cinza de microfone, entre baixar e excluir. É o botão ideal para um memorando de voz gravado no celular e enviado ao Poznote.

Ele leva você de volta à nota e abre a mesma caixa de diálogo: o arquivo é transcrito a partir do armazenamento, sem ser enviado de novo, e o texto é apresentado para revisão. **Inserir** o coloca logo depois do anexo quando a nota faz referência a ele, e no final da nota caso contrário.

Um arquivo conta como áudio quando o nome termina em `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac` ou `aac`, ou quando o tipo registrado é `audio/...`. A extensão prevalece sobre o tipo de propósito: o Windows envia um `.m4a` do Gravador de Voz como `video/mp4`. Arquivos de vídeo (`mp4`, `webm`) não são oferecidos, embora contenham som.

Se a nota estiver aberta e sendo editada em outro lugar, o texto não é inserido: ele fica na caixa para você copiá-lo.

## Configurações

Tudo fica em **Configurações → Ferramentas de administração → Transcrição** (apenas administradores).

| Configuração | O que faz |
|---|---|
| **Ativar a transcrição** | Chave geral da configuração da instância abaixo. |
| **Usuários autorizados** | Perfis que podem usar o servidor da instância. Ninguém tem acesso até ser marcado, inclusive os novos perfis. |
| **Servidor de transcrição** | Predefinições que preenchem a URL e mostram ou ocultam a chave de API: Speaches, whisper.cpp, LocalAI, OpenAI ou Outro. |
| **URL do servidor** | URL base do servidor, por exemplo `http://speaches:8000`. `/v1` e o caminho completo `/v1/audio/transcriptions` também são aceitos. |
| **Chave de API** | Enviada como `Authorization: Bearer`. Servidores locais geralmente não precisam de nenhuma; a OpenAI precisa. |
| **Verificar o acesso e listar os modelos** | Confirma que o servidor responde e preenche as sugestões de modelo. |
| **Modelo** | O nome do modelo enviado em cada requisição. Obrigatório para todos os servidores, mesmo os que o ignoram. |
| **Idioma falado** | Código de duas letras como `en`, `fr` ou `de`, ou vazio para deixar o servidor detectá-lo. A janela de gravação o pré-seleciona, e o menu dela permite trocá-lo para uma gravação. |
| **Duração máxima da gravação** | Em minutos, de 1 a 60, 10 por padrão. **Gravar áudio** para sozinho quando chega lá, e então espera **Inserir o áudio** ou **Transcrever**. Sem transcrição, ele insere o áudio na hora. Os anexos não são afetados. |
| **Permitir servidores de transcrição pessoais** | Permite que cada usuário defina seu próprio servidor, veja [Servidores pessoais](#servidores-pessoais). |

### Escolher um modelo

O campo de modelo é texto livre com sugestões em vez de uma lista suspensa, porque nem todo servidor lista seus modelos (o whisper.cpp não lista). No Speaches, a verificação lista apenas modelos de reconhecimento de fala e deixa de fora qualquer voz de síntese de fala que você tenha baixado.

Modelos maiores são mais precisos e mais lentos. Em CPU, `small` é o meio-termo habitual. A diferença não é sutil: na mesma frase em francês, `Systran/faster-whisper-tiny` retornou "ceci est en test de dicter vocale d'opposnade", enquanto `Systran/faster-whisper-small` retornou "ceci est un test de dictée vocale". Modelos maiores, como `large-v3`, lidam ainda melhor com sotaques e ruído, mas precisam de uma GPU para continuar confortáveis.

Para dar uma ideia, em uma CPU de 4 núcleos com `small`: uma frase curta leva cerca de 6 segundos, e a primeira requisição depois que o servidor inicia leva cerca de 20, enquanto o modelo é carregado na memória. O Speaches usa cerca de 1,5 GB de RAM com `small` carregado.

### Idioma falado

Deixe **Idioma falado** vazio e o servidor detecta o idioma, algo que o Whisper faz bem. Defina um código quando você sempre dita no mesmo idioma e frases curtas são confundidas com outro.

## Rodar um servidor de transcrição

O Poznote precisa de um servidor que aceite `POST /v1/audio/transcriptions` como dados de formulário multipart com os campos `file`, `model`, `response_format=json` e, opcionalmente, `language`, e que responda `{"text": "..."}`.

### Speaches (recomendado)

A opção mais completa: lista seus modelos, pode manter vários e lê WebM (o que o Chrome e o Firefox gravam), M4A e WAV sem configuração extra. O [Início rápido](#início-rápido) o instala com Docker Compose.

Gerenciar os modelos, a partir do contêiner do Poznote:

```bash
# Ver o que pode ser baixado
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# Baixar, listar, excluir
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Baixar exige acesso à internet a partir do contêiner do Speaches. Transcrever não.

Com uma GPU NVIDIA, use a imagem CUDA em vez de `latest-cpu` e dê ao serviço acesso à GPU; veja a [documentação do Speaches](https://speaches.ai).

### whisper.cpp

Mais leve que o Speaches, com um modelo por servidor e sem listagem de modelos. Funciona bem com o Poznote, mas só com as flags certas: por padrão ele não atende a rota da OpenAI, não entende nenhum idioma além do inglês e não aceita nenhum formato além de WAV.

**1. Adicione o serviço** ao `docker-compose.yml`:

```yaml
services:
  whisper:
    image: ghcr.io/ggml-org/whisper.cpp:main
    restart: always
    volumes:
      - "whisper-models:/models"
    command: ["/app/build/bin/whisper-server -m /models/ggml-small.bin -l auto --convert --host 0.0.0.0 --port 8080 --inference-path /v1/audio/transcriptions"]

volumes:
  whisper-models:
```

> [!WARNING]
> Mantenha `command` como uma lista de um único elemento, exatamente como acima. A imagem executa o comando via `bash -c`, e a forma de string simples é dividida em argumentos separados, então o `bash` executa `whisper-server` sem nenhuma flag. Ele então inicia silenciosamente com seus padrões: só inglês, só WAV, escutando em `127.0.0.1` dentro do contêiner, em `/inference`. Nada nos logs indica que algo deu errado.

**2. Baixe um modelo multilíngue** para o volume, antes de iniciar o serviço: o servidor se recusa a iniciar sem o arquivo do modelo, e a imagem só traz `ggml-base.en.bin`, que entende inglês e nada mais.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. Inicie o serviço:**

```bash
docker compose up -d whisper
```

Para que serve cada flag:

| Flag | Padrão | Por que o Poznote precisa dela |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | O modelo incluído é só em inglês. |
| `-l auto` | `en` | Sem ela, a fala em qualquer outro idioma volta deturpada em inglês. |
| `--convert` | desativada | Os navegadores gravam WebM e os celulares produzem M4A; sem ela, só WAV é aceito. Usa o ffmpeg incluído na imagem. |
| `--host 0.0.0.0` | `127.0.0.1` | Caso contrário, nada fora do contêiner consegue acessá-lo. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | A rota que o Poznote chama. |

**4. No Poznote**, escolha **whisper.cpp (local)**, defina a URL como `http://whisper:8080` e digite qualquer nome de modelo: o whisper.cpp o ignora e usa o arquivo com que foi iniciado, mas o campo é obrigatório. **Verificar o acesso e listar os modelos** informa então que o servidor não lista nenhum modelo, que é a resposta esperada de um whisper.cpp funcionando.

### OpenAI

Escolha **OpenAI**: a URL é definida para você, e uma chave de API é obrigatória. Use um dos modelos de transcrição da OpenAI, por exemplo `whisper-1`. O áudio é enviado à OpenAI.

### LocalAI e outros servidores

O LocalAI e outros servidores compatíveis com OpenAI funcionam pelas predefinições **LocalAI** ou **Outro**, desde que respeitem o formato de requisição descrito no início desta seção. A instalação deles não é detalhada aqui; consulte a documentação de cada um, por exemplo a [do LocalAI](https://localai.io).

## Acessar o servidor a partir do Poznote

O Poznote chama o servidor de transcrição a partir do próprio contêiner, nunca do seu navegador. Portanto, a URL precisa ser acessível de dentro do contêiner do Poznote, e `localhost` ali significa o próprio contêiner do Poznote.

**Recomendado: a mesma rede Docker, sem porta publicada.** Os serviços de um mesmo projeto Compose compartilham uma rede e se acessam pelo nome do serviço. É assim que o serviço `mcp-server` do `docker-compose.yml` padrão acessa `http://webserver:80`, e é assim que o Poznote acessa `http://speaches:8000` ou `http://whisper:8080` acima.

> [!CAUTION]
> Não adicione `ports: - "8000:8000"` ao servidor de transcrição em uma máquina com IP público. O Speaches e o whisper.cpp não têm autenticação por padrão, então isso publicaria um serviço de transcrição gratuito para a internet inteira. Vinculá-lo a `127.0.0.1:8000:8000` é seguro, mas aí o contêiner do Poznote não consegue acessá-lo; a rede compartilhada não precisa de nenhum dos dois.

Se o servidor rodar como um contêiner separado via `docker run`, conecte-o à rede do Poznote em vez de publicar uma porta. Descubra o nome da rede com:

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

depois inicie o servidor com `--network <that-network>` e use o nome do contêiner dele na URL.

Para um servidor em outra máquina, ou no host Docker fora do Docker, use um endereço que o contêiner do Poznote consiga acessar. Valem as mesmas regras do assistente IA, veja [Servidores locais e rede Docker](AI-ASSISTANT.pt.md#servidores-locais-e-rede-docker).

Para verificar que o servidor responde a partir de onde o Poznote está:

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## Limites

- **Duração da gravação:** a configuração **Duração máxima da gravação**, 10 minutos por padrão. Ela é aplicada no navegador.
- **Tamanho do envio:** 100 MB por gravação ou anexo enviado para transcrição.
- **Tempo de transcrição:** o Poznote espera até 570 segundos pelo servidor, um pouco menos que os 600 segundos que o próprio nginx dele concede a uma requisição, para que uma transcrição lenta termine com uma mensagem legível em vez de uma página de erro crua.
- **Timeout do proxy reverso:** um proxy na frente do Poznote pode cortar a requisição bem antes. O nginx usa 60 segundos por padrão, e o Nginx Proxy Manager, 90. Uma transcrição que demore mais falha então com `HTTP 504`, embora fosse ser concluída. Aumente o timeout de leitura do proxy para o seu host do Poznote (no nginx e na aba **Advanced** do Nginx Proxy Manager: `proxy_read_timeout 600s;`), ou mantenha as gravações curtas o bastante para serem transcritas dentro desse limite.

## Requisitos do navegador

**HTTPS.** Os navegadores só dão acesso ao microfone a uma página em uma origem segura: HTTPS, ou `localhost`. Em `http` simples em qualquer outro endereço, **Gravar áudio** avisa que precisa de HTTPS e não grava nada. Transcrever um anexo não é afetado, já que nada é gravado.

**O cabeçalho `Permissions-Policy`.** O Poznote envia `microphone=(self)`, que permite a própria origem e recusa todas as outras. Se um proxy reverso na frente adicionar o próprio cabeçalho `Permissions-Policy`, ele pode sobrescrever o do Poznote, e um `microphone=()` ali faz o navegador recusar o microfone, seja qual for a permissão do site. A caixa de diálogo então mostra "O Poznote não teve permissão para usar o microfone". Remova o cabeçalho no proxy, ou defina `microphone=(self)` lá também.

## Servidores pessoais

O administrador pode marcar **Permitir servidores de transcrição pessoais**. Cada usuário ganha então um cartão **Meu servidor de transcrição** nas próprias configurações, com os mesmos campos de servidor, URL, chave, modelo e idioma. Quando um usuário o ativa, o áudio dele vai para o servidor dele em vez do servidor da instância, esteja ele ou não na lista de usuários autorizados.

A duração máxima da gravação continua sendo definida pelo administrador.

As chaves de API pessoais são criptografadas em repouso com o segredo da instância, como as chaves do assistente IA e da Sincronização Git.

## Privacidade e o que é armazenado

A gravação é enviada ao Poznote e encaminhada ao servidor de transcrição a partir dali. Isso é proposital: o servidor de transcrição geralmente fica em uma rede que o navegador não consegue acessar, e a chave de API dele não tem nada que chegar a uma página.

O Poznote não guarda nenhuma cópia. O áudio fica no arquivo temporário de upload do PHP durante uma única requisição, a menos que você marque **Anexar também a gravação a esta nota**, o que o salva como um anexo comum que conta para o seu armazenamento.

Com o Speaches ou o whisper.cpp configurado como descrito acima, tudo é processado na sua máquina e nada vai para a internet:

- O navegador grava com o MediaRecorder, não com o reconhecimento de voz embutido do navegador, que enviaria o áudio ao Google ou à Apple.
- A gravação vai apenas para o seu servidor Poznote, e o Poznote a encaminha apenas para a URL configurada na página Transcrição. Nenhum outro servidor é contatado.
- O único acesso à internet é o download do modelo, uma vez, na instalação. A transcrição funciona com o contêiner desconectado da internet.
- O texto transcrito chega à sua nota como texto digitado, e a nenhum outro lugar.

> [!WARNING]
> A predefinição **OpenAI** é a exceção: cada gravação é enviada aos servidores da OpenAI. É a única predefinição que faz isso, e a única cuja URL é fixa e oculta. Se a página Transcrição mostra um campo URL, o áudio fica no servidor dessa URL.

## Solução de problemas

**"O Poznote não teve permissão para usar o microfone", mas o navegador diz que tem**
Algo o está recusando antes de a permissão ser consultada. Verifique o cabeçalho que chega ao navegador:

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

Ele precisa ser `microphone=(self)`. Veja [Requisitos do navegador](#requisitos-do-navegador).

**"O microfone precisa de HTTPS"**
Você está em `http` simples em um endereço que não é `localhost`. Sirva o Poznote por HTTPS.

**Nenhum botão Transcrever ao gravar**
A transcrição está desativada, o seu perfil não está na lista de usuários autorizados, ou a configuração não tem URL ou modelo. O próprio **Gravar áudio** está sempre lá, em **Inserir** e **Mídia**; `/dict` o encontra.

**Nenhum botão de microfone em um anexo**
O arquivo não é reconhecido como áudio (veja a lista em [Transcrever um anexo de áudio](#transcrever-um-anexo-de-áudio)), ou a transcrição não está disponível para o seu perfil.

**"Failed to connect to ..."**
A URL está errada, ou o servidor não está rodando, ou não está em uma rede que o Poznote consiga acessar. Veja [Acessar o servidor a partir do Poznote](#acessar-o-servidor-a-partir-do-poznote).

**"HTTP 404: Model '...' is not installed locally"**
O Speaches não baixou esse modelo. Baixe-o, veja a etapa 3 do [Início rápido](#início-rápido).

**"HTTP 404" na verificação de acesso, com whisper.cpp**
Escolha a predefinição **whisper.cpp** em vez de **Outro**: o whisper.cpp não tem listagem de modelos, e só a predefinição dele interpreta esse 404 como um servidor funcionando. Se as próprias transcrições retornarem 404, o servidor está rodando sem `--inference-path /v1/audio/transcriptions`, o que geralmente significa que `command` foi escrito como string, veja o aviso em [whisper.cpp](#whispercpp).

**Fala em francês (ou em qualquer idioma que não seja inglês) volta em inglês, ou sem sentido**
O whisper.cpp está rodando sem `-l auto`, ou com o modelo incluído `ggml-base.en.bin`. Use um modelo multilíngue e `-l auto`.

**As gravações falham mas arquivos WAV funcionam, no whisper.cpp**
Falta `--convert`.

**"HTTP 504" em gravações mais longas**
Um proxy reverso cortou a requisição antes de a transcrição terminar. Veja o timeout do proxy reverso em [Limites](#limites).

**"O servidor de transcrição não respondeu em 570 segundos"**
A gravação é longa demais para esse modelo nesse hardware. Grave menos de cada vez, reduza a **Duração máxima da gravação**, ou use um modelo menor ou uma GPU.

**"O servidor não ouviu nada nesta gravação"**
O Whisper retornou um texto vazio, a resposta honesta dele ao silêncio. Observe a barra de nível durante a gravação: se ela nunca se mexe, o navegador está usando o dispositivo de entrada errado.

**"Esta nota não pode ser editada daqui neste momento"**
A nota está sendo editada em outro lugar, então o texto não foi inserido. Copie-o da caixa, ou feche o outro editor e tente de novo.

**A primeira transcrição é lenta, as seguintes são rápidas**
O servidor carrega o modelo na memória no primeiro uso, cerca de 20 segundos para `small` em CPU.

## Remover

Desligue **Ativar a transcrição** nas configurações, depois remova o serviço do `docker-compose.yml` e:

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` mostra o nome exato do volume, prefixado com o nome do seu projeto.
