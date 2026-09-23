<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <b>Français</b> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Transcription dans Poznote (reconnaissance vocale)

Dictez dans une note, ou transformez une pièce jointe audio en texte, grâce à un serveur de reconnaissance vocale que vous hébergez vous-même.

Poznote n'embarque aucun modèle vocal. Il envoie l'audio à un serveur qui expose l'API audio d'OpenAI, `POST /v1/audio/transcriptions`, par exemple un Whisper auto-hébergé. Faites tourner ce serveur à côté de Poznote et l'audio ne quitte jamais votre machine.

> [!TIP]
> Cette fonction est distincte de l'[Assistant IA](AI-ASSISTANT.fr.md). Les deux se configurent indépendamment et peuvent utiliser des serveurs différents, ou vous pouvez activer l'un sans l'autre.

- [Démarrage rapide](#démarrage-rapide)
- [Ce que fait la transcription](#ce-que-fait-la-transcription)
- [Paramètres](#paramètres)
- [Faire tourner un serveur de transcription](#faire-tourner-un-serveur-de-transcription)
- [Joindre le serveur depuis Poznote](#joindre-le-serveur-depuis-poznote)
- [Limites](#limites)
- [Exigences du navigateur](#exigences-du-navigateur)
- [Serveurs personnels](#serveurs-personnels)
- [Confidentialité et données conservées](#confidentialité-et-données-conservées)
- [Dépannage](#dépannage)
- [Désinstallation](#désinstallation)

## Démarrage rapide

Le chemin le plus court, avec [Speaches](https://github.com/speaches-ai/speaches) dans le même projet Docker Compose que Poznote. Chaque commande ci-dessous a été exécutée telle qu'elle est écrite.

**1. Ajoutez le serveur à votre `docker-compose.yml`**, comme nouveau service à côté de `webserver`, et déclarez son volume en bas du fichier :

```yaml
services:
  # ... webserver et mcp-server restent tels quels ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

L'absence de section `ports:` est volontaire : Poznote joint le serveur par le réseau interne du projet, et rien n'est exposé à l'extérieur. Voir [pourquoi c'est important](#joindre-le-serveur-depuis-poznote).

**2. Démarrez-le :**

```bash
docker compose up -d speaches
```

L'image pèse environ 2 Go.

**3. Téléchargez un modèle.** Speaches démarre sans aucun modèle et n'en récupère pas de lui-même : une transcription demandée à un modèle qu'il n'a pas téléchargé échoue avec `Model '...' is not installed locally`. Téléchargez-en un depuis le conteneur Poznote, qui se trouve sur le même réseau :

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Il répond `Model 'Systran/faster-whisper-small' downloaded` au bout de quelques secondes (environ 480 Mo). Le modèle reste dans le volume `speaches-cache` d'un redémarrage à l'autre.

**4. Configurez Poznote.** Allez dans **Paramètres → Outils d'administration → Transcription** et :

- cochez **Activer la transcription** ;
- choisissez **Speaches (local)** et saisissez l'URL `http://speaches:8000` ;
- cliquez sur **Vérifier l'accès et lister les modèles**, puis choisissez `Systran/faster-whisper-small` dans **Modèle** ;
- cochez les utilisateurs autorisés à s'en servir, vous compris ;
- enregistrez.

**5. Essayez.** Rechargez une note en HTTPS (ou via `localhost`, voir les [exigences du navigateur](#exigences-du-navigateur)), tapez `/dict`, autorisez le microphone, parlez, puis arrêtez.

## Ce que fait la transcription

Une fois configurée, la transcription apparaît à deux endroits.

### Dicter

La dictée passe par **Enregistrer un audio**, sous **Insérer** et **Médias** dans le menu slash de chaque note, en texte enrichi comme en Markdown, et dans la barre d'édition au-dessus du clavier sur téléphone. Taper `/dict`, `/voice` ou `/transcribe` le trouve directement, car le filtre cherche aussi dans les sous-menus.

Une boîte de dialogue s'ouvre, et l'enregistrement démarre quand vous appuyez sur **Démarrer**, qui est aussi le moment où le navigateur demande l'accès au microphone la première fois. Une barre de niveau montre que le microphone capte bien quelque chose, et le minuteur affiche le temps écoulé par rapport à la durée maximale fixée par l'administrateur, par exemple `1:12 / 10:00`.

Quand la transcription est disponible, un menu **Langue parlée** se trouve sous le minuteur. Il part de la langue définie dans la configuration, marquée comme langue par défaut, et le modifier ne vaut que pour cet enregistrement. **Détection automatique** laisse le serveur reconnaître la langue même quand la configuration en fixe une.

Le sort de l'enregistrement se choisit au moment de l'arrêter. **Insérer l'audio** le place dans la note sous forme de lecteur audio, sans transcription. **Transcrire** l'envoie au serveur, et n'apparaît que si la transcription vous est accessible. Quand l'enregistrement atteint la durée maximale, il s'arrête de lui-même et attend que vous choisissiez l'un des deux boutons.

La transcription revient dans une zone de texte où vous pouvez la corriger avant qu'elle n'entre dans la note. **Insérer** la place là où se trouvait votre curseur. Si la transcription échoue, les deux boutons reviennent, pour que l'enregistrement puisse encore être inséré en audio ou renvoyé.

La case **Joindre aussi l'enregistrement à cette note** est décochée par défaut, et l'audio est alors supprimé dès que le texte revient. Cochez-la et l'enregistrement est aussi conservé comme pièce jointe ordinaire nommée `dictation-<date>.<ext>`, pour pouvoir le réécouter ou le transcrire plus tard avec un meilleur modèle.

**Annuler**, Échap ou un clic en dehors de la boîte de dialogue coupe le microphone et abandonne l'enregistrement, même en cours de route.

### Transcrire une pièce jointe audio

Sur la page **Pièces jointes** d'une note, chaque fichier audio reçoit un bouton microphone gris, entre le téléchargement et la suppression. C'est celui qu'il vous faut pour un mémo vocal enregistré sur votre téléphone puis envoyé dans Poznote.

Il vous ramène à la note et ouvre la même boîte de dialogue : le fichier est transcrit depuis le stockage, sans être envoyé à nouveau, et le texte vous est proposé pour relecture. **Insérer** le place juste après la pièce jointe quand la note y fait référence, et à la fin de la note sinon.

Un fichier est considéré comme audio quand son nom se termine par `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac` ou `aac`, ou quand son type enregistré est `audio/...`. L'extension l'emporte volontairement sur le type : Windows envoie un `.m4a` de l'Enregistreur vocal en tant que `video/mp4`. Les fichiers vidéo (`mp4`, `webm`) ne sont pas proposés, même s'ils contiennent du son.

Si la note est ouverte et en cours de modification ailleurs, le texte n'est pas inséré : il reste dans la zone pour que vous puissiez le copier.

## Paramètres

Tout se trouve dans **Paramètres → Outils d'administration → Transcription** (administrateur uniquement).

| Paramètre | Rôle |
|---|---|
| **Activer la transcription** | Interrupteur général de la configuration d'instance ci-dessous. |
| **Utilisateurs autorisés** | Profils autorisés à utiliser le serveur de l'instance. Personne n'y a accès tant qu'il n'est pas coché, nouveaux profils compris. |
| **Serveur de transcription** | Préréglages qui remplissent l'URL et affichent ou masquent la clé API : Speaches, whisper.cpp, LocalAI, OpenAI ou Autre. |
| **URL du serveur** | URL de base du serveur, par exemple `http://speaches:8000`. `/v1` et le chemin complet `/v1/audio/transcriptions` sont également acceptés. |
| **Clé API** | Envoyée sous la forme `Authorization: Bearer`. Les serveurs locaux n'en demandent généralement pas ; OpenAI si. |
| **Vérifier l'accès et lister les modèles** | Confirme que le serveur répond et remplit les suggestions de modèles. |
| **Modèle** | Le nom du modèle envoyé avec chaque requête. Obligatoire pour tous les serveurs, même ceux qui l'ignorent. |
| **Langue parlée** | Code à deux lettres comme `en`, `fr` ou `de`, ou vide pour laisser le serveur la détecter. La fenêtre d'enregistrement la présélectionne, et son menu permet de la remplacer pour un enregistrement. |
| **Durée maximale d'enregistrement** | En minutes, de 1 à 60, 10 par défaut. **Enregistrer un audio** s'arrête de lui-même une fois ce seuil atteint, puis attend **Insérer l'audio** ou **Transcrire**. Sans transcription, il insère l'audio aussitôt. Les pièces jointes ne sont pas concernées. |
| **Autoriser les serveurs de transcription personnels** | Permet à chaque utilisateur de définir son propre serveur, voir [Serveurs personnels](#serveurs-personnels). |

### Choisir un modèle

Le champ du modèle est un texte libre avec suggestions plutôt qu'une liste déroulante, car tous les serveurs ne listent pas leurs modèles (whisper.cpp ne le fait pas). Sur Speaches, la vérification ne liste que les modèles de reconnaissance vocale et laisse de côté les voix de synthèse vocale que vous auriez pu télécharger.

Les modèles plus gros sont plus précis et plus lents. Sur CPU, `small` est le compromis habituel. La différence n'a rien de subtil : sur la même phrase en français, `Systran/faster-whisper-tiny` a renvoyé "ceci est en test de dicter vocale d'opposnade" là où `Systran/faster-whisper-small` a renvoyé "ceci est un test de dictée vocale". Des modèles plus grands comme `large-v3` gèrent encore mieux les accents et le bruit, mais demandent un GPU pour rester confortables.

Pour donner un ordre de grandeur, sur un CPU à 4 cœurs avec `small` : une phrase courte prend environ 6 secondes, et la première requête après le démarrage du serveur environ 20, le temps que le modèle se charge en mémoire. Speaches utilise environ 1,5 Go de RAM avec `small` chargé.

### Langue parlée

Laissez **Langue parlée** vide et le serveur détecte la langue, ce que Whisper fait bien. Indiquez un code quand vous dictez toujours dans la même langue et que des phrases courtes sont prises pour une autre.

## Faire tourner un serveur de transcription

Poznote a besoin d'un serveur qui accepte `POST /v1/audio/transcriptions` en données de formulaire multipart avec les champs `file`, `model`, `response_format=json` et, en option, `language`, et qui répond `{"text": "..."}`.

### Speaches (recommandé)

L'option la plus complète : il liste ses modèles, peut en garder plusieurs et lit le WebM (ce qu'enregistrent Chrome et Firefox), le M4A et le WAV sans configuration supplémentaire. Le [Démarrage rapide](#démarrage-rapide) l'installe avec Docker Compose.

Gérer les modèles, depuis le conteneur Poznote :

```bash
# Parcourir ce qui peut être téléchargé
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# Télécharger, lister, supprimer
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Le téléchargement nécessite un accès à internet depuis le conteneur Speaches. La transcription, non.

Avec un GPU NVIDIA, utilisez l'image CUDA au lieu de `latest-cpu` et donnez au service l'accès au GPU ; voir la [documentation de Speaches](https://speaches.ai).

### whisper.cpp

Plus léger que Speaches, avec un seul modèle par serveur et pas de liste des modèles. Il fonctionne bien avec Poznote, mais seulement avec les bonnes options : par défaut, il ne parle ni la route OpenAI, ni aucune langue autre que l'anglais, ni aucun format autre que le WAV.

**1. Ajoutez le service** à `docker-compose.yml` :

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
> Gardez `command` sous forme de liste à un seul élément, exactement comme ci-dessus. L'image exécute sa commande via `bash -c`, et la forme en simple chaîne est découpée en arguments séparés, si bien que `bash` lance `whisper-server` sans aucune option. Il démarre alors silencieusement avec ses valeurs par défaut : anglais uniquement, WAV uniquement, à l'écoute sur `127.0.0.1` à l'intérieur de son conteneur, sur `/inference`. Rien dans les journaux n'indique un problème.

**2. Téléchargez un modèle multilingue** dans le volume, avant de démarrer le service : le serveur refuse de démarrer sans son fichier de modèle, et l'image ne fournit que `ggml-base.en.bin`, qui ne comprend que l'anglais.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. Démarrez-le :**

```bash
docker compose up -d whisper
```

À quoi sert chaque option :

| Option | Défaut | Pourquoi Poznote en a besoin |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | Le modèle fourni ne comprend que l'anglais. |
| `-l auto` | `en` | Sans elle, une parole dans toute autre langue revient déformée en anglais. |
| `--convert` | désactivée | Les navigateurs enregistrent en WebM, les téléphones produisent du M4A ; sans elle, seul le WAV est accepté. Utilise le ffmpeg fourni dans l'image. |
| `--host 0.0.0.0` | `127.0.0.1` | Sinon, rien en dehors du conteneur ne peut le joindre. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | La route qu'appelle Poznote. |

**4. Dans Poznote**, choisissez **whisper.cpp (local)**, saisissez l'URL `http://whisper:8080` et tapez n'importe quel nom de modèle : whisper.cpp l'ignore et utilise le fichier avec lequel il a été démarré, mais le champ est obligatoire. **Vérifier l'accès et lister les modèles** indique alors que le serveur ne liste aucun modèle, ce qui est la réponse attendue d'un whisper.cpp qui fonctionne.

### OpenAI

Choisissez **OpenAI** : l'URL est remplie pour vous, et une clé API est obligatoire. Utilisez l'un des modèles de transcription d'OpenAI, par exemple `whisper-1`. L'audio est envoyé à OpenAI.

### LocalAI et autres serveurs

LocalAI et les autres serveurs compatibles OpenAI fonctionnent via les préréglages **LocalAI** ou **Autre**, du moment qu'ils respectent le format de requête décrit en haut de cette section. Leur installation n'est pas détaillée ici ; consultez leur propre documentation, par exemple [celle de LocalAI](https://localai.io).

## Joindre le serveur depuis Poznote

Poznote appelle le serveur de transcription depuis son propre conteneur, jamais depuis votre navigateur. L'URL doit donc être joignable depuis l'intérieur du conteneur Poznote, et `localhost` y désigne le conteneur Poznote lui-même.

**Recommandé : le même réseau Docker, sans port publié.** Les services d'un même projet Compose partagent un réseau et se joignent par leur nom de service. C'est ainsi que le service `mcp-server` du `docker-compose.yml` fourni joint `http://webserver:80`, et que Poznote joint `http://speaches:8000` ou `http://whisper:8080` ci-dessus.

> [!CAUTION]
> N'ajoutez pas `ports: - "8000:8000"` au serveur de transcription sur une machine dotée d'une IP publique. Speaches et whisper.cpp n'ont aucune authentification par défaut : cela publierait un service de transcription gratuit pour tout internet. Le lier à `127.0.0.1:8000:8000` est sans risque, mais le conteneur Poznote ne peut alors plus le joindre ; le réseau partagé n'a besoin ni de l'un ni de l'autre.

Si le serveur tourne dans un conteneur séparé lancé par `docker run`, rattachez-le au réseau de Poznote plutôt que de publier un port. Trouvez le nom du réseau avec :

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

puis démarrez le serveur avec `--network <that-network>` et utilisez le nom de son conteneur dans l'URL.

Pour un serveur sur une autre machine, ou sur l'hôte Docker en dehors de Docker, utilisez une adresse que le conteneur Poznote peut joindre. Les mêmes règles que pour l'assistant IA s'appliquent, voir [Serveurs locaux et réseau Docker](AI-ASSISTANT.fr.md#serveurs-locaux-et-réseau-docker).

Pour vérifier que le serveur répond depuis l'endroit où se trouve Poznote :

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## Limites

- **Durée d'enregistrement :** le paramètre **Durée maximale d'enregistrement**, 10 minutes par défaut. Elle est appliquée dans le navigateur.
- **Taille d'envoi :** 100 Mo par enregistrement ou pièce jointe envoyé en transcription.
- **Temps de transcription :** Poznote attend le serveur jusqu'à 570 secondes, juste en dessous des 600 secondes que son propre nginx accorde à une requête, afin qu'une transcription lente se termine par un message lisible plutôt que par une page d'erreur brute.
- **Délai du reverse proxy :** un proxy placé devant Poznote peut couper la requête bien plus tôt. nginx est réglé par défaut sur 60 secondes, et Nginx Proxy Manager sur 90. Une transcription plus longue échoue alors avec `HTTP 504`, alors qu'elle aurait abouti. Augmentez le délai de lecture du proxy pour votre hôte Poznote (pour nginx et l'onglet **Advanced** de Nginx Proxy Manager : `proxy_read_timeout 600s;`), ou gardez des enregistrements assez courts pour être transcrits dans ce délai.

## Exigences du navigateur

**HTTPS.** Les navigateurs n'accordent le microphone à une page que sur une origine sécurisée : HTTPS, ou `localhost`. En `http` simple sur toute autre adresse, **Enregistrer un audio** indique qu'il a besoin de HTTPS et n'enregistre rien. La transcription d'une pièce jointe n'est pas concernée, puisque rien n'est enregistré.

**L'en-tête `Permissions-Policy`.** Poznote envoie `microphone=(self)`, qui autorise sa propre origine et refuse toutes les autres. Si un reverse proxy placé devant ajoute son propre en-tête `Permissions-Policy`, il peut remplacer celui de Poznote, et un `microphone=()` à cet endroit fait refuser le microphone par le navigateur, quelle que soit l'autorisation accordée au site. La boîte de dialogue affiche alors « Poznote n'a pas été autorisé à utiliser le microphone ». Supprimez l'en-tête au niveau du proxy, ou définissez-y aussi `microphone=(self)`.

## Serveurs personnels

L'administrateur peut cocher **Autoriser les serveurs de transcription personnels**. Chaque utilisateur dispose alors d'une carte **Mon serveur de transcription** dans ses propres paramètres, avec les mêmes champs de serveur, d'URL, de clé, de modèle et de langue. Quand un utilisateur l'active, son audio part vers son serveur au lieu de celui de l'instance, qu'il figure ou non dans la liste des utilisateurs autorisés.

La durée maximale d'enregistrement reste celle fixée par l'administrateur.

Les clés API personnelles sont chiffrées au repos avec le secret de l'instance, comme les clés de l'assistant IA et de la synchronisation Git.

## Confidentialité et données conservées

L'enregistrement est envoyé à Poznote, qui le transmet ensuite au serveur de transcription. C'est volontaire : le serveur de transcription se trouve généralement sur un réseau que le navigateur ne peut pas joindre, et sa clé API n'a rien à faire dans une page web.

Poznote n'en garde aucune copie. L'audio réside dans le fichier d'envoi temporaire de PHP le temps d'une requête, sauf si vous cochez **Joindre aussi l'enregistrement à cette note**, ce qui le conserve comme pièce jointe ordinaire, comptée dans votre espace de stockage.

Avec Speaches ou whisper.cpp installé comme décrit plus haut, tout est traité sur votre machine et rien ne part en ligne :

- Le navigateur enregistre avec MediaRecorder, pas avec la reconnaissance vocale intégrée du navigateur, qui enverrait l'audio à Google ou Apple.
- L'enregistrement va uniquement à votre serveur Poznote, et Poznote le transmet uniquement à l'URL configurée sur la page Transcription. Aucun autre hôte n'est contacté.
- Le seul accès internet est le téléchargement du modèle, une fois, à l'installation. La transcription fonctionne avec le conteneur coupé d'internet.
- Le texte transcrit atterrit dans votre note comme du texte tapé au clavier, et nulle part ailleurs.

> [!WARNING]
> Le preset **OpenAI** est l'exception : chaque enregistrement est envoyé aux serveurs d'OpenAI. C'est le seul preset qui le fait, et le seul dont l'URL est fixe et masquée. Si la page Transcription affiche un champ URL, l'audio reste chez le serveur de cette URL.

## Dépannage

**« Poznote n'a pas été autorisé à utiliser le microphone », alors que le navigateur indique qu'il est autorisé**
Quelque chose le refuse avant même que l'autorisation ne soit consultée. Vérifiez l'en-tête qui parvient au navigateur :

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

Il doit indiquer `microphone=(self)`. Voir [Exigences du navigateur](#exigences-du-navigateur).

**« Le microphone nécessite HTTPS »**
Vous êtes en `http` simple sur une adresse autre que `localhost`. Servez Poznote en HTTPS.

**Pas de bouton Transcrire pendant l'enregistrement**
La transcription est désactivée, votre profil ne figure pas dans la liste des utilisateurs autorisés, ou la configuration n'a pas d'URL ou pas de modèle. **Enregistrer un audio** reste toujours disponible, sous **Insérer** et **Médias** ; `/dict` le trouve.

**Pas de bouton microphone sur une pièce jointe**
Le fichier n'est pas reconnu comme audio (voir la liste dans [Transcrire une pièce jointe audio](#transcrire-une-pièce-jointe-audio)), ou la transcription n'est pas disponible pour votre profil.

**"Failed to connect to ..."**
L'URL est erronée, ou le serveur ne tourne pas, ou il n'est pas sur un réseau que Poznote peut joindre. Voir [Joindre le serveur depuis Poznote](#joindre-le-serveur-depuis-poznote).

**"HTTP 404: Model '...' is not installed locally"**
Speaches n'a pas téléchargé ce modèle. Téléchargez-le, voir l'étape 3 du [Démarrage rapide](#démarrage-rapide).

**"HTTP 404" lors de la vérification de l'accès, avec whisper.cpp**
Choisissez le préréglage **whisper.cpp** plutôt que **Autre** : whisper.cpp ne liste pas ses modèles, et seul son préréglage interprète ce 404 comme un serveur qui fonctionne. Si ce sont les transcriptions elles-mêmes qui renvoient 404, le serveur tourne sans `--inference-path /v1/audio/transcriptions`, ce qui signifie généralement que `command` a été écrit sous forme de chaîne, voir l'avertissement sous [whisper.cpp](#whispercpp).

**Une parole en français (ou dans toute autre langue que l'anglais) revient en anglais, ou n'a aucun sens**
whisper.cpp tourne sans `-l auto`, ou avec le modèle fourni `ggml-base.en.bin`. Utilisez un modèle multilingue et `-l auto`.

**Les enregistrements échouent mais les fichiers WAV fonctionnent, sur whisper.cpp**
`--convert` est absent.

**"HTTP 504" sur les enregistrements plus longs**
Un reverse proxy a coupé la requête avant la fin de la transcription. Voir le délai du reverse proxy dans [Limites](#limites).

**« Le serveur de transcription n'a pas répondu en 570 secondes »**
L'enregistrement est trop long pour ce modèle sur ce matériel. Enregistrez moins à la fois, réduisez la **Durée maximale d'enregistrement**, ou utilisez un modèle plus petit ou un GPU.

**« Le serveur n'a rien entendu dans cet enregistrement »**
Whisper a renvoyé un texte vide, sa réponse honnête face au silence. Surveillez la barre de niveau pendant l'enregistrement : si elle ne bouge jamais, le navigateur utilise le mauvais périphérique d'entrée.

**« Cette note ne peut pas être modifiée d'ici pour le moment »**
La note est en cours de modification ailleurs, le texte n'a donc pas été inséré. Copiez-le depuis la zone de texte, ou fermez l'autre éditeur et réessayez.

**La première transcription est lente, les suivantes sont rapides**
Le serveur charge le modèle en mémoire à la première utilisation, environ 20 secondes pour `small` sur CPU.

## Désinstallation

Décochez **Activer la transcription** dans les paramètres, puis retirez le service de `docker-compose.yml` et :

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` affiche le nom exact du volume, préfixé par le nom de votre projet.
