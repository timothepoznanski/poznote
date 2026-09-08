#!/usr/bin/env php
<?php
/**
 * Brace/comment balance check for the stylesheets under src/public/css.
 *
 * The CSS is served concatenated (index_css.php, dark_mode_css.php): a single
 * unclosed brace or comment silently disables every rule that follows it in
 * the bundle, and dark mode then breaks in seemingly unrelated components.
 * Run before committing CSS:
 *
 *   php tools/css-check.php            # all of src/public/css
 *   php tools/css-check.php a.css b.css
 *
 * Exit code 0 when everything balances, 2 otherwise (file:line is printed).
 */

$root = realpath(__DIR__ . '/../src/public/css');
if ($root === false) {
    fwrite(STDERR, "css-check: stylesheet directory not found (expected src/public/css)\n");
    exit(2);
}
$files = array_slice($argv, 1);
if (!$files) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($f->isFile() && strtolower($f->getExtension()) === 'css') {
            $files[] = $f->getPathname();
        }
    }
    sort($files);
}

$errors = 0;
foreach ($files as $file) {
    $css = file_get_contents($file);
    if ($css === false) {
        fwrite(STDERR, "$file: unreadable\n");
        $errors++;
        continue;
    }
    $name = str_starts_with($file, $root) ? 'src/public/css' . substr($file, strlen($root)) : $file;
    $len = strlen($css);
    $line = 1;
    $depth = 0;
    $opens = [];      // line numbers of currently open braces
    $quote = null;    // inside a string
    for ($i = 0; $i < $len; $i++) {
        $c = $css[$i];
        if ($c === "\n") {
            $line++;
            $quote = null; // CSS strings cannot span lines
            continue;
        }
        if ($quote !== null) {
            if ($c === '\\') {
                $i++;
            } elseif ($c === $quote) {
                $quote = null;
            }
            continue;
        }
        if ($c === '"' || $c === "'") {
            $quote = $c;
        } elseif ($c === '/' && $i + 1 < $len && $css[$i + 1] === '*') {
            $end = strpos($css, '*/', $i + 2);
            if ($end === false) {
                echo "$name:$line: unterminated comment\n";
                $errors++;
                break;
            }
            $line += substr_count($css, "\n", $i, $end - $i);
            $i = $end + 1;
        } elseif ($c === '{') {
            $opens[] = $line;
            $depth++;
        } elseif ($c === '}') {
            if ($depth === 0) {
                echo "$name:$line: unexpected '}' with no open block\n";
                $errors++;
            } else {
                array_pop($opens);
                $depth--;
            }
        }
    }
    if ($depth > 0) {
        echo "$name:" . end($opens) . ": block opened here is never closed\n";
        $errors++;
    }

    // The theme has one carrier: html[data-theme='dark'] (plus html.theme-black).
    // js/theme-manager.js still adds body.dark-mode / body.black-mode for custom
    // stylesheets, but it only lands at DOMContentLoaded, so styling against it
    // duplicates every rule for no extra coverage. See src/public/css/README.md.
    $stripped = preg_replace('!/\*.*?\*/!s', '', $css);
    foreach (explode("\n", $stripped) as $n => $text) {
        if (preg_match('/body\.(dark|black)-mode/', $text)) {
            echo "$name:" . ($n + 1) . ": use html[data-theme='dark'] instead of body." .
                 (str_contains($text, 'black-mode') ? 'black' : 'dark') . "-mode\n";
            $errors++;
        }
        // One carrier means one SPELLING of it. The three that were in use are
        // not interchangeable: :root[data-theme] is (0,2,0) because :root is a
        // pseudo-class, html[data-theme] is (0,1,1), and a bare [data-theme] is
        // (0,1,0). Thirteen targets were styled through more than one of them,
        // so which rule won was decided by a spelling nobody chose on purpose.
        if (preg_match_all('/(?<![\w.#\]-])(:root|\[data-theme=)|\[data-theme="[^"]*"\]/', $text, $mm, PREG_OFFSET_CAPTURE)) {
            foreach ($mm[0] as $hit) {
                [$found, $at] = $hit;
                if (!str_contains($text, 'data-theme')) {
                    continue;
                }
                if ($found === ':root' && !preg_match('/:root\s*\{/', $text)) {
                    echo "$name:" . ($n + 1) . ": write html[data-theme='dark'], not :root[data-theme=...]"
                       . " (:root is a pseudo-class, so it outweighs html)\n";
                    $errors++;
                } elseif ($found === '[data-theme=' && ($at === 0 || !preg_match('/[\w.#\]-]$/', substr($text, 0, $at)))) {
                    echo "$name:" . ($n + 1) . ": write html[data-theme='dark'], not a bare [data-theme=...]"
                       . " (a bare attribute selector weighs less than html[...])\n";
                    $errors++;
                } elseif (str_starts_with($found, '[data-theme="')) {
                    echo "$name:" . ($n + 1) . ": quote the theme attribute with ' like everywhere else\n";
                    $errors++;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Colour ratchet.
//
// The stylesheets went from 3,178 hardcoded colours to a few hundred, and what
// is left is deliberate: a video letterbox that must stay black, the text on a
// yellow search highlight, a handful of one-off component shades. Without a
// floor the count creeps straight back up, one pasted snippet at a time, and
// the app stops being themeable again. This fails when a change ADDS colours.
//
// Counted: hex, the white/black keywords, and every functional colour whose
// arguments do not name a variable. The functional forms were added late; the
// count is therefore not comparable to the hex-only figures in earlier commits.
//
// Raising the baseline is allowed but has to be a decision: put the new number
// in tools/css-check.baseline.json and say in the commit message why the colour
// could not be a token.
$baselineFile = __DIR__ . '/css-check.baseline.json';
$baseline = is_file($baselineFile)
    ? (json_decode(file_get_contents($baselineFile), true)['colour_literals'] ?? null)
    : null;

$literals = 0;
$inComponents = [];
foreach ($files as $file) {
    if (str_ends_with($file, '/tokens.css')) {
        continue;                       // the palette itself, where colours belong
    }
    $css = preg_replace('!/\*.*?\*/!s', '', (string) file_get_contents($file));
    $css = preg_replace('/^\s*--[\w-]+\s*:[^;]*;/m', '', $css);   // token definitions
    // Hex, the two colour keywords, and the functional forms. rgba() was the
    // ratchet's blind spot for months: 696 of them sat outside the palette,
    // every box-shadow and every scrim among them, while the count read clean.
    // A functional colour whose arguments name a variable is already themed.
    $n = preg_match_all('/#[0-9a-fA-F]{3,8}\b|(?<![\w-])(?:white|black)(?![\w-])/', $css);
    if (preg_match_all('/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/i', $css, $fn)) {
        foreach ($fn[1] as $args) {
            if (!str_contains($args, 'var(')) {
                $n++;
            }
        }
    }
    $literals += $n;
    if ($n > 0 && str_contains($file, '/components/')) {
        $inComponents[] = ($n) . ' in ' . basename($file);
    }
}

// A shared component base has no excuse: it is the layer a palette most needs
// to reach, so it must be entirely made of tokens.
if ($inComponents) {
    echo "css/components/ must contain no colour literal: " . implode(', ', $inComponents) . "\n";
    $errors++;
}
if ($baseline !== null && $literals > $baseline) {
    echo "colour literals: $literals, up from $baseline. Use a token, or raise the "
       . "baseline in tools/css-check.baseline.json and say why in the commit.\n";
    $errors++;
} elseif ($baseline !== null && $literals < $baseline) {
    echo "colour literals: $literals (baseline $baseline) — lower the baseline to hold the gain\n";
}

// ---------------------------------------------------------------------------
// The component layer owns its properties.
//
// css/components/*.css holds the shared bases (.btn and its modifiers, form
// controls, the logo). A page stylesheet may ADD a property the base does not
// set, and may restyle the component IN CONTEXT (.shares-page .btn-success is
// a tinted row action and has to keep winning). What it may not do is redefine
// a property the base owns on the base's own selector: that fragments the
// component silently, and the page file usually loads on more pages than its
// name suggests -- workspaces.css restyled every disabled button on five.
//
// @media blocks are exempt: a viewport IS a context, and the responsive button
// sizes are deliberate.
$componentRules = [];   // selector => [property => owning file]
$pageRules = [];        // [file, line, selector, [property => true]]
foreach ($files as $file) {
    $isComponent = str_contains(str_replace('\\', '/', $file), '/components/');
    $css = preg_replace('!/\*.*?\*/!s', '', (string) file_get_contents($file));
    $len = strlen($css);
    $buf = '';
    $atDepth = 0;       // nesting inside @media / @supports
    $depth = 0;
    $line = 1;
    for ($i = 0; $i < $len; $i++) {
        $c = $css[$i];
        if ($c === "\n") {
            $line++;
        }
        if ($c === '{') {
            $prelude = trim(preg_replace('/\s+/', ' ', $buf));
            $buf = '';
            if ($prelude !== '' && $prelude[0] === '@') {
                $atDepth++;
                $depth++;
                continue;
            }
            // A declaration block: read to its matching close.
            $end = strpos($css, '}', $i);
            if ($end === false) {
                break;
            }
            $body = substr($css, $i + 1, $end - $i - 1);
            $props = [];
            foreach (explode(';', $body) as $decl) {
                if (!str_contains($decl, ':')) {
                    continue;
                }
                $prop = strtolower(trim(explode(':', $decl, 2)[0]));
                if ($prop !== '' && !str_starts_with($prop, '--')) {
                    $props[$prop] = true;
                }
            }
            foreach (explode(',', $prelude) as $sel) {
                $sel = trim($sel);
                if ($sel === '') {
                    continue;
                }
                if ($isComponent) {
                    foreach ($props as $prop => $_) {
                        $componentRules[$sel][$prop] = basename($file);
                    }
                } elseif ($atDepth === 0) {
                    $pageRules[] = [$file, $line, $sel, $props];
                }
            }
            $line += substr_count($css, "\n", $i, $end - $i);
            $i = $end;
            continue;
        }
        if ($c === '}') {
            if ($depth > 0) {
                $depth--;
                if ($atDepth > 0) {
                    $atDepth--;
                }
            }
            $buf = '';
            continue;
        }
        $buf .= $c;
    }
}
foreach ($pageRules as [$file, $line, $sel, $props]) {
    if (!isset($componentRules[$sel])) {
        continue;
    }
    $clash = array_intersect_key($props, $componentRules[$sel]);
    if (!$clash) {
        continue;
    }
    $name = str_starts_with($file, $root) ? 'src/public/css' . substr($file, strlen($root)) : $file;
    $owner = reset($componentRules[$sel]);
    echo "$name:$line: \"$sel\" redefines " . implode(', ', array_keys($clash)) .
         ", owned by components/$owner. Add a context to the selector, or move the value into the base.\n";
    $errors++;
}

// ---------------------------------------------------------------------------
// @keyframes names are one global namespace, and the last definition wins.
//
// Two animations found by this check had been silently replaced: a de-dup pass
// emptied @keyframes slideDown in search-replace.css and left the reference in
// place, so the search bar's opening animation did nothing; and settings.css
// declared a heartbeat it never used which, loading later, overrode the real
// beating heart on the Support card across seven pages. Nothing rendered an
// error either time. Same-named blocks are fine as long as they AGREE.
//
// Empty rules go with it: a declaration block with nothing in it says nothing
// to anyone but the parser, and an empty @keyframes is how the first bug hid.
$frames = [];       // name => [ [file, normalised body] ]
$emptyRules = [];
foreach ($files as $file) {
    $css = preg_replace('!/\*.*?\*/!s', '', (string) file_get_contents($file));
    $name = str_starts_with($file, $root) ? 'src/public/css' . substr($file, strlen($root)) : $file;
    $len = strlen($css);
    for ($i = 0; $i < $len; $i++) {
        if ($css[$i] !== '@' || !preg_match('/\G@(-\w+-)?keyframes\s+([\w-]+)\s*\{/', $css, $m, 0, $i)) {
            continue;
        }
        $start = $i + strlen($m[0]);
        $depth = 1;
        $j = $start;
        while ($j < $len && $depth > 0) {
            if ($css[$j] === '{') {
                $depth++;
            } elseif ($css[$j] === '}') {
                $depth--;
            }
            $j++;
        }
        $body = substr($css, $start, $j - $start - 1);
        // from/to and 0%/100% are the same keyframe: compare meaning, not text.
        $body = strtolower(preg_replace('/\s+/', '', $body));
        $body = str_replace(['from{', 'to{'], ['0%{', '100%{'], $body);
        $frames[($m[1] ?? '') . $m[2]][] = [$name, $body];
        $i = $j - 1;
    }
    // Une regle vide: un prelude qui n'est pas une at-rule, suivi de {}
    if (preg_match_all('/(^|[};])\s*([^{};@]+?)\s*\{\s*\}/', $css, $e, PREG_SET_ORDER)) {
        foreach ($e as $x) {
            $emptyRules[] = "$name: " . trim(preg_replace('/\s+/', ' ', $x[2]));
        }
    }
}
foreach ($frames as $kfName => $defs) {
    if (count($defs) < 2) {
        continue;
    }
    $bodies = array_unique(array_column($defs, 1));
    if (count($bodies) === 1) {
        continue;                    // duplique mais d'accord avec lui-meme
    }
    echo "@keyframes $kfName is defined " . count($defs) . " times with different bodies; "
       . "the last one loaded silently replaces the others: "
       . implode(', ', array_map(fn($d) => $d[0] . ($d[1] === '' ? ' (empty)' : ''), $defs)) . "\n";
    $errors++;
}
foreach ($emptyRules as $r) {
    echo "$r: empty rule, delete it or say what it is for in a comment\n";
    $errors++;
}

// ---------------------------------------------------------------------------
// The same ratchet, over the markup.
//
// The colour ratchet above guards src/public/css and nothing else, so it read
// clean while 534 colour literals sat in the project's own PHP and JS: inline
// style attributes, <style> blocks inside a page, colours handed to JS. A
// theme cannot reach any of them, and a green number over a third of the
// surface is worse than no number.
//
// Some of it is legitimate and is listed with a reason in the baseline file:
// email HTML (no var() in mail clients), standalone exports that must render
// outside the app, and colours that are DATA rather than chrome, like the
// brand colours of programming languages or a user's folder-colour palette.
$markupBaseline = is_file($baselineFile)
    ? (json_decode(file_get_contents($baselineFile), true)['markup_literals'] ?? null)
    : null;
$exempt = is_file($baselineFile)
    ? (json_decode(file_get_contents($baselineFile), true)['markup_exempt'] ?? [])
    : [];

$repo = dirname(__DIR__);
$markup = 0;
$markupPer = [];
$vendorish = ['mermaid', 'swagger', 'katex', 'excalidraw', 'codemirror', '/lib/', '.min.js', 'highlight'];
$srcDir = $repo . '/src';
if (is_dir($srcDir)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($srcDir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (!$f->isFile()) {
            continue;
        }
        $path = str_replace('\\', '/', $f->getPathname());
        $rel = substr($path, strlen($repo) + 1);
        if (!preg_match('/\.(php|js)$/', $path)) {
            continue;
        }
        if (str_contains($path, '/css/') || str_contains($path, '/vendor/')
            || str_contains($path, '-dist') || str_contains($path, 'node_modules')) {
            continue;
        }
        foreach ($vendorish as $v) {
            if (str_contains(strtolower($path), $v)) {
                continue 2;
            }
        }
        if (isset($exempt[$rel])) {
            continue;
        }
        $body = (string) file_get_contents($path);
        if (!preg_match_all('/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/', $body, $mk)) {
            continue;
        }
        $n = 0;
        foreach ($mk[0] as $hit) {
            if (!str_contains($hit, 'var(')) {
                $n++;
            }
        }
        if ($n > 0) {
            $markup += $n;
            $markupPer[$rel] = $n;
        }
    }
}
if ($markupBaseline !== null && $markup > $markupBaseline) {
    arsort($markupPer);
    $worst = array_slice($markupPer, 0, 3, true);
    $shown = [];
    foreach ($worst as $file => $n) {
        $shown[] = "$file ($n)";
    }
    echo "colour literals in PHP/JS: $markup, up from $markupBaseline. Put the colour in a "
       . "token and read it from CSS, or add the file to markup_exempt in "
       . "tools/css-check.baseline.json WITH a reason. Biggest holders: "
       . implode(', ', $shown) . "\n";
    $errors++;
} elseif ($markupBaseline !== null && $markup < $markupBaseline) {
    echo "colour literals in PHP/JS: $markup (baseline $markupBaseline) — lower the baseline to hold the gain\n";
}

// ---------------------------------------------------------------------------
// A generic dark rule must not outweigh its light twin.
//
// Page stylesheets load AFTER the light bases and BEFORE the dark layer, so at
// equal specificity a page rule wins in light and loses in dark. On top of that
// the carrier itself adds (0,1,1): html[data-theme='dark'] a is (0,2,1) while
// its light twin `a` is (0,0,1), two whole steps heavier. Anything the light
// rule loses to, the dark one beats.
//
// That is not theory. The icon rail declares its own muted colour and got the
// link accent in dark and not in light. The dashboard's dialog buttons stayed
// transparent only because someone had spelled the carrier :root. A disabled
// primary button took a page's grey label onto its accent fill.
//
// So: a dark rule that targets no class or id of its own and paints a colour
// has to wrap its carrier in :where(), which weighs nothing. It still wins over
// its light twin, by load order, exactly as in light. Rules that name a class
// are not affected: they are meant to be specific.
$carrier = "/^\s*(?<where>:where\()?html(?:\.theme-black)?\[data-theme='(?:dark|light)'\]\)?\s*/";
$paints  = '/(^|[;{\s])(color|background|background-color|border[a-z-]*color|fill|stroke|opacity)\s*:/i';
$allow = is_file($baselineFile)
    ? (json_decode(file_get_contents($baselineFile), true)['carrier_weight_allow'] ?? [])
    : [];
foreach ($files as $file) {
    $rel = str_starts_with($file, $root) ? 'src/public/css' . substr($file, strlen($root)) : $file;
    $short = ltrim(str_replace('src/public/css', '', $rel), '/');
    $css = preg_replace('!/\*.*?\*/!s', '', (string) file_get_contents($file));
    if (!preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $rules, PREG_SET_ORDER)) {
        continue;
    }
    foreach ($rules as $r) {
        $prelude = trim(preg_replace('/\s+/', ' ', $r[1]));
        if ($prelude === '' || $prelude[0] === '@' || !preg_match($paints, $r[2])) {
            continue;
        }
        foreach (explode(',', $prelude) as $sel) {
            $sel = trim($sel);
            if (!preg_match($carrier, $sel, $m)) {
                continue;
            }
            if (($m['where'] ?? '') !== '') {
                continue;                       // deja neutralise
            }
            $rest = trim(preg_replace($carrier, '', $sel));
            if ($rest === '') {
                continue;                       // le porteur lui-meme, pas une regle generique
            }
            // Specificite du reste. :where() ne pese rien; :not(), :is() et :has()
            // pesent le contenu de leur argument, donc :has(body.tasks-page) rend
            // une regle specifique et non generique.
            $counted = preg_replace('/:where\([^()]*(?:\([^()]*\)[^()]*)*\)/', '', $rest);
            $counted = preg_replace('/:(?:not|is|has)\(/', ' ', $counted);
            // Nommer une classe ou un id, c'est viser quelque chose: pas generique.
            if (preg_match('/[.#][\w-]/', $counted)) {
                continue;
            }
            $weight = preg_match_all('/\[[^\]]+\]/', $counted)
                    + preg_match_all('/(?<!:):(?!not|is|where|has|before|after|first-line|first-letter|placeholder|marker|selection|backdrop)[\w-]+/', $counted);
            if ($weight > 1) {
                continue;                       // deja assez specifique pour ne pas detourner
            }
            if (isset($allow[$short]) && in_array($rest, $allow[$short], true)) {
                continue;
            }
            echo "$rel: \"$sel\" is a generic dark rule painting a colour. Wrap the carrier "
               . "in :where() so it weighs what its light twin weighs, or add it to "
               . "carrier_weight_allow in tools/css-check.baseline.json with a reason.\n";
            $errors++;
        }
    }
}

if ($errors === 0) {
    echo count($files) . " stylesheet(s) balanced, $literals colour literal(s) in CSS, $markup in PHP/JS\n";
    exit(0);
}
exit(2);
