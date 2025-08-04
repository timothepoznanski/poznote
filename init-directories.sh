#!/bin/bash

# Initialize Poznote directories with proper permissions for Windows Docker
echo "Initializing Poznote directories..."

# Create directories if they don't exist
mkdir -p /var/www/html/attachments
mkdir -p /var/www/html/entries

# Set proper ownership and permissions
chown -R www-data:www-data /var/www/html/attachments
chown -R www-data:www-data /var/www/html/entries

# Set directory permissions (777 for maximum compatibility on Windows Docker)
chmod -R 777 /var/www/html/attachments
chmod -R 777 /var/www/html/entries

# Create .gitkeep files to ensure directories are tracked
touch /var/www/html/attachments/.gitkeep
touch /var/www/html/entries/.gitkeep

echo "Directories initialized successfully!"
echo "Attachments directory: $(ls -la /var/www/html/attachments)"
echo "Entries directory: $(ls -la /var/www/html/entries)"
