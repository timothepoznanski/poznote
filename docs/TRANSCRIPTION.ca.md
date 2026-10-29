<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <a href="TRANSCRIPTION.de.md">Deutsch</a> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a> ·
  <a href="TRANSCRIPTION.ko.md">한국어</a> ·
  <a href="TRANSCRIPTION.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Transcripció de Poznote (veu a text)

Dicteu en una nota, o convertiu en text un fitxer d'àudio adjunt, amb un servidor de veu a text que gestioneu vós mateix.

Poznote no incorpora cap model de veu. Envia l'àudio a un servidor que exposa l'API d'àudio d'OpenAI, `POST /v1/audio/transcriptions`, com ara un Whisper autoallotjat. Executeu aquest servidor al costat de Poznote i l'àudio no sortirà mai de la vostra màquina.

> [!TIP]
> Això és independent de l'[assistent d'IA](AI-ASSISTANT.ca.md). Tots dos es configuren per separat i poden fer servir servidors diferents, o podeu activar-ne un sense l'altre.

- [Inici ràpid](#inici-ràpid)
- [Què fa](#què-fa)
- [Paràmetres](#paràmetres)
- [Execució d'un servidor de transcripció](#execució-dun-servidor-de-transcripció)
- [Accés al servidor des de Poznote](#accés-al-servidor-des-de-poznote)
- [Límits](#límits)
- [Requisits del navegador](#requisits-del-navegador)
- [Servidors personals](#servidors-personals)
- [Privadesa i què s'emmagatzema](#privadesa-i-què-semmagatzema)
- [Resolució de problemes](#resolució-de-problemes)
- [Eliminació](#eliminació)

## Inici ràpid

El camí més curt, amb [Speaches](https://github.com/speaches-ai/speaches) executant-se al mateix projecte de Docker Compose que Poznote. Totes les ordres de més avall s'han executat tal com estan escrites.

**1. Afegiu el servidor al `docker-compose.yml`**, com a servei nou al costat de `webserver`, i declareu-ne el volum al final del fitxer:

```yaml
services:
  # ... webserver and mcp-server stay as they are ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

No hi ha secció `ports:` expressament: Poznote accedeix al servidor per la xarxa interna del projecte, i no s'exposa res a l'exterior. Vegeu [per què és important](#accés-al-servidor-des-de-poznote).

**2. Inicieu-lo:**

```bash
docker compose up -d speaches
```

La imatge ocupa uns 2 GB.

**3. Baixeu un model.** Speaches s'inicia sense cap model i no en baixa cap pel seu compte: una transcripció demanada a un model que no ha baixat falla amb `Model '...' is not installed locally`. Baixeu-ne un a través del contenidor de Poznote, que és a la mateixa xarxa:

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Al cap d'uns segons respon `Model 'Systran/faster-whisper-small' downloaded` (uns 480 MB). El model es conserva al volum `speaches-cache` entre reinicis.

**4. Configureu Poznote.** Aneu a **Paràmetres → Eines d'administració → Transcripció** i:

- activeu **Activa la transcripció**;
- trieu **Speaches (local)** i definiu l'URL com a `http://speaches:8000`;
- feu clic a **Comprova l'accés i llista els models** i, després, trieu `Systran/faster-whisper-small` a **Model**;
- marqueu els usuaris que el poden fer servir, inclòs vós;
- deseu.

**5. Proveu-ho.** Torneu a carregar una nota amb HTTPS (o a través de `localhost`; vegeu els [requisits del navegador](#requisits-del-navegador)), escriviu `/dict`, permeteu el micròfon, parleu i atureu l'enregistrament.

## Què fa

Un cop configurada, la transcripció apareix en dos llocs.

### Dictat

El dictat passa per **Enregistra àudio**, a **Insereix** i **Multimèdia** al menú de barra de qualsevol nota, tant de text enriquit com Markdown, i a la barra d'edició de damunt del teclat en un telèfon. Si escriviu `/dict`, `/voice` o `/transcribe`, el trobeu directament, perquè el filtre cerca als submenús.

S'obre un diàleg, i l'enregistrament comença quan premeu **Inicia**, que també és quan el navegador demana el micròfon la primera vegada. Una barra de nivell mostra que el micròfon realment capta so, i el comptador mostra el temps transcorregut respecte a la durada màxima definida per l'administrador, per exemple `1:12 / 10:00`.

Quan la transcripció està disponible, hi ha un menú **Llengua parlada** sota el comptador. Comença amb la llengua definida a la configuració, marcada com a predeterminada, i si la canvieu, només s'aplica a aquest enregistrament. **Detecta automàticament** deixa que el servidor determini la llengua fins i tot quan la configuració en defineix una.

Què es fa amb l'enregistrament es tria quan l'atureu. **Insereix l'àudio** el posa a la nota com a reproductor d'àudio, sense transcripció. **Transcriu** l'envia al servidor, i només es mostra quan teniu la transcripció disponible. Quan l'enregistrament arriba a la durada màxima, s'atura sol i espera un dels dos botons.

La transcripció torna en un quadre de text on la podeu corregir abans que entri a la nota. **Insereix** la posa on era el cursor. Si la transcripció falla, tornen a aparèixer els dos botons, de manera que l'enregistrament encara es pot inserir com a àudio o es pot tornar a enviar.

La casella **Adjunta també l'enregistrament a aquesta nota** està desmarcada per defecte, i aleshores l'àudio es descarta quan torna el text. Si la marqueu, l'enregistrament també es desa com a fitxer adjunt normal amb el nom `dictation-<date>.<ext>`, de manera que el podeu tornar a escoltar o transcriure més endavant amb un model millor.

**Cancel·la**, Esc o un clic fora del diàleg aturen el micròfon i descarten l'enregistrament, fins i tot a mitges.

### Transcripció d'un fitxer d'àudio adjunt

A la pàgina **Fitxers adjunts** d'una nota, cada fitxer d'àudio té un botó gris amb un micròfon, entre baixar i suprimir. És el que cal fer servir per a una nota de veu enregistrada al telèfon i pujada a Poznote.

Us torna a la nota i obre el mateix diàleg: el fitxer es transcriu des de l'emmagatzematge, sense tornar-lo a pujar, i el text s'ofereix per revisar-lo. **Insereix** el posa just després del fitxer adjunt quan la nota hi fa referència, i al final de la nota en els altres casos.

Un fitxer es considera àudio quan el nom acaba en `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac` o `aac`, o quan el tipus registrat és `audio/...`. L'extensió té prioritat sobre el tipus expressament: el Windows puja un `.m4a` de l'aplicació Enregistradora de veu com a `video/mp4`. Els fitxers de vídeo (`mp4`, `webm`) no s'ofereixen, encara que continguin so.

Si la nota està oberta i s'està editant en un altre lloc, el text no s'insereix: es queda al quadre perquè el pugueu copiar.

## Paràmetres

Tot és a **Paràmetres → Eines d'administració → Transcripció** (només administradors).

| Paràmetre | Què fa |
|---|---|
| **Activa la transcripció** | Commutador principal de la configuració de la instància de més avall. |
| **Usuaris permesos** | Perfils que poden fer servir el servidor de la instància. Ningú no hi té accés fins que no es marca, perfils nous inclosos. |
| **Servidor de transcripció** | Configuracions predefinides que omplen l'URL i mostren o amaguen la clau de l'API: Speaches, whisper.cpp, LocalAI, OpenAI o Un altre. |
| **URL del servidor** | URL base del servidor, per exemple `http://speaches:8000`. També s'accepten `/v1` i el camí complet `/v1/audio/transcriptions`. |
| **Clau de l'API** | S'envia com a `Authorization: Bearer`. Els servidors locals normalment no en necessiten; OpenAI sí. |
| **Comprova l'accés i llista els models** | Confirma que el servidor respon i omple els suggeriments de models. |
| **Model** | El nom del model que s'envia amb cada sol·licitud. És obligatori per a tots els servidors, fins i tot per als que l'ignoren. |
| **Llengua parlada** | Codi de dues lletres com ara `en`, `fr` o `de`, o buit perquè el servidor la detecti. El diàleg d'enregistrament la preselecciona, i el seu menú la pot substituir per a un enregistrament. |
| **Durada màxima de l'enregistrament** | En minuts, d'1 a 60, 10 per defecte. **Enregistra àudio** s'atura sol quan hi arriba i, després, espera **Insereix l'àudio** o **Transcriu**. Sense transcripció, insereix l'àudio immediatament. Els fitxers adjunts no s'hi veuen afectats. |
| **Permet servidors de transcripció personals** | Permet que cada usuari defineixi el seu propi servidor; vegeu [Servidors personals](#servidors-personals). |

### Tria d'un model

El camp del model és text lliure amb suggeriments en lloc d'una llista desplegable, perquè no tots els servidors llisten els seus models (whisper.cpp no ho fa). A Speaches, la comprovació només llista els models de reconeixement de veu i deixa fora qualsevol veu de text a veu que hàgiu baixat.

Els models més grans són més precisos i més lents. En CPU, `small` és el compromís habitual. La diferència no és subtil: amb la mateixa frase en francès, `Systran/faster-whisper-tiny` va retornar "ceci est en test de dicter vocale d'opposnade" i `Systran/faster-whisper-small` va retornar "ceci est un test de dictée vocale". Els models més grans, com `large-v3`, gestionen encara millor els accents i el soroll, però necessiten una GPU per anar amb comoditat.

Per fer-se'n una idea, en una CPU de 4 nuclis amb `small`: una frase curta triga uns 6 segons, i la primera sol·licitud després d'iniciar el servidor en triga uns 20, mentre el model es carrega a la memòria. Speaches fa servir aproximadament 1,5 GB de RAM amb `small` carregat.

### Llengua parlada

Deixeu **Llengua parlada** buida i el servidor detectarà la llengua, cosa que Whisper fa bé. Definiu-ne un codi quan sempre dicteu en la mateixa llengua i les frases curtes es confonen amb una altra.

## Execució d'un servidor de transcripció

Poznote necessita un servidor que accepti `POST /v1/audio/transcriptions` com a dades de formulari multipart amb els camps `file`, `model`, `response_format=json` i, opcionalment, `language`, i que respongui `{"text": "..."}`.

### Speaches (recomanat)

L'opció més completa: llista els seus models, en pot tenir diversos i llegeix WebM (el que enregistren el Chrome i el Firefox), M4A i WAV sense configuració addicional. L'[inici ràpid](#inici-ràpid) el configura amb Docker Compose.

Gestió dels models, des del contenidor de Poznote:

```bash
# Browse what can be downloaded
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# Download, list, delete
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Per baixar models cal accés a Internet des del contenidor de Speaches. Per transcriure, no.

Amb una GPU NVIDIA, feu servir la imatge CUDA en lloc de `latest-cpu` i doneu accés a la GPU al servei; consulteu la [documentació de Speaches](https://speaches.ai).

### whisper.cpp

Més lleuger que Speaches, amb un model per servidor i sense llista de models. Funciona bé amb Poznote, però només amb els indicadors correctes: per defecte no fa servir la ruta d'OpenAI, ni cap llengua que no sigui l'anglès, ni cap format que no sigui WAV.

**1. Afegiu el servei** al `docker-compose.yml`:

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
> Mantingueu `command` com una llista d'un sol element, exactament com a dalt. La imatge executa l'ordre a través de `bash -c`, i la forma de cadena simple es divideix en arguments separats, de manera que `bash` executa `whisper-server` sense cap indicador. Aleshores s'inicia silenciosament amb els valors per defecte: només anglès, només WAV, escoltant a `127.0.0.1` dins del seu contenidor, a `/inference`. Res als registres no indica que alguna cosa hagi anat malament.

**2. Baixeu un model multilingüe** al volum abans d'iniciar el servei: el servidor no s'inicia sense el fitxer del model, i la imatge només inclou `ggml-base.en.bin`, que entén l'anglès i res més.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. Inicieu-lo:**

```bash
docker compose up -d whisper
```

Per a què serveix cada indicador:

| Indicador | Valor per defecte | Per què el necessita Poznote |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | El model inclòs només és en anglès. |
| `-l auto` | `en` | Sense aquest indicador, la parla en qualsevol altra llengua torna transformada en un anglès incomprensible. |
| `--convert` | desactivat | Els navegadors enregistren WebM i els telèfons produeixen M4A; sense aquest indicador només s'accepta WAV. Fa servir l'ffmpeg inclòs a la imatge. |
| `--host 0.0.0.0` | `127.0.0.1` | Si no, res de fora del contenidor no hi pot accedir. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | La ruta que crida Poznote. |

**4. A Poznote**, trieu **whisper.cpp (local)**, definiu l'URL com a `http://whisper:8080` i escriviu qualsevol nom de model: whisper.cpp l'ignora i fa servir el fitxer amb què s'ha iniciat, però el camp és obligatori. Aleshores **Comprova l'accés i llista els models** indica que el servidor no llista cap model, que és la resposta esperada d'un whisper.cpp que funciona.

### OpenAI

Trieu **OpenAI**: l'URL es defineix automàticament i cal una clau de l'API. Feu servir un dels models de transcripció d'OpenAI, per exemple `whisper-1`. L'àudio s'envia a OpenAI.

### LocalAI i altres servidors

LocalAI i altres servidors compatibles amb OpenAI funcionen amb les configuracions predefinides **LocalAI** o **Un altre**, sempre que compleixin el format de sol·licitud del començament d'aquesta secció. La seva configuració no es detalla aquí; consulteu-ne la documentació, per exemple la de [LocalAI](https://localai.io).

## Accés al servidor des de Poznote

Poznote crida el servidor de transcripció des del seu propi contenidor, mai des del navegador. Per tant, l'URL ha de ser accessible des de dins del contenidor de Poznote, i `localhost` allà vol dir el mateix contenidor de Poznote.

**Recomanat: la mateixa xarxa de Docker, sense cap port publicat.** Els serveis d'un mateix projecte Compose comparteixen una xarxa i s'hi accedeix pel nom del servei. Així és com el servei `mcp-server` del `docker-compose.yml` estàndard accedeix a `http://webserver:80`, i com Poznote accedeix a `http://speaches:8000` o `http://whisper:8080` més amunt.

> [!CAUTION]
> No afegiu `ports: - "8000:8000"` al servidor de transcripció en una màquina amb una IP pública. Speaches i whisper.cpp no tenen autenticació per defecte, de manera que publicaríeu un servei de transcripció gratuït a tot Internet. Vincular-lo a `127.0.0.1:8000:8000` és segur, però aleshores el contenidor de Poznote no hi pot accedir; la xarxa compartida no necessita cap de les dues coses.

Si el servidor s'executa com a contenidor `docker run` separat, connecteu-lo a la xarxa de Poznote en lloc de publicar un port. Trobeu el nom de la xarxa amb:

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

després inicieu el servidor amb `--network <that-network>` i feu servir el nom del seu contenidor a l'URL.

Per a un servidor en una altra màquina, o a l'amfitrió Docker fora de Docker, feu servir una adreça a la qual pugui accedir el contenidor de Poznote. S'apliquen les mateixes regles que per a l'assistent d'IA; vegeu [Servidors locals i xarxa de Docker](AI-ASSISTANT.ca.md#servidors-locals-i-xarxa-de-docker).

Per comprovar que el servidor respon des d'on és Poznote:

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## Límits

- **Durada de l'enregistrament:** el paràmetre **Durada màxima de l'enregistrament**, 10 minuts per defecte. S'aplica al navegador.
- **Mida de la pujada:** 100 MB per enregistrament o fitxer adjunt enviat per transcriure.
- **Temps de transcripció:** Poznote espera el servidor fins a 570 segons, just per sota dels 600 segons que el seu nginx permet per sol·licitud, perquè una transcripció lenta acabi amb un missatge llegible en lloc d'una pàgina d'error sense explicació.
- **Temps d'espera del servidor intermediari invers:** un servidor intermediari davant de Poznote pot tallar la sol·licitud molt abans. nginx té 60 segons per defecte, i Nginx Proxy Manager, 90. Una transcripció que trigui més falla aleshores amb `HTTP 504`, tot i que s'hauria completat. Augmenteu el temps d'espera de lectura del servidor intermediari per a l'amfitrió de Poznote (per a nginx i la pestanya **Advanced** de Nginx Proxy Manager: `proxy_read_timeout 600s;`) o feu enregistraments prou curts perquè es transcriguin dins d'aquest temps.

## Requisits del navegador

**HTTPS.** Els navegadors només donen el micròfon a una pàgina amb un origen segur: HTTPS o `localhost`. Amb `http` simple a qualsevol altra adreça, **Enregistra àudio** indica que necessita HTTPS i no enregistra res. La transcripció d'un fitxer adjunt no s'hi veu afectada, perquè no s'enregistra res.

**La capçalera `Permissions-Policy`.** Poznote envia `microphone=(self)`, que permet el seu propi origen i rebutja tots els altres. Si un servidor intermediari invers hi afegeix la seva pròpia capçalera `Permissions-Policy`, pot substituir la de Poznote, i un `microphone=()` fa que el navegador rebutgi el micròfon digui el que digui el permís del lloc. Aleshores el diàleg mostra "Poznote no té permís per fer servir el micròfon". Elimineu la capçalera al servidor intermediari, o definiu-hi també `microphone=(self)`.

## Servidors personals

L'administrador pot marcar **Permet servidors de transcripció personals**. Aleshores cada usuari té una targeta **El meu servidor de transcripció** als seus paràmetres, amb els mateixos camps de servidor, URL, clau, model i llengua. Quan un usuari l'activa, el seu àudio va al seu servidor en lloc del de la instància, tant si és a la llista d'usuaris permesos com si no.

La durada màxima de l'enregistrament continua sent un paràmetre de l'administrador.

Les claus de l'API personals s'emmagatzemen xifrades amb el secret de la instància, com les claus de l'assistent d'IA i de la sincronització amb Git.

## Privadesa i què s'emmagatzema

L'enregistrament es puja a Poznote i, des d'allà, es reenvia al servidor de transcripció. És deliberat: el servidor de transcripció normalment és en una xarxa a la qual el navegador no pot accedir, i la seva clau de l'API no ha d'arribar mai a una pàgina.

Poznote no en conserva cap còpia. L'àudio viu al fitxer de pujada temporal de PHP mentre dura una sol·licitud, tret que marqueu **Adjunta també l'enregistrament a aquesta nota**, que el desa com a fitxer adjunt normal que compta per al vostre emmagatzematge.

Amb Speaches o whisper.cpp configurats com s'ha descrit més amunt, tot es processa a la vostra màquina i res no surt a Internet:

- El navegador enregistra amb MediaRecorder, no amb el reconeixement de veu integrat del navegador, que enviaria l'àudio a Google o Apple.
- L'enregistrament només va al vostre servidor de Poznote, i Poznote només el reenvia a l'URL definit a la pàgina de transcripció. No es contacta cap altre amfitrió.
- L'únic accés a Internet és la baixada del model, una vegada, durant la instal·lació. La transcripció funciona amb el contenidor desconnectat d'Internet.
- El text transcrit arriba a la nota com el text que escriviu, i enlloc més.

> [!WARNING]
> La configuració predefinida **OpenAI** és l'excepció: cada enregistrament s'envia als servidors d'OpenAI. És l'única configuració predefinida que ho fa, i l'única amb l'URL fix i amagat. Si la pàgina de transcripció mostra un camp d'URL, l'àudio es queda al servidor d'aquest URL.

## Resolució de problemes

**"Poznote no té permís per fer servir el micròfon", però el navegador diu que està permès**
Alguna cosa el rebutja abans que es consulti el permís. Comproveu la capçalera que arriba al navegador:

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

Ha de dir `microphone=(self)`. Vegeu [Requisits del navegador](#requisits-del-navegador).

**"El micròfon necessita HTTPS"**
Feu servir `http` simple en una adreça que no és `localhost`. Serviu Poznote amb HTTPS.

**No hi ha botó Transcriu en enregistrar**
La transcripció està desactivada, el vostre perfil no és a la llista d'usuaris permesos o la configuració no té URL o model. **Enregistra àudio** sempre hi és, a **Insereix** i **Multimèdia**; `/dict` el troba.

**No hi ha botó de micròfon en un fitxer adjunt**
El fitxer no es reconeix com a àudio (vegeu la llista a [Transcripció d'un fitxer d'àudio adjunt](#transcripció-dun-fitxer-dàudio-adjunt)), o la transcripció no està disponible per al vostre perfil.

**"Failed to connect to ..."**
L'URL és incorrecte, el servidor no s'està executant o no és en una xarxa a la qual Poznote pugui accedir. Vegeu [Accés al servidor des de Poznote](#accés-al-servidor-des-de-poznote).

**"HTTP 404: Model '...' is not installed locally"**
Speaches no ha baixat aquest model. Baixeu-lo; vegeu el pas 3 de l'[inici ràpid](#inici-ràpid).

**"HTTP 404" en comprovar l'accés, amb whisper.cpp**
Trieu la configuració predefinida **whisper.cpp** en lloc d'**Un altre**: whisper.cpp no té llista de models, i només la seva configuració predefinida interpreta aquest 404 com un servidor que funciona. Si les transcripcions mateixes retornen 404, el servidor s'executa sense `--inference-path /v1/audio/transcriptions`, cosa que normalment vol dir que `command` s'ha escrit com una cadena; vegeu l'avís de [whisper.cpp](#whispercpp).

**La parla en francès (o en qualsevol llengua que no sigui l'anglès) torna en anglès, o sense sentit**
whisper.cpp s'executa sense `-l auto`, o amb el model inclòs `ggml-base.en.bin`. Feu servir un model multilingüe i `-l auto`.

**Els enregistraments fallen però els fitxers WAV funcionen, amb whisper.cpp**
Falta `--convert`.

**"HTTP 504" amb els enregistraments més llargs**
Un servidor intermediari invers ha tallat la sol·licitud abans que acabés la transcripció. Vegeu el temps d'espera del servidor intermediari invers a [Límits](#límits).

**"El servidor de transcripció no ha respost en 570 segons"**
L'enregistrament és massa llarg per a aquest model amb aquest maquinari. Enregistreu menys cada vegada, reduïu la **Durada màxima de l'enregistrament** o feu servir un model més petit o una GPU.

**"El servidor no ha sentit res en aquest enregistrament"**
Whisper ha retornat un text buit, la seva resposta honesta al silenci. Observeu la barra de nivell mentre enregistreu: si no es mou mai, el navegador fa servir un dispositiu d'entrada incorrecte.

**"Ara mateix aquesta nota no es pot editar des d'aquí"**
La nota s'està editant en un altre lloc, de manera que el text no s'ha inserit. Copieu-lo del quadre, o tanqueu l'altre editor i torneu-ho a provar.

**La primera transcripció és lenta, les següents són ràpides**
El servidor carrega el model a la memòria la primera vegada que el fa servir, uns 20 segons per a `small` en CPU.

## Eliminació

Desactiveu **Activa la transcripció** als paràmetres, elimineu el servei del `docker-compose.yml` i executeu:

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` mostra el nom exacte del volum, precedit del nom del vostre projecte.
