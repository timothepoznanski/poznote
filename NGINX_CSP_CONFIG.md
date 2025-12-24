# NGINX Configuration Example for CSP

## Basic Configuration (Permissive - Compatible Mode)

```nginx
server {
    listen 80;
    server_name poznote.example.com;
    
    root /var/www/poznote/src;
    index index.php;

    # Standard PHP handling
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # CSP Header - Permissive mode (allows inline for compatibility)
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';" always;

    # Other security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

## Strict Configuration (Recommended for Production)

```nginx
server {
    listen 443 ssl http2;
    server_name poznote.example.com;
    
    root /var/www/poznote/src;
    index index.php;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/poznote.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/poznote.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Standard PHP handling
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        
        # Disable PHP CSP when using NGINX CSP
        fastcgi_param POZNOTE_STRICT_CSP "false";
    }

    # CSP Header - STRICT mode (blocks inline scripts without nonces)
    # Note: This requires the application's nonce system to work properly
    # WARNING: Some third-party libraries (mermaid, excalidraw) may need 'unsafe-eval'
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests;" always;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # Disable server tokens
    server_tokens off;

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ /(config|db_connect|auth)\.php$ {
        deny all;
    }
}
```

## Ultra-Strict Configuration (Maximum Security)

**Note:** This may break some third-party libraries. Test thoroughly!

```nginx
server {
    listen 443 ssl http2;
    server_name poznote.example.com;
    
    root /var/www/poznote/src;
    index index.php;

    # ... SSL config (same as above) ...

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # CSP Header - ULTRA STRICT (no unsafe-eval, no unsafe-inline)
    # This WILL break Mermaid diagrams, Excalidraw, and Swagger UI
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;" always;

    # All other security headers...
}
```

## Testing Your Configuration

### 1. Check CSP Header

```bash
curl -I https://poznote.example.com | grep -i content-security
```

### 2. Validate CSP

Visit: https://csp-evaluator.withgoogle.com/

### 3. Monitor Console

Open browser DevTools (F12) → Console tab
Look for CSP violation errors

### 4. Report-Only Mode (Testing)

For testing without breaking functionality:

```nginx
# Use Content-Security-Policy-Report-Only instead
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; ..." always;
```

This will report violations without blocking them.

## Troubleshooting

### Issue: Inline scripts blocked

**Solution**: Poznote's nonce system should handle this. If not:
1. Check that `csp_helper.php` is included
2. Verify `nonceAttr()` is used in script tags
3. Make sure you're not using BOTH NGINX and PHP CSP headers (choose one)

### Issue: Third-party libraries broken

**Solution**: Add `'unsafe-eval'` to script-src:
```nginx
script-src 'self' 'unsafe-eval';
```

### Issue: Styles not loading

**Solution**: Keep `'unsafe-inline'` for style-src (safer than for scripts):
```nginx
style-src 'self' 'unsafe-inline';
```

## Recommendations

1. **Start with Permissive Mode** - Test everything works
2. **Move to Strict with unsafe-eval** - Best security/compatibility balance
3. **Consider Report-Only first** - See what would break
4. **Monitor logs** - Check for violations
5. **Update gradually** - Don't break user experience

## Additional Resources

- [NGINX CSP Module Docs](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [CSP Best Practices](https://web.dev/csp/)
- [Report URI Service](https://report-uri.com/) - Monitor CSP violations
