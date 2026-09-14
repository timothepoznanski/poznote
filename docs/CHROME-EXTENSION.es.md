<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <b>Español</b> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Extensión de Chrome de Poznote

**Poznote URL Saver** es una extensión del navegador que te permite guardar rápidamente en tu instancia de Poznote, con un solo clic, la URL o incluso una captura de pantalla completa de la página actual.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Instala la extensión directamente desde Chrome Web Store: [Instalar la extensión](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Conectarla a tu instancia

1. En Poznote, abre **Configuración > Contraseñas de aplicación**, crea una con el nombre de la extensión y copia el secreto que muestra. Solo se muestra una vez.
2. Abre la extensión y rellena:
   - **App URL:** la dirección de tu instancia, por ejemplo `https://notes.example.com/`
   - **Username:** tu nombre de usuario de Poznote
   - **Password:** la contraseña de aplicación que acabas de copiar
   - **Workspace** y, opcionalmente, **Folder**: dónde deben ir las páginas guardadas
3. Guarda. La extensión encuentra tu perfil por sí sola y está lista para usarse.

La contraseña de tu cuenta también funciona aquí, pero una contraseña de aplicación es la mejor credencial para una extensión: solo accede a la API, nunca a la interfaz web ni a los ajustes de tu cuenta, está limitada a tu propio perfil, y revocarla en Poznote desconecta la extensión sin cambiar nada más. Consulta [Contraseñas de aplicación](README.es.md#contraseñas-de-aplicación) para ver la lista completa de límites.

> **Si tu instancia es solo SSO,** una contraseña de aplicación es la única forma de conectar la extensión: el formulario de inicio de sesión que necesita la extensión no existe para tu cuenta. Crea una desde **Configuración > Contraseñas de aplicación** exactamente como se indica arriba.
