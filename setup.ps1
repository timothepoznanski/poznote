# Poznote Setup Script for Windows (PowerShell)
# This script automates the installation and update process for Poznote

param(
    [switch]$Help,
    [switch]$Dev
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Colors for output
$Colors = @{
    Red    = "Red"
    Green  = "Green"
    Yellow = "Yellow"
    Blue   = "Blue"
    White  = "White"
    Gray   = "Gray"
}

# Print colored output functions
function Write-Status {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red
}

# Help function
function Show-Help {
    Write-Host @"
Poznote Setup Script for Windows

USAGE:
    .\setup.ps1 [OPTIONS]

OPTIONS:
    -Help        Show this help message
    -Dev         Use development template (.env.dev.template)

EXAMPLES:
    .\setup.ps1                   # Interactive menu for installation, update, or configuration
    .\setup.ps1 -Dev             # Use development configuration

FEATURES:
    • Automatic detection of existing installations
    • Interactive menu with options:
      - New installation (fresh setup)
      - Update application (pull latest code)
      - Change configuration (password/port)
    • Smart backup creation during configuration changes
    • Configuration preservation during updates

REQUIREMENTS:
    - Docker Desktop for Windows
    - PowerShell 5.1 or later

"@ -ForegroundColor $Colors.White
}

# Check if Docker is installed and running
function Test-Docker {
    try {
        # Check if Docker command exists
        $dockerVersion = docker --version 2>$null
        if (-not $dockerVersion) {
            throw "Docker not found"
        }
        
        # Check if Docker daemon is running
        Write-Status "Checking if Docker is running..."
        $dockerInfo = docker info 2>$null
        if (-not $dockerInfo) {
            Write-Error "Docker is installed but not running."
            Write-Host "Please start Docker Desktop and wait for it to be ready, then run this script again." -ForegroundColor $Colors.Yellow
            Write-Host "You can start Docker Desktop from the Start menu or system tray." -ForegroundColor $Colors.Yellow
            Write-Host "Make sure Docker Desktop shows 'Engine running' status before retrying." -ForegroundColor $Colors.Yellow
            return $false
        }
        
        # More robust check: try to actually use Docker
        Write-Status "Verifying Docker functionality..."
        $testOutput = docker ps 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker daemon is not responding properly."
            Write-Host "Docker output: $testOutput" -ForegroundColor $Colors.Red
            Write-Host "Please make sure Docker Desktop is fully started and try again." -ForegroundColor $Colors.Yellow
            return $false
        }
        
        # Check Docker Compose
        $composeVersion = docker compose version 2>$null
        if (-not $composeVersion) {
            # Try legacy docker-compose
            $composeVersion = docker-compose --version 2>$null
            if (-not $composeVersion) {
                throw "Docker Compose not found"
            }
        }
        
        # Test Docker Compose functionality
        Write-Status "Verifying Docker Compose functionality..."
        $composeTest = docker compose version 2>&1
        if ($LASTEXITCODE -ne 0) {
            # Try legacy
            $composeTest = docker-compose --version 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Docker Compose is not working properly."
                Write-Host "Compose output: $composeTest" -ForegroundColor $Colors.Red
                return $false
            }
        }
        
        Write-Success "Docker and Docker Compose are installed and running"
        return $true
    }
    catch {
        Write-Error "Docker or Docker Compose is not installed or not accessible."
        Write-Host "Please install Docker Desktop for Windows from: https://docs.docker.com/desktop/windows/" -ForegroundColor $Colors.Yellow
        Write-Host "Make sure Docker Desktop is running before executing this script." -ForegroundColor $Colors.Yellow
        return $false
    }
}

# Check if this is an existing installation
function Test-ExistingInstallation {
    # Don't consider .env.template or .env.dev as indicators of existing installation
    $indicators = @(
        (Test-Path "./data/entries"),
        (Test-Path "./data/attachments"),
        (Test-Path "./data/mysql"),
        ((Test-Path ".env") -and -not ((Test-Path ".env.template") -and ((Get-Content ".env" -Raw) -eq (Get-Content ".env.template" -Raw))))
    )
    
    # If at least 2 indicators are present, consider it an existing installation
    $existingCount = ($indicators | Where-Object { $_ }).Count
    return $existingCount -ge 2
}

# Create backup of existing installation
function Backup-ExistingInstallation {
    $backupDir = "backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
    Write-Status "Creating backup in $backupDir..."
    
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    
    # Backup configuration only (.env file)
    if (Test-Path ".env") {
        Copy-Item ".env" "$backupDir\.env" -Force
        Write-Status "Backed up .env configuration"
    }
    
    Write-Success "Configuration backup created successfully in $backupDir"
    Write-Status "Note: Only configuration (.env) is backed up. Your data remains in place."
    return $backupDir
}

# Load existing environment configuration
function Get-ExistingEnvConfig {
    if (-not (Test-Path ".env")) {
        return @{}
    }
    
    $envVars = @{}
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $envVars[$matches[1]] = $matches[2]
        }
    }
    return $envVars
}

# Update Docker containers
function Update-DockerContainers {
    Write-Status "Stopping existing containers..."
    
    # Try docker compose first, then fallback to docker-compose
    $composeCmd = "docker compose"
    try {
        $output = & docker compose down 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "docker compose down failed, trying docker-compose..."
            $composeCmd = "docker-compose"
            & docker-compose down 2>&1
        }
    }
    catch {
        Write-Warning "docker compose not available, using docker-compose..."
        $composeCmd = "docker-compose"
        & docker-compose down 2>&1
    }
    
    Write-Status "Pulling latest images..."
    try {
        if ($composeCmd -eq "docker compose") {
            $pullOutput = docker compose pull 2>&1
        } else {
            $pullOutput = docker-compose pull 2>&1
        }
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Image pull failed, but continuing with build..."
            Write-Host "Pull output: $pullOutput" -ForegroundColor $Colors.Yellow
        }
    }
    catch {
        Write-Warning "Image pull failed, but continuing with build..."
    }
    
    Write-Status "Building and starting updated containers..."
    try {
        if ($composeCmd -eq "docker compose") {
            $buildOutput = docker compose up -d --build --force-recreate 2>&1
        } else {
            $buildOutput = docker-compose up -d --build --force-recreate 2>&1
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Containers updated successfully!"
            
            # Wait for database to be ready
            Write-Status "Waiting for database to be ready..."
            Start-Sleep -Seconds 15
            
            return $composeCmd
        } else {
            Write-Error "Docker command failed with exit code: $LASTEXITCODE"
            Write-Host "Build output: $buildOutput" -ForegroundColor $Colors.Red
            throw "Failed to update containers: $buildOutput"
        }
    }
    catch {
        Write-Error "Exception during container update: $($_.Exception.Message)"
        throw "Failed to update containers: $($_.Exception.Message)"
    }
}

# Function to prompt for user input with default value
function Get-UserInput {
    param(
        [string]$Prompt,
        [string]$Default
    )
    
    $input = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }
    return $input
}

# Function to reconfigure existing installation
function Reconfigure-Poznote {
    Write-Host @"
=========================================
    Poznote Configuration Update
=========================================
"@ -ForegroundColor $Colors.Blue

    # Check if .env exists
    if (-not (Test-Path ".env")) {
        Write-Error "No existing configuration found (.env file missing)."
        Write-Host "Please run the installation first: .\setup.ps1" -ForegroundColor $Colors.Yellow
        exit 1
    }

    # Load current configuration
    $existingConfig = Get-ExistingEnvConfig
    
    Write-Host "`nCurrent configuration:" -ForegroundColor $Colors.Blue
    Write-Host "  • Web Port: $($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    Write-Host "  • Password: $($existingConfig['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White

    Write-Host "`nUpdate your configuration:`n" -ForegroundColor $Colors.Green

    # Get new values
    $HTTP_WEB_PORT = Get-UserInput "Web Server Port" $existingConfig['HTTP_WEB_PORT']
    $POZNOTE_PASSWORD = Get-UserInput "Poznote Password" $existingConfig['POZNOTE_PASSWORD']

    if ($POZNOTE_PASSWORD -eq "admin123") {
        Write-Warning "You are using the default password! Please change it for production use."
    }

    # Determine which template to use
    $templateFile = ".env.template"
    
    # If we're on dev branch or in a dev environment, prefer dev template
    if (Test-Path ".env.dev.template") {
        $currentBranch = ""
        try {
            $currentBranch = (git branch --show-current 2>$null) | Out-String
            $currentBranch = $currentBranch.Trim()
        }
        catch {
            # Git command failed, continue with default
        }
        
        if ($currentBranch -eq "dev" -or $PWD.Path -like "*dev*" -or $Dev) {
            $templateFile = ".env.dev.template"
            Write-Success "Using development template: $templateFile"
        }
    }

    # Update .env file with new values, using chosen template as base
    if (Test-Path $templateFile) {
        # Copy template and update values
        Copy-Item $templateFile ".env" -Force
        
        # Update the configurable values
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "^POZNOTE_PASSWORD=.*", "POZNOTE_PASSWORD=$POZNOTE_PASSWORD"
        $envContent = $envContent -replace "^HTTP_WEB_PORT=.*", "HTTP_WEB_PORT=$HTTP_WEB_PORT"
        
        $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
        Write-Success "Configuration updated from template successfully!"
    } else {
        # Fallback to manual creation if template doesn't exist
        $newEnvContent = @"
MYSQL_ROOT_PASSWORD=$($existingConfig['MYSQL_ROOT_PASSWORD'])
MYSQL_USER=poznote_user
MYSQL_PASSWORD=$($existingConfig['MYSQL_ROOT_PASSWORD'])
MYSQL_HOST=database
# Database name (fixed for containerized environment)
MYSQL_DATABASE=$($existingConfig['MYSQL_DATABASE'])

# Authentication - Change this password for security
POZNOTE_PASSWORD=$POZNOTE_PASSWORD

# Environment ports and paths
HTTP_WEB_PORT=$HTTP_WEB_PORT
DB_DATA_PATH=$($existingConfig['DB_DATA_PATH'])
ENTRIES_DATA_PATH=$($existingConfig['ENTRIES_DATA_PATH'])
ATTACHMENTS_DATA_PATH=$($existingConfig['ATTACHMENTS_DATA_PATH'])

"@

        $newEnvContent | Out-File -FilePath ".env" -Encoding UTF8
        Write-Success "Configuration updated successfully!"
    }

    # Restart containers with new configuration
    Write-Status "Restarting Poznote with new configuration..."
    
    try {
        # Stop containers first
        Write-Status "Stopping containers..."
        $stopOutput = docker compose down 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Error stopping containers: $stopOutput"
        }
        
        # Start containers with new configuration
        Write-Status "Starting containers with new configuration..."
        $startOutput = docker compose up -d 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Poznote restarted successfully with new configuration!"
            
            Write-Host @"

=========================================
    Configuration Update Complete!
=========================================

"@ -ForegroundColor $Colors.Green
            
            Write-Host "Your Poznote configuration has been updated!" -ForegroundColor $Colors.Green
            Write-Host ""
            Write-Host "Access your Poznote instance at:" -ForegroundColor $Colors.Blue
            Write-Host "  • Web Interface: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "http://localhost:$HTTP_WEB_PORT" -ForegroundColor $Colors.Green
            Write-Host ""
            Write-Host "New login credentials:" -ForegroundColor $Colors.Blue
            Write-Host "  • Password: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$POZNOTE_PASSWORD" -ForegroundColor $Colors.Yellow
        } else {
            Write-Error "Failed to restart Poznote. Error: $output"
            Write-Host "Your backup is available at: $backupDir" -ForegroundColor $Colors.Yellow
            exit 1
        }
    }
    catch {
        Write-Error "Failed to restart Poznote: $($_.Exception.Message)"
        exit 1
    }
}

# Main installation function
function Install-Poznote {
    # Check Docker installation first (before any user input)
    Write-Status "Verifying Docker installation and status..."
    if (-not (Test-Docker)) {
        exit 1
    }
    
    # Check if this is an existing installation
    $isExisting = Test-ExistingInstallation
    
    if ($isExisting) {
        Write-Host @"
=========================================
    Poznote Management Menu
=========================================
"@ -ForegroundColor $Colors.Blue
        
        $existingConfig = Get-ExistingEnvConfig
        
        if ($existingConfig.Count -gt 0) {
            Write-Host "`nCurrent configuration:" -ForegroundColor $Colors.Blue
            Write-Host "  • Web Port: $($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
            Write-Host "  • Password: $($existingConfig['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
        }
        
        Write-Host "`nWhat would you like to do?" -ForegroundColor $Colors.Green
        Write-Host "  1) Update application (pull latest code)" -ForegroundColor $Colors.White
        Write-Host "  2) Change configuration (password/port)" -ForegroundColor $Colors.White
        Write-Host "  3) Cancel" -ForegroundColor $Colors.Gray
        
        do {
            $choice = Read-Host "`nPlease select an option (1-3)"
            switch ($choice) {
                "1" {
                    Write-Status "Starting application update..."
                    # Pull latest changes from Git
                    Write-Status "Pulling latest changes from repository..."
                    try {
                        $gitOutput = git pull origin main 2>&1
                        if ($LASTEXITCODE -eq 0) {
                            Write-Success "Successfully pulled latest changes"
                        } else {
                            Write-Warning "Git pull completed with warnings. Output: $gitOutput"
                        }
                    }
                    catch {
                        Write-Warning "Git pull failed, but continuing with local files. Error: $($_.Exception.Message)"
                    }
                    
                    Write-Status "Preserving existing configuration..."
                    
                    # Update containers (Docker already verified)
                    try {
                        $composeCmd = Update-DockerContainers
                        
                        Write-Host @"

=========================================
    Update Complete!
=========================================

"@ -ForegroundColor $Colors.Green
                        
                        Write-Host "Your Poznote installation has been updated successfully!" -ForegroundColor $Colors.Green
                        Write-Host ""
                        Write-Host "Access your Poznote instance at:" -ForegroundColor $Colors.Blue
                        Write-Host "  • Web Interface: " -NoNewline -ForegroundColor $Colors.Blue
                        Write-Host "http://localhost:$($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
                        Write-Host ""
                        Write-Host "Useful commands:" -ForegroundColor $Colors.Blue
                        Write-Host "  • Stop Poznote:     " -NoNewline -ForegroundColor $Colors.Blue
                        Write-Host "$composeCmd down" -ForegroundColor $Colors.Green
                        Write-Host "  • View logs:     " -NoNewline -ForegroundColor $Colors.Blue
                        Write-Host "$composeCmd logs -f" -ForegroundColor $Colors.Green
                        Write-Host "  • Restart:       " -NoNewline -ForegroundColor $Colors.Blue
                        Write-Host "$composeCmd restart" -ForegroundColor $Colors.Green
                        Write-Host ""
                        Write-Warning "💡 To apply configuration changes:"
                        Write-Host "  1. Edit the .env file with your new values" -ForegroundColor $Colors.Yellow
                        Write-Host "  2. Run: $composeCmd down && $composeCmd up -d --force-recreate" -ForegroundColor $Colors.Yellow
                        Write-Host "  " -ForegroundColor $Colors.Yellow
                        Write-Host "  Or use the setup script option 2 for guided configuration update." -ForegroundColor $Colors.Yellow
                        exit 0
                    }
                    catch {
                        Write-Error "Update failed: $($_.Exception.Message)"
                        exit 1
                    }
                }
                "2" {
                    Reconfigure-Poznote
                    exit 0
                }
                "3" {
                    Write-Status "Operation cancelled."
                    exit 0
                }
                default {
                    Write-Warning "Invalid choice. Please select 1, 2, or 3."
                }
            }
        } while ($true)
        
        return
    }
    
    # New installation mode
    Write-Host @"
=========================================
    Poznote Installation Script
=========================================
"@ -ForegroundColor $Colors.Green

    # Check if .env already exists (Docker already verified)
    if (Test-Path ".env") {
        Write-Warning ".env file already exists!"
        
        $overwrite = Read-Host "Do you want to overwrite it? (y/N)"
        if ($overwrite -notmatch '^[Yy]$') {
            Write-Status "Using existing .env file..."
            $continue = Read-Host "Do you want to continue with Docker setup? (Y/n)"
            if ($continue -match '^[Nn]$') {
                Write-Status "Installation cancelled."
                exit 0
            }
            $skipEnvCreation = $true
        } else {
            Remove-Item ".env" -Force
            Write-Status "Existing .env file removed."
        }
    }
    
    # Create .env file if it doesn't exist or was removed
    if (-not $skipEnvCreation -and -not (Test-Path ".env")) {
        Write-Status "Creating .env configuration file..."
        
        # Check if .env.template exists
        if (-not (Test-Path ".env.template")) {
            Write-Error "Template file .env.template not found!"
            exit 1
        }
        
        # Load default values from template
        $templateConfig = @{}
        Get-Content ".env.template" | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $templateConfig[$matches[1]] = $matches[2]
            }
        }
        
        Write-Host "`nPlease configure your Poznote installation:`n" -ForegroundColor $Colors.Blue
        
        # Prompt for configuration values with template defaults
        $HTTP_WEB_PORT = Get-UserInput "Web Server Port" $templateConfig["HTTP_WEB_PORT"]
        
        # Security settings
        Write-Host "`nSecurity Configuration:" -ForegroundColor $Colors.Yellow
        $POZNOTE_PASSWORD = Get-UserInput "Poznote Password (IMPORTANT: Change from default!)" $templateConfig["POZNOTE_PASSWORD"]
        
        if ($POZNOTE_PASSWORD -eq "admin123") {
            Write-Warning "You are using the default password! Please change it for production use."
        }
        
        Write-Host "`nUsing template configuration for database and paths..." -ForegroundColor $Colors.Blue
        
        # Copy template to .env
        Copy-Item ".env.template" ".env" -Force
        
        # Update the configurable values in the copied file
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "^POZNOTE_PASSWORD=.*", "POZNOTE_PASSWORD=$POZNOTE_PASSWORD"
        $envContent = $envContent -replace "^HTTP_WEB_PORT=.*", "HTTP_WEB_PORT=$HTTP_WEB_PORT"
        
        $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
        Write-Success ".env file created from template successfully!"
    }
    
    # Read .env file to get paths
    if (Test-Path ".env") {
        $envVars = @{}
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $envVars[$matches[1]] = $matches[2]
            }
        }
        
        # Create data directories
        Write-Status "Creating data directories..."
        
        $directories = @(
            $envVars["DB_DATA_PATH"],
            $envVars["ENTRIES_DATA_PATH"],
            $envVars["ATTACHMENTS_DATA_PATH"]
        )
        
        foreach ($dir in $directories) {
            if ($dir -and -not (Test-Path $dir)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }
        }
        
        Write-Success "Data directories created!"
        
        # Note about permissions
        Write-Warning "Note: On Windows with Docker Desktop, file permissions are handled automatically."
        Write-Warning "If you encounter permission issues, ensure Docker Desktop has access to the drives."
    }
    
    # Start Docker containers
    Write-Status "Starting Poznote with Docker Compose..."
    
    # Start Docker containers
    Write-Status "Starting Poznote with Docker Compose..."
    
    $dockerComposeCmd = ""
    $success = $false
    
    try {
        # Try docker compose first (newer syntax)
        Write-Status "Attempting to start with 'docker compose'..."
        $output = docker compose up -d --build 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerComposeCmd = "docker compose"
            $success = $true
        } else {
            Write-Warning "docker compose failed, trying legacy docker-compose..."
        }
    }
    catch {
        Write-Warning "docker compose command failed, trying legacy docker-compose..."
    }
    
    if (-not $success) {
        try {
            # Fallback to legacy docker-compose
            Write-Status "Attempting to start with 'docker-compose'..."
            $output = docker-compose up -d --build 2>&1
            if ($LASTEXITCODE -eq 0) {
                $dockerComposeCmd = "docker-compose"
                $success = $true
            }
        }
        catch {
            $success = $false
        }
    }
    
    if ($success) {
        Write-Success "Poznote has been started successfully!"
        
        Write-Host @"

=========================================
    Installation Complete!
=========================================

"@ -ForegroundColor $Colors.Green
        
        Write-Host "Access your Poznote instance at:" -ForegroundColor $Colors.Blue
        Write-Host "  • Web Interface: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "http://localhost:$($envVars['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
        Write-Host ""
        Write-Host "Login credentials:" -ForegroundColor $Colors.Blue
        Write-Host "  • Password: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$($envVars['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.Yellow
        Write-Host ""
        Write-Host "Important Security Notes:" -ForegroundColor $Colors.Yellow
        Write-Host "  • Change the default password if you haven't already"
        Write-Host "  • Use HTTPS in production"
        Write-Host "  • Consider using a reverse proxy like Nginx Proxy Manager"
        Write-Host ""
        Write-Host "Useful commands:" -ForegroundColor $Colors.Blue
        Write-Host "  • Stop Poznote:     " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$dockerComposeCmd down" -ForegroundColor $Colors.Green
        Write-Host "  • View logs:     " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$dockerComposeCmd logs -f" -ForegroundColor $Colors.Green
        Write-Host "  • Restart:       " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$dockerComposeCmd restart" -ForegroundColor $Colors.Green
        Write-Host ""
        Write-Warning "💡 To apply configuration changes:"
        Write-Host "  1. Edit the .env file with your new values" -ForegroundColor $Colors.Yellow
        Write-Host "  2. Run: $dockerComposeCmd down && $dockerComposeCmd up -d --force-recreate" -ForegroundColor $Colors.Yellow
        Write-Host "  " -ForegroundColor $Colors.Yellow
        Write-Host "  Or use the setup script option 2 for guided configuration update." -ForegroundColor $Colors.Yellow
        Write-Host ""
        Write-Status "Wait a few seconds for the database to initialize before accessing the web interface."
    } else {
        Write-Error "Failed to start Poznote. Please check the error messages above."
        Write-Host "Error Output:" -ForegroundColor $Colors.Red
        Write-Host "$output" -ForegroundColor $Colors.Red
        Write-Host ""
        Write-Host "Common solutions:" -ForegroundColor $Colors.Yellow
        Write-Host "  • Make sure Docker Desktop is running and ready"
        Write-Host "  • Wait for Docker Desktop to fully start (green status in system tray)"
        Write-Host "  • Try running 'docker info' to verify Docker is accessible"
        Write-Host "  • Restart Docker Desktop if needed"
        Write-Host "  • Check that no other services are using the ports (8040, 3306)"
        exit 1
    }
}

# Main execution
if ($Help) {
    Show-Help
    exit 0
}

# Handle Dev parameter
if ($Dev) {
    Write-Status "Development mode enabled - will use .env.dev.template"
}

try {
    Install-Poznote
}
catch {
    Write-Error "Installation failed: $($_.Exception.Message)"
    exit 1
}
