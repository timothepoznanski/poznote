/* eslint-disable no-unused-vars -- these helpers are globals that popup.js and options.js use */
// ---------------------------------------------------------------------------
// Shared by the popup and the settings page: the stored connection.
//
// Credential encryption uses AES-GCM-256 via the Web Crypto API.
// A random 256-bit key is generated once per installation and stored as raw
// bytes in chrome.storage.local under the '_ek' key. The password is never
// written to storage in plain text — only as a { data, iv } ciphertext pair.
// ---------------------------------------------------------------------------

async function getOrCreateEncryptionKey() {
  const result = await chrome.storage.local.get(['_ek']);
  if (result._ek) {
    return crypto.subtle.importKey(
      'raw', new Uint8Array(result._ek), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawKey = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({ _ek: Array.from(new Uint8Array(rawKey)) });
  return key;
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

/**
 * Removes trailing slashes and adds https:// when the protocol is missing
 */
function normalizeUrl(url) {
  let normalized = String(url || '').trim().replace(/\/+$/, '');
  if (normalized && !/^https?:\/\//i.test(normalized)) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * The host permission pattern the extension needs for an instance
 */
function apiOriginPattern(appUrl) {
  const url = new URL(appUrl);
  return `${url.protocol}//${url.host}/api/v1/*`;
}

async function hasHostPermission(appUrl) {
  try {
    return await chrome.permissions.contains({ origins: [apiOriginPattern(appUrl)] });
  } catch (e) {
    return false;
  }
}

/**
 * The saved connection with its password decrypted, or null.
 * A legacy plain-text password is encrypted on the way.
 */
async function loadConfig() {
  const { poznoteConfig } = await chrome.storage.local.get(['poznoteConfig']);
  if (!poznoteConfig) {
    return null;
  }
  const config = { ...poznoteConfig };
  if (config.password && typeof config.password === 'object' && config.password.data) {
    try {
      config.password = await decryptValue(config.password);
    } catch (e) {
      console.error('Failed to decrypt stored password:', e);
      config.password = '';
    }
  } else if (typeof config.password === 'string' && config.password) {
    await storeConfig(config);
  } else {
    config.password = '';
  }
  return config;
}

/**
 * Save the connection, the password encrypted
 */
async function storeConfig(config) {
  const stored = { ...config, password: await encryptValue(config.password || '') };
  await chrome.storage.local.set({ poznoteConfig: stored });
}

function isConnected(config) {
  return Boolean(config && config.appUrl && config.username && config.password && config.userId);
}

/**
 * Address of a note in the web interface, which opens its workspace by itself
 */
function noteUrl(config, noteId) {
  return `${config.appUrl}/index.php?note=${encodeURIComponent(noteId)}`;
}

/**
 * A sentence in the browser's language, from _locales/<lang>/messages.json
 */
function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * Translate the static texts of a page: data-i18n for the text,
 * data-i18n-title, data-i18n-placeholder and data-i18n-aria-label for
 * the attributes.
 */
function localizePage() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  ['title', 'placeholder', 'aria-label'].forEach(attribute => {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(el => {
      el.setAttribute(attribute, t(el.getAttribute(`data-i18n-${attribute}`)));
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
