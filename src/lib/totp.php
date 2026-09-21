<?php
/**
 * Two-factor authentication: the pure part.
 *
 * The second factor is a TOTP code (RFC 6238, the scheme every authenticator
 * app speaks: Aegis, Google Authenticator, 1Password, Bitwarden...), asked for
 * after the password on the login form. It only concerns password sign-in: an
 * SSO login is left to the identity provider, which owns its own factors.
 *
 * The parameters are the ones authenticator apps assume when an otpauth://
 * URI does not say otherwise, and several apps ignore the URI's overrides, so
 * they are not configurable: HMAC-SHA1, 6 digits, 30 second steps.
 *
 * Recovery codes cover a lost device: ten single-use codes handed over when
 * the feature is switched on. They are random and long enough to be stored
 * under a plain SHA-256 like app passwords are (src/lib/app-passwords.php):
 * there is no low-entropy input for a slow hash to protect.
 *
 * This file holds the parts that need no database, so tests/ can cover them
 * against the RFC test vectors. The storage side lives in src/users/totp.php.
 */

/** Digits in a code. */
const TOTP_DIGITS = 6;

/** Length of one time step, in seconds. */
const TOTP_PERIOD = 30;

/**
 * Steps accepted on each side of the current one. One step absorbs a phone
 * clock that is up to 30 seconds off and the time it takes to type the code.
 */
const TOTP_WINDOW = 1;

/** Secret size in bytes: 160 bits, the HMAC-SHA1 block RFC 4226 recommends. */
const TOTP_SECRET_BYTES = 20;

/** Recovery codes handed over at activation. */
const TOTP_RECOVERY_CODE_COUNT = 10;

/** Characters in one recovery code, without its separator. */
const TOTP_RECOVERY_CODE_LENGTH = 10;

/**
 * Alphabet of the recovery codes: base32 without the characters people misread
 * when copying from paper (0/O, 1/I/L). 31 symbols, 10 characters, about 49 bits.
 */
const TOTP_RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const TOTP_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * RFC 4648 base32, without padding: the form authenticator apps expect in an
 * otpauth:// URI and the one a user types when the QR code cannot be scanned.
 */
function totpBase32Encode(string $bytes): string
{
    $bits = '';
    $length = strlen($bytes);
    for ($i = 0; $i < $length; $i++) {
        $bits .= str_pad(decbin(ord($bytes[$i])), 8, '0', STR_PAD_LEFT);
    }

    $encoded = '';
    foreach (str_split($bits, 5) as $chunk) {
        $encoded .= TOTP_BASE32_ALPHABET[bindec(str_pad($chunk, 5, '0', STR_PAD_RIGHT))];
    }
    return $encoded;
}

/**
 * Decodes a base32 secret. Tolerates what a hand-typed secret looks like
 * (lower case, spaces, dashes, padding). Returns null on any other character
 * rather than skipping it: a silently shortened secret would produce codes
 * that never match, with nothing to explain why.
 */
function totpBase32Decode(string $encoded): ?string
{
    $encoded = strtoupper(str_replace([' ', '-', '='], '', $encoded));
    if ($encoded === '') {
        return null;
    }

    $bits = '';
    $length = strlen($encoded);
    for ($i = 0; $i < $length; $i++) {
        $value = strpos(TOTP_BASE32_ALPHABET, $encoded[$i]);
        if ($value === false) {
            return null;
        }
        $bits .= str_pad(decbin($value), 5, '0', STR_PAD_LEFT);
    }

    $bytes = '';
    foreach (str_split($bits, 8) as $chunk) {
        if (strlen($chunk) === 8) {
            $bytes .= chr(bindec($chunk));
        }
    }
    return $bytes === '' ? null : $bytes;
}

/**
 * A new shared secret, base32 encoded.
 */
function totpGenerateSecret(): string
{
    return totpBase32Encode(random_bytes(TOTP_SECRET_BYTES));
}

/**
 * The time step a Unix timestamp falls in.
 */
function totpStepAt(int $timestamp): int
{
    return intdiv($timestamp, TOTP_PERIOD);
}

/**
 * The code for one time step (RFC 4226 HOTP with the step as the counter).
 * Null when the secret is not valid base32.
 */
function totpCodeForStep(string $secret, int $step): ?string
{
    $key = totpBase32Decode($secret);
    if ($key === null || $step < 0) {
        return null;
    }

    // 8-byte big-endian counter. pack('J') needs a 64-bit PHP, which is the
    // only kind the Docker image ships.
    $hash = hash_hmac('sha1', pack('J', $step), $key, true);
    $offset = ord($hash[strlen($hash) - 1]) & 0x0F;
    $binary = ((ord($hash[$offset]) & 0x7F) << 24)
        | (ord($hash[$offset + 1]) << 16)
        | (ord($hash[$offset + 2]) << 8)
        | ord($hash[$offset + 3]);

    return str_pad((string)($binary % (10 ** TOTP_DIGITS)), TOTP_DIGITS, '0', STR_PAD_LEFT);
}

/**
 * What a user typed, reduced to the six digits of a code, or null when it is
 * not one. Authenticator apps display "123 456", so inner spaces are expected.
 */
function totpNormalizeCode(string $input): ?string
{
    $digits = str_replace([' ', '-', "\t"], '', trim($input));
    if (strlen($digits) !== TOTP_DIGITS || !ctype_digit($digits)) {
        return null;
    }
    return $digits;
}

/**
 * Checks a code and returns the time step it belongs to, or null.
 *
 * The step is returned rather than a boolean so the caller can remember it
 * and refuse the same code a second time ($afterStep): RFC 6238 section 5.2
 * asks for a code to be accepted once only, which is what stops someone who
 * watched it being typed from replaying it within the same 30 seconds.
 *
 * Every candidate step is compared, without an early exit, so the time taken
 * does not tell which one matched.
 *
 * @param int|null $afterStep Last step already used: only later ones match.
 */
function totpVerifyCode(string $secret, string $input, ?int $timestamp = null, ?int $afterStep = null): ?int
{
    $code = totpNormalizeCode($input);
    if ($code === null) {
        return null;
    }

    $currentStep = totpStepAt($timestamp ?? time());
    $matchedStep = null;
    for ($offset = -TOTP_WINDOW; $offset <= TOTP_WINDOW; $offset++) {
        $step = $currentStep + $offset;
        $expected = totpCodeForStep($secret, $step);
        if ($expected === null) {
            continue;
        }
        $matches = hash_equals($expected, $code);
        if ($matches && ($afterStep === null || $step > $afterStep) && $matchedStep === null) {
            $matchedStep = $step;
        }
    }
    return $matchedStep;
}

/**
 * The otpauth:// URI an authenticator app reads from the QR code.
 *
 * The issuer appears twice, as the label prefix and as a parameter: older
 * apps read the first, newer ones the second, and Google's Key URI format
 * asks for both to match. A colon cannot be part of either label half, since
 * it is the separator between them.
 */
function totpProvisioningUri(string $secret, string $accountName, string $issuer): string
{
    $issuer = trim(str_replace(':', ' ', $issuer));
    $accountName = trim(str_replace(':', ' ', $accountName));
    if ($issuer === '') {
        $issuer = 'Poznote';
    }

    return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($accountName)
        . '?secret=' . rawurlencode($secret)
        . '&issuer=' . rawurlencode($issuer)
        . '&algorithm=SHA1&digits=' . TOTP_DIGITS . '&period=' . TOTP_PERIOD;
}

/**
 * One recovery code, displayed as two groups: "K7QF2-9WMXA".
 */
function totpGenerateRecoveryCode(): string
{
    $alphabetSize = strlen(TOTP_RECOVERY_CODE_ALPHABET);
    $code = '';
    for ($i = 0; $i < TOTP_RECOVERY_CODE_LENGTH; $i++) {
        $code .= TOTP_RECOVERY_CODE_ALPHABET[random_int(0, $alphabetSize - 1)];
    }
    $half = intdiv(TOTP_RECOVERY_CODE_LENGTH, 2);
    return substr($code, 0, $half) . '-' . substr($code, $half);
}

/**
 * A full set of distinct recovery codes.
 *
 * @return list<string>
 */
function totpGenerateRecoveryCodes(): array
{
    $codes = [];
    while (count($codes) < TOTP_RECOVERY_CODE_COUNT) {
        $codes[totpGenerateRecoveryCode()] = true;
    }
    return array_keys($codes);
}

/**
 * What a user typed, reduced to the canonical form of a recovery code (upper
 * case, no separator), or null when it cannot be one. The hash is taken over
 * this form, so a code typed in lower case or without its dash still matches.
 */
function totpNormalizeRecoveryCode(string $input): ?string
{
    $code = strtoupper(str_replace([' ', '-', "\t"], '', trim($input)));
    if (strlen($code) !== TOTP_RECOVERY_CODE_LENGTH) {
        return null;
    }
    if (strspn($code, TOTP_RECOVERY_CODE_ALPHABET) !== TOTP_RECOVERY_CODE_LENGTH) {
        return null;
    }
    return $code;
}

/**
 * The value a recovery code is stored under, or null for a malformed code.
 */
function totpHashRecoveryCode(string $input): ?string
{
    $code = totpNormalizeRecoveryCode($input);
    return $code === null ? null : hash('sha256', 'poznote-totp-recovery:' . $code);
}
