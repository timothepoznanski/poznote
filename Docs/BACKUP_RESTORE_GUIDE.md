# Poznote Backup & Restore Guide

## File Size Limits & Recommendations

Poznote supports multiple methods for restoring backups of different sizes:

### 📏 Size Guidelines

| Backup Size | Recommended Method | Why |
|-------------|-------------------|-----|
| < 500MB | **Standard Web Upload** | Fast, simple, no special setup |
| 500MB - 800MB | **Chunked Web Upload** | Avoids timeouts, resumable |
| > 800MB | **Direct File Copy** | No HTTP limits, simple Docker command |

### 🔧 Configuration Limits

- **HTTP Upload Limit**: 800MB (Nginx + PHP)
- **Chunk Size**: 5MB (for chunked uploads)
- **Memory Limit**: 512MB (PHP processing)
- **Direct File Copy Path**: `/tmp/backup_restore.zip` (in container)

## Methods

### 1. Standard Web Upload (< 500MB)

**Best for**: Most users, quick restores

1. Go to Settings → Restore/Import
2. Select "Complete Restore from Poznote zip backup"
3. Choose your backup ZIP file
4. Click "Complete Restore from Poznote zip backup"

**Limitations**: Files >500MB will be rejected with warning

### 2. Chunked Web Upload (500MB - 800MB)

**Best for**: Large backups without server access

1. Go to Settings → Restore/Import
2. Select "Large File Restore (Chunked Upload)"
3. Choose your backup ZIP file
4. Click "Start Chunked Restore"

**Features**:
- Automatic file splitting into 5MB chunks
- Progress bar with real-time updates
- Resumable on network errors
- Server-side reassembly

### 3. Direct File Copy (> 800MB)

**Best for**: Very large backups without complex scripting

#### Simple 2-step process:

1. **Copy file to container:**
   ```bash
   docker cp /path/to/backup.zip container-name:/tmp/backup_restore.zip
   ```

2. **Restore via web interface:**
   - Go to Settings → Restore/Import
   - Scroll to "Direct File Copy" section
   - Click "Check for Direct Copy"
   - Confirm and restore

**Features:**
- ✅ No size limits
- ✅ Simple single docker command
- ✅ Web interface validation and confirmation
- ✅ Automatic cleanup after restore
- ✅ Cross-platform support

### "File too large" Error
- Use chunked upload for 500MB-800MB files
- Use direct file copy for >800MB files

### Upload Fails Midway
- Chunked upload will resume automatically
- Direct file copy can be restarted safely

### Memory Issues
- Ensure server has enough RAM (at least 1GB free)
- Use direct file copy for very large files

### Network Timeouts
- Chunked upload handles network issues automatically
- Direct file copy bypasses HTTP entirely

### Direct File Copy Issues
- Ensure Docker is running and you have access to the container
- Check that the container name is correct
- Verify the file path exists on your host system

## Performance Tips

- **< 500MB**: Use standard web upload (fastest, no setup required)
- **500MB - 800MB**: Use chunked web upload (avoids timeouts, resumable)
- **> 800MB**: Use direct file copy (no HTTP limits, simple Docker command)

## Security Considerations

- All methods validate ZIP file integrity
- Chunked uploads use temporary files cleaned automatically
- Direct file copy requires Docker access (appropriate permissions needed)
- Web interface provides confirmation dialogs for destructive operations