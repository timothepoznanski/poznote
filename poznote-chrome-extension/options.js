/**
 * Settings page: connects the extension to an instance and picks where new
 * notes go. It opens in a tab, so the permission prompt Chrome shows while
 * connecting does not close it the way it closes the popup.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const connectForm = $('connectForm');
  const connectBtn = $('connectBtn');
  const connectStatus = $('connectStatus');
  const connectedBox = $('connectedBox');
  const destinationCard = $('destinationCard');
  const workspaceSelect = $('workspaceSelect');
  const folderSelect = $('folderSelect');
  const savedNote = $('savedNote');

  let config = await loadConfig();
  let savedTimer = null;

  function showConnectStatus(message, type) {
    if (!message) {
      connectStatus.hidden = true;
      return;
    }
    connectStatus.hidden = false;
    connectStatus.className = 'message ' + (type === 'loading' ? 'info' : type);
    connectStatus.replaceChildren();
    if (type === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      connectStatus.appendChild(spinner);
    } else {
      connectStatus.insertAdjacentHTML('beforeend', `<svg class="icon"><use href="#${type === 'success' ? 'i-success' : 'i-alert'}"/></svg>`);
    }
    const text = document.createElement('span');
    text.textContent = message;
    connectStatus.appendChild(text);
  }

  function flashSaved() {
    savedNote.innerHTML = '<svg class="icon"><use href="#i-check"/></svg><span>Saved</span>';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => savedNote.replaceChildren(), 2000);
  }

  function renderConnection() {
    const connected = isConnected(config);
    connectedBox.hidden = !connected;
    connectForm.hidden = connected;
    destinationCard.classList.toggle('locked', !connected);
    $('step1').classList.toggle('done', connected);
    $('step1').innerHTML = connected ? '<svg class="icon"><use href="#i-check"/></svg>' : '1';
    if (connected) {
      $('connectedUser').textContent = `Connected as ${config.username}`;
      $('connectedHost').textContent = config.appUrl;
      $('footer').textContent = 'You are all set: click the Poznote icon in the toolbar on any page to save it.';
    } else {
      $('footer').textContent = 'Once connected, click the Poznote icon in the toolbar on any page to save it.';
    }
  }

  /**
   * Turn an API failure into a sentence the user can act on
   */
  function explainError(message, appUrl) {
    const host = (() => {
      try {
        return new URL(appUrl).host;
      } catch (e) {
        return appUrl;
      }
    })();
    if (/\b401\b/.test(message)) {
      return 'Wrong username or password.';
    }
    if (/Failed to fetch|NetworkError/i.test(message)) {
      return `Could not reach ${host}. Check the address and that the instance is running.`;
    }
    if (/\b404\b/.test(message)) {
      return `No Poznote instance answers at ${appUrl}. Check the address.`;
    }
    return message;
  }

  // --- Where new notes go ---------------------------------------------------

  function fillWorkspaces(workspaces) {
    const names = workspaces.map(ws => ws.name || ws).filter(Boolean);
    if (config.workspace && !names.includes(config.workspace)) {
      config.workspace = names[0] || 'Poznote';
      config.folder = '';
      config.folder_id = '';
    }
    workspaceSelect.replaceChildren(...names.map(name => new Option(name, name)));
    workspaceSelect.value = config.workspace || names[0] || '';
    config.workspace = workspaceSelect.value;
  }

  async function loadFolders() {
    folderSelect.replaceChildren(new Option('Loading...', ''));
    folderSelect.disabled = true;
    const response = await chrome.runtime.sendMessage({ type: 'loadFolders', config });
    folderSelect.disabled = false;

    const options = [new Option('No folder', '')];
    if (!response.error) {
      const addFolders = (folders) => {
        const list = Array.isArray(folders) ? folders : Object.values(folders || {});
        list.forEach(folder => {
          const path = folder.path || folder.name;
          const option = new Option(path, folder.id);
          option.dataset.path = path;
          options.push(option);
          if (folder.children) {
            addFolders(folder.children);
          }
        });
      };
      addFolders(response);
    } else if (config.folder_id) {
      // Offline: keep showing the saved folder
      const option = new Option(config.folder, config.folder_id);
      option.dataset.path = config.folder;
      options.push(option);
    }
    folderSelect.replaceChildren(...options);
    folderSelect.value = String(config.folder_id || '');
    if (folderSelect.value !== String(config.folder_id || '')) {
      folderSelect.value = '';
    }
  }

  async function loadDestination() {
    const workspaces = await chrome.runtime.sendMessage({ type: 'listWorkspaces', config });
    if (workspaces.error || !Array.isArray(workspaces)) {
      fillWorkspaces([config.workspace || 'Poznote']);
    } else {
      fillWorkspaces(workspaces);
    }
    await loadFolders();
  }

  workspaceSelect.addEventListener('change', async () => {
    config.workspace = workspaceSelect.value;
    config.folder = '';
    config.folder_id = '';
    await storeConfig(config);
    await loadFolders();
    flashSaved();
  });

  folderSelect.addEventListener('change', async () => {
    const option = folderSelect.options[folderSelect.selectedIndex];
    config.folder_id = folderSelect.value;
    config.folder = folderSelect.value ? (option.dataset.path || option.text) : '';
    await storeConfig(config);
    flashSaved();
  });

  // --- Connection -----------------------------------------------------------

  connectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = {
      appUrl: normalizeUrl($('appUrl').value),
      username: $('username').value.trim(),
      password: $('password').value.trim()
    };
    if (!form.appUrl || !form.username || !form.password) {
      showConnectStatus('Fill in the address, your username and the app password.', 'error');
      return;
    }

    let pattern;
    try {
      pattern = apiOriginPattern(form.appUrl);
    } catch (err) {
      showConnectStatus('This address is not valid.', 'error');
      return;
    }
    $('appUrl').value = form.appUrl;

    // Chrome only shows the permission prompt while the click is being
    // handled, so the request starts before anything is awaited.
    const permission = chrome.permissions.request({ origins: [pattern] });
    connect(permission, form);
  });

  async function connect(permission, form) {
    connectBtn.disabled = true;
    try {
      showConnectStatus('Waiting for access to your instance...', 'loading');
      let granted = false;
      try {
        granted = await permission;
      } catch (e) {
        granted = false;
      }
      if (!granted) {
        showConnectStatus(`The extension needs access to ${new URL(form.appUrl).host} to save pages. Click Connect again and choose Allow.`, 'error');
        return;
      }

      showConnectStatus('Checking your credentials...', 'loading');
      const profiles = await chrome.runtime.sendMessage({ type: 'listProfiles', config: form });
      if (profiles.error) {
        showConnectStatus(explainError(profiles.error, form.appUrl), 'error');
        return;
      }
      const wanted = form.username.toLowerCase();
      const profile = (Array.isArray(profiles) ? profiles : []).find(p =>
        (p.username || '').toLowerCase() === wanted || (p.email || '').toLowerCase() === wanted
      );
      if (!profile) {
        showConnectStatus(`No account named ${form.username} on this instance.`, 'error');
        return;
      }

      const sameInstance = config && config.appUrl === form.appUrl && config.userId === profile.id;
      config = {
        appUrl: form.appUrl,
        username: form.username,
        password: form.password,
        userId: profile.id,
        workspace: sameInstance ? config.workspace : '',
        folder: sameInstance ? config.folder : '',
        folder_id: sameInstance ? config.folder_id : ''
      };

      showConnectStatus('Loading your workspaces...', 'loading');
      const workspaces = await chrome.runtime.sendMessage({ type: 'listWorkspaces', config });
      if (workspaces.error) {
        showConnectStatus(explainError(workspaces.error, form.appUrl), 'error');
        return;
      }
      fillWorkspaces(Array.isArray(workspaces) ? workspaces : []);
      await storeConfig(config);
      await chrome.storage.local.remove('_pendingForm');

      showConnectStatus('');
      $('password').value = '';
      renderConnection();
      await loadFolders();
    } catch (err) {
      showConnectStatus(explainError(err.message, form.appUrl), 'error');
    } finally {
      connectBtn.disabled = false;
    }
  }

  $('disconnectBtn').addEventListener('click', async () => {
    const previous = config;
    await chrome.storage.local.remove(['poznoteConfig', 'poznoteAppend']);
    try {
      await chrome.permissions.remove({ origins: [apiOriginPattern(previous.appUrl)] });
    } catch (e) {
      // Already gone
    }
    config = null;
    $('appUrl').value = previous.appUrl || '';
    $('username').value = previous.username || '';
    $('password').value = '';
    workspaceSelect.replaceChildren();
    folderSelect.replaceChildren();
    renderConnection();
    $('password').focus();
  });

  // --- Start ----------------------------------------------------------------

  if (config) {
    $('appUrl').value = config.appUrl || '';
    $('username').value = config.username || '';
  }

  if (isConnected(config) && !(await hasHostPermission(config.appUrl))) {
    // Access was removed from Chrome's extension settings: ask again
    $('password').value = config.password;
    config.userId = null;
    showConnectStatus('The extension lost access to your instance. Click Connect to allow it again.', 'error');
  }

  renderConnection();
  if (isConnected(config)) {
    await loadDestination();
  } else {
    (config && config.appUrl ? $('password') : $('appUrl')).focus();
  }
});
