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
    if (str_ends_with($file, 'dark-mode/variables.css')) {
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

if ($errors === 0) {
    echo count($files) . " stylesheet(s) balanced, $literals colour literal(s)\n";
    exit(0);
}
exit(2);
