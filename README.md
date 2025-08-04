# Poznote

I created Poznote as an effective, self-hosted, open-source, fully-responsive note-taking tool with powerful search and full control over your data. 🤩

Poznote runs in Docker and works seamlessly on both Windows and Linux. The interface is fully responsive across all devices.

## 🚀 Quick Start

### Installation on Linux/macOS

```bash
git clone https://github.com/timothepoznanski/poznote.git
cd poznote
cp .env.template .env
vim .env
```

- Change `POZNOTE_USERNAME=admin` to your preferred username
- Change `POZNOTE_PASSWORD=admin123` to a secure password
- Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use

```bash
# Start Poznote
docker compose -f docker-compose.yml up -d --build
```

### Installation on Windows

```powershell
git clone https://github.com/timothepoznanski/poznote.git
cd poznote
copy .env.template .env
notepad .env
```

- Change `POZNOTE_USERNAME=admin` to your preferred username
- Change `POZNOTE_PASSWORD=admin123` to a secure password
- Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use

```powershell
# Start Poznote
docker compose -f docker-compose.yml up -d --build
```

### Default Access
- **URL**: `http://localhost:8040` (local) or `http://YOUR_SERVER_IP:8040` (VPS)

## 🔧 Configuration

Edit the `.env` file to customize your installation:

```bash
# Essential settings to change
POZNOTE_USERNAME=admin            # Change this!
POZNOTE_PASSWORD=admin123          # Change this!
HTTP_WEB_PORT=8040                # Web interface port
```

After modifying `.env`, restart the application:
```bash
docker compose down
docker compose up -d
```

## 📋 Prerequisites

### Linux/macOS
- **Docker Engine** and **Docker Compose**

### Windows
- **Docker Desktop for Windows**

### Docker Architecture

**Containers:**
- `webserver` - Apache/PHP serving the application
- `database` - MySQL for data storage

**Volumes:**
- `./data/entries` - Your note files
- `./data/attachments` - File attachments  
- `./data/mysql` - Database files

##  Updates

To update Poznote:

```bash
cd poznote
git pull origin main
docker compose down
docker compose up -d --build
```

**💡 For reverse proxy setups**: Use `docker compose -f docker-compose.yml -f docker-compose-reverse-proxy.yml` instead of `docker compose` in the commands above

## 💾 Data Management

### Understanding Backup Types

Poznote offers different backup options depending on your needs:

**📝 Complete Application Restore**: Requires all 3 components
- Notes (HTML files) + Attachments + Database
- Use this for full Poznote restoration on a new server

**📖 Offline Notes Consultation**: Notes export only
- Export notes as ZIP → Contains HTML files + `index.html` menu
- Open `index.html` in any browser to browse your notes offline
- No Poznote installation needed, works anywhere

**🔄 Partial Restore**: Individual components
- Notes only: Restore your content without attachments
- Attachments only: Restore files without notes  
- Database only: Restore metadata and structure (⚠️ **Note**: Database contains only note metadata like titles, tags, dates - not the actual note content which is stored in HTML files)

### Backup

Poznote includes built-in backup functionality through the web interface:

**Access**: Settings → "Export/Import Database"

- **Export Notes**: Download complete ZIP with all your notes
- **Export Attachments**: Download all file attachments
- **Export Database**: Download SQL dump

For manual backup, copy these directories:

- Your notes: `./data/entries`
- File attachements: `./data/attachments`
- Database:

```bash
docker compose exec database mysqldump -u root -psfs466!sfdgGH poznote_db > backup.sql
```

## 🔄 Restore

### Web Interface Restore
**Access**: Settings → "Export/Import Database"

- **Import Notes**: Upload ZIP file with your notes
- **Import Attachments**: Upload ZIP file with attachments
- **Import Database**: Upload SQL dump file

⚠️ **Warning**: Database import will completely replace your current data!  
⚠️ **Important**: Database contains only metadata (titles, tags, dates) - actual note content is in HTML files

### Manual Restore

**Restore notes and attachments:**
```bash
# Stop Poznote
docker compose down

# Copy your backup files
cp -r backup_entries/* ./data/entries/
cp -r backup_attachments/* ./data/attachments/

# Restart Poznote
docker compose up -d
```

**Restore database from SQL:**
```bash
# Copy SQL file to container and import
docker compose exec -T database mysql -u root -psfs466!sfdgGH poznote_db < backup.sql
```

## 🔌 API

Basic REST API endpoints:

### List Notes
```bash
curl http://localhost:8040/api_list_notes.php
```

### Create Note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -H "Content-Type: application/json" \
  -d '{"heading": "My note", "tags": "personal"}'
```

## 🔧 Troubleshooting

**Database connection error on first start:**
Wait 30-60 seconds for MySQL to initialize, then refresh.

**Port already in use:**
Change `HTTP_WEB_PORT` in `.env` file and restart.

**Check logs:**
```bash
docker compose logs -f
```

**Restart services:**
```bash
docker compose restart
```
