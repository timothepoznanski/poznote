<!-- lang-selector -->
<p align="center">
  <a href="MCP-SERVER.md">English</a> ·
  <a href="MCP-SERVER.fr.md">Français</a> ·
  <a href="MCP-SERVER.de.md">Deutsch</a> ·
  <a href="MCP-SERVER.es.md">Español</a> ·
  <a href="MCP-SERVER.pt.md">Português</a> ·
  <a href="MCP-SERVER.ru.md">Русский</a> ·
  <a href="MCP-SERVER.zh-cn.md">简体中文</a> ·
  <a href="MCP-SERVER.ko.md">한국어</a> ·
  <a href="MCP-SERVER.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Servidor MCP del Poznote

Servidor MCP (Model Context Protocol) per al Poznote: permet gestionar les notes amb IA mitjançant el llenguatge natural.

Aquest servidor **només admet el transport HTTP** (MCP Streamable HTTP).

> [!TIP]
> Cerqueu un xat amb un model local (p. ex. Ollama) directament dins del Poznote? Per a això no cal el servidor MCP: feu servir l'[assistent d'IA](AI-ASSISTANT.ca.md) integrat (**Paràmetres → Eines d'administració → Assistent d'IA**). El servidor MCP serveix per connectar a les notes assistents *externs* compatibles amb MCP; Ollama sol és un entorn d'execució de models, no un client MCP, i no s'hi pot connectar directament.

<p align="center">
  <img src="mcp-poznote.gif" alt="Demostració del servidor MCP de Poznote" width="100%">
</p>

## Inici ràpid

Trieu el vostre assistent d'IA preferit:

- **[VS Code Copilot](VSCODE-COPILOT.ca.md):** integreu el Poznote a l'editor
- **[Claude CLI](CLAUDE-CLI.ca.md):** feu servir el Poznote des de la línia d'ordres

---

## Com funciona

El servidor MCP fa de pont entre els assistents d'IA i la vostra instància del Poznote.

### Components

- **`server.py`**: servidor MCP (HTTP / Streamable HTTP)
  - Exposa el punt final MCP a `http://127.0.0.1:8045/mcp`
  - Defineix les eines (accions) per gestionar les notes
  - Coordina les crides entre la IA i l'API del Poznote

- **`client.py`**: client HTTP per a l'API REST del Poznote
  - Fa les sol·licituds HTTP (GET, POST, PATCH, DELETE)
  - Gestiona l'autenticació a l'API del Poznote amb el testimoni de servei MCP compartit

### Flux de comunicació

1. L'assistent d'IA (VS Code Copilot o Claude CLI) es connecta al servidor MCP
2. El servidor MCP crida l'API REST del Poznote
3. Els resultats es retornen a l'assistent d'IA

Una pestanya del Poznote oberta al navegador recull en pocs segons els canvis fets mitjançant MCP: l'arbre de la barra lateral i la nota oberta s'actualitzen al moment (o mostren un bàner per tornar a carregar quan la nota té canvis no desats). Una nota que simplement està oberta al navegador no bloqueja les escriptures d'MCP; només una nota que està editant un altre usuari del mateix compte, o un visitant d'un enllaç de compartició pública, respon amb un error HTTP 423.

## Funcions

### Eines (accions)
- `get_note`: obté una nota concreta pel seu ID, amb tot el contingut
- `list_notes`: llista les notes d'un espai de treball, una pàgina cada vegada (`limit`/`offset`, amb el `total` real de l'espai de treball al resultat)
- `search_notes`: cerca notes per text, amb un interval opcional de dates de creació
- `create_note`: crea una nota, opcionalment a partir d'una plantilla i/o amb una data de venciment o un recordatori
- `update_note`: actualitza una nota existent, la mou i/o en defineix la data de venciment o el recordatori
- `delete_note`: suprimeix una nota pel seu ID
- `get_reminder`: obté el recordatori definit actualment en una nota
- `set_reminder`: defineix o substitueix el recordatori d'una nota, amb un interval de repetició opcional
- `remove_reminder`: elimina el recordatori d'una nota
- `list_reminders`: llista les notificacions de recordatori que ja s'han activat i encara estan pendents (les de la campana de la interfície); els recordatoris futurs no es poden llistar
- `list_tasks`: llista les tasques d'una llista de tasques, amb els seus ID, dates de venciment i marques
- `list_all_tasks`: llista les tasques obertes de totes les notes d'un espai de treball, primer les més urgents, amb filtres (data de venciment, importants, completades, llistes de comprovació dins de notes)
- `add_task`: afegeix una tasca a una llista de tasques, amb una data de venciment i un recordatori opcionals
- `update_task`: actualitza una tasca (text, data de venciment, recordatori, marca d'important)
- `complete_task`: marca una tasca com a feta o la torna a obrir
- `delete_task`: suprimeix una tasca d'una llista de tasques
- `add_subtask`: afegeix una subtasca a una tasca d'una llista de tasques
- `update_subtask`: canvia el nom d'una subtasca o la marca com a feta o no feta
- `delete_subtask`: suprimeix una subtasca d'una tasca
- `create_folder`: crea una carpeta, pel nom o pel camí (`folder_path="Projects/2026/Q3"` crea tota la cadena en una sola crida), o l'arrel d'un diari amb `is_diary=true`
- `list_folders`: llista totes les carpetes d'un espai de treball, amb els seus camins i les marques de diari
- `list_workspaces`: llista tots els espais de treball disponibles
- `list_tags`: llista totes les etiquetes diferents que es fan servir a les notes
- `list_templates`: llista les notes de plantilla a partir de les quals pot començar el `from_template_id` de `create_note`
- `get_trash`: llista totes les notes que hi ha a la paperera
- `empty_trash`: suprimeix permanentment totes les notes de la paperera
- `delete_trash_note`: suprimeix permanentment una nota de la paperera, en lloc de buidar tota la paperera
- `restore_note`: restaura una nota de la paperera
- `list_snapshots`: llista les versions anteriors desades d'una nota, inclosa la revisió de seguretat presa abans de cada reescriptura de la IA o d'MCP
- `get_snapshot`: llegeix el contingut d'una versió anterior d'una nota, sense canviar la nota
- `restore_snapshot`: torna una nota a una de les seves revisions (cal un `snapshot_key` o una `date`)
- `duplicate_note`: crea un duplicat d'una nota existent
- `toggle_favorite`: commuta l'estat de preferit d'una nota
- `list_attachments`: llista tots els fitxers adjunts d'una nota
- `add_attachment`: adjunta un fitxer a una nota a partir del seu contingut en base64 (imatge, registre, PDF...)
- `move_note`: mou una nota a un altre espai de treball i/o carpeta, conservant-ne l'id
- `move_folder`: mou una carpeta (amb les seves subcarpetes i notes) sota una altra carpeta pare i/o a un altre espai de treball
- `move_note_to_folder`: mou una nota a una carpeta concreta
- `remove_note_from_folder`: treu una nota de la seva carpeta actual (la mou a l'arrel)
- `share_note`: activa la compartició pública d'una nota i n'obté l'URL públic
- `unshare_note`: desactiva la compartició pública d'una nota
- `get_note_share_status`: obté l'estat de compartició actual i l'URL públic d'una nota
- `get_folder_share_status`: obté l'estat de compartició actual i l'URL públic d'una carpeta
- `list_shared`: llista totes les notes i carpetes compartides públicament
- `list_shared_with_me`: llista les notes i les carpetes que altres usuaris han compartit amb aquest perfil
- `get_backlinks`: obté totes les notes que enllacen a (fan referència a) una nota concreta
- `convert_note`: converteix una nota entre els formats HTML i Markdown
- `rename_folder`: canvia el nom d'una carpeta existent
- `delete_folder`: suprimeix una carpeta i en mou les notes a la paperera
- `create_workspace`: crea un espai de treball
- `rename_workspace`: canvia el nom d'un espai de treball existent
- `delete_workspace`: suprimeix un espai de treball (no es pot suprimir l'últim)
- `get_git_sync_status`: obté l'estat actual de la sincronització amb Git (GitHub/GitLab/Forgejo)
- `git_push`: força l'enviament de les notes locals al repositori Git configurat
- `git_pull`: força l'obtenció de les notes del repositori Git configurat
- `get_system_info`: obté la informació de la versió de la instal·lació del Poznote
- `list_backups`: llista totes les còpies de seguretat del sistema disponibles
- `create_backup`: inicia la creació d'una còpia de seguretat del sistema
- `restore_backup`: restaura un fitxer de còpia de seguretat (substitueix les dades de l'usuari actual)
- `delete_backup`: suprimeix un fitxer de còpia de seguretat concret
- `get_app_setting`: obté el valor d'un paràmetre de l'aplicació
- `update_app_setting`: actualitza el valor d'un paràmetre de l'aplicació

**A quin espai de treball va una crida.** Indiqueu sempre el `workspace` a `create_note`, `create_folder` i `list_folders` (les carpetes sempre pertanyen a un espai de treball): és l'única manera d'estar-ne segur. Quan s'omet, el servidor el resol en un ordre fix i no endevina mai: primer el paràmetre `mcp_default_workspace` quan anomena un espai de treball que existeix, i després l'únic espai de treball del compte quan només en té un. Amb diversos espais de treball i sense el paràmetre, la crida es rebutja i la resposta els llista, en lloc de deixar la nota a l'espai de treball que quedi primer en l'ordenació (que abans canviava sol, per exemple la primera vegada que en arxivar una nota es creava «Archives»). Definiu el valor per defecte amb `update_app_setting("mcp_default_workspace", "<name>")`.

**Fitxers adjunts.** `add_attachment(note_id, filename, content_base64)` desa un fitxer en una nota exactament com ho fa arrossegar i deixar anar a la interfície web, de manera que un gràfic generat o un fitxer de registre es pot adjuntar sense intervenció humana; s'accepta un URI `data:` com a contingut. Les regles del Poznote continuen aplicant-se, de manera que un tipus executable o una quota d'emmagatzematge plena tornen com un rebuig amb el motiu. Els bytes viatgen codificats en base64 dins de la crida a l'eina, de manera que l'eina limita una pujada a 25 MB i remet a la interfície web per a qualsevol cosa més gran.

**Moure elements.** `move_note` i `move_folder` mouen, no copien: els ids, el contingut, l'historial i els enllaços que apunten a una nota es conserven. A `update_note`, `workspace` indica on *cal buscar la nota*; l'argument que la mou és `target_workspace`. Una nota que canvia d'espai de treball sense que se li doni una carpeta de destinació va a l'arrel d'aquell espai de treball, perquè la seva carpeta antiga pertany a l'espai de treball que deixa. Una carpeta s'emporta les seves subcarpetes i totes les notes que contenen.

**Carpetes.** Totes les eines que reben una carpeta reben el mateix: un nom o un camí separat per barres. `create_note(folder="Diary/2026/08")` crea els nivells que falten pel camí; `create_folder(folder_path=…)` fa el mateix per a una carpeta; `list_notes(folder_id=…)` limita una llista a una carpeta al servidor, de manera que el seu `total` només compta aquella carpeta. Un nom sol arriba a una carpeta existent a qualsevol profunditat quan només una carpeta de l'espai de treball el porta, en lloc de crear-ne una segona a l'arrel; quan el porten diverses, la crida es rebutja i les llista, de manera que cal passar el camí complet o l'id.

**Diaris.** Un diari no és només una carpeta anomenada Diari: és una carpeta arrel amb la marca `is_diary`, i el botó «Entrada del diari» de la interfície desa les notes datades a l'arrel marcada. Creeu-ne un amb `create_folder(folder_name="Journal", is_diary=true)`, i `list_folders` us indica quines carpetes són diaris. Si passeu un nom que ja porta una carpeta arrel, aquesta carpeta es converteix en un diari i en conserva les notes. Les entrades del diari són notes normals: deseu-les amb `create_note(folder="Journal/2026/09")`.

**Plantilles.** Una plantilla és una nota normal desada en una carpeta anomenada `Templates` (qualsevol profunditat per sota compta) o a qualsevol lloc d'un espai de treball amb aquest nom; la paraula es reconeix en totes les llengües incloses, de manera que una carpeta `Plantilles` també funciona. `list_templates` les retorna amb els seus ids, i `create_note(from_template_id=…)` comença una nota nova a partir d'una, en el format de la mateixa plantilla; si demaneu `note_type="markdown"`, una plantilla HTML es converteix, tal com la converteix l'ordre `/template` a l'editor. Una plantilla no pot començar una llista de tasques ni un dibuix. Si també passeu `content`, s'afegeix després del cos de la plantilla.

**Recordatoris i tasques.** `reminder_at` (a `create_note`/`update_note` i `set_reminder`) és una data i hora ISO com ara `2026-09-01T09:00:00+02:00`; incloeu-hi un desplaçament, o l'hora es llegirà com a UTC. Les dates de venciment de les tasques (`due_at`) són diferents: són valors locals de rellotge, `YYYY-MM-DD` o `YYYY-MM-DDTHH:MM` sense desplaçament, que es resolen amb el fus horari configurat per l'usuari, i una data sense hora fa el recordatori a les 09:00. Els intervals de repetició fan servir `<count><unit>` amb la unitat `i`/`h`/`d`/`w`/`m`/`y`, per exemple `30i`, `1d` o `2w`.

Les eines de tasques treballen amb una tasca cada vegada: crideu `list_tasks` per obtenir els ID de les tasques i després `add_task`, `update_task`, `complete_task` o `delete_task`. Cada crida només porta aquella tasca, de manera que un client no llegeix mai una llista de tasques per tornar-ne a enviar una matriu nova sencera, i dos clients que editen tasques diferents no es poden sobreescriure. El Poznote emmagatzema les tasques d'una nota com una única matriu JSON, que el servidor torna a escriure a cada crida, de manera que la feina de cada crida encara creix amb la llargada de la llista. Les notificacions es mantenen sincronitzades automàticament, i completar o suprimir una tasca en retira el recordatori pendent. Una tasca pot tenir subtasques, d'un sol nivell: `list_tasks` les retorna a la matriu `subtasks` de la tasca amb els seus propis ID, i `add_subtask`, `update_subtask` i `delete_subtask` en canvien una cada vegada. Una subtasca només té un text i una marca de feta, i marcar-la no completa mai la seva tasca.

**Historial de versions i desfer.** El Poznote pren una revisió de seguretat d'una nota just abans que l'assistent d'IA o el servidor MCP la torni a escriure, de manera que un `update_note` erroni es pot desfer. `list_snapshots` mostra les revisions conservades d'una nota, cadascuna amb un `origin` que identifica aquestes còpies de seguretat (`ai` o `mcp`); `get_snapshot` en llegeix una sense tocar la nota, i `restore_snapshot` en torna a posar el contingut. `restore_snapshot` sobreescriu el contingut actual, de manera que necessita un `snapshot_key` o una `date` en lloc de recórrer a la revisió d'avui. No desa abans aquest contingut: el que substitueix es perd tret que ja el tingui alguna revisió. La interfície del Poznote anomena revisions les instantànies: els usuaris les consulten i les comparen a la pàgina **Revisions** de la nota, de manera que una petició sobre revisions o sobre l'historial de versions correspon a aquestes eines.

**Visió de conjunt de les notes.** `list_all_tasks` respon «què queda per fer» en tot un espai de treball, mentre que `list_tasks` cobreix una sola nota. Retorna dos tipus d'element, que es distingeixen per `source`: les tasques d'una llista de tasques, els ids de les quals funcionen amb `update_task` i `delete_task`, i els elements amb casella escrits dins de notes normals, l'id dels quals només és una posició a la nota i no es pot fer servir d'aquesta manera. `list_reminders` retorna les notificacions que ja s'han activat i no s'han descartat, amb un màxim de 50 per part de l'API. No és una vista del que vindrà: el Poznote no té cap punt final per als recordatoris futurs, que es llegeixen d'una nota en una nota amb `get_reminder`.

La majoria d'eines accepten un argument opcional `user_id` per adreçar-se a un perfil d'usuari concret. Quan s'indica, el servidor MCP envia la capçalera `X-User-ID` per a aquella sol·licitud, cosa que permet crear o llegir notes de perfils diferents sense canviar l'entorn MCP global. Les excepcions són les eines de sistema `get_system_info`, `list_backups`, `create_backup` i `delete_backup`, que no admeten `user_id`. Per canviar el perfil per defecte que es fa servir quan no es passa cap `user_id`, vegeu [Perfil d'usuari per defecte](#perfil-dusuari-per-defecte).

---

## Instal·lació del servidor

El servidor MCP s'inclou al `docker-compose.yml` oficial del Poznote i s'executa automàticament.

### Configuració

El servidor MCP fa servir els valors per defecte del `docker-compose.yml`:

```bash
# El port per defecte del servidor MCP és el 8045
# El registre de depuració està desactivat (false) per defecte
```

El Poznote genera automàticament el testimoni de servei MCP a `data/.mcp_token`. El contenidor `mcp-server` llegeix aquest fitxer a través del volum compartit `./data:/var/www/html/data:ro`, de manera que no cal guardar cap contrasenya al `.env`.

Per canviar el port i la depuració per a un sol inici, torneu a crear el contenidor MCP amb variables d'entorn en línia:

```bash
POZNOTE_MCP_PORT=9000 POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Un simple `docker compose restart mcp-server` no torna a carregar les variables d'entorn actualitzades.

#### Quin mode per a quin ús

El servidor MCP identifica els seus clients d'una de tres maneres. La pregunta que les distingeix és **qui decideix sobre quin compte del Poznote actua una sol·licitud**:

| La vostra situació | Mode | Qui decideix el compte |
|---|---|---|
| Vós sol, amb un client al mateix ordinador (VS Code, Claude CLI) | Clàssic, l'opció per defecte, opcionalment amb un [testimoni d'entrada](#testimoni-dautenticació-dentrada) | La configuració del servidor: `POZNOTE_USER_ID` (el perfil `1` per defecte), o qualsevol perfil que una sol·licitud indiqui amb `user_id` |
| Diverses persones, aplicacions de xat (ChatGPT, Claude, Gemini), o VS Code / Claude Code accedint a un servidor públic | [Inici de sessió des d'aplicacions de xat](#inici-de-sessió-des-daplicacions-de-xat-chatgpt-claude-gemini) (`POZNOTE_MCP_AUTH_PROVIDER=poznote`) | La persona que inicia la sessió: sempre el seu propi compte |
| Agents que ja tenen testimonis del vostre proveïdor d'identitat (Keycloak, Authentik...) | [Autenticació per client](#autenticació-per-client-opcional) (`userinfo` o `introspection`) | El perfil vinculat a la identitat del testimoni |

Tan bon punt diverses persones comparteixen un servidor MCP, feu servir el segon mode: en el mode clàssic, qualsevol client pot accedir a qualsevol compte.

#### Perfil d'usuari per defecte

Per defecte, el servidor MCP actua com el perfil d'usuari `1` (el primer administrador). Per fixar el servidor a un altre perfil, definiu `POZNOTE_USER_ID` en iniciar el contenidor:

```bash
POZNOTE_USER_ID=2 docker compose up -d --force-recreate mcp-server
```

Aleshores totes les crides a eines s'apliquen a aquest perfil, tret que una sol·licitud passi un argument `user_id` explícit, que continua tenint prioritat per a aquella sol·licitud. El valor ha de ser un ID numèric de perfil; qualsevol altra cosa s'ignora amb un avís als registres d'MCP i es fa servir el valor per defecte, `1`.

#### Testimoni d'autenticació d'entrada

Per defecte, el punt final MCP accepta qualsevol client que hi pugui accedir, cosa que és segura perquè el port només es publica a `127.0.0.1`. Si exposeu el port més enllà del vostre ordinador (servidor intermediari invers, xarxa local, instal·lació directa sense Docker), definiu `POZNOTE_MCP_AUTH_TOKEN` i el servidor exigirà una capçalera `Authorization: Bearer <token>` a cada sol·licitud, i si no, respondrà `401 Unauthorized`:

```bash
# Generar un token robust una sola vegada
openssl rand -hex 32

# Posar-lo a .env
POZNOTE_MCP_AUTH_TOKEN=paste-the-token-here

# Tornar a crear el contenidor MCP per a que agafi el nou entorn
docker compose up -d --force-recreate mcp-server
```

Després afegiu la mateixa capçalera a la configuració del client: vegeu [VS Code Copilot](VSCODE-COPILOT.ca.md#ús-dun-testimoni-dautenticació) i [Claude CLI](CLAUDE-CLI.ca.md#ús-dun-testimoni-dautenticació). Els espais en blanc inicials i finals s'ignoren, de manera que un testimoni llegit d'un fitxer de secrets amb un salt de línia final continua funcionant. Un valor buit manté el punt final obert. La línia del registre d'inici indica quin mode està actiu.

Aquest testimoni és diferent de `data/.mcp_token`: aquell el fa servir el servidor MCP per comunicar-se *amb* l'API del Poznote, i aquest és el que *el vostre assistent d'IA* ha de presentar al servidor MCP.

#### Inici de sessió des d'aplicacions de xat (ChatGPT, Claude, Gemini)

Les aplicacions de xat que es connecten a un servidor MCP remot, com ara ChatGPT (i l'aplicació Codex), Claude Desktop i claude.ai, o Gemini, no accepten un testimoni enganxat: esperen que el servidor les faci passar per un inici de sessió OAuth. Amb `POZNOTE_MCP_AUTH_PROVIDER=poznote`, el mateix Poznote fa aquest paper:

1. Afegiu `https://mcp.example.com/mcp` com a connector a l'aplicació, deixant buits els camps d'identificador i de secret del client, si n'hi ha: l'aplicació es registra sola. Les aplicacions ho guarden als seus paràmetres, normalment com a connectors personalitzats o servidors MCP remots, i algunes només ho ofereixen en determinats plans o en un mode de desenvolupador.
2. L'aplicació obre la pàgina d'inici de sessió del Poznote. Inicieu la sessió com sempre (contrasenya, dos factors o SSO).
3. Una pàgina de consentiment mostra el nom de l'aplicació, on us tornarà a enviar i el compte que farà servir, sempre el vostre (mai un compte al qual us han donat accés), i us permet triar el nivell d'accés: **Només lectura**, **Lectura i edició** o **Accés complet**, els tres nivells d'[abast de les eines](#abast-de-les-eines).
4. Feu clic a **Permet**, i l'aplicació només accedeix a aquell compte, amb aquell nivell.

Així, un sol servidor MCP serveix tota la instància, i cada persona només accedeix a les seves notes (i als espais de treball compartits amb ella). **Paràmetres > El meu compte > Aplicacions connectades** llista les connexions, en desconnecta qualsevol i dona a tothom l'adreça del connector per enganxar-la.

Requisits:

- L'aplicació de xat es connecta des d'Internet (ChatGPT i claude.ai des dels seus servidors), de manera que el servidor MCP i el Poznote han de ser accessibles des d'allà amb **HTTPS**. Poseu el servidor MCP darrere del servidor intermediari invers, en el **seu propi (sub)domini**, p. ex. `https://mcp.example.com`: els documents de descoberta d'OAuth se serveixen a l'arrel d'aquesta adreça. On envia el trànsit el servidor intermediari depèn d'on s'executa:
  - instal·lat directament al servidor: redirigiu-lo a `127.0.0.1:8045` (el port que publica el `docker-compose.yml`, `POZNOTE_MCP_PORT`);
  - executant-se ell mateix a Docker (Nginx Proxy Manager, Traefik, Caddy...): `127.0.0.1` seria el contenidor del mateix servidor intermediari. Connecteu el servidor intermediari a la xarxa Docker del Poznote, `docker network connect poznote_default <proxy-container>` (la xarxa porta el nom de la carpeta del `docker-compose.yml`; vegeu `docker network ls`), i redirigiu-lo a `mcp-server:8045`.
- Les pàgines `/oauth/` del Poznote han de ser accessibles sense cap altre inici de sessió al davant (autenticació reenviada com Authelia o Authentik al servidor intermediari): les aplicacions en criden algunes des dels seus servidors, sense cap navegador per mostrar una pàgina d'inici de sessió.
- Dues variables al `.env` i, després, torneu a crear el contenidor (`docker compose up -d --force-recreate mcp-server`). Un `docker-compose.yml` antic no les passa al contenidor: primer baixeu-ne el més recent. Aleshores els registres d'MCP mostren `OAuth sign-in through Poznote enabled` a l'inici.

```bash
POZNOTE_MCP_AUTH_PROVIDER=poznote
# URL pública del servidor MCP, sense /mcp
POZNOTE_MCP_PUBLIC_URL=https://mcp.example.com
```

- L'URL públic del Poznote, on la gent inicia la sessió, és l'**URL de la instància** de **Paràmetres > Eines d'administració > Webhooks d'administració**, el mateix que fan servir els correus de recordatori i els webhooks (`POZNOTE_APP_URL` al `.env` mentre és buit). Quan no se'n defineix cap dels dos, s'omple sol des del navegador d'un administrador; comproveu que és l'adreça per la qual la gent accedeix al Poznote des d'Internet. Un canvi arriba al servidor MCP en menys d'un minut, sense reiniciar. La finestra **Aplicacions connectades** mostra als administradors l'adreça que es fa servir, amb un avís quan és local o amb http simple.

Si no funciona:

- **L'aplicació diu que no troba els paràmetres d'autorització (OAuth) del servidor.** Des d'un ordinador de fora de la vostra xarxa, obriu `https://mcp.example.com/.well-known/oauth-protected-resource/mcp` i `https://mcp.example.com/.well-known/oauth-authorization-server`: tots dos han de respondre amb JSON. Un `503` al segon vol dir que l'URL públic del Poznote no està definit; cap resposta vol dir que el servidor intermediari invers no arriba al servidor MCP.
- **L'aplicació obre una pàgina d'inici de sessió que no es carrega.** L'URL de la instància no és un a què l'aplicació pugui accedir: vegeu l'avís a **Aplicacions connectades** i corregiu-lo a **Webhooks d'administració > URL de la instància**.
- **Els registres d'MCP no mostren `OAuth sign-in through Poznote enabled` a l'inici.** Les variables no arriben al contenidor: comproveu el `.env` i el `docker-compose.yml` i, després, torneu a crear el contenidor (un `restart` no n'hi ha prou).
- **L'inici de sessió funciona, però després totes les sol·licituds fallen.** L'URL del connector ha de ser exactament `POZNOTE_MCP_PUBLIC_URL` seguit de `/mcp`; si no, els registres d'MCP diuen `Rejecting a token issued for ...`.
- `docker compose logs mcp-server` indica què ha rebutjat el servidor i per què; `POZNOTE_DEBUG=true` hi afegeix totes les sol·licituds.

Regles que s'apliquen a totes les connexions:

- Una connexió dura mentre es fa servir: l'aplicació renova l'accés cada hora, i ha de tornar a iniciar la sessió després de 90 dies sense ús. Una aplicació desconnectada pot continuar funcionant fins a `POZNOTE_MCP_AUTH_CACHE_TTL` segons (60 per defecte).
- `POZNOTE_MCP_SCOPE` continua limitant totes les connexions: l'**Accés complet** a un servidor definit com a `write` obté `write`.
- Les eines que actuen sobre tota la instància (còpies de seguretat, paràmetres globals, informació del sistema) necessiten un compte d'administrador, i una sol·licitud no pot indicar un altre compte amb `user_id`.
- Una aplicació connectada no pot canviar on s'envien les dades del compte: el repositori, el servidor i el testimoni de la sincronització amb Git, ni els punts finals i les claus de l'assistent d'IA i del dictat. Sí que pot enviar al repositori que heu configurat i obtenir-ne canvis.
- `POZNOTE_MCP_AUTH_TOKEN` s'ignora mentre aquest mode està actiu.

#### Autenticació per client (opcional)

L'anterior `POZNOTE_MCP_AUTH_TOKEN` és un únic secret compartit: tots els clients presenten el
mateix testimoni, i el servidor actua com un sol perfil. Quan diverses persones o
agents comparteixen una instància MCP, no els pot distingir.

Si definiu `POZNOTE_MCP_AUTH_PROVIDER`, es passa a l'autenticació per client: cada
client presenta **el seu propi** testimoni, que es resol amb un proveïdor
d'identitat extern i s'associa al perfil del Poznote d'aquell client. Una instància,
molts clients, cadascun identificat correctament.

Aquestes variables van al `.env`, com les altres. Arriben al contenidor MCP
a través del bloc `environment:` del servei `mcp-server`, i un
`docker-compose.yml` antic no les llista, de manera que aleshores s'ignoren sense avís. Si
les definiu, primer baixeu el `docker-compose.yml` més recent (vegeu
[Actualització de l'aplicació](README.ca.md#actualització-de-laplicació)) i comproveu que els registres
d'MCP mostren `Per-caller authentication enabled` a l'inici.

| variable | valor per defecte | significat |
|---|---|---|
| `POZNOTE_MCP_AUTH_PROVIDER` | *(sense definir, funció desactivada)* | `userinfo` o `introspection` (`poznote` es descriu [més amunt](#inici-de-sessió-des-daplicacions-de-xat-chatgpt-claude-gemini)) |
| `POZNOTE_MCP_AUTH_URL` | *(obligatori)* | punt final del proveïdor |
| `POZNOTE_MCP_IDENTITY_MATCH` | `oidc_subject:sub` | parells `<profile-field>:<claim>` ordenats |
| `POZNOTE_MCP_AUTH_AUDIENCE` | *(sense definir, funció desactivada)* | `aud` esperat, separat per comes; rebutja un testimoni emès per a una altra aplicació |
| `POZNOTE_MCP_AUTH_HEADER` | `Authorization` | la capçalera que aquest servidor envia **al proveïdor** |
| `POZNOTE_MCP_AUTH_CLIENT_ID` / `_CLIENT_SECRET` | *(sense definir, funció desactivada)* | només `introspection`, s'envien com a HTTP Basic |
| `POZNOTE_MCP_AUTH_TIMEOUT` | `5` | segons |
| `POZNOTE_MCP_AUTH_CACHE_TTL` | `60` | segons que es conserva a la memòria cau un testimoni/perfil resolt |

`userinfo` fa `GET <url>` amb el testimoni Bearer del client, el punt final UserInfo
d'OpenID Connect. El testimoni no es verifica mai localment, de manera que els testimonis opacs
funcionen tan bé com els JWT, i no hi ha cap JWKS ni cap rotació de claus per
mantenir. `introspection` fa `POST <url>` amb `token=<token>`
(RFC 7662); una resposta amb `active: false` correspon a un testimoni no vàlid.

Guanya la primera declaració de `POZNOTE_MCP_IDENTITY_MATCH` que hi és **i coincideix
exactament amb un perfil**. Els camps del perfil són els que retorna
`GET /api/v1/admin/users`. El valor per defecte només fa coincidir el subjecte. La coincidència per
`preferred_username` o `email` està disponible però és més feble, perquè el mateix inici de sessió
del Poznote només fa coincidir una adreça electrònica quan està verificada, i un proveïdor que permet als usuaris
editar aquests camps permetria que un d'ells es fes passar per un altre perfil. Activeu-ho
de manera deliberada.

Un valor que coincideix amb dos perfils es rebutja per ambigu, i una identitat que no coincideix
amb cap perfil es rebutja directament: mai no recorre a un perfil per defecte,
perquè el perfil per defecte és l'1, el primer administrador. Un perfil desactivat
no és mai candidat a coincidir.

Dues conseqüències que convé conèixer abans d'activar-ho:

- **Un argument `user_id` explícit només pot coincidir amb el perfil resolt.**
  La majoria d'eines accepten aquest argument, de manera que un que indiqui un perfil diferent es rebutja
  en lloc d'acceptar-se.
- **Les eines que no admeten `user_id`** (`get_system_info`, `list_backups`,
  `create_backup`, `delete_backup`) actuen com el perfil per defecte del servidor, de manera que
  es limiten als clients el perfil resolt dels quals és un administrador.

Quan `POZNOTE_MCP_AUTH_PROVIDER` està definit, té prioritat sobre
`POZNOTE_MCP_AUTH_TOKEN`, i el servidor registra un avís si aquest testimoni encara està
definit.

#### Abast de les eines

Per defecte, el servidor exposa totes les eines. `POZNOTE_MCP_SCOPE` el limita a un de tres nivells, cosa útil per a un agent que s'executa sense supervisió, perquè el contingut d'una nota el podria portar cap a una eina que no hauria de cridar mai:

| nivell | eines |
|---|---|
| `read` | només les eines que no canvien res: obtenir, llistar, cercar, enllaços entrants, revisions, estat de compartició, informació del sistema, paràmetres |
| `write` | `read`, més els canvis que es poden desfer: notes, tasques, recordatoris, carpetes, trasllats, fitxers adjunts, moure una nota a la paperera, restaurar des de la paperera o des d'una revisió |
| `admin` *(per defecte)* | tot, inclòs el que no es pot desfer (buidar la paperera, suprimir-ne elements), espais de treball, còpies de seguretat, sincronització amb Git, paràmetres de l'aplicació i compartició pública |

```bash
# A .env
POZNOTE_MCP_SCOPE=read

# Tornar a crear el contenidor MCP per a que agafi el nou entorn
docker compose up -d --force-recreate mcp-server
```

Una eina per sobre del nivell no es registra: els clients no la veuen, i una crida a l'eina es rebutja com a eina desconeguda, digui el que digui el client. El registre d'inici mostra el nivell i quantes eines s'exposen. Un valor desconegut atura el servidor en lloc de recórrer a `admin`.

Amb el testimoni compartit, el nivell s'aplica a tot el servidor: per donar nivells diferents a dos clients, executeu un segon contenidor MCP amb el seu propi `POZNOTE_MCP_SCOPE`, el seu propi port i el seu propi `POZNOTE_MCP_AUTH_TOKEN`.

Amb l'[autenticació per client](#autenticació-per-client-opcional), cada client pot obtenir el seu propi nivell a partir d'una declaració del seu testimoni. `POZNOTE_MCP_SCOPE_MAP` llista parells `<claim value>=<level>`, llegits de la declaració que indica `POZNOTE_MCP_SCOPE_CLAIM` (per defecte `scope`, els àmbits OAuth separats per espais; també funciona una declaració de llista com `groups` o `roles`):

```bash
# Scopes OAuth concedits a cada client pel proveïdor d'identidad
POZNOTE_MCP_SCOPE_MAP=poznote.read=read,poznote.write=write,poznote.admin=admin

# O grups, per a proveïdors que els inclouen al token
POZNOTE_MCP_SCOPE_CLAIM=groups
POZNOTE_MCP_SCOPE_MAP=/poznote-agents=read,/poznote-users=write,/poznote-admins=admin
```

Un client obté el nivell més alt al qual correspon la seva declaració, mai per sobre de `POZNOTE_MCP_SCOPE`, i les eines per sobre d'aquest nivell s'amaguen de la seva llista d'eines i es rebutgen quan es criden. Un client la declaració del qual no correspon a cap nivell es rebutja directament (`401`), en lloc de rebre el nivell del servidor, i el motiu es registra. Sense `POZNOTE_MCP_SCOPE_MAP`, tots els clients obtenen el nivell del servidor.

Cada eina també porta les anotacions MCP estàndard `readOnlyHint` i `destructiveHint`, de manera que els clients que filtren o confirmen eines pel seu compte s'hi poden basar.

#### Mode de depuració

Definiu `POZNOTE_DEBUG=true` a l'ordre d'inici per passar el nivell de registre d'`INFO` a `DEBUG`. Torneu-lo a `false` per a l'ús normal. Només es reconeixen els valors exactes en minúscules `true` i `false`. Qualsevol altre valor es tracta com a `false` i s'escriu un avís als registres d'MCP. El servidor web és més tolerant i també accepta `1`, `on` o `yes`. Cada sol·licitud HTTP enviada a l'API del Poznote, cada crida a una eina rebuda de l'assistent d'IA i cada resposta s'escriuen amb detall als registres del contenidor. Feu-lo servir per diagnosticar problemes de connexió o d'autenticació:

```bash
docker compose logs -f mcp-server
```

Deixeu-lo desactivat en l'ús normal: el detall addicional no cal en el dia a dia.

### Inici del servidor

```bash
docker-compose up -d
```

### Verificació de la instal·lació

```bash
# Comprovar que el contenidor s'està executant
docker ps | grep mcp

# Provar l'endpoint
curl http://127.0.0.1:8045/mcp
```

Per desactivar el servidor MCP, comenteu el servei `mcp-server` al `docker-compose.yml`.

---

## Configuració del client

Configureu l'assistent d'IA perquè es connecti al servidor MCP:

### **VS Code Copilot**
Guia de configuració completa: **[VSCODE-COPILOT.md](VSCODE-COPILOT.ca.md)**

### **Claude CLI**
Guia de configuració completa: **[CLAUDE-CLI.md](CLAUDE-CLI.ca.md)**

### **ChatGPT, Claude Desktop / claude.ai, Gemini**
Les aplicacions de xat inicien la sessió a través del Poznote: vegeu **[Inici de sessió des d'aplicacions de xat](#inici-de-sessió-des-daplicacions-de-xat-chatgpt-claude-gemini)**.

---

## Seguretat

El que pot fer un client que accedeix al punt final MCP depèn del [mode](#quin-mode-per-a-quin-ús).

**Mode clàssic** (per defecte). Qualsevol persona que pugui accedir al punt final pot llegir, crear, modificar i suprimir totes les notes de tots els perfils (les eines accepten un argument `user_id`), i també pot iniciar còpies de seguretat, restauracions i canvis de paràmetres. Dues capes eviten que això sigui un problema:

1. **Accessibilitat de xarxa.** Per defecte, el punt final només és accessible des de l'ordinador local.
2. **Testimoni Bearer d'entrada** (opcional). Definiu `POZNOTE_MCP_AUTH_TOKEN` i cada sol·licitud haurà de portar `Authorization: Bearer <token>`.

Amb el `docker-compose.yml` per defecte, la capa 1 sola n'hi ha prou. Afegiu-hi la capa 2 sempre que el port sigui accessible des d'algun lloc que no controleu completament.

**Inici de sessió des d'aplicacions de xat i autenticació per client.** Cada sol·licitud ha de portar un testimoni vinculat al compte d'una persona, de manera que un client només accedeix a aquell compte, amb el nivell que se li ha donat. Aquí el punt final està pensat per ser accessible des d'Internet, darrere d'HTTPS: les aplicacions de xat es connecten des dels seus propis servidors.

En tots els modes, un [abast de les eines](#abast-de-les-eines) restringeix el que pot fer un client.

### Per què limitar-lo a 127.0.0.1 és normal i segur

El contenidor MCP escolta a `0.0.0.0` *dins* del contenidor, cosa que Docker necessita perquè funcioni l'associació de ports, però el port es publica **només a `127.0.0.1`** de l'amfitrió, mai en una interfície pública:

```yaml
ports:
  - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
```

És intencionat i és la configuració correcta: només s'hi poden connectar els processos que s'executen al mateix ordinador (o els túnels SSH que configureu explícitament). Amb la configuració per defecte no us n'heu de preocupar.

### Execució del servidor MCP fora de Docker

Si instal·leu el servidor MCP amb `pip` i executeu vós mateix `poznote-mcp serve` (systemd, Proxmox LXC...), no hi ha cap associació de ports de Docker al davant, de manera que l'adreça de vinculació importa:

- `poznote-mcp serve` es vincula a **`127.0.0.1` per defecte**. Mantingueu aquest valor tret que sapigueu per què en necessiteu un altre.
- Si us cal vincular-lo a `0.0.0.0` (un servidor intermediari invers en un altre amfitrió, una interfície VPN), definiu també `POZNOTE_MCP_AUTH_TOKEN`. El servidor registra un avís a l'inici quan escolta en una adreça que no és de bucle local sense testimoni.
- Les versions antigues es vinculaven a `0.0.0.0` per defecte: passeu explícitament `--host=127.0.0.1` (o definiu `MCP_HOST=127.0.0.1` quan l'executeu sense la subordre `serve`).

### Accés remot

En el mode clàssic, si el Poznote s'executa en un servidor remot i us hi voleu connectar des de la vostra estació de treball, feu servir el reenviament de ports per SSH, i **no** exposeu el port públicament (amb l'[inici de sessió des d'aplicacions de xat](#inici-de-sessió-des-daplicacions-de-xat-chatgpt-claude-gemini), exposar-lo darrere d'HTTPS és precisament l'objectiu, i aquesta secció no s'aplica):

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Després, apunteu l'assistent d'IA a `http://127.0.0.1:8045/mcp` com sempre.

### Entorns de producció

Si heu d'encaminar el servidor MCP a través d'una xarxa, protegiu-lo amb:
- `POZNOTE_MCP_AUTH_TOKEN` (vegeu [Testimoni d'autenticació d'entrada](#testimoni-dautenticació-dentrada)), o l'[inici de sessió a través del Poznote](#inici-de-sessió-des-daplicacions-de-xat-chatgpt-claude-gemini) perquè cada client tingui el seu propi testimoni revocable vinculat a un compte, i HTTPS al davant perquè el testimoni no s'enviï en clar
- Una VPN (Tailscale, WireGuard)
- Opcionalment, un servidor intermediari invers amb la seva pròpia autenticació o llista d'IP permeses (nginx, Caddy) com a capa addicional, excepte amb l'inici de sessió des d'aplicacions de xat: les aplicacions es connecten des de les seves pròpies adreces, que canvien, i no poden respondre a un altre inici de sessió, de manera que el punt final i els seus documents `/.well-known/` han de continuar sent accessibles

### Com s'autentica el servidor MCP al Poznote

El servidor MCP es connecta a l'API REST del Poznote amb un testimoni Bearer intern emmagatzemat a `data/.mcp_token`. El Poznote crea aquest testimoni automàticament, i la configuració de Docker Compose munta `./data` en mode de només lectura al contenidor MCP, de manera que el testimoni no ha de ser mai al `.env`.

Com que aquest testimoni identifica el servidor MCP, el Poznote pren una revisió d'una nota just abans que una sol·licitud que el porti en canviï el contingut o les tasques (`update_note`, `add_task`, `update_task`, `complete_task`, `delete_task`, `add_subtask`, `update_subtask`, `delete_subtask`). Es mostra com a «Abans de l'edició d'MCP» a la pàgina **Revisions** de la nota, de manera que una reescriptura de la IA que hagi perdut contingut es pot restaurar amb un sol clic. No se'n pren cap quan l'última ja té el mateix contingut, i es conserven les 20 revisions de seguretat més recents d'una nota (Abans de l'edició de la IA i Abans de l'edició d'MCP), un nombre que podeu augmentar a **Paràmetres → Revisions** (fins a 200) quan el servidor MCP fa prou edicions per esgotar-ne 20 en una tarda.

---

## Exemples d'ús

Un cop configurat, interactueu amb el Poznote amb llenguatge natural:

```
Llista totes les notes de l'espai de trrball 'Poznote'
Cerca notes sobre 'MCP'
Crea una nota titulada 'Meeting Notes' sobre la conversa
Actualitza la nota 123 amb contingut nou
Mou la nota 456 a la carpeta 'Projects'
```

Per a exemples d'ús detallats i resolució de problemes:
- VS Code Copilot: [VSCODE-COPILOT.md](VSCODE-COPILOT.ca.md#exemples-dús)
- Claude CLI: [CLAUDE-CLI.md](CLAUDE-CLI.ca.md#exemples-dús)

---

## Assistència i recursos

- **[Configuració de VS Code Copilot →](VSCODE-COPILOT.ca.md)**
- **[Configuració de Claude CLI →](CLAUDE-CLI.ca.md)**

Per a problemes:
- Consulteu els registres del servidor MCP: `docker compose logs mcp-server`
- Comproveu que l'API del Poznote és accessible
- Consulteu les guies de resolució de problemes de cada client
