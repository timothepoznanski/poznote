/**
 * Offline page (offline.php), first script after theme-init.js.
 *
 * The offline page runs the app's own editor modules (the index_js.php head
 * bundle, js/globals.js, the task list scripts). Online they get their
 * translations from api/v1/system/i18n; here the dictionary is embedded in the
 * page, so window.t is defined before js/globals.js loads, which then skips
 * its own loader.
 */
(function () {
    'use strict';

    var data = {};
    try {
        data = JSON.parse(document.getElementById('offline-i18n').textContent || '{}') || {};
    } catch (e) {
        data = {};
    }
    window.POZNOTE_I18N = { lang: data.lang || 'en', strings: data.strings || {} };
    // "New note" in every language: shown as a placeholder, as in the app
    window.DEFAULT_NOTE_TITLES = Array.isArray(data.defaultNoteTitles) && data.defaultNoteTitles.length
        ? data.defaultNoteTitles
        : ['New note'];

    function getByPath(obj, key) {
        if (!obj || !key) return null;
        var parts = String(key).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (!cur || typeof cur !== 'object' || !(parts[i] in cur)) return null;
            cur = cur[parts[i]];
        }
        return (typeof cur === 'string') ? cur : null;
    }

    // Same contract as the one of js/globals.js.
    window.t = function (key, vars, fallback) {
        var str = getByPath(window.POZNOTE_I18N.strings, key);
        if (str == null) str = (fallback != null ? String(fallback) : String(key));
        if (vars && typeof vars === 'object') {
            for (var k in vars) {
                if (Object.prototype.hasOwnProperty.call(vars, k)) {
                    str = str.split('{{' + k + '}}').join(String(vars[k]));
                }
            }
        }
        return str;
    };
    window.applyI18nToDom = function () {};
    window.loadPoznoteI18n = function () {
        return Promise.resolve();
    };

    // Task actions that need the server live in scripts this page does not
    // load (js/tasklist-move.js), yet js/tasklist-order-drag.js exports them
    // when it loads: nothing happens offline.
    window.openMoveTaskModal = function () {};
})();
