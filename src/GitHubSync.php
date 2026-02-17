<?php
/**
 * Backward compatibility shim for GitHubSync class
 */
require_once __DIR__ . '/GitSync.php';

class GitHubSync extends GitSync {
    /**
     * Helper to keep isEnabled working for old code
     */
    public static function isEnabled() {
        return GitSync::isEnabled();
    }
}
