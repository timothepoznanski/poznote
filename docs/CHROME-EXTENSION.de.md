<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <a href="CHROME-EXTENSION.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Poznote Chrome-Erweiterung

**Poznote URL Saver** ist eine Browsererweiterung, die die aktuelle Seite mit einem Klick in Ihrer Poznote-Instanz speichert: ihre Adresse, allein oder mit einem Screenshot, als neue Notiz oder am Ende einer bestehenden Notiz.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Installieren Sie die Erweiterung direkt aus dem Chrome Web Store: [Erweiterung installieren](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Mit Ihrer Instanz verbinden

1. Öffnen Sie in Poznote **Einstellungen > App-Passwörter**, erstellen Sie eines, das Sie nach der Erweiterung benennen, und kopieren Sie das angezeigte Geheimnis. Es wird nur ein einziges Mal angezeigt.
2. Klicken Sie auf das Symbol der Erweiterung und dann auf **Connect**. Ihre Einstellungsseite öffnet sich in einem Tab.
3. Geben Sie die **Poznote address** (z. B. `https://notes.example.com`), Ihren **Username** und das soeben kopierte **App password** ein, klicken Sie auf **Connect** und erlauben Sie der Erweiterung den Zugriff auf Ihre Instanz, wenn Chrome danach fragt.
4. Wählen Sie den **Workspace** und optional den **Folder**, in dem neue Notizen landen sollen. Die Auswahl wird sofort gespeichert.

Um diese Einstellungen später zu ändern, klicken Sie oben in der Erweiterung auf das Zahnradsymbol.

Die Adresse Ihrer Instanz daneben ist ein Link: Ein Klick öffnet Poznote in einem neuen Tab, über http oder https, so wie Sie die Adresse in den Einstellungen eingegeben haben.

Die Erweiterung erscheint in der Sprache von Chrome, wenn diese Englisch, Französisch, Deutsch, Spanisch, Portugiesisch, Russisch, Koreanisch oder vereinfachtes Chinesisch ist, sonst auf Englisch.

Ihr Kontopasswort funktioniert hier ebenfalls, doch für eine Erweiterung ist ein App-Passwort die bessere Wahl: Es erreicht nur die API, nie die Weboberfläche oder Ihre Kontoeinstellungen, es ist auf Ihr eigenes Profil beschränkt, und wenn Sie es in Poznote widerrufen, ist die Erweiterung getrennt, ohne dass sich sonst etwas ändert. Die vollständige Liste der Einschränkungen finden Sie unter [App-Passwörter](README.de.md#app-passwörter).

> **Wenn Ihre Instanz nur SSO erlaubt,** ist ein App-Passwort die einzige Möglichkeit, die Erweiterung zu verbinden: Das Anmeldeformular, das die Erweiterung benötigt, existiert für Ihr Konto nicht. Erstellen Sie eines unter **Einstellungen > App-Passwörter**, genau wie oben beschrieben.

## Eine Seite speichern

Klicken Sie auf der Seite, die Sie behalten möchten, auf das Symbol der Erweiterung und wählen Sie das Ziel:

- **New note** erstellt eine Notiz mit dem Namen der Seite, im Arbeitsbereich und Ordner aus den Einstellungen.
- **Existing note** fügt die Seite am Ende einer Notiz ein, die Sie in der Liste auswählen. Die Liste zeigt Ihre neuesten Notizen und durchsucht sie während der Eingabe. Sie enthält die Notizen des in den Einstellungen gewählten Arbeitsbereichs; aktivieren Sie **All workspaces**, um eine Notiz aus jedem Arbeitsbereich zu wählen. Die Erweiterung merkt sich diese Notiz für die nächste Seite, sodass das Sammeln von Links in einer Leseliste nur einen Klick pro Seite braucht. HTML- und Markdown-Notizen können Seiten aufnehmen.

Klicken Sie dann auf **Save link**, um die Adresse der Seite zu speichern, oder auf **Screenshot**, um die Adresse gefolgt von einem Bild des sichtbaren Seitenbereichs zu speichern. Die Bestätigung enthält einen Link, der die Notiz in Poznote öffnet.
