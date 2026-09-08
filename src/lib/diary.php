<?php
/**
 * Diary date formats, title parsing and diary root folder resolution.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

/**
 * Note type used when creating a diary entry: 'markdown' when the
 * diary_default_note_type setting asks for it, 'note' (HTML) otherwise.
 */
function getDiaryDefaultNoteType(): string {
    return trim((string)getSetting('diary_default_note_type', '')) === 'markdown' ? 'markdown' : 'note';
}

/**
 * Title formats a diary entry can use, keyed by the diary_date_format setting.
 * Each entry holds the PHP date() pattern used to build a title and the regex
 * used to recognize one, with the (year, month, day) capture groups named so
 * the order of the format does not matter to the caller.
 *
 * Every format is always recognized, whatever the setting: changing the
 * preference must not orphan the entries titled with the previous one.
 */
function getDiaryDateFormats(): array {
    return [
        'ymd'       => ['pattern' => 'Y-m-d',  'regex' => '/^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$/'],
        'dmy_slash' => ['pattern' => 'd/m/Y',  'regex' => '/^(?<d>\d{2})\/(?<m>\d{2})\/(?<y>\d{4})$/'],
        'mdy_slash' => ['pattern' => 'm/d/Y',  'regex' => '/^(?<m>\d{2})\/(?<d>\d{2})\/(?<y>\d{4})$/'],
        'dmy_dot'   => ['pattern' => 'd.m.Y',  'regex' => '/^(?<d>\d{2})\.(?<m>\d{2})\.(?<y>\d{4})$/'],
        'ymd_slash' => ['pattern' => 'Y/m/d',  'regex' => '/^(?<y>\d{4})\/(?<m>\d{2})\/(?<d>\d{2})$/'],
    ];
}

/**
 * Tokens a custom diary date pattern accepts, with the PHP date() letter they
 * produce and the regex fragment recognizing them again. Longest token first:
 * the compiler consumes greedily, so YYYY must be tried before YY.
 *
 * Only date tokens are offered. A diary title designates a day, so a time part
 * would make two entries of the same day look like different days.
 */
function getDiaryDateCustomTokens(): array {
    return [
        'YYYY' => ['php' => 'Y', 'regex' => '(?<y>\d{4})', 'part' => 'y'],
        'YY'   => ['php' => 'y', 'regex' => '(?<y2>\d{2})', 'part' => 'y'],
        'MMMM' => ['php' => 'F', 'regex' => '(?<mn>[^\d\/.,_\-\s]+)', 'part' => 'm'],
        'MMM'  => ['php' => 'M', 'regex' => '(?<ms>[^\d\/.,_\-\s]+)', 'part' => 'm'],
        'MM'   => ['php' => 'm', 'regex' => '(?<m>\d{2})', 'part' => 'm'],
        'DD'   => ['php' => 'd', 'regex' => '(?<d>\d{2})', 'part' => 'd'],
    ];
}

/**
 * Render the legend of a custom date pattern under its input: the tokens stay
 * literal because the compiler matches them verbatim, only their meaning is
 * translated. $group is 'date_time_format' or 'diary_date_format'.
 */
function renderDateFormatTokenLegend(string $group): string {
    $dict = loadI18nDictionary(getUserLanguage());
    $en = loadI18nDictionary('en');
    $path = ['modals', $group, 'tokens'];

    $tokens = $dict;
    foreach ($path as $part) {
        $tokens = is_array($tokens) && isset($tokens[$part]) ? $tokens[$part] : null;
    }
    if (!is_array($tokens) || empty($tokens)) {
        $tokens = $en;
        foreach ($path as $part) {
            $tokens = is_array($tokens) && isset($tokens[$part]) ? $tokens[$part] : null;
        }
    }
    if (!is_array($tokens) || empty($tokens)) {
        return '';
    }

    $html = '<dl class="date-format-tokens">';
    foreach ($tokens as $token => $meaning) {
        $html .= '<dt><code>' . htmlspecialchars((string)$token, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></dt>'
               . '<dd>' . htmlspecialchars((string)$meaning, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</dd>';
    }
    $html .= '</dl>';

    return $html;
}

function isCustomDiaryDateFormat($format): bool {
    return is_string($format) && strpos($format, 'custom:') === 0;
}

function getCustomDiaryDatePattern($format): string {
    return trim(substr((string)$format, 7));
}

/**
 * Compile a custom pattern into ['pattern' => <php date()>, 'regex' => <parser>],
 * or null when it could never round-trip. A diary title is an identifier, not
 * just a label: it must rebuild an unambiguous day, so a pattern is rejected
 * unless it carries a year, a month and a day exactly once each.
 */
function compileDiaryDateCustomFormat(string $pattern): ?array {
    $pattern = trim($pattern);
    if ($pattern === '' || strlen($pattern) > 80) return null;
    // Same character class as the date & time custom format, minus ':' since a
    // diary title carries no time part.
    if (!preg_match('/^[A-Za-z0-9\s\/.,_\-()]+$/', $pattern)) return null;

    $tokens = getDiaryDateCustomTokens();
    $php = '';
    $regex = '';
    $seen = [];
    $length = strlen($pattern);

    for ($i = 0; $i < $length; $i++) {
        $matched = false;
        foreach ($tokens as $token => $spec) {
            $tokenLength = strlen($token);
            if (substr($pattern, $i, $tokenLength) === $token) {
                // A part repeated twice (e.g. "DD-DD") would build a regex with
                // duplicate group names, and means nothing as a date anyway.
                if (isset($seen[$spec['part']])) return null;
                $seen[$spec['part']] = true;
                $php .= $spec['php'];
                $regex .= $spec['regex'];
                $i += $tokenLength - 1;
                $matched = true;
                break;
            }
        }
        if ($matched) continue;

        $char = $pattern[$i];
        // Literal text: escaped for date() so it is not read as a format letter,
        // and quoted for the regex.
        $php .= ctype_alpha($char) ? '\\' . $char : $char;
        $regex .= preg_quote($char, '/');
    }

    if (!isset($seen['y']) || !isset($seen['m']) || !isset($seen['d'])) {
        return null;
    }

    return ['pattern' => $php, 'regex' => '/^' . $regex . '$/u'];
}

/**
 * The diary_date_format setting as stored: a key of getDiaryDateFormats(), or
 * 'custom:<pattern>' when a valid custom pattern was saved. Falls back to
 * 'ymd' for anything unknown or malformed.
 */
function getDiaryDateFormat(): string {
    $format = trim((string)getSetting('diary_date_format', ''));
    if (isCustomDiaryDateFormat($format)
        && compileDiaryDateCustomFormat(getCustomDiaryDatePattern($format)) !== null) {
        return $format;
    }
    return array_key_exists($format, getDiaryDateFormats()) ? $format : 'ymd';
}

/**
 * The format spec (['pattern' => ..., 'regex' => ...]) currently in use.
 */
function getDiaryDateFormatSpec(): array {
    $format = getDiaryDateFormat();
    if (isCustomDiaryDateFormat($format)) {
        $compiled = compileDiaryDateCustomFormat(getCustomDiaryDatePattern($format));
        if ($compiled !== null) return $compiled;
    }
    $formats = getDiaryDateFormats();
    return $formats[$format] ?? $formats['ymd'];
}

/**
 * PHP date() pattern used to title new diary entries.
 */
function getDiaryDateFormatPattern(): string {
    return getDiaryDateFormatSpec()['pattern'];
}

/**
 * Title of the diary entry for a day, in the configured format.
 * $date is a DateTimeInterface or a 'YYYY-MM-DD' string.
 */
function formatDiaryEntryTitle($date): string {
    if (!($date instanceof DateTimeInterface)) {
        $parsed = DateTime::createFromFormat('!Y-m-d', (string)$date);
        if ($parsed === false) return (string)$date;
        $date = $parsed;
    }
    return $date->format(getDiaryDateFormatPattern());
}

/**
 * Month number a MMMM/MMM capture designates (1-12), or 0 when the name
 * belongs to no month. Matched against the month names of the active locale
 * as date() would render them, so parsing mirrors formatting.
 */
function diaryMonthNameToNumber(string $name): int {
    $name = mb_strtolower(trim($name));
    if ($name === '') return 0;
    for ($month = 1; $month <= 12; $month++) {
        $ref = new DateTime(sprintf('2000-%02d-01', $month));
        if (mb_strtolower($ref->format('F')) === $name
            || mb_strtolower($ref->format('M')) === $name) {
            return $month;
        }
    }
    return 0;
}

/**
 * Custom patterns this account has titled entries with, most recent first.
 * Built-in formats are always recognized, but a custom one is only known while
 * it is configured, so every pattern ever saved is remembered here: switching
 * away from a custom format must not orphan the entries written under it.
 */
function getDiaryDateFormatHistory(): array {
    $raw = trim((string)getSetting('diary_date_format_history', ''));
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) return [];

    $patterns = [];
    foreach ($decoded as $pattern) {
        if (is_string($pattern) && compileDiaryDateCustomFormat($pattern) !== null) {
            $patterns[] = $pattern;
        }
    }
    return $patterns;
}

/**
 * The history value to store once $pattern has been used, as JSON. Keeps the
 * most recent patterns; the cap only bounds the stored value, as each
 * remembered pattern costs one regex per title parsed. Returns null when there
 * is nothing to record (invalid pattern, or already the most recent one).
 */
function buildDiaryDateFormatHistory(string $pattern): ?string {
    $pattern = trim($pattern);
    if ($pattern === '' || compileDiaryDateCustomFormat($pattern) === null) return null;

    $history = getDiaryDateFormatHistory();
    if (isset($history[0]) && $history[0] === $pattern) return null;

    // Re-saving a known pattern just moves it back to the front.
    $history = array_values(array_filter($history, function ($known) use ($pattern) {
        return $known !== $pattern;
    }));
    array_unshift($history, $pattern);

    return json_encode(array_slice($history, 0, 10));
}

/**
 * The 'YYYY-MM-DD' day a diary title designates, or null when the title is not
 * a date in any supported format. Ambiguous d/m vs m/d titles resolve to the
 * configured format first, so 03/04/2026 keeps the meaning the user picked.
 *
 * Every built-in format is always tried, plus the configured custom one and
 * every custom pattern used before it: changing the preference must not orphan
 * entries titled with the previous one.
 */
function parseDiaryEntryTitle(string $heading): ?string {
    $heading = trim($heading);
    if ($heading === '') return null;

    // The configured format wins ties, then the built-ins in declaration order,
    // then the custom patterns previously used.
    $ordered = [getDiaryDateFormatSpec()];
    foreach (getDiaryDateFormats() as $format) {
        $ordered[] = $format;
    }
    foreach (getDiaryDateFormatHistory() as $pattern) {
        $compiled = compileDiaryDateCustomFormat($pattern);
        if ($compiled !== null) $ordered[] = $compiled;
    }

    foreach ($ordered as $format) {
        if (!preg_match($format['regex'], $heading, $m)) continue;

        // Two-digit years follow date()'s 'y' round-trip: 70-99 => 1970-1999.
        if (isset($m['y']) && $m['y'] !== '') {
            $year = (int)$m['y'];
        } elseif (isset($m['y2']) && $m['y2'] !== '') {
            $year = (int)$m['y2'];
            $year += $year >= 70 ? 1900 : 2000;
        } else {
            continue;
        }

        if (isset($m['m']) && $m['m'] !== '') {
            $month = (int)$m['m'];
        } elseif (isset($m['mn']) && $m['mn'] !== '') {
            $month = diaryMonthNameToNumber($m['mn']);
        } elseif (isset($m['ms']) && $m['ms'] !== '') {
            $month = diaryMonthNameToNumber($m['ms']);
        } else {
            continue;
        }

        $day = isset($m['d']) ? (int)$m['d'] : 0;

        if ($month > 0 && checkdate($month, $day, $year)) {
            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }
    }
    return null;
}

/**
 * Name of the root diary folder. The diary_folder setting wins; otherwise the
 * localized default for the user's language. If a root folder created under
 * another language's default (or the historical "Diary") already exists in
 * the workspace, it keeps being used so the journal is not split in two.
 */
function getDiaryRootFolderName(?PDO $con = null, ?string $workspace = null) {
    $name = trim((string)getSetting('diary_folder', ''));
    if ($name !== '') return $name;

    $localized = trim((string)t('diary.folder_name', [], 'Diary'));
    if ($localized === '') $localized = 'Diary';

    if ($con !== null && $workspace !== null) {
        // All localized defaults (must match diary.folder_name in src/i18n/)
        $candidates = array_values(array_unique(array_merge(
            [$localized],
            ['Diary', 'Journal', 'Tagebuch', 'Diario', 'Diário', 'Дневник', '日记']
        )));
        $placeholders = implode(',', array_fill(0, count($candidates), '?'));
        $stmt = $con->prepare("SELECT name FROM folders WHERE name IN ($placeholders) AND workspace = ? AND parent_id IS NULL");
        $stmt->execute(array_merge($candidates, [$workspace]));
        $existing = $stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($candidates as $candidate) {
            if (in_array($candidate, $existing, true)) return $candidate;
        }
    }
    return $localized;
}

/**
 * All diaries of a workspace: the root folders flagged is_diary, ordered like
 * the sidebar (explicit display_order first, then alphabetically).
 * Lazy migration: when no folder is flagged yet, the historical name-matched
 * diary root (see getDiaryRootFolderName) is flagged once and returned, so
 * pre-existing journals keep working without a manual step.
 * @return array<int, array{id: int, name: string}>
 */
function getDiaryRoots(PDO $con, string $workspace): array {
    $sql = "SELECT id, name FROM folders WHERE is_diary = 1 AND workspace = ? AND parent_id IS NULL" .
        " ORDER BY (CASE WHEN display_order > 0 THEN display_order ELSE 999999 END), name COLLATE NOCASE";
    $stmt = $con->prepare($sql);
    $stmt->execute([$workspace]);
    $roots = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $roots[] = ['id' => (int)$row['id'], 'name' => (string)$row['name']];
    }
    if (!empty($roots)) {
        return $roots;
    }

    $legacyName = getDiaryRootFolderName($con, $workspace);
    $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL");
    $stmt->execute([$legacyName, $workspace]);
    $legacyId = $stmt->fetchColumn();
    if ($legacyId === false) {
        return [];
    }
    $con->prepare("UPDATE folders SET is_diary = 1 WHERE id = ?")->execute([(int)$legacyId]);
    return [['id' => (int)$legacyId, 'name' => $legacyName]];
}

/**
 * The diary a folder belongs to: the flagged root reached by walking up the
 * parent chain, or null when the folder is outside every diary subtree.
 * @return array{id: int, name: string}|null
 */
function findDiaryRootForFolder(PDO $con, string $workspace, int $folderId): ?array {
    $roots = getDiaryRoots($con, $workspace);
    if (empty($roots)) {
        return null;
    }
    $rootsById = array_column($roots, null, 'id');
    $current = $folderId;
    $guard = 0;
    while ($guard++ < 100) {
        if (isset($rootsById[$current])) {
            return $rootsById[$current];
        }
        $stmt = $con->prepare("SELECT parent_id FROM folders WHERE id = ? AND workspace = ?");
        $stmt->execute([$current, $workspace]);
        $parent = $stmt->fetchColumn();
        if ($parent === false || $parent === null) {
            return null;
        }
        $current = (int)$parent;
    }
    return null;
}

/**
 * Ids of every folder in the diary subtrees (Diary/YYYY/MM ...) of a
 * workspace: all diaries by default, one when $rootId is given. Returns an
 * empty array when no diary folder exists yet.
 * @return int[]
 */
function getDiaryFolderIds(PDO $con, string $workspace, ?int $rootId = null): array {
    $roots = getDiaryRoots($con, $workspace);
    if ($rootId !== null) {
        $roots = array_values(array_filter($roots, fn($r) => $r['id'] === $rootId));
    }
    if (empty($roots)) {
        return [];
    }

    $stmt = $con->prepare("SELECT id, parent_id FROM folders WHERE workspace = ?");
    $stmt->execute([$workspace]);
    $childrenByParent = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $parent = $row['parent_id'] !== null ? (int)$row['parent_id'] : 0;
        $childrenByParent[$parent][] = (int)$row['id'];
    }

    $diaryFolderIds = [];
    $queue = array_column($roots, 'id');
    $diaryFolderIds = $queue;
    while ($queue) {
        $current = array_shift($queue);
        foreach ($childrenByParent[$current] ?? [] as $childId) {
            $diaryFolderIds[] = $childId;
            $queue[] = $childId;
        }
    }
    return $diaryFolderIds;
}

/**
 * Id of the diary entry for the given YYYY-MM-DD date, or null. The title is
 * matched through parseDiaryEntryTitle, so an entry written under a previously
 * configured title format is still found after the format changed.
 * Searches the whole diary subtree so entries keep working after being
 * re-dated (renamed) or left in an older month folder. Scoped to a single
 * diary when $rootId is given, otherwise the first match across all diaries.
 */
function findDiaryEntryIdForDate(PDO $con, string $workspace, string $date, ?int $rootId = null): ?int {
    $folderIds = getDiaryFolderIds($con, $workspace, $rootId);
    if (empty($folderIds)) {
        return null;
    }
    $placeholders = implode(',', array_fill(0, count($folderIds), '?'));
    $stmt = $con->prepare(
        "SELECT id, heading FROM entries WHERE trash = 0 AND folder_id IN ($placeholders) AND workspace = ?" .
        " ORDER BY id ASC"
    );
    $stmt->execute(array_merge($folderIds, [$workspace]));
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (parseDiaryEntryTitle((string)$row['heading']) === $date) {
            return (int)$row['id'];
        }
    }
    return null;
}
