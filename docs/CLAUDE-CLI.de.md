<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote MCP-Server mit Claude CLI verwenden

Diese Anleitung erklärt, wie Sie den Poznote MCP-Server mit Claude CLI (Command Line Interface) konfigurieren und verwenden.

## Voraussetzungen

- **Anthropic-API-Schlüssel:** Claude CLI benötigt einen kostenpflichtigen [Anthropic-API-Schlüssel](https://console.anthropic.com/). Setzen Sie ihn, bevor Sie die CLI verwenden:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI ist installiert (`npm install -g @anthropic-ai/claude-cli` oder ähnlich)
- Der Poznote MCP-Server läuft (über Docker Compose)
- Der MCP-Server ist unter 127.0.0.1 erreichbar (Standardport: 8045)

## Installation

### 1. Prüfen, ob der MCP-Server läuft

Prüfen Sie, ob Ihr MCP-Server-Container läuft:

```bash
docker ps | grep mcp
```

Der MCP-Server sollte als laufend angezeigt werden. Notieren Sie sich die Portnummer in der Ausgabe (Standard ist 8045).

### 2. MCP-Server zu Claude CLI hinzufügen

Fügen Sie den Poznote MCP-Server mit dem HTTP-Transport hinzu:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **Hinweis:** Ersetzen Sie `8045` durch den tatsächlichen Port Ihres MCP-Servers, falls Sie ihn in Ihrer `docker-compose.yml` angepasst haben.

#### Ein Authentifizierungstoken verwenden

Wurde der MCP-Server mit `POZNOTE_MCP_AUTH_TOKEN` gestartet (siehe [Token für eingehende Authentifizierung](MCP-SERVER.de.md#token-für-eingehende-authentifizierung)), übergeben Sie dasselbe Token als Header, sonst wird jeder Aufruf mit `401 Unauthorized` abgewiesen:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

Wo die Konfiguration gespeichert wird, hängt von der Option `--scope` ab:
- **Lokal (Standard):** `~/.claude.json`, nur in dem Verzeichnis verfügbar, in dem Sie den Befehl ausgeführt haben
- **Benutzer (`--scope user`):** `~/.claude.json`, in allen Ihren Projekten verfügbar
- **Projekt (`--scope project`):** `.mcp.json` im Projektstamm, zum Einchecken und Teilen mit Ihrem Team gedacht

### 3. Konfiguration überprüfen

Alle konfigurierten MCP-Server auflisten:
```bash
claude mcp list
```

In der Liste sollte `poznote` mit seiner HTTP-URL erscheinen.

### 4. Serverdetails anzeigen

Detaillierte Informationen zum Poznote MCP-Server abrufen:
```bash
claude mcp get poznote
```

## Anwendungsbeispiele

Nach der Konfiguration können Sie mit Ihrer Poznote-Instanz über Befehle in natürlicher Sprache interagieren:

### Einfache Abfragen

```bash
# Alle Notizen auflisten
claude "Liste alle meine Notizen aus Poznote auf"

# Notizen durchsuchen
claude "Suche in Poznote nach Notizen über 'docker'"

# Eine bestimmte Notiz abrufen
claude "Zeige mir Notiz 123 aus Poznote"

# Arbeitsbereiche auflisten
claude "Welche Arbeitsbereiche habe ich in Poznote?"

# Ordner auflisten
claude "Zeige mir alle Ordner in meinem Poznote-Arbeitsbereich"
```

### Notizen erstellen und aktualisieren

```bash
# Eine neue Notiz erstellen
# WICHTIG: Wenn Sie keinen Arbeitsbereich angeben, wird die Notiz im
# Standard-Arbeitsbereich des verbundenen Benutzers erstellt. Geben Sie den Ziel-Arbeitsbereich immer an.
claude "Erstelle in Poznote eine Notiz mit dem Titel 'Meeting Notes' im Arbeitsbereich 'Projets' mit dem Inhalt 'Discussion about the new feature'"

# Eine bestehende Notiz aktualisieren
claude "Aktualisiere Notiz 456 in Poznote mit neuem Inhalt über den Deployment-Prozess"

# Eine Notiz löschen (verschiebt sie in den Papierkorb)
claude "Lösche Notiz 456 in Poznote"

# Eine Notiz mit Erinnerung in einem Schritt erstellen
claude "Erstelle in Poznote eine Notiz 'Renew passport' im Arbeitsbereich 'Perso' und erinnere mich am 1. September um 9 Uhr"

# Einen Ordner erstellen
claude "Erstelle in Poznote einen Ordner namens 'Projects'"
```

### Erinnerungen

```bash
# Eine Erinnerung für eine bestehende Notiz setzen
claude "Erinnere mich nächsten Montag um 8 Uhr an Notiz 123 in Poznote"

# Eine wiederkehrende Erinnerung setzen
claude "Setze für Notiz 123 in Poznote eine wöchentliche Erinnerung, jeden Montag um 9 Uhr"

# Eine Erinnerung prüfen
claude "Hat Notiz 123 in Poznote eine Erinnerung?"

# Eine Erinnerung entfernen
claude "Entferne die Erinnerung von Notiz 123 in Poznote"
```

### Aufgabenlisten

```bash
# Die Aufgaben einer Aufgabenlisten-Notiz auflisten
claude "Zeige mir die Aufgaben von Notiz 123 in Poznote"

# Eine Aufgabe mit Fälligkeitsdatum und Erinnerung hinzufügen
claude "Füge zu Notiz 123 in Poznote eine Aufgabe 'Buy milk' hinzu, fällig morgen um 18:30 Uhr, mit Erinnerung"

# Eine wiederkehrende Aufgabe hinzufügen
claude "Füge zu Notiz 123 in Poznote eine Aufgabe 'Weekly report' hinzu, jeden Freitag fällig"

# Eine Aufgabe erledigen
claude "Markiere die Aufgabe 'Buy milk' in Notiz 123 in Poznote als erledigt"

# Eine Aufgabe aktualisieren oder löschen
claude "Verschiebe das Fälligkeitsdatum der Aufgabe 'Buy milk' in Notiz 123 in Poznote auf nächsten Montag"
claude "Lösche die Aufgabe 'Buy milk' aus Notiz 123 in Poznote"
```

### Erweiterte Vorgänge

```bash
# Eine Notiz duplizieren
claude "Dupliziere Notiz 789 in Poznote"

# Favoritenstatus umschalten
claude "Markiere Notiz 123 in Poznote als Favorit"

# Notiz in einen Ordner verschieben
claude "Verschiebe Notiz 456 in Poznote in den Ordner 'Projects'"

# Eine Notiz zwischen HTML und Markdown konvertieren
claude "Konvertiere Notiz 123 in Poznote in Markdown"

# Die Notizen finden, die auf eine Notiz verlinken
claude "Welche Notizen verlinken in Poznote auf Notiz 123?"

# Eine Notiz freigeben
claude "Aktiviere die öffentliche Freigabe für Notiz 123 in Poznote"

# Alle öffentlichen Freigaben auflisten
claude "Liste alle meine öffentlich freigegebenen Notizen und Ordner in Poznote auf"

# Systeminformationen abrufen
claude "Welche Version von Poznote verwende ich?"
```

### Ordner und Arbeitsbereiche

```bash
# Einen Ordner umbenennen oder löschen
claude "Benenne Ordner 12 in Poznote in 'Archive' um"
claude "Lösche Ordner 12 in Poznote und verschiebe seine Notizen in den Papierkorb"

# Arbeitsbereiche verwalten
claude "Erstelle in Poznote einen Arbeitsbereich namens 'Work'"
claude "Benenne den Arbeitsbereich 'Work' in Poznote in 'Job' um"
claude "Lösche den Arbeitsbereich 'Job' in Poznote"
```

### Einstellungen

```bash
# Eine Einstellung lesen
claude "Welchen Wert hat die Einstellung 'timezone' in Poznote?"

# Eine Einstellung ändern
claude "Setze die Einstellung 'timezone' in Poznote auf 'Europe/Paris'"
```

### Papierkorb und Wiederherstellung

```bash
# Papierkorb anzeigen
claude "Zeige mir alle Notizen im Poznote-Papierkorb"

# Eine Notiz wiederherstellen
claude "Stelle Notiz 123 aus dem Poznote-Papierkorb wieder her"

# Papierkorb leeren
claude "Leere den Poznote-Papierkorb"
```

### Git-Synchronisierung

```bash
# Status der Git-Synchronisierung prüfen
claude "Wie ist der Status der Git-Synchronisierung in Poznote?"

# Nach Git pushen
claude "Pushe meine Poznote-Notizen nach Git"

# Aus Git pullen
claude "Pulle Notizen aus Git nach Poznote"
```

### Backups

```bash
# Backups auflisten
claude "Liste alle Poznote-Backups auf"

# Ein Backup erstellen
claude "Erstelle ein Backup meiner Poznote-Daten"

# Ein Backup wiederherstellen (⚠️ ersetzt alle aktuellen Benutzerdaten)
claude "Stelle das Poznote-Backup poznote_backup_2026-02-02_15-30-00.zip wieder her"

# Eine Backup-Datei löschen
claude "Lösche das Poznote-Backup poznote_backup_2026-02-02_15-30-00.zip"
```

## Interaktiver Modus

Starten Sie eine interaktive Sitzung, in der Sie sich mit Claude über Ihre Notizen unterhalten können:

```bash
claude
```

Stellen Sie dann Ihre Fragen ganz natürlich:
- „Kannst du mir alle meine Notizen mit dem Tag 'important' zeigen?“
- „Erstelle eine Zusammenfassung aller meiner Besprechungsnotizen der letzten Woche“
- „Hilf mir, meine Notizen in Ordnern zu organisieren“

## Konfigurationsoptionen

### Einen eigenen Port verwenden

Wenn Ihr MCP-Server auf einem anderen Port läuft (sehen Sie in Ihrer `docker-compose.yml` nach der Einstellung `POZNOTE_MCP_PORT`):
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### Den Server entfernen

So entfernen Sie den Poznote MCP-Server aus Claude CLI:
```bash
claude mcp remove poznote
```

### Mehrere Instanzen

Betreiben Sie mehrere Poznote-Instanzen auf verschiedenen Ports, können Sie diese unter verschiedenen Namen konfigurieren:
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

Geben Sie dann in Ihren Anfragen an, welche Instanz verwendet werden soll:
```bash
claude "Liste die Notizen aus poznote-work auf"
```

## Fehlerbehebung

### Verbindungsprobleme

Wenn Claude CLI keine Verbindung zum MCP-Server herstellen kann:

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

## Sicherheitshinweise

⚠️ **Wichtig:** Wer den MCP-Endpunkt erreichen kann, kann jede Notiz verwalten. Standardmäßig ist er nur von 127.0.0.1 aus erreichbar; machen Sie ihn weiter zugänglich, setzen Sie `POZNOTE_MCP_AUTH_TOKEN`, damit Clients ein Bearer-Token vorlegen müssen (siehe [Ein Authentifizierungstoken verwenden](#ein-authentifizierungstoken-verwenden)).

**Standardkonfiguration (sicher):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Für den Fernzugriff verwenden Sie einen SSH-Tunnel:**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Alle Details: [Sicherheit des MCP-Servers](MCP-SERVER.de.md#sicherheit).

## Verfügbare MCP-Tools

Der Poznote MCP-Server stellt die folgenden Tools bereit:

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

Die meisten Tools akzeptieren einen optionalen Parameter `user_id`, um bestimmte Benutzerprofile anzusprechen. Ausgenommen sind die Tools auf Systemebene `get_system_info`, `list_backups`, `create_backup` und `delete_backup`, die kein `user_id` entgegennehmen.
```bash
claude "Liste die Notizen von Benutzer 2 in Poznote auf"
```

## Weiterführende Dokumentation

- [Hauptdokumentation zum MCP-Server](MCP-SERVER.de.md)
- [Einrichtung von VS Code Copilot](VSCODE-COPILOT.de.md)
- [Sicherheitsaspekte](MCP-SERVER.de.md#sicherheit)

## Support

Bei Problemen oder Fragen:
- Lesen Sie die [Hauptdokumentation zu MCP](MCP-SERVER.de.md)
- Prüfen Sie die Logs des MCP-Servers: `docker compose logs mcp-server`
- Stellen Sie sicher, dass die Poznote-API erreichbar ist
