<?php
/**
 * The dump of a backup archive is user-supplied input (GHSA-rmm5-6582-qcmc),
 * and it is now read as a stream rather than loaded whole, so these tests
 * cover both halves of that: the grammar still refuses everything a Poznote
 * dump cannot contain, and the streaming splitter cuts statements exactly
 * where the string one did, whatever chunk size the reads land on.
 */

require_once dirname(__DIR__) . '/src/backup_sql_restore.php';

/** Split through the generator, forcing a given read size. */
function splitStreamed(string $sql, int $chunkSize): array
{
    $handle = fopen('php://temp', 'r+b');
    fwrite($handle, $sql);
    rewind($handle);
    $statements = [];
    foreach (poznoteBackupSqlStreamStatements($handle, $chunkSize) as $statement) {
        $statements[] = $statement;
    }
    fclose($handle);
    return $statements;
}

function withTempFile(string $contents, callable $body)
{
    $path = tempnam(sys_get_temp_dir(), 'poznote-test-sql-');
    file_put_contents($path, $contents);
    try {
        return $body($path);
    } finally {
        @unlink($path);
    }
}

test('a semicolon inside a note does not split the statement', function () {
    $sql = "INSERT INTO \"entries\" (\"entry\") VALUES ('<div style=\"color:red;\">a;b</div>');";
    $statements = poznoteBackupSqlSplitStatements($sql);
    assertSame(1, count($statements));
    assertContains('a;b', $statements[0]);
});

test('a doubled quote escapes the quote instead of closing the literal', function () {
    $statements = poznoteBackupSqlSplitStatements("INSERT INTO t (a) VALUES ('it''s; here');INSERT INTO t (a) VALUES (2);");
    assertSame(2, count($statements));
    assertContains("it''s; here", $statements[0]);
});

test('quoted identifiers keep their own escaping rules', function () {
    assertSame(1, count(poznoteBackupSqlSplitStatements('CREATE TABLE "we""ird;name" (a);')));
    assertSame(1, count(poznoteBackupSqlSplitStatements('CREATE TABLE `we``ird;name` (a);')));
    // [...] has no escape: the first ] closes it
    assertSame(2, count(poznoteBackupSqlSplitStatements('CREATE TABLE [a;b] (x); INSERT INTO t (a) VALUES (1);')));
});

test('comments are dropped, including a semicolon inside one', function () {
    $statements = poznoteBackupSqlSplitStatements("-- a comment; here\nINSERT INTO t (a) VALUES (1);\n/* block ; comment */ INSERT INTO t (a) VALUES (2);");
    assertSame(2, count($statements));
    assertNotContains('comment', $statements[0]);
    assertNotContains('block', $statements[1]);
});

test('streaming gives the same statements whatever the read size', function () {
    $fixtures = [
        "DROP TABLE \"t\";\nCREATE TABLE \"t\" (a);\nINSERT INTO \"t\" (a) VALUES (1);",
        "INSERT INTO t (a) VALUES ('a;b;c')",
        "INSERT INTO t (a) VALUES ('ends with a quote''')",
        "INSERT INTO t (a) VALUES ('x''');INSERT INTO t (a) VALUES ('y');",
        'CREATE TABLE "we""ird;name" (a); CREATE TABLE `b``x` (c); CREATE TABLE [d;e] (f);',
        "-- header;\n/* block\n ; spanning lines */\nINSERT INTO t (a) VALUES (1-2);\nINSERT INTO t (a) VALUES (6/2);",
        "INSERT INTO t (a) VALUES (1); /* never closed",
        "INSERT INTO t (a) VALUES ('never closed",
        "INSERT INTO t (a) VALUES ('éàü漢字 ; 🎉');",
        ";;;  ;;",
    ];
    // Sizes that cut inside every construct: 1 and 2 land between the two
    // characters of '', -- and */, which is where a naive reader breaks
    foreach ([1, 2, 3, 7, 64, 262144] as $chunkSize) {
        foreach ($fixtures as $index => $sql) {
            assertSame(
                poznoteBackupSqlSplitStatements($sql),
                splitStreamed($sql, $chunkSize),
                'fixture ' . $index . ' at chunk size ' . $chunkSize
            );
        }
    }
});

test('a dump made of the statements Poznote writes is accepted', function () {
    $sql = "-- Poznote backup\n-- Generated on 2026-09-10 08:00:00\n\n"
        . "DROP TABLE IF EXISTS \"entries\";\n"
        . "CREATE TABLE \"entries\" (id INTEGER PRIMARY KEY AUTOINCREMENT, entry TEXT);\n"
        . "CREATE INDEX idx_entries_id ON entries (id);\n"
        . "BEGIN TRANSACTION;\n"
        . "INSERT INTO \"entries\" (\"id\", \"entry\") VALUES (1, 'hello');\n"
        . "COMMIT;\n";
    $parsed = poznoteParseBackupSql($sql);
    assertTrue($parsed['success'], $parsed['error']);
    // BEGIN/COMMIT are skipped: the executor runs its own transaction
    assertSame(4, count($parsed['statements']));
});

test('the statements that let a restore escape its database are refused', function () {
    $dangerous = [
        "ATTACH DATABASE '/var/www/html/data/master.db' AS m;",
        "PRAGMA writable_schema = 1;",
        "CREATE TRIGGER t AFTER INSERT ON entries BEGIN SELECT 1; END;",
        "CREATE VIEW v AS SELECT 1;",
        "CREATE VIRTUAL TABLE v USING fts4(x);",
        "SELECT load_extension('/tmp/evil.so');",
        "UPDATE users SET is_admin = 1;",
        "DROP TABLE sqlite_master;",
        "ALTER TABLE entries RENAME TO other;",
        "INSERT INTO entries SELECT * FROM other;",
    ];
    foreach ($dangerous as $statement) {
        $parsed = poznoteParseBackupSql("CREATE TABLE t (a);\n" . $statement);
        assertFalse($parsed['success'], 'should refuse: ' . $statement);
        assertSame([], $parsed['statements']);
    }
});

test('a dump file is validated without being loaded whole', function () {
    $sql = "DROP TABLE IF EXISTS \"t\";\nCREATE TABLE \"t\" (a);\nINSERT INTO \"t\" (a) VALUES ('x;y');\n";
    withTempFile($sql, function ($path) {
        $result = poznoteValidateBackupSqlFile($path);
        assertTrue($result['success'], $result['error']);
        assertSame(3, $result['count']);
    });

    withTempFile("CREATE TABLE t (a);\nATTACH DATABASE '/tmp/x.db' AS x;\n", function ($path) {
        $result = poznoteValidateBackupSqlFile($path);
        assertFalse($result['success']);
        assertContains('statement 2', $result['error']);
    });

    withTempFile('', function ($path) {
        assertFalse(poznoteValidateBackupSqlFile($path)['success']);
    });

    assertFalse(poznoteValidateBackupSqlFile('/nonexistent/poznote/dump.sql')['success']);
});

test('a validated dump file restores into a database', function () {
    $sql = "DROP TABLE IF EXISTS \"entries\";\n"
        . "CREATE TABLE \"entries\" (id INTEGER, entry TEXT);\n"
        . "INSERT INTO \"entries\" (\"id\", \"entry\") VALUES (1, 'a;b');\n"
        . "INSERT INTO \"entries\" (\"id\", \"entry\") VALUES (2, 'it''s fine');\n";
    withTempFile($sql, function ($sqlPath) {
        $dbPath = tempnam(sys_get_temp_dir(), 'poznote-test-db-');
        @unlink($dbPath);
        try {
            $executed = poznoteExecuteBackupSqlFile($dbPath, $sqlPath);
            assertTrue($executed['success'], $executed['error']);

            $con = new PDO('sqlite:' . $dbPath);
            $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $rows = $con->query('SELECT id, entry FROM entries ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
            assertSame(2, count($rows));
            assertSame('a;b', $rows[0]['entry']);
            assertSame("it's fine", $rows[1]['entry']);
            $con = null;
        } finally {
            @unlink($dbPath);
        }
    });
});

test('a statement slipped in after the validation pass is still refused', function () {
    // What poznoteExecuteBackupSqlFile()'s second check is for: the file it
    // executes is not necessarily the one that was validated
    withTempFile("CREATE TABLE t (a);\nATTACH DATABASE '/tmp/x.db' AS x;\n", function ($sqlPath) {
        $dbPath = tempnam(sys_get_temp_dir(), 'poznote-test-db-');
        @unlink($dbPath);
        try {
            $executed = poznoteExecuteBackupSqlFile($dbPath, $sqlPath);
            assertFalse($executed['success']);
            assertContains('not allowed in a Poznote backup', $executed['error']);
        } finally {
            @unlink($dbPath);
        }
    });
});

/** Restore a dump into a throwaway database and hand the connection over. */
function restoreDumpForTest(string $sql, callable $body): void
{
    withTempFile($sql, function ($sqlPath) use ($body) {
        $dbPath = tempnam(sys_get_temp_dir(), 'poznote-test-db-');
        @unlink($dbPath);
        try {
            $executed = poznoteExecuteBackupSqlFile($dbPath, $sqlPath);
            assertTrue($executed['success'], $executed['error']);
            $con = new PDO('sqlite:' . $dbPath);
            $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $body($con);
            $con = null;
        } finally {
            @unlink($dbPath);
        }
    });
}

test('a genuine dump comes out of the key check untouched', function () {
    // The shapes a real backup holds: integer keys, references that are an
    // integer, NULL, or the empty string older versions could leave behind.
    $sql = "CREATE TABLE \"folders\" (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, parent_id INTEGER DEFAULT NULL);\n"
        . "INSERT INTO \"folders\" (\"id\", \"name\", \"parent_id\") VALUES (1, 'Work', NULL);\n"
        . "INSERT INTO \"folders\" (\"id\", \"name\", \"parent_id\") VALUES ('2', 'Sub', '1');\n"
        . "CREATE TABLE \"entries\" (id INTEGER PRIMARY KEY AUTOINCREMENT, heading TEXT, folder_id INTEGER, linked_note_id INTEGER);\n"
        . "INSERT INTO \"entries\" (\"id\", \"heading\", \"folder_id\", \"linked_note_id\") VALUES (1, 'a', 2, NULL);\n"
        . "INSERT INTO \"entries\" (\"id\", \"heading\", \"folder_id\", \"linked_note_id\") VALUES (2, 'b', '', 1);\n"
        . "INSERT INTO \"entries\" (\"id\", \"heading\", \"folder_id\", \"linked_note_id\") VALUES ('3', 'c', NULL, '1');\n"
        . "CREATE TABLE \"shared_notes\" (id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER NOT NULL, token TEXT);\n"
        . "INSERT INTO \"shared_notes\" (\"id\", \"note_id\", \"token\") VALUES (1, 2, 'abc');\n"
        . "CREATE TABLE \"settings\" (key TEXT PRIMARY KEY, value TEXT);\n"
        . "INSERT INTO \"settings\" (\"key\", \"value\") VALUES ('language', 'fr');\n";
    restoreDumpForTest($sql, function (PDO $con) {
        assertSame([[1, null], [2, 1]], $con->query('SELECT id, parent_id FROM folders ORDER BY id')->fetchAll(PDO::FETCH_NUM));
        assertSame(
            [[1, 2, null], [2, '', 1], [3, null, 1]],
            $con->query('SELECT id, folder_id, linked_note_id FROM entries ORDER BY id')->fetchAll(PDO::FETCH_NUM)
        );
        assertSame(1, (int)$con->query('SELECT COUNT(*) FROM shared_notes')->fetchColumn());
        assertSame('fr', $con->query("SELECT value FROM settings WHERE key = 'language'")->fetchColumn());
    });
});

test('a row whose key is not an integer does not survive the restore', function () {
    // The dump declares its own columns, so it can turn a key into free text.
    // The application builds file names and markup from these keys.
    $sql = "CREATE TABLE \"entries\" (id TEXT, heading TEXT, folder_id INTEGER, linked_note_id INTEGER);\n"
        . "INSERT INTO \"entries\" (\"id\", \"heading\") VALUES ('some/where', 'text key');\n"
        . "INSERT INTO \"entries\" (\"id\", \"heading\") VALUES ('7', 'digits kept as text');\n"
        . "CREATE TABLE \"folders\" (id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER);\n"
        . "INSERT INTO \"folders\" (\"id\", \"name\", \"parent_id\") VALUES (1, 'kept', 'not-a-folder');\n"
        . "CREATE TABLE \"shared_notes\" (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL, token TEXT);\n"
        . "INSERT INTO \"shared_notes\" (\"id\", \"note_id\", \"token\") VALUES (1, 'some/where', 'abc');\n"
        . "INSERT INTO \"shared_notes\" (\"id\", \"note_id\", \"token\") VALUES (2, 5, 'def');\n"
        . "CREATE TABLE \"notifications\" (id INTEGER PRIMARY KEY, note_id INTEGER, message TEXT);\n"
        . "INSERT INTO \"notifications\" (\"id\", \"note_id\", \"message\") VALUES (1, 'x/y', 'kept, reference cleared');\n";
    restoreDumpForTest($sql, function (PDO $con) {
        assertSame(0, (int)$con->query('SELECT COUNT(*) FROM entries')->fetchColumn(), 'entries with a text key');
        assertSame([[1, null]], $con->query('SELECT id, parent_id FROM folders')->fetchAll(PDO::FETCH_NUM), 'folder kept, parent cleared');
        assertSame([[2, 5]], $con->query('SELECT id, note_id FROM shared_notes')->fetchAll(PDO::FETCH_NUM), 'share with no real target dropped');
        assertSame([[1, null]], $con->query('SELECT id, note_id FROM notifications')->fetchAll(PDO::FETCH_NUM));
    });
});

test('a database without the usual tables is not a problem for the key check', function () {
    restoreDumpForTest("CREATE TABLE \"other\" (a TEXT);\nINSERT INTO \"other\" (\"a\") VALUES ('x');\n", function (PDO $con) {
        assertSame('x', $con->query('SELECT a FROM other')->fetchColumn());
    });
});
