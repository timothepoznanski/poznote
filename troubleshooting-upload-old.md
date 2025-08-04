# Fixing Upload Issues on Windows

If you encounter "upload failed" error messages on Windows Desktop, here are the steps to resolve the issue:

## 🔧 Quick Solutions

### 1. Restart Docker Container
```bash
docker compose down
docker compose up -d --build
```

### 2. Check Permissions
Access the diagnostic page: `http://localhost:8040/test_upload.php`

This page will show you:
- PHP configuration for uploads
- Directory permissions
- File write tests
- Recent PHP errors

### 3. Reset Directories
```bash
# In the poznote directory
docker compose exec webserver /usr/local/bin/init-directories.sh
```

## 🔍 Advanced Diagnostics

### Check Logs
```bash
# View container logs
docker compose logs webserver

# View PHP logs
docker compose exec webserver tail -f /var/log/php_errors.log
```

### Test Upload Manually
1. Open `http://localhost:8040/test_upload.php`
2. Verify that all tests pass
3. If tests fail, note the specific errors

**If all diagnostic tests pass but upload still fails:**
- Try uploading a very small file (< 1MB) first
- Check browser console for JavaScript errors (F12 → Console)
- Try a different browser or incognito mode
- Disable browser extensions temporarily

## 🛠️ Advanced Solutions

### Permission Issues (Very common on Windows)
```bash
# Grant full permissions to directories
docker compose exec webserver chmod -R 777 /var/www/html/attachments
docker compose exec webserver chmod -R 777 /var/www/html/entries
```

### PHP Configuration Issues
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

## � Import Issues (Restore from Backup)

### Problem: Attachments ZIP Import Doesn't Link Files to Notes

When importing attachments from a ZIP backup using the "Import Attachments" feature in `database_backup.php`, there are two scenarios:

#### ✅ **Modern Exports (After Fix)**
- **Exports created after this fix** include metadata that automatically links attachments to notes
- **Import message will show**: "Extracted X files and linked Y attachments to notes"
- **Files are properly connected** to their original notes

#### ⚠️ **Legacy Exports (Before Fix)**  
- **Older exports** only contain physical files without metadata
- **Import message will show**: "Extracted X files (no metadata found - files not linked to notes)"
- **Files are copied but not linked** - they appear in filesystem but not in the application

### 🛠️ Solutions for Attachment Import Issues

#### Option 1: Complete Database Restore (Recommended)
```bash
# For a complete restoration, import all 3 components in this order:
# 1. Import the database SQL file first (contains note structure + attachment metadata)
# 2. Import the notes ZIP file (HTML files)
# 3. Import the attachments ZIP file (physical files)
```

#### Option 2: Manual Attachment Re-linking
If you only have the attachments ZIP without the database backup:
1. Import the attachments ZIP (files will be copied but not linked)
2. Manually re-upload each attachment to its corresponding note
3. Delete the old unlinked files from the attachments folder

#### Option 3: Database Repair (Advanced Users)
```bash
# Check what files exist but aren't linked to notes
docker compose exec webserver find /var/www/html/attachments -name "*.pdf" -o -name "*.jpg" -o -name "*.png" -o -name "*.doc*"

# Compare with database entries - look for orphaned files
```

### 📋 Best Practices for Backup/Restore

1. **Always backup all 3 components together:**
   - Database (SQL) - contains structure and metadata
   - Notes (ZIP) - contains HTML content files  
   - Attachments (ZIP) - contains physical attachment files

2. **Export order doesn't matter, but import order does:**
   - Import database **first** (creates note structure + attachment metadata)
   - Import notes **second** (restores HTML files)
   - Import attachments **last** (restores physical files that link to database entries)

3. **Test your backups regularly** by doing a complete restore on a test system

### 🚨 Warning
The current "Import Attachments" feature is designed to work **only with a corresponding database restore**. Importing attachments without the matching database will result in orphaned files that appear in the filesystem but not in the application.

### 🐛 Troubleshooting HTTP 500 Errors During Import

If you get an HTTP 500 error when trying to import attachments:

1. **Check server logs:**
   ```bash
   docker compose logs webserver --tail=20
   ```

2. **Check PHP error logs:**
   ```bash
   docker compose exec webserver tail -20 /var/log/apache2/error.log
   ```

3. **Common causes after recent updates:**
   - **Corrupted ZIP metadata**: The ZIP file may contain invalid JSON metadata
   - **Database connection issues**: MySQL connection may be interrupted
   - **File permissions**: Temporary file creation may fail

4. **Quick fixes:**
   ```bash
   # Restart the container to clear any temporary issues
   docker compose restart webserver
   
   # Reset file permissions
   docker compose exec webserver chmod -R 777 /var/www/html/attachments
   ```

5. **If import still fails:**
   - Try importing a database backup first, then attachments
   - Use the "legacy" import method (files only, manual re-linking)
   - Check that your ZIP file isn't corrupted

## �📞 Support

If the problem persists after all these steps, create a GitHub issue with:
- Output from `test_upload.php`
- Container logs (`docker compose logs webserver`)
- Windows and Docker Desktop versions
