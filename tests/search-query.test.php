<?php
lib('search-text');

// Issue #1737: the REST API matched the whole query as one string, so a search
// for two words that both appear in a note, but not side by side, returned
// nothing. The search bar of the app had tokenised for a long time; these
// tests pin the shared builders both now go through.
//
// The conditions are run against a real in-memory SQLite with the same two
// custom functions db_connect.php registers, because a WHERE clause that
// looks right and matches nothing is exactly the bug being fixed.

function searchQueryDb(array $notes): PDO {
    $con = new Pdo\Sqlite('sqlite::memory:');
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->createFunction('remove_accents', fn($text) => poznoteFoldAccents((string)$text), 1);
    $con->createFunction('search_clean_entry', fn($content, $type = 'note') => strip_tags((string)$content), 2);
    $con->exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, heading TEXT, entry TEXT, tags TEXT, type TEXT DEFAULT \'note\')');
    $insert = $con->prepare('INSERT INTO entries (id, heading, entry, tags) VALUES (?, ?, ?, ?)');
    foreach ($notes as $note) {
        $insert->execute($note);
    }
    return $con;
}

/** @return int[] the ids the condition matches, in order */
function searchQueryIds(PDO $con, ?array $condition): array {
    if ($condition === null) {
        fail('expected a condition, got null');
    }
    $stmt = $con->prepare('SELECT id FROM entries WHERE ' . $condition['sql'] . ' ORDER BY id');
    $stmt->execute($condition['params']);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function searchQueryFixture(): PDO {
    return searchQueryDb([
        [1, 'Alpha status report', 'The deployment pipeline moved to staging today.', 'topic/ai, chat_log'],
        [2, 'Beta notes', 'A staging deployment of the pipeline happened last week.', 'topic/ai'],
        [3, 'Unrelated page', 'Nothing about infrastructure here at all.', 'chat_log'],
        [4, 'Déjà vu', 'Rien de neuf sous le soleil.', 'topic/ai-safety'],
        [5, 'Wildcards', 'Literally 100%_sure about this.', 'code_review'],
    ]);
}

test('a query is split into words, and quotes keep a phrase whole', function () {
    assertSame(['word', 'word'], array_column(parseSearchTerms('two words'), 'type'));
    assertSame(['two words'], array_column(parseSearchTerms('"two words"'), 'value'));
    assertSame(['phrase', 'word'], array_column(parseSearchTerms('"two words" third'), 'type'));
    assertSame([], parseSearchTerms('   '));
});

test('the default mode is all, and an unknown mode is rejected rather than guessed', function () {
    assertSame('all', poznoteNormalizeSearchMode(''));
    assertSame('all', poznoteNormalizeSearchMode(null));
    assertSame('all', poznoteNormalizeSearchMode('ALL'));
    assertSame('any', poznoteNormalizeSearchMode(' any '));
    assertSame('phrase', poznoteNormalizeSearchMode('phrase'));
    assertSame(null, poznoteNormalizeSearchMode('fuzzy'));
});

// The reported defect, in one test.
test('two words that are both in a note match even when they are far apart', function () {
    $con = searchQueryFixture();
    assertSame([1, 2], searchQueryIds($con, poznoteBuildNoteTextCondition('staging pipeline', 'all')));
    assertSame([1, 2], searchQueryIds($con, poznoteBuildNoteTextCondition('pipeline deployment', 'all')));
});

test('mode=all means every term, so one missing word is no match', function () {
    $con = searchQueryFixture();
    assertSame([], searchQueryIds($con, poznoteBuildNoteTextCondition('pipeline infrastructure', 'all')));
});

test('mode=any means one term is enough', function () {
    $con = searchQueryFixture();
    assertSame([1, 2, 3], searchQueryIds($con, poznoteBuildNoteTextCondition('pipeline infrastructure', 'any')));
});

test('mode=phrase keeps the whole query in one piece, as the API did before', function () {
    $con = searchQueryFixture();
    assertSame([1], searchQueryIds($con, poznoteBuildNoteTextCondition('moved to staging', 'phrase')));
    assertSame([], searchQueryIds($con, poznoteBuildNoteTextCondition('staging pipeline', 'phrase')));
});

test('a quoted phrase stays whole inside a wider query', function () {
    $con = searchQueryFixture();
    assertSame([1], searchQueryIds($con, poznoteBuildNoteTextCondition('"moved to staging"', 'all')));
    assertSame([], searchQueryIds($con, poznoteBuildNoteTextCondition('"pipeline staging"', 'all')));
});

test('a term matches the title as well as the body', function () {
    $con = searchQueryFixture();
    assertSame([1], searchQueryIds($con, poznoteBuildNoteTextCondition('alpha report', 'all')));
    assertSame([1], searchQueryIds($con, poznoteBuildNoteTextCondition('alpha deployment', 'all')),
        'one term in the title, the other in the body');
});

test('accents are folded on both sides, as everywhere else in search', function () {
    $con = searchQueryFixture();
    assertSame([4], searchQueryIds($con, poznoteBuildNoteTextCondition('deja vu', 'all')));
    assertSame([4], searchQueryIds($con, poznoteBuildNoteTextCondition('DÉJÀ', 'all')));
});

// Without ESCAPE these are SQL wildcards: '%' would match every note and '_'
// any single character, and tags carry an underscore wherever a space was typed.
test('a wildcard typed in a query is text, not a joker', function () {
    $con = searchQueryFixture();
    assertSame([5], searchQueryIds($con, poznoteBuildNoteTextCondition('100%_sure', 'all')));
    assertSame([], searchQueryIds($con, poznoteBuildNoteTextCondition('%%%', 'all')),
        'a query of percent signs must not match every note');
    assertSame([], searchQueryIds($con, poznoteBuildNoteTextCondition('100%Xsure', 'all')));
});

test('an empty query builds no condition at all', function () {
    assertSame(null, poznoteBuildNoteTextCondition('', 'all'));
    assertSame(null, poznoteBuildNoteTextCondition('   ', 'all'));
    assertSame(null, poznoteBuildNoteTextCondition(null, 'all'));
});

test('a query made only of separators falls back to the whole string', function () {
    $con = searchQueryFixture();
    assertSame([], searchQueryIds($con, poznoteBuildNoteTextCondition('""', 'all')),
        'it must match nothing, not everything');
});

test('the heading condition looks at the title alone, for the ordering', function () {
    $con = searchQueryFixture();
    assertSame([1], searchQueryIds($con, poznoteBuildHeadingMatchCondition('alpha report', 'all')));
    assertSame([], searchQueryIds($con, poznoteBuildHeadingMatchCondition('alpha deployment', 'all')),
        'a term found only in the body does not count as a title match');
});

test('a tag filter is read from a string or a list, and deduplicated', function () {
    assertSame(['a', 'b'], poznoteParseTagFilter('a, b'));
    assertSame(['a', 'b'], poznoteParseTagFilter('a b'));
    assertSame(['a', 'b'], poznoteParseTagFilter(['a', 'b']));
    assertSame(['a', 'b'], poznoteParseTagFilter(['a,b']));
    assertSame(['A'], poznoteParseTagFilter('A a'), 'the same tag twice counts once');
    assertSame([], poznoteParseTagFilter(''));
    assertSame([], poznoteParseTagFilter([]));
});

test('a tag filter matches the whole tag, not a piece of a longer one', function () {
    $con = searchQueryFixture();
    assertSame([1, 2], searchQueryIds($con, poznoteBuildTagsCondition(['topic/ai'])));
    assertSame([4], searchQueryIds($con, poznoteBuildTagsCondition(['topic/ai-safety'])),
        'the longer tag is its own tag');
    assertSame([], searchQueryIds($con, poznoteBuildTagsCondition(['topic'])),
        'a prefix is not a tag');
    assertSame([], searchQueryIds($con, poznoteBuildTagsCondition(['chat'])));
});

test('several tags all have to be there', function () {
    $con = searchQueryFixture();
    assertSame([1], searchQueryIds($con, poznoteBuildTagsCondition(['topic/ai', 'chat_log'])));
    assertSame([], searchQueryIds($con, poznoteBuildTagsCondition(['topic/ai', 'code_review'])));
});

test('an underscore in a tag is a character, not a joker', function () {
    $con = searchQueryFixture();
    assertSame([5], searchQueryIds($con, poznoteBuildTagsCondition(['code_review'])));
    assertSame([], searchQueryIds($con, poznoteBuildTagsCondition(['codeXreview'])));
});

test('an empty tag list builds no condition', function () {
    assertSame(null, poznoteBuildTagsCondition([]));
});
