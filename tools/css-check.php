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

if ($errors === 0) {
    echo count($files) . " stylesheet(s) balanced\n";
    exit(0);
}
exit(2);
