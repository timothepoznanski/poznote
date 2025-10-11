# Dockerfile for Poznote
FROM php:8.3.23-apache-bullseye

# Build argument to decide whether to copy source files
ARG copy_src_files=true

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
    libzip-dev \
    sqlite3 \
    libsqlite3-dev \
    && docker-php-ext-install pdo pdo_sqlite zip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create Apache configuration
RUN cat > /etc/apache2/sites-available/000-default.conf <<'EOF'
<VirtualHost *:80>
    ServerName localhost
    DocumentRoot /var/www/html
</VirtualHost>
EOF

# Create PHP configuration
RUN cat > /usr/local/etc/php/php.ini <<'EOF'
error_reporting = E_ERROR | E_PARSE
display_errors = Off
log_errors = On
error_log = /var/log/php_errors.log

; File upload settings for Poznote
upload_max_filesize = 200M
post_max_size = 250M
max_file_uploads = 20
max_input_time = 300
max_execution_time = 300
memory_limit = 256M

; Temporary file settings
upload_tmp_dir = /tmp
file_uploads = On
EOF

# Create directory for data volume (entries and attachments are inside data/)
RUN mkdir -p /var/www/html/data

# Enable Apache mod_rewrite if needed
RUN a2enmod rewrite

# Add build arguments for cache busting and versioning
# CACHE BUSTING: Use BUILD_DATE to force rebuild of source files layer
ARG BUILD_DATE
ARG VERSION
LABEL build_date="${BUILD_DATE}"
LABEL version="${VERSION}"

# Force cache invalidation by using BUILD_DATE in a RUN command
# This ensures the source files are ALWAYS copied fresh, never from cache
RUN echo "Build timestamp: ${BUILD_DATE:-$(date +%s)}" > /tmp/build_timestamp.txt

# Handle source files based on build argument
# This layer will ALWAYS be rebuilt because the previous RUN command changes each time
COPY ${copy_src_files:+./src} /var/www/html

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

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use custom entrypoint
ENTRYPOINT ["/entrypoint.sh"]
