<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <a href="WEBHOOKS.ko.md">한국어</a> ·
  <a href="WEBHOOKS.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Webhooks

Poznote pot avisar serveis externs quan passa alguna cosa a la instància enviant **webhooks de sortida**: sol·licituds HTTP POST amb un payload JSON, lliurades als punts finals que registreu. Això facilita connectar Poznote a eines d'automatització com ara n8n, Zapier o els vostres propis scripts.

Poznote només **emet** webhooks. El que el punt final receptor en fa (enviar un correu, activar un flux de treball, registrar l'esdeveniment...) depèn completament del receptor i queda fora de Poznote.

## Taula de continguts

- [Visió general](#visió-general)
- [Gestió dels webhooks](#gestió-dels-webhooks)
- [Lliurament](#lliurament)
  - [Format de la sol·licitud](#format-de-la-sollicitud)
  - [Estructura del payload](#estructura-del-payload)
  - [Verificació de la signatura](#verificació-de-la-signatura)
  - [Garanties de lliurament](#garanties-de-lliurament)
- [Enllaços directes a les notes (URL de la instància)](#enllaços-directes-a-les-notes-url-de-la-instància)
- [Objectes comuns del payload](#objectes-comuns-del-payload)
  - [L'objecte data.user](#lobjecte-datauser)
  - [L'objecte data.note](#lobjecte-datanote)
- [Referència d'esdeveniments](#referència-desdeveniments)
  - [Esdeveniments de la instància](#esdeveniments-de-la-instància)
  - [Esdeveniments d'usuari](#esdeveniments-dusuari)
  - [Ping de prova](#ping-de-prova)
- [Privadesa i seguretat](#privadesa-i-seguretat)
- [Exemple de receptor](#exemple-de-receptor)

## Visió general

Hi ha dos nivells de webhooks independents:

| Nivell | Es gestiona des de | Qui | Esdeveniments |
|---|---|---|---|
| **Webhooks d'administració** | **Paràmetres > Eines d'administració > Webhooks d'administració** | Només els administradors | Esdeveniments de la instància: `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached`, `backup.completed`, `backup.failed` |
| **Webhooks d'usuari** | **Paràmetres > Webhooks d'usuari** | Tots els comptes (tret que l'aïllament d'inquilins ho bloquegi) | Esdeveniments sobre el contingut del mateix compte: `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

La regla d'aïllament és estricta: un esdeveniment d'usuari només es lliura als punts finals registrats pel compte que l'ha produït. Les notes i els recordatoris d'un usuari no arriben mai als punts finals d'un altre. Els esdeveniments de la instància van a tots els webhooks d'administració subscrits.

## Gestió dels webhooks

Des de la pàgina de webhooks (d'administració o d'usuari), cada webhook es defineix per:

- **URL del punt final**: ha de començar per `http://` o `https://`.
- **Descripció** (opcional): una nota breu sobre per a què serveix el punt final, per exemple "flux d'n8n que arxiva les notes noves a Notion". Es mostra a la llista per distingir diversos punts finals i no s'envia mai al punt final.
- **Secret** (opcional): quan es defineix, cada lliurament se signa amb HMAC-SHA256 perquè el receptor pugui autenticar el remitent. Vegeu [Verificació de la signatura](#verificació-de-la-signatura).
- **Esdeveniments**: el subconjunt d'esdeveniments als quals se subscriu aquest punt final.

Cada webhook registrat té un menú d'accions (el botó **...** de la seva fila) amb:

- **Edita**: canvia l'URL del punt final, la descripció, el secret i els esdeveniments subscrits. El formulari s'obre sota el webhook, amb els valors actuals.
- **Envia una prova**: envia immediatament un esdeveniment [ping](#ping-de-prova) i mostra el resultat HTTP.
- **Desactiva** / **Activa**: atura o reprèn els lliuraments sense suprimir el registre.
- **Suprimeix**: elimina el webhook, després d'una confirmació.

La pàgina també mostra el resultat de l'últim lliurament de cada webhook (codi d'estat HTTP, o l'error quan no s'ha pogut accedir al punt final) i la seva data i hora.

Es pot registrar el mateix URL dues vegades, però cada entrada rep el seu propi lliurament per a cada esdeveniment al qual està subscrita, de manera que el punt final rebrà duplicats.

## Lliurament

### Format de la sol·licitud

Cada lliurament és un `POST` HTTP amb un cos JSON i les capçaleres següents:

| Capçalera | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | El nom de l'esdeveniment, p. ex. `note.created` |
| `X-Poznote-Delivery` | L'identificador únic del lliurament (el mateix valor que `delivery_id` al cos) |
| `X-Poznote-Signature-256` | `sha256=<hex HMAC>` del cos sense processar. Només hi és quan el webhook té un secret |

### Estructura del payload

Tots els payloads comparteixen la mateixa estructura; només `data` canvia segons l'esdeveniment:

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| Camp | Tipus | Descripció |
|---|---|---|
| `event` | string | Nom de l'esdeveniment; vegeu la [Referència d'esdeveniments](#referència-desdeveniments) |
| `delivery_id` | string | 32 caràcters hexadecimals, únic per lliurament. Dos webhooks que reben el mateix esdeveniment obtenen identificadors diferents |
| `created_at` | string | Data i hora ISO 8601 (UTC) del lliurament |
| `data` | object | Payload específic de l'esdeveniment, descrita més avall per a cada esdeveniment |

### Verificació de la signatura

Quan el webhook té un secret, Poznote envia `X-Poznote-Signature-256: sha256=<signatura>`, on la signatura és l'HMAC-SHA256 del **cos sense processar de la sol·licitud** amb el secret com a clau (el mateix esquema que els webhooks de GitHub). Verifiqueu-la amb els bytes sense processar, abans d'analitzar el JSON, i feu servir una comparació de temps constant:

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

Cal rebutjar les sol·licituds sense una signatura vàlida: qualsevol persona que descobreixi l'URL del punt final hi pot enviar esdeveniments falsos amb POST.

### Garanties de lliurament

- El lliurament és **de millor esforç i síncron**, amb un temps d'espera de 5 segons per a la connexió i la resposta. Un punt final lent o que falla no interromp mai l'acció (un registre, la creació d'una nota) que ha produït l'esdeveniment.
- Un lliurament es considera correcte amb qualsevol resposta **2xx**. Les redireccions **no se segueixen**.
- Els lliuraments fallits d'esdeveniments de la instància, `note.created` i `note.shared` **no es tornen a provar**.
- **Els esdeveniments de recordatori són l'excepció**: es lliuren *almenys una vegada*. Un recordatori només es marca com a enviat quan tots els punts finals subscrits l'han acceptat; si no, el procés en segon pla torna a provar tot l'esdeveniment (fins a 5 intents, separats 5 minuts). Per tant, els punts finals que funcionen bé poden rebre duplicats d'un esdeveniment de recordatori i els han d'eliminar a partir de `data.reminder.id`.
- Els recordatoris que ja havien vençut abans que el compte registrés el seu primer webhook de recordatoris s'ometen, de manera que activar els webhooks no inunda el punt final amb tots els pendents.

## Enllaços directes a les notes (URL de la instància)

Els payloads que fan referència a una nota poden incloure un enllaç directe a `data.note.url`, amb aquest format:

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

L'enllaç es crea a partir de l'**URL de la instància**, l'URL públic de la vostra instància de Poznote, que es configura a la secció **URL de la instància** de **Paràmetres > Eines d'administració > Webhooks d'administració** (només administradors). És el mateix valor que l'URL de la instància que fan servir els correus de recordatori, de manera que si el definiu en un lloc, queda definit per a tots dos. També es pot definir mitjançant l'API REST (paràmetre `smtp_app_url`) o, com a alternativa, amb la variable d'entorn `POZNOTE_APP_URL` (o `APP_URL`). Les aplicacions de xat que inicien la sessió al [servidor MCP](MCP-SERVER.ca.md) mitjançant Poznote també s'envien a aquesta adreça. Mentre és buit, s'omple des del navegador d'un administrador la primera vegada que fa servir Poznote; després només canvia quan es canvia aquí.

Quan no hi ha cap URL de la instància configurat, `data.note.url` és `null` i els payloads no inclouen cap enllaç.

## Objectes comuns del payload

### L'objecte data.user

Els esdeveniments de la instància descriuen el compte afectat amb un objecte `user`:

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

| Camp | Tipus | Descripció |
|---|---|---|
| `id` | integer | Identificador d'usuari de Poznote |
| `username` | string | Nom d'usuari d'inici de sessió |
| `email` | string o null | Adreça electrònica, `null` quan el perfil no en té |
| `first_name` | string | Nom, pot ser buit |
| `last_name` | string | Cognoms, poden ser buits |
| `source` | string | Qui o què ha desencadenat l'esdeveniment. Present als esdeveniments `user.*` i absent als de quota. Valors: `admin` (interfície d'administració), `api` (API REST), `oidc` (inici de sessió SSO o creació automàtica), `self` (l'usuari actuant sobre el seu propi compte) |

L'objecte d'usuari no conté mai contrasenyes, resums de contrasenyes ni testimonis OIDC.

### L'objecte data.note

Els esdeveniments d'usuari descriuen la nota afectada amb un objecte `note`. Els camps exactes depenen de l'esdeveniment (cada esdeveniment de més avall en mostra un exemple) i s'escullen d'entre aquests:

| Camp | Tipus | Descripció |
|---|---|---|
| `id` | integer | Identificador de la nota, utilitzable amb l'[API REST](API-REST.md) (`GET /api/v1/notes/{id}`) |
| `heading` | string | Títol de la nota |
| `type` | string | `note` (HTML) o `markdown` |
| `workspace` | string | Espai de treball que conté la nota |
| `folder` | string | Carpeta que conté la nota |
| `created` | string | Data i hora de creació |
| `url` | string o null | Enllaç directe a la nota, `null` quan no hi ha cap [URL de la instància](#enllaços-directes-a-les-notes-url-de-la-instància) configurat |

El **contingut de la nota no s'envia mai**, només les metadades.

## Referència d'esdeveniments

### Esdeveniments de la instància

Es gestionen des de **Paràmetres > Eines d'administració > Webhooks d'administració**. Es lliuren a tots els webhooks d'administració subscrits.

#### user.created

S'ha creat un compte d'usuari: per part d'un administrador, mitjançant l'API REST o amb un registre per SSO amb creació automàtica.

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

`data.user.source` és `admin`, `api` o `oidc`.

`data.user.language` és el codi de la llengua de la interfície desat per al compte, `en`
per defecte quan el compte encara no té cap preferència de llengua.

#### user.updated

Ha canviat un perfil d'usuari: nom d'usuari, adreça electrònica, nom, cognoms o rol d'administrador. No s'emet quan no ha canviat res realment.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| Camp | Descripció |
|---|---|
| `data.user` | El perfil **després** de l'actualització |
| `data.changed_fields` | Matriu amb el que ha canviat, d'entre `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source` és `admin`, `api`, `oidc` o `self`.

#### settings.language_changed

S'ha canviat explícitament la llengua de la interfície d'un usuari als paràmetres (o mitjançant l'API REST `PUT /api/v1/settings/language`). L'adopció de la llengua del navegador en iniciar la sessió no emet aquest esdeveniment per si sola, però confirmar aquesta llengua detectada a la guia d'inici sí que ho fa. Fora de la guia d'inici, no s'emet res quan la llengua seleccionada és la que ja s'està fent servir. L'esdeveniment es lliura a tots els webhooks d'administració subscrits.

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

| Camp | Descripció |
|---|---|
| `data.user` | El perfil del compte que ha canviat de llengua |
| `data.language` | El codi de la llengua nova de la interfície (`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | La llengua d'abans del canvi, `null` quan el compte encara no en tenia cap desada |
| `data.source` | `ui` (interfície web) o `api` (client de l'API REST autenticat amb credencials Basic o Bearer) |

#### user.activated / user.deactivated

S'ha tornat a activar un compte d'usuari, o s'ha desactivat i ja no pot iniciar la sessió. Quan l'indicador d'actiu canvia alhora que altres camps del perfil, Poznote emet `user.activated`/`user.deactivated` per a l'indicador i un `user.updated` separat per a la resta.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

S'ha suprimit un compte d'usuari. El payload conté el perfil **tal com era abans de la supressió**. `data.user.source` és `admin`, `api` o `self` (l'usuari ha suprimit el seu propi compte).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

S'ha rebutjat un registre per SSO perquè la instància ha arribat al nombre màxim d'usuaris, de manera que l'operador s'assabenta en temps real dels registres perduts.

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

| Camp | Descripció |
|---|---|
| `data.max_users` | El límit d'usuaris configurat |
| `data.attempted.username` | Nom d'usuari que hauria fet servir el registre rebutjat, `null` quan no se sap |
| `data.attempted.email` | Adreça electrònica del registre rebutjat, `null` quan no se sap |

#### quota.notes_reached

S'ha bloquejat una acció d'un usuari perquè el compte ha arribat a la quota de notes (paperera inclosa).

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

S'ha bloquejat una acció d'un usuari (escriptura d'una nota o pujada d'un fitxer adjunt) perquè el compte ha arribat a la quota d'emmagatzematge.

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

| Camp | Descripció |
|---|---|
| `data.quota.max_storage_bytes` | El límit configurat, en bytes |
| `data.quota.used_bytes` | L'ús actual, en bytes |
| `data.quota.requested_bytes` | La mida de l'escriptura rebutjada |
| `data.quota.pool` | Només hi és, amb el valor `"s3"`, quan la pujada bloquejada anava a la quota de fitxers adjunts a S3 en lloc de l'emmagatzematge local |

> **Limitació de freqüència:** els esdeveniments de quota es limiten a un lliurament com a màxim per usuari, per tipus d'esdeveniment i per hora, de manera que un usuari que arriba al límit repetidament no inunda el punt final. `data.user` no té camp `source` als esdeveniments de quota.

#### backup.completed / backup.failed

Ha finalitzat una còpia de seguretat automàtica (cubell S3 o carpeta local, segons la programació definida a les seves pàgines de paràmetres) o una còpia iniciada per un administrador amb **Fes ara la còpia de seguretat**. S'envia un esdeveniment per execució, no per usuari: `backup.completed` quan s'ha fet la còpia de tots els usuaris seleccionats sense errors, i `backup.failed` quan ha fallat almenys un usuari, no s'ha pogut eliminar un arxiu antic, no s'ha pogut accedir a la destinació o no s'ha fet la còpia de ningú. Les còpies de seguretat que un usuari inicia per al seu propi compte no emeten aquests esdeveniments.

```json
{
  "event": "backup.failed",
  "delivery_id": "…",
  "created_at": "2026-10-16T03:00:12+00:00",
  "data": {
    "backup": {
      "target": "s3",
      "trigger": "auto",
      "users": 3,
      "backed_up": 2,
      "errors": ["nina: Access Denied"]
    }
  }
}
```

| Camp | Descripció |
|---|---|
| `data.backup.target` | `s3` (cubell de còpies de seguretat a S3) o `local` (carpeta de còpies de seguretat local) |
| `data.backup.trigger` | `auto` (execució programada) o `manual` (iniciada per un administrador) |
| `data.backup.users` | Nombre d'usuaris seleccionats per a l'execució |
| `data.backup.backed_up` | Nombre d'arxius escrits |
| `data.backup.errors` | Missatges d'error, precedits del nom d'usuari quan afecten un usuari, 10 com a màxim. Buit a `backup.completed` |

> **Supervisió amb healthchecks.io:** registreu dos webhooks: l'URL de ping de la comprovació (`https://hc-ping.com/<uuid>`) subscrit a `backup.completed`, i el mateix URL seguit de `/fail` subscrit a `backup.failed`. Definiu el període de la comprovació segons la freqüència de les còpies de seguretat: si el procés s'atura o falla a mitja execució, no s'envia cap esdeveniment i el ping que falta fa saltar l'alerta.

### Esdeveniments d'usuari

Es gestionen des de **Paràmetres > Webhooks d'usuari**. Només es lliuren als punts finals registrats pel compte que ha produït l'esdeveniment, i per això aquests payloads no inclouen cap objecte `user`: els punts finals pertanyen al compte, i l'identificador de la nota identifica la destinació.

Un administrador pot bloquejar aquesta funció per als usuaris que no són administradors amb l'opció d'aïllament d'inquilins **Webhooks d'usuari** (**Paràmetres > Eines d'administració > Aïllament d'inquilins**). Quan està bloquejada, els usuaris que no són administradors no poden obrir la pàgina i els seus esdeveniments no s'envien; els administradors no s'hi veuen mai afectats.

#### note.created

S'ha creat una nota al compte, des de la interfície o des de l'API REST.

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

`data.source` és `ui` (interfície web) o `api` (client de l'API REST autenticat amb credencials Basic o Bearer).

#### note.shared

S'ha publicat un enllaç de compartició pública per a una de les notes del compte.

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

| Camp | Descripció |
|---|---|
| `data.share.token` | Testimoni públic de compartició |
| `data.share.url` | URL públic de compartició |
| `data.share.has_password` | Si l'enllaç està protegit amb contrasenya |
| `data.share.updated` | `false` per a una nota compartida per primera vegada, `true` quan la nota ja estava compartida i l'enllaç s'ha tornat a generar |

#### reminder.due / reminder.due_title / reminder.due_minimal

Un dels recordatoris de les notes del compte ha arribat a l'hora d'activació. L'esdeveniment l'emet el procés de recordatoris en segon pla, independentment del canal de correu, de manera que s'activa encara que l'SMTP no estigui configurat.

Les tres variants us permeten triar quantes dades surten de la instància; subscriviu-vos a la que s'adapti al receptor:

**`reminder.due`**, el payload complet, inclou el títol de la nota i el missatge del recordatori:

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

**`reminder.due_title`**, el mateix desencadenant però sense el missatge del recordatori:

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**, només identificadors: cap contingut de la nota no surt de la instància. El receptor pot obtenir-ne els detalls mitjançant l'[API REST](API-REST.md) si cal:

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **Lliurament almenys una vegada:** els esdeveniments de recordatori es tornen a provar fins que tots els punts finals subscrits els accepten (fins a 5 intents, separats 5 minuts), de manera que un punt final pot rebre el mateix recordatori més d'una vegada. Elimineu els duplicats a partir de `data.reminder.id`.

### Ping de prova

El botó **Envia una prova** de les pàgines de webhooks envia un esdeveniment `ping` al punt final seleccionat i mostra el resultat HTTP. Segueix les mateixes regles d'estructura i de signatura que els esdeveniments reals:

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

## Privadesa i seguretat

- **El contingut de les notes no surt mai de la instància.** Els payloads només contenen metadades: identificadors, títols, espai de treball, carpeta, dates i hores. Feu servir `reminder.due_minimal` quan ni tan sols els títols hagin d'arribar al punt final.
- **Cap credencial als payloads.** Els objectes d'usuari no contenen mai contrasenyes, resums ni testimonis.
- **Abast estricte per compte.** Els esdeveniments d'usuari només es lliuren als punts finals del compte que els ha produït.
- **Autentiqueu el remitent.** Definiu un secret i verifiqueu la capçalera `X-Poznote-Signature-256` a cada sol·licitud; un URL de punt final sol s'ha de considerar públic.
- **Aïllament d'inquilins.** L'opció d'aïllament d'inquilins "Webhooks d'usuari" impedeix que els usuaris que no són administradors enviïn les metadades de les seves notes a punts finals externs, i s'aplica tant a la interfície com en el moment de l'enviament.
- Els lliuraments fallits es registren al registre d'errors de PHP amb l'URL del punt final i l'estat de l'error.

## Exemple de receptor

Un receptor mínim en Node.js que verifica la signatura i reacciona als esdeveniments:

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

Apunteu un webhook a `http://your-host:9099/` amb el secret corresponent, feu clic a **Envia una prova** i hauríeu de veure arribar el lliurament `ping`.
