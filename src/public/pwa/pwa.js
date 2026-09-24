(() => {
  let deferredInstallPrompt = null;

  // The worker lives at the app root (sw.js, next to index.php) so that its
  // scope covers every page; this file sits one level down, in pwa/.
  const scriptUrl = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : window.location.href;
  const serviceWorkerUrl = new URL('../sw.js', scriptUrl);

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

  // No reload when a new worker takes over: it serves assets network first,
  // so a page never runs on stale files, and a reload right after the first
  // visit would throw away whatever was being typed.

  window.addEventListener('load', () => {
    // The worker used to be registered from pwa/sw.js, whose scope (pwa/)
    // contains no page. Retire that registration.
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => registrations.forEach((registration) => {
          if (registration.scope.endsWith('/pwa/')) {
            registration.unregister();
          }
        }))
        .catch(() => {});
    }

    navigator.serviceWorker.register(serviceWorkerUrl.href, { updateViaCache: 'none' })
      .then((registration) => registration.update().then(() => registration))
      .catch((e) => {
          // Ignore registration failures; the app remains usable without PWA features.
          console.debug('pwa: failed:', e);
      });
  });
})();