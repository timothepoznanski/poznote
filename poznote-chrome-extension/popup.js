document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const connectView = $('connectView');
  const mainView = $('mainView');
  const status = $('status');
  const modeNewBtn = $('modeNew');
  const modeAppendBtn = $('modeAppend');
  const newPanel = $('newPanel');
  const appendPanel = $('appendPanel');
  const noteSearch = $('noteSearch');
  const noteResults = $('noteResults');
  const allWorkspacesToggle = $('allWorkspaces');
  const saveNoteBtn = $('saveNote');
  const saveScreenshotBtn = $('saveScreenshot');

  let config = null;
  let tab = null;
  let saveMode = 'new';
  let targetNote = null;
  let allWorkspaces = false;
  // Workspace that new notes go to, the only one listed outside "All workspaces"
  const destinationWorkspace = () => (config && config.workspace) || 'Poznote';
  let searchTimer = null;
  let searchRequest = 0;

  // Connecting happens on the settings page, in a tab: a permission prompt
  // opened from the popup would close it halfway through.
  const openSettings = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };
  $('openSettings').addEventListener('click', openSettings);
  $('connectBtn').addEventListener('click', openSettings);
  $('changeDest').addEventListener('click', openSettings);

  const ICONS = { success: 'i-success', error: 'i-alert' };

  /**
   * Show a message under the buttons. type: 'loading', 'success', 'error'
   * link: optional { href, label } appended to the message
   */
  function showStatus(message, type, link) {
    status.hidden = false;
    status.className = 'message ' + (type === 'loading' ? 'info' : type);
    status.replaceChildren();

    if (type === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      status.appendChild(spinner);
    } else {
      status.insertAdjacentHTML('beforeend', `<svg class="icon"><use href="#${ICONS[type] || 'i-alert'}"/></svg>`);
    }

    const text = document.createElement('span');
    text.textContent = message;
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.label;
      a.target = '_blank';
      text.append(' ', a);
    }
    status.appendChild(text);
  }

  function setBusy(button, busy) {
    saveNoteBtn.disabled = busy;
    saveScreenshotBtn.disabled = busy;
    button.classList.toggle('busy', busy);
  }

  // --- Connection -----------------------------------------------------------

  config = await loadConfig();
  if (!isConnected(config) || !(await hasHostPermission(config.appUrl))) {
    if (config && config.appUrl) {
      $('connectText').textContent = 'The extension lost access to your Poznote instance. Reconnect it to keep saving pages.';
      $('connectBtn').textContent = 'Reconnect';
    }
    connectView.hidden = false;
    return;
  }

  $('hostLabel').textContent = new URL(config.appUrl).host;
  $('hostLabel').title = `${config.username} on ${config.appUrl}`;
  $('destLabel').textContent = [config.workspace || 'Poznote', config.folder].filter(Boolean).join(' / ');
  mainView.hidden = false;

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // --- New note or existing note --------------------------------------------

  /**
   * The choice and the picked note are kept for the next time the popup opens.
   */
  function setSaveMode(mode, remember = true) {
    saveMode = mode === 'append' ? 'append' : 'new';
    modeNewBtn.setAttribute('aria-selected', String(saveMode === 'new'));
    modeAppendBtn.setAttribute('aria-selected', String(saveMode === 'append'));
    newPanel.hidden = saveMode !== 'new';
    appendPanel.hidden = saveMode !== 'append';
    status.hidden = true;
    if (remember) {
      rememberAppend();
    }
    if (saveMode === 'append') {
      searchNotes(noteSearch.value.trim());
      noteSearch.focus();
    }
  }

  // The mode, the picked note and the workspace scope are kept for the next time the popup opens
  function rememberAppend() {
    chrome.storage.local.set({ poznoteAppend: { mode: saveMode, note: targetNote, allWorkspaces } });
  }

  function selectTargetNote(note) {
    targetNote = { id: note.id, heading: note.heading, type: note.type, workspace: note.workspace, folder: note.folder };
    rememberAppend();
    noteResults.querySelectorAll('li[data-id]').forEach(li => {
      const selected = Number(li.dataset.id) === targetNote.id;
      li.classList.toggle('selected', selected);
      li.setAttribute('aria-selected', String(selected));
    });
    status.hidden = true;
  }

  function placeholder(text) {
    const li = document.createElement('li');
    li.className = 'placeholder';
    li.textContent = text;
    noteResults.replaceChildren(li);
  }

  function noteItem(note) {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.dataset.id = note.id;
    li.setAttribute('role', 'option');
    li.title = note.heading;
    const selected = Boolean(targetNote && targetNote.id === note.id);
    li.classList.toggle('selected', selected);
    li.setAttribute('aria-selected', String(selected));

    const type = document.createElement('span');
    type.className = 'note-type';
    type.innerHTML = note.type === 'markdown'
      ? '<span class="md-badge">MD</span>'
      : '<svg class="icon"><use href="#i-file"/></svg>';

    const text = document.createElement('span');
    text.className = 'note-text';
    const heading = document.createElement('span');
    heading.className = 'note-heading';
    heading.textContent = note.heading;
    const place = document.createElement('span');
    place.className = 'note-place';
    place.textContent = [note.workspace, note.folder].filter(Boolean).join(' / ');
    text.append(heading, place);

    const check = document.createElement('span');
    check.className = 'note-check';
    check.innerHTML = '<svg class="icon"><use href="#i-check"/></svg>';

    li.append(type, text, check);
    li.addEventListener('click', () => selectTargetNote(note));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectTargetNote(note);
      } else if (e.key === 'ArrowDown' && li.nextElementSibling) {
        e.preventDefault();
        li.nextElementSibling.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (li.previousElementSibling || noteSearch).focus();
      }
    });
    return li;
  }

  /**
   * List the notes a page can be added to, the latest ones when the query is
   * empty. The picked note stays on top of that default list.
   */
  async function searchNotes(query) {
    const request = ++searchRequest;
    if (!noteResults.children.length) {
      placeholder('Loading notes...');
    }
    const response = await chrome.runtime.sendMessage({
      type: 'searchNotes',
      config,
      query,
      workspace: allWorkspaces ? '' : destinationWorkspace()
    });
    if (request !== searchRequest) {
      return; // A newer search was started meanwhile
    }
    if (response.error) {
      placeholder('Could not load the notes.');
      showStatus(response.error, 'error');
      return;
    }

    let notes = response;
    if (!query && targetNote && !notes.some(note => note.id === targetNote.id)) {
      notes = [targetNote, ...notes];
    }
    if (!notes.length) {
      placeholder(query ? 'No note matches.' : 'No note yet.');
      return;
    }
    noteResults.replaceChildren(...notes.map(noteItem));
  }

  modeNewBtn.addEventListener('click', () => setSaveMode('new'));
  modeAppendBtn.addEventListener('click', () => setSaveMode('append'));
  noteSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchNotes(noteSearch.value.trim()), 250);
  });
  noteSearch.addEventListener('keydown', (e) => {
    const first = noteResults.querySelector('li[data-id]');
    if (e.key === 'ArrowDown' && first) {
      e.preventDefault();
      first.focus();
    }
  });

  /**
   * Outside "All workspaces", a note of another workspace cannot stay the
   * target: it would receive pages without being shown in the list.
   */
  function dropHiddenTarget() {
    if (!allWorkspaces && targetNote && targetNote.workspace && targetNote.workspace !== destinationWorkspace()) {
      targetNote = null;
    }
  }

  allWorkspacesToggle.addEventListener('change', () => {
    allWorkspaces = allWorkspacesToggle.checked;
    dropHiddenTarget();
    rememberAppend();
    searchNotes(noteSearch.value.trim());
  });

  const { poznoteAppend } = await chrome.storage.local.get(['poznoteAppend']);
  targetNote = (poznoteAppend && poznoteAppend.note) || null;
  allWorkspaces = Boolean(poznoteAppend && poznoteAppend.allWorkspaces);
  allWorkspacesToggle.checked = allWorkspaces;
  dropHiddenTarget();
  setSaveMode(poznoteAppend ? poznoteAppend.mode : 'new', false);

  // --- Saving ---------------------------------------------------------------

  saveNoteBtn.addEventListener('click', () => saveToNote('url', saveNoteBtn));
  saveScreenshotBtn.addEventListener('click', () => saveToNote('screenshot', saveScreenshotBtn));

  /**
   * Save current page to Poznote, as a new note or at the end of the picked one
   * @param {string} contentType - 'url' or 'screenshot'
   * @param {HTMLElement} button - The button that was clicked
   */
  async function saveToNote(contentType, button) {
    if (!tab || !/^https?:|^file:/.test(tab.url || '')) {
      showStatus('This page cannot be saved.', 'error');
      return;
    }
    if (saveMode === 'append' && !targetNote) {
      showStatus('Pick the note to add the page to.', 'error');
      noteSearch.focus();
      return;
    }

    setBusy(button, true);
    try {
      const entry = { url: tab.url, screenshot: null };
      if (contentType === 'screenshot') {
        showStatus('Capturing the page...', 'loading');
        try {
          entry.screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        } catch (error) {
          showStatus('Screenshot failed: ' + error.message, 'error');
          return;
        }
      }

      if (saveMode === 'append') {
        showStatus(`Adding to ${targetNote.heading}...`, 'loading');
        const response = await chrome.runtime.sendMessage({
          type: 'appendToNote',
          config,
          noteId: targetNote.id,
          entry
        });
        if (response.error) {
          showStatus(response.error, 'error');
          return;
        }
        if (response.heading && response.heading !== targetNote.heading) {
          selectTargetNote({ ...targetNote, heading: response.heading });
        }
        showStatus(`Added to ${response.heading}.`, 'success', { href: noteUrl(config, response.id), label: 'Open' });
        return;
      }

      showStatus('Creating the note...', 'loading');
      const response = await chrome.runtime.sendMessage({
        type: 'createNote',
        config,
        noteData: {
          heading: `🌐 ${tab.title || 'Untitled Page'}`,
          entry,
          workspace: config.workspace || 'Poznote',
          folder_id: config.folder_id || ''
        }
      });
      if (response.error) {
        showStatus(response.error, 'error');
        return;
      }
      const created = response.note || response;
      showStatus('Note created.', 'success', created.id ? { href: noteUrl(config, created.id), label: 'Open' } : null);
    } catch (error) {
      showStatus(error.message, 'error');
      console.error(error);
    } finally {
      setBusy(button, false);
    }
  }
});
