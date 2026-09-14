<?php
/**
 * User timezone, date/time format patterns and display formatting.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

function normalizeDateOnlyFilter($value) {
    $date = trim((string)$value);
    if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return '';
    }

    $dt = DateTime::createFromFormat('!Y-m-d', $date);
    $errors = DateTime::getLastErrors();
    if ($dt === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return '';
    }

    return $dt->format('Y-m-d') === $date ? $date : '';
}

function dateOnlyFilterToUtcBoundary($value, $endOfDay = false) {
    $date = normalizeDateOnlyFilter($value);
    if ($date === '') {
        return null;
    }

    try {
        $timezone = new DateTimeZone(getUserTimezone());
        $time = $endOfDay ? '23:59:59' : '00:00:00';
        $dt = DateTime::createFromFormat('!Y-m-d H:i:s', $date . ' ' . $time, $timezone);
        if ($dt === false) {
            return null;
        }
        $dt->setTimezone(new DateTimeZone('UTC'));
        return $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get the user's configured timezone from the database
 * Returns 'UTC' if no timezone is configured
 * @return string The timezone identifier (e.g., 'Europe/Paris')
 */
function getUserTimezone() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $timezone = trim((string) getSetting('timezone', ''));
    if ($timezone !== '') {
        try {
            new DateTimeZone($timezone);
            $cached = $timezone;
            return $cached;
        } catch (Exception $e) {
            // Fall back below if an old or manually edited setting is invalid.
            error_log('functions: getUserTimezone() failed: ' . $e->getMessage());
        }
    }
    
    $fallbackTimezone = defined('DEFAULT_TIMEZONE') ? DEFAULT_TIMEZONE : 'UTC';
    try {
        new DateTimeZone($fallbackTimezone);
        $cached = $fallbackTimezone;
    } catch (Exception $e) {
        $cached = 'UTC';
    }
    return $cached;
}

/**
 * Day and month names per app language, for the 'long' formats (with their
 * layout) and the dddd/MMMM/MMM custom tokens of the diary and date & time
 * formats. PHP has no locale-aware date() and the images ship without intl,
 * so the names live here, mirrored in js/date-time-format.js. Layout: {wd}
 * weekday, {month} month name, {m} month number, {d} day, {y} year. Names are
 * written as a title shows them; parsing ignores case.
 */
function getDateNameLocales(): array {
    return [
        'en' => [
            'layout' => '{wd}, {month} {d}, {y}',
            'days'   => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            'months' => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            'short'  => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        ],
        'fr' => [
            'layout' => '{wd} {d} {month} {y}',
            'days'   => ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
            'months' => ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
            'short'  => ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
        ],
        'de' => [
            'layout' => '{wd}, {d}. {month} {y}',
            'days'   => ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
            'months' => ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
            'short'  => ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
        ],
        'es' => [
            'layout' => '{wd}, {d} de {month} de {y}',
            'days'   => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
            'months' => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
            'short'  => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
        ],
        'pt' => [
            'layout' => '{wd}, {d} de {month} de {y}',
            'days'   => ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
            'months' => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
            'short'  => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
        ],
        'ru' => [
            // Month names in the genitive, as a date uses them
            'layout' => '{wd}, {d} {month} {y} г.',
            'days'   => ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
            'months' => ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
            'short'  => ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
        ],
        'zh-cn' => [
            'layout' => '{y}年{m}月{d}日{wd}',
            'days'   => ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
            'months' => ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
            'short'  => ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
        ],
    ];
}

/**
 * The names of $lang, English for a language the app does not ship.
 */
function getDateNameLocale(string $lang): array {
    $locales = getDateNameLocales();
    return $locales[$lang] ?? $locales[explode('-', $lang)[0]] ?? $locales['en'];
}

/**
 * Names of every app language in one regex alternation, case-insensitive:
 * a title keeps being recognized after the user switches language.
 * $kind is 'days', 'months' or 'short'.
 */
function dateNamesAlternation(string $kind): string {
    static $cache = [];
    if (isset($cache[$kind])) return $cache[$kind];
    $names = [];
    foreach (getDateNameLocales() as $locale) {
        foreach ($locale[$kind] as $name) $names[$name] = true;
    }
    $names = array_keys($names);
    // Longest first, so "sept." is not cut short by "sept"
    usort($names, function ($a, $b) { return mb_strlen($b) - mb_strlen($a); });
    return $cache[$kind] = '(?i:' . implode('|', array_map(function ($name) { return preg_quote($name, '/'); }, $names)) . ')';
}

/**
 * A day spelled out in the 'long' layout of $lang.
 */
function formatLongDate(DateTimeInterface $date, string $lang): string {
    $locale = getDateNameLocale($lang);
    return strtr($locale['layout'], [
        '{wd}'    => $locale['days'][(int)$date->format('w')],
        '{month}' => $locale['months'][(int)$date->format('n') - 1],
        '{m}'     => $date->format('n'),
        '{d}'     => $date->format('j'),
        '{y}'     => $date->format('Y'),
    ]);
}

/**
 * Control characters a PHP date() pattern carries for the parts date() cannot
 * write in the user's language; date() copies them as is and
 * applyDateNameTokens() swaps them afterwards.
 */
const DATE_NAME_MONTH = "\x01";
const DATE_NAME_MONTH_SHORT = "\x02";
const DATE_NAME_WEEKDAY = "\x03";
const DATE_NAME_LONG_DATE = "\x04";

/**
 * Replace the name placeholders of a formatted date with the names of $lang
 * (the user's language by default).
 */
function applyDateNameTokens(string $formatted, DateTimeInterface $date, ?string $lang = null): string {
    if (strpbrk($formatted, DATE_NAME_MONTH . DATE_NAME_MONTH_SHORT . DATE_NAME_WEEKDAY . DATE_NAME_LONG_DATE) === false) {
        return $formatted;
    }
    $lang = $lang ?? (function_exists('getUserLanguage') ? (string)getUserLanguage() : 'en');
    $locale = getDateNameLocale($lang);
    return strtr($formatted, [
        DATE_NAME_MONTH       => $locale['months'][(int)$date->format('n') - 1],
        DATE_NAME_MONTH_SHORT => $locale['short'][(int)$date->format('n') - 1],
        DATE_NAME_WEEKDAY     => $locale['days'][(int)$date->format('w')],
        DATE_NAME_LONG_DATE   => formatLongDate($date, $lang),
    ]);
}

/**
 * Date/time display formats supported by the user preference.
 */
function getDateTimeFormatPatterns() {
    return [
        'default' => 'Y-m-d H:i',
        'ymd_hi' => 'Y-m-d H:i',
        'ymd_his' => 'Y-m-d H:i:s',
        'dmy_hi' => 'd/m/Y H:i',
        'mdy_hia' => 'm/d/Y h:i A',
        // "Saturday, September 12, 2026 14:05", day spelled out in the user's language
        'long' => DATE_NAME_LONG_DATE . ' H:i',
    ];
}

function isCustomDateTimeFormat($format) {
    return is_string($format) && strpos($format, 'custom:') === 0;
}

function getCustomDateTimeFormatPattern($format) {
    return trim(substr((string) $format, 7));
}

function normalizeCustomDateTimePattern($pattern) {
    $pattern = trim((string) $pattern);
    $pattern = preg_replace('/\\b(HH|hh|h):MM:SS\\b/', '$1:mm:ss', $pattern);
    $pattern = preg_replace('/\\b(HH|hh|h):MM\\b/', '$1:mm', $pattern);
    return $pattern;
}

function customDateTimePatternToPhpFormat($pattern) {
    $pattern = normalizeCustomDateTimePattern($pattern);
    $tokens = [
        'YYYY' => 'Y',
        'YY' => 'y',
        // Names in the user's language, see applyDateNameTokens()
        'MMMM' => DATE_NAME_MONTH,
        'MMM' => DATE_NAME_MONTH_SHORT,
        'MM' => 'm',
        'dddd' => DATE_NAME_WEEKDAY,
        'DD' => 'd',
        'D' => 'j',
        'HH' => 'H',
        'hh' => 'h',
        'h' => 'g',
        'mm' => 'i',
        'ss' => 's',
        'SS' => 's',
        'A' => 'A',
        'a' => 'a',
    ];

    $format = '';
    $length = strlen($pattern);
    for ($i = 0; $i < $length; $i++) {
        $matched = false;
        foreach ($tokens as $token => $phpToken) {
            $tokenLength = strlen($token);
            if (substr($pattern, $i, $tokenLength) === $token) {
                $format .= $phpToken;
                $i += $tokenLength - 1;
                $matched = true;
                break;
            }
        }
        if ($matched) {
            continue;
        }

        $char = $pattern[$i];
        $format .= ctype_alpha($char) ? '\\' . $char : $char;
    }

    return $format;
}

function getUserDateTimeFormat() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $format = getSetting('date_time_format', 'default');
    $patterns = getDateTimeFormatPatterns();
    if (isCustomDateTimeFormat($format) && getCustomDateTimeFormatPattern($format) !== '') {
        $cached = $format;
        return $cached;
    }

    $cached = array_key_exists($format, $patterns) ? $format : 'default';
    return $cached;
}

function getUserDateTimeFormatPattern() {
    $format = getUserDateTimeFormat();
    if (isCustomDateTimeFormat($format)) {
        return customDateTimePatternToPhpFormat(getCustomDateTimeFormatPattern($format));
    }

    $patterns = getDateTimeFormatPatterns();
    return $patterns[$format] ?? null;
}

/**
 * Convert a UTC datetime string to the user's configured timezone
 * @param string $utcDatetime The UTC datetime string (e.g., '2025-11-07 10:52:00')
 * @param string $format The output format (default: 'Y-m-d H:i:s')
 * @return string The datetime in the user's timezone
 */
function convertUtcToUserTimezone($utcDatetime, $format = 'Y-m-d H:i:s') {
    if (empty($utcDatetime)) return '';
    try {
        $userTz = getUserTimezone();
        $date = new DateTime($utcDatetime, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone($userTz));
        return applyDateNameTokens($date->format($format), $date);
    } catch (Exception $e) {
        return $utcDatetime; // Return original on error
    }
}

/**
 * Format a UTC datetime string for display using the user's timezone and format preference.
 */
function formatUtcDateTimeForDisplay($utcDatetime, $defaultFormat = 'Y-m-d H:i') {
    if (empty($utcDatetime)) return '';
    try {
        $userTz = getUserTimezone();
        $date = new DateTime($utcDatetime, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone($userTz));
        $pattern = getUserDateTimeFormatPattern();
        return applyDateNameTokens($date->format($pattern ?: $defaultFormat), $date);
    } catch (Exception $e) {
        return '';
    }
}

/**
 * Format a timestamp for display (with i18n support)
 * @param int $timestamp Unix timestamp
 * @param string $format Date format (default: 'j M Y H:i')
 * @return string Formatted date string
 */
function formatDateTime($timestamp) {
    $timezone = getUserTimezone();
    try {
        $date = new DateTime('@' . $timestamp);
        $date->setTimezone(new DateTimeZone($timezone));
        $pattern = getUserDateTimeFormatPattern();
        if ($pattern) {
            return applyDateNameTokens($date->format($pattern), $date);
        }
        return $date->format('j M Y') . ' ' . t('common.at', [], 'at') . ' ' . $date->format('H:i');
    } catch (Exception $e) {
        $pattern = getUserDateTimeFormatPattern();
        return applyDateNameTokens(date($pattern ?: 'j M Y H:i', $timestamp), new DateTime('@' . (int)$timestamp));
    }
}
