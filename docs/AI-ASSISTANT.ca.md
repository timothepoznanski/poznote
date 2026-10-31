<!-- lang-selector -->
<p align="center">
  <a href="AI-ASSISTANT.md">English</a> ·
  <a href="AI-ASSISTANT.fr.md">Français</a> ·
  <a href="AI-ASSISTANT.de.md">Deutsch</a> ·
  <a href="AI-ASSISTANT.es.md">Español</a> ·
  <a href="AI-ASSISTANT.pt.md">Português</a> ·
  <a href="AI-ASSISTANT.ru.md">Русский</a> ·
  <a href="AI-ASSISTANT.zh-cn.md">简体中文</a> ·
  <a href="AI-ASSISTANT.ko.md">한국어</a> ·
  <a href="AI-ASSISTANT.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Assistent d'IA del Poznote

Xat d'IA integrat que pot cercar i llegir les vostres notes. Funciona amb una instància local d'[Ollama](https://ollama.com) o d'[LM Studio](https://lmstudio.ai), un proveïdor al núvol com [Anthropic (Claude)](https://www.anthropic.com) o OpenAI, o qualsevol servidor compatible amb OpenAI.

> [!TIP]
> Voleu connectar a les notes un assistent d'IA *extern* (VS Code Copilot, Claude CLI...)? Consulteu la [documentació del servidor MCP](MCP-SERVER.ca.md).

## Què fa

Un cop configurat, apareix un botó **Assistent d'IA** a la barra lateral d'icones de l'esquerra, a la pàgina de notes i al tauler, que obre el plafó del xat allà mateix. El plafó s'acobla a la dreta, conserva l'estat obert i l'amplada d'una pàgina a l'altra, i la conversa us segueix entre totes dues.

L'assistent té eines per **cercar i llegir les vostres notes**, i les fa servir pel seu compte: pregunteu «què diuen les meves notes sobre X?», demaneu un resum de diverses notes o deixeu que trobi aquella nota que recordeu a mitges. Les respostes es transmeten a mesura que es generen i es mostren en Markdown.

Quan li ho demaneu explícitament, també pot actuar sobre les notes:

- **escriure**: crear una nota, canviar-ne el nom o tornar-ne a escriure el contingut;
- **organitzar**: afegir o treure etiquetes, llistar, crear i canviar el nom de carpetes, moure notes d'una a l'altra i marcar notes i carpetes com a preferides;
- **dates**: definir o eliminar un recordatori en una nota (únic o periòdic); l'assistent coneix la data i l'hora actuals del vostre fus horari, de manera que «recorda-m'ho dilluns que ve a les 9» funciona;
- **tasques**: afegir, marcar, desmarcar, canviar el nom o eliminar les tasques d'una llista de tasques i les seves subtasques, incloses les dates de venciment i els recordatoris de les tasques, i marcar o desmarcar una casella dins d'una nota normal sense tornar a escriure la resta;
- **suprimir**: moure una nota a la paperera, o una carpeta amb les seves subcarpetes i totes les seves notes. Tot es pot restaurar des de la pàgina de la paperera: l'assistent no té cap manera de suprimir res definitivament ni cap eina per buidar la paperera.

La nota que teniu oberta forma part del context: digueu «millora el format d'aquesta nota» o «afegeix-hi una conclusió» i l'assistent hi treballa, sense necessitat d'identificador ni de títol. Llegeix l'última versió desada per l'editor, i «aquesta nota» us segueix si obriu una altra nota durant la conversa. Si a la pregunta anomeneu una altra nota, aquesta té prioritat. Al tauler no hi ha cap nota oberta, de manera que allà cal anomenar la nota a què us referiu.

Dues línies damunt del camp d'entrada mostren amb què treballa l'assistent: l'**espai de treball** on s'executen totes les eines, i la **nota** a què fa referència «aquesta nota» quan n'hi ha una d'oberta.

Quan l'assistent edita o crea una nota, la nota oberta i la barra lateral s'actualitzen soles quan la resposta s'ha completat, sense tornar a carregar la pàgina. Si teniu canvis no desats a la nota que acaba d'editar, apareix un bàner: torneu a carregar la nota, o conserveu i deseu la vostra versió.

L'assistent llegeix i escriu el contingut de les notes en Markdown. Les notes de text enriquit (HTML) es converteixen al moment en tots dos sentits, amb el mateix convertidor que l'acció **Converteix la nota**, de manera que una reescriptura conserva els títols, les llistes, els enllaços, les taules i les imatges; el format enriquit, com els colors o els tipus de lletra, no es conserva. Una nota massa llarga perquè l'assistent la llegeixi sencera no es torna a escriure, en lloc de truncar-la.

Abans que l'assistent canviï el contingut d'una nota (reescriptura, casella, tasca), el Poznote desa una revisió de la versió actual, amb l'etiqueta «Abans de l'edició de la IA», a la pàgina **Revisions** de la nota (la icona de l'historial de la barra d'eines de la nota). Si el resultat no és el que volíeu, restaureu aquesta revisió, o obriu primer la pestanya Canvis per veure què ha canviat l'assistent. La revisió s'omet quan l'última ja té el mateix contingut, una sola resposta que toca la mateixa nota diverses vegades només en desa una, i es conserven les 20 revisions de seguretat més recents (Abans de l'edició de la IA i Abans de l'edició d'MCP) per nota, un nombre que podeu canviar a **Paràmetres → Revisions** (d'1 a 200).

L'assistent està **limitat a l'espai de treball actual**: només veu, cerca i edita les notes de l'espai de treball on heu obert el xat, i hi crea les notes noves. Per preguntar sobre un altre espai de treball, primer canvieu-hi. En un tauler que mostra diversos espais de treball, l'assistent cerca i llegeix les notes de tots alhora, que és la manera de fer una pregunta que abasti diversos espais de treball. Allà és de només lectura: no crea, no edita, no organitza ni suprimeix res, de manera que per canviar una nota que ha trobat, obriu la nota o el seu espai de treball i pregunteu-ho allà.

Les converses es desen al servidor del Poznote, a la vostra pròpia base de dades al costat de les notes, i només són vostres: qui treballa en un espai de treball que heu compartit amb ell té les seves. A la capçalera del plafó, el botó del més inicia una conversa nova i el botó de l'historial llista les deu últimes de l'espai de treball, per continuar-ne una o suprimir-la; el botó de la paperera suprimeix la conversa que es mostra. L'historial us segueix d'un navegador o d'un dispositiu a un altre, i en tornar a carregar la pàgina es recupera la conversa que la pestanya tenia oberta.

## Activació de l'assistent

Aneu a **Paràmetres → Eines d'administració → Assistent d'IA** (només administradors) i trieu un proveïdor:

| Proveïdor | URL | Clau de l'API |
|---|---|---|
| **Ollama** (local) | Depèn d'on s'executa Ollama (contenidor o amfitrió); vegeu [Servidors locals i xarxa de Docker](#servidors-locals-i-xarxa-de-docker) | No cal |
| **LM Studio** (local) | S'omple amb l'adreça del vostre amfitrió Docker, port `1234`; vegeu l'[opció 2](#opció-2-ollama-installat-a-lamfitrió) | No cal |
| **Anthropic** (núvol) | Es defineix automàticament | Obligatòria |
| **OpenAI** (núvol) | Es defineix automàticament | Obligatòria |
| **Un altre** | Qualsevol URL base compatible amb OpenAI | Depèn del servidor |

Després feu servir **Comprova l'accés i llista els models**, que verifica que s'accedeix al servidor i omple la llista desplegable **Model** amb els models que ofereix. La llista es queda buida fins que aquesta comprovació funciona, de manera que és el pas que permet triar un model.

La configuració s'aplica a tota la instància: un cop l'administrador l'activa, tots els perfils d'usuari tenen el xat.

### Claus de l'API personals

La mateixa pàgina té l'opció **Permet claus de l'API personals**. Quan està activada, cada usuari té una targeta **El meu assistent d'IA** als seus paràmetres per apuntar el xat al seu propi servidor, proveïdor i clau de l'API en lloc dels configurats per a la instància.

## Tria d'un model

Trieu un model que admeti **crides a eines** (també anomenades «function calling»), p. ex. `qwen3`, `llama3.1` o `mistral`. Les crides a eines són el que permet a l'assistent explorar les notes: amb un model que no les admet, el xat continua funcionant (un avís us ho indica), però no pot accedir a les notes pel seu compte.

### Esforç de raonament

Els models de raonament (GPT-5 i la sèrie o d'OpenAI, `gpt-oss` a Ollama...) accepten un **esforç de raonament** que defineix quant de temps pensa el model abans de respondre. El camp **Esforç de raonament** de la pàgina de paràmetres el controla: **Automàtic** (el valor per defecte) no envia res i deixa l'elecció al proveïdor, mentre que **Cap**, **Mínim**, **Baix**, **Mitjà**, **Alt** i **Molt alt** s'envien com a paràmetre `reasoning_effort` de cada sol·licitud. El proveïdor rebutja els valors que un model no accepta, i el xat ho mostra com a error.

Alguns models d'OpenAI rebutgen les crides a eines a l'API de chat completions tret que l'esforç de raonament sigui `none`. Aleshores el xat mostra un avís que diu que l'assistent no pot explorar les notes: definiu **Esforç de raonament** a **Cap** per recuperar les eines.

### Capçaleres personalitzades

Una passarel·la col·locada davant dels models (LiteLLM, OpenRouter, Cloudflare AI Gateway, Helicone...) sovint espera capçaleres pròpies, per identificar qui fa la crida o per atribuir-ne l'ús. El camp **Capçaleres personalitzades** de la pàgina de paràmetres les admet, una per línia, en el format `Nom: valor`:

```
x-litellm-customer-id: poznote
```

S'envien amb cada sol·licitud al servidor d'IA, inclosa la comprovació de la connexió. El camp s'ofereix per a tots els proveïdors, tant a la configuració de la instància com en una de personal. Amb Anthropic, una clau de l'API d'organització que no està limitada a un espai de treball necessita `anthropic-workspace-id: wrkspc_...`. Amb OpenAI, `OpenAI-Organization` i `OpenAI-Project` trien l'organització o el projecte al qual es factura.

Els valors s'emmagatzemen xifrats i no es tornen a mostrar mai: una capçalera desada torna com a `Name: ••••••••`. Deixeu una línia tal com és per conservar-ne el valor, torneu a escriure el valor per canviar-lo o suprimiu la línia per eliminar la capçalera.

Es rebutgen les capçaleres que defineixen la sol·licitud (`Host`, `Content-Type`, `Content-Length`, `Accept`...), i també `Authorization`, que defineix el camp **Clau de l'API**. Amb Anthropic també es rebutgen `x-api-key` i `anthropic-version`, perquè les defineix el Poznote. Els noms i els valors només poden tenir caràcters ASCII simples, amb un màxim de 20 capçaleres.

Cada sol·licitud també inclou `User-Agent: Poznote/<version>`, perquè els registres d'una passarel·la mostrin d'on prové. Una línia `User-Agent` a les capçaleres personalitzades la substitueix.

## Instruccions personalitzades

Cada usuari pot donar instruccions permanents a l'assistent a **Paràmetres → El meu assistent d'IA → Instruccions personalitzades**, per exemple «Quan escriguis una nota en català, afegeix-ne la traducció a l'anglès a sota, i a l'inrevés». El text (fins a 4.000 caràcters) s'envia al model amb cada missatge, sigui quina sigui la configuració que respon, la de la instància o la vostra. Feu-lo servir per a preferències duradores com el to, la llengua o el format de les notes que escriu l'assistent. No canvia el que l'assistent pot fer: les notes només es modifiquen quan ho demaneu. Deixeu el camp buit per no enviar res.

## Indicacions desades

Les indicacions que envieu sovint, com ara «Revisa la gramàtica i l'estructura d'aquesta nota i recomana millores» o «Hi ha alguna pregunta de seguiment que hauria de fer?», es poden desar a **Paràmetres → El meu assistent d'IA → Indicacions desades**: un nom i un text per a cadascuna, fins a 30 indicacions. Al xat, el botó del llamp del costat del camp d'entrada les obre, i un clic en una n'envia el text com a missatge vostre, sobre la nota que teniu oberta quan diu «aquesta nota». El que estàveu escrivint es queda al camp d'entrada. A diferència de les instruccions personalitzades, una indicació desada només s'envia quan la trieu. **Gestiona les indicacions desades**, a la part inferior de la llista, obre els paràmetres. Per eliminar una indicació, feu clic a la seva paperera o buideu-ne el text i, després, deseu.

## Eines externes (servidors MCP)

L'assistent pot cridar eines que ofereixen servidors [MCP](https://modelcontextprotocol.io) remots, a més de les pròpies, per exemple un servei de cerca web, perquè pugui consultar informació actual abans de respondre o d'escriure una nota. És el sentit contrari del [servidor MCP del Poznote](MCP-SERVER.ca.md), que permet que altres assistents accedeixin a les vostres notes.

La funció està desactivada per defecte. Un administrador l'activa a **Paràmetres → Eines d'administració → Assistent d'IA**, secció **Eines externes**, amb **Permet les eines externes**, i hi afegeix servidors: un nom, l'URL del punt final MCP (per exemple `https://mcp.exa.ai/mcp`), una clau de l'API opcional que s'envia com a testimoni Bearer, i capçaleres personalitzades opcionals per als servidors que reben la clau d'una altra manera. El Poznote es connecta al servidor, llegeix les eines que ofereix i les llista amb una casella cadascuna, perquè trieu quines pot cridar l'assistent. Aquests servidors s'ofereixen als usuaris que poden fer servir l'assistent de la instància. Amb **Permet que els usuaris connectin els seus propis servidors**, cada usuari també té una secció **Eines externes** a **Paràmetres → El meu assistent d'IA**, per a servidors que només es fan servir a les seves converses.

Només s'admeten els servidors accessibles per HTTP (el transport Streamable HTTP) amb una clau de l'API o capçaleres personalitzades: no s'admeten els servidors que s'inicien com a procés local (stdio, `npx ...`) ni els que necessiten OAuth. Igual que el servidor d'IA, un servidor MCP es crida des del servidor del Poznote, de manera que el seu URL ha de ser accessible des de dins del contenidor. Les eines es llegeixen quan afegiu un servidor i quan feu clic a **Comprova i actualitza les eines**: una eina que el servidor afegeixi o canviï més endavant no es fa servir fins que no actualitzeu.

Un cop hi ha un servidor connectat, apareix un botó amb un globus terraqüi al costat del camp de xat. Activa i desactiva les eines externes, i l'elecció es recorda al navegador. Cada crida es mostra a la conversa amb el servidor, l'eina i el que se li ha enviat.

El que retorna una eina externa prové de fora del Poznote, una pàgina web per exemple, i pot contenir text escrit per enganyar el model. Es demana a l'assistent que ho tracti com a dades i es desa una revisió abans de canviar qualsevol nota, però una instrucció no és una garantia. Per descartar canvis no desitjats, obriu **Paràmetres → El meu assistent d'IA**, secció **Eines de l'assistent**, i desmarqueu les eines de la llista **Modificació de les notes**: l'assistent encara pot llegir les notes i cercar a la web, però ja no pot modificar res. Tingueu en compte també que el que l'assistent envia a una eina externa surt de la vostra instància.

## Servidors locals i xarxa de Docker

El servidor d'IA es crida **des del servidor del Poznote**, mai des del navegador. Com que el Poznote s'executa en un contenidor Docker, l'URL que configureu ha de ser accessible *des de dins d'aquest contenidor*.

Per a un Ollama local, hi ha **dues configuracions possibles**, totes dues completament compatibles:

| Configuració | URL que cal configurar | Configuració de xarxa |
|---|---|---|
| [**Opció 1**: Ollama com a contenidor Docker](#opció-1-ollama-com-a-contenidor-docker-la-més-senzilla) | `http://ollama:11434` | Cap |
| [**Opció 2**: Ollama instal·lat a l'amfitrió](#opció-2-ollama-installat-a-lamfitrió) | L'adreça de l'amfitrió, tal com es veu des del contenidor | Necessària; és la part que fa ensopegar la gent |

Trieu l'opció 1 si comenceu de zero. Trieu l'opció 2 si Ollama ja està instal·lat a l'ordinador o també el fan servir altres aplicacions.

### Opció 1: Ollama com a contenidor Docker (la més senzilla)

La configuració més fàcil, amb diferència, és no implicar-hi l'amfitrió: afegiu Ollama com un altre servei al mateix `docker-compose.yml` que el Poznote:

```yaml
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: always
    volumes:
      - "./ollama:/root/.ollama"
```

després inicieu-lo i baixeu un model:

```bash
docker compose up -d
docker exec ollama ollama pull qwen3
```

Als paràmetres de l'assistent d'IA, substituïu l'URL omplert per `http://ollama:11434`. Els serveis del mateix fitxer compose comparteixen una xarxa de Docker i s'hi accedeix pel nom del servei, de manera que no cal configurar res més: cap port per publicar, cap `OLLAMA_HOST` per definir, i Ollama no s'exposa mai fora de la xarxa de Docker. Si el fitxer compose defineix `networks` personalitzades, poseu `ollama` a la mateixa xarxa que el servei del Poznote.

Per a l'acceleració per GPU dins del contenidor, consulteu la [documentació de la imatge Docker d'Ollama](https://hub.docker.com/r/ollama/ollama).

### Opció 2: Ollama instal·lat a l'amfitrió

Si Ollama s'executa directament a l'ordinador amfitrió (instal·lació estàndard des d'[ollama.com](https://ollama.com)), o si feu servir LM Studio, el Poznote també hi pot accedir, però el contenidor ha de trobar el camí de tornada a l'amfitrió a través de la xarxa de Docker. Les subseccions següents expliquen com.

#### Per què `localhost` no funciona

`http://localhost:11434` o `http://127.0.0.1:11434` **no** funcionaran: dins del contenidor, `localhost` és el mateix contenidor, no l'ordinador que executa Ollama. Docker dona a cada contenidor la seva pròpia pila de xarxa aïllada: el mateix ordinador física, dos «localhost» diferents.

Per arribar a l'amfitrió, el contenidor ha de passar per la **passarel·la** de la seva xarxa de Docker, que és una adreça IP que pertany a l'amfitrió.

#### Com trobar l'URL correcte

El Poznote omple el camp de l'URL amb la seva millor estimació de l'adreça de l'amfitrió Docker, en aquest ordre:

1. `host.docker.internal` si es resol dins del contenidor (sempre a Docker Desktop per a Windows/macOS; a Linux només si l'associeu, vegeu més avall);
2. si no, l'IP de la passarel·la per defecte del contenidor (p. ex. `http://172.17.0.1:11434`), llegida de la seva taula d'encaminament.

L'URL omplert normalment funciona tal qual. Si l'heu de comprovar vós, des de l'amfitrió:

```bash
docker exec <poznote-webserver-container> ip route | grep default
# default via 172.17.0.1 dev eth0   ← the gateway IP is your host, as seen from the container
```

A Linux podeu fer que `host.docker.internal` estigui disponible (com a Docker Desktop) afegint això al servei `webserver` del `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

i després `docker compose up -d`. L'URL passa a ser `http://host.docker.internal:11434`, estable i idèntic a tots els ordinadors.

#### Que Ollama escolti el contenidor

Per defecte, Ollama només escolta a `127.0.0.1`, la interfície de bucle local de l'amfitrió, a la qual no pot accedir cap contenidor, ni tan sols amb l'IP de passarel·la correcta. Heu de definir `OLLAMA_HOST` perquè escolti en una interfície a la qual pugui accedir el contenidor.

Amb la instal·lació estàndard de Linux (systemd):

```bash
sudo systemctl edit ollama
```

afegiu-hi:

```ini
[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
```

i després:

```bash
sudo systemctl restart ollama
```

Quina adreça cal vincular:

- **`172.17.0.1` (el pont `docker0`, recomanat a Linux)**: accessible des de tots els contenidors, existeix a totes les instal·lacions de Docker i no s'exposa a l'exterior. Comproveu l'IP de `docker0` amb `ip addr show docker0` (és `172.17.0.1` tret que hàgiu personalitzat els conjunts d'adreces de Docker).
- **`0.0.0.0`** (totes les interfícies): la més senzilla, però exposa Ollama a **totes** les interfícies de l'ordinador. Ollama no té autenticació, de manera que si l'ordinador té una IP pública, feu-la servir només darrere d'un tallafoc que bloquegi el port (p. ex. `ufw deny 11434`). És correcte en un ordinador domèstica darrere de NAT.
- La passarel·la d'una xarxa Compose concreta (p. ex. `192.168.48.1`): funciona, però Docker assigna aquestes subxarxes automàticament quan crea la xarxa i poden canviar si la xarxa es torna a crear, de manera que és millor evitar-ho.

A Docker Desktop (Windows/macOS) amb Ollama executant-se a l'amfitrió, `OLLAMA_HOST=0.0.0.0` és l'opció habitual; normalment l'ordinador no està exposada directament, i aleshores `host.docker.internal` hi accedeix sense més configuració.

**LM Studio** funciona igual: als paràmetres del servidor, activeu «Serve on Local Network» (equivalent a vincular `0.0.0.0`); si no, només escoltarà a `127.0.0.1`.

#### Comprovació de la connectivitat

Des de l'amfitrió, comproveu on escolta realment Ollama:

```bash
ss -tlnp | grep 11434
```

i proveu l'URL exacte que farà servir el Poznote, des de dins del contenidor:

```bash
docker exec <poznote-webserver-container> curl -s -m 3 http://172.17.0.1:11434/
# "Ollama is running"
```

Si no retorna res, el problema és la vinculació d'Ollama o un tallafoc, no el Poznote. El botó **Comprova l'accés i llista els models** de la pàgina de paràmetres fa la mateixa comprovació i, si funciona, omple la llista desplegable de models.

## Errors de connexió

Una sol·licitud que falla abans que el servidor d'IA hagi respost res (un temps d'espera de DNS esgotat, una connexió rebutjada, una negociació TLS que no s'acaba mai) es torna a enviar automàticament, fins a tres intents seguits amb una pausa breu entre ells. Mentrestant, el xat mostra una línia de *reintent*, i no es perd res perquè el servidor encara no havia començat a respondre. Quan l'últim intent també falla, l'error apareix al xat amb un botó **Torna-ho a provar** que torna a enviar el mateix missatge sense haver-lo d'escriure de nou.

Un error que es produeix quan la resposta ja ha començat a arribar no es torna a provar, perquè part de la resposta ja és a la pantalla: feu servir el botó **Torna-ho a provar**.

## Privadesa

El servidor d'IA es crida des del servidor del Poznote, mai des del navegador. Amb una instància local d'Ollama o d'LM Studio, les notes i les converses no surten mai del vostre ordinador. Amb un proveïdor al núvol, les parts de les notes que l'assistent llegeix per respondre s'envien a aquest proveïdor. Amb les eines externes activades, el que l'assistent els envia, una consulta de cerca per exemple, va als servidors que heu connectat.
