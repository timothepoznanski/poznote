<!-- lang-selector -->
<p align="center">
  <a href="AI-ASSISTANT.md">English</a> ·
  <a href="AI-ASSISTANT.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="AI-ASSISTANT.es.md">Español</a> ·
  <a href="AI-ASSISTANT.pt.md">Português</a> ·
  <a href="AI-ASSISTANT.ru.md">Русский</a> ·
  <a href="AI-ASSISTANT.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote KI-Assistent

Ein integrierter KI-Chat, der Ihre Notizen durchsuchen und lesen kann. Er funktioniert mit einer lokalen [Ollama](https://ollama.com)- oder [LM Studio](https://lmstudio.ai)-Instanz, einem Cloud-Anbieter wie [Anthropic (Claude)](https://www.anthropic.com) oder OpenAI sowie mit jedem OpenAI-kompatiblen Server.

> [!TIP]
> Sie möchten stattdessen einen *externen* KI-Assistenten (VS Code Copilot, Claude CLI...) mit Ihren Notizen verbinden? Lesen Sie die [Dokumentation zum MCP-Server](MCP-SERVER.de.md).

## Funktionsumfang

Nach der Konfiguration erscheint in der linken Icon-Seitenleiste, auf der Notizseite und auf dem Dashboard, eine Schaltfläche **KI-Assistent**, die das Chat-Panel direkt dort öffnet. Das Panel ist rechts angedockt, behält seinen Öffnungszustand und seine Breite von einer Seite zur anderen bei, und die Unterhaltung begleitet Sie zwischen beiden Seiten.

Der Assistent verfügt über Tools, um **Ihre Notizen zu durchsuchen und zu lesen**, und setzt sie selbstständig ein: Fragen Sie „Was steht in meinen Notizen über X?“, lassen Sie sich eine Zusammenfassung über mehrere Notizen erstellen oder lassen Sie ihn die Notiz finden, an die Sie sich nur noch halb erinnern. Die Antworten werden gestreamt und als Markdown dargestellt.

Wenn Sie ausdrücklich darum bitten, kann er auch Ihre Notizen bearbeiten:

- **Schreiben**: eine Notiz erstellen, umbenennen oder ihren Inhalt neu schreiben;
- **Organisieren**: Tags hinzufügen oder entfernen, Ordner auflisten, erstellen und umbenennen, Notizen zwischen Ordnern verschieben, Notizen und Ordner als Favoriten markieren;
- **Termine**: eine Erinnerung für eine Notiz setzen oder entfernen (einmalig oder wiederkehrend); der Assistent kennt das aktuelle Datum und die Uhrzeit in Ihrer Zeitzone, sodass „Erinnere mich nächsten Montag um 9“ funktioniert;
- **Aufgaben**: die Aufgaben einer Aufgabenlisten-Notiz hinzufügen, abhaken, wieder öffnen, umbenennen oder entfernen, einschließlich ihrer Fälligkeitsdaten und Erinnerungen, sowie ein Kontrollkästchen in einer normalen Notiz an- oder abhaken, ohne den Rest der Notiz neu zu schreiben;
- **Löschen**: eine Notiz in den Papierkorb verschieben, oder einen Ordner samt Unterordnern und allen darin enthaltenen Notizen. Alles lässt sich über die Seite **Papierkorb** wiederherstellen: Der Assistent hat keine Möglichkeit, etwas endgültig zu löschen, und kein Tool, um den Papierkorb zu leeren.

Die geöffnete Notiz gehört zum Kontext: Sagen Sie „Verbessere die Formatierung dieser Notiz“ oder „Füge hier ein Fazit hinzu“, und der Assistent bearbeitet sie, ganz ohne ID oder Titel. Er liest die zuletzt vom Editor gespeicherte Version, und „diese Notiz“ wechselt mit, wenn Sie während der Unterhaltung eine andere Notiz öffnen. Nennen Sie in Ihrer Frage eine andere Notiz, hat diese weiterhin Vorrang. Auf dem Dashboard ist keine Notiz geöffnet, nennen Sie dort also die gemeinte Notiz.

Zwei Zeilen über dem Eingabefeld zeigen, womit der Assistent arbeitet: den **Arbeitsbereich**, in dem jedes Tool ausgeführt wird, und die **Notiz**, auf die sich „diese Notiz“ bezieht, sofern eine geöffnet ist.

Wenn der Assistent eine Notiz bearbeitet oder erstellt, aktualisieren sich die geöffnete Notiz und die Seitenleiste von selbst, sobald die Antwort vollständig ist, ohne dass die Seite neu geladen werden muss. Haben Sie in der gerade bearbeiteten Notiz ungespeicherte Änderungen, erscheint stattdessen ein Hinweisbanner: Laden Sie die Notiz neu, oder behalten und speichern Sie Ihre eigene Version.

Der Assistent liest und schreibt Notizinhalte als Markdown. Rich-Text-Notizen (HTML) werden in beide Richtungen spontan konvertiert, mit demselben Konverter wie die Aktion **Notiz konvertieren**, sodass beim Neuschreiben Überschriften, Listen, Links, Tabellen und Bilder erhalten bleiben; umfangreichere Formatierungen wie Farben oder Schriftarten gehen dabei verloren. Eine Notiz, die zu lang ist, um vom Assistenten vollständig gelesen zu werden, wird für das Neuschreiben abgelehnt statt abgeschnitten.

Bevor der Assistent den Inhalt einer Notiz ändert (Neuschreiben, Kontrollkästchen, Aufgabe), erstellt Poznote einen Schnappschuss der aktuellen Version, der im Menü **Schnappschüsse** der Notiz als „Vor KI-Änderung“ gekennzeichnet ist. Entspricht das Ergebnis nicht Ihren Vorstellungen, stellen Sie diesen Schnappschuss wieder her. Der Schnappschuss entfällt, wenn der letzte bereits denselben Inhalt enthält; eine einzelne Antwort, die dieselbe Notiz mehrmals ändert, erzeugt nur einen, und pro Notiz werden die 20 neuesten aufbewahrt, eine Anzahl, die Sie unter **Einstellungen → Schnappschüsse** ändern können (1 bis 200).

Der Assistent ist **auf den aktuellen Arbeitsbereich beschränkt**: Er sieht, durchsucht und bearbeitet nur die Notizen des Arbeitsbereichs, in dem Sie den Chat geöffnet haben, und neue Notizen werden dort erstellt. Um Fragen zu einem anderen Arbeitsbereich zu stellen, wechseln Sie zuerst dorthin. Auf einem Dashboard, das mehrere Arbeitsbereiche anzeigt, gibt der erste Klick auf die Schaltfläche an, in welchem Arbeitsbereich der Assistent arbeiten wird, und fragt, ob Sie fortfahren möchten.

Die Unterhaltung bleibt erhalten, solange Ihr Browser-Tab geöffnet ist (auch über ein Neuladen der Seite hinweg), und kann jederzeit mit der Papierkorb-Schaltfläche in der Kopfzeile des Panels gelöscht werden.

## Assistenten aktivieren

Öffnen Sie **Einstellungen → Admin-Werkzeuge → KI-Assistent** (nur für Administratoren) und wählen Sie einen Anbieter:

| Anbieter | URL | API-Schlüssel |
|---|---|---|
| **Ollama** (lokal) | Hängt davon ab, wo Ollama läuft (Container oder Host), siehe [Lokale Server und Docker-Netzwerk](#lokale-server-und-docker-netzwerk) | Nicht erforderlich |
| **LM Studio** (lokal) | Vorausgefüllt mit der Adresse Ihres Docker-Hosts, Port `1234`, siehe [Option 2](#option-2-ollama-auf-dem-host-installiert) | Nicht erforderlich |
| **Anthropic** (Cloud) | Wird automatisch gesetzt | Erforderlich |
| **OpenAI** (Cloud) | Wird automatisch gesetzt | Erforderlich |
| **Anderer (eigene URL)** | Jede OpenAI-kompatible Basis-URL | Hängt vom Server ab |

Verwenden Sie anschließend **Zugang prüfen und Modelle auflisten**: Damit wird geprüft, ob der Server erreichbar ist, und die Auswahlliste **Modell** mit den dort angebotenen Modellen gefüllt. Die Liste bleibt leer, bis diese Prüfung erfolgreich war; erst dieser Schritt ermöglicht also die Wahl eines Modells.

Die Konfiguration gilt für die gesamte Instanz: Sobald der Administrator den Assistenten aktiviert hat, erhält jedes Benutzerprofil den Chat.

### Persönliche API-Schlüssel

Dieselbe Seite bietet die Option **Persönliche API-Schlüssel erlauben**. Ist sie aktiviert, erhält jeder Benutzer in seinen eigenen Einstellungen eine Karte **Mein KI-Assistent**, um den Chat statt auf die für die Instanz konfigurierten Werte auf seinen eigenen Server, Anbieter und API-Schlüssel zu richten.

## Modell auswählen

Wählen Sie ein Modell, das **Tool Calling** unterstützt (auch „Function Calling“ genannt), z. B. `qwen3`, `llama3.1` oder `mistral`. Tool Calling ermöglicht es dem Assistenten, Ihre Notizen zu durchsuchen: Mit einem Modell ohne diese Fähigkeit funktioniert der Chat zwar weiterhin (ein Hinweis weist Sie darauf hin), kann aber nicht selbstständig auf Ihre Notizen zugreifen.

### Denkaufwand

Reasoning-Modelle (OpenAI GPT-5 und die o-Serie, `gpt-oss` unter Ollama, ...) akzeptieren einen **Denkaufwand**, der festlegt, wie lange das Modell vor der Antwort nachdenkt. Das Feld **Denkaufwand** auf der Einstellungsseite steuert ihn: **Auto** (die Voreinstellung) sendet nichts und überlässt die Wahl dem Anbieter, während **Keiner**, **Minimal**, **Niedrig**, **Mittel**, **Hoch** und **Sehr hoch** als Parameter `reasoning_effort` bei jeder Anfrage mitgesendet werden. Werte, die ein Modell nicht akzeptiert, werden vom Anbieter abgelehnt und im Chat als Fehler gemeldet.

Manche OpenAI-Modelle verweigern Tool Calling über die Chat-Completions-API, solange der Denkaufwand nicht `none` ist. Der Chat zeigt dann einen Hinweis an, dass der Assistent Ihre Notizen nicht durchsuchen kann: Setzen Sie **Denkaufwand** auf **Keiner**, um die Tools wieder verfügbar zu machen.

## Lokale Server und Docker-Netzwerk

Der KI-Server wird **vom Poznote-Server aus** aufgerufen, niemals von Ihrem Browser. Da Poznote in einem Docker-Container läuft, muss die konfigurierte URL *aus diesem Container heraus* erreichbar sein.

Für ein lokales Ollama gibt es **zwei mögliche Setups**, die beide vollständig unterstützt werden:

| Setup | Zu konfigurierende URL | Netzwerkkonfiguration |
|---|---|---|
| [**Option 1**: Ollama als Docker-Container](#option-1-ollama-als-docker-container-am-einfachsten) | `http://ollama:11434` | Keine |
| [**Option 2**: Ollama auf dem Host installiert](#option-2-ollama-auf-dem-host-installiert) | Die Adresse Ihres Hosts, aus Sicht des Containers | Erforderlich, genau hier stolpern viele |

Wählen Sie Option 1, wenn Sie bei null anfangen. Wählen Sie Option 2, wenn Ollama bereits auf Ihrem Rechner installiert ist oder auch von anderen Anwendungen genutzt wird.

### Option 1: Ollama als Docker-Container (am einfachsten)

Das mit Abstand einfachste Setup bezieht den Host gar nicht erst ein: Fügen Sie Ollama als weiteren Dienst in dieselbe `docker-compose.yml` wie Poznote ein:

```yaml
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: always
    volumes:
      - "./ollama:/root/.ollama"
```

Starten Sie ihn dann und laden Sie ein Modell herunter:

```bash
docker compose up -d
docker exec ollama ollama pull qwen3
```

Ersetzen Sie in den Einstellungen des KI-Assistenten die vorausgefüllte URL durch `http://ollama:11434`. Dienste in derselben Compose-Datei teilen sich ein Docker-Netzwerk und erreichen einander über den Dienstnamen, es gibt also nichts weiter zu konfigurieren: kein Port muss veröffentlicht, kein `OLLAMA_HOST` gesetzt werden, und Ollama wird nie außerhalb des Docker-Netzwerks erreichbar. Definiert Ihre Compose-Datei eigene `networks`, hängen Sie `ollama` in dasselbe Netzwerk wie den Poznote-Dienst.

Informationen zur GPU-Beschleunigung im Container finden Sie in der [Dokumentation des Ollama-Docker-Images](https://hub.docker.com/r/ollama/ollama).

### Option 2: Ollama auf dem Host installiert

Läuft Ollama direkt auf dem Host-Rechner (Standardinstallation von [ollama.com](https://ollama.com)) oder verwenden Sie LM Studio, kann Poznote es ebenfalls erreichen, allerdings muss der Container über das Docker-Netzwerk den Weg zurück zum Host finden. Die folgenden Unterabschnitte erklären, wie das geht.

#### Warum `localhost` nicht funktioniert

`http://localhost:11434` oder `http://127.0.0.1:11434` funktionieren **nicht**: Innerhalb des Containers ist `localhost` der Container selbst, nicht der Rechner, auf dem Ollama läuft. Docker gibt jedem Container einen eigenen, isolierten Netzwerk-Stack: dieselbe physische Maschine, zwei verschiedene „localhost“.

Um den Host zu erreichen, muss der Container über das **Gateway** seines Docker-Netzwerks gehen, eine IP-Adresse, die dem Host gehört.

#### Die richtige URL finden

Poznote füllt das URL-Feld mit seiner besten Vermutung für die Adresse Ihres Docker-Hosts vor, in dieser Reihenfolge:

1. `host.docker.internal`, wenn der Name im Container aufgelöst werden kann (unter Docker Desktop für Windows/macOS immer; unter Linux nur, wenn Sie ihn zuordnen, siehe unten);
2. andernfalls die IP des Standard-Gateways des Containers (z. B. `http://172.17.0.1:11434`), ausgelesen aus seiner Routingtabelle.

Die vorausgefüllte URL funktioniert in der Regel auf Anhieb. Möchten Sie sie selbst prüfen, führen Sie auf dem Host aus:

```bash
docker exec <poznote-webserver-container> ip route | grep default
# default via 172.17.0.1 dev eth0   ← die Gateway-IP ist Ihr Host, aus Sicht des Containers
```

Unter Linux können Sie `host.docker.internal` verfügbar machen (wie unter Docker Desktop), indem Sie Folgendes zum Dienst `webserver` in Ihrer `docker-compose.yml` hinzufügen:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

und anschließend `docker compose up -d` ausführen. Die URL lautet dann `http://host.docker.internal:11434`, stabil und auf jedem Rechner gleich.

#### Ollama für den Container erreichbar machen

Standardmäßig lauscht Ollama nur auf `127.0.0.1`, dem Loopback des Hosts, das von keinem Container aus erreichbar ist, selbst mit der richtigen Gateway-IP nicht. Sie müssen `OLLAMA_HOST` setzen, damit Ollama auf einer Schnittstelle lauscht, die der Container erreichen kann.

Bei der Standardinstallation unter Linux (systemd):

```bash
sudo systemctl edit ollama
```

Fügen Sie Folgendes hinzu:

```ini
[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
```

und dann:

```bash
sudo systemctl restart ollama
```

Welche Adresse Sie binden sollten:

- **`172.17.0.1` (die `docker0`-Bridge, unter Linux empfohlen)**: von allen Containern aus erreichbar, auf jeder Docker-Installation vorhanden und nicht nach außen offen. Prüfen Sie Ihre `docker0`-IP mit `ip addr show docker0` (sie lautet `172.17.0.1`, sofern Sie die Adresspools von Docker nicht angepasst haben).
- **`0.0.0.0`** (alle Schnittstellen): am einfachsten, macht Ollama aber auf **jeder** Schnittstelle des Rechners erreichbar. Ollama hat keine Authentifizierung; hat Ihr Rechner eine öffentliche IP, verwenden Sie diese Einstellung daher nur hinter einer Firewall, die den Port blockiert (z. B. `ufw deny 11434`). Auf einem Heimrechner hinter NAT ist das unproblematisch.
- Das Gateway eines bestimmten Compose-Netzwerks (z. B. `192.168.48.1`): funktioniert, aber diese Subnetze vergibt Docker beim Anlegen des Netzwerks automatisch, und sie können sich ändern, wenn das Netzwerk neu erstellt wird. Vermeiden Sie diese Variante daher.

Unter Docker Desktop (Windows/macOS) mit Ollama auf dem Host ist `OLLAMA_HOST=0.0.0.0` die übliche Wahl; der Rechner ist in der Regel nicht direkt nach außen offen, und `host.docker.internal` erreicht ihn dann ohne weitere Einstellungen.

**LM Studio** funktioniert genauso: Aktivieren Sie in den Servereinstellungen „Serve on Local Network“ (entspricht dem Binden an `0.0.0.0`), sonst lauscht es nur auf `127.0.0.1`.

#### Verbindung prüfen

Prüfen Sie auf dem Host, worauf Ollama tatsächlich lauscht:

```bash
ss -tlnp | grep 11434
```

und testen Sie aus dem Container heraus genau die URL, die Poznote verwenden wird:

```bash
docker exec <poznote-webserver-container> curl -s -m 3 http://172.17.0.1:11434/
# "Ollama is running"
```

Liefert dieser Befehl nichts zurück, liegt das Problem an der Bindung von Ollama oder an einer Firewall, nicht an Poznote. Die Schaltfläche **Zugang prüfen und Modelle auflisten** auf der Einstellungsseite führt dieselbe Prüfung durch und füllt bei Erfolg die Modellauswahl.

## Verbindungsfehler

Eine Anfrage, die scheitert, bevor der KI-Server irgendetwas geantwortet hat (DNS-Zeitüberschreitung, abgelehnte Verbindung, nicht abgeschlossener TLS-Handshake), wird automatisch erneut gesendet, bis zu drei Versuche hintereinander mit einer kurzen Pause dazwischen. Der Chat zeigt währenddessen eine Zeile *neuer Versuch*, und nichts geht verloren, da der Server noch nicht mit der Antwort begonnen hatte. Scheitert auch der letzte Versuch, erscheint der Fehler im Chat mit einer Schaltfläche **Erneut versuchen**, die dieselbe Nachricht noch einmal sendet, ohne dass Sie sie neu eingeben müssen.

Ein Fehler, der auftritt, nachdem die Antwort bereits zu streamen begonnen hat, wird nicht wiederholt, da ein Teil der Antwort schon auf dem Bildschirm steht: verwenden Sie die Schaltfläche **Erneut versuchen**.

## Datenschutz

Der KI-Server wird vom Poznote-Server aus aufgerufen, niemals von Ihrem Browser. Mit einer lokalen Ollama- oder LM Studio-Instanz verlassen Ihre Notizen und Unterhaltungen nie Ihren Rechner. Mit einem Cloud-Anbieter werden die Teile Ihrer Notizen, die der Assistent zum Beantworten liest, an diesen Anbieter gesendet.
