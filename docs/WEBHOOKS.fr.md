<!-- lang-selector -->
<p align="center">
  <a href="WEBHOOKS.md">English</a> ·
  <b>Français</b> ·
  <a href="WEBHOOKS.de.md">Deutsch</a> ·
  <a href="WEBHOOKS.es.md">Español</a> ·
  <a href="WEBHOOKS.pt.md">Português</a> ·
  <a href="WEBHOOKS.ru.md">Русский</a> ·
  <a href="WEBHOOKS.zh-cn.md">简体中文</a> ·
  <a href="WEBHOOKS.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Webhooks

Poznote peut prévenir des services externes quand quelque chose se produit sur l'instance, en envoyant des **webhooks sortants** : des requêtes HTTP POST avec un payload JSON, livrées aux endpoints que vous enregistrez. Il devient ainsi facile de brancher Poznote sur des outils d'automatisation comme n8n, Zapier ou vos propres scripts.

Poznote se contente d'**émettre** des webhooks. Ce que l'endpoint destinataire en fait (envoyer un e-mail, déclencher un workflow, journaliser l'événement, ...) dépend entièrement du destinataire et se trouve en dehors de Poznote.

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Gérer les webhooks](#gérer-les-webhooks)
- [Livraison](#livraison)
  - [Format de la requête](#format-de-la-requête)
  - [Enveloppe du payload](#enveloppe-du-payload)
  - [Vérifier la signature](#vérifier-la-signature)
  - [Garanties de livraison](#garanties-de-livraison)
- [Liens directs vers les notes (URL de l'instance)](#liens-directs-vers-les-notes-url-de-linstance)
- [Objets communs des payloads](#objets-communs-des-payloads)
  - [L'objet data.user](#lobjet-datauser)
  - [L'objet data.note](#lobjet-datanote)
- [Référence des événements](#référence-des-événements)
  - [Événements d'instance](#événements-dinstance)
  - [Événements utilisateur](#événements-utilisateur)
  - [Ping de test](#ping-de-test)
- [Confidentialité et sécurité](#confidentialité-et-sécurité)
- [Exemple de récepteur](#exemple-de-récepteur)

## Vue d'ensemble

Il existe deux niveaux de webhooks indépendants :

| Niveau | Géré depuis | Qui | Événements |
|---|---|---|---|
| **Webhooks admin** | **Paramètres > Outils d'administration > Webhooks admin** | Administrateurs uniquement | Événements d'instance : `user.created`, `user.updated`, `user.activated`, `user.deactivated`, `user.deleted`, `settings.language_changed`, `signup.cap_reached`, `quota.notes_reached`, `quota.storage_reached` |
| **Webhooks utilisateur** | **Paramètres > Webhooks utilisateur** | Tous les comptes (sauf blocage par l'isolation des comptes) | Événements concernant le contenu propre au compte : `note.created`, `note.shared`, `reminder.due`, `reminder.due_title`, `reminder.due_minimal` |

La règle d'isolation est stricte : un événement utilisateur n'est jamais livré qu'aux endpoints enregistrés par le compte qui l'a produit. Les notes et rappels d'un utilisateur n'atteignent jamais les endpoints d'un autre utilisateur. Les événements d'instance sont envoyés à chaque webhook admin abonné.

## Gérer les webhooks

Depuis la page des webhooks (admin ou utilisateur), chaque webhook est défini par :

- **URL de l'endpoint** : doit commencer par `http://` ou `https://`.
- **Description** (facultatif) : une courte note sur l'usage de l'endpoint, par exemple « workflow n8n qui range les nouvelles notes dans Notion ». Elle est affichée dans la liste pour distinguer plusieurs endpoints et n'est jamais envoyée à l'endpoint.
- **Secret** (facultatif) : quand il est défini, chaque livraison est signée en HMAC-SHA256 pour que le récepteur puisse authentifier l'expéditeur. Voir [Vérifier la signature](#vérifier-la-signature).
- **Événements** : le sous-ensemble d'événements auxquels cet endpoint est abonné.

Chaque webhook enregistré dispose d'un menu d'actions (le bouton **...** sur sa ligne) qui propose :

- **Modifier** : changer l'URL de l'endpoint, la description, le secret et les événements souscrits. Le formulaire s'ouvre directement sous le webhook, prérempli avec les valeurs actuelles.
- **Envoyer un test** : envoie immédiatement un événement [ping](#ping-de-test) et affiche le résultat HTTP.
- **Désactiver** / **Activer** : suspendre ou reprendre les livraisons sans supprimer l'enregistrement.
- **Supprimer** : retirer le webhook, après confirmation.

La page affiche aussi le résultat de la dernière livraison de chaque webhook (code de statut HTTP, ou l'erreur quand l'endpoint n'a pas pu être joint) et son horodatage.

Enregistrer deux fois la même URL est permis, mais chaque entrée reçoit sa propre livraison pour chaque événement auquel elle est abonnée : l'endpoint verra donc des doublons.

## Livraison

### Format de la requête

Chaque livraison est une requête HTTP `POST` avec un corps JSON et les en-têtes suivants :

| En-tête | Valeur |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Poznote-Webhook` |
| `X-Poznote-Event` | Le nom de l'événement, par ex. `note.created` |
| `X-Poznote-Delivery` | L'identifiant unique de la livraison (même valeur que `delivery_id` dans le corps) |
| `X-Poznote-Signature-256` | `sha256=<hex HMAC>` du corps brut. Présent uniquement quand le webhook a un secret |

### Enveloppe du payload

Tous les payloads partagent la même enveloppe ; seul `data` change selon l'événement :

```json
{
  "event": "note.created",
  "delivery_id": "f3a1c9e2b4d86f70a1b2c3d4e5f60718",
  "created_at": "2026-08-09T12:34:56+00:00",
  "data": { }
}
```

| Champ | Type | Description |
|---|---|---|
| `event` | string | Nom de l'événement, voir la [Référence des événements](#référence-des-événements) |
| `delivery_id` | string | 32 caractères hexadécimaux, unique par livraison. Deux webhooks recevant le même événement obtiennent des identifiants différents |
| `created_at` | string | Horodatage ISO 8601 (UTC) de la livraison |
| `data` | object | Payload propre à l'événement, décrit plus bas pour chaque événement |

### Vérifier la signature

Quand le webhook a un secret, Poznote envoie `X-Poznote-Signature-256: sha256=<signature>`, où la signature est le HMAC-SHA256 du **corps brut de la requête** calculé avec le secret comme clé (le même schéma que les webhooks GitHub). Vérifiez-la sur les octets bruts, avant tout parsing JSON, et utilisez une comparaison à temps constant :

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

Les requêtes sans signature valide doivent être rejetées : quiconque découvre l'URL de l'endpoint peut lui envoyer de faux événements en POST.

### Garanties de livraison

- La livraison est **synchrone et au mieux**, avec un délai de connexion et de réponse de 5 secondes. Un endpoint lent ou en échec ne casse jamais l'action (une inscription, une création de note) qui a produit l'événement.
- Une livraison est considérée comme réussie sur toute réponse **2xx**. Les redirections ne sont **pas suivies**.
- Les livraisons échouées des événements d'instance, de `note.created` et de `note.shared` ne sont **pas retentées**.
- **Les événements de rappel font exception** : ils sont livrés *au moins une fois*. Un rappel n'est marqué comme envoyé que lorsque chaque endpoint abonné l'a accepté ; sinon, l'événement entier est retenté par le worker d'arrière-plan (jusqu'à 5 tentatives, espacées de 5 minutes). Des endpoints en bonne santé peuvent donc recevoir des doublons d'un événement de rappel et doivent dédoublonner sur `data.reminder.id`.
- Les rappels déjà échus avant que le compte n'enregistre son premier webhook de rappel sont ignorés, pour qu'activer les webhooks ne noie pas l'endpoint sous tout l'arriéré.

## Liens directs vers les notes (URL de l'instance)

Les payloads qui font référence à une note peuvent contenir un lien direct dans `data.note.url`, de la forme :

```
https://poznote.example.com/index.php?note=42&workspace=Poznote
```

Le lien est construit à partir de l'**URL de l'instance**, l'URL publique de votre instance Poznote, configurée dans la section **URL de l'instance** de **Paramètres > Outils d'administration > Webhooks admin** (administrateurs uniquement). C'est la même valeur que l'URL d'instance utilisée par les e-mails de rappel : la définir à un endroit la définit pour les deux. Elle peut aussi être définie via l'API REST (paramètre `smtp_app_url`) ou, à défaut, avec la variable d'environnement `POZNOTE_APP_URL` (ou `APP_URL`).

Quand aucune URL d'instance n'est configurée, `data.note.url` vaut `null` et les payloads ne contiennent aucun lien.

## Objets communs des payloads

### L'objet data.user

Les événements d'instance décrivent le compte concerné par un objet `user` :

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

| Champ | Type | Description |
|---|---|---|
| `id` | integer | Identifiant de l'utilisateur Poznote |
| `username` | string | Nom d'utilisateur de connexion |
| `email` | string ou null | Adresse e-mail, `null` quand le profil n'en a pas |
| `first_name` | string | Prénom, peut être vide |
| `last_name` | string | Nom, peut être vide |
| `source` | string | Qui ou quoi a déclenché l'événement. Présent sur les événements `user.*`, absent des événements de quota. Valeurs : `admin` (interface d'administration), `api` (API REST), `oidc` (connexion SSO ou création automatique de compte), `self` (l'utilisateur agissant sur son propre compte) |

L'objet user ne contient jamais de mots de passe, d'empreintes de mots de passe ni de jetons OIDC.

### L'objet data.note

Les événements utilisateur décrivent la note concernée par un objet `note`. Les champs exacts dépendent de l'événement (chaque événement ci-dessous montre son propre exemple) et sont choisis parmi :

| Champ | Type | Description |
|---|---|---|
| `id` | integer | Identifiant de la note, utilisable avec l'[API REST](API-REST.md) (`GET /api/v1/notes/{id}`) |
| `heading` | string | Titre de la note |
| `type` | string | `note` (HTML) ou `markdown` |
| `workspace` | string | Espace de travail contenant la note |
| `folder` | string | Dossier contenant la note |
| `created` | string | Horodatage de création |
| `url` | string ou null | Lien direct vers la note, `null` quand aucune [URL d'instance](#liens-directs-vers-les-notes-url-de-linstance) n'est configurée |

Le **contenu de la note n'est jamais envoyé**, seulement ses métadonnées.

## Référence des événements

### Événements d'instance

Gérés depuis **Paramètres > Outils d'administration > Webhooks admin**. Livrés à chaque webhook admin abonné.

#### user.created

Un compte utilisateur a été créé : par un administrateur, via l'API REST, ou par une inscription SSO avec création automatique du compte.

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

`data.user.source` vaut `admin`, `api` ou `oidc`.

`data.user.language` est le code de langue d'interface enregistré pour le compte, `en` par
défaut tant que le compte n'a pas encore défini de préférence de langue.

#### user.updated

Un profil utilisateur a changé : nom d'utilisateur, e-mail, prénom, nom ou rôle d'administrateur. Rien n'est émis quand rien n'a réellement changé.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" },
    "changed_fields": ["email", "is_admin"]
  }
}
```

| Champ | Description |
|---|---|
| `data.user` | Le profil **après** la mise à jour |
| `data.changed_fields` | Tableau listant ce qui a changé, parmi `username`, `email`, `first_name`, `last_name`, `is_admin` |

`data.user.source` vaut `admin`, `api`, `oidc` ou `self`.

#### settings.language_changed

La langue d'interface d'un utilisateur a été explicitement changée dans les paramètres (ou via l'API REST `PUT /api/v1/settings/language`). L'adoption automatique de la langue du navigateur à la connexion n'émet pas cet événement à elle seule, mais confirmer cette langue détectée dans le guide de démarrage le fait. En dehors du guide de démarrage, rien n'est émis quand la langue choisie est déjà celle utilisée. L'événement est livré à chaque webhook admin abonné.

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

| Champ | Description |
|---|---|
| `data.user` | Le profil du compte qui a changé de langue |
| `data.language` | Le nouveau code de langue d'interface (`en`, `fr`, `de`, `es`, `pt`, `ru`, `zh-cn`, ...) |
| `data.previous_language` | La langue avant le changement, `null` quand le compte n'en avait encore aucune enregistrée |
| `data.source` | `ui` (interface web) ou `api` (client de l'API REST authentifié par identifiants Basic ou Bearer) |

#### user.activated / user.deactivated

Un compte utilisateur a été réactivé, ou désactivé et ne peut plus se connecter. Quand l'indicateur d'activation change en même temps que d'autres champs du profil, Poznote émet `user.activated`/`user.deactivated` pour l'indicateur et un `user.updated` distinct pour le reste.

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "admin" }
  }
}
```

#### user.deleted

Un compte utilisateur a été supprimé. Le payload contient le profil **tel qu'il était avant la suppression**. `data.user.source` vaut `admin`, `api` ou `self` (l'utilisateur a supprimé son propre compte).

```json
{
  "data": {
    "user": { "id": 7, "username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Martin", "source": "self" }
  }
}
```

#### signup.cap_reached

Une inscription SSO a été refusée parce que l'instance a atteint son nombre maximum d'utilisateurs, ce qui permet à l'exploitant d'être informé en temps réel des inscriptions perdues.

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

| Champ | Description |
|---|---|
| `data.max_users` | La limite d'utilisateurs configurée |
| `data.attempted.username` | Nom d'utilisateur qu'aurait utilisé l'inscription refusée, `null` s'il est inconnu |
| `data.attempted.email` | E-mail de l'inscription refusée, `null` s'il est inconnu |

#### quota.notes_reached

Une action d'un utilisateur a été bloquée parce que le compte a atteint son quota de notes (corbeille comprise).

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

Une action d'un utilisateur (écriture de note ou envoi de pièce jointe) a été bloquée parce que le compte a atteint son quota de stockage.

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

| Champ | Description |
|---|---|
| `data.quota.max_storage_bytes` | La limite configurée, en octets |
| `data.quota.used_bytes` | Utilisation actuelle, en octets |
| `data.quota.requested_bytes` | Taille de l'écriture refusée |
| `data.quota.pool` | Présent uniquement, avec la valeur `"s3"`, quand l'envoi bloqué visait le quota des pièces jointes S3 plutôt que le stockage local |

> **Limitation de fréquence :** les événements de quota sont limités à une livraison au plus par utilisateur, par type d'événement et par heure, pour qu'un utilisateur qui se heurte sans cesse à la limite ne noie pas l'endpoint. `data.user` n'a pas de champ `source` sur les événements de quota.

### Événements utilisateur

Gérés depuis **Paramètres > Webhooks utilisateur**. Livrés uniquement aux endpoints enregistrés par le compte qui a produit l'événement, c'est pourquoi ces payloads ne contiennent pas d'objet `user` : les endpoints appartiennent au compte, et l'identifiant de note désigne la cible.

Un administrateur peut bloquer cette fonctionnalité pour les utilisateurs non administrateurs avec l'option d'isolation des comptes **Webhooks utilisateur** (**Paramètres > Outils d'administration > Isolation des comptes**). Quand elle est bloquée, les utilisateurs non administrateurs ne peuvent pas ouvrir la page et leurs événements ne sont pas envoyés ; les administrateurs ne sont jamais concernés.

#### note.created

Une note a été créée dans le compte, depuis l'interface ou l'API REST.

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

`data.source` vaut `ui` (interface web) ou `api` (client de l'API REST authentifié par identifiants Basic ou Bearer).

#### note.shared

Un lien de partage public a été publié pour l'une des notes du compte.

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

| Champ | Description |
|---|---|
| `data.share.token` | Jeton de partage public |
| `data.share.url` | URL de partage public |
| `data.share.has_password` | Indique si le lien est protégé par mot de passe |
| `data.share.updated` | `false` pour une note nouvellement partagée, `true` quand la note était déjà partagée et que le lien a été régénéré |

#### reminder.due / reminder.due_title / reminder.due_minimal

L'un des rappels de note du compte a atteint son heure de déclenchement. L'événement est émis par le worker de rappels en arrière-plan, indépendamment du canal e-mail, il se déclenche donc même quand SMTP n'est pas configuré.

Les trois variantes vous permettent de choisir la quantité de données qui quitte l'instance ; abonnez-vous à celle qui convient au récepteur :

**`reminder.due`**, le payload complet, inclut le titre de la note et le message du rappel :

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

**`reminder.due_title`**, même déclenchement mais sans le message du rappel :

```json
{
  "data": {
    "note": { "id": 42, "heading": "Meeting notes", "url": "https://poznote.example.com/index.php?note=42&workspace=Poznote" },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

**`reminder.due_minimal`**, identifiants uniquement, aucun contenu de note ne quitte l'instance. Le récepteur peut récupérer les détails via l'[API REST](API-REST.md) si nécessaire :

```json
{
  "data": {
    "note": { "id": 42 },
    "reminder": { "id": 17, "trigger_at": "2026-08-09 14:00:00" }
  }
}
```

> **Livraison au moins une fois :** les événements de rappel sont retentés jusqu'à ce que chaque endpoint abonné les accepte (jusqu'à 5 tentatives, espacées de 5 minutes), si bien qu'un endpoint peut recevoir le même rappel plusieurs fois. Dédoublonnez sur `data.reminder.id`.

### Ping de test

Le bouton **Envoyer un test** des pages de webhooks envoie un événement `ping` à l'endpoint sélectionné et indique le résultat HTTP. Il suit les mêmes règles d'enveloppe et de signature que les vrais événements :

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

## Confidentialité et sécurité

- **Le contenu des notes ne quitte jamais l'instance.** Les payloads ne contiennent que des métadonnées : identifiants, titres, espace de travail, dossier, horodatages. Utilisez `reminder.due_minimal` quand même les titres ne doivent pas atteindre l'endpoint.
- **Aucun identifiant de connexion dans les payloads.** Les objets user ne contiennent jamais de mots de passe, d'empreintes ni de jetons.
- **Cloisonnement strict par compte.** Les événements utilisateur ne sont livrés qu'aux endpoints du compte qui les a produits.
- **Authentifiez l'expéditeur.** Définissez un secret et vérifiez l'en-tête `X-Poznote-Signature-256` sur chaque requête ; une URL d'endpoint seule doit être considérée comme publique.
- **Isolation des comptes.** L'option d'isolation des comptes « Webhooks utilisateur » empêche les utilisateurs non administrateurs de relayer les métadonnées de leurs notes vers des endpoints externes, et elle est appliquée à la fois dans l'interface et au moment de l'envoi.
- Les livraisons échouées sont consignées dans le journal d'erreurs PHP avec l'URL de l'endpoint et le statut de l'échec.

## Exemple de récepteur

Un récepteur Node.js minimal qui vérifie la signature et réagit aux événements :

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

Faites pointer un webhook vers `http://your-host:9099/` avec le secret correspondant, cliquez sur **Envoyer un test**, et vous devriez voir arriver la livraison `ping`.
