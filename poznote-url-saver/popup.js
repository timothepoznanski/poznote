/**
 * Runs inside the saved page: finds the picture the page gives for link
 * previews (og:image, twitter:image) and, when the site lets the page read it,
 * returns it as a data: URL so Poznote keeps its own copy. Otherwise the https
 * address alone is returned and the note shows the remote picture.
 */
async function collectPagePreview() {
  const pick = selector => {
    const el = document.querySelector(selector);
    return el ? (el.getAttribute('content') || el.getAttribute('href') || '') : '';
  };
  const raw = pick('meta[property="og:image:secure_url"]') ||
    pick('meta[property="og:image"]') ||
    pick('meta[name="og:image"]') ||
    pick('meta[name="twitter:image"]') ||
    pick('meta[name="twitter:image:src"]') ||
    pick('link[rel="image_src"]');

  let image = '';
  try {
    const url = new URL(raw.trim(), document.baseURI);
    if (raw.trim() && url.protocol === 'https:') {
      image = url.href;
    }
  } catch (e) {
    // No usable preview
  }
  if (!image) {
    return null;
  }

  let imageData = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(image, { signal: controller.signal, credentials: 'omit' });
    const type = response.headers.get('content-type') || '';
    if (response.ok && /^image\/(png|jpe?g|gif|webp)/i.test(type)) {
      const blob = await response.blob();
      if (blob.size <= 2 * 1024 * 1024) {
        imageData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    }
    clearTimeout(timer);
  } catch (e) {
    // Cross-origin picture the page cannot read: keep its address
  }
  return { src: imageData || image, alt: document.title || '' };
}

// ---------------------------------------------------------------------------

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
  const saveNoteBtn = $('saveNote');
  const saveScreenshotBtn = $('saveScreenshot');

  let config = null;
  let tab = null;
  let saveMode = 'new';
  let targetNote = null;
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

  // --- The page being saved -------------------------------------------------

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    $('pageTitle').textContent = tab.title || 'Untitled page';
    try {
      $('pageHost').textContent = new URL(tab.url).host || tab.url;
    } catch (e) {
      $('pageHost').textContent = tab.url || '';
    }
    if (tab.favIconUrl && /^https?:|^data:/.test(tab.favIconUrl)) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = tab.favIconUrl;
      img.addEventListener('load', () => $('pageIcon').replaceChildren(img));
    }
  }

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
      chrome.storage.local.set({ poznoteAppend: { mode: saveMode, note: targetNote } });
    }
    if (saveMode === 'append') {
      searchNotes(noteSearch.value.trim());
      noteSearch.focus();
    }
  }

  function selectTargetNote(note) {
    targetNote = { id: note.id, heading: note.heading, type: note.type, workspace: note.workspace, folder: note.folder };
    chrome.storage.local.set({ poznoteAppend: { mode: saveMode, note: targetNote } });
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
    const response = await chrome.runtime.sendMessage({ type: 'searchNotes', config, query });
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

  const { poznoteAppend } = await chrome.storage.local.get(['poznoteAppend']);
  targetNote = (poznoteAppend && poznoteAppend.note) || null;
  setSaveMode(poznoteAppend ? poznoteAppend.mode : 'new', false);

  // --- Saving ---------------------------------------------------------------

  /**
   * The page's preview picture, or null on pages extensions cannot script
   * (chrome://, the Web Store) and pages without one
   */
  async function readPagePreview(tabId) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: collectPagePreview
      });
      return (injection && injection.result) || null;
    } catch (e) {
      return null;
    }
  }

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
      const pageTitle = tab.title || 'Untitled Page';
      const pageUrl = tab.url;

      // A screenshot, or the page's own preview picture for a plain link
      let screenshot = null;
      let preview = null;
      if (contentType === 'url') {
        showStatus('Reading the page...', 'loading');
        preview = await readPagePreview(tab.id);
      } else {
        showStatus('Capturing the page...', 'loading');
        try {
          screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
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
          entry: { title: pageTitle, url: pageUrl, preview, screenshot }
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

      const safeUrl = escapeHtml(pageUrl);
      let content = `<p><a href="${safeUrl}" target="_blank">${safeUrl}</a></p>`;
      if (screenshot) {
        content += `<p><img src="${screenshot}" alt="Page Screenshot" style="max-width: 100%; height: auto;" /></p>`;
      } else if (preview) {
        content += `<p><img src="${escapeHtml(preview.src)}" alt="${escapeHtml(preview.alt)}" style="max-width: 320px; height: auto;" /></p>`;
      }

      showStatus('Creating the note...', 'loading');
      const response = await chrome.runtime.sendMessage({
        type: 'createNote',
        config,
        noteData: {
          heading: `🌐 ${pageTitle}`,
          content,
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
