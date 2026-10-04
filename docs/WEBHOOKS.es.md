<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <a href="WEBHOOKS.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Webhooks

Poznote puede avisar a servicios externos cuando ocurre algo en la instancia mediante **webhooks salientes**: peticiones HTTP POST con un payload JSON, entregadas a los endpoints que registres. Así resulta sencillo conectar Poznote con herramientas de automatización como n8n, Zapier o tus propios scripts.

Poznote solo **emite** webhooks. Lo que el endpoint receptor haga con ellos (enviar un correo, lanzar un flujo de trabajo, registrar el evento, ...) depende por completo del receptor y queda fuera de Poznote.

## Índice

- [Descripción general](#descripción-general)
- [Gestión de webhooks](#gestión-de-webhooks)
- [Entrega](#entrega)
  - [Formato de la petición](#formato-de-la-petición)
  - [Estructura del payload](#estructura-del-payload)
  - [Verificar la firma](#verificar-la-firma)
  - [Garantías de entrega](#garantías-de-entrega)
- [Enlaces directos a notas (URL de la instancia)](#enlaces-directos-a-notas-url-de-la-instancia)
- [Objetos comunes del payload](#objetos-comunes-del-payload)
  - [El objeto data.user](#el-objeto-datauser)
  - [El objeto data.note](#el-objeto-datanote)
- [Referencia de eventos](#referencia-de-eventos)
  - [Eventos de instancia](#eventos-de-instancia)
  - [Eventos de usuario](#eventos-de-usuario)
  - [Ping de prueba](#ping-de-prueba)
- [Privacidad y seguridad](#privacidad-y-seguridad)
- [Ejemplo de receptor](#ejemplo-de-receptor)

## Descripción general

Hay dos niveles de webhooks independientes:

| Nivel | Se gestiona desde | Quién | Eventos |
|---|---|---|---|
| **Webhooks de administrador** | **Configuración > Herramientas de administración > Webhooks de administrador** | Solo administradores | Eventos de instancia: `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached` |
| **Webhooks de usuario** | **Configuración > Webhooks de usuario** | Todas las cuentas (salvo que lo bloquee el aislamiento de cuentas) | Eventos sobre el contenido propio de la cuenta: `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

La regla de aislamiento es estricta: un evento de usuario solo se entrega a los endpoints registrados por la cuenta que lo generó. Las notas y los recordatorios de un usuario nunca llegan a los endpoints de otro. Los eventos de instancia van a todos los webhooks de administrador suscritos.

## Gestión de webhooks

Desde la página de webhooks (de administrador o de usuario), cada webhook se define mediante:

- **URL del endpoint**: debe empezar por `http://` o `https://`.
- **Descripción** (opcional): una nota breve sobre la función del endpoint, por ejemplo «flujo de n8n que archiva las notas nuevas en Notion». Se muestra en la lista para distinguir varios endpoints y nunca se envía al endpoint.
- **Secreto** (opcional): si se define, cada entrega se firma con HMAC-SHA256 para que el receptor pueda autenticar al remitente. Consulta [Verificar la firma](#verificar-la-firma).
- **Eventos**: el subconjunto de eventos a los que se suscribe este endpoint.

Cada webhook registrado tiene un menú de acciones (el botón **...** de su fila) que ofrece:

- **Editar**: cambia la URL del endpoint, la descripción, el secreto y los eventos suscritos. El formulario se abre bajo el webhook, rellenado con los valores actuales.
- **Enviar prueba**: envía inmediatamente un evento [ping](#ping-de-prueba) y muestra el resultado HTTP.
- **Desactivar** / **Activar**: detiene o reanuda las entregas sin eliminar el registro.
- **Eliminar**: borra el webhook, previa confirmación.

La página también muestra el resultado de la última entrega de cada webhook (código de estado HTTP, o el error cuando no se pudo contactar con el endpoint) y su fecha y hora.

Se puede registrar la misma URL dos veces, pero cada entrada recibe su propia entrega por cada evento al que está suscrita, así que el endpoint verá duplicados.

## Entrega

### Formato de la petición

Cada entrega es una petición HTTP `POST` con un cuerpo JSON y las siguientes cabeceras:

| Cabecera | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | El nombre del evento, p. ej. `note.created` |
| `X-Poznote-Delivery` | El identificador único de la entrega (el mismo valor que `delivery_id` en el cuerpo) |
| `X-Poznote-Signature-256` | `sha256=<hex HMAC>` del cuerpo sin procesar. Solo está presente cuando el webhook tiene un secreto |

### Estructura del payload

Todos los payloads comparten la misma estructura; solo `data` cambia según el evento:

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `event` | string | Nombre del evento, consulta la [Referencia de eventos](#referencia-de-eventos) |
| `delivery_id` | string | 32 caracteres hexadecimales, único por entrega. Dos webhooks que reciben el mismo evento obtienen identificadores distintos |
| `created_at` | string | Fecha y hora ISO 8601 (UTC) de la entrega |
| `data` | object | Payload específico del evento, descrito más abajo para cada evento |

### Verificar la firma

Cuando el webhook tiene un secreto, Poznote envía `X-Poznote-Signature-256: sha256=<signature>`, donde la firma es el HMAC-SHA256 del **cuerpo de la petición sin procesar** con el secreto como clave (el mismo esquema que los webhooks de GitHub). Verifícala sobre los bytes sin procesar, antes de cualquier análisis del JSON, y usa una comparación de tiempo constante:

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

Las peticiones sin una firma válida deben rechazarse: cualquiera que descubra la URL del endpoint puede enviarle eventos falsos por POST.

### Garantías de entrega

- La entrega es **síncrona y sin garantía (best-effort)**, con un tiempo de espera de 5 segundos para la conexión y la respuesta. Un endpoint lento o que falla nunca interrumpe la acción (un registro, la creación de una nota) que generó el evento.
- Una entrega se considera correcta con cualquier respuesta **2xx**. Las redirecciones **no se siguen**.
- Las entregas fallidas de eventos de instancia, `note.created` y `note.shared` **no se reintentan**.
- **Los eventos de recordatorio son la excepción**: se entregan *al menos una vez*. Un recordatorio solo se marca como enviado cuando todos los endpoints suscritos lo han aceptado; si no, el proceso en segundo plano reintenta el evento completo (hasta 5 intentos, con 5 minutos de intervalo). Por tanto, los endpoints que funcionan bien pueden recibir duplicados de un evento de recordatorio y deben descartarlos basándose en `data.reminder.id`.
- Los recordatorios que ya habían vencido antes de que la cuenta registrara su primer webhook de recordatorios se omiten, para que activar los webhooks no inunde el endpoint con todos los recordatorios pendientes.

## Enlaces directos a notas (URL de la instancia)

Los payloads que hacen referencia a una nota pueden incluir un enlace directo en `data.note.url`, con este formato:

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

El enlace se construye a partir de la **URL de la instancia**, la URL pública de tu instancia de Poznote, configurada en la sección **URL de la instancia** de **Configuración > Herramientas de administración > Webhooks de administrador** (solo administradores). Es el mismo valor que la URL de la instancia que usan los correos de recordatorio, así que al definirla en un sitio queda definida para ambos. También se puede definir mediante la API REST (ajuste `smtp_app_url`) o, como alternativa, con la variable de entorno `POZNOTE_APP_URL` (o `APP_URL`).

Si no hay ninguna URL de la instancia configurada, `data.note.url` es `null` y los payloads no incluyen ningún enlace.

## Objetos comunes del payload

### El objeto data.user

Los eventos de instancia describen la cuenta afectada con un objeto `user`:

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

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | integer | Identificador de usuario de Poznote |
| `username` | string | Nombre de usuario para iniciar sesión |
| `email` | string o null | Dirección de correo electrónico, `null` cuando el perfil no tiene ninguna |
| `first_name` | string | Nombre, puede estar vacío |
| `last_name` | string | Apellido, puede estar vacío |
| `source` | string | Quién o qué desencadenó el evento. Presente en los eventos `user.*`, ausente en los eventos de cuota. Valores: `admin` (interfaz de administración), `api` (API REST), `oidc` (inicio de sesión SSO o aprovisionamiento automático), `self` (el propio usuario actuando sobre su cuenta) |

El objeto de usuario nunca contiene contraseñas, hashes de contraseñas ni tokens OIDC.

### El objeto data.note

Los eventos de usuario describen la nota afectada con un objeto `note`. Los campos exactos dependen del evento (cada evento de abajo muestra su propio ejemplo) y se toman de esta lista:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | integer | Identificador de la nota, utilizable con la [API REST](API-REST.md) (`GET /api/v1/notes/{id}`) |
| `heading` | string | Título de la nota |
| `type` | string | `note` (HTML) o `markdown` |
| `workspace` | string | Espacio de trabajo que contiene la nota |
| `folder` | string | Carpeta que contiene la nota |
| `created` | string | Fecha y hora de creación |
| `url` | string o null | Enlace directo a la nota, `null` cuando no hay ninguna [URL de la instancia](#enlaces-directos-a-notas-url-de-la-instancia) configurada |

El **contenido de la nota nunca se envía**, solo los metadatos.

## Referencia de eventos

### Eventos de instancia

Se gestionan desde **Configuración > Herramientas de administración > Webhooks de administrador**. Se entregan a todos los webhooks de administrador suscritos.

#### user.created

Se creó una cuenta de usuario: por un administrador, a través de la API REST o mediante un registro SSO con aprovisionamiento automático.

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

`data.user.source` es `admin`, `api` u `oidc`.

`data.user.language` es el código del idioma de interfaz guardado para la cuenta, que vale
`en` por defecto cuando la cuenta todavía no ha establecido una preferencia de idioma.

#### user.updated

Cambió un perfil de usuario: nombre de usuario, correo electrónico, nombre, apellido o rol de administrador. No se emite si en realidad no cambió nada.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| Campo | Descripción |
|---|---|
| `data.user` | El perfil **después** de la actualización |
| `data.changed_fields` | Array con lo que cambió, entre `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source` es `admin`, `api`, `oidc` o `self`.

#### settings.language_changed

El idioma de la interfaz de un usuario se cambió explícitamente en la configuración (o a través de la API REST `PUT /api/v1/settings/language`). La adopción del idioma del navegador al iniciar sesión no emite este evento por sí sola, pero confirmar ese idioma detectado en la guía de inicio sí lo hace. Fuera de la guía de inicio, no se emite nada cuando el idioma seleccionado es el que ya está en uso. El evento se entrega a todos los webhooks de administrador suscritos.

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

| Campo | Descripción |
|---|---|
| `data.user` | El perfil de la cuenta que cambió su idioma |
| `data.language` | El nuevo código de idioma de la interfaz (`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | El idioma anterior al cambio, `null` cuando la cuenta todavía no tenía ninguno guardado |
| `data.source` | `ui` (interfaz web) o `api` (cliente de la API REST autenticado con credenciales Basic o Bearer) |

#### user.activated / user.deactivated

Una cuenta de usuario se reactivó, o se desactivó y ya no puede iniciar sesión. Cuando el indicador de cuenta activa cambia a la vez que otros campos del perfil, Poznote emite `user.activated`/`user.deactivated` para el indicador y un `user.updated` aparte para el resto.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

Se eliminó una cuenta de usuario. El payload incluye el perfil **tal como era antes de la eliminación**. `data.user.source` es `admin`, `api` o `self` (el usuario eliminó su propia cuenta).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

Se rechazó un registro SSO porque la instancia alcanzó su número máximo de usuarios, de modo que el operador se entera en tiempo real de los registros perdidos.

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

| Campo | Descripción |
|---|---|
| `data.max_users` | El límite de usuarios configurado |
| `data.attempted.username` | Nombre de usuario que habría usado el registro rechazado, `null` si se desconoce |
| `data.attempted.email` | Correo electrónico del registro rechazado, `null` si se desconoce |

#### quota.notes_reached

Se bloqueó una acción de un usuario porque la cuenta alcanzó su cuota de notas (papelera incluida).

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

Se bloqueó una acción de un usuario (escritura de una nota o subida de un adjunto) porque la cuenta alcanzó su cuota de almacenamiento.

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

| Campo | Descripción |
|---|---|
| `data.quota.max_storage_bytes` | El límite configurado, en bytes |
| `data.quota.used_bytes` | Uso actual, en bytes |
| `data.quota.requested_bytes` | Tamaño de la escritura rechazada |
| `data.quota.pool` | Solo está presente, con el valor `"s3"`, cuando la subida bloqueada afectaba a la cuota de adjuntos S3 en lugar del almacenamiento local |

> **Limitación de frecuencia:** los eventos de cuota se limitan a una entrega como máximo por usuario, por tipo de evento y por hora, para que un usuario que alcanza el límite una y otra vez no inunde el endpoint. `data.user` no tiene campo `source` en los eventos de cuota.

### Eventos de usuario

Se gestionan desde **Configuración > Webhooks de usuario**. Solo se entregan a los endpoints registrados por la cuenta que generó el evento, y por eso estos payloads no incluyen ningún objeto `user`: los endpoints pertenecen a la cuenta, y el identificador de la nota identifica el destino.

Un administrador puede bloquear esta función para los usuarios no administradores con la opción **Webhooks de usuario** del aislamiento de cuentas (**Configuración > Herramientas de administración > Aislamiento de cuentas**). Cuando está bloqueada, los usuarios no administradores no pueden abrir la página y sus eventos no se envían; los administradores nunca se ven afectados.

#### note.created

Se creó una nota en la cuenta, desde la interfaz o desde la API REST.

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

`data.source` es `ui` (interfaz web) o `api` (cliente de la API REST autenticado con credenciales Basic o Bearer).

#### note.shared

Se publicó un enlace público para una de las notas de la cuenta.

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

| Campo | Descripción |
|---|---|
| `data.share.token` | Token público del enlace compartido |
| `data.share.url` | URL pública del enlace compartido |
| `data.share.has_password` | Si el enlace está protegido con contraseña |
| `data.share.updated` | `false` para una nota recién compartida, `true` cuando la nota ya estaba compartida y se regeneró el enlace |

#### reminder.due / reminder.due_title / reminder.due_minimal

Uno de los recordatorios de nota de la cuenta llegó a su hora de activación. El evento lo emite el proceso de recordatorios en segundo plano, con independencia del canal de correo electrónico, así que se dispara aunque SMTP no esté configurado.

Las tres variantes te permiten elegir cuántos datos salen de la instancia; suscríbete a la que mejor se adapte al receptor:

**`reminder.due`**, el payload completo, incluye el título de la nota y el mensaje del recordatorio:

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

**`reminder.due_title`**, el mismo disparador pero sin el mensaje del recordatorio:

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**, solo identificadores, ningún contenido de la nota sale de la instancia. Si lo necesita, el receptor puede obtener los detalles a través de la [API REST](API-REST.md):

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **Entrega al menos una vez:** los eventos de recordatorio se reintentan hasta que todos los endpoints suscritos los aceptan (hasta 5 intentos, con 5 minutos de intervalo), así que un endpoint puede recibir el mismo recordatorio más de una vez. Descarta los duplicados basándote en `data.reminder.id`.

### Ping de prueba

El botón **Enviar prueba** de las páginas de webhooks envía un evento `ping` al endpoint seleccionado e informa del resultado HTTP. Sigue las mismas reglas de estructura y firma que los eventos reales:

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

## Privacidad y seguridad

- **El contenido de las notas nunca sale de la instancia.** Los payloads solo incluyen metadatos: identificadores, títulos, espacio de trabajo, carpeta, fechas y horas. Usa `reminder.due_minimal` cuando ni siquiera los títulos deban llegar al endpoint.
- **Ninguna credencial en los payloads.** Los objetos de usuario nunca contienen contraseñas, hashes ni tokens.
- **Ámbito estricto por cuenta.** Los eventos de usuario solo se entregan a los endpoints de la cuenta que los generó.
- **Autentica al remitente.** Define un secreto y verifica la cabecera `X-Poznote-Signature-256` en cada petición; una URL de endpoint por sí sola debe considerarse pública.
- **Aislamiento de cuentas.** La opción «Webhooks de usuario» del aislamiento de cuentas impide que los usuarios no administradores envíen los metadatos de sus notas a endpoints externos, y se aplica tanto en la interfaz como en el momento del envío.
- Las entregas fallidas se registran en el log de errores de PHP con la URL del endpoint y el estado del fallo.

## Ejemplo de receptor

Un receptor mínimo en Node.js que verifica la firma y reacciona a los eventos:

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

Apunta un webhook a `http://your-host:9099/` con el secreto correspondiente, pulsa **Enviar prueba** y deberías ver llegar la entrega `ping`.
