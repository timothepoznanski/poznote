/**
 * Background script for Poznote URL Saver extension
 * Handles API communication with Poznote backend
 */

/**
 * Message listener for extension communication
 * Routes messages to appropriate handler functions
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'loadFolders') {
    loadFolders(message.config)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'createNote') {
    createNote(message.config, message.noteData)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'listWorkspaces') {
    listWorkspaces(message.config)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'searchNotes') {
    searchNotes(message.config, message.query)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'appendToNote') {
    appendToNote(message.config, message.noteId, message.entry)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'listProfiles') {
    listProfiles(message.config)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

/**
 * Build HTTP headers for API requests
 * Includes Basic Authentication and optional User ID
 * @param {Object} config - Configuration object with username, password, and optional userId
 * @returns {Object} Headers object for fetch requests
 */
function getHeaders(config) {
  const headers = {
    'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
  };
  
  if (config.userId) {
    headers['X-User-ID'] = config.userId;
  }
  
  return headers;
}

/**
 * Fetch list of user profiles from Poznote
 * @param {Object} config - Configuration object with appUrl, username, and password
 * @returns {Promise<Array>} Array of user profile objects
 */
async function listProfiles(config) {
  const url = `${config.appUrl}/api/v1/users/profiles`;
  const response = await fetch(url, {
    headers: {
      'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
    }
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Fetch list of workspaces from Poznote
 * @param {Object} config - Configuration object
 * @returns {Promise<Array>} Array of workspace objects
 */
async function listWorkspaces(config) {
  const url = `${config.appUrl}/api/v1/workspaces`;
  const response = await fetch(url, {
    headers: getHeaders(config)
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.workspaces || data;
}

/**
 * Fetch folders from a specific workspace
 * @param {Object} config - Configuration object with workspace name
 * @returns {Promise<Array>} Array of folder objects with hierarchical structure
 */
async function loadFolders(config) {
  const workspace = config.workspace || 'Poznote';
  const url = `${config.appUrl}/api/v1/folders?workspace=${encodeURIComponent(workspace)}`;
  const response = await fetch(url, {
    headers: getHeaders(config)
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.folders || data;
}

/**
 * Create a new note in Poznote
 * @param {Object} config - Configuration object
 * @param {Object} noteData - Note data including heading, content, tags, workspace and folder_id
 * @returns {Promise<Object>} Created note object
 */
async function createNote(config, noteData) {
  const url = `${config.appUrl}/api/v1/notes`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getHeaders(config),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      heading: noteData.heading,
      content: noteData.content,
      tags: noteData.tags || '',
      workspace: noteData.workspace,
      ...(noteData.folder_id ? { folder_id: Number(noteData.folder_id) } : {})
    })
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMsg = `Error ${response.status}: ${response.statusText}`;
    
    // Try to extract error message from JSON response
    try {
      const errorJson = JSON.parse(text);
      if (errorJson.error) {
        errorMsg += ` – ${errorJson.error}`;
      }
    } catch (e) {
      if (text) {
        errorMsg += ` – ${text}`;
      }
    }
    
    throw new Error(errorMsg);
  }
  
  return await response.json();
}

/**
 * Build an Error from a failed API response, with the server's message when it sent one
 * @param {Response} response - The failed fetch response
 * @returns {Promise<Error>}
 */
async function apiError(response) {
  const text = await response.text();
  let errorMsg = `Error ${response.status}: ${response.statusText}`;
  try {
    const errorJson = JSON.parse(text);
    if (errorJson.error || errorJson.message) {
      errorMsg += ` – ${errorJson.error || errorJson.message}`;
    }
  } catch (e) {
    // Not JSON, keep the status line
  }
  return new Error(errorMsg);
}

/**
 * Notes a page can be appended to: HTML and Markdown notes of every workspace,
 * most recently modified first. An empty query lists the latest ones.
 * @param {Object} config - Configuration object
 * @param {string} query - Words to find in the title or content
 * @returns {Promise<Array>} Notes with id, heading, type, workspace and folder
 */
async function searchNotes(config, query) {
  const params = new URLSearchParams({ sort: 'updated_desc', limit: '40' });
  if (query) {
    params.set('search', query);
  }
  const response = await fetch(`${config.appUrl}/api/v1/notes?${params}`, {
    headers: getHeaders(config)
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  const data = await response.json();
  const notes = Array.isArray(data.notes) ? data.notes : [];
  return notes
    .filter(note => note.type === 'note' || note.type === 'markdown')
    .slice(0, 20)
    .map(note => ({
      id: note.id,
      heading: note.heading || 'Untitled',
      type: note.type,
      workspace: note.workspace,
      folder: note.folder || ''
    }));
}

/**
 * Store a data: image as an attachment of the note
 * @param {Object} config - Configuration object
 * @param {number} noteId - Note receiving the attachment
 * @param {string} dataUrl - The image as a data: URL
 * @param {string} fileName - Name given to the attachment
 * @returns {Promise<string>} Address of the attachment, as Markdown notes reference it
 */
async function uploadImageAttachment(config, noteId, dataUrl, fileName) {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append('file', blob, fileName);
  const response = await fetch(`${config.appUrl}/api/v1/notes/${noteId}/attachments`, {
    method: 'POST',
    headers: getHeaders(config),
    body: form
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  const data = await response.json();
  if (!data.attachment_id) {
    throw new Error(data.message || 'Upload failed');
  }
  return `/api/v1/notes/${noteId}/attachments/${data.attachment_id}`;
}

/**
 * Add a saved page at the end of an existing note.
 * The note is read, the entry is written in its format (HTML or Markdown) and
 * the new content is sent with if_version, so an edit made in the meantime is
 * never overwritten: on a 409 the entry is added to the content the server
 * returned and the write is tried again.
 * @param {Object} config - Configuration object
 * @param {number} noteId - Target note
 * @param {Object} entry - { title, url, preview: {src, alt}|null, screenshot: dataUrl|null }
 * @returns {Promise<Object>} The note's id and heading
 */
async function appendToNote(config, noteId, entry) {
  const response = await fetch(`${config.appUrl}/api/v1/notes/${noteId}`, {
    headers: getHeaders(config)
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  const { note } = await response.json();
  if (note.type !== 'note' && note.type !== 'markdown') {
    throw new Error('Pages can only be added to HTML or Markdown notes.');
  }

  let block;
  if (note.type === 'markdown') {
    // Markdown has no room for a data: image, so pictures become attachments first
    let previewSrc = entry.preview ? entry.preview.src : '';
    if (previewSrc.startsWith('data:')) {
      previewSrc = await uploadImageAttachment(config, noteId, previewSrc, 'preview' + imageExtension(previewSrc));
    }
    let screenshotSrc = '';
    if (entry.screenshot) {
      screenshotSrc = await uploadImageAttachment(config, noteId, entry.screenshot, 'screenshot.png');
    }
    block = buildMarkdownEntry(entry, previewSrc, screenshotSrc);
  } else {
    // The server turns data: images of an HTML note into attachments by itself
    block = buildHtmlEntry(entry);
  }

  let content = note.content || '';
  let version = note.version;
  for (let attempt = 0; attempt < 3; attempt++) {
    const merged = note.type === 'markdown'
      ? (content.replace(/\s+$/, '') ? content.replace(/\s+$/, '') + '\n\n' : '') + block + '\n'
      : content + block;

    const patch = await fetch(`${config.appUrl}/api/v1/notes/${noteId}`, {
      method: 'PATCH',
      headers: {
        ...getHeaders(config),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: merged, if_version: version })
    });

    if (patch.ok) {
      return { id: note.id, heading: note.heading };
    }

    if (patch.status !== 409) {
      throw await apiError(patch);
    }

    // Edited in the meantime: add the entry to the latest content instead
    const conflict = await patch.json();
    const current = conflict.current;
    if (!current || typeof current.content !== 'string' || !current.version) {
      throw new Error('The note changed meanwhile, try again.');
    }
    content = current.content;
    version = current.version;
  }

  throw new Error('The note keeps changing, try again in a moment.');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageExtension(dataUrl) {
  const match = /^data:image\/([a-z0-9.+-]+)/i.exec(dataUrl);
  const subtype = match ? match[1].toLowerCase() : 'png';
  if (subtype === 'jpeg') return '.jpg';
  if (subtype === 'svg+xml') return '.svg';
  return '.' + subtype.replace(/[^a-z0-9]/g, '');
}

/**
 * One saved page in an HTML note: the title as a link, then the preview or the screenshot
 */
function buildHtmlEntry(entry) {
  let html = `<p>🌐 <a href="${escapeHtml(entry.url)}" target="_blank">${escapeHtml(entry.title)}</a></p>`;
  if (entry.screenshot) {
    html += `<p><img src="${entry.screenshot}" alt="Page Screenshot" style="max-width: 100%; height: auto;" /></p>`;
  } else if (entry.preview) {
    html += `<p><img src="${escapeHtml(entry.preview.src)}" alt="${escapeHtml(entry.preview.alt)}" style="max-width: 320px; height: auto;" /></p>`;
  }
  return html;
}

/**
 * The same entry in Markdown
 */
function buildMarkdownEntry(entry, previewSrc, screenshotSrc) {
  const title = entry.title.replace(/([\\[\]])/g, '\\$1');
  // Poznote's parser ends a link at the first ")" and has no <url> form
  const target = url => url.replace(/[\s()<>]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  let md = `🌐 [${title}](${target(entry.url)})`;
  if (screenshotSrc) {
    md += `\n\n![Page Screenshot](${screenshotSrc})`;
  } else if (previewSrc) {
    md += `\n\n![${title}](${target(previewSrc)})`;
  }
  return md;
}
