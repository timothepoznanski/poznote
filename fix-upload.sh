#!/bin/bash

echo "🔍 Poznote Upload Diagnostic Script"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Check if Poznote containers are running
if ! docker compose ps | grep -q "Up"; then
    echo "❌ Poznote containers are not running. Starting them..."
    docker compose up -d
    echo "⏳ Waiting 10 seconds for containers to start..."
    sleep 10
fi

echo "📋 Container Status:"
docker compose ps

echo ""
echo "🔧 Fixing permissions..."
docker compose exec webserver chmod -R 777 /var/www/html/attachments
docker compose exec webserver chmod -R 777 /var/www/html/entries
docker compose exec webserver chown -R www-data:www-data /var/www/html/attachments
docker compose exec webserver chown -R www-data:www-data /var/www/html/entries

echo ""
echo "📁 Directory Status:"
echo "Attachments directory:"
docker compose exec webserver ls -la /var/www/html/attachments
echo ""
echo "Entries directory:"
docker compose exec webserver ls -la /var/www/html/entries

echo ""
echo "⚙️ PHP Configuration:"
docker compose exec webserver php -i | grep -E "(upload_max_filesize|post_max_size|file_uploads|upload_tmp_dir)"

echo ""
echo "📊 Recent logs (last 5 lines):"
docker compose logs --tail=5 webserver

echo ""
echo "🌐 Test the upload at: http://localhost:8040/test_upload.php"
echo "🚀 Access Poznote at: http://localhost:8040"

echo ""
echo "✅ Diagnostic complete!"
echo "💡 If upload still fails, check the test_upload.php page for detailed information."
