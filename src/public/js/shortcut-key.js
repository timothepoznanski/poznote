/**
 * window.poznoteShortcutKey(e): the letter a Ctrl/Cmd shortcut stands for,
 * lower-cased (#1507).
 *
 * e.key follows the keyboard layout, so on a Russian layout Ctrl+S reports
 * "ы" and a check for "s" never matched: the browser opened its own "Save
 * page" dialog instead. When e.key is a letter outside the Latin script
 * (Cyrillic, Greek, Hebrew, Arabic...), the shortcut is read from the
 * physical key (e.code "KeyS" -> "s"), as the browser does for its own
 * shortcuts. A Latin letter is kept as typed: Dvorak's Ctrl+O stays O even
 * though it sits on the S key, and AltGr+S typing "ś" on a Polish layout is
 * not taken for Ctrl+Alt+S. For the same reason a letter typed with AltGr
 * held is never read from the physical key.
 */
(function () {
    'use strict';

    var nonLatinLetter = null;
    try {
        nonLatinLetter = new RegExp('^(?=\\p{L}$)\\P{Script=Latin}$', 'u');
    } catch (err) {
        // No Unicode property escapes: keep e.key as it is
    }

    window.poznoteShortcutKey = function (e) {
        var key = e && typeof e.key === 'string' ? e.key : '';
        // AltGr reports ctrlKey + altKey on Windows: a letter it types
        // (Ukrainian AltGr+U types "ґ") is text, not Ctrl+U
        var altGraph = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');
        if (nonLatinLetter && !altGraph && nonLatinLetter.test(key)
            && typeof e.code === 'string' && /^Key[A-Z]$/.test(e.code)) {
            return e.code.charAt(3).toLowerCase();
        }
        return key.toLowerCase();
    };
})();
