# Poznote

I created Poznote as an effective, self-hosted, open-source, fully-responsive note-taking tool with powerful search and full control over your data. 🤩

Poznote runs in Docker and works seamlessly on both Windows and Linux. The interface is fully responsive across all devices.

## 🚀 Quick Start

### Automated Setup (Recommended)

**For Linux/macOS:**
```bash
mkdir my-poznote && cd my-poznote
git clone https://github.com/timothepoznanski/poznote.git
cd poznote && chmod +x setup.sh && ./setup.sh
```

**For Windows (PowerShell):**
```powershell
mkdir my-poznote; cd my-poznote
git clone https://github.com/timothepoznanski/poznote.git
cd poznote; .\setup.ps1
```

### Default Access
- **URL**: `http://localhost:8040` (local) or `http://YOUR_SERVER_IP:8040` (VPS)
- **Username**: `admin`
- **Password**: `admin123` ⚠️ **Change this immediately!**

## 🔧 Installation & Updates

### Automated Setup

**For Linux/macOS:**
```bash
mkdir my-poznote
cd my-poznote
git clone https://github.com/timothepoznanski/poznote.git
cd poznote
chmod +x setup.sh
./setup.sh
```

**For Windows (PowerShell):**
```powershell
mkdir my-poznote
cd my-poznote
git clone https://github.com/timothepoznanski/poznote.git
cd poznote
.\setup.ps1
```

The setup script will automatically detect your situation and present an appropriate menu:
- **New installation**: Direct setup with configuration prompts
- **Existing installation**: Menu with options to update application or change configuration

#### What the setup script does:
- **For new installations:**
  - Check Docker and Docker Compose installation
  - Interactive configuration prompts with default values
  - Create `.env` file from your input
  - Set up data directories with proper permissions  
  - Start Poznote with Docker Compose
  - Display access information and useful commands

- **For existing installations:**
  - Present an interactive menu with options:
    1. **Update application**: Pull latest changes, preserve configuration, restart services
    2. **Change configuration**: Modify password/port settings, restart services
    3. **Cancel**: Exit without changes

#### Configuration options you'll be prompted for (new installations):
- **Web Server Port**: Port for the web interface (default: `8040`)
- **Poznote Password**: Application login password (⚠️ change from default `admin123`!)

*Note: Database configuration is automatically handled using a dedicated `poznote_user` for secure access to the MySQL database - no additional database configuration is needed.*

## 📋 Prerequisites

### System Requirements
- **Docker Engine** and **Docker Compose** (v2.0+)
- **Git** (for installation and updates)
- **2GB RAM** minimum, 4GB recommended
- **1GB disk space** minimum for application + your data

### Platform Specific
**Linux/macOS:**
- Bash shell
- `sudo` access (for file permissions)

**Windows:**
- Docker Desktop for Windows
- PowerShell 5.1 or later
- Git for Windows

### Network Requirements
**Ports used by Poznote:**
- `8040` (default) - Web interface (configurable)
- `3306` - MySQL database (internal, not exposed)

**For VPS installations:**
- Ensure your firewall allows the chosen web port
- Consider setting up a reverse proxy for HTTPS

### Manual Installation

```bash
mkdir my-poznote
cd my-poznote
git clone https://github.com/timothepoznanski/poznote.git
cd poznote
cp .env.template .env
# Edit .env file with your configuration
docker compose up -d --build
```

### Docker Architecture

Poznote uses a multi-container Docker setup:

**Containers:**
- `webserver` - Apache/PHP serving the application
- `database` - MySQL 9.3.0 for data storage

**Volumes:**
- `./data/entries` - Your note files (HTML)
- `./data/attachments` - File attachments
- `./data/mysql` - Database files

**Configuration:**
- `.env` file contains all settings (ports, passwords, paths)
- Based on `.env.template` with secure defaults

### Access

**For local installation:**
Open your web browser and visit: `http://localhost:8040`

**For VPS/remote server installation:**
Open your web browser and visit: `http://YOUR_SERVER_IP:8040` or `http://your-domain.com:8040`

**For network access from other devices on local network:**
Use: `http://YOUR_LOCAL_IP:8040`

You'll be prompted to login with the default password: `admin123`

⚠️ **Important**: Change the default password after first login for security!

## 🛡️ Security Considerations

### Essential Security Steps
1. **🔑 Change Default Password**: Replace `admin123` immediately
2. **🌐 Network Security**: 
   - For VPS: Configure firewall (`ufw allow 8040` on Ubuntu)
   - Consider using non-default ports
   - Implement fail2ban for brute force protection
3. **🔒 Production Setup**: Use HTTPS with reverse proxy
4. **📦 Keep Updated**: Regular `docker compose pull` for security patches

### For VPS/Production
```bash
# Example firewall setup (Ubuntu/Debian)
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 8040/tcp  # Or your chosen port
sudo ufw status
```

### Recommended Production Architecture
- **Reverse Proxy**: [Nginx Proxy Manager](https://nginxproxymanager.com), Traefik, or Caddy
- **SSL/TLS**: Let's Encrypt certificates
- **Backup Strategy**: Automated backups of data volumes

## 🔧 Troubleshooting

### Common Issues

**🐛 Database connection errors on first start:**
```
BDD connection error : Connection refused
```
**Solution**: Wait 30-60 seconds for MySQL to initialize, then refresh the page.

**📁 Permission errors when saving notes:**
**Solution**: Docker handles permissions automatically, but if issues persist:
```bash
docker compose down
docker compose up -d --force-recreate
```

**🚪 Port already in use:**
**Solution**: Edit `.env` file to change `HTTP_WEB_PORT=8041` (or any free port)

**🐳 Docker issues:**
- **Linux**: `sudo systemctl start docker`
- **macOS/Windows**: Start Docker Desktop application
- **Verification**: `docker --version && docker compose version`

### Getting Help
**Check logs for detailed error information:**
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f webserver
docker compose logs -f database
```

**Common diagnostic commands:**
```bash
# Check container status
docker compose ps

# Check resource usage
docker stats

# Restart specific service
docker compose restart webserver
```

## 🔄 Updates

### Automated Update (Recommended)

To update Poznote to the latest version, simply run the setup script:

**For Linux/macOS:**
```bash
cd /path/to/your/poznote
./setup.sh
```

**For Windows:**
```powershell
cd path\to\your\poznote
.\setup.ps1
```

The script will present a menu where you can choose to:
1. **Update application** - Pulls latest changes and updates containers while preserving your configuration
2. **Change configuration** - Modify your password or port settings
3. **Cancel** - Exit without making changes

**Manual Update (Alternative):**
```bash
cd my-poznote/poznote
git pull origin main
docker compose build --no-cache
docker compose up -d --force-recreate
```

### Configuration Updates

**Using the setup script (Recommended):**

Run the setup script and select option 2 from the menu:

**For Linux/macOS:**
```bash
./setup.sh
```

**For Windows:**
```powershell
.\setup.ps1
```

*Select option "2) Change configuration" from the interactive menu.*

**Manual configuration changes:**

**For basic settings (HTTP_WEB_PORT, POZNOTE_PASSWORD):**
Edit your `.env` file and restart the application:
```bash
docker compose down
docker compose up -d
```
Your data will remain untouched, but always make a backup first.

**For data path settings (ENTRIES_DATA_PATH, DB_DATA_PATH, ATTACHMENTS_DATA_PATH):**
⚠️ **Warning**: Changing these paths will create new empty directories. Always backup your data first.

Update your `.env` file and restart:
```bash
docker compose down
docker compose up -d
```

*Note: Database settings are fixed for the containerized environment and cannot be changed after initial setup.*

## 💾 Backup & Restore

Poznote provides comprehensive backup and restore functionality through the web interface.

### 📤 Export (Backup)

**Access**: Settings → "Export/Import Database"

#### 📝 Export Notes
- **Web Interface**: Click "Download Notes (ZIP)" → Complete ZIP with HTML files + index
- **Manual**: Copy files from `./data/entries` directory

#### 📎 Export Attachments  
- **Web Interface**: Click "Download Attachments (ZIP)" → All files in organized ZIP
- **Manual**: Copy files from `./data/attachments` directory

#### 🗄️ Export Database
- **Web Interface**: Click "Download Database (SQL)" → Complete SQL dump
- **Format**: `poznote_export_YYYY-MM-DD_HH-MM-SS.sql`
- **Contents**: Tables, data, routines, triggers

**Manual Database Export:**
```bash
# Get container status
docker compose ps

# Export database
docker compose exec database mysqldump -u root -p${MYSQL_ROOT_PASSWORD} poznote_db > backup.sql
```
*Replace `${MYSQL_ROOT_PASSWORD}` with your actual password from `.env`*

### 📥 Import (Restore)

**Access**: Settings → "Export/Import Database"

⚠️ **Complete Restore**: For full restoration, import all three components: Notes + Attachments + Database

#### 📝 Import Notes
1. **Web Interface**: Select ZIP file → Click "Import Notes (ZIP)" → Auto-extraction
2. **Manual**: Copy HTML files to `./data/entries` (auto-accessible by container)

#### 📎 Import Attachments
1. **Web Interface**: Select ZIP file → Click "Import Attachments (ZIP)" → Auto-extraction  
2. **Manual**: Copy files to `./data/attachments` (auto-accessible by container)

#### 🗄️ Import Database
1. **Web Interface**: Select SQL file → Click "Import Database"
   
   ⚠️ **Warning**: Completely replaces current database!

2. **Manual Import**:
```bash
# Copy dump to container
docker compose cp backup.sql database:/tmp/backup.sql

# Import database
docker compose exec database bash
mysql -u root -p${MYSQL_ROOT_PASSWORD} poznote_db < /tmp/backup.sql
exit
```

**Security Features:**
- ✅ ZIP files validated and safely extracted
- ✅ HTML files filtered during import
- ✅ SQL files verified before import
- ✅ Automatic permission handling
- ✅ Temporary files cleaned up automatically



## 🔌 API Documentation

Poznote provides a REST API for external integrations.

### Authentication
Currently, the API uses the same authentication as the web interface.

### Endpoints

#### 📋 List Notes
- **URL**: `/api_list_notes.php`
- **Method**: `GET`
- **Response**:
```json
[
  {
    "id": 1,
    "heading": "Note Title",
    "tags": "tag1,tag2",
    "updated": "2025-07-14 20:00:00"
  }
]
```

#### ✏️ Create Note
- **URL**: `/api_create_note.php`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**:
```json
{
  "heading": "Note title",
  "tags": "tag1,tag2"
}
```
- **Success Response**:
```json
{ 
  "success": true, 
  "id": 2 
}
```
- **Error Response**:
```json
{ 
  "error": "The heading field is required" 
}
```

### Examples

**Local Installation:**
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -H "Content-Type: application/json" \
  -d '{"heading": "My new note", "tags": "personal,important"}'
```

**VPS/Remote Server:**
```bash
curl -X POST http://YOUR_SERVER_IP:8040/api_create_note.php \
  -H "Content-Type: application/json" \
  -d '{"heading": "My new note", "tags": "personal,important"}'
```

**List all notes:**
```bash
curl http://localhost:8040/api_list_notes.php
```
