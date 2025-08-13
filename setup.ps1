# Poznote Setup Script for Windows (PowerShell)
# This script automates the installation and update process for Poznote

param([switch]$Help)

$ErrorActionPreference = "Stop"

# Colors for output
$Colors = @{
    Red = "Red"; Green = "Green"; Yellow = "Yellow"; Blue = "Blue"; White = "White"; Gray = "Gray"
}

# Print functions
function Write-Status { param($Message); Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue }
function Write-Success { param($Message); Write-Host "[SUCCESS] $Message" -ForegroundColor $Colors.Green }
function Write-Warning { param($Message); Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow }
function Write-Error { param($Message); Write-Host "[ERROR] $Message" -ForegroundColor $Colors.Red }

# Help function
function Show-Help {
    Write-Host @"
Poznote Setup Script for Windows

USAGE:
    .\setup.ps1 [OPTIONS]

OPTIONS:
    -Help        Show this help message

EXAMPLES:
    .\setup.ps1  Interactive menu for installation, update, or configuration

FEATURES:
    • Automatic detection of existing installations
    • Interactive menu with options:
      - New installation (fresh setup)
      - Update application (get latest code)
      - Change settings (password/port/name/database etc.)
    • Configuration preservation during updates

REQUIREMENTS:
    - Docker Desktop for Windows
    - PowerShell 5.1 or later

"@ -ForegroundColor $Colors.White
}

# Check Docker installation and status
function Test-DockerInstallation {
    try {
        Write-Status "Checking if Docker is installed..."
        $dockerVersion = & docker --version 2>&1
        if ($LASTEXITCODE -ne 0) { 
            Write-Error "Docker is not installed or not accessible."
            Write-Host "Please install Docker Desktop for Windows from: https://docs.docker.com/desktop/windows/" -ForegroundColor $Colors.Yellow
            Write-Host "Error details: $dockerVersion" -ForegroundColor $Colors.Red
            return $false
        }
        Write-Success "Docker is installed: $dockerVersion"
        return $true
    }
    catch {
        Write-Error "Failed to check Docker installation."
        Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor $Colors.Red
        Write-Host "Please install Docker Desktop for Windows from: https://docs.docker.com/desktop/windows/" -ForegroundColor $Colors.Yellow
        return $false
    }
}

function Test-DockerRunning {
    try {
        Write-Status "Checking if Docker Desktop is running..."
        $dockerInfo = & docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker Desktop is not running."
            Write-Host "Please start Docker Desktop and wait for it to be ready, then run this script again." -ForegroundColor $Colors.Yellow
            Write-Host "Docker info error: $dockerInfo" -ForegroundColor $Colors.Red
            return $false
        }
        
        # Verify Docker functionality
        Write-Status "Verifying Docker daemon functionality..."
        $testOutput = & docker ps 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker daemon is not responding properly."
            Write-Host "Please make sure Docker Desktop is fully started and try again." -ForegroundColor $Colors.Yellow
            Write-Host "Docker ps error: $testOutput" -ForegroundColor $Colors.Red
            return $false
        }
        
        Write-Success "Docker Desktop is running and functional"
        return $true
    }
    catch {
        Write-Error "Failed to check Docker Desktop status."
        Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor $Colors.Red
        Write-Host "Please make sure Docker Desktop is running and try again." -ForegroundColor $Colors.Yellow
        return $false
    }
}

function Test-DockerCompose {
    try {
        Write-Status "Checking Docker Compose availability..."
        $composeVersion = & docker compose version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Status "Modern 'docker compose' not found, trying legacy 'docker-compose'..."
            $composeVersion = & docker-compose --version 2>&1
            if ($LASTEXITCODE -ne 0) { 
                Write-Error "Docker Compose is not available."
                Write-Host "Neither 'docker compose' nor 'docker-compose' commands work." -ForegroundColor $Colors.Red
                Write-Host "Please make sure Docker Desktop is properly installed with Compose plugin." -ForegroundColor $Colors.Yellow
                Write-Host "Error details: $composeVersion" -ForegroundColor $Colors.Red
                return $false
            } else {
                Write-Warning "Using legacy docker-compose command"
            }
        }
        Write-Success "Docker Compose is available: $composeVersion"
        return $true
    }
    catch {
        Write-Error "Failed to check Docker Compose."
        Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor $Colors.Red
        Write-Host "Please make sure Docker Desktop is properly installed with Compose plugin." -ForegroundColor $Colors.Yellow
        return $false
    }
}

function Test-Docker {
    Write-Status "Performing Docker environment checks..."
    
    # Check Docker installation
    if (-not (Test-DockerInstallation)) { 
        return $false 
    }
    
    # Check if Docker Desktop is running
    if (-not (Test-DockerRunning)) { 
        return $false 
    }
    
    # Check Docker Compose
    if (-not (Test-DockerCompose)) { 
        return $false 
    }
    
    Write-Success "All Docker components are ready!"
    return $true
}

# Check if this is an existing installation
function Test-ExistingInstallation {
    $indicators = @(
        (Test-Path "./data/entries"),
        (Test-Path "./data/attachments"),
        (Test-Path "./data/mysql"),
        ((Test-Path ".env") -and -not ((Test-Path ".env.template") -and ((Get-Content ".env" -Raw) -eq (Get-Content ".env.template" -Raw))))
    )
    
    $existingCount = ($indicators | Where-Object { $_ }).Count
    return $existingCount -ge 2
}

# Load environment configuration
function Get-ExistingEnvConfig {
    if (-not (Test-Path ".env")) { return @{} }
    
    $envVars = @{}
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $envVars[$matches[1]] = $matches[2]
        }
    }
    return $envVars
}

# Get user input with default value
function Get-UserInput {
    param([string]$Prompt, [string]$Default)
    $input = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($input)) { return $Default }
    return $input
}

# Validate password for security and compatibility
function Test-PasswordSecurity {
    param([string]$Password)
    
    $hasError = $false
    
    # Check minimum length
    if ($Password.Length -lt 8) {
        Write-Warning "Password must be at least 8 characters long."
        $hasError = $true
    }
    
    # Check for forbidden characters
    $forbiddenChars = '[$`"''\\|&;<>(){}[\]~#%=?+ ]'
    if ($Password -match $forbiddenChars) {
        Write-Warning "Password contains forbidden characters."
        $hasError = $true
    }
    
    # Check if password is too simple
    if ($Password -match '^[a-zA-Z]+$' -or $Password -match '^[0-9]+$') {
        Write-Warning "Password should contain a mix of letters and numbers for better security."
        $hasError = $true
    }
    
    # Show rules if there's an error
    if ($hasError) {
        Write-Host ""
        Write-Host "Password requirements:" -ForegroundColor Blue
        Write-Host "  • Minimum 8 characters" -ForegroundColor White
        Write-Host "  • Mix of letters and numbers recommended" -ForegroundColor White
        Write-Host "  • Allowed special characters: @ - _ . , ! *" -ForegroundColor Green
        Write-Host ""
        return $false
    }
    
    return $true
}

# Get password with validation
function Get-SecurePassword {
    param([string]$Prompt, [string]$Default, [bool]$AllowEmpty = $false)
    
    while ($true) {
        $password = Get-UserInput $Prompt $Default
        
        if ([string]::IsNullOrWhiteSpace($password) -and $AllowEmpty) {
            return $Default
        }
        
        if (Test-PasswordSecurity $password) {
            return $password
        }
        
        Write-Host "Please try again with a valid password." -ForegroundColor Yellow
    }
}

# Check if port is already in use
function Test-PortAvailable {
    param([int]$Port)
    try {
        # Use a completely silent method
        $listener = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
        $portInUse = $listener | Where-Object { $_.Port -eq $Port }
        return $null -eq $portInUse
    }
    catch {
        try {
            # Alternative silent method using TcpClient
            $client = New-Object System.Net.Sockets.TcpClient
            $result = $client.BeginConnect("localhost", $Port, $null, $null)
            $success = $result.AsyncWaitHandle.WaitOne(100) -and $client.Connected
            $client.Close()
            return -not $success
        }
        catch {
            # If all else fails, assume port is available
            return $true
        }
    }
}

# Get and validate port with availability check
function Get-PortWithValidation {
    param([string]$Prompt, [string]$Default, [string]$CurrentPort = $null)
    
    while ($true) {
        $portInput = Get-UserInput $Prompt $Default
        
        # Validate port is numeric and in valid range
        $port = 0
        if (-not [int]::TryParse($portInput, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
            Write-Warning "Invalid port number '$portInput'. Please enter a port between 1 and 65535."
            continue
        }
        
        # Skip availability check if this is the current port (for reconfiguration)
        if ($CurrentPort -and $port.ToString() -eq $CurrentPort) {
            return $port.ToString()
        }
        
        # Check if port is available
        if (-not (Test-PortAvailable -Port $port)) {
            Write-Warning "Port $port is already in use. Please choose a different port."
            Write-Status "Tip: For multiple instances on the same server, use different ports (e.g., 8040, 8041, 8042)."
            continue
        }
        
        return $port.ToString()
    }
}

# Manage Docker containers
function Update-DockerContainers {
    Write-Status "Stopping existing containers..."
    
    # Try docker compose, fallback to docker-compose
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
            Write-Status "Waiting for database to be ready..."
            Start-Sleep -Seconds 15
            return $composeCmd
        } else {
            throw "Failed to update containers: $buildOutput"
        }
    }
    catch {
        Write-Error "Exception during container update: $($_.Exception.Message)"
        throw "Failed to update containers: $($_.Exception.Message)"
    }
}

# Reconfigure existing installation
function Reconfigure-Poznote {
    Write-Host @"
=========================================
    Poznote Configuration Update
=========================================
"@ -ForegroundColor $Colors.Blue

    if (-not (Test-Path ".env")) {
        Write-Error "No existing configuration found (.env file missing)."
        Write-Host "Please run the installation first: .\setup.ps1" -ForegroundColor $Colors.Yellow
        exit 1
    }

    $existingConfig = Get-ExistingEnvConfig
    
    Write-Host "`nCurrent configuration:" -ForegroundColor $Colors.Blue
    Write-Host "  • URL: " -NoNewline -ForegroundColor $Colors.White
    Write-Host "http://localhost:$($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
    Write-Host "  • Username: $($existingConfig['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
    Write-Host "  • Password: $($existingConfig['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
    Write-Host "  • Port: $($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    Write-Host "  • Application Name Displayed: $(if ([string]::IsNullOrWhiteSpace($existingConfig['APP_NAME_DISPLAYED'])) { 'Poznote' } else { $existingConfig['APP_NAME_DISPLAYED'] })" -ForegroundColor $Colors.White
    Write-Host "  • MySQL Database: $($existingConfig['MYSQL_DATABASE'])" -ForegroundColor $Colors.White
    Write-Host "  • MySQL User: $($existingConfig['MYSQL_USER'])" -ForegroundColor $Colors.White
    Write-Host "  • MySQL Root Password: $($existingConfig['MYSQL_ROOT_PASSWORD'])" -ForegroundColor $Colors.White
    Write-Host "  • MySQL User Password: $($existingConfig['MYSQL_PASSWORD'])" -ForegroundColor $Colors.White

    Write-Host "`nUpdate your configuration:`n" -ForegroundColor $Colors.Green

    # Get new values
    $POZNOTE_USERNAME = Get-UserInput "Username" $existingConfig['POZNOTE_USERNAME']
    
    Write-Host ""
    Write-Status "Password requirements:"
    Write-Host "  • Minimum 8 characters" -ForegroundColor White
    Write-Host "  • Mix of letters and numbers recommended" -ForegroundColor White
    Write-Host "  • Allowed special characters: @ - _ . , ! *" -ForegroundColor Green
    Write-Host ""
    
    $POZNOTE_PASSWORD = Get-SecurePassword "Poznote Password" $existingConfig['POZNOTE_PASSWORD'] $true
    $HTTP_WEB_PORT = Get-PortWithValidation "Web Server Port (current: $($existingConfig['HTTP_WEB_PORT']), press Enter to keep or enter new)" $existingConfig['HTTP_WEB_PORT'] $existingConfig['HTTP_WEB_PORT']
    $defaultAppName = if ([string]::IsNullOrWhiteSpace($existingConfig['APP_NAME_DISPLAYED'])) { 'Poznote' } else { $existingConfig['APP_NAME_DISPLAYED'] }
    $APP_NAME_DISPLAYED = Get-UserInput "Application Name Displayed" $defaultAppName

    # MySQL Configuration
    Write-Host "`nMySQL Database Configuration:" -ForegroundColor $Colors.Blue
    $MYSQL_ROOT_PASSWORD = Get-UserInput "MySQL Root Password [hidden current value]" $existingConfig['MYSQL_ROOT_PASSWORD']
    $MYSQL_DATABASE = Get-UserInput "MySQL Database Name" $existingConfig['MYSQL_DATABASE']
    $MYSQL_USER = Get-UserInput "MySQL User" $existingConfig['MYSQL_USER']
    $MYSQL_PASSWORD = Get-UserInput "MySQL User Password [hidden current value]" $existingConfig['MYSQL_PASSWORD']

    if ($POZNOTE_PASSWORD -eq "admin123") {
        Write-Warning "You are using the default password! Please change it for production use."
    }

    # Update .env file using template
    if (Test-Path ".env.template") {
        Copy-Item ".env.template" ".env" -Force
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "(?m)^POZNOTE_USERNAME=.*", "POZNOTE_USERNAME=$POZNOTE_USERNAME"
        $envContent = $envContent -replace "(?m)^POZNOTE_PASSWORD=.*", "POZNOTE_PASSWORD=$POZNOTE_PASSWORD"
        $envContent = $envContent -replace "(?m)^HTTP_WEB_PORT=.*", "HTTP_WEB_PORT=$HTTP_WEB_PORT"
        $envContent = $envContent -replace "(?m)^APP_NAME_DISPLAYED=.*", "APP_NAME_DISPLAYED=$APP_NAME_DISPLAYED"
        
        # Update MySQL configuration
        if ($MYSQL_ROOT_PASSWORD) { $envContent = $envContent -replace "(?m)^MYSQL_ROOT_PASSWORD=.*", "MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD" }
        if ($MYSQL_DATABASE) { $envContent = $envContent -replace "(?m)^MYSQL_DATABASE=.*", "MYSQL_DATABASE=$MYSQL_DATABASE" }
        if ($MYSQL_USER) { $envContent = $envContent -replace "(?m)^MYSQL_USER=.*", "MYSQL_USER=$MYSQL_USER" }
        if ($MYSQL_PASSWORD) { $envContent = $envContent -replace "(?m)^MYSQL_PASSWORD=.*", "MYSQL_PASSWORD=$MYSQL_PASSWORD" }
        
        $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
        Write-Success "Configuration updated from template successfully!"
    }

    # Restart containers
    Write-Status "Restarting Poznote with new configuration..."
    
    try {
        $stopOutput = docker compose down 2>&1
        $startOutput = docker compose up -d 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Poznote restarted successfully with new configuration!"
            
            Write-Host @"

=========================================
    Configuration Update Complete!
=========================================

"@ -ForegroundColor $Colors.Green
            
            Write-Host "Your Poznote configuration has been updated!" -ForegroundColor $Colors.Green
            Write-Host "Access your instance at: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "http://localhost:$HTTP_WEB_PORT" -ForegroundColor $Colors.Green
            Write-Host "Username: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$POZNOTE_USERNAME" -ForegroundColor $Colors.Yellow
            Write-Host "Password: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$POZNOTE_PASSWORD" -ForegroundColor $Colors.Yellow
            Write-Host "Application Name Displayed: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$APP_NAME_DISPLAYED" -ForegroundColor $Colors.Yellow
        } else {
            Write-Error "Failed to restart Poznote."
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
    # Check Docker first
    Write-Status "Verifying Docker installation and status..."
    if (-not (Test-Docker)) { exit 1 }
    
    # Check if this is an existing installation
    $isExisting = Test-ExistingInstallation
    
    if ($isExisting) {
        # Existing installation - show menu
        Write-Host @"
=========================================
    Poznote Management Menu
=========================================
"@ -ForegroundColor $Colors.Blue
        
        $existingConfig = Get-ExistingEnvConfig
        
        if ($existingConfig.Count -gt 0) {
            Write-Host "`nCurrent configuration:" -ForegroundColor $Colors.Blue
            Write-Host "  • URL: " -NoNewline -ForegroundColor $Colors.White
            Write-Host "http://localhost:$($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
            Write-Host "  • Username: $($existingConfig['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
            Write-Host "  • Password: $($existingConfig['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
            Write-Host "  • Port: $($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
            Write-Host "  • Application Name Displayed: $(if ([string]::IsNullOrWhiteSpace($existingConfig['APP_NAME_DISPLAYED'])) { 'Poznote' } else { $existingConfig['APP_NAME_DISPLAYED'] })" -ForegroundColor $Colors.White
            Write-Host "  • MySQL Database: $(if ([string]::IsNullOrWhiteSpace($existingConfig['MYSQL_DATABASE'])) { '[default]' } else { $existingConfig['MYSQL_DATABASE'] })" -ForegroundColor $Colors.White
            Write-Host "  • MySQL User: $(if ([string]::IsNullOrWhiteSpace($existingConfig['MYSQL_USER'])) { '[default]' } else { $existingConfig['MYSQL_USER'] })" -ForegroundColor $Colors.White
            Write-Host "  • MySQL Root Password: $(if ([string]::IsNullOrWhiteSpace($existingConfig['MYSQL_ROOT_PASSWORD'])) { '[default]' } else { $existingConfig['MYSQL_ROOT_PASSWORD'] })" -ForegroundColor $Colors.White
            Write-Host "  • MySQL User Password: $(if ([string]::IsNullOrWhiteSpace($existingConfig['MYSQL_PASSWORD'])) { '[default]' } else { $existingConfig['MYSQL_PASSWORD'] })" -ForegroundColor $Colors.White
        }
        
        Write-Host "`nWhat would you like to do?" -ForegroundColor $Colors.Green
        Write-Host "  1) Update application (get latest code)" -ForegroundColor $Colors.White
        Write-Host "  2) Change settings (password/port/name/database etc.)" -ForegroundColor $Colors.White
        Write-Host "  3) Cancel" -ForegroundColor $Colors.Gray
        
        do {
            $choice = Read-Host "`nPlease select an option (1-3)"
            switch ($choice) {
                "1" {
                    Write-Status "Starting application update..."
                    Write-Status "Pulling latest changes from repository..."
                    try {
                        Write-Host ""
                        $gitOutput = git pull origin main
                        Write-Host ""
                        if ($LASTEXITCODE -eq 0) {
                            Write-Success "Successfully pulled latest changes"
                        } else {
                            Write-Warning "Git pull completed with warnings, but continuing..."
                        }
                    }
                    catch {
                        Write-Warning "Git pull failed, but continuing with local files."
                    }
                    
                    Write-Status "Preserving existing configuration..."
                    
                    try {
                        $composeCmd = Update-DockerContainers
                        
                        Write-Host @"

=========================================
    Update Complete!
=========================================

"@ -ForegroundColor $Colors.Green
                        
                        Write-Host "Your Poznote installation has been updated successfully!" -ForegroundColor $Colors.Green
                        Write-Host "Access your instance at: " -NoNewline -ForegroundColor $Colors.Blue
                        Write-Host "http://localhost:$($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
                        Write-Host ""
                        exit 0
                    }
                    catch {
                        Write-Error "Update failed: $($_.Exception.Message)"
                        exit 1
                    }
                }
                "2" { Reconfigure-Poznote; exit 0 }
                "3" { Write-Status "Operation cancelled."; exit 0 }
                default { Write-Warning "Invalid choice. Please select 1, 2, or 3." }
            }
        } while ($true)
        
        return
    }
    
    # Fresh installation
    Write-Host @"
=========================================
    Poznote Installation Script
=========================================
"@ -ForegroundColor $Colors.Green

    # Check if .env already exists
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
    
    # Create .env file if needed
    if (-not $skipEnvCreation -and -not (Test-Path ".env")) {
        Write-Status "Creating .env configuration file..."
        
        if (-not (Test-Path ".env.template")) {
            Write-Error "Template file .env.template not found!"
            exit 1
        }
        
        # Load defaults from template
        $templateConfig = @{}
        Get-Content ".env.template" | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $templateConfig[$matches[1]] = $matches[2]
            }
        }
        
        Write-Host "`nPlease configure your Poznote installation:`n" -ForegroundColor $Colors.Blue
        
        # Get configuration
        $POZNOTE_USERNAME = Get-UserInput "Username" $templateConfig["POZNOTE_USERNAME"]
        
        Write-Host ""
        Write-Status "Password requirements:"
        Write-Host "  • Minimum 8 characters" -ForegroundColor White
        Write-Host "  • Mix of letters and numbers recommended" -ForegroundColor White
        Write-Host "  • Allowed special characters: @ - _ . , ! *" -ForegroundColor Green
        Write-Host ""
        
        $POZNOTE_PASSWORD = Get-SecurePassword "Poznote Password" $templateConfig["POZNOTE_PASSWORD"] $false
        $HTTP_WEB_PORT = Get-PortWithValidation "Web Server Port" $templateConfig["HTTP_WEB_PORT"]
        # Use default value for new installations
        $APP_NAME_DISPLAYED = "Poznote"
        
        if ($POZNOTE_PASSWORD -eq "admin123") {
            Write-Warning "You are using the default password! Please change it for production use."
        }
        
        Write-Host "`nUsing template configuration for database and paths..." -ForegroundColor $Colors.Blue
        
        # Create .env file
        Copy-Item ".env.template" ".env" -Force
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "(?m)^POZNOTE_USERNAME=.*", "POZNOTE_USERNAME=$POZNOTE_USERNAME"
        $envContent = $envContent -replace "(?m)^POZNOTE_PASSWORD=.*", "POZNOTE_PASSWORD=$POZNOTE_PASSWORD"
        $envContent = $envContent -replace "(?m)^HTTP_WEB_PORT=.*", "HTTP_WEB_PORT=$HTTP_WEB_PORT"
        $envContent = $envContent -replace "(?m)^APP_NAME_DISPLAYED=.*", "APP_NAME_DISPLAYED=$APP_NAME_DISPLAYED"
        $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
        Write-Success ".env file created from template successfully!"
    }
    
    # Create data directories
    if (Test-Path ".env") {
        $envVars = @{}
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^([^#][^=]+)=(.*)$') {
                $envVars[$matches[1]] = $matches[2]
            }
        }
        
        Write-Status "Creating data directories..."
        $directories = @($envVars["DB_DATA_PATH"], $envVars["ENTRIES_DATA_PATH"], $envVars["ATTACHMENTS_DATA_PATH"])
        foreach ($dir in $directories) {
            if ($dir -and -not (Test-Path $dir)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }
        }
        Write-Success "Data directories created!"
        Write-Warning "Note: On Windows with Docker Desktop, file permissions are handled automatically."
    }
    
    # Start Docker containers
    Write-Status "Starting Poznote with Docker Compose..."
    
    $dockerComposeCmd = ""
    $success = $false
    
    try {
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
        
        # Use the variables directly instead of reading from file
        $finalUsername = if ($POZNOTE_USERNAME) { $POZNOTE_USERNAME } else { $envVars['POZNOTE_USERNAME'] }
        $finalPassword = if ($POZNOTE_PASSWORD) { $POZNOTE_PASSWORD } else { $envVars['POZNOTE_PASSWORD'] }
        $finalPort = if ($HTTP_WEB_PORT) { $HTTP_WEB_PORT } else { $envVars['HTTP_WEB_PORT'] }
        $finalAppName = if ($APP_NAME_DISPLAYED) { $APP_NAME_DISPLAYED } else { $envVars['APP_NAME_DISPLAYED'] -or 'Poznote' }
        
        Write-Host "Access your Poznote instance at: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "http://localhost:$finalPort" -ForegroundColor $Colors.Green
        Write-Host "Username: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$finalUsername" -ForegroundColor $Colors.Yellow
        Write-Host "Password: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$finalPassword" -ForegroundColor $Colors.Yellow
        Write-Host "Application Name Displayed: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$finalAppName" -ForegroundColor $Colors.Yellow
        Write-Host ""
        Write-Host "To update Poznote, change username/password/port or modify the application name displayed, run:" -ForegroundColor $Colors.Blue
        Write-Host "  .\setup.ps1" -ForegroundColor $Colors.Green
        Write-Host ""
        Write-Host "Configuration tip:" -ForegroundColor $Colors.Blue
        Write-Host "  To customize MySQL database settings (passwords, database name, user), run:" -ForegroundColor $Colors.Yellow
        Write-Host "  .\setup.ps1 and select option 2 (Change configuration)" -ForegroundColor $Colors.Green
        Write-Host ""
        Write-Host "Important Security Notes:" -ForegroundColor $Colors.Yellow
        Write-Host "  • Change the default password if you haven't already"
        Write-Host "  • Use HTTPS in production"
        Write-Host ""
        Write-Status "Wait a few seconds for the database to initialize before accessing the web interface."
    } else {
        Write-Error "Failed to start Poznote. Please check the error messages above."
        Write-Host "Error Output:" -ForegroundColor $Colors.Red
        Write-Host "$output" -ForegroundColor $Colors.Red
        Write-Host ""
        Write-Host "Common solutions:" -ForegroundColor $Colors.Yellow
        Write-Host "  • Make sure Docker Desktop is running and ready"
        Write-Host "  • Try running 'docker info' to verify Docker is accessible"
        Write-Host "  • Restart Docker Desktop if needed"
        Write-Host "  • Check that no other services are using the ports (8040, 3306)"
        exit 1
    }
}

# Main execution
if ($Help) { Show-Help; exit 0 }

try {
    Install-Poznote
}
catch {
    Write-Error "Installation failed: $($_.Exception.Message)"
    exit 1
}
