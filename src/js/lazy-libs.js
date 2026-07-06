// Lazy loader for heavy rendering libraries (Mermaid ~2.7 MB, KaTeX ~270 KB).
// They are no longer shipped in the <head>: consumers call the ensure*()
// helpers below, which inject the script on first use and dedupe concurrent
// requests. Pages that still include the libraries statically are unaffected
// (the helpers resolve immediately when the global already exists).
(function () {
    'use strict';

    // Reuse the cache-busting version this file was loaded with.
    var assetVersion = (function () {
        try {
            var src = document.currentScript && document.currentScript.src;
            var match = src && src.match(/[?&]v=([^&]+)/);
            return match ? match[1] : '';
        } catch (e) {
            return '';
        }
    })();

    var pendingScripts = {};

    function ensureScript(src) {
        if (pendingScripts[src]) {
            return pendingScripts[src];
        }

        pendingScripts[src] = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = src + (assetVersion ? (src.indexOf('?') === -1 ? '?v=' : '&v=') + assetVersion : '');
            script.onload = function () {
                resolve();
            };
            script.onerror = function () {
                delete pendingScripts[src];
                reject(new Error('Failed to load ' + src));
            };
            document.head.appendChild(script);
        });

        return pendingScripts[src];
    }

    window.poznoteEnsureScript = ensureScript;

    window.poznoteEnsureMermaid = function () {
        return typeof mermaid !== 'undefined'
            ? Promise.resolve()
            : ensureScript('js/mermaid/mermaid.min.js');
    };

    window.poznoteEnsureKatex = function () {
        return typeof katex !== 'undefined'
            ? Promise.resolve()
            : ensureScript('js/katex/katex.min.js');
    };
})();
