/**
 * The colour palette the pickers offer (issue #1408): text colour, highlight,
 * slash menu, and icon colours. Browser copy of src/lib/color-palette.php,
 * which explains the model; tests/color-palette.test.php keeps both identical.
 *
 * window.PoznoteColorPalette
 *   colors                 [{ id, hex, soft }] in swatch order
 *   textColor(id)          'var(--pz-color-red, #dc2626)', written into notes
 *   highlightColor(id)     'var(--pz-color-red-soft, #f5bebe)'
 *   iconColorCss(color)    token for a stored icon hex, '' when unsafe
 *   canonicalIconColor(c)  the swatch hex a legacy icon colour now selects
 */
(function () {
    'use strict';

    var COLORS = [
        { id: 'red', hex: '#dc2626', soft: '#f5bebe' },
        { id: 'orange', hex: '#ea580c', soft: '#f9cdb6' },
        { id: 'amber', hex: '#d97706', soft: '#f4d6b4' },
        { id: 'yellow', hex: '#eab308', soft: '#f9e8b5' },
        { id: 'lime', hex: '#84cc16', soft: '#daf0b9' },
        { id: 'green', hex: '#16a34a', soft: '#b9e3c9' },
        { id: 'teal', hex: '#0d9488', soft: '#b6dfdb' },
        { id: 'cyan', hex: '#0891b2', soft: '#b5dee8' },
        { id: 'blue', hex: '#2563eb', soft: '#bed0f9' },
        { id: 'indigo', hex: '#4f46e5', soft: '#cac8f7' },
        { id: 'purple', hex: '#9333ea', soft: '#dfc2f9' },
        { id: 'magenta', hex: '#c026d3', soft: '#ecbef2' },
        { id: 'pink', hex: '#db2777', soft: '#f4bed6' },
        { id: 'brown', hex: '#92400e', soft: '#dec6b7' },
        { id: 'gray', hex: '#6b7280', soft: '#d3d5d9' }
    ];

    var LEGACY_ICON_TOKENS = {
        '#ef4444': '--pz-color-red',
        '#f97316': '--pz-color-orange',
        '#f59e0b': '--pz-color-amber',
        '#22c55e': '--pz-color-green',
        '#10b981': '--pz-color-green',
        '#14b8a6': '--pz-color-teal',
        '#06b6d4': '--pz-color-cyan',
        '#0ea5e9': '--pz-color-cyan',
        '#3b82f6': '--pz-color-blue',
        '#6366f1': '--pz-color-indigo',
        '#8b5cf6': '--pz-color-purple',
        '#a855f7': '--pz-color-purple',
        '#d946ef': '--pz-color-magenta',
        '#ec4899': '--pz-color-pink',
        '#f43f5e': '--pz-color-red',
        '#64748b': '--pz-color-gray',
        '#78716c': '--pz-color-gray',
        '#111827': '--pz-text'
    };

    var SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30})$/;

    function byId(id) {
        for (var i = 0; i < COLORS.length; i++) {
            if (COLORS[i].id === id) return COLORS[i];
        }
        return null;
    }

    function byHex(hex) {
        for (var i = 0; i < COLORS.length; i++) {
            if (COLORS[i].hex === hex) return COLORS[i];
        }
        return null;
    }

    function textColor(id) {
        var c = byId(id);
        return c ? 'var(--pz-color-' + c.id + ', ' + c.hex + ')' : '';
    }

    function highlightColor(id) {
        var c = byId(id);
        return c ? 'var(--pz-color-' + c.id + '-soft, ' + c.soft + ')' : '';
    }

    function iconColorCss(color) {
        color = String(color || '').trim();
        if (!SAFE_COLOR.test(color)) return '';
        var lower = color.toLowerCase();
        var c = byHex(lower);
        if (c) return 'var(--pz-color-' + c.id + ', ' + lower + ')';
        if (Object.prototype.hasOwnProperty.call(LEGACY_ICON_TOKENS, lower)) {
            return 'var(' + LEGACY_ICON_TOKENS[lower] + ', ' + lower + ')';
        }
        return color;
    }

    function canonicalIconColor(color) {
        var lower = String(color || '').trim().toLowerCase();
        if (byHex(lower)) return lower;
        var token = LEGACY_ICON_TOKENS[lower];
        if (token && token.indexOf('--pz-color-') === 0) {
            var c = byId(token.slice('--pz-color-'.length));
            if (c) return c.hex;
        }
        return lower;
    }

    window.PoznoteColorPalette = {
        colors: COLORS,
        textColor: textColor,
        highlightColor: highlightColor,
        iconColorCss: iconColorCss,
        canonicalIconColor: canonicalIconColor
    };

    // Short form for the renderers, which fall back to the raw colour on the
    // pages that do not load this file.
    window.poznoteIconColorCss = iconColorCss;
})();
