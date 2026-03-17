(() => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Ignore registration failures; the app remains usable without PWA features.
    });
  });
})();