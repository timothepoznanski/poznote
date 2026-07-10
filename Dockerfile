# Dockerfile for Poznote - Alpine Linux
#
# Multi-stage build producing two final images from one shared `base` stage:
#   - `default` (last stage in this file - built by a plain `docker build .`
#     with no --target, which is what publish-docker.yml and docker-compose.yml
#     use): runs as root, nginx listens on port 80.
#   - `rootless` (built with `docker build --target rootless .`, used by
#     docker-compose.rootless.yml): the entire container - nginx, php-fpm,
#     supervisord, and the reminder-email worker - runs as the unprivileged
#     "poznote" user (uid/gid 1000) instead of root, for container
#     runtimes/policies that forbid root inside the container (Kubernetes
#     restricted PodSecurityStandard, `docker run --user`, rootless Podman,
#     etc). nginx listens on 8080 (unprivileged ports only). See
#     docs/TROUBLESHOOTING.md#running-rootless.
#
# Everything that both variants share - base image, PHP extensions, shared
# config files, application source, init script - lives in `base` so it only
# has to be updated once. Only what genuinely differs between running as
# root and running as "poznote" (user creation, a couple of config lines,
# ownership, the exposed port) is repeated in the two final stages below.
FROM php:8.4-fpm-alpine3.23 AS base

# Install system dependencies and PHP extensions
RUN apk add --no-cache \
    nginx \
    sqlite-libs \
    libzip \
    libcurl \
    ca-certificates \
    supervisor \
    && apk add --no-cache --virtual .build-deps \
    $PHPIZE_DEPS \
    sqlite-dev \
    libzip-dev \
    curl-dev \
    && docker-php-ext-configure zip \
    && docker-php-ext-install pdo pdo_sqlite zip curl \
    && docker-php-source delete \
    && apk del --no-cache .build-deps

# Copy configuration files (shared; the rootless stage patches a handful of
# lines in default.conf/supervisord.conf in place - see the `rootless` stage)
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

WORKDIR /var/www/html

# Copy initialization script and write the build-time version marker.
# Application source is copied per final stage below (ownership differs).
COPY init.sh /usr/local/bin/init.sh
RUN chmod +x /usr/local/bin/init.sh \
    && printf '%s\n' "<?php" "define('APP_VERSION', '${APP_VERSION}');" > /var/www/html/version.php \
    && chmod 755 /var/www/html

# Add OCI standard labels shared by both variants (title/description are set
# per final stage below)
LABEL org.opencontainers.image.authors="Timothé Poznanski"
LABEL org.opencontainers.image.url="https://github.com/timothepoznanski/poznote"
LABEL org.opencontainers.image.source="https://github.com/timothepoznanski/poznote"
LABEL org.opencontainers.image.licenses="Open Source"

# Use supervisor to manage multiple processes (nginx + php-fpm + reminder worker)
CMD ["/bin/sh", "-c", "/usr/local/bin/init.sh && exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf"]

# =============================================================================
# rootless: entire container runs as the unprivileged "poznote" user (uid/gid
# 1000) instead of root. Kept as a set of small, self-documenting patches on
# top of the shared base config files, so any change to default.conf or
# supervisord.conf above is picked up automatically.
# =============================================================================
FROM base AS rootless

LABEL org.opencontainers.image.title="Poznote (rootless)"
LABEL org.opencontainers.image.description="Poznote is a personal note-taking and documentation platform. This variant runs entirely as a non-root user."

# Dedicated non-root user/group. Fixed uid/gid (1000) so that host bind
# mounts can be pre-chowned deterministically (see docs/TROUBLESHOOTING.md).
RUN addgroup -g 1000 poznote && adduser -u 1000 -G poznote -s /bin/sh -D poznote

# Patch the shared nginx/supervisord/php-fpm config in place instead of
# maintaining full rootless copies:
#   - nginx: listen on the unprivileged 8080 port, and drop the "user"
#     directive (only meaningful for a root master process)
#   - supervisord: no "user=" directives left to drop privileges from, since
#     supervisord itself already runs as "poznote"
#   - php-fpm pool: drop "user"/"group" (only meaningful for a root master
#     process; harmless when left in, since FPM just logs a NOTICE and
#     ignores them, but stripping them keeps startup logs clean)
RUN sed -i 's/listen 80;/listen 8080;/' /etc/nginx/http.d/default.conf \
    && sed -i '/^user /d' /etc/nginx/nginx.conf \
    && sed -i \
         -e '/^user=root$/d' \
         -e '/^user=www-data$/d' \
         /etc/supervisor/conf.d/supervisord.conf \
    && sed -i \
         -e '/^user = www-data$/d' \
         -e '/^group = www-data$/d' \
         /usr/local/etc/php-fpm.d/www.conf \
    && grep -q 'listen 8080;' /etc/nginx/http.d/default.conf \
    && ! grep -q '^user ' /etc/nginx/nginx.conf \
    && ! grep -qE '^user=(root|www-data)$' /etc/supervisor/conf.d/supervisord.conf \
    && ! grep -qE '^(user|group) = www-data$' /usr/local/etc/php-fpm.d/www.conf

# Runtime directories that root would normally create/open on demand at
# startup. Since nothing here runs as root, they must be pre-created and
# owned by "poznote" at build time. This Alpine nginx build's prefix is
# /var/lib/nginx (html/tmp/logs, 0750 nginx:nginx) and its pid path is
# /run/nginx/nginx.pid - both must be reachable by "poznote", not just
# /var/log and /run themselves.
RUN mkdir -p /var/log/supervisor /run/nginx \
    && chown -R poznote:poznote /var/log /var/lib/nginx /run

# Copy application source, owned by the unprivileged user
COPY --chown=poznote:poznote ./src /var/www/html

# Finalize filesystem: writable data dir, and fix ownership of the two
# things the COPY above doesn't touch (the pre-existing web root directory
# entry and the version marker written in the base stage)
RUN install -d -o poznote -g poznote /var/www/html/data \
    && chown poznote:poznote /var/www/html /var/www/html/version.php

# Expose port HTTP (unprivileged port; non-root cannot bind <1024)
EXPOSE 8080

# Run everything as the unprivileged user from here on
USER poznote

# =============================================================================
# default: the standard, root-running image (published to ghcr.io)
# =============================================================================
FROM base AS default

LABEL org.opencontainers.image.title="Poznote"
LABEL org.opencontainers.image.description="Poznote is a personal note-taking and documentation platform."

RUN mkdir -p /var/log/supervisor /var/run

# Copy application source
COPY --chown=www-data:www-data ./src /var/www/html

# Finalize filesystem: writable data dir, and fix ownership of the two
# things the COPY above doesn't touch (the pre-existing web root directory
# entry and the version marker written in the base stage)
RUN install -d -o www-data -g www-data /var/www/html/data \
    && chown www-data:www-data /var/www/html /var/www/html/version.php

# Expose port HTTP
EXPOSE 80
