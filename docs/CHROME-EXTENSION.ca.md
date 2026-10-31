<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <a href="CHROME-EXTENSION.ko.md">한국어</a> ·
  <a href="CHROME-EXTENSION.ja.md">日本語</a> ·
  <b>Català</b>
</p>
<!-- /lang-selector -->

# Extensió del Poznote per al Chrome

**Poznote URL Saver** és una extensió del navegador que desa la pàgina actual a la vostra instància del Poznote amb un sol clic: la seva adreça, o l'adreça amb una captura de pantalla, com a nota nova o al final d'una nota que ja teniu.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Extensió de Poznote per al Chrome" width="50%">
</p>

Instal·leu l'extensió directament des de la Chrome Web Store: [Instal·la l'extensió](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Connexió amb la vostra instància

1. Al Poznote, obriu **Paràmetres > Contrasenyes d'aplicació**, creeu-ne una amb el nom de l'extensió i copieu el secret que mostra. Només es mostra una vegada.
2. Feu clic a la icona de l'extensió i, després, a **Connecta**. La pàgina de paràmetres de l'extensió s'obre en una pestanya.
3. Introduïu l'**Adreça del Poznote** (p. ex. `https://notes.example.com`), el vostre **Nom d'usuari** i la **Contrasenya d'aplicació** que acabeu de copiar, feu clic a **Connecta** i permeteu que l'extensió accedeixi a la instància quan el Chrome us ho demani.
4. Trieu l'**Espai de treball** i, opcionalment, la **Carpeta** on s'han de desar les notes noves. L'elecció es desa a mesura que la feu.

Per canviar-ho més endavant, feu clic a la icona de l'engranatge de la part superior de l'extensió.

L'adreça de la instància, que es mostra al costat, és un enllaç: feu-hi clic per obrir el Poznote en una pestanya nova, amb http o https tal com l'heu escrita als paràmetres.

L'extensió es mostra en la llengua del Chrome si és l'anglès, el francès, l'alemany, el castellà, el portuguès, el rus, el coreà, el xinès simplificat, el japonès o el català, i en anglès en els altres casos.

La contrasenya del compte també funciona aquí, però una contrasenya d'aplicació és la millor credencial per a una extensió: només dona accés a l'API, mai a la interfície web ni als paràmetres del compte, es limita al vostre perfil i, si la revoqueu al Poznote, l'extensió queda desconnectada sense canviar res més. Vegeu [Contrasenyes d'aplicació](README.ca.md#contrasenyes-daplicació) per a la llista completa de límits.

> **Si la vostra instància només fa servir SSO,** una contrasenya d'aplicació és l'única manera de connectar l'extensió: el formulari d'inici de sessió que necessita l'extensió no existeix per al vostre compte. Creeu-ne una des de **Paràmetres > Contrasenyes d'aplicació** tal com s'ha explicat més amunt.

## Desament d'una pàgina

Feu clic a la icona de l'extensió a la pàgina que voleu conservar i trieu on va:

- **Nota nova** crea una nota amb el nom de la pàgina, a l'espai de treball i la carpeta triats als paràmetres.
- **Nota existent** afegeix la pàgina al final d'una nota que trieu a la llista, que mostra les notes més recents i les cerca a mesura que escriviu. Llista les notes de l'espai de treball triat als paràmetres; activeu **Tots els espais de treball** per triar una nota de qualsevol lloc. L'extensió recorda aquesta nota per a la pàgina següent, de manera que recollir enllaços en una sola llista de lectura costa un clic per pàgina. Les notes HTML i Markdown poden rebre pàgines.

Després, feu clic a **Desa l'enllaç** per desar l'adreça de la pàgina, o a **Captura de pantalla** per desar l'adreça seguida d'una imatge de la part visible de la pàgina. La confirmació inclou un enllaç que obre la nota al Poznote.
