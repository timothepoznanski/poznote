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

# Copy apache config
COPY ./000-default.conf /etc/apache2/sites-available/000-default.conf

# Copy php.ini
COPY php.ini /usr/local/etc/php/

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

# Start Apache in foreground
# Note: This CMD is overridden by docker-compose.yml's command directive when using docker-compose.
# It starts Apache in foreground mode to keep the container running, as Docker requires a foreground process.
# In case someone wants to run this Dockerfile directly without docker-compose, this CMD ensures Apache starts correctly.
CMD ["apache2-foreground"]
