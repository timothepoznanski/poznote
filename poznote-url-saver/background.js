chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'loadFolders') {
    loadFolders(message.config).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'createNote') {
    createNote(message.config, message.noteData).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'listWorkspaces') {
    listWorkspaces(message.config).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'listProfiles') {
    listProfiles(message.config).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

function getHeaders(config) {
  const headers = {
    'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
  };
  if (config.userId) {
    headers['X-User-ID'] = config.userId;
  }
  return headers;
}

async function listProfiles(config) {
  const url = `${config.appUrl}/api/v1/users/profiles`;
  const response = await fetch(url, {
    headers: {
      'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
    }
  });

  if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
  return await response.json();
}

async function listWorkspaces(config) {
  const url = `${config.appUrl}/api/v1/workspaces`;
  const response = await fetch(url, {
    headers: getHeaders(config)
  });

  if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
  const data = await response.json();
  return data.workspaces || data;
}

async function loadFolders(config) {
  const workspace = config.workspace || 'Poznote';
  const url = `${config.appUrl}/api/v1/folders?workspace=${encodeURIComponent(workspace)}`;
  const response = await fetch(url, {
    headers: getHeaders(config)
  });

  if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
  const data = await response.json();
  return data.folders || data;
}

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
      folder_name: noteData.folder_name,
      workspace: noteData.workspace
    })
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMsg = `Error ${response.status}: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(text);
      if (errorJson.error) errorMsg += ` – ${errorJson.error}`;
    } catch (e) {
      if (text) errorMsg += ` – ${text}`;
    }
    throw new Error(errorMsg);
  }
  return await response.json();
}
