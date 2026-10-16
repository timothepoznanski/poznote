<!-- lang-selector -->
<p align="center">
  <a href="CHROME-EXTENSION.md">English</a> ·
  <a href="CHROME-EXTENSION.fr.md">Français</a> ·
  <a href="CHROME-EXTENSION.de.md">Deutsch</a> ·
  <a href="CHROME-EXTENSION.es.md">Español</a> ·
  <a href="CHROME-EXTENSION.pt.md">Português</a> ·
  <a href="CHROME-EXTENSION.ru.md">Русский</a> ·
  <a href="CHROME-EXTENSION.zh-cn.md">简体中文</a> ·
  <b>한국어</b>
</p>
<!-- /lang-selector -->

# Poznote Chrome 확장 프로그램

**Poznote URL Saver**는 현재 페이지를 클릭 한 번으로 Poznote 인스턴스에 저장하는 브라우저 확장 프로그램입니다. 페이지 주소만, 또는 주소와 스크린샷을 새 노트로 저장하거나 기존 노트의 끝에 추가할 수 있습니다.

<p align="center">
  <img src="../images/chrome-extension.png" alt="Poznote Chrome Extension" width="50%">
</p>

Chrome 웹 스토어에서 바로 설치하세요: [확장 프로그램 설치](https://chromewebstore.google.com/detail/bmjclfamahegmgillaghhmnbkjebipbh?utm_source=item-share-cb)

## 인스턴스 연결

1. Poznote의 **설정 > 앱 비밀번호**에서 확장 프로그램 이름으로 앱 비밀번호를 만들고 표시된 비밀번호를 복사하세요. 한 번만 표시됩니다.
2. 확장 프로그램 아이콘을 클릭한 다음 **Connect**를 클릭하세요. 설정 페이지가 새 탭에서 열립니다.
3. **Poznote address**(예: `https://notes.example.com`), **Username**, 방금 복사한 **App password**를 입력하고 **Connect**를 클릭한 뒤, Chrome이 묻는 경우 확장 프로그램이 인스턴스에 접근하도록 허용하세요.
4. 새 노트를 저장할 **Workspace**와, 필요하면 **Folder**를 선택하세요. 선택하는 즉시 저장됩니다.

나중에 설정을 바꾸려면 확장 프로그램 상단의 톱니바퀴 아이콘을 클릭하세요.

계정 비밀번호도 사용할 수 있지만 확장 프로그램에는 앱 비밀번호를 권장합니다. API에만 접근할 수 있고 웹 화면이나 계정 설정에는 접근하지 못하며, 본인 프로필로 범위가 제한됩니다. Poznote에서 앱 비밀번호를 폐기하면 다른 설정을 바꾸지 않고 연결을 끊을 수 있습니다. 전체 제한 사항은 [앱 비밀번호](README.ko.md#앱-비밀번호)를 확인하세요.

> **SSO 전용 인스턴스에서는** 앱 비밀번호로만 확장 프로그램을 연결할 수 있습니다. 확장 프로그램에 필요한 로그인 양식이 계정에 없기 때문입니다. 위 설명대로 **설정 > 앱 비밀번호**에서 생성하세요.

## 페이지 저장

보관할 페이지에서 확장 프로그램 아이콘을 클릭하고 저장 위치를 고르세요.

- **New note**는 설정에서 고른 작업 공간과 폴더에 페이지 이름으로 새 노트를 만듭니다.
- **Existing note**는 목록에서 고른 노트의 끝에 페이지를 추가합니다. 목록에는 최근 노트가 표시되며 입력하는 대로 검색됩니다. 설정에서 고른 작업 공간의 노트만 표시되며, **All workspaces**를 켜면 모든 작업 공간에서 노트를 고를 수 있습니다. 확장 프로그램이 이 노트를 다음 페이지에도 기억하므로, 하나의 읽기 목록에 링크를 모으는 데 페이지마다 클릭 한 번이면 됩니다. HTML 노트와 Markdown 노트에 페이지를 추가할 수 있습니다.

그런 다음 **Save link**를 클릭하면 페이지 주소가 저장되고, **Screenshot**을 클릭하면 주소 아래에 페이지에서 보이는 부분의 이미지가 저장됩니다. 확인 메시지에 있는 링크로 Poznote에서 노트를 열 수 있습니다.
