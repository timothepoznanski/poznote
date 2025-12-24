<?php
/**
 * Content Security Policy Helper
 * Provides CSP nonce generation and header management for improved security
 */

/**
 * Generate a cryptographically secure nonce for CSP
 * 
 * @return string Base64 encoded nonce
 */
function generateCSPNonce() {
    // Generate 16 bytes (128 bits) of random data
    $nonce = random_bytes(16);
    // Base64 encode for use in CSP header and script tags
    return base64_encode($nonce);
}

/**
 * Get or create CSP nonce for the current request
 * 
 * @return string The nonce value
 */
function getCSPNonce() {
    static $nonce = null;
    
    if ($nonce === null) {
        $nonce = generateCSPNonce();
    }
    
    return $nonce;
}

/**
 * Output nonce attribute for inline scripts
 * 
 * @return string nonce="..." attribute
 */
function nonceAttr() {
    return 'nonce="' . htmlspecialchars(getCSPNonce(), ENT_QUOTES) . '"';
}

/**
 * Set CSP header with nonce support
 * 
 * @param bool $strict Use strict CSP (no unsafe-inline/unsafe-eval)
 */
function setCSPHeader($strict = true) {
    $nonce = getCSPNonce();
    
    if ($strict) {
        // Strict CSP - uses nonce for inline scripts, no unsafe-inline or unsafe-eval
        $csp = "default-src 'self'; " .
               "script-src 'self' 'nonce-" . $nonce . "'; " .
               "style-src 'self' 'unsafe-inline'; " . // Style inline is generally safer
               "img-src 'self' data: blob:; " .
               "font-src 'self' data:; " .
               "connect-src 'self'; " .
               "frame-src 'self'; " .
               "object-src 'none'; " .
               "base-uri 'self'; " .
               "form-action 'self'; " .
               "frame-ancestors 'self'";
    } else {
        // Permissive CSP - allows unsafe-inline and unsafe-eval for compatibility
        $csp = "default-src 'self'; " .
               "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-" . $nonce . "'; " .
               "style-src 'self' 'unsafe-inline'; " .
               "img-src 'self' data: blob:; " .
               "font-src 'self' data:; " .
               "connect-src 'self'; " .
               "frame-src 'self'; " .
               "object-src 'none'; " .
               "base-uri 'self'; " .
               "form-action 'self'; " .
               "frame-ancestors 'self'";
    }
    
    // Only set header if not already sent
    if (!headers_sent()) {
        header("Content-Security-Policy: " . $csp);
    }
}

/**
 * Get CSP meta tag with nonce support
 * 
 * @param bool $strict Use strict CSP (no unsafe-inline/unsafe-eval)
 * @return string HTML meta tag
 */
function getCSPMetaTag($strict = true) {
    $nonce = getCSPNonce();
    
    if ($strict) {
        $csp = "default-src 'self'; " .
               "script-src 'self' 'nonce-" . $nonce . "'; " .
               "style-src 'self' 'unsafe-inline'; " .
               "img-src 'self' data: blob:; " .
               "font-src 'self' data:; " .
               "connect-src 'self'; " .
               "frame-src 'self'; " .
               "object-src 'none'; " .
               "base-uri 'self'; " .
               "form-action 'self'; " .
               "frame-ancestors 'self'";
    } else {
        $csp = "default-src 'self'; " .
               "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-" . $nonce . "'; " .
               "style-src 'self' 'unsafe-inline'; " .
               "img-src 'self' data: blob:; " .
               "font-src 'self' data:; " .
               "connect-src 'self'; " .
               "frame-src 'self'; " .
               "object-src 'none'; " .
               "base-uri 'self'; " .
               "form-action 'self'; " .
               "frame-ancestors 'self'";
    }
    
    return '<meta http-equiv="Content-Security-Policy" content="' . htmlspecialchars($csp, ENT_QUOTES) . '">';
}

/**
 * Check if strict CSP mode is enabled via environment or settings
 * 
 * @return bool
 */
function isStrictCSPEnabled() {
    // Check environment variable
    if (getenv('POZNOTE_STRICT_CSP') !== false) {
        return filter_var(getenv('POZNOTE_STRICT_CSP'), FILTER_VALIDATE_BOOLEAN);
    }
    
    // Check if setting exists in database
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['strict_csp_mode']);
            $value = $stmt->fetchColumn();
            if ($value !== false) {
                return filter_var($value, FILTER_VALIDATE_BOOLEAN);
            }
        } catch (Exception $e) {
            // If query fails, default to false
        }
    }
    
    // Default to permissive mode for backward compatibility
    return false;
}
