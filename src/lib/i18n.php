<?php
/**
 * Language detection, the translation dictionary and the t() helpers.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Interface languages this instance ships a dictionary for (src/i18n/*.json).
 *
 * Single source of truth: the login page, the settings API validation and the
 * login-time language sync must agree, otherwise a code accepted in one place
 * renders as raw translation keys in another.
 */
function poznoteSupportedLanguages(): array {
    return ['en', 'fr', 'es', 'de', 'pt', 'ru', 'zh-cn'];
}

/**
 * Normalize a language code to one this instance actually supports.
 *
 * Returns null when the value matches nothing, so callers can decide between
 * keeping their current value and falling back to English.
 */
function poznoteNormalizeLanguageCode($lang): ?string {
    $lang = strtolower(trim((string)$lang));
    if ($lang === '') {
        return null;
    }
    return in_array($lang, poznoteSupportedLanguages(), true) ? $lang : null;
}

/**
 * Pick the best supported language from an Accept-Language header.
 *
 * Used on pre-auth pages (the login page), where no user preference exists yet.
 * Entries are ranked by their q-value, highest first; for each one an exact
 * match wins, otherwise the primary subtag is tried so "fr-CA" still selects
 * "fr". Returns null when nothing matches, leaving the caller's default in place.
 *
 * @param string $header        Raw Accept-Language header value.
 * @param array  $allowedLangs  Supported language codes, lowercase.
 */
function poznoteDetectBrowserLanguage(string $header, array $allowedLangs): ?string {
    $header = trim($header);
    if ($header === '' || empty($allowedLangs)) {
        return null;
    }

    $candidates = [];
    foreach (explode(',', $header) as $index => $part) {
        $bits = explode(';', $part);
        $tag = strtolower(trim($bits[0]));
        if ($tag === '' || $tag === '*') {
            continue;
        }

        // Quality defaults to 1 when the q= parameter is absent or malformed.
        $quality = 1.0;
        for ($i = 1; $i < count($bits); $i++) {
            $param = trim($bits[$i]);
            if (stripos($param, 'q=') === 0) {
                $value = substr($param, 2);
                if (is_numeric($value)) {
                    $quality = (float)$value;
                }
                break;
            }
        }
        if ($quality <= 0) {
            continue; // q=0 explicitly rejects that language.
        }

        // Keep the header order as tie-breaker between equal q-values.
        $candidates[] = ['tag' => $tag, 'q' => $quality, 'order' => $index];
    }

    usort($candidates, function ($a, $b) {
        return $a['q'] === $b['q'] ? ($a['order'] <=> $b['order']) : ($b['q'] <=> $a['q']);
    });

    foreach ($candidates as $candidate) {
        $tag = $candidate['tag'];
        if (in_array($tag, $allowedLangs, true)) {
            return $tag;
        }

        // "fr-CA" -> "fr". Also lets "zh" reach a "zh-cn" style code when that
        // is the only variant this instance ships.
        $primary = explode('-', $tag)[0];
        if ($primary !== $tag && in_array($primary, $allowedLangs, true)) {
            return $primary;
        }
        foreach ($allowedLangs as $allowed) {
            if (explode('-', $allowed)[0] === $primary) {
                return $allowed;
            }
        }
    }

    return null;
}

/**
 * Reconcile the active user's interface language at the start of a session.
 *
 * Two things happen here:
 *  - As long as the user has never picked a language in the settings
 *    (settings.language_source is not 'user'), the browser's Accept-Language
 *    header drives the interface, so a brand new account opens in the visitor's
 *    own language instead of English. The moment the language is changed in the
 *    settings the source flips to 'user' and the browser stops overriding it.
 *  - The resulting language is mirrored into master.users.language, so
 *    consumers that never open the per-user database (mailing tools, admin
 *    exports) can read it from the profile.
 *
 * Called from db_connect.php before anything reads getSetting(), so the value
 * written here is the one the request's static settings cache picks up.
 */
function poznoteSyncUserLanguage(PDO $con, int $userId): void {
    if ($userId <= 0) {
        return;
    }

    try {
        $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('language', 'language_source')");
        $rows = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $rows[$row['key']] = $row['value'];
        }

        $language = poznoteNormalizeLanguageCode($rows['language'] ?? '');
        $source = (string)($rows['language_source'] ?? '');

        if ($source !== 'user') {
            $detected = poznoteDetectBrowserLanguage(
                $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '',
                poznoteSupportedLanguages()
            );
            if ($detected !== null && $detected !== $language) {
                $update = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                $update->execute(['language', $detected]);
                // The generated welcome note follows the browser-driven
                // language too (no-op once the user edited the note, and on
                // the very first bootstrap where no note exists yet).
                poznoteRelocalizeWelcomeNote($con, $detected);
                $language = $detected;
            }
        }

        if ($language === null) {
            $language = 'en';
        }

        require_once __DIR__ . '/../users/db_master.php';
        setUserProfileLanguage($userId, $language);
    } catch (Exception $e) {
        // Never let a language sync failure break page rendering.
        error_log('Poznote: user language sync failed: ' . $e->getMessage());
    }
}

function getUserLanguage() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $lang = getSetting('language', 'en');
    if ($lang && is_string($lang)) {
        $lang = strtolower(trim($lang));
        // Basic allowlist: keep it simple and safe
        if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang)) {
            $cached = $lang;
            return $cached;
        }
    }
    
    $cached = 'en';
    return $cached;
}

function loadI18nDictionary($lang) {
    static $cache = [];

    $lang = strtolower(trim((string)$lang));
    if ($lang === '') $lang = 'en';
    if (isset($cache[$lang])) return $cache[$lang];

    $file = __DIR__ . '/../i18n/' . $lang . '.json';
    $json = @file_get_contents($file);
    if ($json === false) {
        $cache[$lang] = [];
        return $cache[$lang];
    }

    $data = json_decode($json, true);
    if (!is_array($data)) $data = [];
    $cache[$lang] = $data;
    return $data;
}

function i18nGet($dict, $key) {
    if (!is_array($dict)) return null;
    $parts = explode('.', $key);
    $cur = $dict;
    foreach ($parts as $p) {
        if (!is_array($cur) || !array_key_exists($p, $cur)) return null;
        $cur = $cur[$p];
    }
    return is_string($cur) ? $cur : null;
}

function t($key, $vars = [], $default = null, $lang = null) {
    if ($lang === null) {
        $lang = getUserLanguage();
    }

    $dict = loadI18nDictionary($lang);
    $en = ($lang === 'en') ? $dict : loadI18nDictionary('en');

    $text = i18nGet($dict, $key);
    if ($text === null) $text = i18nGet($en, $key);
    if ($text === null) $text = ($default !== null ? (string)$default : (string)$key);

    if (is_array($vars) && !empty($vars)) {
        foreach ($vars as $k => $v) {
            $text = str_replace('{{' . $k . '}}', (string)$v, $text);
        }
    }
    return $text;
}

function t_h($key, $vars = [], $default = null, $lang = null) {
    return htmlspecialchars(t($key, $vars, $default, $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Localized content of the generated welcome note, with the same fallback
 * chain as the first-run creation in db_connect.php: dictionary entry first,
 * then the static welcome_note.html template (incomplete/custom dictionary),
 * then a minimal hardcoded paragraph (template missing too).
 */
function poznoteWelcomeNoteContent(string $lang): string {
    $content = t('welcome_note.content', [], '', $lang);
    if (trim($content) === '') {
        $content = (string)@file_get_contents(__DIR__ . '/../welcome_note.html');
    }
    if (trim($content) === '') {
        $content = '<p>Welcome to Poznote.</p>';
    }
    return $content;
}

/**
 * Rewrite the generated welcome note in $newLang when the user has not
 * touched it, so the note follows the interface language instead of staying
 * frozen in whatever language was active when the account was bootstrapped
 * (the first-run wizard lets the user pick a different language seconds
 * after the note is created).
 *
 * The note carries no marker of its own, so it is recognized by fingerprint:
 * heading and file content must both still match what the bootstrap would
 * generate for one of the supported languages. An edited, renamed or deleted
 * welcome note never matches and is left alone.
 */
function poznoteRelocalizeWelcomeNote(PDO $con, string $newLang): void {
    $newLang = strtolower(trim($newLang));
    if (!in_array($newLang, poznoteSupportedLanguages(), true)) {
        return;
    }

    try {
        $titles = [];
        foreach (poznoteSupportedLanguages() as $lang) {
            $titles[$lang] = t('welcome_note.title', [], 'Welcome to Poznote', $lang);
        }

        $placeholders = implode(',', array_fill(0, count($titles), '?'));
        $stmt = $con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND type = 'note' AND heading IN ($placeholders)");
        $stmt->execute(array_values($titles));
        $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$candidates) {
            return;
        }

        $template = trim((string)@file_get_contents(__DIR__ . '/../welcome_note.html'));

        foreach ($candidates as $row) {
            $file = getEntryFilename($row['id'], 'note');
            $current = @file_get_contents($file);
            if ($current === false) {
                continue;
            }
            $current = trim($current);

            foreach ($titles as $lang => $title) {
                if ($row['heading'] !== $title) {
                    continue;
                }

                // Everything the bootstrap could have written for $lang.
                $pristine = [trim(poznoteWelcomeNoteContent($lang)), '<p>Welcome to Poznote.</p>'];
                if ($template !== '') {
                    $pristine[] = $template;
                }
                if (!in_array($current, $pristine, true)) {
                    continue;
                }

                if ($lang === $newLang) {
                    return;
                }

                $content = poznoteWelcomeNoteContent($newLang);
                if (file_put_contents($file, $content) === false) {
                    return;
                }
                setFilePermissions($file, 0644);

                // Same search snippet shape as repairDatabaseEntries().
                $snippet = mb_substr(strip_tags(cleanContentForSearch($content)), 0, 500);
                $update = $con->prepare('UPDATE entries SET heading = ?, entry = ?, updated = ? WHERE id = ?');
                $update->execute([
                    t('welcome_note.title', [], 'Welcome to Poznote', $newLang),
                    $snippet,
                    gmdate('Y-m-d H:i:s'),
                    $row['id'],
                ]);
                return;
            }
        }
    } catch (Exception $e) {
        // Cosmetic best-effort operation: never let it break a language change.
        error_log('Poznote: welcome note relocalization failed: ' . $e->getMessage());
    }
}
