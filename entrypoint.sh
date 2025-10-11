#!/bin/sh
set -e

DATA_DIR="/var/www/html/data"

# Check if writable
if [ ! -w "$DATA_DIR" ]; then
  echo "Cannot write to $DATA_DIR — permissions check skipped (likely Railway environment)"
else
  # Fix permissions if writable and possible
  echo "Checking permissions on $DATA_DIR..."
  if chown -R www-data:www-data "$DATA_DIR" 2>/dev/null; then
    echo "Permissions fixed for www-data"
  else
    echo "Could not change owner (non-root environment), continuing anyway"
  fi
  chmod -R 775 "$DATA_DIR" || true
fi

# Start Apache in foreground
echo "Starting Apache..."
exec apache2-foreground
