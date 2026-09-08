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
 * Date/time display formats supported by the user preference.
 */
function getDateTimeFormatPatterns() {
    return [
        'default' => 'Y-m-d H:i',
        'ymd_hi' => 'Y-m-d H:i',
        'ymd_his' => 'Y-m-d H:i:s',
        'dmy_hi' => 'd/m/Y H:i',
        'mdy_hia' => 'm/d/Y h:i A',
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
        'MM' => 'm',
        'DD' => 'd',
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
        return $date->format($format);
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
        return $date->format($pattern ?: $defaultFormat);
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
            return $date->format($pattern);
        }
        return $date->format('j M Y') . ' ' . t('common.at', [], 'at') . ' ' . $date->format('H:i');
    } catch (Exception $e) {
        $pattern = getUserDateTimeFormatPattern();
        return date($pattern ?: 'j M Y H:i', $timestamp);
    }
}
