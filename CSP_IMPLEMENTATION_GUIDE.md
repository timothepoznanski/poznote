# Content Security Policy (CSP) Implementation Guide

## Overview

Poznote now supports strong Content Security Policy (CSP) to enhance security for external deployments. This implementation uses CSP nonces for inline scripts and moves most JavaScript to external files.

## Features

### 1. CSP Nonce System

The `src/csp_helper.php` file provides:
- **`generateCSPNonce()`**: Generates cryptographically secure nonces
- **`getCSPNonce()`**: Returns the current request's nonce
- **`nonceAttr()`**: Returns formatted nonce attribute for inline scripts
- **`setCSPHeader($strict)`**: Sets CSP header (strict or permissive mode)
- **`getCSPMetaTag($strict)`**: Returns CSP as a meta tag
- **`isStrictCSPEnabled()`**: Checks if strict mode is enabled

### 2. Strict vs Permissive Mode

**Strict Mode** (Recommended for production):
- Blocks all inline scripts without nonces
- Blocks `eval()` and `new Function()`
- Allows only nonce-tagged inline scripts
- Better security

**Permissive Mode** (Default for compatibility):
- Allows `unsafe-inline` and `unsafe-eval`
- Still includes nonces for future migration
- Maintains backward compatibility

## Configuration

### Method 1: Environment Variable

```bash
export POZNOTE_STRICT_CSP=true
```

### Method 2: Database Setting

```sql
INSERT INTO settings (key, value) VALUES ('strict_csp_mode', 'true')
ON CONFLICT(key) DO UPDATE SET value = 'true';
```

### Method 3: NGINX Reverse Proxy

Add to your NGINX configuration:

```nginx
location / {
    # ... existing config ...
    
    # CSP Header - Strict mode
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';" always;
    
    # Or for compatibility mode (allows inline)
    # add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';" always;
}
```

**Note**: When using NGINX CSP headers, you may want to disable PHP-level CSP by setting `POZNOTE_STRICT_CSP=false`.

## Implementation Details

### Inline Scripts with Nonces

Only essential inline scripts use nonces (those that must run before page load):

```php
<!-- Theme initialization (prevents flash of unstyled content) -->
<script <?php echo nonceAttr(); ?>>
(function(){
    var theme = localStorage.getItem('poznote-theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();
</script>
```

### External JavaScript Files

Most functionality has been moved to external files:

- **`js/index-page.js`**: Index page functionality
- **`js/page-config.js`**: Page configuration management
- **`js/workspace-navigation.js`**: Workspace and navigation utilities
- **`js/trash-page.js`**: Trash page functionality
- **`js/note-creation.js`**: Note creation functions

### Removed `new Function()` Usage

The `new Function()` eval-like pattern has been replaced with safer alternatives:

**Before** (in `js/events.js`):
```javascript
var func = new Function('event', dataOnclick);
func.call(link, evt);
```

**After**:
```javascript
// Parse simple function calls: functionName(arg1, arg2)
var match = dataOnclick.match(/^(\w+)\((.*)\)$/);
if (match && typeof window[match[1]] === 'function') {
    // Parse and call the function safely
    window[match[1]].apply(link, parsedArgs);
}
```

## Security Benefits

1. **Prevents XSS attacks**: Only whitelisted scripts can execute
2. **No eval()**: Eliminates string-to-code vulnerabilities
3. **Nonce rotation**: Each request gets a unique nonce
4. **Defense in depth**: Works alongside other security measures

## Testing

### Verify CSP is Active

1. Open browser developer tools (F12)
2. Go to the Network tab
3. Reload the page
4. Check response headers for `Content-Security-Policy`

### Check for Violations

1. Open Console tab in developer tools
2. Look for CSP violation messages
3. All violations should be resolved in strict mode

### Test Strict Mode

```bash
# Set environment variable
export POZNOTE_STRICT_CSP=true

# Restart your web server
sudo systemctl restart php-fpm
sudo systemctl restart nginx

# Access application and verify no console errors
```

## Migration Guide

If you have custom modifications with inline scripts:

### Step 1: Identify Inline Scripts

```bash
grep -r "<script>" src/*.php | grep -v "src=\""
```

### Step 2: Extract to External Files

Move inline JavaScript to appropriate external files in `src/js/`.

### Step 3: Add Nonces to Essential Inline Scripts

For scripts that MUST be inline (theme initialization, etc.):

```php
<script <?php echo nonceAttr(); ?>>
    // Your essential inline code
</script>
```

### Step 4: Use Configuration Pattern

For page-specific config:

```php
<script <?php echo nonceAttr(); ?>>
window.setPageConfig({
    someValue: <?php echo json_encode($value); ?>,
    anotherValue: <?php echo json_encode($another); ?>
});
</script>
```

## Troubleshooting

### Issue: "Refused to execute inline script"

**Cause**: Script doesn't have proper nonce in strict mode.

**Solution**: 
1. Add `<?php echo nonceAttr(); ?>` to the script tag, OR
2. Move the script to an external .js file

### Issue: "Refused to evaluate a string as JavaScript"

**Cause**: Code uses `eval()`, `new Function()`, or `setTimeout(string)`.

**Solution**: Refactor to use function references instead of strings.

### Issue: Third-party library doesn't work

**Cause**: Library uses eval or inline scripts.

**Solution**:
1. Check if library has a CSP-compatible version
2. Temporarily use permissive mode
3. Consider alternative library

## Best Practices

1. **Minimize inline scripts**: Extract to external files when possible
2. **Use nonces sparingly**: Only for truly essential inline code
3. **Test thoroughly**: Verify all features work in strict mode
4. **Monitor console**: Check for CSP violations regularly
5. **Keep updated**: Review security advisories for dependencies

## Compatibility Matrix

| Browser | CSP Level 2 | CSP Level 3 | Nonces |
|---------|-------------|-------------|--------|
| Chrome 90+ | ✅ | ✅ | ✅ |
| Firefox 85+ | ✅ | ✅ | ✅ |
| Safari 14+ | ✅ | ⚠️ | ✅ |
| Edge 90+ | ✅ | ✅ | ✅ |

✅ Fully supported | ⚠️ Partially supported

## Additional Resources

- [MDN CSP Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator Tool](https://csp-evaluator.withgoogle.com/)
- [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)

## Support

For issues related to CSP implementation:
1. Check browser console for specific CSP violations
2. Verify configuration is correct
3. Test in permissive mode first
4. Report bugs with console output and browser version
