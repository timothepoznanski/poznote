#!/bin/sh
set -e

echo "Poznote Setup - Ensuring data directory permissions..."

DATA_DIR="/var/www/html/data"

# Ensure data directory exists with correct permissions
mkdir -p "$DATA_DIR"
chown -R www-data:www-data "$DATA_DIR"
chmod -R 775 "$DATA_DIR"

echo "Permissions verified successfully!"