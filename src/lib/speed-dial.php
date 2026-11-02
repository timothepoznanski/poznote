<?php
/**
 * Speed dial (issue #1714, public/speed_dial.php): the tag that puts a note on
 * it, shared by the page and by the reorder route of the API.
 */

const POZNOTE_SPEED_DIAL_TAG = 'speed-dial';
const POZNOTE_SPEED_DIAL_TILE_MIN = 80;
const POZNOTE_SPEED_DIAL_TILE_MAX = 260;
const POZNOTE_SPEED_DIAL_TILE_DEFAULT = 140;

/**
 * @param string $tags entries.tags, comma separated
 * @param string $board The tag of a speed dial: the default one, or speed-dial-<name>
 */
function poznoteHasSpeedDialTag(string $tags, string $board = POZNOTE_SPEED_DIAL_TAG): bool {
    $board = mb_strtolower($board, 'UTF-8');
    foreach (explode(',', $tags) as $tag) {
        if (mb_strtolower(trim($tag), 'UTF-8') === $board) return true;
    }
    return false;
}

/** The tag of a speed dial, default or named. */
function poznoteSpeedDialIsBoardTag(string $tag): bool {
    $tag = mb_strtolower($tag, 'UTF-8');
    return $tag === POZNOTE_SPEED_DIAL_TAG
        || (strncmp($tag, POZNOTE_SPEED_DIAL_TAG . '-', strlen(POZNOTE_SPEED_DIAL_TAG) + 1) === 0
            && strlen($tag) > strlen(POZNOTE_SPEED_DIAL_TAG) + 1);
}

/**
 * The tags of speed dials among the tags of a note, in lower case.
 *
 * @return string[]
 */
function poznoteSpeedDialTagsOf(string $tags): array {
    $found = [];
    foreach (explode(',', $tags) as $tag) {
        $tag = mb_strtolower(trim($tag), 'UTF-8');
        if (poznoteSpeedDialIsBoardTag($tag)) $found[$tag] = true;
    }
    return array_keys($found);
}

/**
 * The tag of a new speed dial named $name, as the tags of notes are written:
 * spaces become underscores. Null when the name cannot make one.
 */
function poznoteSpeedDialTagFromName(string $name): ?string {
    $slug = preg_replace('/[\s,]+/u', '_', trim($name)) ?? '';
    if ($slug === '' || mb_strlen($slug, 'UTF-8') > 50 || preg_match('/[\/\\\\:*?"<>|&\'#%]/', $slug)) {
        return null;
    }
    return POZNOTE_SPEED_DIAL_TAG . '-' . $slug;
}

/** The name of a speed dial, from its tag. The default one has none: it goes by the view's title. */
function poznoteSpeedDialBoardName(string $tag): ?string {
    if (mb_strtolower($tag, 'UTF-8') === POZNOTE_SPEED_DIAL_TAG) return null;
    return str_replace('_', ' ', substr($tag, strlen(POZNOTE_SPEED_DIAL_TAG) + 1));
}

/**
 * The speed dials of a workspace: the default one, those created in the view
 * (an empty one has no note to be found through) and the tags in use.
 *
 * @param string[] $registered What the setting speed_dial_boards_<workspace> lists
 * @param string[] $noteTags entries.tags of the notes
 * @return string[]
 */
function poznoteSpeedDialMergeBoards(array $registered, array $noteTags): array {
    $boards = [POZNOTE_SPEED_DIAL_TAG => POZNOTE_SPEED_DIAL_TAG];
    foreach ($registered as $tag) {
        if (is_string($tag) && poznoteSpeedDialIsBoardTag($tag)) {
            $boards += [mb_strtolower($tag, 'UTF-8') => $tag];
        }
    }
    foreach ($noteTags as $tags) {
        foreach (explode(',', (string)$tags) as $tag) {
            $tag = trim($tag);
            if (poznoteSpeedDialIsBoardTag($tag)) {
                $boards += [mb_strtolower($tag, 'UTF-8') => $tag];
            }
        }
    }
    return array_values($boards);
}

/** @return string[] The speed dials of a workspace, the default one first */
function poznoteSpeedDialBoards(PDO $con, string $workspace): array {
    $stmt = $con->prepare("SELECT tags FROM entries WHERE trash = 0 AND workspace = ? AND tags LIKE ?");
    $stmt->execute([$workspace, '%' . POZNOTE_SPEED_DIAL_TAG . '-%']);
    $settingStmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
    $settingStmt->execute(['speed_dial_boards_' . $workspace]);
    $registered = json_decode((string)$settingStmt->fetchColumn(), true);
    return poznoteSpeedDialMergeBoards(is_array($registered) ? $registered : [], $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** What tells the image and the opacity of a speed dial from the others': empty for the default one. */
function poznoteSpeedDialBackgroundKey(string $tag): string {
    $tag = mb_strtolower($tag, 'UTF-8');
    return $tag === POZNOTE_SPEED_DIAL_TAG ? '' : substr(md5($tag), 0, 10);
}

/** Only http(s), the address ends up in an href. */
function poznoteSpeedDialIsWebUrl(string $url): bool {
    return preg_match('#^https?://[^\s]+$#i', $url) === 1;
}

/**
 * An image a tile may show. Same rule as the cards (buildNoteCardPreview): the
 * note's attachments, http(s) sources and small data URIs.
 */
function poznoteSpeedDialImage(string $src): ?string {
    if (stripos($src, 'data:image/') === 0 && strlen($src) < 65536) return $src;
    return preg_match('#^(/?api/v1/notes/\d+/attachments/|https?://|attachments/)#i', $src) ? $src : null;
}

/** @return array{url: string, label: string, image: ?string} */
function poznoteSpeedDialLink(string $url, string $label, ?string $image = null): array {
    return ['url' => $url, 'label' => trim($label), 'image' => $image !== null ? poznoteSpeedDialImage($image) : null];
}

/**
 * The web links of a markdown note, rows split by its horizontal rules. A link
 * may hold an image: [![alt](icon "title")](url "title"). Every rule counts: one
 * with nothing after it, or next to another, leaves an empty row, so the view can
 * draw it. No link at all gives no rows.
 *
 * @return array<int, array<int, array{url: string, label: string, image: ?string}>>
 */
function poznoteSpeedDialParseMarkdown(string $raw): array {
    // Neither front matter (its rule is no separator), nor code, nor the HTML a
    // markdown note can hold: a diagram carries addresses in its attributes.
    $text = preg_replace('/\A---\R.*?\R---\R/s', '', str_replace("\r\n", "\n", $raw)) ?? $raw;
    $text = preg_replace('/^ {0,3}(```|~~~).*?^ {0,3}\1[^\n]*$/ms', '', $text) ?? $text;
    $text = preg_replace('/`[^`\n]*`/', '', $text) ?? $text;
    $text = preg_replace('/<(?!https?:\/\/)[a-z\/!][^>]*>/i', '', $text) ?? $text;

    $target = '\(\s*<?((?:[^()\s<>]|\([^()\s]*\))+)>?(?:\s+"([^"]*)")?\s*\)';
    $pattern = '/\[\s*!\[([^\]]*)\]' . $target . '\s*\]' . $target  // 1-5 image link
        . '|!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)'                   // image alone
        . '|\[([^\]]*)\]' . $target                                 // 6-8 text link
        . '|^(?: {0,3})(?:-{3,}|\*{3,}|_{3,})[ \t]*$'               // rule
        . '|https?:\/\/[^\s<>"\'\]]+/mi';                           // bare address
    if (!preg_match_all($pattern, $text, $matches, PREG_SET_ORDER | PREG_UNMATCHED_AS_NULL)) return [];

    $rows = [[]];
    foreach ($matches as $m) {
        if (($m[4] ?? null) !== null) {
            if (!poznoteSpeedDialIsWebUrl($m[4])) continue;
            $label = $m[5] ?? $m[3] ?? '';
            $rows[count($rows) - 1][] = poznoteSpeedDialLink($m[4], $label !== '' ? $label : (string)$m[1], $m[2]);
        } elseif (($m[7] ?? null) !== null) {
            if (!poznoteSpeedDialIsWebUrl($m[7])) continue;
            $rows[count($rows) - 1][] = poznoteSpeedDialLink($m[7], $m[8] ?? (string)$m[6]);
        } elseif (stripos($m[0], 'http') === 0) {
            $rows[count($rows) - 1][] = poznoteSpeedDialLink(rtrim($m[0], '.,;:!?)…'), '');
        } elseif ($m[0][0] !== '!') {
            $rows[] = [];
        }
    }
    return array_filter($rows) ? $rows : [];
}

/**
 * The same for a rich text note: its <a href> elements and the addresses written
 * as plain text, rows split by <hr>. Tags are matched whole, so that no address
 * is read from an attribute, and code is left out.
 *
 * @return array<int, array<int, array{url: string, label: string, image: ?string}>>
 */
function poznoteSpeedDialParseHtml(string $raw): array {
    $pattern = '/<a\b([^>]*)>(.*?)<\/a>'
        . '|<(?:pre|code|script|style)\b.*?<\/(?:pre|code|script|style)>'
        . '|<[^>]+>'
        . '|https?:\/\/[^\s<>"\']+/is';
    if (!preg_match_all($pattern, $raw, $matches, PREG_SET_ORDER)) return [];

    $attribute = static function (string $attributes, string $name): string {
        return preg_match('/\b' . $name . '\s*=\s*(?:"([^"]*)"|\'([^\']*)\')/i', $attributes, $m)
            ? html_entity_decode($m[1] !== '' ? $m[1] : ($m[2] ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8')
            : '';
    };

    $rows = [[]];
    foreach ($matches as $m) {
        if (!isset($m[2])) {
            if (stripos($m[0], 'http') === 0) {
                // A no-break space ends the address too, it is one character once decoded
                $url = preg_split('/[\s\x{00A0}]/u', html_entity_decode($m[0], ENT_QUOTES | ENT_HTML5, 'UTF-8'))[0];
                $rows[count($rows) - 1][] = poznoteSpeedDialLink(rtrim($url, '.,;:!?)…'), '');
            } elseif (preg_match('/^<hr\b/i', $m[0])) {
                $rows[] = [];
            }
            continue;
        }
        $url = $attribute($m[1], 'href');
        if (!poznoteSpeedDialIsWebUrl($url)) continue;
        $image = preg_match('/<img\b([^>]*)>/i', $m[2], $im) ? $attribute($im[1], 'src') : '';
        $label = $attribute($m[1], 'title');
        if ($label === '') {
            $label = html_entity_decode(strip_tags($m[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        $rows[count($rows) - 1][] = poznoteSpeedDialLink($url, $label, $image !== '' ? $image : null);
    }
    return array_filter($rows) ? $rows : [];
}

/**
 * The colours given to the labels of the groups, setting speed_dial_label_colors:
 * note id => #rrggbb. Anything else is dropped.
 *
 * @return array<int|string, string>
 */
function poznoteSpeedDialNormalizeLabelColors(array $value): array {
    $colors = [];
    foreach ($value as $noteId => $color) {
        if (ctype_digit((string)$noteId) && is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            $colors[$noteId] = strtolower($color);
        }
    }
    return $colors;
}

/** The width of the tiles in px, setting speed_dial_tile_size: what the slider of the view offers. */
function poznoteSpeedDialTileSize($size): int {
    if (!is_numeric($size)) return POZNOTE_SPEED_DIAL_TILE_DEFAULT;
    return (int)(round(max(POZNOTE_SPEED_DIAL_TILE_MIN, min(POZNOTE_SPEED_DIAL_TILE_MAX, (float)$size)) / 10) * 10);
}

/**
 * The favicon of a link's site, for a tile with no image of its own.
 */
function poznoteSpeedDialFavicon(string $url): ?string {
    $site = parse_url($url);
    if (empty($site['host']) || empty($site['scheme'])) return null;
    return $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '') . '/favicon.ico';
}
