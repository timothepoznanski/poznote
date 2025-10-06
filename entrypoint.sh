#!/bin/bash
# Poznote Entrypoint Script
# Sets up permissions and starts the application

set -e

# Set permissions for web directory
chmod 755 /var/www/html

# Set ownership and permissions for data directory
chown -R www-data:www-data /var/www/html/data
chmod -R 775 /var/www/html/data

# Execute the main command
exec "$@"