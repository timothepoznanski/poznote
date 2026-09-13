<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Poznote Chrome-Erweiterung

Der **Poznote URL Saver** ist eine Browsererweiterung, mit der Sie die URL oder sogar einen ganzseitigen Screenshot der aktuellen Seite mit einem einzigen Klick in Ihrer Poznote-Instanz speichern können.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Installieren Sie die Erweiterung direkt aus dem Chrome Web Store: [Erweiterung installieren](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Mit Ihrer Instanz verbinden

1. Öffnen Sie in Poznote **Einstellungen > App-Passwörter**, erstellen Sie eines, das Sie nach der Erweiterung benennen, und kopieren Sie das angezeigte Geheimnis. Es wird nur ein einziges Mal angezeigt.
2. Öffnen Sie die Erweiterung und füllen Sie aus:
   - **App URL:** die Adresse Ihrer Instanz, z. B. `https://notes.example.com/`
   - **Username:** Ihr Poznote-Benutzername
   - **Password:** das soeben kopierte App-Passwort
   - **Workspace** und optional **Folder**: wo gespeicherte Seiten abgelegt werden sollen
3. Speichern Sie. Die Erweiterung ermittelt Ihr Profil selbst und ist einsatzbereit.

Ihr Kontopasswort funktioniert hier ebenfalls, doch für eine Erweiterung ist ein App-Passwort die bessere Wahl: Es erreicht nur die API, nie die Weboberfläche oder Ihre Kontoeinstellungen, es ist auf Ihr eigenes Profil beschränkt, und wenn Sie es in Poznote widerrufen, ist die Erweiterung getrennt, ohne dass sich sonst etwas ändert. Die vollständige Liste der Einschränkungen finden Sie unter [App-Passwörter](../README.de.md#app-passwörter).

> **Wenn Ihre Instanz nur SSO erlaubt,** ist ein App-Passwort die einzige Möglichkeit, die Erweiterung zu verbinden: Das Anmeldeformular, das die Erweiterung benötigt, existiert für Ihr Konto nicht. Erstellen Sie eines unter **Einstellungen > App-Passwörter**, genau wie oben beschrieben.
