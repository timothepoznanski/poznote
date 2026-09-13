<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote MCP-Server

MCP-Server (Model Context Protocol) für Poznote: ermöglicht eine KI-gestützte Verwaltung Ihrer Notizen in natürlicher Sprache.

Dieser Server unterstützt **ausschließlich den HTTP-Transport** (MCP Streamable HTTP).

> [!TIP]
> Sie suchen einen Chat mit einem lokalen Modell (z. B. Ollama) direkt in Poznote? Dafür brauchen Sie den MCP-Server nicht, verwenden Sie stattdessen den integrierten [KI-Assistenten](AI-ASSISTANT.de.md) (**Einstellungen → Admin-Werkzeuge → KI-Assistent**). Der MCP-Server dient dazu, *externe* MCP-fähige Assistenten mit Ihren Notizen zu verbinden; Ollama allein ist eine Laufzeitumgebung für Modelle, kein MCP-Client, und kann sich nicht direkt mit ihm verbinden.

<p align="center">
  <img src="mcp-poznote.gif" alt="Poznote MCP Server demo" width="100%">
</p>

## Schnellstart

Wählen Sie Ihren bevorzugten KI-Assistenten:

- **[VS Code Copilot](VSCODE-COPILOT.de.md):** Poznote in Ihren Editor integrieren
- **[Claude CLI](CLAUDE-CLI.de.md):** Poznote über die Kommandozeile nutzen

---

## Funktionsweise

Der MCP-Server fungiert als Brücke zwischen KI-Assistenten und Ihrer Poznote-Instanz.

### Komponenten

- **`server.py`**: MCP-Server (HTTP / Streamable HTTP)
  - Stellt den MCP-Endpunkt unter `http://127.0.0.1:8045/mcp` bereit
  - Definiert die Tools (Aktionen) zur Verwaltung der Notizen
  - Koordiniert die Aufrufe zwischen der KI und der Poznote-API

- **`client.py`**: HTTP-Client für die Poznote-REST-API
  - Führt HTTP-Anfragen aus (GET, POST, PATCH, DELETE)
  - Übernimmt die Authentifizierung bei der Poznote-API mit dem gemeinsamen MCP-Diensttoken

### Kommunikationsablauf

1. Der KI-Assistent (VS Code Copilot oder Claude CLI) verbindet sich mit dem MCP-Server
2. Der MCP-Server ruft die Poznote-REST-API auf
3. Die Ergebnisse werden an den KI-Assistenten zurückgegeben

Ein im Browser geöffneter Poznote-Tab übernimmt die über MCP vorgenommenen Änderungen innerhalb weniger Sekunden: Der Ordnerbaum in der Seitenleiste und die geöffnete Notiz werden direkt aktualisiert (oder zeigen ein Banner zum Neuladen, wenn die Notiz ungespeicherte Änderungen enthält). Eine Notiz, die lediglich im Browser geöffnet ist, blockiert Schreibzugriffe über MCP nicht; nur eine Notiz, die gerade von einem anderen Benutzer desselben Kontos oder von einem Besucher über einen öffentlichen Freigabelink bearbeitet wird, antwortet mit einem HTTP-Fehler 423.

## Funktionen

### Tools (Aktionen)
- `get_note`: Eine bestimmte Notiz anhand ihrer ID mit vollständigem Inhalt abrufen
- `list_notes`: Die Notizen eines Arbeitsbereichs seitenweise auflisten (`limit`/`offset`, mit der tatsächlichen Gesamtzahl `total` des Arbeitsbereichs im Ergebnis)
- `search_notes`: Notizen per Textsuche finden, optional mit einem Zeitraum für das Erstellungsdatum
- `create_note`: Eine neue Notiz erstellen, optional aus einer Vorlage und/oder mit Fälligkeitsdatum/Erinnerung
- `update_note`: Eine bestehende Notiz aktualisieren, verschieben und/oder ihr Fälligkeitsdatum bzw. ihre Erinnerung setzen
- `delete_note`: Eine Notiz anhand ihrer ID löschen
- `get_reminder`: Die aktuell für eine Notiz gesetzte Erinnerung abrufen
- `set_reminder`: Die Erinnerung einer Notiz setzen oder ersetzen, optional mit Wiederholungsintervall
- `remove_reminder`: Die Erinnerung von einer Notiz entfernen
- `list_tasks`: Die Aufgaben einer Aufgabenlisten-Notiz mit ihren IDs, Fälligkeitsdaten und Markierungen auflisten
- `add_task`: Eine einzelne Aufgabe zu einer Aufgabenlisten-Notiz hinzufügen, optional mit Fälligkeitsdatum und Erinnerung
- `update_task`: Eine Aufgabe aktualisieren (Text, Fälligkeitsdatum, Erinnerung, Markierung als wichtig)
- `complete_task`: Eine Aufgabe als erledigt markieren oder wieder öffnen
- `delete_task`: Eine Aufgabe aus einer Aufgabenlisten-Notiz löschen
- `create_folder`: Einen Ordner erstellen, per Name oder per Pfad (`folder_path="Projects/2026/Q3"` legt die gesamte Kette in einem Aufruf an), oder mit `is_diary=true` einen Tagebuch-Stammordner
- `list_folders`: Alle Ordner eines Arbeitsbereichs mit ihren Pfaden und Tagebuch-Markierungen auflisten
- `list_workspaces`: Alle verfügbaren Arbeitsbereiche auflisten
- `list_tags`: Alle in Notizen verwendeten Tags (ohne Duplikate) auflisten
- `list_templates`: Die Vorlagennotizen auflisten, von denen `from_template_id` bei `create_note` ausgehen kann
- `get_trash`: Alle Notizen auflisten, die sich derzeit im Papierkorb befinden
- `empty_trash`: Alle Notizen im Papierkorb endgültig löschen
- `restore_note`: Eine Notiz aus dem Papierkorb wiederherstellen
- `duplicate_note`: Ein Duplikat einer bestehenden Notiz erstellen
- `toggle_favorite`: Den Favoritenstatus einer Notiz umschalten
- `list_attachments`: Alle Anhänge einer bestimmten Notiz auflisten
- `add_attachment`: Eine Datei aus ihrem Base64-Inhalt an eine Notiz anhängen (Bild, Log, PDF, …)
- `move_note`: Eine Notiz in einen anderen Arbeitsbereich und/oder Ordner verschieben, wobei ihre ID erhalten bleibt
- `move_folder`: Einen Ordner (mit seinen Unterordnern und Notizen) unter einen anderen übergeordneten Ordner und/oder in einen anderen Arbeitsbereich verschieben
- `move_note_to_folder`: Eine Notiz in einen bestimmten Ordner verschieben
- `remove_note_from_folder`: Eine Notiz aus ihrem aktuellen Ordner entfernen (verschiebt sie auf die oberste Ebene)
- `share_note`: Die öffentliche Freigabe einer Notiz aktivieren und die öffentliche URL abrufen
- `unshare_note`: Die öffentliche Freigabe einer Notiz deaktivieren
- `get_note_share_status`: Den aktuellen Freigabestatus und die öffentliche URL einer Notiz abrufen
- `list_shared`: Alle öffentlich freigegebenen Notizen und Ordner auflisten
- `get_backlinks`: Alle Notizen abrufen, die auf eine bestimmte Notiz verlinken (auf sie verweisen)
- `convert_note`: Eine Notiz zwischen den Formaten HTML und Markdown konvertieren
- `rename_folder`: Einen bestehenden Ordner umbenennen
- `delete_folder`: Einen Ordner löschen und seine Notizen in den Papierkorb verschieben
- `create_workspace`: Einen neuen Arbeitsbereich erstellen
- `rename_workspace`: Einen bestehenden Arbeitsbereich umbenennen
- `delete_workspace`: Einen Arbeitsbereich löschen (der letzte kann nicht gelöscht werden)
- `get_git_sync_status`: Den aktuellen Status der Git-Synchronisierung abrufen (GitHub/GitLab/Forgejo)
- `git_push`: Lokale Notizen per Force-Push in das konfigurierte Git-Repository übertragen
- `git_pull`: Notizen per Force-Pull aus dem konfigurierten Git-Repository abrufen
- `get_system_info`: Versionsinformationen zur Poznote-Installation abrufen
- `list_backups`: Alle verfügbaren System-Backups auflisten
- `create_backup`: Die Erstellung eines neuen System-Backups auslösen
- `restore_backup`: Eine Backup-Datei wiederherstellen (ersetzt die aktuellen Benutzerdaten)
- `delete_backup`: Eine bestimmte Backup-Datei löschen
- `get_app_setting`: Den Wert einer bestimmten Anwendungseinstellung abrufen
- `update_app_setting`: Den Wert einer bestimmten Anwendungseinstellung ändern

**In welchem Arbeitsbereich ein Aufruf landet.** Geben Sie bei `create_note`, `create_folder` und `list_folders` immer den `workspace` an (Ordner gehören stets zu genau einem Arbeitsbereich): Nur so können Sie sicher sein. Fehlt die Angabe, ermittelt der Server den Arbeitsbereich in einer festen Reihenfolge und rät nie: zuerst die Einstellung `mcp_default_workspace`, sofern sie einen existierenden Arbeitsbereich nennt, dann den einzigen Arbeitsbereich des Kontos, sofern es nur einen gibt. Bei mehreren Arbeitsbereichen und ohne diese Einstellung wird der Aufruf abgelehnt, und die Antwort listet sie auf, statt die Notiz in dem Arbeitsbereich abzulegen, der zufällig zuerst einsortiert ist (was sich früher von selbst ändern konnte, etwa wenn beim ersten Archivieren einer Notiz „Archives“ angelegt wurde). Legen Sie den Standard mit `update_app_setting("mcp_default_workspace", "<name>")` fest.

**Anhänge.** `add_attachment(note_id, filename, content_base64)` speichert eine Datei an einer Notiz genau so, wie es Drag-and-drop in der Weboberfläche tut, sodass sich ein generiertes Diagramm oder eine Logdatei ohne menschliches Zutun anhängen lässt; als Inhalt wird auch eine `data:`-URI akzeptiert. Die Regeln von Poznote gelten weiterhin: Ein ausführbarer Dateityp oder ein voll ausgeschöpftes Speicherkontingent führt zu einer Ablehnung mit Angabe des Grundes. Die Bytes werden Base64-kodiert im Tool-Aufruf übertragen, daher begrenzt das Tool einen Upload auf 25 MB und verweist für größere Dateien auf die Weboberfläche.

**Verschieben.** `move_note` und `move_folder` verschieben, sie kopieren nicht: IDs, Inhalt, Verlauf und die Links, die auf eine Notiz zeigen, bleiben alle erhalten. Bei `update_note` gibt `workspace` an, wo die Notiz *gesucht* wird; das Argument, das sie verschiebt, ist `target_workspace`. Eine Notiz, die den Arbeitsbereich wechselt, ohne dass ein Ordner im Ziel angegeben wird, landet auf der obersten Ebene dieses Arbeitsbereichs, da ihr alter Ordner zu dem Arbeitsbereich gehört, den sie verlassen hat. Ein Ordner nimmt seine Unterordner und alle darin enthaltenen Notizen mit.

**Ordner.** Jedes Tool, das einen Ordner entgegennimmt, akzeptiert dasselbe: einen Namen oder einen durch Schrägstriche getrennten Pfad. `create_note(folder="Diary/2026/08")` legt fehlende Ebenen unterwegs an; `create_folder(folder_path=…)` tut dasselbe für einen Ordner; `list_notes(folder_id=…)` beschränkt eine Auflistung serverseitig auf einen Ordner, sodass `total` nur diesen Ordner zählt. Ein bloßer Name erreicht einen bestehenden Ordner in beliebiger Tiefe, sofern nur ein Ordner des Arbeitsbereichs diesen Namen trägt, statt einen zweiten auf der obersten Ebene anzulegen; tragen ihn mehrere, wird der Aufruf abgelehnt und listet sie auf, übergeben Sie dann den vollständigen Pfad oder die ID.

**Tagebücher.** Ein Tagebuch ist nicht einfach ein Ordner namens Diary: Es ist ein Stammordner mit der Markierung `is_diary`, und die Schaltfläche „Neuer Tagebucheintrag“ der Oberfläche legt ihre datierten Notizen in diesem markierten Stammordner ab. Erstellen Sie eines mit `create_folder(folder_name="Journal", is_diary=true)`; `list_folders` zeigt Ihnen, welche Ordner Tagebücher sind. Wird ein Name übergeben, den bereits ein Stammordner trägt, wird dieser Ordner zum Tagebuch und behält seine Notizen. Die Tagebucheinträge selbst sind gewöhnliche Notizen: Legen Sie sie mit `create_note(folder="Journal/2026/09")` ab.

**Vorlagen.** Eine Vorlage ist eine gewöhnliche Notiz, die in einem Ordner namens `Templates` (jede Tiefe darunter zählt) oder irgendwo in einem gleichnamigen Arbeitsbereich liegt; das Wort wird in jeder mitgelieferten Sprache erkannt, sodass auch ein Ordner `Modèles` funktioniert. `list_templates` gibt sie mit ihren IDs zurück, und `create_note(from_template_id=…)` erstellt daraus eine neue Notiz im Format der Vorlage; fordern Sie `note_type="markdown"` an, wird eine HTML-Vorlage konvertiert, so wie es der Befehl `/template` im Editor tut. Eine Aufgabenliste oder eine Zeichnung lässt sich nicht aus einer Vorlage erstellen. Wird zusätzlich `content` übergeben, wird dieser Inhalt nach dem Text der Vorlage angefügt.

**Erinnerungen und Aufgaben.** `reminder_at` (bei `create_note`/`update_note` und `set_reminder`) ist ein ISO-Zeitstempel wie `2026-09-01T09:00:00+02:00`; geben Sie einen Offset an, sonst wird die Zeit als UTC interpretiert. Fälligkeitsdaten von Aufgaben (`due_at`) funktionieren anders: Es sind lokale Uhrzeitwerte, `YYYY-MM-DD` oder `YYYY-MM-DDTHH:MM` ohne Offset, die über die konfigurierte Zeitzone des Benutzers aufgelöst werden, und ein Datum ohne Uhrzeit erinnert um 09:00 Uhr. Wiederholungsintervalle haben die Form `<count><unit>` mit der Einheit `i`/`h`/`d`/`w`/`m`/`y`, zum Beispiel `30i`, `1d` oder `2w`.

Die Aufgaben-Tools bearbeiten jeweils eine Aufgabe: Rufen Sie `list_tasks` auf, um die Aufgaben-IDs zu erhalten, und dann `add_task`, `update_task`, `complete_task` oder `delete_task`. Jeder Aufruf überträgt nur diese eine Aufgabe, sodass ein Client nie eine Aufgabenliste einliest und ein komplett neues Array zurückschickt, und zwei Aufrufer, die verschiedene Aufgaben bearbeiten, können sich nicht gegenseitig überschreiben. Poznote speichert die Aufgaben einer Notiz als ein einziges JSON-Array, das der Server bei jedem Aufruf neu schreibt; der Aufwand eines Aufrufs wächst also trotzdem mit der Länge der Liste. Benachrichtigungen bleiben automatisch synchron, und das Erledigen oder Löschen einer Aufgabe entfernt ihre ausstehende Erinnerung.

Die meisten Tools akzeptieren ein optionales Argument `user_id`, um ein bestimmtes Benutzerprofil anzusprechen. Wird es angegeben, sendet der MCP-Server für diese Anfrage den Header `X-User-ID`, sodass Sie Notizen in verschiedenen Profilen erstellen oder lesen können, ohne die globale MCP-Umgebung zu ändern. Ausgenommen sind die Tools auf Systemebene `get_system_info`, `list_backups`, `create_backup` und `delete_backup`, die kein `user_id` entgegennehmen. Wie Sie das Standardprofil ändern, das ohne `user_id` verwendet wird, lesen Sie unter [Standard-Benutzerprofil](#standard-benutzerprofil).

---

## Installation des Servers

Der MCP-Server ist in der offiziellen `docker-compose.yml` von Poznote enthalten und startet automatisch.

### Konfiguration

Der MCP-Server verwendet die Standardwerte aus `docker-compose.yml`:

```bash
# Der Port des MCP-Servers ist standardmäßig 8045
# Debug-Logging ist standardmäßig false
```

Poznote erzeugt das MCP-Diensttoken automatisch in `data/.mcp_token`. Der Container `mcp-server` liest diese Datei über das gemeinsam genutzte Volume `./data:/var/www/html/data:ro`, sodass kein Passwort in `.env` hinterlegt werden muss.

Um Port und Debug-Modus für einen einzelnen Start zu überschreiben, erstellen Sie den MCP-Container mit Umgebungsvariablen in der Befehlszeile neu:

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Ein einfaches `docker compose restart mcp-server` lädt geänderte Umgebungsvariablen nicht neu.

#### Standard-Benutzerprofil

Standardmäßig arbeitet der MCP-Server als Benutzerprofil `1` (der erste Administrator). Um den Server auf ein anderes Profil festzulegen, setzen Sie `POZNOTE_USER_ID` beim Start des Containers:

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

Alle Tool-Aufrufe gelten dann für dieses Profil, es sei denn, eine Anfrage übergibt ausdrücklich ein Argument `user_id`, das für diese Anfrage weiterhin Vorrang hat. Der Wert muss eine numerische Profil-ID sein; alles andere wird mit einer Warnung in den MCP-Logs ignoriert, und es gilt der Standardwert `1`.

#### Token für eingehende Authentifizierung

Standardmäßig akzeptiert der MCP-Endpunkt jeden Client, der ihn erreichen kann. Das ist unbedenklich, da der Port nur auf `127.0.0.1` veröffentlicht wird. Machen Sie den Port über Ihren Rechner hinaus erreichbar (Reverse Proxy, LAN, Installation ohne Docker), setzen Sie `POZNOTE_MCP_AUTH_TOKEN`: Der Server verlangt dann bei jeder Anfrage einen Header `Authorization: Bearer <token>` und antwortet andernfalls mit `401 Unauthorized`:

```bash
# Einmalig ein starkes Token erzeugen
openssl rand -hex 32

# In .env eintragen
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# Den MCP-Container neu erstellen, damit er die neue Umgebung übernimmt
docker compose up -d --force-recreate mcp-server
```

Fügen Sie anschließend denselben Header zur Konfiguration Ihres Clients hinzu: siehe [VS Code Copilot](VSCODE-COPILOT.de.md#ein-authentifizierungstoken-verwenden) und [Claude CLI](CLAUDE-CLI.de.md#ein-authentifizierungstoken-verwenden). Leerzeichen am Anfang und Ende werden ignoriert, sodass auch ein Token funktioniert, das aus einer Secrets-Datei mit abschließendem Zeilenumbruch gelesen wird. Ein leerer Wert lässt den Endpunkt offen. Die Logzeile beim Start zeigt an, welcher Modus aktiv ist.

Dieses Token ist unabhängig von `data/.mcp_token`: Jenes verwendet der MCP-Server, um *mit* der Poznote-API zu kommunizieren, dieses muss *Ihr KI-Assistent* dem MCP-Server vorlegen.

#### Debug-Modus

Setzen Sie `POZNOTE_DEBUG=true` im Startbefehl, um die Log-Stufe von `INFO` auf `DEBUG` umzustellen. Für den normalen Betrieb setzen Sie den Wert wieder auf `false`. Nur die exakten Kleinschreibungswerte `true` und `false` werden erkannt. Jeder andere Wert wird als `false` behandelt, und in die MCP-Logs wird eine Warnung geschrieben. Der Webserver ist toleranter und akzeptiert auch `1`, `on` oder `yes`. Jede an die Poznote-API gesendete HTTP-Anfrage, jeder vom KI-Assistenten empfangene Tool-Aufruf und jede Antwort werden ausführlich in die Container-Logs geschrieben. Nutzen Sie den Modus, um Verbindungs- oder Authentifizierungsprobleme zu diagnostizieren:

```bash
docker compose logs -f mcp-server
```

Lassen Sie ihn im normalen Betrieb deaktiviert: Die zusätzliche Ausführlichkeit wird im Alltag nicht benötigt.

### Server starten

```bash
docker-compose up -d
```

### Installation überprüfen

```bash
# Prüfen, ob der Container läuft
docker ps | grep mcp

# Den Endpunkt testen
curl http://127.0.0.1:8045/mcp
```

Um den MCP-Server zu deaktivieren, kommentieren Sie den Dienst `mcp-server` in `docker-compose.yml` aus.

---

## Client-Einrichtung

Konfigurieren Sie Ihren KI-Assistenten für die Verbindung mit dem MCP-Server:

### **VS Code Copilot**
Vollständige Einrichtungsanleitung: **[VSCODE-COPILOT.md](VSCODE-COPILOT.de.md)**

### **Claude CLI**
Vollständige Einrichtungsanleitung: **[CLAUDE-CLI.md](CLAUDE-CLI.de.md)**

---

## Sicherheit

Wer den MCP-Endpunkt erreichen kann, kann jede Notiz jedes Profils lesen, erstellen, ändern und löschen (die Tools akzeptieren ein Argument `user_id`) und außerdem Backups, Wiederherstellungen und Änderungen an Einstellungen auslösen. Zwei Schutzebenen sorgen dafür, dass das kein Problem ist:

1. **Netzwerk-Erreichbarkeit.** Standardmäßig ist der Endpunkt nur vom lokalen Rechner aus erreichbar.
2. **Bearer-Token für eingehende Anfragen** (optional). Setzen Sie `POZNOTE_MCP_AUTH_TOKEN`, dann muss jede Anfrage `Authorization: Bearer <token>` mitsenden.

Mit der Standard-`docker-compose.yml` genügt Ebene 1. Ergänzen Sie Ebene 2, sobald der Port von einem Ort aus erreichbar ist, den Sie nicht vollständig kontrollieren.

### Warum nur 127.0.0.1 normal und sicher ist

Der MCP-Container lauscht *innerhalb* des Containers auf `0.0.0.0`, was Docker für die Portzuordnung benötigt, der Port wird auf dem Host aber **nur auf `127.0.0.1`** veröffentlicht, nie auf einer öffentlichen Schnittstelle:

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

Das ist gewollt und die richtige Einrichtung: Nur Prozesse auf demselben Rechner (oder SSH-Tunnel, die Sie ausdrücklich eingerichtet haben) können sich verbinden. Mit der Standardkonfiguration besteht kein Grund zur Sorge.

### MCP-Server außerhalb von Docker betreiben

Wenn Sie den MCP-Server mit `pip` installieren und `poznote-mcp serve` selbst ausführen (systemd, Proxmox LXC, ...), steht keine Docker-Portzuordnung davor, daher kommt es auf die Bind-Adresse an:

- `poznote-mcp serve` bindet **standardmäßig an `127.0.0.1`**. Behalten Sie diese Voreinstellung bei, sofern Sie nicht genau wissen, warum Sie etwas anderes brauchen.
- Müssen Sie an `0.0.0.0` binden (Reverse Proxy auf einem anderen Host, VPN-Schnittstelle), setzen Sie zusätzlich `POZNOTE_MCP_AUTH_TOKEN`. Der Server gibt beim Start eine Warnung aus, wenn er ohne Token auf einer Adresse außerhalb des Loopback lauscht.
- Ältere Versionen haben standardmäßig an `0.0.0.0` gebunden: Übergeben Sie ausdrücklich `--host=127.0.0.1` (oder setzen Sie `MCP_HOST=127.0.0.1`, wenn Sie ohne den Unterbefehl `serve` starten).

### Fernzugriff

Läuft Poznote auf einem entfernten Server und möchten Sie sich von Ihrem Arbeitsrechner aus verbinden, verwenden Sie SSH-Portweiterleitung, und machen Sie den Port **nicht** öffentlich zugänglich:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Richten Sie Ihren KI-Assistenten dann wie gewohnt auf `http://127.0.0.1:8045/mcp` aus.

### Produktionsumgebungen

Müssen Sie den MCP-Server über ein Netzwerk erreichbar machen, schützen Sie ihn mit:
- `POZNOTE_MCP_AUTH_TOKEN` (siehe [Token für eingehende Authentifizierung](#token-für-eingehende-authentifizierung)) und vorgeschaltetem HTTPS, damit das Token nicht im Klartext übertragen wird
- einem VPN (Tailscale, WireGuard)
- optional einem Reverse Proxy mit eigener Authentifizierung oder IP-Allowlist (nginx, Caddy) als zusätzlicher Schutzebene

### Wie sich der MCP-Server bei Poznote authentifiziert

Der MCP-Server verbindet sich mit der Poznote-REST-API über ein internes Bearer-Token, das in `data/.mcp_token` gespeichert ist. Poznote erstellt dieses Token automatisch, und das Docker-Compose-Setup bindet `./data` schreibgeschützt in den MCP-Container ein, sodass das Token nie in `.env` stehen muss.

Da dieses Token den MCP-Server identifiziert, erstellt Poznote einen Schnappschuss einer Notiz, unmittelbar bevor eine Anfrage mit diesem Token den Inhalt oder die Aufgaben der Notiz ändert (`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`). Er erscheint im Menü „Schnappschüsse“ der Notiz als „Vor MCP-Änderung“, sodass sich eine KI-Überarbeitung, bei der Inhalt verloren ging, mit einem Klick rückgängig machen lässt. Es wird kein Schnappschuss erstellt, wenn der letzte bereits denselben Inhalt enthält, und pro Notiz werden die 20 neuesten aufbewahrt. Diese Anzahl können Sie unter **Einstellungen → Schnappschüsse** erhöhen (bis 200), wenn der MCP-Server so viel bearbeitet, dass an einem Nachmittag 20 zusammenkommen.

---

## Anwendungsbeispiele

Nach der Konfiguration können Sie in natürlicher Sprache mit Poznote interagieren:

```
Liste alle Notizen im Arbeitsbereich 'Poznote' auf
Suche nach Notizen über 'MCP'
Erstelle eine Notiz mit dem Titel 'Meeting Notes' über die Besprechung
Aktualisiere Notiz 123 mit neuem Inhalt
Verschiebe Notiz 456 in den Ordner 'Projects'
```

Ausführliche Anwendungsbeispiele und Hilfe zur Fehlerbehebung:
- VS Code Copilot: [VSCODE-COPILOT.md](VSCODE-COPILOT.de.md#anwendungsbeispiele)
- Claude CLI: [CLAUDE-CLI.md](CLAUDE-CLI.de.md#anwendungsbeispiele)

---

## Support & Ressourcen

- **[Einrichtung von VS Code Copilot →](VSCODE-COPILOT.de.md)**
- **[Einrichtung von Claude CLI →](CLAUDE-CLI.de.md)**

Bei Problemen:
- Prüfen Sie die Logs des MCP-Servers: `docker compose logs mcp-server`
- Stellen Sie sicher, dass die Poznote-API erreichbar ist
- Lesen Sie die Anleitungen zur Fehlerbehebung des jeweiligen Clients
