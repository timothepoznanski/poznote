<?php
/**
 * Every web-reachable page must decide, by itself, whether the caller is allowed in.
 *
 * nginx serves src/public/ as the document root, so every .php file under it is
 * an entry point someone can hit directly. There is no front controller and no
 * middleware: each file is responsible for calling its own gate. Today all of
 * them do, but nothing enforces it, and the default behaviour when a gate is
 * missing is the dangerous one. db_connect.php, on an unauthenticated request
 * that is not a public link, falls back to opening user 1's database (see the
 * "not authenticated and not a public link" branch in src/db_connect.php). A new
 * page that forgets its gate therefore does not break in an obvious way: it
 * quietly serves user 1's notes.
 *
 * This test closes that class of bug. It walks src/public/, and requires each
 * file to either call one of the gate functions declared in src/auth.php, or to
 * appear in NO_GATE below with a written reason. Adding a page without a gate
 * now fails CI instead of shipping.
 *
 * Scope, stated honestly: this proves a gate is CALLED, not that the right one
 * is called or that the authorisation logic behind it is correct. It is a
 * structural guarantee, not a substitute for per-endpoint isolation tests.
 */

/** The functions in src/auth.php that stop an unauthorised request. */
const AUTH_GATES = [
    'requireAuth',           // HTML pages: redirects to login.php
    'requireAdmin',          // HTML pages, admin only
    'requireApiAuth',        // API endpoints: 401 with a JSON body
    'requireApiAuthUser',
    'requireApiAuthAdmin',
];

/**
 * Files allowed to run without calling a gate, each with the reason it is safe.
 *
 * Before adding an entry here, be sure the page cannot reach user data. A file
 * belongs in this list only if it is genuinely reachable by an anonymous
 * caller, or if it enforces authentication in a shape the gate functions do not
 * cover. Everything else must call a gate.
 */
const NO_GATE = [
    // The authentication flow itself. These are the pages you reach precisely
    // because you are not authenticated yet.
    'login.php'          => 'the login form and its POST handler',
    'logout.php'         => 'ends the session, nothing to protect',
    'oidc.php'           => 'OIDC configuration and helpers, defines functions and requires config, no top-level side effect',
    'oidc_login.php'     => 'starts the SSO redirect to the identity provider',
    'oidc_callback.php'  => 'receives the identity provider callback, authenticates as its own job',

    // Public sharing. These authenticate against a share token, a slug or a
    // share password rather than a session, which is the whole feature.
    'public_note.php'    => 'shared note links, gated by share token and optional share password',
    'public_folder.php'  => 'shared folder links, same gate as public_note.php',

    // Anonymous by design, and touching no user data.
    'api_health.php'     => 'reverse proxy health check, returns status, service name and version only',
    'index_css.php'      => 'concatenates the static stylesheets, reads no database',
    'index_js.php'       => 'concatenates the static scripts, reads no database',
    'dark_mode_css.php'  => 'concatenates the dark theme stylesheets, reads no database',

    // Authenticated, but not through a gate function.
    'audio_player.php'   => 'checks isAuthenticated() by hand and answers 401, because it renders inside a contenteditable iframe where a redirect to login.php would be invisible to the user',
];

/**
 * Returns the function names called in a file, and the files it requires.
 *
 * Both are read from the token stream rather than by grepping, so a gate named
 * in a comment does not count as a call. That is not hypothetical: the header
 * comment of src/page_bootstrap.php mentions requireApiAuth() and requireAdmin()
 * to explain when NOT to use it, and a regex reads those as three gates.
 *
 * Only literal require targets are resolved: __DIR__ . '/x.php',
 * dirname(__DIR__, n) . '/x.php', and a bare 'x.php' relative to the including
 * file. A require built from a variable is skipped, which is the safe direction
 * here since an unresolved include can only make this test stricter.
 *
 * @return array{calls: list<string>, requires: list<string>}
 */
function poznoteScanEntryPoint(string $file): array
{
    $tokens = token_get_all((string)file_get_contents($file));
    $count = count($tokens);
    $skip = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT];

    // Index of the next significant token at or after $i, or null.
    $next = static function (int $i) use ($tokens, $count, $skip): ?int {
        for (; $i < $count; $i++) {
            if (is_array($tokens[$i]) && in_array($tokens[$i][0], $skip, true)) {
                continue;
            }
            return $i;
        }
        return null;
    };
    // Index of the previous significant token at or before $i, or null.
    $prev = static function (int $i) use ($tokens, $skip): ?int {
        for (; $i >= 0; $i--) {
            if (is_array($tokens[$i]) && in_array($tokens[$i][0], $skip, true)) {
                continue;
            }
            return $i;
        }
        return null;
    };

    $calls = [];
    $requires = [];
    $includeKeywords = [T_REQUIRE, T_REQUIRE_ONCE, T_INCLUDE, T_INCLUDE_ONCE];
    $notACall = [T_FUNCTION, T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NEW];
    if (defined('T_NULLSAFE_OBJECT_OPERATOR')) {
        $notACall[] = T_NULLSAFE_OBJECT_OPERATOR;
    }

    for ($i = 0; $i < $count; $i++) {
        $token = $tokens[$i];
        if (!is_array($token)) {
            continue;
        }

        if ($token[0] === T_STRING) {
            $before = $prev($i - 1);
            if ($before !== null && is_array($tokens[$before])
                && in_array($tokens[$before][0], $notACall, true)) {
                continue; // a declaration, a method call or a class name
            }
            $after = $next($i + 1);
            if ($after !== null && $tokens[$after] === '(') {
                $calls[$token[1]] = true;
            }
            continue;
        }

        if (!in_array($token[0], $includeKeywords, true)) {
            continue;
        }

        // Collect the significant tokens of the require expression, up to ';'.
        $expression = [];
        for ($j = $i + 1; $j < $count; $j++) {
            if ($tokens[$j] === ';') {
                break;
            }
            if (is_array($tokens[$j]) && in_array($tokens[$j][0], $skip, true)) {
                continue;
            }
            $expression[] = $tokens[$j];
        }
        $target = poznoteResolveRequire($expression, $file);
        if ($target !== null) {
            $requires[$target] = true;
        }
    }

    return ['calls' => array_keys($calls), 'requires' => array_keys($requires)];
}

/** Turns the token list of a require expression into an absolute path, or null. */
function poznoteResolveRequire(array $expression, string $file): ?string
{
    if ($expression === []) {
        return null;
    }
    // Tolerate the parenthesised form: require_once(__DIR__ . '/x.php')
    if ($expression[0] === '(' && end($expression) === ')') {
        $expression = array_slice($expression, 1, -1);
    }
    if ($expression === []) {
        return null;
    }

    $base = dirname($file);
    $first = $expression[0];

    if (is_array($first) && $first[0] === T_CONSTANT_ENCAPSED_STRING && count($expression) === 1) {
        // require_once 'index_js.php', relative to the including file
        return poznoteAbsolutePath($base, $first[1]);
    }

    $rest = null;
    if (is_array($first) && $first[0] === T_DIR) {
        $rest = array_slice($expression, 1);
    } elseif (is_array($first) && $first[0] === T_STRING && strtolower($first[1]) === 'dirname') {
        // dirname(__DIR__) or dirname(__DIR__, n)
        $close = array_search(')', $expression, true);
        if ($close === false) {
            return null;
        }
        $arguments = array_slice($expression, 2, $close - 2);
        if ($arguments === [] || !is_array($arguments[0]) || $arguments[0][0] !== T_DIR) {
            return null;
        }
        $levels = 1;
        if (count($arguments) === 3 && $arguments[1] === ',' && is_array($arguments[2])
            && $arguments[2][0] === T_LNUMBER) {
            $levels = (int)$arguments[2][1];
        }
        for ($n = 0; $n < $levels; $n++) {
            $base = dirname($base);
        }
        $rest = array_slice($expression, $close + 1);
    } else {
        return null; // built from a variable, or a shape not worth guessing at
    }

    // What follows must be exactly: . 'literal'
    if (count($rest) !== 2 || $rest[0] !== '.' || !is_array($rest[1])
        || $rest[1][0] !== T_CONSTANT_ENCAPSED_STRING) {
        return null;
    }

    return poznoteAbsolutePath($base, $rest[1][1]);
}

/** Resolves a quoted literal against a base directory, if it names a real .php file. */
function poznoteAbsolutePath(string $base, string $quoted): ?string
{
    $literal = substr($quoted, 1, -1);
    if ($literal === '' || !str_ends_with($literal, '.php')) {
        return null;
    }
    $path = realpath($base . '/' . ltrim($literal, '/'));
    return ($path !== false && is_file($path)) ? $path : null;
}

/** Every .php file under src/public, as paths relative to src/public. */
function poznoteEntryPoints(): array
{
    $root = dirname(__DIR__) . '/src/public';
    $found = [];
    $tree = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($tree as $entry) {
        if ($entry->isFile() && strtolower($entry->getExtension()) === 'php') {
            $found[] = substr($entry->getPathname(), strlen($root) + 1);
        }
    }
    sort($found);
    return $found;
}

/**
 * The gates a file calls, either directly or in a file it requires.
 *
 * One level of indirection is followed, and no more. That covers
 * src/page_bootstrap.php, the shared preamble that calls requireAuth() for the
 * full-page entry points, and it is the only indirection in the tree today:
 * page_bootstrap.php is the sole library under src/ that calls a gate. Staying
 * shallow is deliberate. A gate buried three requires deep is not a guarantee a
 * reviewer can see, so it should not count as one here either. src/auth.php is
 * skipped because it declares the gates rather than calling them.
 */
function poznoteGatesFor(string $relativePath): array
{
    $root = dirname(__DIR__) . '/src';
    $file = $root . '/public/' . $relativePath;
    $scan = poznoteScanEntryPoint($file);
    $calls = $scan['calls'];

    foreach ($scan['requires'] as $required) {
        if ($required === realpath($root . '/auth.php')) {
            continue;
        }
        $calls = array_merge($calls, poznoteScanEntryPoint($required)['calls']);
    }

    return array_values(array_intersect(array_unique($calls), AUTH_GATES));
}

test('every page under src/public gates its own request', function () {
    $ungated = [];
    foreach (poznoteEntryPoints() as $page) {
        if (isset(NO_GATE[$page])) {
            continue;
        }
        if (poznoteGatesFor($page) === []) {
            $ungated[] = $page;
        }
    }

    if ($ungated !== []) {
        fail("these pages are reachable at their URL and call no gate:\n        "
            . implode("\n        ", $ungated)
            . "\n      Call requireAuth() or requireApiAuth(), or add the file to NO_GATE"
            . "\n      in this test with the reason it is safe to reach anonymously."
            . "\n      An ungated page does not fail visibly: db_connect.php falls back"
            . "\n      to user 1's database when the request is not authenticated.");
    }
});

test('the NO_GATE list has no stale entries', function () {
    $pages = poznoteEntryPoints();
    $stale = [];

    foreach (NO_GATE as $page => $reason) {
        if (!in_array($page, $pages, true)) {
            $stale[] = "{$page} (listed but no longer exists)";
            continue;
        }
        $gates = poznoteGatesFor($page);
        if ($gates !== []) {
            $stale[] = "{$page} (now calls " . implode(', ', $gates) . ", so the exemption is obsolete)";
        }
        if (trim($reason) === '') {
            $stale[] = "{$page} (exempted with no reason given)";
        }
    }

    if ($stale !== []) {
        fail("NO_GATE is out of date, remove these entries:\n        "
            . implode("\n        ", $stale));
    }
});

test('the gate names are the ones src/auth.php actually declares', function () {
    // If a gate is renamed, the list above would silently stop matching and
    // every page would look ungated, or worse, an exemption would look valid.
    $auth = (string)file_get_contents(dirname(__DIR__) . '/src/auth.php');
    foreach (AUTH_GATES as $gate) {
        if (!preg_match('/^\s*function\s+' . preg_quote($gate, '/') . '\s*\(/m', $auth)) {
            fail("AUTH_GATES names {$gate}, which src/auth.php does not declare");
        }
    }
});
