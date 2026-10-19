<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <b>Français</b> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <a href="CHROME-EXTENSION.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Extension Chrome Poznote

**Poznote URL Saver** est une extension de navigateur qui enregistre la page courante dans votre instance Poznote en un clic : son adresse, seule ou suivie d'une capture d'écran, dans une nouvelle note ou à la fin d'une note existante.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Installez l'extension directement depuis le Chrome Web Store : [Installer l'extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Connecter l'extension à votre instance

1. Dans Poznote, ouvrez **Paramètres > Mots de passe d'application**, créez-en un portant le nom de l'extension et copiez le secret affiché. Il n'est affiché qu'une seule fois.
2. Cliquez sur l'icône de l'extension, puis sur **Connect**. Sa page de réglages s'ouvre dans un onglet.
3. Renseignez la **Poznote address** (par exemple `https://notes.example.com`), votre **Username** et l'**App password** que vous venez de copier, puis cliquez sur **Connect** et autorisez l'extension à joindre votre instance quand Chrome le demande.
4. Choisissez le **Workspace**, et éventuellement le **Folder**, où les nouvelles notes doivent arriver. Le choix est enregistré aussitôt.

Pour modifier ces réglages plus tard, cliquez sur la roue dentée en haut de l'extension.

L'adresse de votre instance, affichée juste à côté, est un lien : cliquez dessus pour ouvrir Poznote dans un nouvel onglet, en http ou en https comme vous l'avez saisie dans les réglages.

L'extension s'affiche dans la langue de Chrome si c'est l'anglais, le français, l'allemand, l'espagnol, le portugais, le russe, le coréen ou le chinois simplifié, et en anglais sinon.

Le mot de passe de votre compte fonctionne aussi ici, mais un mot de passe d'application est un meilleur choix pour une extension : il n'atteint que l'API, jamais l'interface web ni les paramètres de votre compte, il est limité à votre propre profil, et le révoquer dans Poznote coupe l'accès de l'extension sans rien changer d'autre. Consultez [Mots de passe d'application](README.fr.md#mots-de-passe-dapplication) pour la liste complète des limites.

> **Si votre instance est en SSO uniquement,** un mot de passe d'application est le seul moyen de connecter l'extension : le formulaire de connexion dont l'extension a besoin n'existe pas pour votre compte. Créez-en un depuis **Paramètres > Mots de passe d'application** exactement comme ci-dessus.

## Enregistrer une page

Cliquez sur l'icône de l'extension sur la page à garder, puis choisissez sa destination :

- **New note** crée une note qui porte le nom de la page, dans l'espace de travail et le dossier choisis dans les réglages.
- **Existing note** ajoute la page à la fin d'une note choisie dans la liste, qui affiche vos dernières notes et les recherche au fil de la frappe. Elle montre les notes de l'espace de travail choisi dans les réglages ; activez **All workspaces** pour choisir une note dans n'importe quel espace. L'extension retient cette note pour la page suivante : rassembler des liens dans une même liste de lecture ne demande qu'un clic par page. Les notes HTML et Markdown peuvent recevoir des pages.

Cliquez ensuite sur **Save link** pour enregistrer l'adresse de la page, ou sur **Screenshot** pour enregistrer l'adresse suivie d'une image de la partie visible de la page. La confirmation contient un lien qui ouvre la note dans Poznote.
