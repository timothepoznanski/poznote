document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const status = document.getElementById('status');
  const workspaceSelect = document.getElementById('workspaceSelect');
  const folderSelect = document.getElementById('folderSelect');
  const fetchWorkspacesBtn = document.getElementById('fetchWorkspaces');
  const loadFoldersBtn = document.getElementById('loadFolders');
  
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
  chrome.storage.local.get(['poznoteConfig'], (result) => {
    if (result.poznoteConfig) {
      config = result.poznoteConfig;
      
      // Fill form fields
      document.getElementById('appUrl').value = config.appUrl || '';
      document.getElementById('username').value = config.username || '';
      document.getElementById('password').value = config.password || '';

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
      // Get user profile ID
      const userId = await resolveProfileId(formConfig);

      // Get selected folder information
      const selectedOption = folderSelect.options[folderSelect.selectedIndex];
      const folderPath = selectedOption 
        ? (selectedOption.dataset.path || selectedOption.text.replace(/^📁 /, '')) 
        : '';

      // Build complete configuration object
      config = {
        appUrl: formConfig.appUrl,
        username: formConfig.username,
        password: formConfig.password,
        userId: userId,
        workspace: workspaceSelect.value,
        folder: folderPath,
        folder_id: folderSelect.value
      };

      // Save to Chrome storage
      chrome.storage.local.set({ poznoteConfig: config }, () => {
        showStatus('✅ Configuration saved!', 'success');
        document.getElementById('appUrl').value = config.appUrl;
      });
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
          noteContent = `<p><a href="${pageUrl}" target="_blank">${pageUrl}</a></p><br><p><img src="${screenshot}" alt="Page Screenshot" style="max-width: 100%; height: auto; border: 1px solid #ddd;" /></p>`;
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
