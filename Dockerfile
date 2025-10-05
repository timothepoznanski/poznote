# Dockerfile used by docker-compose.yml
FROM php:8.3.23-apache-bullseye

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

# Note: Source files are mounted as volumes, not copied
# 

# Create directory for data volume (entries and attachments are inside data/)
RUN mkdir -p /var/www/html/data 

# Enable Apache mod_rewrite if needed
RUN a2enmod rewrite

# Expose port HTTP
EXPOSE 80

# Set working directory
WORKDIR /var/www/html

# Start Apache in foreground
# Note: This CMD is overridden by docker-compose.yml's command directive when using docker-compose.
# It starts Apache in foreground mode to keep the container running, as Docker requires a foreground process.
# In case someone wants to run this Dockerfile directly without docker-compose, this CMD ensures Apache starts correctly.
CMD ["apache2-foreground"]
