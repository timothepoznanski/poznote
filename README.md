# Poznote

I created Poznote as a effective, self-hosted, open-source, full-responsive, note-taking tool with powerful search and full control over your data. 🤩

Poznote runs in Docker and works seamlessly on both Windows and Linux. The interface is fully responsive across all devices.

## Installation & Updates

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
- **Security**: Poznote password (⚠️ change from default `admin123`!)
- **Overwrite existing files**: Interactive prompts for any conflicts

*Note: Database configuration automatically creates a dedicated `poznote_user` for secure access to the MySQL database - no additional database configuration is needed.*

### Prerequisites

**For Linux/macOS:**
- Docker Engine and Docker Compose
- Bash shell
- `sudo` access (for file permissions)

**For Windows:**
- Docker Desktop for Windows
- PowerShell 5.1 or later

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

### Access

Open your web browser and visit: `http://YOUR_SERVER_NAME:8040`

You'll be prompted to login with the default password: `admin123`

## Troubleshooting

### Common Issues

**Database connection errors on first start:**
```bash
BDD connection error : Connection refused
```
- **Solution**: Wait a few seconds for the database to initialize, then refresh the page

**Permission errors when saving notes:**
- **Solution**: Fix file permissions:
```bash
sudo chown -R www-data:www-data ../ENTRIES_DATA ../ATTACHMENTS_DATA
```

**Port already in use:**
- **Solution**: Edit your `.env` file to use different ports

### Docker Not Found
- **Linux**: Install Docker Engine and Docker Compose
- **macOS**: Install Docker Desktop for Mac  
- **Windows**: Install Docker Desktop for Windows

### Post-Installation Management

**Common Docker commands:**
```bash
# Stop Poznote
docker compose down

# Start Poznote  
docker compose up -d

# View logs
docker compose logs -f

# Restart services
docker compose restart
```

## Security & Production

### Important Security Notes
1. **Change Default Password**: Always change `admin123` to a strong password
2. **Use HTTPS**: Configure a reverse proxy with SSL/TLS for production
3. **Firewall**: Restrict access to ports if not using a reverse proxy
4. **Regular Updates**: Keep Docker images updated with `docker compose pull`

### Recommended Production Setup
Consider using a reverse proxy like [Nginx Proxy Manager](https://nginxproxymanager.com) for:
- SSL/TLS certificates (Let's Encrypt)
- Domain mapping
- Additional security layers


## Updates

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

**Manual configuration changes:**

**For basic settings (HTTP_WEBSERVER_PORT, POZNOTE_PASSWORD):**
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

## Export or backup

Poznote provides three types of exports for complete backup coverage. Access all export functions through Settings → "Export/Import Database".

### Export your notes ###

**Web Interface (Recommended)**
- Go to Settings → "Export/Import Database"
- Click "Download Notes (ZIP)" 
- Downloads all notes as HTML files in a ZIP archive with index

**Manual Export (Alternative)**
Get your HTML files directly from the `../ENTRIES_DATA` directory.

### Export your attachments ###

**Web Interface (Recommended)**
- Go to Settings → "Export/Import Database"
- Click "Download Attachments (ZIP)"
- Downloads all attachment files in a ZIP archive with index

**Manual Export (Alternative)**  
Get your attachment files directly from the `../ATTACHMENTS_DATA` directory.

### Export your database ###

**Web Interface (Recommended)**
- Go to Settings → "Export/Import Database" 
- Click "Download Database (SQL)"
- Downloads database structure as `poznote_export_YYYY-MM-DD_HH-MM-SS.sql`

**Features:**
- **Real-time generation**: No server storage required
- **Complete structure**: Includes tables, data, routines, and triggers
- **Security**: Only authenticated users can access
- **Format**: Standard SQL dump compatible with MySQL

**Manual Export (Alternative)**

Create temporarily another container to create a dump where you run the command:

```bash
docker run --rm --network container:dbserverpoznote -e MYSQL_PWD=mysqrootpassword mysql:latest mysqldump -h127.0.0.1 -uroot poznote_db > dump.sql
```

## Import or restore

Poznote provides web-based import functionality for easy restoration. Access all import functions through Settings → "Export/Import Database".

**Complete Restoration**: For a full application restore, you need all three components: Notes, Attachments, and Database.

### Import your notes ### 

**Web Interface (Recommended)**
1. Go to Settings → "Export/Import Database"
2. In "Import Notes" section, select your ZIP file containing HTML notes
3. Click "Import Notes (ZIP)"
4. All HTML files will be extracted to the notes directory automatically

**Manual Import (Alternative)**
Copy all your HTML files to `../ENTRIES_DATA` directory and ensure proper ownership:
```bash
sudo chown -R www-data:www-data ../ENTRIES_DATA
```

### Import your attachments ### 

**Web Interface (Recommended)**
1. Go to Settings → "Export/Import Database"
2. In "Import Attachments" section, select your ZIP file containing attachments
3. Click "Import Attachments (ZIP)"
4. All files will be extracted to the attachments directory automatically

**Manual Import (Alternative)**
Copy all your attachment files to `../ATTACHMENTS_DATA` directory and ensure proper ownership:
```bash
sudo chown -R www-data:www-data ../ATTACHMENTS_DATA
```

### Import your database ### 

**Web Interface (Recommended)**
1. Go to Settings → "Export/Import Database"
2. In "Import Database" section, select your SQL file
3. Click "Import Database" 
4. ⚠️ **Warning**: This completely replaces your current database

**Security & Technical Notes:**
- ZIP files are validated and safely extracted
- HTML files are filtered during notes import
- SQL files are verified before database import
- Proper file permissions are set automatically
- Temporary files are cleaned up after processing
- No temporary files kept on server after use

**Manual Import (Alternative)**

Copy your dump into the docker instance:

```
$ docker cp dump.sql dbserverpoznote:/tmp/dump.sql
```

Enter your database docker instance and import your dump :

```
$ docker exec -it dbserverpoznote bash
bash-5.1# mysql -u root -pmysqlrootpassword poznote_db < /tmp/dump.sql
```



## API

### List notes

- **URL**: `/api_list_notes.php`
- **Method**: `GET`
- **Response**:
    ```json
    [
      {
        "id": 1,
        "heading": "Title",
        "tags": "tag1,tag2",
        "updated": "2025-07-14 20:00:00"
      }
    ]
    ```

### Create a note

- **URL**: `/api_create_note.php`
- **Method**: `POST`
- **Body (JSON)**:
    ```json
    {
      "heading": "Note title",
      "tags": "tag1,tag2"
    }
    ```
- **Response (success)**:
    ```json
    { "success": true, "id": 2 }
    ```
- **Response (error)**:
    ```json
    { "error": "The heading field is required" }
    ```

### Example curl

```bash
curl -X POST http://YOUR_SERVER_NAME:8040/api_create_note.php \
  -H "Content-Type: application/json" \
  -d '{"heading": "My new note", "tags": "personal,important"}'
```
