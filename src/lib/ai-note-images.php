<?php
/**
 * Display sizes of the images of a rich-text note, carried across the
 * Markdown round trip the AI assistant reads and writes notes through.
 * Pure string work, loadable on its own.
 */

/**
 * An <img> tag is read quote by quote: a browser serialises an attribute
 * value with its ">" unescaped, so the tag cannot be taken to end at the
 * first one (same reason as aiFindEmbeddedDiagrams()).
 */
const AI_IMG_TAG_PATTERN = '/<img\b(?:[^>"\']++|"[^"]*+"|\'[^\']*+\')*+>/i';

/** A size this code is willing to copy: what the resize handle writes. */
const AI_IMG_SIZE_PATTERN = '/^\d{1,5}%?$/';

/** The value of a quoted attribute of one tag, null when it has none. */
function aiImgAttribute(string $tag, string $name): ?string
{
    if (!preg_match('/\b' . $name . '\s*=\s*(["\'])(.*?)\1/is', $tag, $m)) {
        return null;
    }
    return $m[2];
}

/**
 * The display size of each image of the note, keyed by its src: [width,
 * height], either of them null when the image does not carry it.
 *
 * A src the note uses twice with two different sizes is left out rather than
 * guessed: the two copies are the same picture, nothing in the Markdown view
 * says which one the model kept where, and sizing one of them after the other
 * would be a change the user never asked for.
 */
function aiNoteImageSizes(string $html): array
{
    if (stripos($html, '<img') === false || !preg_match_all(AI_IMG_TAG_PATTERN, $html, $tags)) {
        return [];
    }
    $sizes = [];
    foreach ($tags[0] as $tag) {
        $src = aiImgAttribute($tag, 'src');
        if ($src === null || $src === '') {
            continue;
        }
        $key = html_entity_decode($src, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $size = [];
        foreach (['width', 'height'] as $name) {
            $value = aiImgAttribute($tag, $name);
            $value = $value === null ? null : trim($value);
            $size[] = ($value !== null && preg_match(AI_IMG_SIZE_PATTERN, $value)) ? $value : null;
        }
        if (array_key_exists($key, $sizes) && $sizes[$key] !== $size) {
            $sizes[$key] = null; // two sizes for one image: ambiguous
            continue;
        }
        $sizes[$key] = $size;
    }
    return array_filter($sizes, function ($size) {
        return is_array($size) && ($size[0] !== null || $size[1] !== null);
    });
}

/**
 * Put the display sizes of the stored note back on the images of the content
 * the model wrote (issue #1744).
 *
 * A resized image carries its size as width/height attributes, and Markdown's
 * image syntax has nowhere to keep them: an image read as Markdown and written
 * back came out at its natural size, every edit of the note undoing the
 * resize. The sizes are matched by src, after the inline images got their
 * data: URI back, so nothing has to survive the conversion.
 *
 * Only an image the model left without any size of its own is touched, so an
 * <img> it sized itself is taken at its word, and only values the resize
 * handle could have written are copied, sanitizeHtml() having already run.
 */
function aiRestoreImageSizes($content, $storedContent)
{
    $content = (string)$content;
    if (stripos($content, '<img') === false) {
        return $content;
    }
    $sizes = aiNoteImageSizes((string)$storedContent);
    if (!$sizes) {
        return $content;
    }
    $result = preg_replace_callback(AI_IMG_TAG_PATTERN, function ($m) use ($sizes) {
        $tag = $m[0];
        if (preg_match('/\b(?:width|height)\s*=/i', $tag)) {
            return $tag;
        }
        $src = aiImgAttribute($tag, 'src');
        if ($src === null) {
            return $tag;
        }
        $key = html_entity_decode($src, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (!isset($sizes[$key])) {
            return $tag;
        }
        $added = '';
        foreach (['width', 'height'] as $i => $name) {
            if ($sizes[$key][$i] !== null) {
                $added .= ' ' . $name . '="' . htmlspecialchars($sizes[$key][$i], ENT_QUOTES, 'UTF-8') . '"';
            }
        }
        return preg_replace('~\s*/?>$~', $added . '>', $tag, 1);
    }, $content);
    return $result === null ? $content : $result;
}
