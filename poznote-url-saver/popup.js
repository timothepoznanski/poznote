document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const workspaceSelect = document.getElementById('workspaceSelect');
  const folderSelect = document.getElementById('folderSelect');
  const fetchWorkspacesBtn = document.getElementById('fetchWorkspaces');
  const loadFoldersBtn = document.getElementById('loadFolders');
  let config = {};

  // Load saved configuration
  chrome.storage.local.get(['poznoteConfig'], (result) => {
    if (result.poznoteConfig) {
      config = result.poznoteConfig;
      document.getElementById('appUrl').value = config.appUrl || '';
      document.getElementById('username').value = config.username || '';
      document.getElementById('password').value = config.password || '';

      if (config.workspace) {
        let exists = false;
        for (let i = 0; i < workspaceSelect.options.length; i++) {
          if (workspaceSelect.options[i].value === config.workspace) {
            exists = true;
            break;
          }
        }
        if (!exists && config.workspace !== 'Poznote') {
          workspaceSelect.add(new Option(config.workspace, config.workspace));
        }
        workspaceSelect.value = config.workspace;
      }

      if (config.folder) {
        let exists = false;
        const val = config.folder_id || config.folder;
        for (let i = 0; i < folderSelect.options.length; i++) {
          if (folderSelect.options[i].value == val) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          const opt = new Option(`📁 ${config.folder}`, val);
          opt.dataset.path = config.folder;
          folderSelect.add(opt);
        }
        folderSelect.value = val;
      }
    }
  });

  async function resolveProfileId(tempConfig) {
    const profiles = await chrome.runtime.sendMessage({ type: 'listProfiles', config: tempConfig });
    if (profiles.error) throw new Error(profiles.error);

    const targetUsername = tempConfig.username.toLowerCase();
    const profile = profiles.find(p => p.username.toLowerCase() === targetUsername || p.email?.toLowerCase() === targetUsername);

    if (!profile) {
      throw new Error(`Profile not found for user "${tempConfig.username}"`);
    }
    return profile.id;
  }

  // Fetch Workspaces
  fetchWorkspacesBtn.addEventListener('click', async () => {
    let rawUrl = document.getElementById('appUrl').value.trim().replace(/\/+$/, '');
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;

    const tempConfig = {
      appUrl: rawUrl,
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value.trim()
    };

    if (!tempConfig.appUrl || !tempConfig.username || !tempConfig.password) {
      status.textContent = '⚠️ URL, Username and Password are required!';
      status.style.color = 'red';
      return;
    }

    status.textContent = '⏳ Fetching workspaces...';
    status.style.color = 'orange';

    try {
      // Step 1: Resolve Profile ID automatically
      const userId = await resolveProfileId(tempConfig);
      tempConfig.userId = userId;

      // Step 2: Fetch Workspaces
      const response = await chrome.runtime.sendMessage({ type: 'listWorkspaces', config: tempConfig });

      if (response.error) {
        status.textContent = '❌ Error: ' + response.error;
        status.style.color = 'red';
        return;
      }

      workspaceSelect.innerHTML = '';
      if (Array.isArray(response)) {
        response.forEach(ws => {
          const val = ws.name || ws;
          workspaceSelect.add(new Option(val, val));
        });
        status.textContent = '✅ Workspaces fetched!';
        status.style.color = 'green';

        // Temporarily store userId in config object for Save button
        config.userId = userId;
      } else {
        status.textContent = '❌ Invalid API response';
        status.style.color = 'red';
      }
    } catch (e) {
      status.textContent = '❌ Error: ' + e.message;
      status.style.color = 'red';
    }
  });

  // Save Configuration
  document.getElementById('saveConfig').addEventListener('click', async () => {
    let rawUrl = document.getElementById('appUrl').value.trim().replace(/\/+$/, '');
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!rawUrl || !username || !password) {
      status.textContent = '⚠️ All fields are required!';
      status.style.color = 'red';
      return;
    }

    status.textContent = '⏳ Saving configuration...';
    status.style.color = 'orange';

    try {
      // Ensure we have the userId
      const tempConfig = { appUrl: rawUrl, username, password };
      const userId = await resolveProfileId(tempConfig);

      const selectedOption = folderSelect.options[folderSelect.selectedIndex];
      const folderPath = selectedOption ? (selectedOption.dataset.path || selectedOption.text.replace(/^📁 /, '')) : '';

      config = {
        appUrl: rawUrl,
        username,
        password,
        userId: userId,
        workspace: workspaceSelect.value,
        folder: folderPath,
        folder_id: folderSelect.value
      };

      chrome.storage.local.set({ poznoteConfig: config }, () => {
        status.textContent = '✅ Configuration saved!';
        status.style.color = 'green';
        document.getElementById('appUrl').value = config.appUrl;
      });
    } catch (e) {
      status.textContent = '❌ Error: ' + e.message;
      status.style.color = 'red';
    }
  });

  // Load Folders
  loadFoldersBtn.addEventListener('click', async () => {
    let rawUrl = document.getElementById('appUrl').value.trim().replace(/\/+$/, '');
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!rawUrl || !username || !password) {
      status.textContent = '⚠️ URL, Username and Password are required!';
      status.style.color = 'red';
      return;
    }

    status.textContent = '⏳ Loading folders...';
    status.style.color = 'orange';

    try {
      // Step 1: Resolve Profile ID if not already known
      let userId = config.userId;
      if (!userId) {
        userId = await resolveProfileId({ appUrl: rawUrl, username, password });
        config.userId = userId; // Store for this session
      }

      // Step 2: Load Folders
      const tempConfig = {
        appUrl: rawUrl,
        username,
        password,
        userId,
        workspace: workspaceSelect.value
      };

      const response = await chrome.runtime.sendMessage({ type: 'loadFolders', config: tempConfig });

      if (response.error) {
        status.textContent = '❌ Error: ' + response.error;
        status.style.color = 'red';
        return;
      }

      const currentFolder = folderSelect.value;
      folderSelect.innerHTML = '<option value="">📁 Root (No Folder)</option>';

      let count = 0;
      function addFolders(folders) {
        if (!folders) return;
        const folderList = Array.isArray(folders) ? folders : Object.values(folders);
        folderList.forEach(folder => {
          const name = folder.path || folder.name;
          const option = new Option(`📁 ${name}`, folder.id);
          option.dataset.path = name;
          folderSelect.add(option);
          count++;
          if (folder.children) addFolders(folder.children);
        });
      }

      addFolders(response);

      // Restore previous selection if it still exists
      if (currentFolder) {
        folderSelect.value = currentFolder;
      }

      status.textContent = `✅ ${count} folder(s) loaded!`;
      status.style.color = 'green';
    } catch (error) {
      status.textContent = '❌ Error: ' + error.message;
      status.style.color = 'red';
      console.error(error);
    }
  });

  // Save Note
  document.getElementById('saveNote').addEventListener('click', async () => {
    await saveToNote('url');
  });

  // Save Screenshot
  document.getElementById('saveScreenshot').addEventListener('click', async () => {
    await saveToNote('screenshot');
  });

  async function saveToNote(contentType) {
    const selectedFolder = folderSelect.value;

    let rawUrl = document.getElementById('appUrl').value.trim().replace(/\/+$/, '');
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!rawUrl || !username || !password) {
      status.textContent = '⚠️ URL, Username and Password are required!';
      status.style.color = 'red';
      return;
    }

    status.textContent = '⏳ Preparing note...';
    status.style.color = 'orange';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        status.textContent = '❌ Could not access current tab.';
        status.style.color = 'red';
        return;
      }

      // Ensure we have the userId
      let userId = config.userId;
      if (!userId || config.username !== username || config.appUrl !== rawUrl) {
        userId = await resolveProfileId({ appUrl: rawUrl, username, password });
        config.userId = userId;
        config.appUrl = rawUrl;
        config.username = username;
        config.password = password;
      }

      const tempConfig = { appUrl: rawUrl, username, password, userId };
      const pageTitle = tab.title || 'Untitled Page';
      const pageUrl = tab.url;
      
      let noteContent = '';
      let contentDescription = '';
      
      if (contentType === 'url') {
        noteContent = `<a href="${pageUrl}" target="_blank">${pageUrl}</a>`;
        contentDescription = 'URL';
      } else if (contentType === 'screenshot') {
        status.textContent = '📸 Capturing screenshot...';
        try {
          const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
          noteContent = `<p><a href="${pageUrl}" target="_blank">${pageUrl}</a></p><br><p><img src="${screenshot}" alt="Page Screenshot" style="max-width: 100%; height: auto;" /></p>`;
          contentDescription = 'Screenshot';
        } catch (error) {
          status.textContent = '❌ Screenshot failed: ' + error.message;
          status.style.color = 'red';
          return;
        }
      }

      const selectedOption = folderSelect.options[folderSelect.selectedIndex];
      const selectedFolderName = selectedFolder ? (selectedOption.dataset.path || selectedOption.text.replace(/^📁 /, '')) : '';

      const noteData = {
        heading: `🔗 ${pageTitle}${contentDescription ? ' - ' + contentDescription : ''}`,
        content: noteContent,
        tags: '',
        folder_name: selectedFolderName,
        folder_id: selectedFolder,
        workspace: workspaceSelect.value || config.workspace || 'Poznote'
      };

      status.textContent = `Creating note with ${contentDescription}...`;
      const response = await chrome.runtime.sendMessage({ type: 'createNote', config: tempConfig, noteData });

      if (response.error) {
        status.textContent = '❌ Failed: ' + response.error;
        status.style.color = 'red';
      } else {
        status.textContent = '💾 Note created successfully!';
        status.style.color = 'green';
      }
    } catch (error) {
      status.textContent = '❌ Error: ' + error.message;
      status.style.color = 'red';
      console.error(error);
    }
  }
});
