<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a>
</p>
<!-- /lang-selector -->

# Extensão do Chrome do Poznote

O **Poznote URL Saver** é uma extensão de navegador que permite salvar rapidamente, com um único clique, a URL ou até uma captura de tela da página inteira atual na sua instância do Poznote.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Instale a extensão diretamente pela Chrome Web Store: [Instalar a extensão](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Conectar a extensão à sua instância

1. No Poznote, abra **Configurações > Senhas de aplicativo**, crie uma com o nome da extensão e copie o segredo exibido. Ele aparece uma única vez.
2. Abra a extensão e preencha:
   - **App URL:** o endereço da sua instância, por exemplo `https://notes.example.com/`
   - **Username:** o seu nome de usuário do Poznote
   - **Password:** a senha de aplicativo que você acabou de copiar
   - **Workspace** e, opcionalmente, **Folder**: onde as páginas salvas devem ficar
3. Salve. A extensão identifica seu perfil sozinha e fica pronta para uso.

A senha da sua conta também funciona aqui, mas uma senha de aplicativo é a credencial mais adequada para uma extensão: ela só acessa a API, nunca a interface web nem as configurações da sua conta, fica limitada ao seu próprio perfil, e revogá-la no Poznote desconecta a extensão sem alterar mais nada. Veja [Senhas de aplicativo](../README.pt.md#senhas-de-aplicativo) para a lista completa de limites.

> **Se a sua instância é apenas SSO,** uma senha de aplicativo é a única forma de conectar a extensão: o formulário de login de que a extensão precisa não existe para a sua conta. Crie uma em **Configurações > Senhas de aplicativo** exatamente como descrito acima.
