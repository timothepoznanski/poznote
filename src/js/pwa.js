(() => {
  let deferredInstallPrompt = null;

  window.poznoteCanInstallApp = () => Boolean(deferredInstallPrompt);

  window.poznotePromptInstall = async () => {
    if (!deferredInstallPrompt) {
      return { supported: false, outcome: 'unavailable' };
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    const outcome = choice?.outcome || 'dismissed';
    deferredInstallPrompt = null;

    return { supported: true, outcome };
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('poznote:pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('poznote:pwa-installed'));
  });

  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Ignore registration failures; the app remains usable without PWA features.
    });
  });
})();