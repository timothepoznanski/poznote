<?php
/**
 * The custom fonts an admin uploaded, offered in the App font and Markdown
 * editor font lists next to the fonts a device has installed (discussion #1562).
 *
 * The files live in data/fonts/, one per face: a family is several of them
 * (regular, bold, italic...) or a single variable font. What each file is, is
 * read from the font itself when it is a TrueType or OpenType file, and from
 * its name otherwise: WOFF2 tables are Brotli-compressed and PHP ships no
 * Brotli.
 *
 * The catalog built from the files is kept in the `custom_fonts` global
 * setting, because every HTML page hands it to js/theme-init.js and scanning
 * font files on each request is not worth it. It is rebuilt whenever the
 * library is listed, uploaded to or deleted from (api_upload_font.php).
 */

/** Where an uploaded font is stored, and where it is served from. */
function poznoteCustomFontsDir(): string
{
    return __DIR__ . '/data/fonts';
}

/** The extensions accepted, and the format() hint each one gets in CSS. */
function poznoteCustomFontFormats(): array
{
    return ['woff2' => 'woff2', 'woff' => 'woff', 'ttf' => 'truetype', 'otf' => 'opentype'];
}

function poznoteCustomFontNameIsValid($filename): bool
{
    return is_string($filename)
        && (bool) preg_match('/^[A-Za-z0-9._-]+\.(woff2|woff|ttf|otf)$/i', $filename);
}

/** Whether the first bytes are those of a font of the type the name claims. */
function poznoteCustomFontSignatureMatches(string $extension, string $head): bool
{
    $magic = substr($head, 0, 4);
    switch (strtolower($extension)) {
        case 'woff2':
            return $magic === 'wOF2';
        case 'woff':
            return $magic === 'wOFF';
        case 'ttf':
        case 'otf':
            return in_array($magic, ["\x00\x01\x00\x00", 'OTTO', 'true'], true);
    }
    return false;
}

/**
 * The id of a custom family, as stored in a user's font setting.
 *
 * Prefixed so it can never collide with a built-in font key, and so the client
 * can tell the two apart from the id alone.
 */
function poznoteCustomFontId(string $family): string
{
    $slug = strtolower(trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', $family), '-'));
    return 'custom:' . ($slug !== '' ? $slug : 'font');
}

/**
 * What a file name says about the face it holds.
 *
 * The name is read from its end: everything that is a weight, a style, a
 * variable-font marker or a subset tag is taken off, and what is left is the
 * family. That covers the three shapes fonts are distributed in:
 *
 *   OpenSans-SemiBoldItalic.ttf, OpenSans-VariableFont_wdth,wght.ttf   (Google Fonts)
 *   open-sans-v40-latin-600italic.woff2                                 (google-webfonts-helper)
 *   open-sans-latin-400-italic.woff2, open-sans-latin-wght-normal.woff2 (Fontsource)
 *
 * @return array{family:string,weight:int,style:string,variable:bool}
 */
function poznoteFontFaceFromFilename(string $filename): array
{
    // Regular, normal, roman and book are not listed: they are the default,
    // and "700-normal" has to stay a bold.
    $weights = [
        'thin' => 100, 'hairline' => 100, 'light' => 300, 'medium' => 500,
        'bold' => 700, 'black' => 900, 'heavy' => 900,
    ];
    $ignored = ['latin', 'ext', 'cyrillic', 'greek', 'vietnamese', 'all', 'webfont', 'subset'];
    $axes = ['wght', 'wdth', 'opsz', 'slnt', 'ital', 'vf', 'var'];
    $words = 'thin|hairline|extra|ultra|semi|demi|light|regular|normal|roman|book|medium|bold|black|heavy|italic|oblique|variable|font';

    $base = pathinfo($filename, PATHINFO_FILENAME);
    $tokens = preg_split('/[\s_,\[\]-]+/', $base, -1, PREG_SPLIT_NO_EMPTY) ?: [];

    $weight = null;
    $style = 'normal';
    $variable = false;

    while (count($tokens) > 1) {
        $token = strtolower((string) end($tokens));

        if (preg_match('/^([1-9]00)(italic|i)?$/', $token, $m)) {
            $weight = $weight ?? (int) $m[1];
            if (!empty($m[2])) {
                $style = 'italic';
            }
        } elseif (in_array($token, $axes, true)) {
            $variable = true;
        } elseif (in_array($token, $ignored, true) || preg_match('/^v\d+$/', $token)) {
            // A subset or a version: says nothing about the face.
        } elseif (preg_match('/^(?:' . $words . ')+$/', $token)) {
            // One token can carry several words: SemiBoldItalic, VariableFont.
            preg_match_all('/' . $words . '/', $token, $found);
            $parts = $found[0];
            foreach ($parts as $i => $word) {
                $previous = $i > 0 ? $parts[$i - 1] : '';
                if ($word === 'italic' || $word === 'oblique') {
                    $style = 'italic';
                } elseif ($word === 'variable') {
                    $variable = true;
                } elseif ($word === 'bold' && ($previous === 'semi' || $previous === 'demi')) {
                    $weight = 600;
                } elseif ($word === 'bold' && ($previous === 'extra' || $previous === 'ultra')) {
                    $weight = 800;
                } elseif ($word === 'light' && ($previous === 'extra' || $previous === 'ultra')) {
                    $weight = 200;
                } elseif (isset($weights[$word])) {
                    $weight = $weight ?? $weights[$word];
                }
            }
        } else {
            break;
        }

        array_pop($tokens);
    }

    // OpenSans -> Open Sans, open sans -> Open Sans
    $family = implode(' ', $tokens);
    $family = (string) preg_replace('/(?<=[a-z])(?=[A-Z])/', ' ', $family);
    if ($family === strtolower($family)) {
        $family = ucwords($family);
    }

    return [
        'family' => $family !== '' ? $family : 'Font',
        'weight' => $weight ?? 400,
        'style' => $style,
        'variable' => $variable,
    ];
}

/**
 * What a TrueType or OpenType file says about itself: its family (the
 * typographic one when it has one, so every weight lands in the same family),
 * its weight, whether it is italic, and the weight range of a variable font.
 *
 * Null for anything else, a WOFF or WOFF2 file included: the caller falls back
 * on the file name.
 *
 * @return array{family:string,weight:int,style:string,variable:bool,range:?array}|null
 */
function poznoteFontFaceFromSfnt(string $path): ?array
{
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return null;
    }

    $readAt = function (int $offset, int $length) use ($handle): string {
        if ($length <= 0 || fseek($handle, $offset) !== 0) {
            return '';
        }
        return (string) fread($handle, $length);
    };

    try {
        $header = $readAt(0, 12);
        if (strlen($header) < 12 || !in_array(substr($header, 0, 4), ["\x00\x01\x00\x00", 'OTTO', 'true'], true)) {
            return null;
        }

        $tableCount = unpack('n', substr($header, 4, 2))[1];
        $directory = $readAt(12, min($tableCount, 200) * 16);
        $tables = [];
        for ($i = 0; $i + 16 <= strlen($directory); $i += 16) {
            $entry = unpack('Noffset/Nlength', substr($directory, $i + 8, 8));
            $tables[substr($directory, $i, 4)] = $entry;
        }

        if (!isset($tables['name'])) {
            return null;
        }

        // name: the family is id 16 when the font has one, id 1 otherwise.
        // Windows records (UTF-16BE) are preferred, English ones first.
        $name = $readAt($tables['name']['offset'], min($tables['name']['length'], 262144));
        if (strlen($name) < 6) {
            return null;
        }
        $nameHeader = unpack('nformat/ncount/nstrings', substr($name, 0, 6));
        $families = [];
        for ($i = 0; $i < $nameHeader['count']; $i++) {
            $record = substr($name, 6 + $i * 12, 12);
            if (strlen($record) < 12) {
                break;
            }
            $r = unpack('nplatform/nencoding/nlanguage/nid/nlength/noffset', $record);
            if ($r['id'] !== 1 && $r['id'] !== 16) {
                continue;
            }
            $raw = substr($name, $nameHeader['strings'] + $r['offset'], $r['length']);
            if ($r['platform'] === 3 || $r['platform'] === 0) {
                $text = (string) @mb_convert_encoding($raw, 'UTF-8', 'UTF-16BE');
                $rank = ($r['platform'] === 3 && $r['language'] === 0x409) ? 0 : 1;
            } else {
                $text = (string) @mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1');
                $rank = 2;
            }
            $text = trim((string) preg_replace('/[\x00-\x1F\x7F]/', '', $text));
            if ($text === '') {
                continue;
            }
            $rank += $r['id'] === 16 ? 0 : 10;
            if (!isset($families[$rank])) {
                $families[$rank] = $text;
            }
        }
        if ($families === []) {
            return null;
        }
        ksort($families);
        $family = (string) reset($families);

        $weight = 400;
        $italic = false;
        if (isset($tables['OS/2'])) {
            $os2 = $readAt($tables['OS/2']['offset'], 64);
            if (strlen($os2) >= 64) {
                $weight = unpack('n', substr($os2, 4, 2))[1];
                $selection = unpack('n', substr($os2, 62, 2))[1];
                $italic = ($selection & 1) === 1;
                // Some bold files carry an in-between weight class (558 in a
                // JetBrains Mono Bold) next to the flag that calls them bold.
                if (($selection & 32) === 32 && $weight < 600) {
                    $weight = 700;
                }
            }
        }
        $weight = max(1, min(1000, $weight ?: 400));

        // fvar: a variable font, and the range its weight axis covers.
        $variable = false;
        $range = null;
        if (isset($tables['fvar'])) {
            $fvar = $readAt($tables['fvar']['offset'], min($tables['fvar']['length'], 4096));
            if (strlen($fvar) >= 16) {
                $f = unpack('nmajor/nminor/naxes/nreserved/ncount/nsize', substr($fvar, 0, 12));
                for ($i = 0; $i < $f['count']; $i++) {
                    $axis = substr($fvar, $f['axes'] + $i * $f['size'], 20);
                    if (strlen($axis) < 16) {
                        break;
                    }
                    if (substr($axis, 0, 4) === 'wght') {
                        $bounds = unpack('Nmin/Ndefault/Nmax', substr($axis, 4, 12));
                        $variable = true;
                        // 16.16 fixed point
                        $range = [
                            max(1, min(1000, (int) round($bounds['min'] / 65536))),
                            max(1, min(1000, (int) round($bounds['max'] / 65536))),
                        ];
                    }
                }
            }
        }

        return [
            'family' => $family,
            'weight' => $weight,
            'style' => $italic ? 'italic' : 'normal',
            'variable' => $variable,
            'range' => $range,
        ];
    } catch (Throwable $e) {
        return null;
    } finally {
        fclose($handle);
    }
}

/**
 * The font-weight range each face of one style declares, keyed like $weights.
 *
 * Every stylesheet asks for the 'Inter' family, so a custom font is applied by
 * declaring its files as faces of that family (js/theme-init.js). The bundled
 * Inter faces stay declared underneath, at 300, 400 and 600: a custom face
 * only replaces the ones whose weight it claims. So the faces of a family
 * share out the whole scale between them, each one taking the weights it is
 * the closest to, and no request is left to the bundled Inter by accident.
 *
 * The scale is split at 600. A face lighter than that never claims 600 and
 * above: a face whose range reaches 600 is what the browser takes for a real
 * bold, and it then stops emboldening it. A family with no bold file keeps the
 * bundled semibold for its bold text instead.
 *
 * @param array<int|string,int> $weights the real weight of each static face
 * @return array<int|string,array{0:int,1:int}>
 */
function poznoteFontWeightRanges(array $weights): array
{
    $ranges = [];
    foreach ([[1, 599], [600, 1000]] as [$low, $high]) {
        $group = array_filter($weights, function ($weight) use ($low, $high) {
            return $weight >= $low && $weight <= $high;
        });
        asort($group);
        $keys = array_keys($group);
        $from = $low;
        foreach ($keys as $i => $key) {
            $to = isset($keys[$i + 1])
                ? intdiv($group[$key] + $group[$keys[$i + 1]], 2)
                : $high;
            $ranges[$key] = [$from, max($from, $to)];
            $from = max($from, $to) + 1;
        }
    }
    return $ranges;
}

/**
 * Group described files into families, ready for the client.
 *
 * @param array<int,array{file:string,url:string,family:string,weight:int,style:string,variable:bool,range?:?array}> $files
 * @return array<int,array{id:string,name:string,faces:array}>
 */
function poznoteBuildFontCatalog(array $files): array
{
    $formats = poznoteCustomFontFormats();
    $preference = array_flip(array_keys($formats));

    $families = [];
    foreach ($files as $file) {
        $id = poznoteCustomFontId($file['family']);
        $extension = strtolower(pathinfo($file['file'], PATHINFO_EXTENSION));
        $file['format'] = $formats[$extension] ?? '';
        $file['order'] = $preference[$extension] ?? 99;
        if (!isset($families[$id])) {
            $families[$id] = ['id' => $id, 'name' => $file['family'], 'files' => []];
        }
        $families[$id]['files'][] = $file;
    }

    $catalog = [];
    foreach ($families as $family) {
        $faces = [];
        foreach (['normal', 'italic'] as $style) {
            $ofStyle = array_values(array_filter($family['files'], function ($file) use ($style) {
                return $file['style'] === $style;
            }));
            // The same face in two formats: the most compact one is kept.
            usort($ofStyle, function ($a, $b) {
                return $a['order'] <=> $b['order'];
            });

            $variable = null;
            foreach ($ofStyle as $file) {
                if ($file['variable']) {
                    $variable = $file;
                    break;
                }
            }

            if ($variable !== null) {
                // One file draws every weight. The range is widened to the
                // whole scale so no weight is left to the bundled Inter; the
                // browser clamps to what the axis really offers.
                $max = $variable['range'][1] ?? 900;
                $faces[] = [
                    'file' => $variable['file'],
                    'url' => $variable['url'],
                    'format' => $variable['format'],
                    'style' => $style,
                    'weight' => '1 ' . ($max >= 600 ? 1000 : 599),
                    'label' => ($variable['range'][0] ?? 100) . '-' . $max,
                ];
                continue;
            }

            $weights = [];
            $byWeight = [];
            foreach ($ofStyle as $file) {
                if (isset($byWeight[$file['weight']])) {
                    continue;
                }
                $byWeight[$file['weight']] = $file;
                $weights[$file['weight']] = $file['weight'];
            }
            ksort($byWeight);
            $ranges = poznoteFontWeightRanges($weights);
            foreach ($byWeight as $weight => $file) {
                $faces[] = [
                    'file' => $file['file'],
                    'url' => $file['url'],
                    'format' => $file['format'],
                    'style' => $style,
                    'weight' => $ranges[$weight][0] . ' ' . $ranges[$weight][1],
                    'label' => (string) $weight,
                ];
            }
        }

        $catalog[] = [
            'id' => $family['id'],
            'name' => $family['name'],
            'faces' => $faces,
            'files' => array_values(array_unique(array_column($family['files'], 'file'))),
        ];
    }

    usort($catalog, function ($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });

    return $catalog;
}

/** Every font file in data/fonts/, by name, ordered so listings stay stable. */
function poznoteCustomFontFiles(): array
{
    $files = [];
    foreach (glob(poznoteCustomFontsDir() . '/*') ?: [] as $path) {
        $filename = basename($path);
        if (!poznoteCustomFontNameIsValid($filename) || !is_file($path)) {
            continue;
        }
        $files[$filename] = $path;
    }
    uksort($files, 'strcasecmp');
    return $files;
}

/** Read data/fonts/ and build the catalog from what is there. */
function poznoteScanCustomFonts(): array
{
    $described = [];
    foreach (poznoteCustomFontFiles() as $filename => $path) {
        $face = poznoteFontFaceFromSfnt($path) ?? poznoteFontFaceFromFilename($filename);
        $described[] = $face + [
            'file' => $filename,
            'url' => '/data/fonts/' . rawurlencode($filename) . '?v=' . filemtime($path),
        ];
    }
    return poznoteBuildFontCatalog($described);
}

/** Keep only well-formed families: the setting is read on every page. */
function poznoteNormalizeFontCatalog($raw): array
{
    if (is_string($raw)) {
        $raw = json_decode($raw, true);
    }
    if (!is_array($raw)) {
        return [];
    }

    $catalog = [];
    foreach ($raw as $family) {
        if (!is_array($family)
            || !is_string($family['id'] ?? null) || !preg_match('/^custom:[a-z0-9-]+$/', $family['id'])
            || !is_string($family['name'] ?? null) || trim($family['name']) === ''
            || !is_array($family['faces'] ?? null)) {
            continue;
        }

        $faces = [];
        foreach ($family['faces'] as $face) {
            if (!is_array($face)
                || !poznoteCustomFontNameIsValid($face['file'] ?? null)
                || !is_string($face['url'] ?? null)
                || !preg_match('#^/data/fonts/[A-Za-z0-9._%-]+\?v=\d+$#', $face['url'])
                || !in_array($face['format'] ?? '', poznoteCustomFontFormats(), true)
                || !in_array($face['style'] ?? '', ['normal', 'italic'], true)
                || !preg_match('/^\d{1,4} \d{1,4}$/', (string) ($face['weight'] ?? ''))) {
                continue;
            }
            $faces[] = [
                'file' => $face['file'],
                'url' => $face['url'],
                'format' => $face['format'],
                'style' => $face['style'],
                'weight' => $face['weight'],
                'label' => preg_replace('/[^0-9-]/', '', (string) ($face['label'] ?? '')),
            ];
        }
        if ($faces === []) {
            continue;
        }

        $catalog[] = [
            'id' => $family['id'],
            'name' => trim($family['name']),
            'faces' => $faces,
            'files' => array_values(array_filter((array) ($family['files'] ?? []), 'poznoteCustomFontNameIsValid')),
        ];
    }

    return $catalog;
}

/**
 * The stored catalog.
 *
 * Read once per request: the pages ask on every HTML response, and this is a
 * lookup in the master DB.
 */
function poznoteCustomFonts(bool $reload = false): array
{
    static $cached = null;
    if ($reload) {
        $cached = null;
    }
    if ($cached !== null) {
        return $cached;
    }

    $cached = [];
    try {
        require_once __DIR__ . '/users/db_master.php';
        $cached = poznoteNormalizeFontCatalog(getGlobalSetting('custom_fonts', ''));
    } catch (Exception $e) {
        error_log('font_catalog: poznoteCustomFonts() failed: ' . $e->getMessage());
    }

    return $cached;
}

/** Rebuild the catalog from the files and store it. */
function poznoteRefreshCustomFonts(): array
{
    $catalog = poznoteScanCustomFonts();
    $json = $catalog === [] ? '' : (string) json_encode($catalog);
    if ($json !== (string) getGlobalSetting('custom_fonts', '')) {
        setGlobalSetting('custom_fonts', $json);
    }
    return poznoteCustomFonts(true);
}

/**
 * What the browser needs to apply a custom font: the faces of each family,
 * with their address under the path the app is served from.
 */
function poznoteCustomFontsForClient(string $prefix = ''): array
{
    $fonts = [];
    foreach (poznoteCustomFonts() as $family) {
        $faces = [];
        foreach ($family['faces'] as $face) {
            $faces[] = [
                'url' => $prefix . $face['url'],
                'format' => $face['format'],
                'style' => $face['style'],
                'weight' => $face['weight'],
            ];
        }
        $fonts[] = ['id' => $family['id'], 'name' => $family['name'], 'faces' => $faces];
    }
    return $fonts;
}
