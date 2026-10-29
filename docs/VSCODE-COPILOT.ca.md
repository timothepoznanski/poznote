<!-- lang-selector -->
<p align="center">
  <a href="VSCODE-COPILOT.md">English</a> ·
  <a href="VSCODE-COPILOT.fr.md">Français</a> ·
  <a href="VSCODE-COPILOT.de.md">Deutsch</a> ·
  <a href="VSCODE-COPILOT.es.md">Español</a> ·
  <a href="VSCODE-COPILOT.pt.md">Português</a> ·
  <a href="VSCODE-COPILOT.ru.md">Русский</a> ·
  <a href="VSCODE-COPILOT.zh-cn.md">简体中文</a> ·
  <a href="VSCODE-COPILOT.ko.md">한국어</a> ·
  <a href="VSCODE-COPILOT.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Ús del servidor MCP de Poznote amb VS Code Copilot

Aquesta guia explica com configurar i fer servir el servidor MCP de Poznote amb VS Code Copilot.

## Requisits previs

- Visual Studio Code instal·lat
- **Subscripció a GitHub Copilot:** cal un pla de [GitHub Copilot](https://github.com/features/copilot) de pagament (o de prova), amb l'extensió Copilot Chat activada a VS Code
- El servidor MCP de Poznote en funcionament (amb Docker Compose)
- El servidor MCP accessible a 127.0.0.1 (port per defecte: 8045)

## Configuració

### 1. Comproveu que el servidor MCP està en funcionament

Comproveu que el contenidor del servidor MCP s'està executant:

```bash
docker ps | grep mcp
```

Hi hauríeu de veure el servidor MCP en funcionament. Fixeu-vos en el número de port de la sortida (per defecte, 8045).

### 2. Configureu VS Code

Afegiu el servidor MCP de Poznote al fitxer `mcp.json`. La ubicació depèn del sistema operatiu:

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

Si el fitxer no existeix, creeu-lo amb la configuració següent:

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

> **Nota:** substituïu `8045` pel port real del servidor MCP si l'heu personalitzat al `docker-compose.yml`.

#### Ús d'un testimoni d'autenticació

Si el servidor MCP s'ha iniciat amb `POZNOTE_MCP_AUTH_TOKEN` (vegeu [Testimoni d'autenticació d'entrada](MCP-SERVER.ca.md#testimoni-dautenticació-dentrada)), afegiu-hi la capçalera corresponent; si no, totes les crides es rebutgen amb `401 Unauthorized`:

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

Per no posar el testimoni a `mcp.json`, VS Code el pot demanar: declareu una entrada `inputs` amb `"password": true` i feu-hi referència com a `"Authorization": "Bearer ${input:poznote-token}"`.

### 3. Torneu a carregar VS Code

Després d'actualitzar `mcp.json`, torneu a carregar VS Code perquè els canvis tinguin efecte:
- Premeu `Ctrl+Shift+P` (o `Cmd+Shift+P` al Mac)
- Escriviu "Reload Window" (o "Tornar a carregar la finestra" si teniu VS Code en català) i premeu Retorn

## Configuració d'un servidor remot

Si la instància de Poznote s'executa en un servidor remot, feu servir el reenviament de ports per SSH per connectar-vos-hi de manera segura.

### 1. Establiu el túnel SSH

Si preferiu la línia d'ordres, creeu un túnel SSH clàssic:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Mantingueu aquesta connexió oberta mentre feu servir VS Code Copilot amb Poznote.

Si ja esteu connectats a la màquina remota amb VS Code Remote SSH, Dev Containers o Codespaces, també podeu crear el túnel directament des de VS Code, a la vista `PORTS`:

1. Obriu el plafó `PORTS` de VS Code.
2. Reenvieu el port remot `8045`.
3. Mantingueu actiu el port reenviat mentre feu servir Copilot.
4. Si VS Code assigna un port local diferent de `8045`, feu servir aquest port local a `mcp.json`.

### 2. Configureu VS Code

Feu servir la mateixa configuració de `mcp.json` que per a una instal·lació local:

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

El túnel SSH o el port reenviat de VS Code exposa el servidor MCP remot a la vostra màquina local, de manera que VS Code es connecta a `127.0.0.1`.

## Exemples d'ús

Un cop configurat, podeu interactuar amb la instància de Poznote directament des de VS Code amb llenguatge natural al Copilot Chat:

### Operacions bàsiques

```
# Llistar totes les notes
@poznote Llista totes les meves notes

# Cercar notes
@poznote Cerca notes sobre "docker"

# Obtenir una nota concreta
@poznote Mostra'm la nota 123

# Llistar els espais de treball
@poznote Quins espais de treball tinc?

# Llistar les carpetes
@poznote Mostra'm totes les carpetes del meu espai de treball
```

### Creació i actualització de notes

> **Espai de treball**: si no indiqueu l'espai de treball a la sol·licitud, la nota es crea a l'espai de treball per defecte de l'usuari connectat. Indiqueu explícitament l'espai de treball de destinació per evitar confusions, per exemple: *"a l'espai de treball 'Projets'"*.

```
@poznote Crea una nota titulada "Notes de la reunió" a l'espai de treball "Projets" amb contingut sobre la funció nova

@poznote Actualitza la nota 456 amb contingut nou sobre el procés de desplegament

@poznote Suprimeix la nota 456 (la mou a la paperera)

@poznote Crea una nota "Renovar el passaport" a l'espai de treball "Perso" i recorda-m'ho l'1 de setembre a les 9 del matí

@poznote Crea una carpeta anomenada "Projectes"
```

### Recordatoris

```
@poznote Recorda'm la nota 123 dilluns que ve a les 8 del matí

@poznote Defineix un recordatori setmanal a la nota 123, cada dilluns a les 9 del matí

@poznote La nota 123 té algun recordatori?

@poznote Elimina el recordatori de la nota 123
```

### Llistes de tasques

```
@poznote Mostra'm les tasques de la nota 123

@poznote Afegeix a la nota 123 una tasca "Comprar llet" per a demà a les 18:30, amb un recordatori

@poznote Afegeix una tasca "Informe setmanal" a la nota 123, amb venciment cada divendres

@poznote Marca com a feta la tasca "Comprar llet" de la nota 123

@poznote Passa la data de venciment de la tasca "Comprar llet" de la nota 123 a dilluns que ve

@poznote Suprimeix la tasca "Comprar llet" de la nota 123
```

### Operacions avançades

```
@poznote Duplica la nota 789

@poznote Marca la nota 123 com a preferida

@poznote Mou la nota 456 a la carpeta "Projectes"

@poznote Converteix la nota 123 a Markdown

@poznote Quines notes enllacen a la nota 123?

@poznote Activa la compartició pública de la nota 123

@poznote Llista totes les notes i carpetes que tinc compartides públicament

@poznote Quina versió de Poznote estic fent servir?
```

### Carpetes i espais de treball

```
@poznote Canvia el nom de la carpeta 12 a "Arxiu"

@poznote Suprimeix la carpeta 12 i mou-ne les notes a la paperera

@poznote Crea un espai de treball anomenat "Feina"

@poznote Canvia el nom de l'espai de treball "Feina" a "Treball"

@poznote Suprimeix l'espai de treball "Treball"
```

### Paperera i restauració

```
@poznote Mostra'm totes les notes de la paperera

@poznote Restaura la nota 123 de la paperera

@poznote Buida la paperera
```

### Sincronització amb Git

```
@poznote Quin és l'estat de la sincronització amb Git?

@poznote Envia les meves notes a Git

@poznote Obtén les notes de Git
```

### Còpies de seguretat i paràmetres

```
@poznote Llista totes les còpies de seguretat

@poznote Crea una còpia de seguretat de les meves dades

@poznote Restaura la còpia de seguretat poznote_backup_2026-02-02_15-30-00.zip

@poznote Suprimeix la còpia de seguretat poznote_backup_2026-02-02_15-30-00.zip

@poznote Quin valor té el paràmetre "timezone"?

@poznote Defineix el paràmetre "timezone" com a "Europe/Paris"
```

### Treball amb el contingut

```
@poznote Pots resumir totes les meves notes etiquetades amb "important"?

@poznote Ajuda'm a organitzar les notes en carpetes segons el tema

@poznote Crea un informe setmanal a partir de les meves notes de reunions
```

## Resolució de problemes

### Problemes de connexió

Si VS Code Copilot no es pot connectar al servidor MCP:

1. **Comproveu que el servidor MCP està en funcionament:**
   ```bash
   curl http://127.0.0.1:8045/mcp
   ```
   (Substituïu `8045` pel port que hàgiu configurat)

2. **Comproveu l'estat del contenidor Docker:**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **Comproveu la vinculació del port:**
   Assegureu-vos que el port està vinculat a 127.0.0.1 al `docker-compose.yml`:
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

4. **Comproveu la sintaxi de mcp.json:**
   Assegureu-vos que el JSON és vàlid (sense comes finals, amb les cometes correctes, etc.)

### El servidor MCP no es reconeix

Si VS Code no reconeix el servidor MCP de Poznote:

1. Comproveu que heu tornat a carregar VS Code després d'editar `mcp.json`
2. Comproveu que GitHub Copilot està activat i actiu
3. Consulteu si hi ha missatges d'error al plafó de sortida de VS Code:
   - Visualitza → Sortida
   - Seleccioneu "GitHub Copilot" a la llista desplegable

### Errors d'autenticació

El servidor MCP s'autentica a Poznote amb el testimoni compartit emmagatzemat a `data/.mcp_token`.

Comproveu aquests punts:
- `./data/.mcp_token` existeix a l'amfitrió de Poznote
- el servei `mcp-server` munta `./data:/var/www/html/data:ro`
- el contenidor del servidor web s'ha tornat a crear almenys una vegada després d'actualitzar a la configuració d'MCP basada en testimonis

### Mode de depuració

Activeu el registre de depuració del servidor MCP tornant a crear el contenidor amb una variable d'entorn en línia:

```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Només es reconeixen els valors exactes en minúscules `true` i `false`. Qualsevol altre valor es tracta com a `false` i s'escriu un avís als registres d'MCP.

Després, consulteu els registres:
```bash
docker compose logs -f mcp-server
```

## Eines MCP disponibles

El servidor MCP de Poznote ofereix les eines següents, que VS Code Copilot pot fer servir:

### Gestió de notes
- `get_note` - Obté una nota concreta pel seu ID
- `list_notes` - Llista totes les notes
- `search_notes` - Cerca notes per text, amb un interval opcional de dates de creació
- `create_note` - Crea una nota, opcionalment amb una data de venciment o un recordatori
- `update_note` - Actualitza una nota existent i/o en defineix la data de venciment o el recordatori
- `delete_note` - Suprimeix una nota
- `duplicate_note` - Duplica una nota
- `convert_note` - Converteix una nota entre HTML i Markdown
- `get_backlinks` - Obté les notes que enllacen a una nota

### Recordatoris
- `get_reminder` - Obté el recordatori definit en una nota
- `set_reminder` - Defineix o substitueix el recordatori d'una nota, amb un interval de repetició opcional
- `remove_reminder` - Elimina el recordatori d'una nota

### Tasques
- `list_tasks` - Llista les tasques d'una llista de tasques, amb els seus ID i dates de venciment
- `add_task` - Afegeix una tasca, amb una data de venciment i un recordatori opcionals
- `update_task` - Actualitza una tasca (text, data de venciment, recordatori, marca d'important)
- `complete_task` - Marca una tasca com a feta o la torna a obrir
- `delete_task` - Suprimeix una tasca d'una llista de tasques
- `add_subtask` - Afegeix una subtasca a una tasca d'una llista de tasques
- `update_subtask` - Canvia el nom d'una subtasca o la marca com a feta o no feta
- `delete_subtask` - Suprimeix una subtasca d'una tasca

### Organització
- `create_folder` - Crea una carpeta
- `list_folders` - Llista totes les carpetes
- `rename_folder` - Canvia el nom d'una carpeta
- `delete_folder` - Suprimeix una carpeta i en mou les notes a la paperera
- `list_workspaces` - Llista tots els espais de treball
- `create_workspace` - Crea un espai de treball
- `rename_workspace` - Canvia el nom d'un espai de treball
- `delete_workspace` - Suprimeix un espai de treball (no es pot suprimir l'últim)
- `list_tags` - Llista totes les etiquetes
- `move_note_to_folder` - Mou una nota a una carpeta
- `remove_note_from_folder` - Treu una nota d'una carpeta
- `toggle_favorite` - Commuta l'estat de preferit

### Gestió de la paperera
- `get_trash` - Llista les notes de la paperera
- `restore_note` - Restaura una nota de la paperera
- `empty_trash` - Buida la paperera

### Compartició
- `share_note` - Activa la compartició pública
- `unshare_note` - Desactiva la compartició pública
- `get_note_share_status` - Obté l'estat de compartició
- `list_shared` - Llista totes les notes i carpetes compartides públicament
- `list_shared_with_me` - Llista les notes i les carpetes que altres usuaris han compartit amb aquest perfil

### Fitxers adjunts
- `list_attachments` - Llista els fitxers adjunts d'una nota

### Sincronització amb Git
- `get_git_sync_status` - Obté l'estat de la sincronització amb Git
- `git_push` - Envia al repositori Git
- `git_pull` - Obté del repositori Git

### Sistema
- `get_system_info` - Obté la informació de la versió de Poznote
- `list_backups` - Llista les còpies de seguretat del sistema
- `create_backup` - Crea una còpia de seguretat
- `restore_backup` - Restaura una còpia de seguretat (substitueix les dades de l'usuari actual)
- `delete_backup` - Suprimeix un fitxer de còpia de seguretat
- `get_app_setting` - Obté un paràmetre de l'aplicació
- `update_app_setting` - Actualitza un paràmetre de l'aplicació

### Compatibilitat amb diversos usuaris

La majoria d'eines accepten un paràmetre opcional `user_id` per adreçar-se a perfils d'usuari concrets. Les excepcions són les eines de sistema `get_system_info`, `list_backups`, `create_backup` i `delete_backup`, que no admeten `user_id`. Ho podeu indicar a les indicacions:

```
@poznote Llista les notes de l'usuari 2
```

## Configuració avançada

### Diverses instàncies de Poznote

Si executeu diverses instàncies de Poznote, les podeu configurar amb noms diferents:

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

Després, feu-hi referència explícitament:
```
@poznote-work Llista les meves notes de feina
```

### Configuració d'un port personalitzat

Si el servidor MCP s'executa en un altre port, actualitzeu l'URL a `mcp.json`:

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

## Notes de seguretat

⚠️ **Important:** qualsevol persona que pugui accedir al punt final MCP pot gestionar totes les notes. Per defecte només és accessible des de 127.0.0.1; si l'exposeu més enllà, definiu `POZNOTE_MCP_AUTH_TOKEN` perquè els clients hagin de presentar un testimoni Bearer (vegeu [Ús d'un testimoni d'autenticació](#ús-dun-testimoni-dautenticació)).

**Configuració per defecte (segura):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Per a l'accés remot, feu servir sempre un túnel SSH**, tal com es descriu a la secció [Configuració d'un servidor remot](#configuració-dun-servidor-remot).

Tots els detalls: [Seguretat del servidor MCP](MCP-SERVER.ca.md#seguretat).

## Recursos

- [Documentació principal del servidor MCP](MCP-SERVER.ca.md)
- [Documentació oficial d'MCP a VS Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Configuració de Claude CLI](CLAUDE-CLI.ca.md)
- [Consideracions de seguretat](MCP-SERVER.ca.md#seguretat)

## Assistència

Per a problemes o preguntes:
- Consulteu la [documentació principal d'MCP](MCP-SERVER.ca.md)
- Reviseu els registres del servidor MCP: `docker compose logs mcp-server`
- Comproveu que l'API de Poznote és accessible
- Consulteu si hi ha errors al plafó de sortida de VS Code
