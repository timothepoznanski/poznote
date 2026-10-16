<!-- lang-selector -->
<p align="center">
  <b>English</b> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <a href="CHROME-EXTENSION.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Poznote Chrome Extension

The **Poznote URL Saver** is a browser extension that saves the current page to your Poznote instance in one click: its link with its preview picture, or a screenshot, as a new note or at the end of a note you already have.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Install the extension directly from the Chrome Web Store: [Install extension](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Connecting it to your instance

1. In Poznote, open **Settings > App passwords**, create one named after the extension, and copy the secret it shows. It is displayed once.
2. Click the extension's icon, then **Connect**. Its settings page opens in a tab.
3. Fill in the **Poznote address** (e.g. `https://notes.example.com`), your **Username** and the **App password** you just copied, then click **Connect** and allow the extension to reach your instance when Chrome asks.
4. Pick the **Workspace**, and optionally the **Folder**, where new notes should land. The choice is saved as you make it.

To change any of this later, click the gear icon at the top of the extension.

Your account password works here too, but an app password is the better credential for an extension: it reaches the API only, never the web interface or your account settings, it is limited to your own profile, and revoking it in Poznote cuts the extension off without changing anything else. See [App Passwords](../README.md#app-passwords) for the full list of limits.

> **If your instance is SSO-only,** an app password is the only way to connect the extension: the sign-in form the extension needs does not exist for your account. Create one from **Settings > App passwords** exactly as above.

## Saving a page

Click the extension's icon on the page you want to keep, then choose where it goes:

- **New note** creates a note named after the page, in the workspace and folder picked in the settings.
- **Existing note** adds the page at the end of a note you pick in the list, which shows your latest notes and searches them as you type. The extension remembers that note for the next page, so collecting links in a single reading list takes one click per page. HTML and Markdown notes can receive pages.

Then click **Save link** to save the link with the page's preview picture when the page has one, or **Screenshot** to save the link with a picture of the visible part of the page. The confirmation has a link that opens the note in Poznote.
