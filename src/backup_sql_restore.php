<?php
/**
 * Safe handling of the SQL dump carried by a Poznote backup archive.
 *
 * A backup archive is user-supplied input: anyone allowed to restore a
 * backup can put whatever they want in database/poznote_backup.sql. Running
 * that file blindly lets a regular account ATTACH other database files (the
 * master user database, or a brand new file under the web root) and escalate
 * to administrator or execute code on the server (GHSA-rmm5-6582-qcmc).
 *
 * The dump Poznote writes (generateSQLDumpForConnection in backup_zip.php)
 * only ever contains three kinds of statements: DROP TABLE, CREATE TABLE and
 * INSERT ... VALUES with literal values. The restore therefore parses the
 * file into statements, accepts nothing but those shapes (plus CREATE INDEX
 * and BEGIN/COMMIT for hand-made dumps), and runs each statement on a
 * connection whose SQLite authorizer refuses ATTACH, PRAGMA, virtual tables,
 * triggers, views and extension loading as a second line of defence.
 */

/**
 * Parse a backup dump into the list of statements to execute.
 *
 * Nothing is executed here: the caller can validate a dump before touching
 * the existing database.
 *
 * @param string $sql Content of database/poznote_backup.sql
 * @return array ['success' => bool, 'statements' => string[], 'error' => string]
 */
function poznoteParseBackupSql($sql) {
    if (!is_string($sql) || trim($sql) === '') {
        return ['success' => false, 'statements' => [], 'error' => 'the SQL dump is empty'];
    }

    $statements = [];
    $index = 0;
    foreach (poznoteBackupSqlSplitStatements($sql) as $statement) {
        $index++;
        $check = poznoteBackupSqlValidateStatement($statement);
        if ($check === 'skip') {
            continue;
        }
        if ($check !== true) {
            $preview = preg_replace('/\s+/', ' ', substr($statement, 0, 80));
            if (strlen($statement) > 80) {
                $preview .= '...';
            }
            return [
                'success' => false,
                'statements' => [],
                'error' => 'statement ' . $index . ' is not allowed in a Poznote backup: ' . $check . ' ("' . $preview . '")'
            ];
        }
        $statements[] = $statement;
    }

    if (count($statements) === 0) {
        return ['success' => false, 'statements' => [], 'error' => 'the SQL dump contains no statement'];
    }

    return ['success' => true, 'statements' => $statements, 'error' => ''];
}

/**
 * Execute pre-validated backup statements into a (fresh) SQLite database.
 *
 * Every statement runs inside one transaction on a connection guarded by an
 * authorizer, so even a statement the grammar check let through cannot
 * attach another database, change pragmas or load an extension.
 *
 * @param string $dbPath Path of the SQLite database to write
 * @param string[] $statements Statements returned by poznoteParseBackupSql()
 * @return array ['success' => bool, 'error' => string]
 */
function poznoteExecuteBackupSql($dbPath, array $statements) {
    if (!class_exists('SQLite3')) {
        return poznoteExecuteBackupSqlWithPdo($dbPath, $statements);
    }

    $db = null;
    try {
        $db = new SQLite3($dbPath);
        $db->enableExceptions(true);
        $db->busyTimeout(5000);
        $db->setAuthorizer('poznoteBackupSqlAuthorizer');

        $db->exec('BEGIN');
        try {
            foreach ($statements as $statement) {
                $db->exec($statement);
            }
            $db->exec('COMMIT');
        } catch (Throwable $e) {
            try {
                $db->exec('ROLLBACK');
            } catch (Throwable $rollbackError) {
                // The connection is closed below anyway
            }
            throw $e;
        }
        $db->close();
        return ['success' => true, 'error' => ''];
    } catch (Throwable $e) {
        if ($db instanceof SQLite3) {
            try {
                $db->close();
            } catch (Throwable $closeError) {
                // Ignore, the error to report is $e
            }
        }
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * SQLite authorizer used while restoring a backup: refuse every action the
 * dump never needs and that could reach outside the database being restored.
 *
 * @return int SQLite3::OK or SQLite3::DENY
 */
function poznoteBackupSqlAuthorizer($action, $arg1 = null, $arg2 = null, $dbName = null, $trigger = null) {
    static $denied = null;
    if ($denied === null) {
        $denied = array_flip([
            SQLite3::ATTACH,
            SQLite3::DETACH,
            SQLite3::PRAGMA,
            SQLite3::ALTER_TABLE,
            SQLite3::CREATE_VTABLE,
            SQLite3::DROP_VTABLE,
            SQLite3::CREATE_TRIGGER,
            SQLite3::CREATE_TEMP_TRIGGER,
            SQLite3::DROP_TRIGGER,
            SQLite3::DROP_TEMP_TRIGGER,
            SQLite3::CREATE_VIEW,
            SQLite3::CREATE_TEMP_VIEW,
            SQLite3::DROP_VIEW,
            SQLite3::DROP_TEMP_VIEW,
            SQLite3::CREATE_TEMP_TABLE,
            SQLite3::CREATE_TEMP_INDEX,
        ]);
    }
    if (isset($denied[(int)$action])) {
        return SQLite3::DENY;
    }
    if ((int)$action === SQLite3::FUNCTION) {
        // Functions able to touch the filesystem or the schema
        $blockedFunctions = ['load_extension', 'readfile', 'writefile', 'edit', 'fts3_tokenizer', 'sqlite_compileoption_used', 'sqlite_compileoption_get'];
        if (in_array(strtolower((string)$arg2), $blockedFunctions, true)) {
            return SQLite3::DENY;
        }
    }
    return SQLite3::OK;
}

/**
 * Fallback when the SQLite3 extension is missing: the grammar check already
 * removed everything but DROP/CREATE TABLE, CREATE INDEX and literal INSERTs,
 * so running the statements one by one through PDO is safe.
 */
function poznoteExecuteBackupSqlWithPdo($dbPath, array $statements) {
    try {
        $con = new PDO('sqlite:' . $dbPath);
        $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $con->exec('PRAGMA busy_timeout = 5000');
        $con->beginTransaction();
        try {
            foreach ($statements as $statement) {
                $con->exec($statement);
            }
            $con->commit();
        } catch (Throwable $e) {
            $con->rollBack();
            throw $e;
        }
        $con = null;
        return ['success' => true, 'error' => ''];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Split SQL text into statements, honouring string literals, quoted
 * identifiers and comments (a ';' inside a note's HTML must not split).
 * Comments are dropped. Returned statements are trimmed and non-empty.
 *
 * @return string[]
 */
function poznoteBackupSqlSplitStatements($sql) {
    $statements = [];
    $current = '';
    $length = strlen($sql);
    $pos = 0;

    while ($pos < $length) {
        // Jump to the next character that can change the parsing state
        $chunkLength = strcspn($sql, "'\"`[;-/", $pos);
        if ($chunkLength > 0) {
            $current .= substr($sql, $pos, $chunkLength);
            $pos += $chunkLength;
            if ($pos >= $length) {
                break;
            }
        }

        $char = $sql[$pos];
        switch ($char) {
            case ';':
                $trimmed = trim($current);
                if ($trimmed !== '') {
                    $statements[] = $trimmed;
                }
                $current = '';
                $pos++;
                break;

            case "'":
                // String literal, '' is an escaped quote
                $end = $pos + 1;
                while (true) {
                    $quote = strpos($sql, "'", $end);
                    if ($quote === false) {
                        $end = $length;
                        break;
                    }
                    if ($quote + 1 < $length && $sql[$quote + 1] === "'") {
                        $end = $quote + 2;
                        continue;
                    }
                    $end = $quote + 1;
                    break;
                }
                $current .= substr($sql, $pos, $end - $pos);
                $pos = $end;
                break;

            case '"':
            case '`':
            case '[':
                $closing = ($char === '[') ? ']' : $char;
                $end = $pos + 1;
                while (true) {
                    $quote = strpos($sql, $closing, $end);
                    if ($quote === false) {
                        $end = $length;
                        break;
                    }
                    if ($char !== '[' && $quote + 1 < $length && $sql[$quote + 1] === $closing) {
                        $end = $quote + 2;
                        continue;
                    }
                    $end = $quote + 1;
                    break;
                }
                $current .= substr($sql, $pos, $end - $pos);
                $pos = $end;
                break;

            case '-':
                if ($pos + 1 < $length && $sql[$pos + 1] === '-') {
                    // Line comment: drop it
                    $newline = strpos($sql, "\n", $pos);
                    $pos = ($newline === false) ? $length : $newline + 1;
                    $current .= ' ';
                } else {
                    $current .= $char;
                    $pos++;
                }
                break;

            case '/':
                if ($pos + 1 < $length && $sql[$pos + 1] === '*') {
                    // Block comment: drop it
                    $close = strpos($sql, '*/', $pos + 2);
                    $pos = ($close === false) ? $length : $close + 2;
                    $current .= ' ';
                } else {
                    $current .= $char;
                    $pos++;
                }
                break;

            default:
                $current .= $char;
                $pos++;
                break;
        }
    }

    $trimmed = trim($current);
    if ($trimmed !== '') {
        $statements[] = $trimmed;
    }

    return $statements;
}

/**
 * Tokenize one statement (comments already removed by the splitter).
 *
 * @return array|null List of ['type' => word|ident|string|blob|number|punct, 'value' => string],
 *                    or null when the text cannot be tokenized
 */
function poznoteBackupSqlTokenize($statement) {
    $tokens = [];
    $length = strlen($statement);
    $pos = 0;

    while ($pos < $length) {
        $pos += strspn($statement, " \t\r\n\f\v", $pos);
        if ($pos >= $length) {
            break;
        }
        $char = $statement[$pos];

        if ($char === "'") {
            $end = $pos + 1;
            while (true) {
                $quote = strpos($statement, "'", $end);
                if ($quote === false) {
                    return null; // unterminated string
                }
                if ($quote + 1 < $length && $statement[$quote + 1] === "'") {
                    $end = $quote + 2;
                    continue;
                }
                $end = $quote + 1;
                break;
            }
            $tokens[] = ['type' => 'string', 'value' => substr($statement, $pos, $end - $pos)];
            $pos = $end;
            continue;
        }

        if ($char === '"' || $char === '`' || $char === '[') {
            $closing = ($char === '[') ? ']' : $char;
            $end = $pos + 1;
            while (true) {
                $quote = strpos($statement, $closing, $end);
                if ($quote === false) {
                    return null; // unterminated identifier
                }
                if ($char !== '[' && $quote + 1 < $length && $statement[$quote + 1] === $closing) {
                    $end = $quote + 2;
                    continue;
                }
                $end = $quote + 1;
                break;
            }
            $tokens[] = ['type' => 'ident', 'value' => substr($statement, $pos, $end - $pos)];
            $pos = $end;
            continue;
        }

        if (($char === 'x' || $char === 'X') && $pos + 1 < $length && $statement[$pos + 1] === "'") {
            if (!preg_match('/\GX\'[0-9A-Fa-f]*\'/i', $statement, $m, 0, $pos)) {
                return null;
            }
            $tokens[] = ['type' => 'blob', 'value' => $m[0]];
            $pos += strlen($m[0]);
            continue;
        }

        if (preg_match('/\G(?:0[xX][0-9A-Fa-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/', $statement, $m, 0, $pos)) {
            $tokens[] = ['type' => 'number', 'value' => $m[0]];
            $pos += strlen($m[0]);
            continue;
        }

        if (preg_match('/\G[A-Za-z_][A-Za-z0-9_$]*/', $statement, $m, 0, $pos)) {
            $tokens[] = ['type' => 'word', 'value' => $m[0]];
            $pos += strlen($m[0]);
            continue;
        }

        $tokens[] = ['type' => 'punct', 'value' => $char];
        $pos++;
    }

    return $tokens;
}

/**
 * Check one statement against the shapes a Poznote dump can contain.
 *
 * @return true|string|'skip' true when allowed, 'skip' for transaction
 *         statements the executor handles itself, otherwise the reason
 */
function poznoteBackupSqlValidateStatement($statement) {
    $tokens = poznoteBackupSqlTokenize($statement);
    if ($tokens === null || count($tokens) === 0) {
        return 'malformed statement';
    }

    $count = count($tokens);
    $word = function ($i) use ($tokens, $count) {
        return ($i < $count && $tokens[$i]['type'] === 'word') ? strtoupper($tokens[$i]['value']) : null;
    };
    $punct = function ($i, $char) use ($tokens, $count) {
        return $i < $count && $tokens[$i]['type'] === 'punct' && $tokens[$i]['value'] === $char;
    };
    // An unqualified table/index/column name: a quoted identifier or a bare word
    $identifier = function ($i) use ($tokens, $count) {
        if ($i >= $count) {
            return null;
        }
        if ($tokens[$i]['type'] === 'ident') {
            return substr($tokens[$i]['value'], 1, -1);
        }
        if ($tokens[$i]['type'] === 'word') {
            return $tokens[$i]['value'];
        }
        return null;
    };
    $tableAllowed = function ($name) {
        if ($name === null || $name === '') {
            return false;
        }
        // Internal tables cannot be rebuilt through a dump; sqlite_sequence
        // only holds AUTOINCREMENT counters and is harmless
        if (stripos($name, 'sqlite_') === 0 && strtolower($name) !== 'sqlite_sequence') {
            return false;
        }
        return true;
    };

    $first = $word(0);

    // Transaction control: the executor wraps the restore in its own transaction
    if ($first === 'BEGIN' || $first === 'COMMIT' || $first === 'END') {
        for ($i = 1; $i < $count; $i++) {
            $w = $word($i);
            if (!in_array($w, ['TRANSACTION', 'DEFERRED', 'IMMEDIATE', 'EXCLUSIVE'], true)) {
                return 'unexpected token in transaction statement';
            }
        }
        return 'skip';
    }

    if ($first === 'DROP') {
        // DROP TABLE [IF EXISTS] name
        $i = 1;
        if ($word($i) !== 'TABLE') {
            return 'only DROP TABLE is allowed';
        }
        $i++;
        if ($word($i) === 'IF') {
            if ($word($i + 1) !== 'EXISTS') {
                return 'malformed DROP TABLE';
            }
            $i += 2;
        }
        $name = $identifier($i);
        if (!$tableAllowed($name)) {
            return 'invalid table name in DROP TABLE';
        }
        $i++;
        if ($i !== $count) {
            return 'unexpected token after DROP TABLE';
        }
        return true;
    }

    if ($first === 'CREATE') {
        $i = 1;
        $second = $word($i);

        if ($second === 'TABLE') {
            // CREATE TABLE [IF NOT EXISTS] name ( ... ) [WITHOUT ROWID] [, STRICT]
            $i++;
            if ($word($i) === 'IF') {
                if ($word($i + 1) !== 'NOT' || $word($i + 2) !== 'EXISTS') {
                    return 'malformed CREATE TABLE';
                }
                $i += 3;
            }
            $name = $identifier($i);
            if (!$tableAllowed($name) || strtolower((string)$name) === 'sqlite_sequence') {
                return 'invalid table name in CREATE TABLE';
            }
            $i++;
            if (!$punct($i, '(')) {
                return 'CREATE TABLE must define its columns (CREATE TABLE ... AS SELECT is not allowed)';
            }
            $end = poznoteBackupSqlSkipParenthesized($tokens, $i);
            if ($end === null) {
                return 'unbalanced parentheses in CREATE TABLE';
            }
            // Column definitions may only reference the table itself
            for ($j = $i; $j < $end; $j++) {
                if ($punct($j, '.')) {
                    return 'qualified names are not allowed in CREATE TABLE';
                }
                if ($tokens[$j]['type'] === 'word' && strtoupper($tokens[$j]['value']) === 'SELECT') {
                    return 'subqueries are not allowed in CREATE TABLE';
                }
            }
            for ($j = $end; $j < $count; $j++) {
                $w = $word($j);
                if (!in_array($w, ['WITHOUT', 'ROWID', 'STRICT'], true) && !$punct($j, ',')) {
                    return 'unexpected token after CREATE TABLE definition';
                }
            }
            return true;
        }

        if ($second === 'UNIQUE') {
            $i++;
            $second = $word($i);
        }
        if ($second === 'INDEX') {
            // CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table ( columns ) [WHERE expr]
            $i++;
            if ($word($i) === 'IF') {
                if ($word($i + 1) !== 'NOT' || $word($i + 2) !== 'EXISTS') {
                    return 'malformed CREATE INDEX';
                }
                $i += 3;
            }
            $name = $identifier($i);
            if ($name === null || $name === '' || stripos($name, 'sqlite_') === 0) {
                return 'invalid index name';
            }
            $i++;
            if ($word($i) !== 'ON') {
                return 'malformed CREATE INDEX';
            }
            $i++;
            if (!$tableAllowed($identifier($i))) {
                return 'invalid table name in CREATE INDEX';
            }
            $i++;
            if (!$punct($i, '(')) {
                return 'malformed CREATE INDEX';
            }
            $end = poznoteBackupSqlSkipParenthesized($tokens, $i);
            if ($end === null) {
                return 'unbalanced parentheses in CREATE INDEX';
            }
            for ($j = $i; $j < $count; $j++) {
                if ($punct($j, '.')) {
                    return 'qualified names are not allowed in CREATE INDEX';
                }
                if ($tokens[$j]['type'] === 'word' && strtoupper($tokens[$j]['value']) === 'SELECT') {
                    return 'subqueries are not allowed in CREATE INDEX';
                }
            }
            if ($end < $count && $word($end) !== 'WHERE') {
                return 'unexpected token after CREATE INDEX definition';
            }
            return true;
        }

        return 'only CREATE TABLE and CREATE INDEX are allowed';
    }

    if ($first === 'INSERT') {
        // INSERT [OR conflict] INTO name [( columns )] VALUES ( literals ) [, ( literals )]
        $i = 1;
        if ($word($i) === 'OR') {
            if (!in_array($word($i + 1), ['REPLACE', 'IGNORE', 'ABORT', 'FAIL', 'ROLLBACK'], true)) {
                return 'malformed INSERT';
            }
            $i += 2;
        }
        if ($word($i) !== 'INTO') {
            return 'malformed INSERT';
        }
        $i++;
        if (!$tableAllowed($identifier($i))) {
            return 'invalid table name in INSERT';
        }
        $i++;
        if ($punct($i, '(')) {
            $i++;
            while (true) {
                if ($identifier($i) === null) {
                    return 'invalid column list in INSERT';
                }
                $i++;
                if ($punct($i, ',')) {
                    $i++;
                    continue;
                }
                if ($punct($i, ')')) {
                    $i++;
                    break;
                }
                return 'invalid column list in INSERT';
            }
        }
        if ($word($i) !== 'VALUES') {
            return 'INSERT must use VALUES with literal values';
        }
        $i++;
        while (true) {
            if (!$punct($i, '(')) {
                return 'malformed VALUES list';
            }
            $i++;
            while (true) {
                if ($i >= $count) {
                    return 'malformed VALUES list';
                }
                $token = $tokens[$i];
                if ($token['type'] === 'punct' && ($token['value'] === '-' || $token['value'] === '+')) {
                    $i++;
                    if ($i >= $count || $tokens[$i]['type'] !== 'number') {
                        return 'only literal values are allowed in INSERT';
                    }
                } elseif ($token['type'] === 'word') {
                    if (!in_array(strtoupper($token['value']), ['NULL', 'TRUE', 'FALSE'], true)) {
                        return 'only literal values are allowed in INSERT';
                    }
                } elseif (!in_array($token['type'], ['string', 'number', 'blob'], true)) {
                    return 'only literal values are allowed in INSERT';
                }
                $i++;
                if ($punct($i, ',')) {
                    $i++;
                    continue;
                }
                if ($punct($i, ')')) {
                    $i++;
                    break;
                }
                return 'malformed VALUES list';
            }
            if ($i === $count) {
                return true;
            }
            if ($punct($i, ',')) {
                $i++;
                continue;
            }
            return 'unexpected token after INSERT values';
        }
    }

    return 'statement type is not part of a Poznote backup';
}

/**
 * Given the index of an opening parenthesis, return the index just past its
 * matching closing parenthesis, or null when unbalanced.
 */
function poznoteBackupSqlSkipParenthesized(array $tokens, $open) {
    $depth = 0;
    $count = count($tokens);
    for ($i = $open; $i < $count; $i++) {
        if ($tokens[$i]['type'] !== 'punct') {
            continue;
        }
        if ($tokens[$i]['value'] === '(') {
            $depth++;
        } elseif ($tokens[$i]['value'] === ')') {
            $depth--;
            if ($depth === 0) {
                return $i + 1;
            }
        }
    }
    return null;
}
