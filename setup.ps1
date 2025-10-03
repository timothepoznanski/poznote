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
    - Automatic detection of existing installations
    - Interactive menu with options:
      - New installation (fresh setup)
      - Update application (get latest code)
      - Change settings (password/port/name etc.)
    - Configuration preservation during updates

REQUIREMENTS:
    - Docker Desktop for Windows
    - PowerShell 5.1 or later

"@ -ForegroundColor $Colors.White
}









# Check if this is an existing installation
function Test-ExistingInstallation {
    # Installation is detected if .env file exists
    return Test-Path ".env"
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
        Write-Host "  - Minimum 8 characters" -ForegroundColor White
        Write-Host "  - Mix of letters and numbers recommended" -ForegroundColor White
        Write-Host "  - Allowed special characters: @ - _ . , ! *" -ForegroundColor Green
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

# Manage Docker container
function Update-DockerContainer {
    param([string]$ProjectName = $null)
    
    $projectArg = if ($ProjectName) { "-p `"$ProjectName`"" } else { "" }
    Write-Status "Stopping existing container..."
    
    # Try docker compose, fallback to docker-compose
    $composeCmd = "docker compose"
    try {
        if ($ProjectName) {
            $output = & docker compose -p $ProjectName down 2>&1
        } else {
            $output = & docker compose down 2>&1
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "docker compose down failed, trying docker-compose..."
            $composeCmd = "docker-compose"
            if ($ProjectName) {
                & docker-compose -p $ProjectName down 2>&1
            } else {
                & docker-compose down 2>&1
            }
        }
    }
    catch {
        Write-Warning "docker compose not available, using docker-compose..."
        $composeCmd = "docker-compose"
        if ($ProjectName) {
            & docker-compose -p $ProjectName down 2>&1
        } else {
            & docker-compose down 2>&1
        }
    }
    
    Write-Status "Pulling latest images..."
    try {
        if ($composeCmd -eq "docker compose") {
            if ($ProjectName) {
                $pullOutput = docker compose -p $ProjectName pull 2>&1
            } else {
                $pullOutput = docker compose pull 2>&1
            }
        } else {
            if ($ProjectName) {
                $pullOutput = docker-compose -p $ProjectName pull 2>&1
            } else {
                $pullOutput = docker-compose pull 2>&1
            }
        }
    }
    catch {
        Write-Warning "Image pull failed, but continuing with build..."
    }
    
    Write-Status "Building and starting updated container..."
    try {
        if ($composeCmd -eq "docker compose") {
            if ($ProjectName) {
                $buildOutput = docker compose -p $ProjectName up -d --build --force-recreate 2>&1
            } else {
                $buildOutput = docker compose up -d --build --force-recreate 2>&1
            }
        } else {
            if ($ProjectName) {
                $buildOutput = docker-compose -p $ProjectName up -d --build --force-recreate 2>&1
            } else {
                $buildOutput = docker-compose up -d --build --force-recreate 2>&1
            }
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Container updated successfully!"
            return $composeCmd
        } else {
            throw "Failed to update container: $buildOutput"
        }
    }
    catch {
        Write-Error "Exception during container update: $($_.Exception.Message)"
        throw "Failed to update container: $($_.Exception.Message)"
    }
}

# Reconfigure existing installation
function Reconfigure-Poznote {
    Write-Host @"

    Poznote Configuration Update

"@ -ForegroundColor $Colors.Blue

    if (-not (Test-Path ".env")) {
        Write-Error "No existing configuration found (.env file missing)."
        Write-Host "Please run the installation first: .\setup.ps1" -ForegroundColor $Colors.Yellow
        exit 1
    }

    $existingConfig = Get-ExistingEnvConfig
    
    Write-Host "`nCurrent configuration:`n" -ForegroundColor $Colors.Blue
    Write-Host "  - URL: " -NoNewline -ForegroundColor $Colors.White
    Write-Host "http://localhost:$($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
    Write-Host "  - Username: $($existingConfig['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
    Write-Host "  - Password: $($existingConfig['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
    Write-Host "  - Port: $($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    

    Write-Host "`nUpdate your configuration:`n" -ForegroundColor $Colors.Green

    # Get new values
    $POZNOTE_USERNAME = Get-UserInput "Username" $existingConfig['POZNOTE_USERNAME']
    
    Write-Host ""
    Write-Status "Password requirements:"
    Write-Host "  - Minimum 8 characters" -ForegroundColor White
    Write-Host "  - Mix of letters and numbers recommended" -ForegroundColor White
    Write-Host "  - Allowed special characters: @ - _ . , ! *" -ForegroundColor Green
    Write-Host ""
    
    $POZNOTE_PASSWORD = Get-SecurePassword "Poznote Password" $existingConfig['POZNOTE_PASSWORD'] $true
    $HTTP_WEB_PORT = Get-PortWithValidation "Web Server Port (current: $($existingConfig['HTTP_WEB_PORT']), press Enter to keep or enter new)" $existingConfig['HTTP_WEB_PORT'] $existingConfig['HTTP_WEB_PORT']
    

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
    
        
        $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
        Write-Success "Configuration updated from template successfully!"
    }

    # Restart container
    Write-Status "Restarting Poznote with new configuration..."
    
    try {
        $stopOutput = docker compose down 2>&1
        $startOutput = docker compose up -d 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Poznote restarted successfully with new configuration!`n"
            
            Write-Host @"
"@ -ForegroundColor $Colors.Green
            
            Write-Host "Your Poznote configuration has been updated!`n" -ForegroundColor $Colors.Green
            Write-Host "Access your instance at: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "http://localhost:$HTTP_WEB_PORT" -ForegroundColor $Colors.Green
            Write-Host "Username: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$POZNOTE_USERNAME" -ForegroundColor $Colors.Yellow
            Write-Host "Password: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$POZNOTE_PASSWORD" -ForegroundColor $Colors.Yellow
            
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

# Function to install Git pre-commit hook for automatic versioning
function Install-GitHook {
    Write-Status "Installing Git pre-commit hook for automatic versioning..."
    
    try {
        # Create the hook content
        $hookContent = @'
#!/bin/bash

# Pre-commit hook to automatically update version.txt
# This runs locally before each commit

# Get the directory of the repository
REPO_DIR=$(git rev-parse --show-toplevel)

# Generate new version in format YYMMDDHHmm
NEW_VERSION=$(date +%y%m%d%H%M)

# Update version.txt
echo $NEW_VERSION > "$REPO_DIR/src/version.txt"

# Add version.txt to the commit
git add "$REPO_DIR/src/version.txt"

echo "Auto-updated version to: $NEW_VERSION"
'@
        
        # Create the hook file
        $hookContent | Out-File -FilePath ".git/hooks/pre-commit" -Encoding ASCII -NoNewline
        
        Write-Success "Git pre-commit hook installed successfully."
    }
    catch {
        Write-Warning "Could not install Git hook: $($_.Exception.Message)"
    }
}

# Main installation function
function Install-Poznote {
    
    # Check if this is an existing installation
    $isExisting = Test-ExistingInstallation
    
    if ($isExisting) {
        # Existing installation - show menu
        Write-Host "Poznote Installation Manager" -ForegroundColor $Colors.Blue
        
        $existingConfig = Get-ExistingEnvConfig
        
        if ($existingConfig.Count -gt 0) {
            Write-Host "`nCurrent configuration:`n" -ForegroundColor $Colors.Blue
            Write-Host "  - URL: " -NoNewline -ForegroundColor $Colors.White
            Write-Host "http://localhost:$($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
            Write-Host "  - Username: $($existingConfig['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
            Write-Host "  - Password: $($existingConfig['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
            Write-Host "  - Port: $($existingConfig['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
            
        }
        
        Write-Host "`nWhat would you like to do?`n" -ForegroundColor $Colors.Green
    Write-Host "  1. Update application (get latest code)" -ForegroundColor $Colors.White
    Write-Host "  2. Change settings (login/password/port)" -ForegroundColor $Colors.White
    Write-Host "  3. Cancel" -ForegroundColor $Colors.Gray
        
        do {
            $choice = Read-Host "`nPlease select an option (1-3)"
            switch ($choice) {
                "1" {
                    Write-Host ""
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
                        $composeCmd = Update-DockerContainer
                        
                        # Install Git hook for automatic versioning
                        Install-GitHook
                        
                        Write-Host "Update Complete!" -ForegroundColor $Colors.Green
                        
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
    Write-Host "Poznote Installation Script" -ForegroundColor $Colors.Green

    # Get instance name first
    $INSTANCE_NAME = Split-Path -Leaf (Get-Location)
    Write-Status "Using instance name: $INSTANCE_NAME"
    
    # Validate instance name for Docker compatibility
    if ($INSTANCE_NAME -cnotmatch "^[a-z0-9_-]+$") {
        Write-Warning "Instance name '$INSTANCE_NAME' contains invalid characters."
        Write-Host "Docker project names must contain only lowercase letters, numbers, underscores, and hyphens." -ForegroundColor $Colors.Yellow
        Write-Host "Please rename your folder to use only lowercase letters, numbers, _ and - characters." -ForegroundColor $Colors.Yellow
        Write-Host "Example: rename 'MyPoznote' to 'my-poznote' or 'mypoznote'" -ForegroundColor $Colors.Yellow
        Write-Host ""
        Write-Host "If you used the PowerShell command from the README, please use the updated version that validates names before cloning." -ForegroundColor $Colors.Blue
        exit 1
    }
    
    Write-Host ""

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
        Write-Host "  - Minimum 8 characters" -ForegroundColor White
        Write-Host "  - Mix of letters and numbers recommended" -ForegroundColor White
        Write-Host "  - Allowed special characters: @ - _ . , ! *" -ForegroundColor Green
        Write-Host ""
        
        $POZNOTE_PASSWORD = Get-SecurePassword "Poznote Password" $templateConfig["POZNOTE_PASSWORD"] $false
        $HTTP_WEB_PORT = Get-PortWithValidation "Web Server Port" $templateConfig["HTTP_WEB_PORT"]
    
        
        if ($POZNOTE_PASSWORD -eq "admin123") {
            Write-Warning "You are using the default password! Please change it for production use."
        }
        
        # Create .env file
        Copy-Item ".env.template" ".env" -Force
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "(?m)^POZNOTE_USERNAME=.*", "POZNOTE_USERNAME=$POZNOTE_USERNAME"
        $envContent = $envContent -replace "(?m)^POZNOTE_PASSWORD=.*", "POZNOTE_PASSWORD=$POZNOTE_PASSWORD"
        $envContent = $envContent -replace "(?m)^HTTP_WEB_PORT=.*", "HTTP_WEB_PORT=$HTTP_WEB_PORT"
    
        $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
        Write-Success ".env file created from template successfully!"
    }

    # Create necessary directories for fresh installation
    Write-Status "Creating data directories..."
    if (-not (Test-Path "data")) {
        New-Item -ItemType Directory -Path "data" -Force | Out-Null
    }
    if (-not (Test-Path "data\entries")) {
        New-Item -ItemType Directory -Path "data\entries" -Force | Out-Null
    }
    if (-not (Test-Path "data\database")) {
        New-Item -ItemType Directory -Path "data\database" -Force | Out-Null
    }
    if (-not (Test-Path "data\attachments")) {
        New-Item -ItemType Directory -Path "data\attachments" -Force | Out-Null
    }
    Write-Success "Data directories created"

    # Start Docker container
    Write-Status "Starting Poznote with Docker Compose..."
    
    $dockerComposeCmd = ""
    $success = $false
    
    try {
        Write-Status "Attempting to start with 'docker compose'..."
        if ($INSTANCE_NAME) {
            $cmdInfo = "docker compose -p $INSTANCE_NAME up -d --build"
            $output = & docker compose -p $INSTANCE_NAME up -d --build 2>&1
        } else {
            $cmdInfo = "docker compose up -d --build"
            $output = & docker compose up -d --build 2>&1
        }
        if ($LASTEXITCODE -eq 0) {
            $dockerComposeCmd = "docker compose"
            $success = $true
        } else {
            Write-Warning "Command attempted: $cmdInfo"
            Write-Warning "docker compose returned a non-zero exit code. Showing output:"
            Write-Host $output -ForegroundColor $Colors.Red
            Write-Status "Will try legacy 'docker-compose' as a fallback. If that also fails, run 'docker compose up --build' manually to see full logs."
        }
    }
    catch {
        $err = $_.Exception.Message
        Write-Warning "Command attempted: docker compose (via plugin)."
        Write-Warning "docker compose command failed: $err"
        Write-Status "Will try legacy 'docker-compose' as a fallback. If that also fails, run 'docker compose up --build' manually to see full logs."
    }
    
    if (-not $success) {
        try {
            Write-Status "Attempting to start with 'docker-compose' (legacy)..."
            if ($INSTANCE_NAME) {
                $cmdInfoLegacy = "docker-compose -p $INSTANCE_NAME up -d --build"
                $output = & docker-compose -p $INSTANCE_NAME up -d --build 2>&1
            } else {
                $cmdInfoLegacy = "docker-compose up -d --build"
                $output = & docker-compose up -d --build 2>&1
            }
            if ($LASTEXITCODE -eq 0) {
                $dockerComposeCmd = "docker-compose"
                $success = $true
            } else {
                Write-Warning "Command attempted: $cmdInfoLegacy"
                Write-Error "docker-compose returned a non-zero exit code. Showing output:"
                Write-Host $output -ForegroundColor $Colors.Red
                Write-Host "To inspect the error in detail, run one of these commands manually in this folder:" -ForegroundColor $Colors.Yellow
                Write-Host "  docker compose -p $INSTANCE_NAME up --build" -ForegroundColor $Colors.White
                Write-Host "  docker-compose -p $INSTANCE_NAME up --build" -ForegroundColor $Colors.White
            }
        }
        catch {
            $err = $_.Exception.Message
            Write-Warning "Command attempted: docker-compose (legacy)."
            Write-Error "docker-compose command failed: $err"
            $success = $false
        }
    }
    
    # If both compose attempts failed (non-zero exit), try a defensive check:
    # sometimes compose returns warnings/non-zero codes while still starting containers.
    if (-not $success) {
        try {
            Write-Status "Checking if containers are actually running despite non-zero exit codes..."
            if ($INSTANCE_NAME) {
                $psOutput = & docker compose -p $INSTANCE_NAME ps -q 2>$null
                if ($LASTEXITCODE -eq 0 -and $psOutput) {
                    Write-Warning "Compose returned non-zero, but containers are running. Treating as success."
                    $success = $true
                    $dockerComposeCmd = "docker compose"
                    $output = $psOutput
                } else {
                    $psLegacy = & docker-compose -p $INSTANCE_NAME ps -q 2>$null
                    if ($LASTEXITCODE -eq 0 -and $psLegacy) {
                        Write-Warning "Legacy docker-compose returned non-zero, but containers are running. Treating as success."
                        $success = $true
                        $dockerComposeCmd = "docker-compose"
                        $output = $psLegacy
                    }
                }
            } else {
                # No instance name: try a generic docker ps check for poznote containers
                $psGeneric = & docker ps --filter "name=poznote" -q 2>$null
                if ($LASTEXITCODE -eq 0 -and $psGeneric) {
                    Write-Warning "Containers matching 'poznote' are running. Treating as success."
                    $success = $true
                    $output = $psGeneric
                }
            }
        }
        catch {
            # ignore and fall through to original error handling
        }
    }

    if ($success) {
        Write-Success "Poznote has been started successfully!`n"
        
        # Install Git hook for automatic versioning
        Install-GitHook
        
        Write-Host @"
"@ -ForegroundColor $Colors.Green
        
        # Use the variables directly instead of reading from file
        # Fallback to reading from .env if variables are not set
        if (-not $POZNOTE_USERNAME -or -not $POZNOTE_PASSWORD -or -not $HTTP_WEB_PORT) {
            $envVars = Get-ExistingEnvConfig
        }
        
        $finalUsername = if ($POZNOTE_USERNAME) { $POZNOTE_USERNAME } else { $envVars['POZNOTE_USERNAME'] }
        $finalPassword = if ($POZNOTE_PASSWORD) { $POZNOTE_PASSWORD } else { $envVars['POZNOTE_PASSWORD'] }
        $finalPort = if ($HTTP_WEB_PORT) { $HTTP_WEB_PORT } else { $envVars['HTTP_WEB_PORT'] }
    $finalAppName = 'Poznote'
        
        Write-Host "Access your Poznote instance at: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "http://localhost:$finalPort" -ForegroundColor $Colors.Green
        Write-Host "Username: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$finalUsername" -ForegroundColor $Colors.Yellow
        Write-Host "Password: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$finalPassword" -ForegroundColor $Colors.Yellow
    
        Write-Host ""
    } else {
        Write-Error "Failed to start Poznote. Please check the error messages above."
        Write-Host "Error Output:" -ForegroundColor $Colors.Red
        Write-Host "$output" -ForegroundColor $Colors.Red
        Write-Host ""
        Write-Host "Common solutions:" -ForegroundColor $Colors.Yellow
        Write-Host "  - Make sure Docker Desktop is running and ready"
        Write-Host "  - Try running 'docker info' to verify Docker is accessible"
        Write-Host "  - Restart Docker Desktop if needed"
        Write-Host "  - Check that no other services are using the ports (8040, 3306)"
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
