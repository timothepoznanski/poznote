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
