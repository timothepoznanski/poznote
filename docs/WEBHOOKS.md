# Webhooks

Poznote can notify external services when something happens on the instance by sending **outgoing webhooks**: HTTP POST requests with a JSON payload, delivered to the endpoints you register. This makes it easy to plug Poznote into automation tools such as n8n, Zapier, or your own scripts.

Poznote only **emits** webhooks. What the receiving endpoint does with them (send an email, trigger a workflow, log the event, ...) is entirely up to the receiver and lives outside of Poznote.

## Table of contents

- [Overview](#overview)
- [Managing webhooks](#managing-webhooks)
- [Delivery](#delivery)
  - [Request format](#request-format)
  - [Payload envelope](#payload-envelope)
  - [Verifying the signature](#verifying-the-signature)
  - [Delivery guarantees](#delivery-guarantees)
- [Direct note links (Instance URL)](#direct-note-links-instance-url)
- [Common payload objects](#common-payload-objects)
  - [The data.user object](#the-datauser-object)
  - [The data.note object](#the-datanote-object)
- [Event reference](#event-reference)
  - [Instance events](#instance-events)
  - [User events](#user-events)
  - [Test ping](#test-ping)
- [Privacy and security](#privacy-and-security)
- [Example receiver](#example-receiver)

## Overview

There are two independent levels of webhooks:

| Level | Managed from | Who | Events |
|---|---|---|---|
| **Admin Webhooks** | **Settings > Admin Tools > Admin Webhooks** | Administrators only | Instance events: `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached` |
| **User Webhooks** | **Settings > User Webhooks** | Every account (unless blocked by tenant isolation) | Events about the account's own content: `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

The isolation rule is strict: a user event is only ever delivered to the endpoints registered by the account that produced it. One user's notes and reminders never reach another user's endpoints. Instance events go to every subscribed admin webhook.

## Managing webhooks

From the webhook page (admin or user), each webhook is defined by:

- **Endpoint URL**: must start with `http://` or `https://`.
- **Description** (optional): a short note about what the endpoint is for, for example "n8n workflow that files new notes into Notion". It is shown in the list to tell several endpoints apart and is never sent to the endpoint.
- **Secret** (optional): when set, every delivery is signed with HMAC-SHA256 so the receiver can authenticate the sender. See [Verifying the signature](#verifying-the-signature).
- **Events**: the subset of events this endpoint subscribes to.

Each registered webhook has an actions menu (the **...** button on its row) offering:

- **Edit**: change the endpoint URL, description, secret and subscribed events. The form opens inline under the webhook, prefilled with the current values.
- **Send test**: sends a [ping](#test-ping) event immediately and shows the HTTP result.
- **Disable** / **Enable**: stop or resume deliveries without deleting the registration.
- **Delete**: remove the webhook, after a confirmation.

The page also shows the outcome of the last delivery for each webhook (HTTP status code, or the error when the endpoint could not be reached) and its timestamp.

Registering the same URL twice is allowed but each entry receives its own delivery for every event it subscribes to, so the endpoint will see duplicates.

## Delivery

### Request format

Every delivery is an HTTP `POST` with a JSON body and the following headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | The event name, e.g. `note.created` |
| `X-Poznote-Delivery` | The unique delivery id (same value as `delivery_id` in the body) |
| `X-Poznote-Signature-256` | `sha256=<hex HMAC>` of the raw body. Only present when the webhook has a secret |

### Payload envelope

Every payload shares the same envelope; only `data` changes per event:

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| Field | Type | Description |
|---|---|---|
| `event` | string | Event name, see the [Event reference](#event-reference) |
| `delivery_id` | string | 32 hex characters, unique per delivery. Two webhooks receiving the same event get different ids |
| `created_at` | string | ISO 8601 timestamp (UTC) of the delivery |
| `data` | object | Event-specific payload, described per event below |

### Verifying the signature

When the webhook has a secret, Poznote sends `X-Poznote-Signature-256: sha256=<signature>`, where the signature is the HMAC-SHA256 of the **raw request body** keyed with the secret (the same scheme as GitHub webhooks). Verify it against the raw bytes, before any JSON parsing, and use a constant-time comparison:

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

Requests without a valid signature should be rejected: anyone who discovers the endpoint URL can POST fake events to it.

### Delivery guarantees

- Delivery is **best-effort and synchronous**, with a 5 second connection and response timeout. A slow or failing endpoint never breaks the action (a signup, a note creation) that produced the event.
- A delivery is considered successful on any **2xx** response. Redirects are **not followed**.
- Failed deliveries of instance events, `note.created` and `note.shared` are **not retried**.
- **Reminder events are the exception**: they are delivered *at least once*. A reminder is marked as sent only when every subscribed endpoint accepted it; otherwise the whole event is retried by the background worker (up to 5 attempts, 5 minutes apart). Healthy endpoints may therefore see duplicates of a reminder event and should deduplicate on `data.reminder.id`.
- Reminders that were already due before the account registered its first reminder webhook are skipped, so enabling webhooks does not flood the endpoint with the whole backlog.

## Direct note links (Instance URL)

Payloads that reference a note can carry a direct link in `data.note.url`, of the form:

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

The link is built from the **Instance URL**, the public URL of your Poznote instance, configured in the **Instance URL** section of **Settings > Admin Tools > Admin Webhooks** (administrators only). It is the same value as the instance URL used by the reminder emails, so setting it in one place sets it for both. It can also be set through the REST API (`smtp_app_url` setting) or, as a fallback, with the `POZNOTE_APP_URL` (or `APP_URL`) environment variable.

When no Instance URL is configured, `data.note.url` is `null` and payloads carry no link.

## Common payload objects

### The data.user object

Instance events describe the account concerned with a `user` object:

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

| Field | Type | Description |
|---|---|---|
| `id` | integer | Poznote user id |
| `username` | string | Login username |
| `email` | string or null | Email address, `null` when the profile has none |
| `first_name` | string | First name, may be empty |
| `last_name` | string | Last name, may be empty |
| `source` | string | Who or what triggered the event. Present on `user.*` events, absent on quota events. Values: `admin` (admin UI), `api` (REST API), `oidc` (SSO login or auto-provisioning), `self` (the user acting on their own account) |

The user object never contains passwords, password hashes, or OIDC tokens.

### The data.note object

User events describe the note concerned with a `note` object. The exact fields depend on the event (each event below shows its own example), drawn from:

| Field | Type | Description |
|---|---|---|
| `id` | integer | Note id, usable with the [REST API](API-REST.md) (`GET /api/v1/notes/{id}`) |
| `heading` | string | Note title |
| `type` | string | `note` (HTML) or `markdown` |
| `workspace` | string | Workspace containing the note |
| `folder` | string | Folder containing the note |
| `created` | string | Creation timestamp |
| `url` | string or null | Direct link to the note, `null` when no [Instance URL](#direct-note-links-instance-url) is configured |

The note **content is never sent**, only metadata.

## Event reference

### Instance events

Managed from **Settings > Admin Tools > Admin Webhooks**. Delivered to every subscribed admin webhook.

#### user.created

A user account was created: by an administrator, through the REST API, or by an SSO auto-provisioned signup.

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

`data.user.source` is `admin`, `api`, or `oidc`.

`data.user.language` is the account's stored interface language code, defaulting
to `en` when the account has not yet established a language preference.

#### user.updated

A user profile changed: username, email, first name, last name, or admin role. Not emitted when nothing actually changed.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| Field | Description |
|---|---|
| `data.user` | The profile **after** the update |
| `data.changed_fields` | Array listing what changed, among `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source` is `admin`, `api`, `oidc`, or `self`.

#### settings.language_changed

A user's interface language was explicitly changed in the settings (or through the REST API `PUT /api/v1/settings/language`). The browser-driven language adoption at login does not emit this event by itself, but confirming that detected language in the startup guide does. Outside the startup guide, nothing is emitted when the selected language is the one already in use. The event is delivered to every subscribed admin webhook.

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

| Field | Description |
|---|---|
| `data.user` | The profile of the account that changed its language |
| `data.language` | The new interface language code (`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | The language before the change, `null` when the account had none stored yet |
| `data.source` | `ui` (web interface) or `api` (REST API client authenticated with Basic or Bearer credentials) |

#### user.activated / user.deactivated

A user account was re-enabled, or deactivated and can no longer sign in. When the active flag flips together with other profile fields, Poznote emits `user.activated`/`user.deactivated` for the flag and a separate `user.updated` for the rest.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

A user account was deleted. The payload carries the profile **as it was before deletion**. `data.user.source` is `admin`, `api`, or `self` (the user deleted their own account).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

An SSO signup was refused because the instance reached its maximum number of users, so the operator learns about lost signups in real time.

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

| Field | Description |
|---|---|
| `data.max_users` | The configured user cap |
| `data.attempted.username` | Username the refused signup would have used, `null` when unknown |
| `data.attempted.email` | Email of the refused signup, `null` when unknown |

#### quota.notes_reached

A user action was blocked because the account reached its note quota (trash included).

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

A user action (note write or attachment upload) was blocked because the account reached its storage quota.

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

| Field | Description |
|---|---|
| `data.quota.max_storage_bytes` | The configured limit in bytes |
| `data.quota.used_bytes` | Current usage in bytes |
| `data.quota.requested_bytes` | Size of the write that was refused |
| `data.quota.pool` | Only present with the value `"s3"` when the blocked upload targeted the S3 attachment quota rather than local storage |

> **Throttling:** quota events are throttled to at most one delivery per user, per event type, per hour, so a user repeatedly hitting the limit does not flood the endpoint. `data.user` has no `source` field on quota events.

### User events

Managed from **Settings > User Webhooks**. Delivered only to the endpoints registered by the account that produced the event, which is why these payloads carry no `user` object: the endpoints belong to the account, and the note id identifies the target.

An administrator can block this feature for non-admin users with the **User webhooks** tenant isolation option (**Settings > Admin Tools > Tenant isolation**). When blocked, non-admin users cannot open the page and their events are not dispatched; administrators are never affected.

#### note.created

A note was created in the account, from the interface or the REST API.

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

`data.source` is `ui` (web interface) or `api` (REST API client authenticated with Basic or Bearer credentials).

#### note.shared

A public share link was published for one of the account's notes.

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

| Field | Description |
|---|---|
| `data.share.token` | Public share token |
| `data.share.url` | Public share URL |
| `data.share.has_password` | Whether the link is password protected |
| `data.share.updated` | `false` for a newly shared note, `true` when the note was already shared and the link was regenerated |

#### reminder.due / reminder.due_title / reminder.due_minimal

One of the account's note reminders reached its trigger time. The event is emitted by the background reminder worker, independently of the email channel, so it fires even when SMTP is not configured.

The three variants let you choose how much data leaves the instance; subscribe to the one that fits the receiver:

**`reminder.due`**, the full payload, includes the note title and the reminder message:

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

**`reminder.due_title`**, same trigger but without the reminder message:

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**, identifiers only, no note content leaves the instance. The receiver can fetch details through the [REST API](API-REST.md) if needed:

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **At-least-once delivery:** reminder events are retried until every subscribed endpoint accepts them (up to 5 attempts, 5 minutes apart), so an endpoint may receive the same reminder more than once. Deduplicate on `data.reminder.id`.

### Test ping

The **Test** button on the webhook pages sends a `ping` event to the selected endpoint and reports the HTTP result. It follows the same envelope and signature rules as real events:

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

## Privacy and security

- **Note content never leaves the instance.** Payloads carry only metadata: ids, titles, workspace, folder, timestamps. Use `reminder.due_minimal` when even titles should not reach the endpoint.
- **No credentials in payloads.** User objects never contain passwords, hashes, or tokens.
- **Strict per-account scoping.** User events are only delivered to the endpoints of the account that produced them.
- **Authenticate the sender.** Set a secret and verify the `X-Poznote-Signature-256` header on every request; an endpoint URL alone must be treated as public.
- **Tenant isolation.** The "User webhooks" tenant isolation option prevents non-admin users from relaying their note metadata to external endpoints, enforced both in the UI and at dispatch time.
- Failed deliveries are logged to the PHP error log with the endpoint URL and the failure status.

## Example receiver

A minimal Node.js receiver that verifies the signature and reacts to events:

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

Point a webhook at `http://your-host:9099/` with the matching secret, hit **Test**, and you should see the `ping` delivery arrive.
