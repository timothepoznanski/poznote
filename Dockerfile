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
COPY ./src/ /var/www/html/

# Create directories for data volumes with proper permissions for Windows Docker
RUN mkdir -p /var/www/html/entries /var/www/html/attachments && \
    chown -R www-data:www-data /var/www/html/entries /var/www/html/attachments && \
    chmod -R 777 /var/www/html/entries /var/www/html/attachments

# Create a startup script to ensure permissions are correct on Windows
RUN echo '#!/bin/bash\n\
# Ensure proper permissions on startup (important for Windows Docker)\n\
chmod -R 777 /var/www/html/attachments\n\
chmod -R 777 /var/www/html/entries\n\
chown -R www-data:www-data /var/www/html/attachments\n\
chown -R www-data:www-data /var/www/html/entries\n\
# Start Apache\n\
exec apache2-foreground\n\
' > /usr/local/bin/start-poznote.sh && chmod +x /usr/local/bin/start-poznote.sh

# Expose port HTTP
EXPOSE 80

# Use our custom startup script
CMD ["/usr/local/bin/start-poznote.sh"]
