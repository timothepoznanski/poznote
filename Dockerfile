# Dockerfile used by docker-compose.yml
FROM php:8.3.23-apache-bullseye

# Install (but also activate mysqli extension)
RUN docker-php-ext-install mysqli

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
    libzip-dev \
    zip \
    vim \
    default-mysql-client \
    && docker-php-ext-install zip

# Copy apache config
COPY ./000-default.conf /etc/apache2/sites-available/000-default.conf

# Copy php.ini
COPY php.ini /usr/local/etc/php/

# Copy src files
# This ensures the container has the application code in all scenarios:
# - In production: code is embedded in the image (no external dependencies)
# - In development: provides initial files and correct permissions before volume mount overrides it
COPY ./src/ /var/www/html/

# Create directories for data volumes (will be mounted over in production/development)
RUN mkdir -p /var/www/html/entries /var/www/html/attachments && \
    chown -R www-data:www-data /var/www/html/entries /var/www/html/attachments && \
    chmod -R 755 /var/www/html/entries /var/www/html/attachments

# Expose port HTTP
EXPOSE 80
