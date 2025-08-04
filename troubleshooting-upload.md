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

## 📞 Support

If the problem persists after all these steps, create a GitHub issue with:
- Output from `test_upload.php`
- Container logs (`docker compose logs webserver`)
- Windows and Docker Desktop versions
