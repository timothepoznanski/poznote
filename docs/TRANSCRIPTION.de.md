<!-- lang-selector -->
<p align="center">
  <a href="TRANSCRIPTION.md">English</a> ·
  <a href="TRANSCRIPTION.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="TRANSCRIPTION.es.md">Español</a> ·
  <a href="TRANSCRIPTION.pt.md">Português</a> ·
  <a href="TRANSCRIPTION.ru.md">Русский</a> ·
  <a href="TRANSCRIPTION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote-Transkription (Sprache zu Text)

Diktieren Sie in eine Notiz oder wandeln Sie einen Audioanhang in Text um, mit einem Speech-to-Text-Server, den Sie selbst betreiben.

Poznote enthält kein eigenes Sprachmodell. Es sendet das Audio an einen Server, der die OpenAI-Audio-API `POST /v1/audio/transcriptions` bereitstellt, etwa ein selbst gehostetes Whisper. Betreiben Sie diesen Server neben Poznote, dann verlässt das Audio Ihren Rechner nie.

> [!TIP]
> Diese Funktion ist unabhängig vom [KI-Assistenten](AI-ASSISTANT.de.md). Beide werden getrennt konfiguriert und können unterschiedliche Server verwenden, oder Sie aktivieren nur eine der beiden.

- [Schnellstart](#schnellstart)
- [Was die Funktion leistet](#was-die-funktion-leistet)
- [Einstellungen](#einstellungen)
- [Einen Transkriptionsserver betreiben](#einen-transkriptionsserver-betreiben)
- [Den Server von Poznote aus erreichen](#den-server-von-poznote-aus-erreichen)
- [Grenzen](#grenzen)
- [Browseranforderungen](#browseranforderungen)
- [Persönliche Server](#persönliche-server)
- [Datenschutz und gespeicherte Daten](#datenschutz-und-gespeicherte-daten)
- [Fehlerbehebung](#fehlerbehebung)
- [Entfernen](#entfernen)

## Schnellstart

Der kürzeste Weg, mit [Speaches](https://github.com/speaches-ai/speaches) im selben Docker-Compose-Projekt wie Poznote. Jeder der folgenden Befehle wurde genau so ausgeführt, wie er hier steht.

**1. Fügen Sie den Server zu Ihrer `docker-compose.yml` hinzu**, als neuen Dienst neben `webserver`, und deklarieren Sie sein Volume am Ende der Datei:

```yaml
services:
  # ... webserver und mcp-server bleiben unverändert ...

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cpu
    restart: always
    volumes:
      - "speaches-cache:/home/ubuntu/.cache/huggingface"

volumes:
  speaches-cache:
```

Ein Abschnitt `ports:` fehlt mit Absicht: Poznote erreicht den Server über das interne Netzwerk des Projekts, und nach außen wird nichts freigegeben. Siehe [warum das wichtig ist](#den-server-von-poznote-aus-erreichen).

**2. Starten Sie ihn:**

```bash
docker compose up -d speaches
```

Das Image ist etwa 2 GB groß.

**3. Laden Sie ein Modell herunter.** Speaches startet ganz ohne Modell und lädt auch keines von selbst: Eine Transkription mit einem Modell, das nicht heruntergeladen wurde, schlägt mit `Model '...' is not installed locally` fehl. Laden Sie eines über den Poznote-Container herunter, der sich im selben Netzwerk befindet:

```bash
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Nach einigen Sekunden kommt die Antwort `Model 'Systran/faster-whisper-small' downloaded` (etwa 480 MB). Das Modell bleibt über Neustarts hinweg im Volume `speaches-cache` erhalten.

**4. Konfigurieren Sie Poznote.** Öffnen Sie **Einstellungen → Admin-Werkzeuge → Transkription** und:

- schalten Sie **Transkription aktivieren** ein;
- wählen Sie **Speaches (local)** und setzen Sie die URL auf `http://speaches:8000`;
- klicken Sie auf **Zugang prüfen und Modelle auflisten** und wählen Sie dann `Systran/faster-whisper-small` unter **Modell**;
- haken Sie die Benutzer an, die die Funktion verwenden dürfen, sich selbst eingeschlossen;
- speichern Sie.

**5. Probieren Sie es aus.** Laden Sie eine Notiz über HTTPS neu (oder über `localhost`, siehe [Browseranforderungen](#browseranforderungen)), tippen Sie `/dict`, erlauben Sie den Mikrofonzugriff, sprechen Sie und stoppen Sie die Aufnahme.

## Was die Funktion leistet

Nach der Konfiguration erscheint die Transkription an zwei Stellen.

### Diktieren

Das Diktieren läuft über **Audio aufnehmen**, unter **Einfügen** und **Medien** im Slash-Menü jeder Notiz, bei Rich-Text- wie bei Markdown-Notizen, und auf dem Smartphone in der Bearbeitungsleiste über der Tastatur. Mit `/dict`, `/voice` oder `/transcribe` finden Sie den Eintrag direkt, da der Filter auch Untermenüs durchsucht.

Ein Dialog öffnet sich, und die Aufnahme beginnt, wenn Sie auf **Starten** drücken; dann fragt der Browser beim ersten Mal auch nach dem Mikrofon. Ein Pegelbalken zeigt, dass das Mikrofon tatsächlich etwas aufnimmt, und der Timer zeigt die verstrichene Zeit im Verhältnis zur vom Administrator festgelegten Höchstdauer, zum Beispiel `1:12 / 10:00`.

Wenn die Transkription verfügbar ist, steht unter dem Timer ein Menü **Gesprochene Sprache**. Es steht zunächst auf der in der Konfiguration festgelegten Sprache, die als Standard markiert ist, und eine Änderung gilt nur für diese Aufnahme. **Automatisch erkennen** lässt den Server die Sprache bestimmen, auch wenn die Konfiguration eine festlegt.

Was mit der Aufnahme geschieht, entscheiden Sie beim Stoppen. **Audio einfügen** fügt sie als Audioplayer in die Notiz ein, ohne Transkription. **Transkribieren** sendet sie an den Server und erscheint nur, wenn die Transkription für Sie verfügbar ist. Erreicht die Aufnahme die Höchstdauer, stoppt sie von selbst und wartet auf eine der beiden Schaltflächen.

Das Transkript erscheint in einem Textfeld, in dem Sie es korrigieren können, bevor es in die Notiz übernommen wird. **Einfügen** setzt es an der Stelle ein, an der Ihr Cursor war. Schlägt die Transkription fehl, erscheinen beide Schaltflächen wieder, sodass die Aufnahme weiterhin als Audio eingefügt oder erneut gesendet werden kann.

Das Kontrollkästchen **Aufnahme zusätzlich an diese Notiz anhängen** ist standardmäßig nicht aktiviert, und das Audio wird dann verworfen, sobald der Text zurückkommt. Aktivieren Sie es, wird die Aufnahme zusätzlich als gewöhnlicher Anhang mit dem Namen `dictation-<date>.<ext>` gespeichert, sodass Sie sie erneut anhören oder später mit einem besseren Modell transkribieren können.

**Abbrechen**, Escape oder ein Klick außerhalb des Dialogs schaltet das Mikrofon ab und verwirft die Aufnahme, auch mitten in der Aufnahme.

### Einen Audioanhang transkribieren

Auf der Seite **Anhänge** einer Notiz erhält jede Audiodatei eine graue Mikrofon-Schaltfläche zwischen Herunterladen und Löschen. Sie ist für ein Sprachmemo gedacht, das Sie auf dem Smartphone aufgenommen und in Poznote hochgeladen haben.

Sie führt Sie zurück zur Notiz und öffnet denselben Dialog: Die Datei wird direkt aus dem Speicher transkribiert, ohne erneut hochgeladen zu werden, und der Text wird Ihnen zur Überprüfung angezeigt. **Einfügen** setzt ihn direkt hinter den Anhang, wenn die Notiz auf ihn verweist, andernfalls ans Ende der Notiz.

Eine Datei gilt als Audio, wenn ihr Name auf `mp3`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `flac` oder `aac` endet oder wenn ihr gespeicherter Typ `audio/...` ist. Die Endung hat bewusst Vorrang vor dem Typ: Windows lädt eine `.m4a` aus der Sprachrekorder-App als `video/mp4` hoch. Videodateien (`mp4`, `webm`) werden nicht angeboten, auch wenn sie Ton enthalten.

Wird die Notiz gerade an anderer Stelle geöffnet und bearbeitet, wird der Text nicht eingefügt: Er bleibt im Textfeld, damit Sie ihn kopieren können.

## Einstellungen

Alles befindet sich unter **Einstellungen → Admin-Werkzeuge → Transkription** (nur für Administratoren).

| Einstellung | Funktion |
|---|---|
| **Transkription aktivieren** | Hauptschalter für die unten stehende Instanzkonfiguration. |
| **Zugelassene Benutzer** | Profile, die den Server der Instanz verwenden dürfen. Niemand hat Zugriff, solange er nicht angehakt ist, auch neue Profile nicht. |
| **Transkriptionsserver** | Voreinstellungen, die die URL ausfüllen und das Feld für den API-Schlüssel ein- oder ausblenden: Speaches, whisper.cpp, LocalAI, OpenAI oder Anderer (eigene URL). |
| **Server-URL** | Basis-URL des Servers, zum Beispiel `http://speaches:8000`. `/v1` und der vollständige Pfad `/v1/audio/transcriptions` werden ebenfalls akzeptiert. |
| **API-Schlüssel** | Wird als `Authorization: Bearer` gesendet. Lokale Server benötigen meist keinen, OpenAI schon. |
| **Zugang prüfen und Modelle auflisten** | Prüft, ob der Server antwortet, und füllt die Modellvorschläge. |
| **Modell** | Der Modellname, der mit jeder Anfrage gesendet wird. Für jeden Server erforderlich, auch für die, die ihn ignorieren. |
| **Gesprochene Sprache** | Zweibuchstabiger Code wie `en`, `fr` oder `de`, oder leer, damit der Server die Sprache erkennt. Der Aufnahmedialog wählt sie vor, und sein Menü kann sie für eine einzelne Aufnahme überschreiben. |
| **Maximale Aufnahmedauer** | In Minuten, von 1 bis 60, standardmäßig 10. **Audio aufnehmen** stoppt beim Erreichen dieser Dauer von selbst und wartet dann auf **Audio einfügen** oder **Transkribieren**. Ohne Transkription wird das Audio sofort eingefügt. Anhänge sind davon nicht betroffen. |
| **Persönliche Transkriptionsserver erlauben** | Erlaubt jedem Benutzer, einen eigenen Server festzulegen, siehe [Persönliche Server](#persönliche-server). |

### Ein Modell auswählen

Das Modellfeld ist ein Freitextfeld mit Vorschlägen statt einer Auswahlliste, weil nicht jeder Server seine Modelle auflistet (whisper.cpp tut es nicht). Bei Speaches listet die Prüfung nur Spracherkennungsmodelle auf und lässt eventuell heruntergeladene Text-to-Speech-Stimmen weg.

Größere Modelle sind genauer und langsamer. Auf der CPU ist `small` der übliche Kompromiss. Der Unterschied ist deutlich: Beim selben französischen Satz lieferte `Systran/faster-whisper-tiny` „ceci est en test de dicter vocale d'opposnade“, während `Systran/faster-whisper-small` „ceci est un test de dictée vocale“ lieferte. Größere Modelle wie `large-v3` kommen noch besser mit Akzenten und Störgeräuschen zurecht, brauchen aber eine GPU, um flüssig zu laufen.

Zur Einordnung, auf einer CPU mit 4 Kernen und `small`: Ein kurzer Satz dauert etwa 6 Sekunden, und die erste Anfrage nach dem Serverstart etwa 20, während das Modell in den Speicher geladen wird. Speaches belegt mit geladenem `small` etwa 1,5 GB RAM.

### Gesprochene Sprache

Lassen Sie **Gesprochene Sprache** leer, erkennt der Server die Sprache selbst, und das kann Whisper gut. Setzen Sie einen Code, wenn Sie immer in derselben Sprache diktieren und kurze Sätze für eine andere Sprache gehalten werden.

## Einen Transkriptionsserver betreiben

Poznote benötigt einen Server, der `POST /v1/audio/transcriptions` als Multipart-Formulardaten mit den Feldern `file`, `model`, `response_format=json` und optional `language` annimmt und mit `{"text": "..."}` antwortet.

### Speaches (empfohlen)

Die vollständigste Option: Speaches listet seine Modelle auf, kann mehrere vorhalten und liest WebM (das Format, in dem Chrome und Firefox aufnehmen), M4A und WAV ohne zusätzliche Konfiguration. Der [Schnellstart](#schnellstart) richtet es mit Docker Compose ein.

Modelle verwalten, aus dem Poznote-Container heraus:

```bash
# Durchsuchen, was heruntergeladen werden kann
docker compose exec webserver curl "http://speaches:8000/v1/registry?task=automatic-speech-recognition"

# Herunterladen, auflisten, löschen
docker compose exec webserver curl -X POST http://speaches:8000/v1/models/Systran/faster-whisper-small
docker compose exec webserver curl http://speaches:8000/v1/models
docker compose exec webserver curl -X DELETE http://speaches:8000/v1/models/Systran/faster-whisper-small
```

Zum Herunterladen braucht der Speaches-Container Internetzugang. Zum Transkribieren nicht.

Mit einer NVIDIA-GPU verwenden Sie statt `latest-cpu` das CUDA-Image und geben dem Dienst Zugriff auf die GPU, siehe die [Speaches-Dokumentation](https://speaches.ai).

### whisper.cpp

Leichter als Speaches, mit einem Modell pro Server und ohne Modellliste. Es funktioniert gut mit Poznote, aber nur mit den richtigen Flags: Mit den Standardeinstellungen spricht es weder die OpenAI-Route noch eine andere Sprache als Englisch noch ein anderes Format als WAV.

**1. Fügen Sie den Dienst** zur `docker-compose.yml` hinzu:

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
> Behalten Sie `command` als Liste mit einem einzigen Element bei, genau wie oben. Das Image führt seinen Befehl über `bash -c` aus, und die einfache String-Form wird in einzelne Argumente aufgeteilt, sodass `bash` den `whisper-server` ganz ohne Flags startet. Er läuft dann stillschweigend mit seinen Standardwerten: nur Englisch, nur WAV, lauscht auf `127.0.0.1` innerhalb seines Containers, auf `/inference`. Nichts in den Logs weist darauf hin, dass etwas schiefgelaufen ist.

**2. Laden Sie ein mehrsprachiges Modell** in das Volume herunter, bevor Sie den Dienst starten: Der Server startet ohne seine Modelldatei nicht, und das Image enthält nur `ggml-base.en.bin`, das ausschließlich Englisch versteht.

```bash
docker compose run --rm --entrypoint bash whisper -c "cd /app && ./models/download-ggml-model.sh small /models"
```

**3. Starten Sie ihn:**

```bash
docker compose up -d whisper
```

Wozu jedes Flag dient:

| Flag | Standardwert | Warum Poznote es braucht |
|---|---|---|
| `-m /models/ggml-small.bin` | `models/ggml-base.en.bin` | Das mitgelieferte Modell versteht nur Englisch. |
| `-l auto` | `en` | Ohne dieses Flag kommt Sprache in jeder anderen Sprache als verstümmeltes Englisch zurück. |
| `--convert` | aus | Browser nehmen in WebM auf, Smartphones erzeugen M4A; ohne dieses Flag wird nur WAV akzeptiert. Verwendet das im Image enthaltene ffmpeg. |
| `--host 0.0.0.0` | `127.0.0.1` | Andernfalls ist der Server von außerhalb des Containers nicht erreichbar. |
| `--inference-path /v1/audio/transcriptions` | `/inference` | Die Route, die Poznote aufruft. |

**4. Wählen Sie in Poznote** **whisper.cpp (local)**, setzen Sie die URL auf `http://whisper:8080` und geben Sie einen beliebigen Modellnamen ein: whisper.cpp ignoriert ihn und verwendet die Datei, mit der es gestartet wurde, aber das Feld ist ein Pflichtfeld. **Zugang prüfen und Modelle auflisten** meldet dann, dass der Server kein Modell auflistet, und genau das ist die erwartete Antwort eines funktionierenden whisper.cpp.

### OpenAI

Wählen Sie **OpenAI**: Die URL wird automatisch gesetzt, und ein API-Schlüssel ist erforderlich. Verwenden Sie eines der Transkriptionsmodelle von OpenAI, zum Beispiel `whisper-1`. Das Audio wird an OpenAI gesendet.

### LocalAI und andere Server

LocalAI und andere OpenAI-kompatible Server funktionieren über die Voreinstellungen **LocalAI** oder **Anderer (eigene URL)**, sofern sie das Anfrageformat vom Anfang dieses Abschnitts erfüllen. Ihre Einrichtung wird hier nicht beschrieben, siehe deren eigene Dokumentation, zum Beispiel [die von LocalAI](https://localai.io).

## Den Server von Poznote aus erreichen

Poznote ruft den Transkriptionsserver aus seinem eigenen Container auf, nie aus Ihrem Browser. Die URL muss also aus dem Poznote-Container heraus erreichbar sein, und `localhost` bezeichnet dort den Poznote-Container selbst.

**Empfohlen: dasselbe Docker-Netzwerk, kein veröffentlichter Port.** Die Dienste eines Compose-Projekts teilen sich ein Netzwerk und erreichen einander über den Dienstnamen. So erreicht der Dienst `mcp-server` der mitgelieferten `docker-compose.yml` die Adresse `http://webserver:80`, und so erreicht Poznote oben `http://speaches:8000` oder `http://whisper:8080`.

> [!CAUTION]
> Fügen Sie dem Transkriptionsserver auf einem Rechner mit öffentlicher IP kein `ports: - "8000:8000"` hinzu. Speaches und whisper.cpp haben standardmäßig keine Authentifizierung, damit würden Sie also einen kostenlosen Transkriptionsdienst für das gesamte Internet veröffentlichen. Die Bindung an `127.0.0.1:8000:8000` ist sicher, aber dann kann der Poznote-Container den Server nicht erreichen; das gemeinsame Netzwerk braucht beides nicht.

Läuft der Server als separater Container, der mit `docker run` gestartet wurde, verbinden Sie ihn mit dem Netzwerk von Poznote, statt einen Port zu veröffentlichen. Den Netzwerknamen finden Sie so heraus:

```bash
docker inspect <poznote-webserver-container> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Starten Sie den Server dann mit `--network <that-network>` und verwenden Sie seinen Containernamen in der URL.

Für einen Server auf einem anderen Rechner oder auf dem Docker-Host außerhalb von Docker verwenden Sie eine Adresse, die der Poznote-Container erreichen kann. Es gelten dieselben Regeln wie für den KI-Assistenten, siehe [Lokale Server und Docker-Netzwerk](AI-ASSISTANT.de.md#lokale-server-und-docker-netzwerk).

So prüfen Sie, ob der Server von dort aus antwortet, wo Poznote läuft:

```bash
docker compose exec webserver curl http://speaches:8000/v1/models   # Speaches
docker compose exec webserver curl -s -o /dev/null -w '%{http_code}\n' http://whisper:8080/   # whisper.cpp, expect 200
```

## Grenzen

- **Aufnahmedauer:** die Einstellung **Maximale Aufnahmedauer**, standardmäßig 10 Minuten. Sie wird im Browser durchgesetzt.
- **Upload-Größe:** 100 MB pro Aufnahme oder Anhang, der zur Transkription gesendet wird.
- **Transkriptionsdauer:** Poznote wartet bis zu 570 Sekunden auf den Server, knapp unter den 600 Sekunden, die sein eigenes nginx einer Anfrage gewährt, damit eine langsame Transkription mit einer verständlichen Meldung endet statt mit einer nackten Fehlerseite.
- **Timeout des Reverse Proxys:** Ein Proxy vor Poznote kann die Anfrage deutlich früher abbrechen. nginx verwendet standardmäßig 60 Sekunden, Nginx Proxy Manager 90. Eine Transkription, die länger dauert, schlägt dann mit `HTTP 504` fehl, obwohl sie abgeschlossen worden wäre. Erhöhen Sie entweder das Lese-Timeout des Proxys für Ihren Poznote-Host (für nginx und im Tab **Advanced** von Nginx Proxy Manager: `proxy_read_timeout 600s;`), oder halten Sie Aufnahmen kurz genug, damit sie innerhalb dieser Zeit transkribiert werden.

## Browseranforderungen

**HTTPS.** Browser gewähren einer Seite nur auf einem sicheren Ursprung Zugriff auf das Mikrofon: HTTPS oder `localhost`. Über einfaches `http` an jeder anderen Adresse meldet **Audio aufnehmen**, dass HTTPS erforderlich ist, und nimmt nichts auf. Das Transkribieren eines Anhangs ist davon nicht betroffen, da dabei nichts aufgenommen wird.

**Der Header `Permissions-Policy`.** Poznote sendet `microphone=(self)`, was den eigenen Ursprung erlaubt und alle anderen ablehnt. Fügt ein vorgeschalteter Reverse Proxy einen eigenen `Permissions-Policy`-Header hinzu, kann dieser den von Poznote überschreiben, und ein `microphone=()` darin sorgt dafür, dass der Browser das Mikrofon verweigert, ganz gleich, was die Website-Berechtigung sagt. Der Dialog zeigt dann „Poznote durfte das Mikrofon nicht verwenden“. Entfernen Sie den Header am Proxy oder setzen Sie dort ebenfalls `microphone=(self)`.

## Persönliche Server

Der Administrator kann **Persönliche Transkriptionsserver erlauben** aktivieren. Jeder Benutzer erhält dann in seinen eigenen Einstellungen eine Karte **Mein Transkriptionsserver** mit denselben Feldern für Server, URL, Schlüssel, Modell und Sprache. Aktiviert ein Benutzer sie, geht sein Audio an seinen eigenen Server statt an den der Instanz, unabhängig davon, ob er in der Liste der zugelassenen Benutzer steht.

Die maximale Aufnahmedauer bleibt die Einstellung des Administrators.

Persönliche API-Schlüssel werden im Ruhezustand mit dem Instanzgeheimnis verschlüsselt, wie die Schlüssel für den KI-Assistenten und die Git-Synchronisierung.

## Datenschutz und gespeicherte Daten

Die Aufnahme wird zu Poznote hochgeladen und von dort an den Transkriptionsserver weitergeleitet. Das ist Absicht: Der Transkriptionsserver befindet sich meist in einem Netzwerk, das der Browser nicht erreichen kann, und sein API-Schlüssel hat in einer Webseite nichts zu suchen.

Poznote behält keine Kopie. Das Audio liegt für die Dauer einer einzigen Anfrage in der temporären Upload-Datei von PHP, es sei denn, Sie aktivieren **Aufnahme zusätzlich an diese Notiz anhängen**, wodurch es als gewöhnlicher Anhang gespeichert wird, der auf Ihren Speicherplatz angerechnet wird.

Mit Speaches oder whisper.cpp, wie oben beschrieben eingerichtet, wird alles auf Ihrem Rechner verarbeitet und nichts geht ins Internet:

- Der Browser nimmt mit MediaRecorder auf, nicht mit der eingebauten Spracherkennung des Browsers, die das Audio an Google oder Apple senden würde.
- Die Aufnahme geht nur an Ihren Poznote-Server, und Poznote leitet sie nur an die URL weiter, die auf der Seite Transkription eingestellt ist. Kein anderer Host wird kontaktiert.
- Der einzige Internetzugriff ist der Download des Modells, einmalig, bei der Installation. Die Transkription funktioniert auch, wenn der Container vom Internet getrennt ist.
- Der transkribierte Text landet in Ihrer Notiz wie getippter Text, und nirgendwo sonst.

> [!WARNING]
> Die Voreinstellung **OpenAI** ist die Ausnahme: Jede Aufnahme wird an die Server von OpenAI gesendet. Sie ist die einzige Voreinstellung, die das tut, und die einzige, deren URL fest vorgegeben und ausgeblendet ist. Zeigt die Seite Transkription ein URL-Feld an, bleibt das Audio beim Server unter dieser URL.

## Fehlerbehebung

**„Poznote durfte das Mikrofon nicht verwenden“, obwohl der Browser den Zugriff erlaubt**
Etwas verweigert den Zugriff, bevor die Berechtigung überhaupt geprüft wird. Prüfen Sie den Header, der beim Browser ankommt:

```bash
curl -sI https://your-poznote/login.php | grep -i permissions-policy
```

Er muss `microphone=(self)` lauten. Siehe [Browseranforderungen](#browseranforderungen).

**„Das Mikrofon benötigt HTTPS“**
Sie verwenden einfaches `http` an einer anderen Adresse als `localhost`. Stellen Sie Poznote über HTTPS bereit.

**Keine Schaltfläche Transkribieren bei der Aufnahme**
Die Transkription ist ausgeschaltet, Ihr Profil steht nicht in der Liste der zugelassenen Benutzer, oder in der Konfiguration fehlt die URL oder das Modell. **Audio aufnehmen** selbst ist immer vorhanden, unter **Einfügen** und **Medien**; `/dict` findet den Eintrag.

**Keine Mikrofon-Schaltfläche bei einem Anhang**
Die Datei wird nicht als Audio erkannt (siehe die Liste unter [Einen Audioanhang transkribieren](#einen-audioanhang-transkribieren)), oder die Transkription steht Ihrem Profil nicht zur Verfügung.

**„Failed to connect to ...“**
Die URL ist falsch, der Server läuft nicht, oder er befindet sich nicht in einem Netzwerk, das Poznote erreichen kann. Siehe [Den Server von Poznote aus erreichen](#den-server-von-poznote-aus-erreichen).

**„HTTP 404: Model '...' is not installed locally“**
Speaches hat dieses Modell nicht heruntergeladen. Laden Sie es herunter, siehe Schritt 3 im [Schnellstart](#schnellstart).

**„HTTP 404“ bei der Zugangsprüfung, mit whisper.cpp**
Wählen Sie die Voreinstellung **whisper.cpp** statt **Anderer (eigene URL)**: whisper.cpp hat keine Modellliste, und nur seine Voreinstellung wertet diesen 404 als funktionierenden Server. Liefern die Transkriptionen selbst 404, läuft der Server ohne `--inference-path /v1/audio/transcriptions`, was meist bedeutet, dass `command` als String geschrieben wurde, siehe die Warnung unter [whisper.cpp](#whispercpp).

**Französische (oder andere nicht englische) Sprache kommt als Englisch oder als Unsinn zurück**
whisper.cpp läuft ohne `-l auto` oder mit dem mitgelieferten Modell `ggml-base.en.bin`. Verwenden Sie ein mehrsprachiges Modell und `-l auto`.

**Aufnahmen schlagen fehl, WAV-Dateien funktionieren aber, mit whisper.cpp**
`--convert` fehlt.

**„HTTP 504“ bei längeren Aufnahmen**
Ein Reverse Proxy hat die Anfrage abgebrochen, bevor die Transkription fertig war. Siehe das Timeout des Reverse Proxys unter [Grenzen](#grenzen).

**„Der Transkriptionsserver hat nicht innerhalb von 570 Sekunden geantwortet“**
Die Aufnahme ist für dieses Modell auf dieser Hardware zu lang. Nehmen Sie kürzere Abschnitte auf, verringern Sie die **Maximale Aufnahmedauer**, oder verwenden Sie ein kleineres Modell oder eine GPU.

**„Der Server hat in dieser Aufnahme nichts gehört“**
Whisper hat einen leeren Text zurückgegeben, seine ehrliche Antwort auf Stille. Beobachten Sie während der Aufnahme den Pegelbalken: Bewegt er sich nie, verwendet der Browser das falsche Eingabegerät.

**„Diese Notiz kann von hier aus gerade nicht bearbeitet werden“**
Die Notiz wird an anderer Stelle bearbeitet, daher wurde der Text nicht eingefügt. Kopieren Sie ihn aus dem Textfeld, oder schließen Sie den anderen Editor und versuchen Sie es erneut.

**Die erste Transkription ist langsam, die folgenden sind schnell**
Der Server lädt das Modell bei der ersten Verwendung in den Speicher, bei `small` auf der CPU etwa 20 Sekunden.

## Entfernen

Schalten Sie **Transkription aktivieren** in den Einstellungen aus, entfernen Sie dann den Dienst aus der `docker-compose.yml` und führen Sie aus:

```bash
docker compose rm -sf speaches                 # or: whisper
docker volume rm <project>_speaches-cache      # or: <project>_whisper-models
```

`docker volume ls` zeigt den genauen Volume-Namen, dem Ihr Projektname vorangestellt ist.
