<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <a href="WEBHOOKS.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <a href="WEBHOOKS.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Webhooks

Poznote kann externe Dienste benachrichtigen, wenn auf der Instanz etwas passiert, indem es **ausgehende Webhooks** sendet: HTTP-POST-Anfragen mit JSON-Payload, die an die von Ihnen registrierten Endpunkte zugestellt werden. So lässt sich Poznote leicht mit Automatisierungswerkzeugen wie n8n, Zapier oder Ihren eigenen Skripten verbinden.

Poznote **sendet** Webhooks nur. Was der empfangende Endpunkt damit macht (eine E-Mail senden, einen Workflow auslösen, das Ereignis protokollieren, ...), liegt ganz beim Empfänger und findet außerhalb von Poznote statt.

## Inhaltsverzeichnis

- [Überblick](#überblick)
- [Webhooks verwalten](#webhooks-verwalten)
- [Zustellung](#zustellung)
  - [Anfrageformat](#anfrageformat)
  - [Payload-Umschlag](#payload-umschlag)
  - [Die Signatur prüfen](#die-signatur-prüfen)
  - [Zustellungsgarantien](#zustellungsgarantien)
- [Direkte Links zu Notizen (Instanz-URL)](#direkte-links-zu-notizen-instanz-url)
- [Gemeinsame Payload-Objekte](#gemeinsame-payload-objekte)
  - [Das Objekt data.user](#das-objekt-datauser)
  - [Das Objekt data.note](#das-objekt-datanote)
- [Ereignisreferenz](#ereignisreferenz)
  - [Instanzereignisse](#instanzereignisse)
  - [Benutzerereignisse](#benutzerereignisse)
  - [Test-Ping](#test-ping)
- [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
- [Beispiel-Empfänger](#beispiel-empfänger)

## Überblick

Es gibt zwei voneinander unabhängige Webhook-Ebenen:

| Ebene | Verwaltet unter | Wer | Ereignisse |
|---|---|---|---|
| **Admin-Webhooks** | **Einstellungen > Admin-Werkzeuge > Admin-Webhooks** | Nur Administratoren | Instanzereignisse: `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached` |
| **Benutzer-Webhooks** | **Einstellungen > Benutzer-Webhooks** | Jedes Konto (sofern nicht durch die Mandantentrennung gesperrt) | Ereignisse zu den eigenen Inhalten des Kontos: `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

Die Trennungsregel ist strikt: Ein Benutzerereignis wird immer nur an die Endpunkte zugestellt, die das Konto registriert hat, das es ausgelöst hat. Notizen und Erinnerungen eines Benutzers erreichen nie die Endpunkte eines anderen Benutzers. Instanzereignisse gehen an jeden abonnierten Admin-Webhook.

## Webhooks verwalten

Auf der Webhook-Seite (Admin oder Benutzer) wird jeder Webhook definiert durch:

- **Endpunkt-URL**: muss mit `http://` oder `https://` beginnen.
- **Beschreibung** (optional): ein kurzer Hinweis, wofür der Endpunkt dient, zum Beispiel „n8n-Workflow, der neue Notizen in Notion ablegt“. Sie wird in der Liste angezeigt, um mehrere Endpunkte auseinanderzuhalten, und nie an den Endpunkt gesendet.
- **Secret** (optional): Ist es gesetzt, wird jede Zustellung mit HMAC-SHA256 signiert, damit der Empfänger den Absender authentifizieren kann. Siehe [Die Signatur prüfen](#die-signatur-prüfen).
- **Ereignisse**: die Auswahl an Ereignissen, die dieser Endpunkt abonniert.

Jeder registrierte Webhook hat ein Aktionsmenü (die Schaltfläche **...** in seiner Zeile) mit folgenden Einträgen:

- **Bearbeiten**: Endpunkt-URL, Beschreibung, Secret und abonnierte Ereignisse ändern. Das Formular öffnet sich direkt unter dem Webhook, vorausgefüllt mit den aktuellen Werten.
- **Test senden**: sendet sofort ein [Ping](#test-ping)-Ereignis und zeigt das HTTP-Ergebnis an.
- **Deaktivieren** / **Aktivieren**: Zustellungen anhalten oder fortsetzen, ohne die Registrierung zu löschen.
- **Löschen**: den Webhook nach einer Bestätigung entfernen.

Die Seite zeigt außerdem für jeden Webhook das Ergebnis der letzten Zustellung (HTTP-Statuscode oder den Fehler, wenn der Endpunkt nicht erreichbar war) und deren Zeitstempel.

Dieselbe URL zweimal zu registrieren ist erlaubt, aber jeder Eintrag erhält für jedes abonnierte Ereignis seine eigene Zustellung, sodass der Endpunkt Duplikate sieht.

## Zustellung

### Anfrageformat

Jede Zustellung ist ein HTTP-`POST` mit JSON-Body und den folgenden Headern:

| Header | Wert |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | Der Ereignisname, z. B. `note.created` |
| `X-Poznote-Delivery` | Die eindeutige Zustellungs-ID (derselbe Wert wie `delivery_id` im Body) |
| `X-Poznote-Signature-256` | `sha256=<hex HMAC>` des unveränderten Bodys. Nur vorhanden, wenn der Webhook ein Secret hat |

### Payload-Umschlag

Alle Payloads haben denselben Umschlag, nur `data` ändert sich je nach Ereignis:

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `event` | string | Ereignisname, siehe die [Ereignisreferenz](#ereignisreferenz) |
| `delivery_id` | string | 32 Hexadezimalzeichen, eindeutig pro Zustellung. Zwei Webhooks, die dasselbe Ereignis empfangen, erhalten unterschiedliche IDs |
| `created_at` | string | ISO-8601-Zeitstempel (UTC) der Zustellung |
| `data` | object | Ereignisspezifische Payload, unten für jedes Ereignis beschrieben |

### Die Signatur prüfen

Hat der Webhook ein Secret, sendet Poznote `X-Poznote-Signature-256: sha256=<signature>`, wobei die Signatur der HMAC-SHA256 des **unveränderten Anfrage-Bodys** mit dem Secret als Schlüssel ist (dasselbe Verfahren wie bei GitHub-Webhooks). Prüfen Sie sie anhand der Rohbytes, vor jedem JSON-Parsing, und verwenden Sie einen Vergleich mit konstanter Laufzeit:

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

Anfragen ohne gültige Signatur sollten abgelehnt werden: Jeder, der die Endpunkt-URL kennt, kann gefälschte Ereignisse per POST an sie senden.

### Zustellungsgarantien

- Die Zustellung erfolgt **nach bestem Bemühen und synchron**, mit einem Timeout von 5 Sekunden für Verbindung und Antwort. Ein langsamer oder fehlerhafter Endpunkt beeinträchtigt nie die Aktion (eine Registrierung, das Erstellen einer Notiz), die das Ereignis ausgelöst hat.
- Eine Zustellung gilt bei jeder **2xx**-Antwort als erfolgreich. Weiterleitungen werden **nicht verfolgt**.
- Fehlgeschlagene Zustellungen von Instanzereignissen, `note.created` und `note.shared` werden **nicht wiederholt**.
- **Erinnerungsereignisse sind die Ausnahme**: Sie werden *mindestens einmal* zugestellt. Eine Erinnerung wird erst dann als gesendet markiert, wenn jeder abonnierte Endpunkt sie angenommen hat; andernfalls wird das gesamte Ereignis vom Hintergrund-Worker erneut versucht (bis zu 5 Versuche im Abstand von 5 Minuten). Funktionierende Endpunkte können daher Duplikate eines Erinnerungsereignisses erhalten und sollten anhand von `data.reminder.id` deduplizieren.
- Erinnerungen, die bereits fällig waren, bevor das Konto seinen ersten Erinnerungs-Webhook registriert hat, werden übersprungen, sodass das Aktivieren von Webhooks den Endpunkt nicht mit dem gesamten Rückstand überflutet.

## Direkte Links zu Notizen (Instanz-URL)

Payloads, die sich auf eine Notiz beziehen, können in `data.note.url` einen direkten Link in folgender Form enthalten:

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

Der Link wird aus der **Instanz-URL** gebildet, der öffentlichen URL Ihrer Poznote-Instanz, die im Abschnitt **Instanz-URL** unter **Einstellungen > Admin-Werkzeuge > Admin-Webhooks** konfiguriert wird (nur für Administratoren). Es ist derselbe Wert wie die Instanz-URL, die von den Erinnerungs-E-Mails verwendet wird; wenn Sie ihn an einer Stelle setzen, gilt er also für beide. Er kann auch über die REST-API (Einstellung `smtp_app_url`) oder ersatzweise mit der Umgebungsvariable `POZNOTE_APP_URL` (oder `APP_URL`) gesetzt werden.

Ist keine Instanz-URL konfiguriert, ist `data.note.url` `null`, und die Payloads enthalten keinen Link.

## Gemeinsame Payload-Objekte

### Das Objekt data.user

Instanzereignisse beschreiben das betroffene Konto mit einem `user`-Objekt:

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

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | integer | Poznote-Benutzer-ID |
| `username` | string | Anmeldename |
| `email` | string oder null | E-Mail-Adresse, `null`, wenn das Profil keine hat |
| `first_name` | string | Vorname, kann leer sein |
| `last_name` | string | Nachname, kann leer sein |
| `source` | string | Wer oder was das Ereignis ausgelöst hat. Vorhanden bei `user.*`-Ereignissen, fehlt bei Kontingentereignissen. Werte: `admin` (Admin-Oberfläche), `api` (REST-API), `oidc` (SSO-Anmeldung oder automatische Bereitstellung), `self` (der Benutzer handelt an seinem eigenen Konto) |

Das Benutzerobjekt enthält nie Passwörter, Passwort-Hashes oder OIDC-Token.

### Das Objekt data.note

Benutzerereignisse beschreiben die betroffene Notiz mit einem `note`-Objekt. Die genauen Felder hängen vom Ereignis ab (jedes Ereignis unten zeigt sein eigenes Beispiel) und stammen aus folgender Liste:

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | integer | Notiz-ID, verwendbar mit der [REST-API](API-REST.md) (`GET /api/v1/notes/{id}`) |
| `heading` | string | Notiztitel |
| `type` | string | `note` (HTML) oder `markdown` |
| `workspace` | string | Arbeitsbereich, der die Notiz enthält |
| `folder` | string | Ordner, der die Notiz enthält |
| `created` | string | Erstellungszeitstempel |
| `url` | string oder null | Direkter Link zur Notiz, `null`, wenn keine [Instanz-URL](#direkte-links-zu-notizen-instanz-url) konfiguriert ist |

Der **Notizinhalt wird nie gesendet**, nur Metadaten.

## Ereignisreferenz

### Instanzereignisse

Verwaltet unter **Einstellungen > Admin-Werkzeuge > Admin-Webhooks**. Zugestellt an jeden abonnierten Admin-Webhook.

#### user.created

Ein Benutzerkonto wurde erstellt: von einem Administrator, über die REST-API oder durch eine SSO-Registrierung mit automatischer Bereitstellung.

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

`data.user.source` ist `admin`, `api` oder `oidc`.

`data.user.language` ist der gespeicherte Code der Oberflächensprache des Kontos, standardmäßig
`en`, solange das Konto noch keine Sprachpräferenz festgelegt hat.

#### user.updated

Ein Benutzerprofil wurde geändert: Benutzername, E-Mail, Vorname, Nachname oder Administratorrolle. Wird nicht ausgelöst, wenn sich tatsächlich nichts geändert hat.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| Feld | Beschreibung |
|---|---|
| `data.user` | Das Profil **nach** der Änderung |
| `data.changed_fields` | Array mit den geänderten Feldern, aus `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source` ist `admin`, `api`, `oidc` oder `self`.

#### settings.language_changed

Die Oberflächensprache eines Benutzers wurde ausdrücklich in den Einstellungen geändert (oder über die REST-API mit `PUT /api/v1/settings/language`). Die vom Browser gesteuerte Übernahme der Sprache bei der Anmeldung löst dieses Ereignis für sich genommen nicht aus, das Bestätigen der erkannten Sprache in der Startanleitung dagegen schon. Außerhalb der Startanleitung wird nichts ausgelöst, wenn die gewählte Sprache bereits verwendet wird. Das Ereignis wird an jeden abonnierten Admin-Webhook zugestellt.

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

| Feld | Beschreibung |
|---|---|
| `data.user` | Das Profil des Kontos, das seine Sprache geändert hat |
| `data.language` | Der Code der neuen Oberflächensprache (`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | Die Sprache vor der Änderung, `null`, wenn für das Konto noch keine gespeichert war |
| `data.source` | `ui` (Weboberfläche) oder `api` (REST-API-Client, authentifiziert mit Basic- oder Bearer-Anmeldedaten) |

#### user.activated / user.deactivated

Ein Benutzerkonto wurde wieder aktiviert, oder es wurde deaktiviert und kann sich nicht mehr anmelden. Ändert sich das Aktiv-Flag gleichzeitig mit anderen Profilfeldern, löst Poznote `user.activated`/`user.deactivated` für das Flag und ein separates `user.updated` für den Rest aus.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

Ein Benutzerkonto wurde gelöscht. Die Payload enthält das Profil **so, wie es vor dem Löschen war**. `data.user.source` ist `admin`, `api` oder `self` (der Benutzer hat sein eigenes Konto gelöscht).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

Eine SSO-Registrierung wurde abgelehnt, weil die Instanz ihre maximale Benutzerzahl erreicht hat, sodass der Betreiber in Echtzeit von entgangenen Registrierungen erfährt.

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

| Feld | Beschreibung |
|---|---|
| `data.max_users` | Die konfigurierte Benutzerobergrenze |
| `data.attempted.username` | Benutzername, den die abgelehnte Registrierung verwendet hätte, `null`, wenn unbekannt |
| `data.attempted.email` | E-Mail der abgelehnten Registrierung, `null`, wenn unbekannt |

#### quota.notes_reached

Eine Benutzeraktion wurde blockiert, weil das Konto sein Notizkontingent erreicht hat (Papierkorb eingeschlossen).

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

Eine Benutzeraktion (Schreiben einer Notiz oder Hochladen eines Anhangs) wurde blockiert, weil das Konto sein Speicherkontingent erreicht hat.

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

| Feld | Beschreibung |
|---|---|
| `data.quota.max_storage_bytes` | Das konfigurierte Limit in Bytes |
| `data.quota.used_bytes` | Aktuelle Belegung in Bytes |
| `data.quota.requested_bytes` | Größe des abgelehnten Schreibvorgangs |
| `data.quota.pool` | Nur vorhanden, mit dem Wert `"s3"`, wenn der blockierte Upload das S3-Anhangskontingent statt des lokalen Speichers betraf |

> **Drosselung:** Kontingentereignisse werden auf höchstens eine Zustellung pro Benutzer, pro Ereignistyp und pro Stunde gedrosselt, sodass ein Benutzer, der wiederholt an das Limit stößt, den Endpunkt nicht überflutet. `data.user` hat bei Kontingentereignissen kein Feld `source`.

### Benutzerereignisse

Verwaltet unter **Einstellungen > Benutzer-Webhooks**. Nur an die Endpunkte zugestellt, die das Konto registriert hat, das das Ereignis ausgelöst hat. Deshalb enthalten diese Payloads kein `user`-Objekt: Die Endpunkte gehören dem Konto, und die Notiz-ID identifiziert das Ziel.

Ein Administrator kann diese Funktion für Benutzer ohne Administratorrechte mit der Option **Benutzer-Webhooks** der Mandantentrennung sperren (**Einstellungen > Admin-Werkzeuge > Mandantentrennung**). Ist sie gesperrt, können Benutzer ohne Administratorrechte die Seite nicht öffnen, und ihre Ereignisse werden nicht versendet; Administratoren sind nie betroffen.

#### note.created

Im Konto wurde eine Notiz erstellt, über die Oberfläche oder die REST-API.

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

`data.source` ist `ui` (Weboberfläche) oder `api` (REST-API-Client, authentifiziert mit Basic- oder Bearer-Anmeldedaten).

#### note.shared

Für eine Notiz des Kontos wurde ein öffentlicher Freigabelink veröffentlicht.

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

| Feld | Beschreibung |
|---|---|
| `data.share.token` | Öffentliches Freigabe-Token |
| `data.share.url` | Öffentliche Freigabe-URL |
| `data.share.has_password` | Ob der Link passwortgeschützt ist |
| `data.share.updated` | `false` für eine neu freigegebene Notiz, `true`, wenn die Notiz bereits freigegeben war und der Link neu erzeugt wurde |

#### reminder.due / reminder.due_title / reminder.due_minimal

Eine der Notizerinnerungen des Kontos hat ihren Auslösezeitpunkt erreicht. Das Ereignis wird vom Erinnerungs-Worker im Hintergrund ausgelöst, unabhängig vom E-Mail-Kanal, und wird daher auch dann gesendet, wenn SMTP nicht konfiguriert ist.

Mit den drei Varianten wählen Sie, wie viele Daten die Instanz verlassen; abonnieren Sie diejenige, die zum Empfänger passt:

**`reminder.due`**, die vollständige Payload, enthält den Notiztitel und die Erinnerungsnachricht:

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

**`reminder.due_title`**, derselbe Auslöser, aber ohne die Erinnerungsnachricht:

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**, nur Kennungen, kein Notizinhalt verlässt die Instanz. Der Empfänger kann bei Bedarf Details über die [REST-API](API-REST.md) abrufen:

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **Zustellung mindestens einmal:** Erinnerungsereignisse werden so lange erneut versucht, bis jeder abonnierte Endpunkt sie angenommen hat (bis zu 5 Versuche im Abstand von 5 Minuten), sodass ein Endpunkt dieselbe Erinnerung mehr als einmal erhalten kann. Deduplizieren Sie anhand von `data.reminder.id`.

### Test-Ping

Die Schaltfläche **Test senden** auf den Webhook-Seiten sendet ein `ping`-Ereignis an den ausgewählten Endpunkt und meldet das HTTP-Ergebnis. Dabei gelten dieselben Regeln für Umschlag und Signatur wie für echte Ereignisse:

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

## Datenschutz und Sicherheit

- **Notizinhalte verlassen die Instanz nie.** Payloads enthalten nur Metadaten: IDs, Titel, Arbeitsbereich, Ordner, Zeitstempel. Verwenden Sie `reminder.due_minimal`, wenn nicht einmal Titel den Endpunkt erreichen sollen.
- **Keine Anmeldedaten in Payloads.** Benutzerobjekte enthalten nie Passwörter, Hashes oder Token.
- **Strikte Trennung pro Konto.** Benutzerereignisse werden nur an die Endpunkte des Kontos zugestellt, das sie ausgelöst hat.
- **Authentifizieren Sie den Absender.** Setzen Sie ein Secret und prüfen Sie bei jeder Anfrage den Header `X-Poznote-Signature-256`; eine Endpunkt-URL allein muss als öffentlich betrachtet werden.
- **Mandantentrennung.** Die Option „Benutzer-Webhooks“ der Mandantentrennung verhindert, dass Benutzer ohne Administratorrechte die Metadaten ihrer Notizen an externe Endpunkte weiterleiten, und wird sowohl in der Oberfläche als auch beim Versand durchgesetzt.
- Fehlgeschlagene Zustellungen werden mit der Endpunkt-URL und dem Fehlerstatus im PHP-Fehlerprotokoll erfasst.

## Beispiel-Empfänger

Ein minimaler Node.js-Empfänger, der die Signatur prüft und auf Ereignisse reagiert:

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

Richten Sie einen Webhook mit dem passenden Secret auf `http://your-host:9099/` ein, klicken Sie auf **Test senden**, und die `ping`-Zustellung sollte ankommen.
