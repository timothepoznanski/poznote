// ---------------------------------------------------------------------------
// Credential encryption using AES-GCM-256 via the Web Crypto API.
// A random 256-bit key is generated once per installation and stored as raw
// bytes in chrome.storage.local under the '_ek' key. The password is never
// written to storage in plain text — only as a { data, iv } ciphertext pair.
// ---------------------------------------------------------------------------

async function getOrCreateEncryptionKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['_ek'], async (result) => {
      try {
        if (result._ek) {
          const rawKey = new Uint8Array(result._ek);
          const key = await crypto.subtle.importKey(
            'raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
          );
          resolve(key);
        } else {
          const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
          );
          const rawKey = await crypto.subtle.exportKey('raw', key);
          chrome.storage.local.set({ _ek: Array.from(new Uint8Array(rawKey)) }, () => {
            resolve(key);
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function encryptValue(value) {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

async function decryptValue(encrypted) {
  const key = await getOrCreateEncryptionKey();
  const iv = new Uint8Array(atob(encrypted.iv).split('').map(c => c.charCodeAt(0)));
  const data = new Uint8Array(atob(encrypted.data).split('').map(c => c.charCodeAt(0)));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const status = document.getElementById('status');
  const workspaceSelect = document.getElementById('workspaceSelect');
  const folderSelect = document.getElementById('folderSelect');
  const fetchWorkspacesBtn = document.getElementById('fetchWorkspaces');
  const loadFoldersBtn = document.getElementById('loadFolders');

  // Collapsible config panel toggle
  const configToggle = document.getElementById('configToggle');
  const configPanel = document.getElementById('configPanel');
  configToggle.addEventListener('click', () => {
    const isOpen = configPanel.classList.toggle('open');
    configToggle.classList.toggle('open', isOpen);
  });

  // Configuration object stored in memory
  let config = {};

  /**
   * Helper function to normalize and validate URL
   * Removes trailing slashes and adds https:// protocol if missing
   */
  function normalizeUrl(url) {
    let normalized = url.trim().replace(/\/+$/, '');
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  /**
   * Helper function to display status messages to the user
   */
  function showStatus(message, type = 'info') {
    status.textContent = message;
    switch(type) {
      case 'error':
        status.style.color = 'red';
        break;
      case 'success':
        status.style.color = 'green';
        break;
      case 'loading':
        status.style.color = 'orange';
        break;
      default:
        status.style.color = 'black';
    }
  }

  /**
   * Helper function to get current form values
   * Returns a config object with appUrl, username, and password
   */
  function getCurrentFormConfig() {
    return {
      appUrl: normalizeUrl(document.getElementById('appUrl').value),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value.trim()
    };
  }

  /**
   * Helper function to validate required fields
   * Returns true if all required fields are filled
   */
  function validateRequiredFields(formConfig) {
    if (!formConfig.appUrl || !formConfig.username || !formConfig.password) {
      showStatus('⚠️ URL, Username and Password are required!', 'error');
      return false;
    }
    return true;
  }

  /**
   * Load saved configuration from Chrome storage
   * Populates form fields and select elements with saved values
   */
  function enableActionButtons() {
    document.getElementById('saveNote').disabled = false;
    document.getElementById('saveScreenshot').disabled = false;
  }

  chrome.storage.local.get(['poznoteConfig', '_pendingForm'], async (result) => {
    // Restore form fields saved just before a permission dialog (popup may close/reopen)
    const pending = result._pendingForm;
    if (pending) {
      chrome.storage.local.remove('_pendingForm');
      document.getElementById('appUrl').value = pending.appUrl || '';
      document.getElementById('username').value = pending.username || '';
      document.getElementById('password').value = pending.password || '';
    }

    if (result.poznoteConfig) {
      config = result.poznoteConfig;

      if (!pending) {
        // Fill form fields from saved config
        document.getElementById('appUrl').value = config.appUrl || '';
        document.getElementById('username').value = config.username || '';

        // Decrypt password (or migrate legacy plain-text password)
        let decryptedPassword = '';
        if (config.password) {
          if (typeof config.password === 'object' && config.password.data) {
            try {
              decryptedPassword = await decryptValue(config.password);
            } catch (e) {
              console.error('Failed to decrypt stored password:', e);
            }
          } else if (typeof config.password === 'string') {
            // Legacy plain-text — will be encrypted on next Save Configuration
            decryptedPassword = config.password;
          }
        }
        document.getElementById('password').value = decryptedPassword;
        config.password = decryptedPassword; // keep plaintext in memory only
      } else {
        // Use the pending form's plaintext password for this session
        config.password = pending.password || '';
      }

      // Restore workspace selection
      if (config.workspace) {
        const workspaceExists = Array.from(workspaceSelect.options).some(
          option => option.value === config.workspace
        );
        
        if (!workspaceExists && config.workspace !== 'Poznote') {
          workspaceSelect.add(new Option(config.workspace, config.workspace));
        }
        workspaceSelect.value = config.workspace;
      }

      // Restore folder selection
      if (config.folder) {
        const val = config.folder_id || config.folder;
        const folderExists = Array.from(folderSelect.options).some(
          option => option.value == val
        );
        
        if (!folderExists) {
          const opt = new Option(`📁 ${config.folder}`, val);
          opt.dataset.path = config.folder;
          folderSelect.add(opt);
        }
        folderSelect.value = val;
      }

      // Enable action buttons only if a valid config with userId is already saved
      if (config.appUrl && config.username && config.password && config.userId) {
        enableActionButtons();
      }
    }
  });

  /**
   * Resolves the user profile ID from username/email
   * Fetches all profiles and finds the matching one
   */
  async function resolveProfileId(tempConfig) {
    const profiles = await chrome.runtime.sendMessage({ 
      type: 'listProfiles', 
      config: tempConfig 
    });
    
    if (profiles.error) {
      throw new Error(profiles.error);
    }

    const targetUsername = tempConfig.username.toLowerCase();
    const profile = profiles.find(p => 
      p.username.toLowerCase() === targetUsername || 
      p.email?.toLowerCase() === targetUsername
    );

    if (!profile) {
      throw new Error(`Profile not found for user "${tempConfig.username}"`);
    }
    
    return profile.id;
  }

  /**
   * Event handler: Fetch Workspaces button click
   * Fetches available workspaces from the Poznote instance
   */
  fetchWorkspacesBtn.addEventListener('click', async () => {
    const tempConfig = getCurrentFormConfig();

    if (!validateRequiredFields(tempConfig)) {
      return;
    }

    showStatus('⏳ Fetching workspaces...', 'loading');

    try {
      // Save form state before permission dialog (popup may close and reopen)
      await new Promise(resolve => chrome.storage.local.set({
        _pendingForm: { appUrl: tempConfig.appUrl, username: tempConfig.username, password: tempConfig.password }
      }, resolve));

      // Request permission for the Poznote server URL
      const permissionGranted = await requestHostPermission(tempConfig.appUrl);
      chrome.storage.local.remove('_pendingForm');
      if (!permissionGranted) {
        showStatus('❌ Permission denied. Please allow access to your Poznote server.', 'error');
        return;
      }

      // Get user profile ID
      const userId = await resolveProfileId(tempConfig);
      tempConfig.userId = userId;

      // Fetch workspaces from API
      const response = await chrome.runtime.sendMessage({ 
        type: 'listWorkspaces', 
        config: tempConfig 
      });

      if (response.error) {
        showStatus('❌ Error: ' + response.error, 'error');
        return;
      }

      // Populate workspace dropdown
      workspaceSelect.innerHTML = '';
      if (Array.isArray(response)) {
        response.forEach(ws => {
          const val = ws.name || ws;
          workspaceSelect.add(new Option(val, val));
        });
        showStatus('✅ Workspaces fetched!', 'success');

        // Store userId for later use
        config.userId = userId;
      } else {
        showStatus('❌ Invalid API response', 'error');
      }
    } catch (e) {
      showStatus('❌ Error: ' + e.message, 'error');
    }
  });

  /**
   * Request host permission for the configured Poznote server
   * @param {string} appUrl - The Poznote server URL
   * @returns {Promise<boolean>} True if permission granted
   */
  async function requestHostPermission(appUrl) {
    try {
      const url = new URL(appUrl);
      const origin = `${url.protocol}//${url.host}`;
      const pattern = `${origin}/api/v1/*`;

      const granted = await chrome.permissions.request({
        origins: [pattern]
      });

      return granted;
    } catch (e) {
      console.error('Permission request failed:', e);
      return false;
    }
  }

  /**
   * Event handler: Save Configuration button click
   * Saves the current configuration to Chrome storage
   */
  document.getElementById('saveConfig').addEventListener('click', async () => {
    const formConfig = getCurrentFormConfig();

    if (!validateRequiredFields(formConfig)) {
      return;
    }

    showStatus('⏳ Saving configuration...', 'loading');

    try {
      // Save basic configuration first (without userId)
      const selectedOption = folderSelect.options[folderSelect.selectedIndex];
      const folderPath = selectedOption
        ? (selectedOption.dataset.path || selectedOption.text.replace(/^📁 /, ''))
        : '';

      // Encrypt password before writing to storage
      const encryptedPassword = await encryptValue(formConfig.password);

      config = {
        appUrl: formConfig.appUrl,
        username: formConfig.username,
        password: encryptedPassword, // { data, iv } — never plain text in storage
        workspace: workspaceSelect.value,
        folder: folderPath,
        folder_id: folderSelect.value
      };

      // Save to Chrome storage (encrypted)
      await chrome.storage.local.set({ poznoteConfig: config });

      // Keep plain-text password in memory for this session
      config.password = formConfig.password;

      // Request permission for the Poznote server URL
      showStatus('⏳ Requesting server access permission...', 'loading');
      const permissionGranted = await requestHostPermission(formConfig.appUrl);

      if (!permissionGranted) {
        showStatus('⚠️ Configuration saved, but server access denied. You may need to grant permission later.', 'error');
        return;
      }

      // Get user profile ID (now that we have permission)
      showStatus('⏳ Validating credentials...', 'loading');
      const userId = await resolveProfileId(formConfig);
      config.userId = userId;

      // Update configuration with userId — re-use the same encrypted password object
      const configToStore = { ...config, password: encryptedPassword };
      await chrome.storage.local.set({ poznoteConfig: configToStore });
      // config.password stays as plaintext in memory

      showStatus('✅ Configuration saved!', 'success');
      document.getElementById('appUrl').value = config.appUrl;
      enableActionButtons();
    } catch (e) {
      showStatus('❌ Error: ' + e.message, 'error');
    }
  });

  /**
   * Event handler: Load Folders button click
   * Loads folders from the selected workspace
   */
  loadFoldersBtn.addEventListener('click', async () => {
    const formConfig = getCurrentFormConfig();

    if (!validateRequiredFields(formConfig)) {
      return;
    }

    showStatus('⏳ Loading folders...', 'loading');

    try {
      // Save form state before permission dialog (popup may close and reopen)
      await new Promise(resolve => chrome.storage.local.set({
        _pendingForm: { appUrl: formConfig.appUrl, username: formConfig.username, password: formConfig.password }
      }, resolve));

      // Request permission for the Poznote server URL
      const permissionGranted = await requestHostPermission(formConfig.appUrl);
      chrome.storage.local.remove('_pendingForm');
      if (!permissionGranted) {
        showStatus('❌ Permission denied. Please allow access to your Poznote server.', 'error');
        return;
      }

      // Get or reuse user profile ID
      let userId = config.userId;
      if (!userId) {
        userId = await resolveProfileId(formConfig);
        config.userId = userId;
      }

      // Build config with workspace
      const tempConfig = {
        ...formConfig,
        userId,
        workspace: workspaceSelect.value
      };

      // Fetch folders from API
      const response = await chrome.runtime.sendMessage({ 
        type: 'loadFolders', 
        config: tempConfig 
      });

      if (response.error) {
        showStatus('❌ Error: ' + response.error, 'error');
        return;
      }

      // Save current selection to restore it after refresh
      const currentFolder = folderSelect.value;
      folderSelect.innerHTML = '';

      // Recursive function to add folders and their children
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
          
          // Recursively add child folders
          if (folder.children) {
            addFolders(folder.children);
          }
        });
      }

      addFolders(response);

      // Restore previous selection if it still exists
      if (currentFolder) {
        folderSelect.value = currentFolder;
      }

      showStatus(`✅ ${count} folder(s) loaded!`, 'success');
    } catch (error) {
      showStatus('❌ Error: ' + error.message, 'error');
      console.error(error);
    }
  });

  /**
   * Event handler: Save Note button click
   * Saves the current page URL as a note
   */
  document.getElementById('saveNote').addEventListener('click', async () => {
    await saveToNote('url');
  });

  /**
   * Event handler: Save Screenshot button click
   * Saves the current page with a screenshot as a note
   */
  document.getElementById('saveScreenshot').addEventListener('click', async () => {
    await saveToNote('screenshot');
  });

  /**
   * Save current page to Poznote as a note
   * @param {string} contentType - Type of content to save: 'url' or 'screenshot'
   */
  async function saveToNote(contentType) {
    const formConfig = getCurrentFormConfig();

    if (!validateRequiredFields(formConfig)) {
      return;
    }

    showStatus('⏳ Preparing note...', 'loading');

    try {
      // Request permission for the Poznote server URL
      const permissionGranted = await requestHostPermission(formConfig.appUrl);
      if (!permissionGranted) {
        showStatus('❌ Permission denied. Please allow access to your Poznote server.', 'error');
        return;
      }

      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showStatus('❌ Could not access current tab.', 'error');
        return;
      }

      // Ensure we have the userId (reuse if credentials haven't changed)
      let userId = config.userId;
      if (!userId || config.username !== formConfig.username || config.appUrl !== formConfig.appUrl) {
        userId = await resolveProfileId(formConfig);
        config.userId = userId;
        config.appUrl = formConfig.appUrl;
        config.username = formConfig.username;
        config.password = formConfig.password;
      }

      const tempConfig = { ...formConfig, userId };
      const pageTitle = tab.title || 'Untitled Page';
      const pageUrl = tab.url;
      
      // Build note content based on type
      let noteContent = '';
      let contentDescription = '';
      
      if (contentType === 'url') {
        noteContent = `<a href="${pageUrl}" target="_blank">${pageUrl}</a>`;
        contentDescription = 'URL';
      } else if (contentType === 'screenshot') {
        showStatus('📸 Capturing screenshot...', 'loading');
        try {
          const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
          noteContent = `<p><a href="${pageUrl}" target="_blank">${pageUrl}</a></p>`;
          noteContent += `<br><p><img src="${screenshot}" alt="Page Screenshot" style="max-width: 100%; height: auto;" /></p>`;
          contentDescription = 'Screenshot';
        } catch (error) {
          showStatus('❌ Screenshot failed: ' + error.message, 'error');
          return;
        }
      }

      // Get selected folder information
      const selectedFolder = folderSelect.value;
      const selectedOption = folderSelect.options[folderSelect.selectedIndex];
      const selectedFolderName = selectedFolder 
        ? (selectedOption.dataset.path || selectedOption.text.replace(/^📁 /, '')) 
        : '';

      // Build note data object
      const noteData = {
        heading: `🌐 ${pageTitle}`,
        content: noteContent,
        tags: '',
        folder_name: selectedFolderName,
        folder_id: selectedFolder,
        workspace: workspaceSelect.value || config.workspace || 'Poznote'
      };

      // Create note via API
      showStatus(`Creating note with ${contentDescription}...`, 'loading');
      const response = await chrome.runtime.sendMessage({ 
        type: 'createNote', 
        config: tempConfig, 
        noteData 
      });

      if (response.error) {
        showStatus('❌ Failed: ' + response.error, 'error');
      } else {
        showStatus('💾 Note created successfully!', 'success');
      }
    } catch (error) {
      showStatus('❌ Error: ' + error.message, 'error');
      console.error(error);
    }
  }
});
