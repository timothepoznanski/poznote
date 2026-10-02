<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="VSCODE-COPILOT.es.md">Español</a> ·
  <a href="VSCODE-COPILOT.pt.md">Português</a> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <a href="VSCODE-COPILOT.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote MCP-Server mit VS Code Copilot verwenden

Diese Anleitung erklärt, wie Sie den Poznote MCP-Server mit VS Code Copilot konfigurieren und verwenden.

## Voraussetzungen

- Visual Studio Code ist installiert
- **GitHub-Copilot-Abonnement:** Ein kostenpflichtiger (oder Test-)Plan für [GitHub Copilot](https://github.com/features/copilot) ist erforderlich, mit aktivierter Erweiterung Copilot Chat in VS Code
- Der Poznote MCP-Server läuft (über Docker Compose)
- Der MCP-Server ist unter 127.0.0.1 erreichbar (Standardport: 8045)

## Konfiguration

### 1. Prüfen, ob der MCP-Server läuft

Prüfen Sie, ob Ihr MCP-Server-Container läuft:

```bash
docker ps | grep mcp
```

Der MCP-Server sollte als laufend angezeigt werden. Notieren Sie sich die Portnummer in der Ausgabe (Standard ist 8045).

### 2. VS Code konfigurieren

Fügen Sie den Poznote MCP-Server zu Ihrer Datei `mcp.json` hinzu. Der Speicherort hängt von Ihrem Betriebssystem ab:

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

Falls die Datei nicht existiert, legen Sie sie mit folgender Konfiguration an:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    }
  }
}
```

> **Hinweis:** Ersetzen Sie `8045` durch den tatsächlichen Port Ihres MCP-Servers, falls Sie ihn in Ihrer `docker-compose.yml` angepasst haben.

#### Ein Authentifizierungstoken verwenden

Wurde der MCP-Server mit `POZNOTE_MCP_AUTH_TOKEN` gestartet (siehe [Token für eingehende Authentifizierung](MCP-SERVER.de.md#token-für-eingehende-authentifizierung)), fügen Sie den passenden Header hinzu, sonst wird jeder Aufruf mit `401 Unauthorized` abgewiesen:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Damit das Token nicht in `mcp.json` steht, kann VS Code stattdessen danach fragen: Deklarieren Sie einen Eintrag unter `inputs` mit `"password": true` und verweisen Sie darauf mit `"Authorization": "Bearer ${input:poznote-token}"`.

### 3. VS Code neu laden

Laden Sie VS Code nach dem Ändern von `mcp.json` neu, damit die Änderungen wirksam werden:
- Drücken Sie `Ctrl+Shift+P` (oder `Cmd+Shift+P` auf dem Mac)
- Geben Sie „Reload Window“ ein und drücken Sie die Eingabetaste

## Einrichtung mit einem entfernten Server

Läuft Ihre Poznote-Instanz auf einem entfernten Server, verwenden Sie SSH-Portweiterleitung für eine sichere Verbindung.

### 1. SSH-Tunnel aufbauen

Wenn Sie die Kommandozeile bevorzugen, erstellen Sie einen klassischen SSH-Tunnel:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Halten Sie diese Verbindung offen, solange Sie VS Code Copilot mit Poznote verwenden.

Sind Sie bereits über VS Code Remote SSH, Dev Containers oder Codespaces mit dem entfernten Rechner verbunden, können Sie den Tunnel auch direkt in VS Code in der Ansicht `PORTS` erstellen:

1. Öffnen Sie in VS Code das Panel `PORTS`.
2. Leiten Sie den entfernten Port `8045` weiter.
3. Lassen Sie den weitergeleiteten Port aktiv, solange Sie Copilot verwenden.
4. Weist VS Code einen anderen lokalen Port als `8045` zu, verwenden Sie diesen lokalen Port in `mcp.json`.

### 2. VS Code konfigurieren

Verwenden Sie dieselbe `mcp.json`-Konfiguration wie bei einer lokalen Installation:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    }
  }
}
```

Der SSH-Tunnel oder der von VS Code weitergeleitete Port macht den entfernten MCP-Server auf Ihrem lokalen Rechner verfügbar, daher verbindet sich VS Code mit `127.0.0.1`.

## Anwendungsbeispiele

Nach der Konfiguration können Sie direkt aus VS Code heraus in Copilot Chat mit Ihrer Poznote-Instanz in natürlicher Sprache interagieren:

### Grundlegende Vorgänge

```
# Alle Notizen auflisten
@poznote Liste alle meine Notizen auf

# Notizen durchsuchen
@poznote Suche nach Notizen über "docker"

# Eine bestimmte Notiz abrufen
@poznote Zeige mir Notiz 123

# Arbeitsbereiche auflisten
@poznote Welche Arbeitsbereiche habe ich?

# Ordner auflisten
@poznote Zeige mir alle Ordner in meinem Arbeitsbereich
```

### Notizen erstellen und aktualisieren

> **Arbeitsbereich**: Wenn Sie in Ihrer Anfrage keinen Arbeitsbereich angeben, wird die Notiz im Standard-Arbeitsbereich des verbundenen Benutzers erstellt. Nennen Sie den Ziel-Arbeitsbereich ausdrücklich, um Verwechslungen zu vermeiden, zum Beispiel: *„im Arbeitsbereich 'Projets'“*.

```
@poznote Erstelle eine Notiz mit dem Titel "Meeting Notes" im Arbeitsbereich "Projets" mit Inhalt über die neue Funktion

@poznote Aktualisiere Notiz 456 mit neuem Inhalt über den Deployment-Prozess

@poznote Lösche Notiz 456 (verschiebt sie in den Papierkorb)

@poznote Erstelle eine Notiz "Renew passport" im Arbeitsbereich "Perso" und erinnere mich am 1. September um 9 Uhr

@poznote Erstelle einen Ordner namens "Projects"
```

### Erinnerungen

```
@poznote Erinnere mich nächsten Montag um 8 Uhr an Notiz 123

@poznote Setze für Notiz 123 eine wöchentliche Erinnerung, jeden Montag um 9 Uhr

@poznote Hat Notiz 123 eine Erinnerung?

@poznote Entferne die Erinnerung von Notiz 123
```

### Aufgabenlisten

```
@poznote Zeige mir die Aufgaben von Notiz 123

@poznote Füge zu Notiz 123 eine Aufgabe "Buy milk" hinzu, fällig morgen um 18:30 Uhr, mit Erinnerung

@poznote Füge zu Notiz 123 eine Aufgabe "Weekly report" hinzu, jeden Freitag fällig

@poznote Markiere die Aufgabe "Buy milk" in Notiz 123 als erledigt

@poznote Verschiebe das Fälligkeitsdatum der Aufgabe "Buy milk" in Notiz 123 auf nächsten Montag

@poznote Lösche die Aufgabe "Buy milk" aus Notiz 123
```

### Erweiterte Vorgänge

```
@poznote Dupliziere Notiz 789

@poznote Markiere Notiz 123 als Favorit

@poznote Verschiebe Notiz 456 in den Ordner "Projects"

@poznote Konvertiere Notiz 123 in Markdown

@poznote Welche Notizen verlinken auf Notiz 123?

@poznote Aktiviere die öffentliche Freigabe für Notiz 123

@poznote Liste alle meine öffentlich freigegebenen Notizen und Ordner auf

@poznote Welche Version von Poznote verwende ich?
```

### Ordner und Arbeitsbereiche

```
@poznote Benenne Ordner 12 in "Archive" um

@poznote Lösche Ordner 12 und verschiebe seine Notizen in den Papierkorb

@poznote Erstelle einen Arbeitsbereich namens "Work"

@poznote Benenne den Arbeitsbereich "Work" in "Job" um

@poznote Lösche den Arbeitsbereich "Job"
```

### Papierkorb und Wiederherstellung

```
@poznote Zeige mir alle Notizen im Papierkorb

@poznote Stelle Notiz 123 aus dem Papierkorb wieder her

@poznote Leere den Papierkorb
```

### Git-Synchronisierung

```
@poznote Wie ist der Status der Git-Synchronisierung?

@poznote Pushe meine Notizen nach Git

@poznote Pulle Notizen aus Git
```

### Backups und Einstellungen

```
@poznote Liste alle Backups auf

@poznote Erstelle ein Backup meiner Daten

@poznote Stelle das Backup poznote_backup_2026-02-02_15-30-00.zip wieder her

@poznote Lösche das Backup poznote_backup_2026-02-02_15-30-00.zip

@poznote Welchen Wert hat die Einstellung "timezone"?

@poznote Setze die Einstellung "timezone" auf "Europe/Paris"
```

### Mit Inhalten arbeiten

```
@poznote Kannst du alle meine Notizen mit dem Tag "important" zusammenfassen?

@poznote Hilf mir, meine Notizen nach Themen in Ordnern zu organisieren

@poznote Erstelle einen Wochenbericht auf Grundlage meiner Besprechungsnotizen
```

## Fehlerbehebung

### Verbindungsprobleme

Wenn VS Code Copilot keine Verbindung zum MCP-Server herstellen kann:

1. **Prüfen, ob der MCP-Server läuft:**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   (Ersetzen Sie `8045` durch Ihren konfigurierten Port)

2. **Status des Docker-Containers überprüfen:**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **Port-Bindung prüfen:**
   Stellen Sie sicher, dass der Port in `docker-compose.yml` an 127.0.0.1 gebunden ist:
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

4. **Syntax von mcp.json prüfen:**
   Stellen Sie sicher, dass Ihr JSON gültig ist (keine abschließenden Kommas, korrekte Anführungszeichen usw.)

### MCP-Server wird nicht erkannt

Wenn VS Code den Poznote MCP-Server nicht erkennt:

1. Prüfen Sie, ob Sie VS Code nach dem Bearbeiten von `mcp.json` neu geladen haben
2. Stellen Sie sicher, dass GitHub Copilot aktiviert und aktiv ist
3. Suchen Sie im Ausgabebereich von VS Code nach Fehlermeldungen:
   - View → Output
   - Wählen Sie in der Auswahlliste „GitHub Copilot“ aus

### Authentifizierungsfehler

Der MCP-Server authentifiziert sich bei Poznote mit dem gemeinsamen Token, das in `data/.mcp_token` gespeichert ist.

Prüfen Sie folgende Punkte:
- `./data/.mcp_token` existiert auf dem Poznote-Host
- der Dienst `mcp-server` bindet `./data:/var/www/html/data:ro` ein
- der Webserver-Container wurde nach der Aktualisierung auf das tokenbasierte MCP-Setup mindestens einmal neu erstellt

### Debug-Modus

Aktivieren Sie das Debug-Logging des MCP-Servers, indem Sie den Container mit einer Umgebungsvariablen in der Befehlszeile neu erstellen:

```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Nur die exakten Kleinschreibungswerte `true` und `false` werden erkannt. Jeder andere Wert wird als `false` behandelt, und in die MCP-Logs wird eine Warnung geschrieben.

Prüfen Sie dann die Logs:
```bash
docker compose logs -f mcp-server
```

## Verfügbare MCP-Tools

Der Poznote MCP-Server stellt die folgenden Tools bereit, die VS Code Copilot verwenden kann:

### Notizverwaltung
- `get_note`: Eine bestimmte Notiz anhand ihrer ID abrufen
- `list_notes`: Alle Notizen auflisten
- `search_notes`: Notizen per Textsuche finden, optional mit einem Zeitraum für das Erstellungsdatum
- `create_note`: Eine neue Notiz erstellen, optional mit Fälligkeitsdatum/Erinnerung
- `update_note`: Eine bestehende Notiz aktualisieren und/oder ihr Fälligkeitsdatum bzw. ihre Erinnerung setzen
- `delete_note`: Eine Notiz löschen
- `duplicate_note`: Eine Notiz duplizieren
- `convert_note`: Eine Notiz zwischen HTML und Markdown konvertieren
- `get_backlinks`: Die Notizen abrufen, die auf eine Notiz verlinken

### Erinnerungen
- `get_reminder`: Die für eine Notiz gesetzte Erinnerung abrufen
- `set_reminder`: Die Erinnerung einer Notiz setzen oder ersetzen, optional mit Wiederholungsintervall
- `remove_reminder`: Die Erinnerung von einer Notiz entfernen

### Aufgaben
- `list_tasks`: Die Aufgaben einer Aufgabenlisten-Notiz mit ihren IDs und Fälligkeitsdaten auflisten
- `add_task`: Eine einzelne Aufgabe hinzufügen, optional mit Fälligkeitsdatum und Erinnerung
- `update_task`: Eine Aufgabe aktualisieren (Text, Fälligkeitsdatum, Erinnerung, Markierung als wichtig)
- `complete_task`: Eine Aufgabe als erledigt markieren oder wieder öffnen
- `delete_task`: Eine Aufgabe aus einer Aufgabenlisten-Notiz löschen
- `add_subtask`: Eine Unteraufgabe zu einer Aufgabe einer Aufgabenlisten-Notiz hinzufügen
- `update_subtask`: Eine Unteraufgabe umbenennen oder als erledigt oder offen markieren
- `delete_subtask`: Eine Unteraufgabe einer Aufgabe löschen

### Organisation
- `create_folder`: Einen neuen Ordner erstellen
- `list_folders`: Alle Ordner auflisten
- `rename_folder`: Einen Ordner umbenennen
- `delete_folder`: Einen Ordner löschen und seine Notizen in den Papierkorb verschieben
- `list_workspaces`: Alle Arbeitsbereiche auflisten
- `create_workspace`: Einen neuen Arbeitsbereich erstellen
- `rename_workspace`: Einen Arbeitsbereich umbenennen
- `delete_workspace`: Einen Arbeitsbereich löschen (der letzte kann nicht gelöscht werden)
- `list_tags`: Alle Tags auflisten
- `move_note_to_folder`: Notiz in einen Ordner verschieben
- `remove_note_from_folder`: Notiz aus einem Ordner entfernen
- `toggle_favorite`: Favoritenstatus umschalten

### Papierkorbverwaltung
- `get_trash`: Notizen im Papierkorb auflisten
- `restore_note`: Aus dem Papierkorb wiederherstellen
- `empty_trash`: Papierkorb leeren

### Freigabe
- `share_note`: Öffentliche Freigabe aktivieren
- `unshare_note`: Öffentliche Freigabe deaktivieren
- `get_note_share_status`: Freigabestatus abrufen
- `list_shared`: Alle öffentlich freigegebenen Notizen und Ordner auflisten

### Anhänge
- `list_attachments`: Anhänge einer Notiz auflisten

### Git-Synchronisierung
- `get_git_sync_status`: Status der Git-Synchronisierung abrufen
- `git_push`: In das Git-Repository pushen
- `git_pull`: Aus dem Git-Repository pullen

### System
- `get_system_info`: Versionsinformationen zu Poznote abrufen
- `list_backups`: System-Backups auflisten
- `create_backup`: Ein Backup erstellen
- `restore_backup`: Ein Backup wiederherstellen (ersetzt die aktuellen Benutzerdaten)
- `delete_backup`: Eine Backup-Datei löschen
- `get_app_setting`: Eine Anwendungseinstellung abrufen
- `update_app_setting`: Eine Anwendungseinstellung ändern

### Mehrbenutzer-Unterstützung

Die meisten Tools akzeptieren einen optionalen Parameter `user_id`, um bestimmte Benutzerprofile anzusprechen. Ausgenommen sind die Tools auf Systemebene `get_system_info`, `list_backups`, `create_backup` und `delete_backup`, die kein `user_id` entgegennehmen. Sie können den Benutzer in Ihren Prompts angeben:

```
@poznote Liste die Notizen von Benutzer 2 auf
```

## Erweiterte Konfiguration

### Mehrere Poznote-Instanzen

Betreiben Sie mehrere Poznote-Instanzen, können Sie diese unter verschiedenen Namen konfigurieren:

```json
{
  "servers": {
    "poznote-personal": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    },
    "poznote-work": {
      "type": "http",
      "url": "http://127.0.0.1:9045/mcp"
    }
  }
}
```

Sprechen Sie sie dann ausdrücklich an:
```
@poznote-work Liste meine beruflichen Notizen auf
```

### Eigenen Port konfigurieren

Läuft Ihr MCP-Server auf einem anderen Port, passen Sie die URL in `mcp.json` an:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:YOUR_PORT/mcp"
    }
  }
}
```

## Sicherheitshinweise

⚠️ **Wichtig:** Wer den MCP-Endpunkt erreichen kann, kann jede Notiz verwalten. Standardmäßig ist er nur von 127.0.0.1 aus erreichbar; machen Sie ihn weiter zugänglich, setzen Sie `POZNOTE_MCP_AUTH_TOKEN`, damit Clients ein Bearer-Token vorlegen müssen (siehe [Ein Authentifizierungstoken verwenden](#ein-authentifizierungstoken-verwenden)).

**Standardkonfiguration (sicher):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Verwenden Sie für den Fernzugriff immer einen SSH-Tunnel**, wie im Abschnitt [Einrichtung mit einem entfernten Server](#einrichtung-mit-einem-entfernten-server) beschrieben.

Alle Details: [Sicherheit des MCP-Servers](MCP-SERVER.de.md#sicherheit).

## Ressourcen

- [Hauptdokumentation zum MCP-Server](MCP-SERVER.de.md)
- [Offizielle MCP-Dokumentation von VS Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Einrichtung von Claude CLI](CLAUDE-CLI.de.md)
- [Sicherheitsaspekte](MCP-SERVER.de.md#sicherheit)

## Support

Bei Problemen oder Fragen:
- Lesen Sie die [Hauptdokumentation zu MCP](MCP-SERVER.de.md)
- Prüfen Sie die Logs des MCP-Servers: `docker compose logs mcp-server`
- Stellen Sie sicher, dass die Poznote-API erreichbar ist
- Suchen Sie im Ausgabebereich von VS Code nach Fehlern
