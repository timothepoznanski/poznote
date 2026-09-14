<!-- lang-selector -->
<p align="center">
  <a href="AI-ASSISTANT.md">English</a> ·
  <b>Français</b> ·
  <a href="AI-ASSISTANT.de.md">Deutsch</a> ·
  <a href="AI-ASSISTANT.es.md">Español</a> ·
  <a href="AI-ASSISTANT.pt.md">Português</a> ·
  <a href="AI-ASSISTANT.ru.md">Русский</a> ·
  <a href="AI-ASSISTANT.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Assistant IA de Poznote

Un chat IA intégré, capable de rechercher et de lire vos notes. Il fonctionne avec une instance locale d'[Ollama](https://ollama.com) ou de [LM Studio](https://lmstudio.ai), avec un fournisseur cloud comme [Anthropic (Claude)](https://www.anthropic.com) ou OpenAI, ou avec n'importe quel serveur compatible OpenAI.

> [!TIP]
> Vous cherchez plutôt à connecter un assistant IA *externe* (VS Code Copilot, Claude CLI...) à vos notes ? Consultez la [documentation du serveur MCP](MCP-SERVER.fr.md).

## Ce qu'il fait

Une fois configuré, un bouton **Assistant IA** apparaît dans la barre d'icônes de gauche, sur la page des notes comme sur le tableau de bord, et ouvre le panneau de chat sur place. Le panneau est ancré à droite, conserve son état ouvert et sa largeur d'une page à l'autre, et la conversation vous suit entre les deux.

L'assistant dispose d'outils pour **rechercher et lire vos notes**, et s'en sert de lui-même : demandez « que disent mes notes à propos de X ? », réclamez un résumé couvrant plusieurs notes, ou laissez-le retrouver cette note dont vous ne vous souvenez qu'à moitié. Les réponses sont diffusées au fil de l'eau et affichées en Markdown.

Lorsque vous le lui demandez explicitement, il peut aussi agir sur vos notes :

- **écrire** : créer une note, en renommer une ou réécrire son contenu ;
- **organiser** : ajouter ou retirer des tags, lister, créer et renommer des dossiers, déplacer des notes de l'un à l'autre, ajouter des notes et des dossiers aux favoris ;
- **dates** : définir ou supprimer un rappel sur une note (ponctuel ou récurrent), l'assistant connaissant la date et l'heure actuelles dans votre fuseau horaire, si bien que « rappelle-moi lundi prochain à 9 h » fonctionne ;
- **tâches** : ajouter, cocher, décocher, renommer ou supprimer les tâches d'une note de type liste de tâches, y compris leurs dates d'échéance et leurs rappels, et cocher ou décocher une case dans une note ordinaire, sans réécrire le reste de celle-ci ;
- **supprimer** : mettre à la corbeille une note, ou un dossier avec ses sous-dossiers et toutes leurs notes. Tout peut être restauré depuis la page Corbeille : l'assistant n'a aucun moyen de supprimer quoi que ce soit définitivement, ni aucun outil pour vider la corbeille.

La note que vous avez ouverte fait partie du contexte : dites « améliore la mise en forme de cette note » ou « ajoute une conclusion ici » et l'assistant travaille dessus, sans qu'il faille donner d'identifiant ni de titre. Il lit la dernière version enregistrée par l'éditeur, et « cette note » vous suit si vous ouvrez une autre note pendant la conversation. Nommer une autre note dans votre question reste prioritaire. Sur le tableau de bord, aucune note n'est ouverte : nommez donc la note dont vous parlez.

Deux lignes au-dessus du champ de saisie indiquent ce avec quoi l'assistant travaille : l'**espace de travail** dans lequel s'exécutent tous les outils, et la **note** à laquelle « cette note » fait référence lorsqu'une note est ouverte.

Lorsque l'assistant modifie ou crée une note, la note ouverte et la barre latérale se rafraîchissent d'elles-mêmes une fois la réponse terminée, sans rechargement de la page. Si vous avez des modifications non enregistrées dans la note qu'il vient de modifier, un bandeau apparaît à la place : rechargez la note, ou conservez et enregistrez votre propre version.

L'assistant lit et écrit le contenu des notes en Markdown. Les notes en texte enrichi (HTML) sont converties à la volée dans les deux sens, avec le même convertisseur que l'action **Convertir la note**, de sorte qu'une réécriture conserve les titres, les listes, les liens, les tableaux et les images ; la mise en forme riche, comme les couleurs ou les polices, n'est pas conservée. Une note trop longue pour que l'assistant la lise en entier est refusée à la réécriture plutôt que tronquée.

Avant que l'assistant ne modifie le contenu d'une note (réécriture, case à cocher, tâche), Poznote prend un snapshot de la version actuelle, intitulé « Avant modification par l'IA » dans le menu **Snapshots** de la note. Si le résultat ne vous convient pas, restaurez ce snapshot. Le snapshot n'est pas pris lorsque le plus récent contient déjà le même contenu, une réponse qui touche plusieurs fois la même note n'en prend qu'un seul, et les 20 plus récents sont conservés par note, un nombre que vous pouvez modifier dans **Paramètres → Snapshots** (de 1 à 200).

L'assistant est **limité à l'espace de travail courant** : il ne voit, ne recherche et ne modifie que les notes de l'espace de travail dans lequel vous avez ouvert le chat, et les nouvelles notes y sont créées. Pour poser une question sur un autre espace de travail, basculez d'abord vers celui-ci. Sur un tableau de bord affichant plusieurs espaces de travail, le premier clic sur le bouton indique sur quel espace de travail l'assistant va agir et demande si vous souhaitez continuer.

La conversation est conservée tant que l'onglet de votre navigateur reste ouvert (elle survit aux rechargements de page) et peut être effacée à tout moment avec le bouton corbeille de l'en-tête du panneau.

## Activer l'assistant

Rendez-vous dans **Paramètres → Outils d'administration → Assistant IA** (administrateur uniquement) et choisissez un fournisseur :

| Fournisseur | URL | Clé API |
|---|---|---|
| **Ollama** (local) | Dépend de l'endroit où tourne Ollama (conteneur ou hôte), voir [Serveurs locaux et réseau Docker](#serveurs-locaux-et-réseau-docker) | Inutile |
| **LM Studio** (local) | Préremplie avec l'adresse de votre hôte Docker, port `1234`, voir [Option 2](#option-2--ollama-installé-sur-lhôte) | Inutile |
| **Anthropic** (cloud) | Définie automatiquement | Requise |
| **OpenAI** (cloud) | Définie automatiquement | Requise |
| **Autre (URL personnalisée)** | N'importe quelle URL de base compatible OpenAI | Dépend du serveur |

Utilisez ensuite **Vérifier l'accès et lister les modèles**, qui vérifie que le serveur est joignable et remplit la liste déroulante **Modèle** avec les modèles qu'il propose. La liste déroulante reste vide tant que cette vérification n'a pas réussi : c'est donc cette étape qui vous permet de choisir un modèle.

La configuration s'applique à toute l'instance : une fois activé par l'administrateur, chaque profil utilisateur a accès au chat.

### Clés API personnelles

La même page propose l'option **Autoriser les clés API personnelles**. Quand elle est activée, chaque utilisateur dispose d'une carte **Mon assistant IA** dans ses propres paramètres, pour faire pointer le chat vers son propre serveur, son propre fournisseur et sa propre clé API au lieu de ceux configurés pour l'instance.

## Choisir un modèle

Choisissez un modèle qui prend en charge l'**appel d'outils** (aussi appelé « function calling »), par exemple `qwen3`, `llama3.1` ou `mistral`. C'est l'appel d'outils qui permet à l'assistant de parcourir vos notes : avec un modèle qui ne le prend pas en charge, le chat fonctionne toujours (un avertissement vous le signale) mais ne peut pas accéder à vos notes de lui-même.

### Effort de raisonnement

Les modèles de raisonnement (OpenAI GPT-5 et série o, `gpt-oss` sur Ollama, ...) acceptent un **effort de raisonnement** qui détermine combien de temps le modèle réfléchit avant de répondre. Le champ **Effort de raisonnement** de la page de paramètres le contrôle : **Auto** (la valeur par défaut) n'envoie rien et laisse le choix au fournisseur, tandis que **Aucun**, **Minimal**, **Faible**, **Moyen**, **Élevé** et **Très élevé** sont envoyés dans le paramètre `reasoning_effort` de chaque requête. Les valeurs qu'un modèle n'accepte pas sont rejetées par le fournisseur et signalées par une erreur dans le chat.

Certains modèles OpenAI refusent l'appel d'outils sur l'API chat completions tant que l'effort de raisonnement n'est pas `none`. Le chat affiche alors un avertissement indiquant que l'assistant ne peut pas parcourir vos notes : réglez **Effort de raisonnement** sur **Aucun** pour retrouver les outils.

## Serveurs locaux et réseau Docker

Le serveur IA est appelé **depuis le serveur Poznote**, jamais depuis votre navigateur. Comme Poznote tourne dans un conteneur Docker, l'URL que vous configurez doit être joignable *depuis l'intérieur de ce conteneur*.

Pour un Ollama local, **deux configurations sont possibles**, toutes deux entièrement prises en charge :

| Configuration | URL à configurer | Configuration réseau |
|---|---|---|
| [**Option 1** : Ollama dans un conteneur Docker](#option-1--ollama-dans-un-conteneur-docker-le-plus-simple) | `http://ollama:11434` | Aucune |
| [**Option 2** : Ollama installé sur l'hôte](#option-2--ollama-installé-sur-lhôte) | L'adresse de votre hôte, vue depuis le conteneur | Requise, c'est la partie sur laquelle on bute souvent |

Choisissez l'option 1 si vous partez de zéro. Choisissez l'option 2 si Ollama est déjà installé sur votre machine ou s'il est aussi utilisé par d'autres applications.

### Option 1 : Ollama dans un conteneur Docker (le plus simple)

De loin, la configuration la plus simple consiste à ne pas faire intervenir l'hôte du tout : ajoutez Ollama comme service supplémentaire dans le même `docker-compose.yml` que Poznote :

```yaml
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: always
    volumes:
      - "./ollama:/root/.ollama"
```

puis démarrez-le et téléchargez un modèle :

```bash
docker compose up -d
docker exec ollama ollama pull qwen3
```

Dans les paramètres de l'Assistant IA, remplacez l'URL préremplie par `http://ollama:11434`. Les services d'un même fichier compose partagent un réseau Docker et se joignent par leur nom de service, il n'y a donc rien d'autre à configurer : aucun port à publier, aucun `OLLAMA_HOST` à définir, et Ollama n'est jamais exposé en dehors du réseau Docker. Si votre fichier compose définit des `networks` personnalisés, placez `ollama` sur le même réseau que le service Poznote.

Pour l'accélération GPU dans le conteneur, consultez la [documentation de l'image Docker d'Ollama](https://hub.docker.com/r/ollama/ollama).

### Option 2 : Ollama installé sur l'hôte

Si Ollama tourne directement sur la machine hôte (installation standard depuis [ollama.com](https://ollama.com)), ou si vous utilisez LM Studio, Poznote peut aussi le joindre, mais le conteneur doit retrouver le chemin vers l'hôte à travers le réseau Docker. Les sous-sections ci-dessous expliquent comment.

#### Pourquoi `localhost` ne fonctionne pas

`http://localhost:11434` ou `http://127.0.0.1:11434` ne fonctionneront **pas** : à l'intérieur du conteneur, `localhost` désigne le conteneur lui-même, et non la machine qui fait tourner Ollama. Docker donne à chaque conteneur sa propre pile réseau isolée : même machine physique, deux « localhost » différents.

Pour joindre l'hôte, le conteneur doit passer par la **passerelle** de son réseau Docker, qui est une adresse IP appartenant à l'hôte.

#### Trouver la bonne URL

Poznote préremplit le champ URL avec sa meilleure estimation de l'adresse de votre hôte Docker, dans cet ordre :

1. `host.docker.internal` s'il est résolu à l'intérieur du conteneur (toujours le cas avec Docker Desktop pour Windows/macOS ; sous Linux, uniquement si vous le déclarez, voir ci-dessous) ;
2. sinon, l'IP de la passerelle par défaut du conteneur (par exemple `http://172.17.0.1:11434`), lue dans sa table de routage.

L'URL préremplie fonctionne généralement telle quelle. Si vous devez la vérifier vous-même, depuis l'hôte :

```bash
docker exec <poznote-webserver-container> ip route | grep default
# default via 172.17.0.1 dev eth0   ← l'IP de la passerelle est votre hôte, vu depuis le conteneur
```

Sous Linux, vous pouvez rendre `host.docker.internal` disponible (comme avec Docker Desktop) en ajoutant ceci au service `webserver` de votre `docker-compose.yml` :

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

puis `docker compose up -d`. L'URL devient `http://host.docker.internal:11434`, stable et identique sur toutes les machines.

#### Faire écouter Ollama pour le conteneur

Par défaut, Ollama n'écoute que sur `127.0.0.1`, la boucle locale de l'hôte, injoignable depuis n'importe quel conteneur même avec la bonne IP de passerelle. Vous devez définir `OLLAMA_HOST` pour qu'il écoute sur une interface que le conteneur peut joindre.

Avec l'installation Linux standard (systemd) :

```bash
sudo systemctl edit ollama
```

ajoutez :

```ini
[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
```

puis :

```bash
sudo systemctl restart ollama
```

Sur quelle adresse écouter :

- **`172.17.0.1` (le pont `docker0`, recommandé sous Linux)** : joignable depuis tous les conteneurs, présent sur toute installation Docker, et non exposé au monde extérieur. Vérifiez l'IP de votre `docker0` avec `ip addr show docker0` (c'est `172.17.0.1`, sauf si vous avez personnalisé les plages d'adresses de Docker).
- **`0.0.0.0`** (toutes les interfaces) : le plus simple, mais cela expose Ollama sur **toutes** les interfaces de la machine. Ollama n'a pas d'authentification : si votre machine a une IP publique, n'utilisez ce choix que derrière un pare-feu qui bloque le port (par exemple `ufw deny 11434`). Aucun souci sur une machine domestique derrière un NAT.
- La passerelle d'un réseau Compose précis (par exemple `192.168.48.1`) : cela fonctionne, mais ces sous-réseaux sont attribués automatiquement par Docker à la création du réseau et peuvent changer si le réseau est recréé, évitez donc ce choix.

Avec Docker Desktop (Windows/macOS) et Ollama tournant sur l'hôte, `OLLAMA_HOST=0.0.0.0` est le choix habituel ; la machine n'est généralement pas exposée directement, et `host.docker.internal` la joint alors sans configuration supplémentaire.

**LM Studio** fonctionne de la même manière : dans les paramètres de son serveur, activez « Serve on Local Network » (l'équivalent d'une écoute sur `0.0.0.0`), sinon il n'écoutera que sur `127.0.0.1`.

#### Vérifier la connectivité

Depuis l'hôte, vérifiez sur quoi Ollama écoute réellement :

```bash
ss -tlnp | grep 11434
```

et testez l'URL exacte qu'utilisera Poznote, depuis l'intérieur du conteneur :

```bash
docker exec <poznote-webserver-container> curl -s -m 3 http://172.17.0.1:11434/
# "Ollama is running"
```

Si cette commande ne renvoie rien, le problème vient de l'adresse d'écoute d'Ollama ou d'un pare-feu, pas de Poznote. Le bouton **Vérifier l'accès et lister les modèles** de la page de paramètres effectue la même vérification et remplit la liste déroulante des modèles en cas de succès.

## Erreurs de connexion

Une requête qui échoue avant que le serveur IA n'ait répondu quoi que ce soit (délai DNS dépassé, connexion refusée, négociation TLS qui n'aboutit pas) est renvoyée automatiquement, jusqu'à trois tentatives d'affilée avec une courte pause entre elles. Le chat affiche une ligne *nouvelle tentative* pendant ce temps, et rien n'est perdu puisque le serveur n'avait pas commencé à répondre. Si la dernière tentative échoue aussi, l'erreur apparaît dans le chat avec un bouton **Réessayer** qui renvoie le même message sans avoir à le retaper.

Une erreur survenue une fois que la réponse a commencé à s'afficher n'est pas retentée, puisqu'une partie de la réponse est déjà à l'écran : utilisez le bouton **Réessayer**.

## Confidentialité

Le serveur IA est appelé depuis le serveur Poznote, jamais depuis votre navigateur. Avec une instance locale d'Ollama ou de LM Studio, vos notes et vos conversations ne quittent jamais votre machine. Avec un fournisseur cloud, les parties de vos notes que l'assistant lit pour répondre sont envoyées à ce fournisseur.
