# 🔧 Poznote Upload & Import Troubleshooting Guide

## 📤 Upload Issues (Adding Attachments to Notes)

### Quick Diagnostic Test

Run this to check basic functionality:
```bash
# Go to your poznote URL
http://localhost/test_upload.php
```

### Step-by-Step Troubleshooting

#### 1. Check Container Status
```bash
docker compose ps
# All services should show "Up"
```

#### 2. Test File Permissions
```bash
# Check attachments directory
docker compose exec webserver ls -la /var/www/html/
# Should show: drwxrwxrwx for attachments directory

# Fix if needed
docker compose exec webserver chmod 777 /var/www/html/attachments
```

#### 3. Check PHP Configuration
```bash
# Check upload limits
docker compose exec webserver php -r "echo 'Max upload: ' . ini_get('upload_max_filesize') . PHP_EOL; echo 'Max post: ' . ini_get('post_max_size') . PHP_EOL; echo 'Memory limit: ' . ini_get('memory_limit') . PHP_EOL;"
```

#### 4. Database Connection Test
```bash
# Test MySQL connection
docker compose exec webserver php -r "
try {
    \$pdo = new PDO('mysql:host=db;dbname=poznote', 'poznote', 'poznote');
    echo 'Database connection: OK' . PHP_EOL;
} catch (Exception \$e) {
    echo 'Database error: ' . \$e->getMessage() . PHP_EOL;
}
"
```

#### 5. Container Health Check
```bash
# Restart if needed
docker compose restart webserver

# Check logs for errors
docker compose logs webserver --tail=10
```

### Configuration Issues

If upload limits are too low:
```bash
# Restart after php.ini modification
docker compose restart webserver
```

### Temporary Directory Issues
```bash
# Check temporary directory
docker compose exec webserver ls -la /tmp
```

## 📁 Upload Limits

- **Maximum size:** 200MB per file
- **Allowed types:** pdf, doc, docx, txt, jpg, jpeg, png, gif, zip, rar
- **Number of files:** Maximum 20 files per upload

## 🚨 Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Attachments directory is not writable" | Permission problem | Run `chmod 777` on directory |
| "File too large" | File > 200MB | Use a smaller file |
| "File type not allowed" | Unsupported file type | Check file extension |
| "Invalid uploaded file" | Transfer problem | Retry or restart container |
| "Upload failed" (generic) | Various causes | Check browser console, try smaller file |
| "Network error" | Connection issue | Check Docker container status |
| "HTTP 500 error" | Server error | Check logs: `docker compose logs webserver` |
| "showAttachmentDialog is not defined" | JavaScript error | Hard refresh page (Ctrl+F5), clear cache |
| "Uncaught SyntaxError" | Script loading issue | Restart Docker container |

## 🔍 Additional Troubleshooting

### If Diagnostic Tests Pass But Upload Still Fails

1. **Check Browser Console:**
   - Press F12 → Console tab
   - Look for JavaScript errors during upload
   - Common issues: CORS errors, network timeouts, syntax errors
   - **Specific JavaScript errors to look for:**
     - `Uncaught SyntaxError` - File corruption or syntax issues
     - `showAttachmentDialog is not defined` - Script loading failure
     - `Uncaught ReferenceError` - Missing functions

2. **JavaScript-Specific Fixes:**
   - Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
   - Clear browser cache and cookies
   - If you see syntax errors, restart the Docker container

2. **Try Different File Types:**
   - Start with a small .txt file
   - Gradually test larger files
   - Test different file extensions

3. **Browser-Specific Issues:**
   - Try Chrome, Firefox, Edge
   - Test in incognito/private mode
   - Disable ad blockers and extensions

4. **Network Issues:**
   - If using VPN, try disabling it
   - Check firewall settings
   - Try uploading from another device on same network

## 🔄 Complete Reinstallation

If nothing works:
```bash
# Stop and remove containers
docker compose down -v

# Rebuild completely
docker compose up -d --build

# Wait a few seconds then test
```

## 💡 Windows-Specific Tips

1. **Docker Desktop:** Ensure Docker Desktop is working properly
2. **Drive Sharing:** Verify the drive is shared with Docker
3. **Antivirus:** Some antivirus software blocks uploads - add an exception
4. **WSL2:** If using WSL2, try restarting WSL

## 🔄 Import Issues (Restore from Backup)

### ✨ New Attachment Restoration System (Rebuilt from Scratch)

The attachment restoration system has been completely rebuilt to provide reliable linking of imported files to their original notes.

#### 🎯 How the New System Works

**Export Process:**
1. Creates a structured ZIP file with `files/` subdirectory
2. Includes `poznote_attachments_metadata.json` with complete linking information
3. Adds human-readable `README.txt` with import instructions

**Import Process:**
1. **Phase 1:** Validates and extracts metadata
2. **Phase 2:** Extracts all files to proper locations
3. **Phase 3:** Updates database to recreate note-attachment links

#### 📊 Import Result Messages

**✅ Complete Success:**
```
✅ Successfully imported 15 files and linked 12 attachments to notes
Import completed successfully with metadata linking
```

**⚠️ Legacy Format (Partial Success):**
```
⚠️ Successfully imported 15 files (no metadata found - files copied but not linked to notes)
Files are available but need manual re-linking
```

**❌ Import Errors:**
```
❌ Import failed: [specific error message]
Please check the error details and try again
```

### 🛠️ Solutions for Different Scenarios

#### Scenario 1: Complete Restoration (Recommended)
**Best practice for full backup/restore:**
```bash
1. Import Database (SQL) - Creates note structure
2. Import Notes (ZIP) - Restores HTML content
3. Import Attachments (ZIP) - Restores files + links
Result: Complete system restoration
```

#### Scenario 2: Attachment-Only Restoration
**If you only have attachment backup:**
- **New format ZIP:** Automatic linking to existing notes
- **Legacy format ZIP:** Files copied, manual re-linking needed

#### Scenario 3: Legacy Format Handling
**For old exports without metadata:**
1. Import ZIP (files will be copied to filesystem)
2. Manually re-upload attachments to correct notes
3. Clean up orphaned files in attachments directory

### 📋 New System Features

#### Enhanced Export Structure
```
attachment_backup_YYYY-MM-DD.zip
├── files/
│   ├── note_123_file1.pdf
│   ├── note_456_document.docx
│   └── ...
├── poznote_attachments_metadata.json
└── README.txt
```

#### Robust Error Handling
- **Metadata validation:** Checks JSON structure before processing
- **File integrity:** Verifies all referenced files exist
- **Database safety:** Uses transactions for consistent updates
- **Detailed logging:** Clear success/failure messages

#### Backward Compatibility
- **Legacy support:** Handles old ZIP files gracefully
- **Clear messaging:** Users know if linking occurred
- **No data loss:** Files always copied, even without metadata

### 🚨 Troubleshooting Import Issues

#### HTTP 500 Errors During Import
```bash
# Check server logs
docker compose logs webserver --tail=20

# Check PHP error logs
docker compose exec webserver tail -20 /var/log/apache2/error.log

# Quick fix: Restart container
docker compose restart webserver
```

#### Metadata JSON Errors
- **Corrupted metadata:** Creates new export from source system
- **Missing fields:** Check export was created with new system
- **Invalid JSON:** Verify ZIP file wasn't corrupted during transfer

#### Database Connection Issues
```bash
# Test database connectivity
docker compose exec webserver php -r "
try {
    \$pdo = new PDO('mysql:host=db;dbname=poznote', 'poznote', 'poznote');
    echo 'Database OK' . PHP_EOL;
} catch (Exception \$e) {
    echo 'DB Error: ' . \$e->getMessage() . PHP_EOL;
}
"
```

#### File Permission Issues
```bash
# Reset attachment directory permissions
docker compose exec webserver chmod -R 777 /var/www/html/attachments

# Verify permissions
docker compose exec webserver ls -la /var/www/html/attachments
```

### 🔍 Validation & Testing

#### Verify Successful Import
1. **Check import message** for "linked X attachments to notes"
2. **Open original notes** and verify attachments appear
3. **Test attachment downloads** from within notes
4. **Check file count** matches expected number

#### Debug Failed Imports
```bash
# Check what files were actually imported
docker compose exec webserver find /var/www/html/attachments -type f -name "*" | wc -l

# Check database entries
docker compose exec webserver mysql -u poznote -ppoznote poznote -e "
SELECT id, title, 
       JSON_LENGTH(attachments) as attachment_count 
FROM entries 
WHERE JSON_LENGTH(attachments) > 0;"
```

## 📞 Support

If issues persist after following this guide:

1. **Create GitHub issue** with:
   - Output from diagnostic tests
   - Container logs (`docker compose logs webserver`)
   - Import error messages
   - System information (OS, Docker version)

2. **Include sample files** (if safe to share):
   - Problematic ZIP file structure
   - Sanitized metadata JSON sample

The new system provides much more reliable restoration with detailed error reporting to help diagnose any remaining issues.
