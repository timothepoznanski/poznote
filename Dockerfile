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

# Note: Source files are mounted as volumes, not copied

# Create directories for data volumes with proper permissions
RUN mkdir -p /var/www/html/entries /var/www/html/attachments && \
    chown -R www-data:www-data /var/www/html && \
    chmod -R 777 /var/www/html

# Enable Apache mod_rewrite if needed
RUN a2enmod rewrite

# Expose port HTTP
EXPOSE 80

# Set working directory
WORKDIR /var/www/html

# Start Apache in foreground
CMD ["apache2-foreground"]
