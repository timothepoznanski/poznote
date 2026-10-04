<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <a href="WEBHOOKS.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Webhooks

O Poznote pode notificar serviços externos quando algo acontece na instância, enviando **webhooks de saída**: requisições HTTP POST com um payload JSON, entregues aos endpoints que você cadastrar. Isso facilita integrar o Poznote a ferramentas de automação como n8n, Zapier ou seus próprios scripts.

O Poznote apenas **emite** webhooks. O que o endpoint receptor faz com eles (enviar um e-mail, disparar um fluxo de trabalho, registrar o evento, ...) fica inteiramente a cargo do receptor e acontece fora do Poznote.

## Sumário

- [Visão geral](#visão-geral)
- [Gerenciar webhooks](#gerenciar-webhooks)
- [Entrega](#entrega)
  - [Formato da requisição](#formato-da-requisição)
  - [Envelope do payload](#envelope-do-payload)
  - [Verificar a assinatura](#verificar-a-assinatura)
  - [Garantias de entrega](#garantias-de-entrega)
- [Links diretos para notas (URL da instância)](#links-diretos-para-notas-url-da-instância)
- [Objetos comuns do payload](#objetos-comuns-do-payload)
  - [O objeto data.user](#o-objeto-datauser)
  - [O objeto data.note](#o-objeto-datanote)
- [Referência de eventos](#referência-de-eventos)
  - [Eventos da instância](#eventos-da-instância)
  - [Eventos do usuário](#eventos-do-usuário)
  - [Ping de teste](#ping-de-teste)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Exemplo de receptor](#exemplo-de-receptor)

## Visão geral

Existem dois níveis independentes de webhooks:

| Nível | Gerenciado em | Quem | Eventos |
|---|---|---|---|
| **Webhooks de administrador** | **Configurações > Ferramentas de administração > Webhooks de administrador** | Apenas administradores | Eventos da instância: `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached` |
| **Webhooks de usuário** | **Configurações > Webhooks de usuário** | Todas as contas (a menos que bloqueado pelo isolamento de contas) | Eventos sobre o próprio conteúdo da conta: `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

A regra de isolamento é rigorosa: um evento de usuário só é entregue aos endpoints cadastrados pela conta que o gerou. As notas e os lembretes de um usuário nunca chegam aos endpoints de outro usuário. Os eventos da instância vão para todos os webhooks de administrador inscritos.

## Gerenciar webhooks

Na página de webhooks (de administrador ou de usuário), cada webhook é definido por:

- **URL do endpoint**: precisa começar com `http://` ou `https://`.
- **Descrição** (opcional): uma breve anotação sobre a finalidade do endpoint, por exemplo "fluxo do n8n que arquiva as novas notas no Notion". Ela aparece na lista para distinguir vários endpoints e nunca é enviada ao endpoint.
- **Segredo** (opcional): quando definido, cada entrega é assinada com HMAC-SHA256 para que o receptor possa autenticar o remetente. Veja [Verificar a assinatura](#verificar-a-assinatura).
- **Eventos**: o subconjunto de eventos em que esse endpoint está inscrito.

Cada webhook cadastrado tem um menu de ações (o botão **...** na sua linha) que oferece:

- **Editar**: alterar a URL do endpoint, a descrição, o segredo e os eventos inscritos. O formulário abre logo abaixo do webhook, preenchido com os valores atuais.
- **Enviar teste**: envia imediatamente um evento [ping](#ping-de-teste) e mostra o resultado HTTP.
- **Desativar** / **Ativar**: interromper ou retomar as entregas sem excluir o cadastro.
- **Excluir**: remover o webhook, após uma confirmação.

A página também mostra o resultado da última entrega de cada webhook (código de status HTTP, ou o erro quando o endpoint não pôde ser acessado) e o horário dela.

É permitido cadastrar a mesma URL duas vezes, mas cada entrada recebe a própria entrega para cada evento em que está inscrita, então o endpoint verá duplicatas.

## Entrega

### Formato da requisição

Cada entrega é um `POST` HTTP com corpo JSON e os seguintes cabeçalhos:

| Cabeçalho | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | O nome do evento, por exemplo `note.created` |
| `X-Poznote-Delivery` | O id único da entrega (mesmo valor que `delivery_id` no corpo) |
| `X-Poznote-Signature-256` | `sha256=<hex HMAC>` do corpo bruto. Presente apenas quando o webhook tem um segredo |

### Envelope do payload

Todos os payloads compartilham o mesmo envelope; só `data` muda de um evento para outro:

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `event` | string | Nome do evento, veja a [Referência de eventos](#referência-de-eventos) |
| `delivery_id` | string | 32 caracteres hexadecimais, único por entrega. Dois webhooks que recebem o mesmo evento recebem ids diferentes |
| `created_at` | string | Horário da entrega no formato ISO 8601 (UTC) |
| `data` | object | Payload específico do evento, descrito para cada evento abaixo |

### Verificar a assinatura

Quando o webhook tem um segredo, o Poznote envia `X-Poznote-Signature-256: sha256=<signature>`, em que a assinatura é o HMAC-SHA256 do **corpo bruto da requisição** calculado com o segredo como chave (o mesmo esquema dos webhooks do GitHub). Verifique-a sobre os bytes brutos, antes de qualquer parsing do JSON, e use uma comparação em tempo constante:

```js
// Node.js
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader
    && expected.length === signatureHeader.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

```python
# Python
import hashlib, hmac

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")
```

Requisições sem uma assinatura válida devem ser rejeitadas: qualquer pessoa que descubra a URL do endpoint pode enviar eventos falsos para ela via POST.

### Garantias de entrega

- A entrega é feita **na base do melhor esforço e de forma síncrona**, com um timeout de 5 segundos para a conexão e para a resposta. Um endpoint lento ou com falha nunca quebra a ação (um cadastro, a criação de uma nota) que gerou o evento.
- Uma entrega é considerada bem-sucedida com qualquer resposta **2xx**. Os redirecionamentos **não são seguidos**.
- As entregas com falha de eventos da instância, `note.created` e `note.shared` **não são repetidas**.
- **Os eventos de lembrete são a exceção**: são entregues *pelo menos uma vez*. Um lembrete só é marcado como enviado quando todos os endpoints inscritos o aceitaram; caso contrário, o evento inteiro é reenviado pelo worker em segundo plano (até 5 tentativas, com 5 minutos de intervalo). Endpoints saudáveis podem, portanto, receber duplicatas de um evento de lembrete e devem eliminá-las com base em `data.reminder.id`.
- Os lembretes que já estavam vencidos antes de a conta cadastrar seu primeiro webhook de lembrete são ignorados, então ativar os webhooks não inunda o endpoint com todo o acúmulo pendente.

## Links diretos para notas (URL da instância)

Os payloads que fazem referência a uma nota podem trazer um link direto em `data.note.url`, no formato:

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

O link é montado a partir da **URL da instancia**, a URL pública da sua instância do Poznote, configurada na seção **URL da instancia** de **Configurações > Ferramentas de administração > Webhooks de administrador** (apenas administradores). É o mesmo valor da URL da instância usada pelos e-mails de lembrete, então defini-la em um lugar a define para os dois. Ela também pode ser definida pela API REST (configuração `smtp_app_url`) ou, como alternativa, com a variável de ambiente `POZNOTE_APP_URL` (ou `APP_URL`).

Quando nenhuma URL da instância está configurada, `data.note.url` é `null` e os payloads não trazem nenhum link.

## Objetos comuns do payload

### O objeto data.user

Os eventos da instância descrevem a conta em questão com um objeto `user`:

```json
{
  "user": {
    "id": 7,
    "username": "nina",
    "email": "nina@example.com",
    "first_name": "Nina",
    "last_name": "Martin",
    "source": "admin"
  }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | integer | Id do usuário no Poznote |
| `username` | string | Nome de usuário de login |
| `email` | string ou null | Endereço de e-mail, `null` quando o perfil não tem nenhum |
| `first_name` | string | Nome, pode estar vazio |
| `last_name` | string | Sobrenome, pode estar vazio |
| `source` | string | Quem ou o que disparou o evento. Presente nos eventos `user.*`, ausente nos eventos de cota. Valores: `admin` (interface de administração), `api` (API REST), `oidc` (login SSO ou provisionamento automático), `self` (o próprio usuário agindo sobre a sua conta) |

O objeto de usuário nunca contém senhas, hashes de senha nem tokens OIDC.

### O objeto data.note

Os eventos de usuário descrevem a nota em questão com um objeto `note`. Os campos exatos dependem do evento (cada evento abaixo mostra o próprio exemplo) e vêm desta lista:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | integer | Id da nota, utilizável com a [API REST](API-REST.md) (`GET /api/v1/notes/{id}`) |
| `heading` | string | Título da nota |
| `type` | string | `note` (HTML) ou `markdown` |
| `workspace` | string | Espaço de trabalho que contém a nota |
| `folder` | string | Pasta que contém a nota |
| `created` | string | Data e hora de criação |
| `url` | string ou null | Link direto para a nota, `null` quando nenhuma [URL da instância](#links-diretos-para-notas-url-da-instância) está configurada |

O **conteúdo da nota nunca é enviado**, apenas os metadados.

## Referência de eventos

### Eventos da instância

Gerenciados em **Configurações > Ferramentas de administração > Webhooks de administrador**. Entregues a todos os webhooks de administrador inscritos.

#### user.created

Uma conta de usuário foi criada: por um administrador, pela API REST ou por um cadastro SSO com provisionamento automático.

```json
{
  "event": "user.created",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "user": {
      "id": 7,
      "username": "nina",
      "email": "nina@example.com",
      "first_name": "Nina",
      "last_name": "Martin",
      "language": "fr",
      "source": "oidc"
    }
  }
}
```

`data.user.source` é `admin`, `api` ou `oidc`.

`data.user.language` é o código do idioma de interface armazenado para a conta, com o padrão
`en` quando a conta ainda não definiu uma preferência de idioma.

#### user.updated

Um perfil de usuário foi alterado: nome de usuário, e-mail, nome, sobrenome ou função de administrador. Não é emitido quando nada mudou de fato.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| Campo | Descrição |
|---|---|
| `data.user` | O perfil **depois** da atualização |
| `data.changed_fields` | Array que lista o que mudou, entre `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source` é `admin`, `api`, `oidc` ou `self`.

#### settings.language_changed

O idioma de interface de um usuário foi alterado explicitamente nas configurações (ou pela API REST `PUT /api/v1/settings/language`). A adoção automática do idioma do navegador no login não emite esse evento por si só, mas confirmar o idioma detectado no guia de início emite. Fora do guia de início, nada é emitido quando o idioma selecionado é o que já está em uso. O evento é entregue a todos os webhooks de administrador inscritos.

```json
{
  "data": {
    "user": {
      "id": 7,
      "username": "nina",
      "email": "nina@example.com",
      "first_name": "Nina",
      "last_name": "Martin"
    },
    "language": "fr",
    "previous_language": "en",
    "source": "ui"
  }
}
```

| Campo | Descrição |
|---|---|
| `data.user` | O perfil da conta que alterou o idioma |
| `data.language` | O código do novo idioma de interface (`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | O idioma antes da alteração, `null` quando a conta ainda não tinha nenhum armazenado |
| `data.source` | `ui` (interface web) ou `api` (cliente da API REST autenticado com credenciais Basic ou Bearer) |

#### user.activated / user.deactivated

Uma conta de usuário foi reativada, ou desativada e não pode mais fazer login. Quando o indicador de ativo muda junto com outros campos do perfil, o Poznote emite `user.activated`/`user.deactivated` para o indicador e um `user.updated` separado para o restante.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

Uma conta de usuário foi excluída. O payload traz o perfil **como estava antes da exclusão**. `data.user.source` é `admin`, `api` ou `self` (o usuário excluiu a própria conta).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

Um cadastro SSO foi recusado porque a instância atingiu o número máximo de usuários, para que o operador fique sabendo dos cadastros perdidos em tempo real.

```json
{
  "data": {
    "max_users": 10,
    "attempted": {
      "username": "newcomer",
      "email": "newcomer@example.com"
    }
  }
}
```

| Campo | Descrição |
|---|---|
| `data.max_users` | O limite de usuários configurado |
| `data.attempted.username` | Nome de usuário que o cadastro recusado teria usado, `null` quando desconhecido |
| `data.attempted.email` | E-mail do cadastro recusado, `null` quando desconhecido |

#### quota.notes_reached

Uma ação do usuário foi bloqueada porque a conta atingiu a cota de notas (lixeira incluída).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin" },
    "quota": {
      "max_notes": 500,
      "note_count": 500
    }
  }
}
```

#### quota.storage_reached

Uma ação do usuário (gravação de nota ou envio de anexo) foi bloqueada porque a conta atingiu a cota de armazenamento.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin" },
    "quota": {
      "max_storage_bytes": 1073741824,
      "used_bytes": 1073700000,
      "requested_bytes": 250000
    }
  }
}
```

| Campo | Descrição |
|---|---|
| `data.quota.max_storage_bytes` | O limite configurado em bytes |
| `data.quota.used_bytes` | Uso atual em bytes |
| `data.quota.requested_bytes` | Tamanho da gravação que foi recusada |
| `data.quota.pool` | Presente apenas, com o valor `"s3"`, quando o envio bloqueado visava a cota de anexos no S3 e não o armazenamento local |

> **Limitação de frequência:** os eventos de cota são limitados a no máximo uma entrega por usuário, por tipo de evento, por hora, para que um usuário que esbarra repetidamente no limite não inunde o endpoint. `data.user` não tem o campo `source` nos eventos de cota.

### Eventos do usuário

Gerenciados em **Configurações > Webhooks de usuário**. Entregues apenas aos endpoints cadastrados pela conta que gerou o evento, e é por isso que esses payloads não trazem nenhum objeto `user`: os endpoints pertencem à conta, e o id da nota identifica o alvo.

Um administrador pode bloquear esse recurso para usuários que não são administradores com a opção **Webhooks de usuário** do isolamento de contas (**Configurações > Ferramentas de administração > Isolamento de contas**). Quando bloqueado, os usuários que não são administradores não conseguem abrir a página e os eventos deles não são despachados; os administradores nunca são afetados.

#### note.created

Uma nota foi criada na conta, pela interface ou pela API REST.

```json
{
  "event": "note.created",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "type": "markdown",
      "workspace": "Poznote",
      "folder": "Work",
      "created": "2026-08-09 12:34:56",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "source": "ui"
  }
}
```

`data.source` é `ui` (interface web) ou `api` (cliente da API REST autenticado com credenciais Basic ou Bearer).

#### note.shared

Um link de compartilhamento público foi publicado para uma das notas da conta.

```json
{
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "workspace": "Poznote",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "share": {
      "token": "d41d8cd98f00b204e9800998ecf8427e",
      "url": "https://poznote.example.com/share/d41d8cd98f00b204e9800998ecf8427e",
      "has_password": false,
      "updated": false
    }
  }
}
```

| Campo | Descrição |
|---|---|
| `data.share.token` | Token público de compartilhamento |
| `data.share.url` | URL pública de compartilhamento |
| `data.share.has_password` | Se o link é protegido por senha |
| `data.share.updated` | `false` para uma nota recém-compartilhada, `true` quando a nota já estava compartilhada e o link foi gerado de novo |

#### reminder.due / reminder.due_title / reminder.due_minimal

Um dos lembretes de nota da conta chegou à hora de disparo. O evento é emitido pelo worker de lembretes em segundo plano, independentemente do canal de e-mail, então ele dispara mesmo quando o SMTP não está configurado.

As três variantes permitem escolher quantos dados saem da instância; inscreva-se naquela que convém ao receptor:

**`reminder.due`**, o payload completo, inclui o título da nota e a mensagem do lembrete:

```json
{
  "data": {
    "note": {
      "id": 42,
      "heading": "Meeting notes",
      "workspace": "Poznote",
      "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote"
    },
    "reminder": {
      "id": 17,
      "message": "Prepare the agenda",
      "trigger_at": "2026-08-09 14:00:00"
    }
  }
}
```

**`reminder.due_title`**, mesmo disparo, mas sem a mensagem do lembrete:

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**, apenas identificadores, nenhum conteúdo de nota sai da instância. O receptor pode buscar os detalhes pela [API REST](API-REST.md) se precisar:

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **Entrega pelo menos uma vez:** os eventos de lembrete são reenviados até que todos os endpoints inscritos os aceitem (até 5 tentativas, com 5 minutos de intervalo), então um endpoint pode receber o mesmo lembrete mais de uma vez. Elimine as duplicatas com base em `data.reminder.id`.

### Ping de teste

O botão **Enviar teste** das páginas de webhooks envia um evento `ping` ao endpoint selecionado e informa o resultado HTTP. Ele segue as mesmas regras de envelope e de assinatura dos eventos reais:

```json
{
  "event": "ping",
  "delivery_id": "…",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": {
    "message": "Poznote webhook test"
  }
}
```

## Privacidade e segurança

- **O conteúdo das notas nunca sai da instância.** Os payloads trazem apenas metadados: ids, títulos, espaço de trabalho, pasta, datas e horas. Use `reminder.due_minimal` quando nem os títulos devem chegar ao endpoint.
- **Nenhuma credencial nos payloads.** Os objetos de usuário nunca contêm senhas, hashes nem tokens.
- **Escopo rigoroso por conta.** Os eventos de usuário só são entregues aos endpoints da conta que os gerou.
- **Autentique o remetente.** Defina um segredo e verifique o cabeçalho `X-Poznote-Signature-256` em cada requisição; uma URL de endpoint sozinha deve ser tratada como pública.
- **Isolamento de contas.** A opção "Webhooks de usuário" do isolamento de contas impede que usuários que não são administradores repassem os metadados das suas notas a endpoints externos, com aplicação tanto na interface quanto no momento do despacho.
- As entregas com falha são registradas no log de erros do PHP com a URL do endpoint e o status da falha.

## Exemplo de receptor

Um receptor mínimo em Node.js que verifica a assinatura e reage aos eventos:

```js
const crypto = require('crypto');
const http = require('http');

const SECRET = process.env.POZNOTE_WEBHOOK_SECRET;

http.createServer((req, res) => {
  let chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const sig = req.headers['x-poznote-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.writeHead(401).end();
      return;
    }

    const payload = JSON.parse(raw.toString());
    switch (payload.event) {
      case 'note.created':
        console.log(`New note #${payload.data.note.id}: ${payload.data.note.heading}`);
        break;
      case 'reminder.due':
        console.log(`Reminder: ${payload.data.reminder.message} (note ${payload.data.note.id})`);
        break;
    }

    res.writeHead(200).end('ok');
  });
}).listen(9099);
```

Aponte um webhook para `http://your-host:9099/` com o segredo correspondente, clique em **Enviar teste** e você deverá ver a entrega do `ping` chegar.
