<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <b>Français</b> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Extension Chrome Poznote

**Poznote URL Saver** est une extension de navigateur qui vous permet d'enregistrer rapidement, en un seul clic, l'URL ou même une capture pleine page de la page courante dans votre instance Poznote.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Installez l'extension directement depuis le Chrome Web Store : [Installer l'extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Connecter l'extension à votre instance

1. Dans Poznote, ouvrez **Paramètres > Mots de passe d'application**, créez-en un portant le nom de l'extension et copiez le secret affiché. Il n'est affiché qu'une seule fois.
2. Ouvrez l'extension, puis renseignez :
   - **App URL :** l'adresse de votre instance, par exemple `https://notes.example.com/`
   - **Username :** votre nom d'utilisateur Poznote
   - **Password :** le mot de passe d'application que vous venez de copier
   - **Workspace**, et éventuellement **Folder** : l'espace de travail et le dossier où les pages enregistrées doivent arriver
3. Enregistrez. L'extension retrouve votre profil toute seule et elle est prête à l'emploi.

Le mot de passe de votre compte fonctionne aussi ici, mais un mot de passe d'application est un meilleur choix pour une extension : il n'atteint que l'API, jamais l'interface web ni les paramètres de votre compte, il est limité à votre propre profil, et le révoquer dans Poznote coupe l'accès de l'extension sans rien changer d'autre. Consultez [Mots de passe d'application](README.fr.md#mots-de-passe-dapplication) pour la liste complète des limites.

> **Si votre instance est en SSO uniquement,** un mot de passe d'application est le seul moyen de connecter l'extension : le formulaire de connexion dont l'extension a besoin n'existe pas pour votre compte. Créez-en un depuis **Paramètres > Mots de passe d'application** exactement comme ci-dessus.
