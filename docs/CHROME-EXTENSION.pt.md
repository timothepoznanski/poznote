<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <b>Português</b> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <a href="CHROME-EXTENSION.ko.md">한국어</a> ·
  <a href="CHROME-EXTENSION.ja.md">日本語</a> ·
  <a href="CHROME-EXTENSION.ca.md">Català</a>
</p>
<!-- /lang-selector -->

# Extensão do Chrome do Poznote

O **Poznote URL Saver** é uma extensão de navegador que salva a página atual na sua instância do Poznote com um clique: o endereço, sozinho ou seguido de uma captura de tela, em uma nota nova ou no fim de uma nota que você já tem.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Instale a extensão diretamente pela Chrome Web Store: [Instalar a extensão](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## Conectar a extensão à sua instância

1. No Poznote, abra **Configurações > Senhas de aplicativo**, crie uma com o nome da extensão e copie o segredo exibido. Ele aparece uma única vez.
2. Clique no ícone da extensão e depois em **Connect**. A página de configurações dela abre em uma aba.
3. Preencha o **Poznote address** (por exemplo `https://notes.example.com`), o seu **Username** e o **App password** que você acabou de copiar, clique em **Connect** e permita que a extensão acesse a sua instância quando o Chrome pedir.
4. Escolha o **Workspace** e, opcionalmente, o **Folder** onde as notas novas devem ficar. A escolha é salva na hora.

Para mudar essas configurações depois, clique na engrenagem no topo da extensão.

O endereço da sua instância, exibido ao lado, é um link: clique nele para abrir o Poznote em uma nova aba, por http ou https, como você o digitou nas configurações.

A extensão usa o idioma do Chrome quando ele é inglês, francês, alemão, espanhol, português, russo, coreano, chinês simplificado, japonês ou catalão, e inglês nos demais casos.

A senha da sua conta também funciona aqui, mas uma senha de aplicativo é a credencial mais adequada para uma extensão: ela só acessa a API, nunca a interface web nem as configurações da sua conta, fica limitada ao seu próprio perfil, e revogá-la no Poznote desconecta a extensão sem alterar mais nada. Veja [Senhas de aplicativo](README.pt.md#senhas-de-aplicativo) para a lista completa de limites.

> **Se a sua instância é apenas SSO,** uma senha de aplicativo é a única forma de conectar a extensão: o formulário de login de que a extensão precisa não existe para a sua conta. Crie uma em **Configurações > Senhas de aplicativo** exatamente como descrito acima.

## Salvar uma página

Clique no ícone da extensão na página que você quer guardar e escolha o destino:

- **New note** cria uma nota com o nome da página, no espaço de trabalho e na pasta escolhidos nas configurações.
- **Existing note** adiciona a página no fim de uma nota escolhida na lista, que mostra as suas notas mais recentes e as pesquisa enquanto você digita. Ela mostra as notas do espaço de trabalho escolhido nas configurações; ative **All workspaces** para escolher uma nota de qualquer espaço. A extensão lembra dessa nota para a próxima página, então juntar links em uma mesma lista de leitura leva um clique por página. Notas HTML e Markdown podem receber páginas.

Depois clique em **Save link** para salvar o endereço da página, ou em **Screenshot** para salvar o endereço seguido de uma imagem da parte visível da página. A confirmação traz um link que abre a nota no Poznote.
