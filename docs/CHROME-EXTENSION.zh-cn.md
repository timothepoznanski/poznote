<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <b>简体中文</b>
</p>
<!-- /lang-selector -->

# Poznote Chrome 扩展

**Poznote URL Saver** 是一款浏览器扩展，只需点击一下，即可将当前页面的 URL 甚至整页截图快速保存到您的 Poznote 实例。

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

直接从 Chrome 网上应用店安装该扩展：[安装扩展](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## 将扩展连接到您的实例

1. 在 Poznote 中打开 **设置 > 应用密码**，创建一个以该扩展命名的应用密码，并复制显示的密钥。密钥只显示一次。
2. 打开扩展，然后填写：
   - **应用 URL：** 您实例的地址，例如 `https://notes.example.com/`
   - **用户名：** 您的 Poznote 用户名
   - **密码：** 您刚刚复制的应用密码
   - **工作区**，以及可选的**文件夹**：保存的页面将存放在这里
3. 保存。扩展会自行识别您的资料，随即可以使用。

这里也可以使用您的账户密码，但对于扩展来说，应用密码是更合适的凭据：它只能访问 API，永远无法进入网页界面或您的账户设置，仅限于您自己的资料，而且在 Poznote 中撤销它即可切断扩展的访问，不会影响其他任何东西。完整的限制列表请参阅[应用密码](../README.zh-cn.md#应用密码)。

> **如果您的实例仅支持 SSO**，应用密码是连接扩展的唯一方式：扩展所需的登录表单对您的账户并不存在。请按照上述步骤，在 **设置 > 应用密码** 中创建一个。
