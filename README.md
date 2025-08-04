# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-orange?logo=mysql)](https://www.mysql.com/)

A powerful, self-hosted, open-source note-taking tool with advanced search capabilities and full control over your data. 🤩

Poznote runs in Docker and works seamlessly on both Windows and Linux. The interface is fully responsive across all devices, from desktop to mobile.

## ✨ Features

- 📝 **Rich Text Editor** - Write and format notes with ease
- 🔍 **Powerful Search** - Find your notes instantly with advanced search
- 🏷️ **Tag System** - Organize notes with flexible tagging
- 📎 **File Attachments** - Attach files directly to your notes
- 📱 **Responsive Design** - Works perfectly on all devices
- 🔒 **Self-Hosted** - Complete control over your data
- 💾 **Backup & Export** - Built-in backup and export functionality
- 🗑️ **Trash System** - Recover accidentally deleted notes
- 🌐 **REST API** - Programmatic access to your notes
- 🐳 **Docker Ready** - Easy deployment with Docker Compose

## 📋 Prerequisites

### Linux/macOS
- **Docker Engine** (v20.10+)
- **Docker Compose** (v2.0+)

### Windows
- **Docker Desktop for Windows**

## 🚀 Installation

### Linux/macOS

1. **Clone the repository**
   ```bash
   git clone https://github.com/timothepoznanski/poznote.git
   cd poznote
   ```

2. **Configure environment**
   ```bash
   cp .env.template .env
   vim .env  # or use your preferred editor
   ```

3. **Customize settings**
   - Change `POZNOTE_USERNAME=admin` to your preferred username
   - Change `POZNOTE_PASSWORD=admin123` to a secure password
   - Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use

4. **Start Poznote**
   ```bash
   docker compose up -d --build
   ```

### Windows

1. **Clone the repository**
   ```powershell
   git clone https://github.com/timothepoznanski/poznote.git
   cd poznote
   ```

2. **Configure environment**
   ```powershell
   copy .env.template .env
   notepad .env  # or use your preferred editor
   ```

3. **Customize settings**
   - Change `POZNOTE_USERNAME=admin` to your preferred username
   - Change `POZNOTE_PASSWORD=admin123` to a secure password
   - Optionally modify `HTTP_WEB_PORT=8040` if the port is already in use

4. **Start Poznote**
   ```powershell
   docker compose up -d --build
   ```

### Access URLs

After starting Poznote, you can access it at:
- **URL Pattern**: `http://YOUR_SERVER:HTTP_WEB_PORT`

Where `YOUR_SERVER` depends on your environment:
- `localhost`
- Your server's IP address
- Your domain name

## ⚙️ Change login, password or port

### Environment Variables

Open the folder of your project and edit the `.env` file to customize your installation:

```bash
POZNOTE_USERNAME=admin            
POZNOTE_PASSWORD=admin123        
HTTP_WEB_PORT=8040             
```

After modifying the `.env` file, restart the application:

```bash
docker compose down
docker compose up -d
```

### Docker Architecture

**Services:**
- 🌐 **webserver** - Apache/PHP serving the application
- 🗄️ **database** - MySQL for data storage

**Persistent Volumes:**
- 📁 `./data/entries` - Your note files (HTML format)
- 📎 `./data/attachments` - File attachments  
- 🗄️ `./data/mysql` - Database files

## 🔄 Updates

To update Poznote to the latest version:

```bash
cd poznote
git pull origin main
docker compose down
docker compose up -d --build
```

## Backup and Restore

Poznote offers different backup options depending on your needs:

**📝 Complete Application Restore**: Requires all 3 components
- Notes (HTML files) + Attachments + Database
- Use this for full Poznote restoration (new server or current installation)

**📖 Offline Notes Consultation**: Notes export only
- Export notes as ZIP → Contains HTML files + `index.html` menu
- Open `index.html` in any browser to browse your notes offline
- No Poznote installation needed, works anywhere

⚠️ Database contains only note metadata like titles, tags, dates - not the actual note content which is stored in HTML files

### 💾 Backup

Poznote includes built-in backup functionality through the web interface in Settings → "Export/Import Database"

Available backup options:
- **📝 Export Notes** - Download complete ZIP with all your notes
- **📎 Export Attachments** - Download all file attachments  
- **🗄️ Export Database** - Download SQL dump

but if you prefere you can also manually backup with:

```bash
# Backup your notes
cp -r ./data/entries /path/to/backup/entries

# Backup attachments  
cp -r ./data/attachments /path/to/backup/attachments

# Backup database
docker compose exec database mysqldump -u root -psfs466!sfdgGH poznote_db > backup.sql
```

### 🔄 Restore

Poznote includes built-in backup functionality through the web interface in Settings → "Export/Import Database"

> **⚠️ Warning**: Database import will completely replace your current data!  
> **ℹ️ Important**: Database contains only metadata (titles, tags, dates) - actual note content is stored in HTML files.

but if you prefere you can also manually restore with:

**Restore notes and attachments**
```bash
# Stop Poznote
docker compose down

# Copy your backup files
cp -r backup_entries/* ./data/entries/
cp -r backup_attachments/* ./data/attachments/

# Restart Poznote
docker compose up -d
```

**Restore database from SQL**
```bash
# Import SQL backup into database
docker compose exec -T database mysql -u root -psfs466!sfdgGH poznote_db < backup.sql
```

## 🔌 API

Poznote provides a RESTful API for programmatic access to your notes.

### Authentication

All API requests require authentication using the same credentials configured in your `.env` file.

### Available Endpoints

#### List Notes
```bash
curl -u username:password http://localhost:8040/api_list_notes.php
```

#### Create Note
```bash
curl -X POST http://localhost:8040/api_create_note.php \
  -u username:password \
  -H "Content-Type: application/json" \
  -d '{"heading": "My Note", "tags": "personal,important"}'
```

#### More Endpoints
- `api_favorites.php` - Manage favorite notes
- `api_attachments.php` - Handle file attachments
