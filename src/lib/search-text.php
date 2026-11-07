<?php
/**
 * Search text of a note body: what a reader sees, not what the source holds.
 *
 * Loadable on its own (no database, no session) so the test suite can pin it.
 */

/**
 * The text a markdown note shows once rendered.
 *
 * A search must not surface a note for a word that only lives in the source:
 * a link's address or title, an image's path or alt, a reference definition,
 * an HTML comment. Link labels stay, and so do autolinks, whose address is
 * their text. Code fences keep their code but lose their language tag, which
 * renders as a badge rather than as text.
 */
function poznoteMarkdownVisibleText(string $markdown): string
{
    $text = preg_replace('/^```[a-zA-Z0-9+#*-]+\s*$/m', '```', $markdown);
    $text = preg_replace('/<!--.*?-->/s', ' ', $text);

    // Images and links share one destination syntax: (url), (url "title"),
    // with one level of nested parentheses allowed inside the url.
    $destination = '\((?:[^()]|\([^()]*\))*\)';
    $text = preg_replace('/!\[[^\]]*\]' . $destination . '/', ' ', $text);
    $text = preg_replace('/\[([^\]]*)\]' . $destination . '/', '$1', $text);

    // [id]: url "title" on its own line defines a reference and renders nothing
    $text = preg_replace('/^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S.*$/m', ' ', $text);

    // <https://…> renders as its address; unwrap it before tags are stripped
    $text = preg_replace('/<((?:https?|mailto):[^>\s]+)>/i', '$1', $text);

    return $text ?? $markdown;
}

/**
 * Lowercased text with the common accents folded away, the form every search
 * compares in: the remove_accents() SQL function (db_connect.php) and the
 * dashboard's content search (NotesController::searchIds) both go through it,
 * so a word matches the same notes whichever of the two looks for it.
 */
function poznoteFoldAccents(string $text): string
{
    static $accents = [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'ã' => 'a', 'å' => 'a', 'ā' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'ē' => 'e', 'ė' => 'e', 'ę' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ī' => 'i', 'į' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o', 'ø' => 'o', 'ō' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ū' => 'u', 'ų' => 'u',
        'ý' => 'y', 'ÿ' => 'y',
        'ñ' => 'n', 'ń' => 'n',
        'ç' => 'c', 'ć' => 'c', 'č' => 'c',
        'ş' => 's', 'š' => 's', 'ś' => 's',
        'ž' => 'z', 'ź' => 'z', 'ż' => 'z',
        'ł' => 'l',
        'æ' => 'ae', 'œ' => 'oe'
    ];

    return strtr(mb_strtolower($text, 'UTF-8'), $accents);
}

/**
 * $html with each Excalidraw diagram replaced by $replacement, the way search
 * and snippets see a note.
 *
 * A diagram's JSON carries its images as base64, so it can run to megabytes,
 * and the lazy `.*?` this used to be exhausted PCRE's backtracking on it:
 * preg_replace() answered null and the whole note lost its text to search
 * (issue #1567). The body is now read once, possessively, up to the first
 * </div>, which is where the old pattern stopped too. Escaped JSON holds no
 * raw "<", so no tag can hide inside it.
 */
function poznoteReplaceExcalidrawContainers(string $html, string $replacement): string
{
    $result = preg_replace(
        '/<div\b(?=[^>]*?\bclass="excalidraw-container")[^>]*+>(?:[^<]++|<(?!\/div>))*+<\/div>/',
        $replacement,
        $html
    );
    return $result ?? $html;
}

/**
 * Split a query into the terms a search must match: bare words, and "quoted
 * phrases" that stay in one piece.
 *
 * Each entry is ['type' => 'word'|'phrase', 'value' => string]. The search bar
 * of the app has worked this way for a long time; the function lives here so
 * the API can match the same way instead of keeping its own weaker rule
 * (issue #1737).
 */
function parseSearchTerms($search) {
    $terms = [];
    $pattern = '/"([^"]+)"|\S+/';

    preg_match_all($pattern, (string)$search, $matches);

    foreach ($matches[0] as $match) {
        // If the match starts and ends with quotes, it's an exact phrase
        if (preg_match('/^"(.+)"$/', $match, $phrase_match)) {
            $terms[] = ['type' => 'phrase', 'value' => $phrase_match[1]];
        } else {
            // Otherwise it's a simple word
            $terms[] = ['type' => 'word', 'value' => $match];
        }
    }

    return $terms;
}

/**
 * The search mode a caller asked for, or null when the word is not one we
 * know. An empty value means the default, 'all'.
 *
 * 'all' requires every term, 'any' one of them, 'phrase' keeps the query in
 * one piece, which is what the API did before it learned to tokenise.
 */
function poznoteNormalizeSearchMode($raw): ?string
{
    $mode = strtolower(trim((string)$raw));
    if ($mode === '') {
        return 'all';
    }
    return in_array($mode, ['all', 'any', 'phrase'], true) ? $mode : null;
}

/**
 * A LIKE pattern matching $needle anywhere, with the wildcards it contains
 * read as text.
 *
 * Tags carry an underscore wherever the user typed a space, so without the
 * escaping a filter on "code_review" would also match "code review" and
 * "codeXreview". Used with ESCAPE '\' on the SQL side.
 */
function poznoteSearchLikePattern(string $needle): string
{
    return '%' . addcslashes($needle, '\\%_') . '%';
}

/**
 * The terms of $query, already trimmed of empties. A query made only of
 * separators falls back to the whole string so a search never matches
 * everything by accident.
 *
 * @return string[]
 */
function poznoteSearchTermValues(string $query, string $mode): array
{
    if ($mode === 'phrase') {
        return [$query];
    }

    $values = [];
    foreach (parseSearchTerms($query) as $term) {
        $value = trim((string)$term['value']);
        if ($value !== '') {
            $values[] = $value;
        }
    }

    return $values !== [] ? $values : [$query];
}

/**
 * The WHERE fragment matching notes whose title or rendered body carries the
 * query, as ['sql' => string, 'params' => string[]], or null for an empty
 * query.
 *
 * The title is tested first and the body only when the title missed, so
 * search_clean_entry(), which renders the note, runs on as few rows as
 * possible. That is the shape buildSearchConditions() uses for the app's own
 * search bar.
 */
function poznoteBuildNoteTextCondition($query, string $mode = 'all'): ?array
{
    $query = trim((string)$query);
    if ($query === '') {
        return null;
    }

    $pieces = [];
    $params = [];
    foreach (poznoteSearchTermValues($query, $mode) as $value) {
        $pattern = poznoteSearchLikePattern($value);
        $pieces[] = "(remove_accents(heading) LIKE remove_accents(?) ESCAPE '\\'"
            . " OR (remove_accents(heading) NOT LIKE remove_accents(?) ESCAPE '\\'"
            . " AND remove_accents(search_clean_entry(entry, type)) LIKE remove_accents(?) ESCAPE '\\'))";
        $params[] = $pattern;
        $params[] = $pattern;
        $params[] = $pattern;
    }

    $glue = $mode === 'any' ? ' OR ' : ' AND ';

    return ['sql' => '(' . implode($glue, $pieces) . ')', 'params' => $params];
}

/**
 * The same thing against the title alone, for the ORDER BY that floats a
 * title match to the top of a search.
 */
function poznoteBuildHeadingMatchCondition($query, string $mode = 'all'): ?array
{
    $query = trim((string)$query);
    if ($query === '') {
        return null;
    }

    $pieces = [];
    $params = [];
    foreach (poznoteSearchTermValues($query, $mode) as $value) {
        $pieces[] = "remove_accents(heading) LIKE remove_accents(?) ESCAPE '\\'";
        $params[] = poznoteSearchLikePattern($value);
    }

    $glue = $mode === 'any' ? ' OR ' : ' AND ';

    return ['sql' => '(' . implode($glue, $pieces) . ')', 'params' => $params];
}

/**
 * The tags a filter asked for, in the form the tags column stores: a string
 * ("a, b" or "a b"), or a list of strings.
 *
 * A tag never holds a space, the app turns one into an underscore when the
 * tag is saved, so splitting on spaces is safe and lets a caller pass
 * "topic/ai topic/mcp" as one value.
 *
 * @return string[]
 */
function poznoteParseTagFilter($raw): array
{
    $parts = [];
    if (is_array($raw)) {
        foreach ($raw as $chunk) {
            foreach (preg_split('/[,\s]+/', (string)$chunk) ?: [] as $part) {
                $parts[] = $part;
            }
        }
    } else {
        $parts = preg_split('/[,\s]+/', (string)$raw) ?: [];
    }

    $tags = [];
    $seen = [];
    foreach ($parts as $part) {
        $tag = trim((string)$part);
        if ($tag === '') {
            continue;
        }
        $key = mb_strtolower($tag, 'UTF-8');
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $tags[] = $tag;
    }

    return $tags;
}

/**
 * The WHERE fragment matching notes carrying every tag of $tags, or null for
 * an empty list.
 *
 * The column holds "a, b, c", so both sides are wrapped in commas and the
 * spaces dropped before matching: a filter on "chat" then matches the tag
 * "chat" and not "chat/telegram", which a plain substring would have caught.
 * A caller after the whole family passes the full tag.
 */
function poznoteBuildTagsCondition(array $tags): ?array
{
    if ($tags === []) {
        return null;
    }

    $pieces = [];
    $params = [];
    foreach ($tags as $tag) {
        $pieces[] = "(',' || replace(remove_accents(tags), ' ', '') || ',')"
            . " LIKE ('%,' || remove_accents(?) || ',%') ESCAPE '\\'";
        $params[] = addcslashes($tag, '\\%_');
    }

    return ['sql' => '(' . implode(' AND ', $pieces) . ')', 'params' => $params];
}
