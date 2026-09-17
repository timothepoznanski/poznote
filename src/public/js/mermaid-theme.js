/**
 * Mermaid colours taken from the active theme (discussion #1404).
 *
 * Mermaid only knows its own presets, so passing 'default' or 'dark' left every
 * named or custom theme with Mermaid's greys, and its base theme darkens the
 * section colours of mindmaps, timelines and kanban boards by itself (75% in
 * dark mode), which is where the black and maroon fills came from. This reads
 * the theme tokens at render time, resolves them to hex (Mermaid's colour maths
 * cannot parse var() or color-mix()) and hands them over as themeVariables,
 * plus a themeCSS block that restates the section fills after that darkening.
 *
 * window.poznoteMermaidTheme()
 *   { config, key }  config for mermaid.initialize(); key changes whenever the
 *                    resolved colours do, so a diagram drawn under another
 *                    theme can be told apart from one that is current.
 * window.poznoteRefreshMermaidTheme()
 *   redraws the diagrams after a theme switch, once a swapped custom
 *   stylesheet has loaded.
 */
(function () {
    'use strict';

    // Mermaid cycles through 12 section colours (THEME_COLOR_LIMIT).
    var SERIES = ['blue', 'green', 'orange', 'purple', 'teal', 'pink',
        'amber', 'indigo', 'red', 'cyan', 'lime', 'brown'];

    var canvasCtx = null;

    function getCanvasContext() {
        if (!canvasCtx) {
            var canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            canvasCtx = canvas.getContext('2d', { willReadFrequently: true });
        }
        return canvasCtx;
    }

    // Any CSS colour the browser computed (rgb(), color(srgb ...), oklch()...)
    // painted on a pixel and read back as [r, g, b, a].
    function parseComputedColor(value) {
        var ctx = getCanvasContext();
        if (!ctx || !value) return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        var d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
    }

    function resolveColor(probe, cssValue) {
        probe.style.color = '';
        probe.style.color = cssValue;
        return parseComputedColor(getComputedStyle(probe).color);
    }

    function flatten(rgba, ground) {
        if (!rgba) return ground;
        var a = rgba[3];
        if (a >= 1 || !ground) return [rgba[0], rgba[1], rgba[2]];
        return mix([rgba[0], rgba[1], rgba[2]], ground, a);
    }

    // `amount` of `a` over `b`, like color-mix(in srgb, a amount, b).
    function mix(a, b, amount) {
        return [0, 1, 2].map(function (i) {
            return Math.round(a[i] * amount + b[i] * (1 - amount));
        });
    }

    function hex(rgb) {
        return '#' + rgb.map(function (c) {
            var h = Math.max(0, Math.min(255, c)).toString(16);
            return h.length === 1 ? '0' + h : h;
        }).join('');
    }

    function luminance(rgb) {
        var c = rgb.map(function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    function contrast(a, b) {
        var la = luminance(a);
        var lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    // The theme's text colour, unless the page ground reads better on `fill`
    // (a bright fill in a dark theme, a dark one in a light theme).
    function readableOn(fill, text, ground) {
        return contrast(fill, text) >= contrast(fill, ground) ? text : ground;
    }

    function readTokens() {
        var root = document.documentElement;
        var isDark = root.getAttribute('data-theme') === 'dark';
        var host = document.body || root;

        // The diagram sits on the .mermaid box, so its own background is the
        // ground everything is mixed into (a custom theme may restyle it).
        var probe = document.createElement('div');
        probe.className = 'mermaid';
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;width:0;height:0;padding:0;margin:0;overflow:hidden;visibility:hidden;pointer-events:none;';
        host.appendChild(probe);

        try {
            var pageBg = flatten(resolveColor(probe, 'var(--pz-bg, ' + (isDark ? '#252526' : '#ffffff') + ')'), [255, 255, 255]);
            var boxBg = parseComputedColor(getComputedStyle(probe).backgroundColor);
            var bg = boxBg && boxBg[3] > 0 ? flatten(boxBg, pageBg) : pageBg;

            var get = function (cssValue) {
                return flatten(resolveColor(probe, cssValue), bg);
            };

            var tokens = {
                isDark: isDark,
                bg: bg,
                text: get('var(--pz-text, ' + (isDark ? '#bebebe' : '#333333') + ')'),
                muted: get('var(--pz-text-muted, ' + (isDark ? '#a0a0a0' : '#6b7280') + ')'),
                border: get('var(--pz-border-strong, ' + (isDark ? '#555555' : '#d1d5db') + ')'),
                // The dark layer keeps its own accent: --pz-accent is the light
                // fill, too dark to read as a line on a dark ground.
                accent: get(isDark ? 'var(--dm-accent, var(--pz-accent, #4a9eff))' : 'var(--pz-accent, #007db8)'),
                colors: {}
            };
            SERIES.concat(['yellow', 'gray']).forEach(function (id) {
                tokens.colors[id] = get('var(--pz-color-' + id + ', var(--pz-accent, #007db8))');
            });
            return tokens;
        } finally {
            host.removeChild(probe);
        }
    }

    function buildConfig(t) {
        var bg = t.bg;
        var text = t.text;
        // How much colour goes into a fill: enough to tell sections apart,
        // little enough that the theme's text colour still reads on it.
        var fillAmount = t.isDark ? 0.35 : 0.45;

        var fills = SERIES.map(function (id) { return mix(t.colors[id], bg, fillAmount); });
        var labels = fills.map(function (f) { return readableOn(f, text, bg); });
        var lines = SERIES.map(function (id) { return t.colors[id]; });

        var nodeFill = mix(t.accent, bg, t.isDark ? 0.22 : 0.12);
        var softFill = mix(text, bg, 0.08);
        var faintFill = mix(text, bg, 0.04);
        var noteFill = mix(t.colors.yellow, bg, t.isDark ? 0.25 : 0.3);
        var rootFill = mix(t.accent, bg, t.isDark ? 0.4 : 0.5);

        var v = {
            darkMode: t.isDark,
            background: hex(bg),
            primaryColor: hex(nodeFill),
            primaryBorderColor: hex(t.accent),
            primaryTextColor: hex(readableOn(nodeFill, text, bg)),
            secondaryColor: hex(softFill),
            secondaryBorderColor: hex(t.border),
            secondaryTextColor: hex(text),
            tertiaryColor: hex(faintFill),
            tertiaryBorderColor: hex(t.border),
            tertiaryTextColor: hex(text),
            mainBkg: hex(nodeFill),
            nodeBorder: hex(t.accent),
            nodeTextColor: hex(readableOn(nodeFill, text, bg)),
            textColor: hex(text),
            titleColor: hex(text),
            lineColor: hex(t.muted),
            defaultLinkColor: hex(t.muted),
            arrowheadColor: hex(t.muted),
            clusterBkg: hex(faintFill),
            clusterBorder: hex(t.border),
            edgeLabelBackground: hex(bg),
            labelBackgroundColor: hex(bg),
            classText: hex(text),
            errorBkgColor: hex(mix(t.colors.red, bg, 0.2)),
            errorTextColor: hex(t.colors.red),

            // Sequence diagrams
            actorBkg: hex(nodeFill),
            actorBorder: hex(t.accent),
            actorTextColor: hex(readableOn(nodeFill, text, bg)),
            actorLineColor: hex(t.muted),
            signalColor: hex(text),
            signalTextColor: hex(text),
            labelBoxBkgColor: hex(nodeFill),
            labelBoxBorderColor: hex(t.accent),
            labelTextColor: hex(text),
            loopTextColor: hex(text),
            activationBkgColor: hex(softFill),
            activationBorderColor: hex(t.border),
            sequenceNumberColor: hex(bg),
            noteBkgColor: hex(noteFill),
            noteBorderColor: hex(t.colors.yellow),
            noteTextColor: hex(readableOn(noteFill, text, bg)),

            // State, class and ER diagrams
            transitionColor: hex(t.muted),
            transitionLabelColor: hex(text),
            stateBkg: hex(nodeFill),
            compositeBackground: hex(bg),
            altBackground: hex(faintFill),
            compositeTitleBackground: hex(nodeFill),
            rowOdd: hex(bg),
            rowEven: hex(faintFill),

            // Gantt
            sectionBkgColor: hex(mix(t.accent, bg, 0.08)),
            altSectionBkgColor: hex(bg),
            sectionBkgColor2: hex(faintFill),
            excludeBkgColor: hex(softFill),
            gridColor: hex(t.border),
            taskBkgColor: hex(mix(t.accent, bg, 0.35)),
            taskBorderColor: hex(t.accent),
            activeTaskBkgColor: hex(mix(t.accent, bg, 0.18)),
            activeTaskBorderColor: hex(t.accent),
            doneTaskBkgColor: hex(mix(t.colors.gray, bg, 0.3)),
            doneTaskBorderColor: hex(t.colors.gray),
            critBkgColor: hex(mix(t.colors.red, bg, 0.35)),
            critBorderColor: hex(t.colors.red),
            todayLineColor: hex(t.colors.red),
            taskTextColor: hex(text),
            taskTextDarkColor: hex(text),
            taskTextLightColor: hex(text),
            taskTextOutsideColor: hex(text),
            taskTextClickableColor: hex(t.accent),

            // Pie
            pieTitleTextColor: hex(text),
            pieSectionTextColor: hex(text),
            pieLegendTextColor: hex(text),
            pieStrokeColor: hex(bg),
            pieOuterStrokeColor: hex(t.border),
            pieOpacity: '1',

            xyChart: {
                backgroundColor: hex(bg),
                titleColor: hex(text),
                xAxisLabelColor: hex(text),
                xAxisTitleColor: hex(text),
                xAxisTickColor: hex(t.muted),
                xAxisLineColor: hex(t.muted),
                yAxisLabelColor: hex(text),
                yAxisTitleColor: hex(text),
                yAxisTickColor: hex(t.muted),
                yAxisLineColor: hex(t.muted),
                plotColorPalette: lines.map(hex).join(',')
            },
            radar: {
                axisColor: hex(t.muted),
                graticuleColor: hex(t.border)
            }
        };

        var css = '';
        for (var i = 0; i < SERIES.length; i++) {
            v['cScale' + i] = hex(fills[i]);
            v['cScaleInv' + i] = hex(lines[i]);
            v['cScaleLabel' + i] = hex(labels[i]);
            v['pie' + (i + 1)] = hex(fills[i]);
            if (i < 8) {
                v['fillType' + i] = hex(fills[i]);
                v['git' + i] = hex(lines[i]);
                v['gitInv' + i] = hex(bg);
                v['gitBranchLabel' + i] = hex(readableOn(lines[i], text, bg));
            }

            // Mermaid numbers the sections from -1 against cScale0.
            var s = '.section-' + (i - 1);
            css += s + ' rect,' + s + ' path,' + s + ' circle,' + s + ' polygon{fill:' + hex(fills[i]) + ';}' +
                s + ' text{fill:' + hex(labels[i]) + ';}' +
                // Mermaid colours .section-2 span with the root label colour.
                s + ' span{color:' + hex(labels[i]) + ';}' +
                '.section-edge-' + (i - 1) + '{stroke:' + hex(lines[i]) + ';}';
        }
        css += '.section-root rect,.section-root path,.section-root circle,.section-root polygon{fill:' + hex(rootFill) + ';}' +
            '.section-root text{fill:' + hex(readableOn(rootFill, text, bg)) + ';}' +
            '.section-root span{color:' + hex(readableOn(rootFill, text, bg)) + ';}';

        return {
            startOnLoad: false,
            theme: 'base',
            themeVariables: v,
            themeCSS: css,
            flowchart: {
                htmlLabels: false
            }
        };
    }

    function hashString(str) {
        var h = 5381;
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
    }

    window.poznoteMermaidTheme = function () {
        var config = buildConfig(readTokens());
        return {
            config: config,
            key: hashString(JSON.stringify(config.themeVariables) + config.themeCSS)
        };
    };

    var waitingForStylesheet = false;

    window.poznoteRefreshMermaidTheme = function () {
        if (typeof initMermaid !== 'function' || !document.querySelector('.mermaid')) return;
        var rerender = function () { initMermaid(); };

        // A custom theme swaps the stylesheet link: its tokens only apply once
        // the new file is in. Nothing re-renders when the key is unchanged, so
        // the extra pass is free when the link did not change.
        var link = document.getElementById('poznote-custom-css');
        if (link && link.getAttribute('href') && !waitingForStylesheet) {
            waitingForStylesheet = true;
            link.addEventListener('load', function () {
                waitingForStylesheet = false;
                rerender();
            }, { once: true });
        }
        requestAnimationFrame(rerender);
    };
})();
