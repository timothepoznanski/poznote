<!-- lang-selector -->
<p align="center">
  <b>English</b> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote Chrome Extension

The **Poznote URL Saver** is a browser extension that allows you to quickly save the URL or even a full-page screenshot of the current page to your Poznote instance with a single click.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Install the extension directly from the Chrome Web Store: [Install extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Connecting it to your instance

1. In Poznote, open **Settings > App passwords**, create one named after the extension, and copy the secret it shows. It is displayed once.
2. Open the extension, then fill in:
   - **App URL:** the address of your instance, e.g. `https://notes.example.com/`
   - **Username:** your Poznote username
   - **Password:** the app password you just copied
   - **Workspace**, and optionally a **Folder**, where saved pages should land
3. Save. The extension resolves your profile by itself and is ready to use.

Your account password works here too, but an app password is the better credential for an extension: it reaches the API only, never the web interface or your account settings, it is limited to your own profile, and revoking it in Poznote cuts the extension off without changing anything else. See [App Passwords](../README.md#app-passwords) for the full list of limits.

> **If your instance is SSO-only,** an app password is the only way to connect the extension: the sign-in form the extension needs does not exist for your account. Create one from **Settings > App passwords** exactly as above.
