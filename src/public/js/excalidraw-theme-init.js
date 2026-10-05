/**
 * Excalidraw Editor Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 *
 * The theme itself is resolved by js/theme-init.js, which the editor page
 * loads just before this file: data-theme, the variant class and the
 * stylesheet of a custom theme. This page used to resolve it on its own and
 * only knew light, dark and black, so the editor of a note shown under any
 * other theme opened in the wrong colours (issue #1578). What is left here
 * is the body classes the dark stylesheets key on.
 */
(function() {
    'use strict';

    function applyBodyThemeClasses() {
        if (!document.body) {
            return;
        }

        var root = document.documentElement;
        document.body.classList.toggle('dark-mode', root.getAttribute('data-theme') === 'dark');
        document.body.classList.toggle('black-mode', root.classList.contains('theme-black'));
    }

    applyBodyThemeClasses();
    document.addEventListener('DOMContentLoaded', applyBodyThemeClasses);
})();

/**
 * Photos in a dark theme, for a browser whose canvas has no `filter`.
 *
 * Excalidraw's dark mode inverts its whole canvas in CSS, and keeps a photo
 * upright under that by drawing it through the opposite filter, set on the
 * 2D context. Safari's canvas has no such property: the assignment is lost,
 * the photo is drawn as it is and comes out inverted, washed out with blown
 * highlights (issue #1578). Where the property is missing, it is provided
 * here: the filter Excalidraw asks for is remembered on the context, and an
 * image drawn while it is set is replaced by a copy inverted pixel by pixel.
 * Nothing is installed in a browser that has the real thing.
 */
(function() {
    'use strict';

    var proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (!proto || 'filter' in proto || typeof WeakMap !== 'function') {
        return;
    }

    // A photo is drawn far smaller than it is stored: the copy is capped so
    // a large one is not walked pixel by pixel at full size.
    var MAX_SIDE = 2048;
    var copies = new WeakMap();

    function clamp(value) {
        return value < 0 ? 0 : (value > 255 ? 255 : value);
    }

    // invert(100%) hue-rotate(180deg) saturate(1.25): Excalidraw's
    // IMAGE_INVERT_FILTER, each step clamped as a filter chain does.
    function invertPixels(data) {
        for (var i = 0; i < data.length; i += 4) {
            var r = 255 - data[i];
            var g = 255 - data[i + 1];
            var b = 255 - data[i + 2];

            var r2 = clamp(-0.574 * r + 1.43 * g + 0.144 * b);
            var g2 = clamp(0.426 * r + 0.43 * g + 0.144 * b);
            var b2 = clamp(0.426 * r + 1.43 * g - 0.856 * b);

            data[i] = clamp(1.19675 * r2 - 0.17875 * g2 - 0.018 * b2);
            data[i + 1] = clamp(-0.05325 * r2 + 1.07125 * g2 - 0.018 * b2);
            data[i + 2] = clamp(-0.05325 * r2 - 0.17875 * g2 + 1.232 * b2);
        }
    }

    function invertedCopy(image) {
        if (copies.has(image)) {
            return copies.get(image);
        }

        var copy = null;
        try {
            var width = image.naturalWidth || image.width;
            var height = image.naturalHeight || image.height;
            var scale = Math.min(1, MAX_SIDE / Math.max(width, height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            var context = canvas.getContext('2d');
            drawImage.call(context, image, 0, 0, canvas.width, canvas.height);
            var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            invertPixels(pixels.data);
            context.putImageData(pixels, 0, 0);
            copy = canvas;
        } catch (e) {
            // Left as it is: an inverted photo is better than none.
            console.debug('excalidraw-theme-init: photo not inverted:', e);
        }
        copies.set(image, copy);
        return copy;
    }

    var drawImage = proto.drawImage;

    Object.defineProperty(proto, 'filter', {
        configurable: true,
        enumerable: true,
        get: function() {
            return this.__poznoteFilter || 'none';
        },
        set: function(value) {
            this.__poznoteFilter = String(value);
        }
    });

    proto.drawImage = function(image) {
        var filter = this.__poznoteFilter;
        if (filter && filter.indexOf('invert(') !== -1 && image instanceof HTMLImageElement && image.complete) {
            var copy = invertedCopy(image);
            if (copy) {
                var args = Array.prototype.slice.call(arguments);
                args[0] = copy;
                // The source rectangle of the nine-argument form is in the
                // image's own pixels, which the copy may have scaled down.
                if (args.length === 9) {
                    var ratio = copy.width / (image.naturalWidth || image.width);
                    args[1] *= ratio; args[2] *= ratio; args[3] *= ratio; args[4] *= ratio;
                }
                return drawImage.apply(this, args);
            }
        }
        return drawImage.apply(this, arguments);
    };
})();
