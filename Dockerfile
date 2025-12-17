# Dockerfile for Poznote - Alpine Linux
# Use Alpine Linux for minimal, secure image
FROM php:8.3.27-fpm-alpine

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

# Copy configuration files
RUN mkdir -p /etc/nginx/http.d /usr/local/etc/php-fpm.d /usr/local/etc/php /etc/supervisor/conf.d
COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
COPY docker/php-fpm/www.conf /usr/local/etc/php-fpm.d/www.conf
COPY docker/php/php.ini /usr/local/etc/php/php.ini
COPY docker/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Add build arguments for cache busting and versioning
ARG BUILD_DATE
ARG VERSION
ARG APP_VERSION=unknown
LABEL build_date="${BUILD_DATE}"
LABEL version="${VERSION}"

# Force cache invalidation by using BUILD_DATE in a RUN command
RUN echo "Build timestamp: ${BUILD_DATE:-$(date +%s)}" > /tmp/build_timestamp.txt

# Copy application source
COPY ./src /var/www/html

# Copy initialization script
COPY init.sh /usr/local/bin/init.sh

# Finalize filesystem: init script, writable data dir, and build-time version marker
RUN chmod +x /usr/local/bin/init.sh \
    && mkdir -p /var/www/html/data \
    && printf '%s\n' "<?php" "define('APP_VERSION', '${APP_VERSION}');" > /var/www/html/version.php \
    && chown -R www-data:www-data /var/www/html \
    && chmod 755 /var/www/html

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
CMD ["/bin/sh", "-c", "/usr/local/bin/init.sh && exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf"]
