<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <a href="CHROME-EXTENSION.ko.md">한국어</a>
</p>
<!-- /lang-selector -->

# Extensión de Chrome de Poznote

**Poznote URL Saver** es una extensión de navegador que guarda la página actual en tu instancia de Poznote con un clic: su dirección, sola o seguida de una captura de pantalla, en una nota nueva o al final de una nota que ya tienes.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Instala la extensión directamente desde Chrome Web Store: [Instalar la extensión](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Conectarla a tu instancia

1. En Poznote, abre **Configuración > Contraseñas de aplicación**, crea una con el nombre de la extensión y copia el secreto que muestra. Solo se muestra una vez.
2. Haz clic en el icono de la extensión y luego en **Connect**. Su página de ajustes se abre en una pestaña.
3. Rellena la **Poznote address** (por ejemplo `https://notes.example.com`), tu **Username** y el **App password** que acabas de copiar, haz clic en **Connect** y permite que la extensión acceda a tu instancia cuando Chrome lo pida.
4. Elige el **Workspace** y, opcionalmente, el **Folder** donde deben ir las notas nuevas. La elección se guarda al momento.

Para cambiar estos ajustes más adelante, haz clic en el engranaje de la parte superior de la extensión.

La dirección de tu instancia, que aparece al lado, es un enlace: haz clic en ella para abrir Poznote en una pestaña nueva, por http o https tal como la escribiste en los ajustes.

La extensión usa el idioma de Chrome si es inglés, francés, alemán, español, portugués, ruso, coreano o chino simplificado, y el inglés en los demás casos.

La contraseña de tu cuenta también funciona aquí, pero una contraseña de aplicación es la mejor credencial para una extensión: solo accede a la API, nunca a la interfaz web ni a los ajustes de tu cuenta, está limitada a tu propio perfil, y revocarla en Poznote desconecta la extensión sin cambiar nada más. Consulta [Contraseñas de aplicación](README.es.md#contraseñas-de-aplicación) para ver la lista completa de límites.

> **Si tu instancia es solo SSO,** una contraseña de aplicación es la única forma de conectar la extensión: el formulario de inicio de sesión que necesita la extensión no existe para tu cuenta. Crea una desde **Configuración > Contraseñas de aplicación** exactamente como se indica arriba.

## Guardar una página

Haz clic en el icono de la extensión en la página que quieres conservar y elige su destino:

- **New note** crea una nota con el nombre de la página, en el espacio de trabajo y la carpeta elegidos en los ajustes.
- **Existing note** añade la página al final de una nota que eliges en la lista, que muestra tus últimas notas y las busca mientras escribes. Muestra las notas del espacio de trabajo elegido en los ajustes; activa **All workspaces** para elegir una nota de cualquier espacio. La extensión recuerda esa nota para la siguiente página, así que reunir enlaces en una misma lista de lectura cuesta un clic por página. Las notas HTML y Markdown pueden recibir páginas.

Después haz clic en **Save link** para guardar la dirección de la página, o en **Screenshot** para guardar la dirección seguida de una imagen de la parte visible de la página. La confirmación incluye un enlace que abre la nota en Poznote.
