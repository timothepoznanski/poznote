# Dockerfile for Poznote - Alpine Linux
# Use Alpine Linux for minimal, secure image
FROM php:8.3.27-fpm-alpine

# Build argument to decide whether to copy source files
ARG copy_src_files=true

# Install system dependencies and PHP extensions
RUN apk add --no-cache \
    nginx \
    sqlite \
    sqlite-dev \
    libzip-dev \
    libzip \
    supervisor \
    && docker-php-ext-configure zip \
    && docker-php-ext-install pdo pdo_sqlite zip \
    && apk del --no-cache sqlite-dev libzip-dev

# Create nginx configuration
RUN mkdir -p /etc/nginx/http.d && \
    cat > /etc/nginx/http.d/default.conf <<'EOF'
server {
    listen 80;
    server_name localhost;
    root /var/www/html;
    index index.php index.html;

    client_max_body_size 800M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # PHP handling
    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }
    
    # Poznote specific configurations
    location ~ ^/(data|config)/ {
        deny all;
    }
}
EOF

# Configure PHP-FPM
RUN mkdir -p /usr/local/etc/php-fpm.d && \
    cat > /usr/local/etc/php-fpm.d/www.conf <<'EOF'
[www]
user = www-data
group = www-data
listen = 127.0.0.1:9000
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
EOF

# Create PHP configuration
RUN cat > /usr/local/etc/php/php.ini <<'EOF'
error_reporting = E_ERROR | E_PARSE
display_errors = Off
log_errors = On
error_log = /var/log/php_errors.log

upload_max_filesize = 750M
post_max_size = 800M
max_file_uploads = 20
max_input_time = 600
max_execution_time = 600
memory_limit = 512M

; Temporary file settings
upload_tmp_dir = /tmp
file_uploads = On

; Security enhancements
expose_php = Off
EOF

# Create supervisor configuration for multi-process management
RUN mkdir -p /etc/supervisor/conf.d /var/log/supervisor && \
    cat > /etc/supervisor/conf.d/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:php-fpm]
command=php-fpm -F
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
autorestart=true
startretries=0

[program:nginx]
command=nginx -g 'daemon off;'
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
autorestart=true
startretries=0
EOF

# Create directory for data volume and logs
RUN mkdir -p /var/www/html/data \
    && chown -R www-data:www-data /var/www/html \
    && chmod 755 /var/www/html

# Add build arguments for cache busting and versioning
ARG BUILD_DATE
ARG VERSION
LABEL build_date="${BUILD_DATE}"
LABEL version="${VERSION}"

# Force cache invalidation by using BUILD_DATE in a RUN command
RUN echo "Build timestamp: ${BUILD_DATE:-$(date +%s)}" > /tmp/build_timestamp.txt

# Handle source files based on build argument
COPY ${copy_src_files:+./src} /var/www/html

# Copy migration script
COPY migration-script.sh /usr/local/bin/migration-script.sh
RUN chmod +x /usr/local/bin/migration-script.sh

# Copy initialization script
COPY init-permissions.sh /usr/local/bin/init-permissions.sh
RUN chmod +x /usr/local/bin/init-permissions.sh

# Set proper ownership
RUN chown -R www-data:www-data /var/www/html

# Add OCI standard labels
LABEL org.opencontainers.image.title="Poznote"
LABEL org.opencontainers.image.description="Self-hosted, open-source note-taking app with full control and privacy over your data"
LABEL org.opencontainers.image.authors="Timothé Poznanski"
LABEL org.opencontainers.image.url="https://github.com/timothepoznanski/poznote"
LABEL org.opencontainers.image.source="https://github.com/timothepoznanski/poznote"
LABEL org.opencontainers.image.licenses="Open Source"

# Expose port HTTP
EXPOSE 80

# Set working directory
WORKDIR /var/www/html

# Use supervisor to manage multiple processes (nginx + php-fpm)
CMD ["/bin/sh", "-c", "/usr/local/bin/init-permissions.sh && exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf"]
