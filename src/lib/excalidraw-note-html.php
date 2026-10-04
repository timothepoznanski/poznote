<?php
/**
 * Where the diagram sits in the HTML file of a full Excalidraw note.
 *
 * api_save_excalidraw.php writes the diagram as one container:
 *
 *   <div class="excalidraw-container" contenteditable="false">
 *     <img ... data-is-excalidraw="true" />
 *     <div class="excalidraw-data" style="display: none;">ESCAPED JSON</div>
 *   </div>
 *
 * and the note is an ordinary HTML note, so text the user typed may surround
 * it. The JSON carries every embedded image as base64, which puts a diagram
 * with a photo in the megabytes. The save used to find the container with a
 * lazy `.*?` across that JSON: past about a megabyte PCRE ran out of
 * backtracking, preg_match() answered false, and the save appended a second
 * copy instead of replacing the first, so the file grew by the whole diagram
 * on every save (issue #1567). Below that size the match stopped at the data
 * div's </div> and left the container's own </div> behind, one more per save.
 *
 * These helpers pair the <div> tags instead, which is linear in the size of
 * the file whatever the diagram holds. Escaped JSON never contains a raw "<",
 * so no tag can hide inside the data.
 */

const POZNOTE_EXCALIDRAW_CONTAINER_OPEN = '<div class="excalidraw-container"';
const POZNOTE_EXCALIDRAW_DATA_OPEN = '<div class="excalidraw-data"';

/**
 * The byte ranges [start, end) of every full-note diagram container in $html,
 * in document order. Each range also covers what belongs to the container on
 * a save: the whitespace and empty placeholder paragraph around it, and the
 * unmatched </div> tags the old regex left right after it. A container is a
 * full-note one when it holds an excalidraw-data div; diagrams embedded in a
 * note keep their JSON in an attribute and are left alone.
 *
 * Returns null when the tags cannot be read (a PCRE failure, which a
 * possessive pattern is not expected to produce); a save then appends the
 * diagram, as it does for a note that has none.
 *
 * @return array<int, array{0: int, 1: int}>|null
 */
function poznoteFindExcalidrawNoteDiagrams(string $html): ?array
{
    if (strpos($html, POZNOTE_EXCALIDRAW_CONTAINER_OPEN) === false) {
        return [];
    }

    // Possessive, so a long attribute (an embedded diagram's JSON) is read
    // once and never backtracked into.
    if (preg_match_all('/<(\/?)div\b[^>]*+>/i', $html, $tags, PREG_SET_ORDER | PREG_OFFSET_CAPTURE) === false) {
        return null;
    }

    $spans = [];
    $open = [];
    foreach ($tags as $tag) {
        $offset = $tag[0][1];
        $end = $offset + strlen($tag[0][0]);

        if ($tag[1][0] === '') {
            $open[] = $offset;
            continue;
        }

        if (!$open) {
            // An unmatched </div>: absorb it when only whitespace separates
            // it from the container before it, which is where the old
            // replace left one on every save.
            $last = count($spans) - 1;
            if ($last >= 0 && trim(substr($html, $spans[$last][1], $offset - $spans[$last][1])) === '') {
                $spans[$last][1] = $end;
            }
            continue;
        }

        $start = array_pop($open);
        if (substr_compare($html, POZNOTE_EXCALIDRAW_CONTAINER_OPEN, $start, strlen(POZNOTE_EXCALIDRAW_CONTAINER_OPEN)) !== 0) {
            continue;
        }
        $data = strpos($html, POZNOTE_EXCALIDRAW_DATA_OPEN, $start);
        if ($data === false || $data >= $end) {
            continue;
        }
        // Tags close inside out: a container found earlier within this one
        // is part of this one's range.
        while ($spans && $spans[count($spans) - 1][0] > $start) {
            array_pop($spans);
        }
        $spans[] = [$start, $end];
    }

    $previousEnd = 0;
    foreach ($spans as $i => [$start, $end]) {
        [$start, $end] = poznoteExtendExcalidrawNoteDiagram($html, $start, $end);
        // Two copies separated by whitespace would otherwise both claim it.
        $start = max($start, $previousEnd);
        $spans[$i] = [$start, $end];
        $previousEnd = $end;
    }
    return $spans;
}

/**
 * Widens a container range over the whitespace and empty placeholder
 * paragraph on each side, the same surroundings the save has always replaced
 * along with the container.
 *
 * @return array{0: int, 1: int}
 */
function poznoteExtendExcalidrawNoteDiagram(string $html, int $start, int $end): array
{
    $placeholder = '<p class="excalidraw-placeholder"[^>]*+><\/p>';

    $lookBehind = min($start, 1024);
    $before = substr($html, $start - $lookBehind, $lookBehind);
    if (preg_match('/(?:' . $placeholder . ')?\s*$/', $before, $m, PREG_OFFSET_CAPTURE)) {
        $start -= $lookBehind - $m[0][1];
    }

    $after = substr($html, $end, 1024);
    if (preg_match('/^\s*(?:' . $placeholder . ')?/', $after, $m)) {
        $end += strlen($m[0]);
    }

    return [$start, $end];
}

/**
 * The diagram JSON of a full Excalidraw note, decoded from its last
 * excalidraw-data div, or null when the file holds none. The last one is the
 * newest: a file the old save bloated has its copies appended in save order.
 *
 * The data div is looked up on its own, not through its container: an editor
 * that found nothing would open empty and the next save would overwrite the
 * diagram, so a container left unclosed or written with its attributes in
 * another order must still give its data back.
 */
function poznoteReadExcalidrawNoteData(string $html): ?string
{
    $data = strrpos($html, POZNOTE_EXCALIDRAW_DATA_OPEN);
    $contentStart = $data === false ? false : strpos($html, '>', $data);
    $contentEnd = $contentStart === false ? false : strpos($html, '</div>', $contentStart);
    if ($contentEnd === false) {
        return null;
    }

    return trim(html_entity_decode(
        substr($html, $contentStart + 1, $contentEnd - $contentStart - 1),
        ENT_QUOTES | ENT_HTML5
    ));
}

/**
 * The diagram JSON held by the entry column, for when the note's file gives
 * none. The column holds the note's HTML, or, on a note last saved by an
 * older version, the diagram JSON itself.
 */
function poznoteExcalidrawDataFromEntry(?string $entry): ?string
{
    if ($entry === null || $entry === '') {
        return null;
    }
    $data = poznoteReadExcalidrawNoteData($entry);
    if ($data !== null) {
        return $data;
    }
    return strpos($entry, POZNOTE_EXCALIDRAW_CONTAINER_OPEN) === false ? $entry : null;
}

/**
 * Puts $diagramHtml where the note's diagram was and removes any other copy,
 * so a file the old save bloated heals on its next save. Appends it when the
 * note has no diagram yet. $spans is what poznoteFindExcalidrawNoteDiagrams()
 * returned for $html, when the caller already has it.
 *
 * @param array<int, array{0: int, 1: int}>|null $spans
 */
function poznoteReplaceExcalidrawNoteDiagram(string $html, string $diagramHtml, ?array $spans = null): string
{
    $spans = $spans ?? poznoteFindExcalidrawNoteDiagrams($html);
    if (!$spans) {
        return $html . $diagramHtml;
    }

    $result = '';
    $cursor = 0;
    foreach ($spans as $i => [$start, $end]) {
        $result .= substr($html, $cursor, $start - $cursor);
        if ($i === 0) {
            $result .= $diagramHtml;
        }
        $cursor = $end;
    }
    return $result . substr($html, $cursor);
}

/**
 * The preview attachment ids of the diagrams poznoteFindExcalidrawNoteDiagrams()
 * found, which a save replaces: the current one and those of any copy.
 *
 * @param array<int, array{0: int, 1: int}> $spans
 * @return array<int, string>
 */
function poznoteExcalidrawNoteDiagramAttachmentIds(string $html, array $spans, int $noteId): array
{
    $ids = [];
    foreach ($spans as [$start, $end]) {
        foreach (poznoteExcalidrawPreviewAttachmentIds(substr($html, $start, $end - $start), $noteId) as $id) {
            $ids[$id] = true;
        }
    }
    return array_keys($ids);
}

/**
 * The attachment ids of the Excalidraw preview images in $html for $noteId.
 *
 * @return array<int, string>
 */
function poznoteExcalidrawPreviewAttachmentIds(string $html, int $noteId): array
{
    $pattern = '/<img\b[^>]*?\bsrc="\/api\/v1\/notes\/' . $noteId . '\/attachments\/([a-zA-Z0-9._-]+)"[^>]*+>/';
    if (!preg_match_all($pattern, $html, $matches, PREG_SET_ORDER)) {
        return [];
    }

    $ids = [];
    foreach ($matches as $match) {
        if (strpos($match[0], 'data-is-excalidraw="true"') !== false) {
            $ids[] = $match[1];
        }
    }
    return array_values(array_unique($ids));
}
