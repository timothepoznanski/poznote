<?php
/**
 * PHPStan bootstrap.
 *
 * config.php defines these at runtime through _env()/helper calls, so static
 * analysis cannot resolve them and reports "Constant X not found" on every use.
 * Declaring them here (values are irrelevant, only the types matter) removes
 * that noise without weakening the checks on real code.
 *
 * Only add a constant here if it is genuinely defined by config.php.
 */

define('SQLITE_DATABASE', '');
define('TENANT_ISOLATION_FEATURES', []);
define('TENANT_ISOLATION', false);
define('OIDC_CLIENT_ID', '');
define('OIDC_DISCOVERY_URL', '');
define('OIDC_ISSUER', '');
