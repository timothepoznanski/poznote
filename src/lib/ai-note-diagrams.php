<?php
/**
 * Excalidraw diagrams embedded in a note, as the AI assistant reads and
 * writes them: placeholders on the way out, the stored diagrams on the way
 * back. Pure string work, loadable on its own.
 */

const AI_DIAGRAM_PREFIX = '/poznote-diagram/';

/**
 * The Excalidraw diagrams embedded in a note, keyed by the name their
 * placeholder carries: the diagram id when it has a plain one, its position
 * otherwise. Each entry is [offset, length, html] of the whole container.
 *
 * A diagram is a <div class="excalidraw-container"> that keeps its scene as
 * JSON in data-excalidraw around the preview image. The model never sees that
 * markup (issue #1579): a rich-text note reaches it as Markdown, where the
 * container came out as a plain image and was written back as one, no longer
 * editable; in a Markdown note the JSON, megabytes of it with an embedded
 * photo, filled the read budget and had to be copied back to the letter.
 *
 * The open tag is read quote by quote: a browser serialises the JSON with
 * its ">" unescaped, so the tag cannot be taken to end at the first one.
 *
 * @return array<string, array{0: int, 1: int, 2: string}>
 */
function aiFindEmbeddedDiagrams($content) {
    $content = (string)$content;
    $diagrams = [];
    if (stripos($content, 'excalidraw-container') === false) {
        return $diagrams;
    }
    if (!preg_match_all('/<div\b(?:[^>"\']++|"[^"]*+"|\'[^\']*+\')*+>/i', $content, $tags, PREG_OFFSET_CAPTURE)) {
        return $diagrams;
    }
    $n = 0;
    $count = count($tags[0]);
    foreach ($tags[0] as $i => [$tag, $offset]) {
        if (!preg_match('/\bclass\s*=\s*(["\'])[^"\']*\bexcalidraw-container\b[^"\']*\1/i', $tag)
            || !preg_match('/\bdata-excalidraw\s*=/i', $tag)) {
            continue;
        }
        $close = stripos($content, '</div>', $offset + strlen($tag));
        // An embedded diagram holds an image, never another div
        if ($close === false || ($i + 1 < $count && $tags[0][$i + 1][1] < $close)) {
            continue;
        }
        $n++;
        $key = (string)$n;
        if (preg_match('/\bid\s*=\s*(["\'])([A-Za-z0-9_-]{1,80})\1/', $tag, $id) && !isset($diagrams[$id[2]])) {
            $key = $id[2];
        }
        $length = $close + strlen('</div>') - $offset;
        $diagrams[$key] = [$offset, $length, substr($content, $offset, $length)];
    }
    return $diagrams;
}

/**
 * The note with each embedded diagram swapped for a short image placeholder,
 * which survives the Markdown round trip of a rich-text note and reads as an
 * ordinary image line in a Markdown one. aiRestoreEmbeddedDiagrams() puts the
 * diagrams back when the note is written.
 */
function aiHideEmbeddedDiagrams($content, $asMarkdown) {
    $content = (string)$content;
    foreach (array_reverse(aiFindEmbeddedDiagrams($content), true) as $key => [$offset, $length]) {
        $src = AI_DIAGRAM_PREFIX . $key;
        $placeholder = $asMarkdown
            ? '![Excalidraw diagram](' . $src . ')'
            : '<p><img src="' . $src . '" alt="Excalidraw diagram"></p>';
        $content = substr_replace($content, $placeholder, $offset, $length);
    }
    return $content;
}

/**
 * Put the diagrams of the stored note back where the model kept their
 * placeholders, as they were stored: scene, size and alignment included.
 * A placeholder the model dropped removes its diagram, as deleting any other
 * line would; one it repeated or invented is removed, two containers with
 * the same id could not be told apart by the editor.
 */
function aiRestoreEmbeddedDiagrams($content, $storedContent, $asMarkdown) {
    $diagrams = aiFindEmbeddedDiagrams($storedContent);
    $prefix = preg_quote(AI_DIAGRAM_PREFIX, '~');
    $pattern = $asMarkdown
        ? '~!\[[^\]\n]*\]\(' . $prefix . '([A-Za-z0-9_-]+)[^)\n]*\)~'
        : '~(<p\b[^>]*>\s*)?<img\b[^>]*\bsrc=["\']' . $prefix . '([A-Za-z0-9_-]+)["\'][^>]*>(\s*</p>)?~i';
    return preg_replace_callback($pattern, function ($m) use (&$diagrams, $asMarkdown) {
        $key = $asMarkdown ? $m[1] : $m[2];
        $html = '';
        if (isset($diagrams[$key])) {
            $html = $diagrams[$key][2];
            unset($diagrams[$key]);
        }
        if ($asMarkdown) {
            return $html;
        }
        // The placeholder's own paragraph goes with it; a paragraph it
        // shares with text (only one end matched) stays
        $ownParagraph = ($m[1] ?? '') !== '' && ($m[3] ?? '') !== '';
        return $ownParagraph ? $html : ($m[1] ?? '') . $html . ($m[3] ?? '');
    }, (string)$content) ?? (string)$content;
}
