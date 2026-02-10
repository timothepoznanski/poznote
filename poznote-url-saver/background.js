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
 * @param {Object} noteData - Note data including heading, content, tags, folder, and workspace
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
      folder_name: noteData.folder_name,
      workspace: noteData.workspace
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
