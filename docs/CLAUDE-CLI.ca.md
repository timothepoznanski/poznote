<!-- lang-selector -->
<p align="center">
  <a href="CLAUDE-CLI.md">English</a> ·
  <a href="CLAUDE-CLI.fr.md">Français</a> ·
  <a href="CLAUDE-CLI.de.md">Deutsch</a> ·
  <a href="CLAUDE-CLI.es.md">Español</a> ·
  <a href="CLAUDE-CLI.pt.md">Português</a> ·
  <a href="CLAUDE-CLI.ru.md">Русский</a> ·
  <a href="CLAUDE-CLI.zh-cn.md">简体中文</a> ·
  <a href="CLAUDE-CLI.ko.md">한국어</a> ·
  <a href="CLAUDE-CLI.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Ús del servidor MCP del Poznote amb Claude CLI

Aquesta guia explica com configurar i fer servir el servidor MCP del Poznote amb Claude CLI (la interfície de línia d'ordres).

## Requisits previs

- **Un compte d'Anthropic:** Claude CLI inicia la sessió amb una subscripció al Claude, o amb una [clau de l'API d'Anthropic](https://console.anthropic.com/). Amb una clau de l'API, definiu-la abans de fer servir la CLI:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI instal·lat (`npm install -g @anthropic-ai/claude-code`)
- El servidor MCP del Poznote en funcionament (amb Docker Compose)
- El servidor MCP accessible a 127.0.0.1 (port per defecte: 8045)

## Instal·lació

### 1. Comproveu que el servidor MCP està en funcionament

Comproveu que el contenidor del servidor MCP s'està executant:

```bash
docker ps | grep mcp
```

Hi hauríeu de veure el servidor MCP en funcionament. Fixeu-vos en el número de port de la sortida (per defecte, 8045).

### 2. Afegiu el servidor MCP a Claude CLI

Afegiu el servidor MCP del Poznote amb el transport HTTP:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
```

> **Nota:** substituïu `8045` pel port real del servidor MCP si l'heu personalitzat al `docker-compose.yml`.

#### Ús d'un testimoni d'autenticació

Si el servidor MCP s'ha iniciat amb `POZNOTE_MCP_AUTH_TOKEN` (vegeu [Testimoni d'autenticació d'entrada](MCP-SERVER.ca.md#testimoni-dautenticació-dentrada)), passeu el mateix testimoni com a capçalera; si no, totes les crides es rebutgen amb `401 Unauthorized`:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

On es desa la configuració depèn de l'opció `--scope`:
- **Local (per defecte):** `~/.claude.json`, només disponible al directori on heu executat l'ordre
- **Usuari (`--scope user`):** `~/.claude.json`, disponible a tots els vostres projectes
- **Projecte (`--scope project`):** `.mcp.json` a l'arrel del projecte, pensat per confirmar-lo al repositori i compartir-lo amb l'equip

### 3. Verifiqueu la configuració

Llisteu tots els servidors MCP configurats:
```bash
claude mcp list
```

Hi hauríeu de veure `poznote` a la llista amb el seu URL HTTP.

### 4. Consulteu els detalls del servidor

Obteniu informació detallada sobre el servidor MCP del Poznote:
```bash
claude mcp get poznote
```

## Exemples d'ús

Un cop configurat, podeu interactuar amb la instància del Poznote amb ordres en llenguatge natural:

### Consultes bàsiques

```bash
# Llistar totes les notes
claude "Llista totes les meves notes de Poznote"

# Cercar notes
claude "Cerca notes sobre 'docker' a Poznote"

# Obtenir una nota concreta
claude "Mostra'm la nota 123 de Poznote"

# Llistar els espais de treball
claude "Quins espais de treball tinc a Poznote?"

# Llistar les carpetes
claude "Mostra'm totes les carpetes del meu espai de treball de Poznote"
```

### Creació i actualització de notes

```bash
# Crear una nota
# IMPORTANT: indiqueu sempre l'espai de treball de destinació. Sense ell, el servidor fa
# servir el paràmetre mcp_default_workspace, o l'únic espai de treball del compte, i rebutja
# la crida quan el compte en té uns quants i aquest paràmetre és buit.
claude "Crea una nota a Poznote titulada 'Notes de la reunió' a l'espai de treball 'Projets' amb el contingut 'Debat sobre la funció nova'"

# Actualitzar una nota existent
claude "Actualitza la nota 456 de Poznote amb contingut nou sobre el procés de desplegament"

# Suprimir una nota (la mou a la paperera)
claude "Suprimeix la nota 456 de Poznote"

# Crear una nota amb un recordatori, en un sol pas
claude "Crea una nota 'Renovar el passaport' a l'espai de treball 'Perso' de Poznote i recorda-m'ho l'1 de setembre a les 9 del matí"

# Crear una carpeta
claude "Crea una carpeta anomenada 'Projectes' a Poznote"
```

### Recordatoris

```bash
# Definir un recordatori en una nota existent
claude "Recorda'm la nota 123 de Poznote dilluns que ve a les 8 del matí"

# Definir un recordatori periòdic
claude "Defineix un recordatori setmanal a la nota 123 de Poznote, cada dilluns a les 9 del matí"

# Consultar un recordatori
claude "La nota 123 de Poznote té algun recordatori?"

# Eliminar un recordatori
claude "Elimina el recordatori de la nota 123 de Poznote"
```

### Llistes de tasques

```bash
# Llistar les tasques d'una llista de tasques
claude "Mostra'm les tasques de la nota 123 de Poznote"

# Afegir una tasca amb una data de venciment i un recordatori
claude "Afegeix a la nota 123 de Poznote una tasca 'Comprar llet' per a demà a les 18:30, amb un recordatori"

# Afegir una tasca periòdica
claude "Afegeix una tasca 'Informe setmanal' a la nota 123 de Poznote, amb venciment cada divendres"

# Completar una tasca
claude "Marca com a feta la tasca 'Comprar llet' de la nota 123 de Poznote"

# Actualitzar o suprimir una tasca
claude "Passa la data de venciment de la tasca 'Comprar llet' de la nota 123 de Poznote a dilluns que ve"
claude "Suprimeix la tasca 'Comprar llet' de la nota 123 de Poznote"
```

### Operacions avançades

```bash
# Duplicar una nota
claude "Duplica la nota 789 de Poznote"

# Marcar o desmarcar com a preferida
claude "Marca la nota 123 de Poznote com a preferida"

# Moure una nota a una carpeta
claude "Mou la nota 456 a la carpeta 'Projectes' de Poznote"

# Convertir una nota entre HTML i Markdown
claude "Converteix la nota 123 de Poznote a Markdown"

# Trobar les notes que enllacen a una nota
claude "Quines notes enllacen a la nota 123 de Poznote?"

# Compartir una nota
claude "Activa la compartició pública de la nota 123 de Poznote"

# Llistar tot el que es comparteix públicament
claude "Llista totes les notes i carpetes que tinc compartides públicament a Poznote"

# Obtenir la informació del sistema
claude "Quina versió de Poznote estic fent servir?"
```

### Carpetes i espais de treball

```bash
# Canviar el nom d'una carpeta o suprimir-la
claude "Canvia el nom de la carpeta 12 de Poznote a 'Arxiu'"
claude "Suprimeix la carpeta 12 de Poznote i mou-ne les notes a la paperera"

# Gestionar els espais de treball
claude "Crea un espai de treball anomenat 'Feina' a Poznote"
claude "Canvia el nom de l'espai de treball 'Feina' de Poznote a 'Treball'"
claude "Suprimeix l'espai de treball 'Treball' de Poznote"
```

### Paràmetres

```bash
# Llegir un paràmetre
claude "Quin valor té el paràmetre 'timezone' a Poznote?"

# Actualitzar un paràmetre
claude "Defineix el paràmetre 'timezone' com a 'Europe/Paris' a Poznote"
```

### Paperera i restauració

```bash
# Veure la paperera
claude "Mostra'm totes les notes de la paperera de Poznote"

# Restaurar una nota
claude "Restaura la nota 123 de la paperera de Poznote"

# Buidar la paperera
claude "Buida la paperera de Poznote"
```

### Sincronització amb Git

```bash
# Consultar l'estat de la sincronització amb Git
claude "Quin és l'estat de la sincronització amb Git a Poznote?"

# Enviar a Git
claude "Envia les meves notes de Poznote a Git"

# Obtenir de Git
claude "Obtén les notes de Git a Poznote"
```

### Còpies de seguretat

```bash
# Llistar les còpies de seguretat
claude "Llista totes les còpies de seguretat de Poznote"

# Crear una còpia de seguretat
claude "Crea una còpia de seguretat de les meves dades de Poznote"

# Restaurar una còpia de seguretat (⚠️ substitueix totes les dades actuals de l'usuari)
claude "Restaura la còpia de seguretat de Poznote poznote_backup_2026-02-02_15-30-00.zip"

# Suprimir un fitxer de còpia de seguretat
claude "Suprimeix la còpia de seguretat de Poznote poznote_backup_2026-02-02_15-30-00.zip"
```

## Mode interactiu

Inicieu una sessió interactiva on podeu conversar amb Claude sobre les vostres notes:

```bash
claude
```

Després, feu preguntes amb naturalitat:
- «Em pots mostrar totes les notes etiquetades amb “important”?»
- «Fes un resum de totes les notes de reunions de la setmana passada»
- «Ajuda'm a organitzar les notes en carpetes»

## Opcions de configuració

### Ús d'un port personalitzat

Si el servidor MCP s'executa en un altre port (consulteu el paràmetre `POZNOTE_MCP_PORT` al `docker-compose.yml`):
```bash
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### Eliminació del servidor

Per eliminar el servidor MCP del Poznote de Claude CLI:
```bash
claude mcp remove poznote
```

### Diverses instàncies

Si executeu diverses instàncies del Poznote en ports diferents, les podeu configurar amb noms diferents:
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
```

Després, indiqueu quina instància voleu fer servir a les consultes:
```bash
claude "Llista les notes de poznote-work"
```

## Resolució de problemes

### Problemes de connexió

Si Claude CLI no es pot connectar al servidor MCP:

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

### Errors d'autenticació

El servidor MCP s'autentica al Poznote amb el testimoni compartit emmagatzemat a `data/.mcp_token`.

Comproveu aquests punts:
- `./data/.mcp_token` existeix a l'amfitrió del Poznote
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

## Notes de seguretat

⚠️ **Important:** qualsevol persona que pugui accedir al punt final MCP pot gestionar totes les notes. Per defecte només és accessible des de 127.0.0.1; si l'exposeu més enllà, definiu `POZNOTE_MCP_AUTH_TOKEN` perquè els clients hagin de presentar un testimoni Bearer (vegeu [Ús d'un testimoni d'autenticació](#ús-dun-testimoni-dautenticació)).

**Configuració per defecte (segura):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**Per a l'accés remot, feu servir un túnel SSH:**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Tots els detalls: [Seguretat del servidor MCP](MCP-SERVER.ca.md#seguretat).

## Eines MCP disponibles

El servidor ofereix eines per a notes, tasques, recordatoris, carpetes, espais de treball, etiquetes, adjunts, revisions, compartició, sincronització amb Git i còpies de seguretat. Es llisten una a una, amb el que fa cadascuna, a la [documentació del servidor MCP](MCP-SERVER.ca.md#funcions), l'únic lloc on aquesta llista es manté actualitzada.

### Compatibilitat amb diversos usuaris

La majoria d'eines accepten un paràmetre opcional `user_id` per adreçar-se a perfils d'usuari concrets. Les excepcions són les eines de sistema `get_system_info`, `list_backups`, `create_backup` i `delete_backup`, que no admeten `user_id`.
```bash
claude "Llista les notes de l'usuari 2 a Poznote"
```

## Documentació relacionada

- [Documentació principal del servidor MCP](MCP-SERVER.ca.md)
- [Configuració de VS Code Copilot](VSCODE-COPILOT.ca.md)
- [Consideracions de seguretat](MCP-SERVER.ca.md#seguretat)

## Assistència

Per a problemes o preguntes:
- Consulteu la [documentació principal d'MCP](MCP-SERVER.ca.md)
- Reviseu els registres del servidor MCP: `docker compose logs mcp-server`
- Comproveu que l'API del Poznote és accessible
