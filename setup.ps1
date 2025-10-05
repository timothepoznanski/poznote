# Poznote Setup Script for Windows (PowerShell)
# Simple and clear installation and update process

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

# Show current configuration
function Show-CurrentConfiguration {
    param($Config)
    
    Write-Host ""
    Write-Host "Current configuration:" -ForegroundColor $Colors.Blue
    Write-Host ""
    Write-Host "  - URL: http://localhost:$($Config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    Write-Host "  - Username: $($Config['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
    Write-Host "  - Password: $($Config['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
    Write-Host "  - Port: $($Config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    Write-Host ""
}

# Show help
function Show-Help {
    Write-Host @"
Poznote Setup Script for Windows

USAGE:
    powershell -ExecutionPolicy Bypass -NoProfile -File ".\setup.ps1"         Interactive installation/update
    powershell -ExecutionPolicy Bypass -NoProfile -File ".\setup.ps1" -Help   Show this help

REQUIREMENTS:
    - Docker Desktop for Windows

"@ -ForegroundColor $Colors.White
}

# Check if existing installation
function Test-ExistingInstallation {
    return Test-Path ".env"
}

# Get user input with default
function Get-UserInput {
    param([string]$Prompt, [string]$Default)
    $input = Read-Host "$Prompt"
    if ([string]::IsNullOrWhiteSpace($input)) { return $Default }
    return $input
}

# Validate password
function Test-Password {
    param([string]$Password)
    if ($Password.Length -lt 8) {
        Write-Warning "Password must be at least 8 characters long."
        return $false
    }
    return $true
}

# Check if port is available
function Test-PortAvailable {
    param([int]$Port)
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        return -not $connections
    } catch {
        return $false
    }
}

# Get valid port
function Get-ValidPort {
    param([string]$Prompt, [string]$Default, [string]$CurrentPort = $null)
    
    while ($true) {
        $portInput = Get-UserInput $Prompt $Default
        $port = 0
        
        if (-not [int]::TryParse($portInput, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
            Write-Warning "Invalid port. Please enter a port between 1 and 65535."
            continue
        }
        
        # Skip check if it's the current port
        if ($CurrentPort -and $port.ToString() -eq $CurrentPort) {
            return $port.ToString()
        }
        
        if (-not (Test-PortAvailable -Port $port)) {
            Write-Warning "Port $port is already in use. Please choose a different port."
            continue
        }
        
        return $port.ToString()
    }
}

# Create .env file
function New-EnvFile {
    param($Username, $Password, $Port)
    
    $envContent = @"
POZNOTE_USERNAME=$Username
POZNOTE_PASSWORD=$Password
HTTP_WEB_PORT=$Port
"@
    
    $envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
    Write-Success ".env file created successfully!"
}

# Load existing config
function Get-ExistingConfig {
    $config = @{}
    if (Test-Path ".env") {
        try {
            Get-Content ".env" | ForEach-Object {
                if ($_ -match "^([^=]+)=(.*)$") {
                    $key = $matches[1].Trim()
                    $value = $matches[2].Trim()
                    if (-not [string]::IsNullOrWhiteSpace($key) -and -not [string]::IsNullOrWhiteSpace($value)) {
                        $config[$key] = $value
                    }
                }
            }
        }
        catch {
            Write-Warning "Could not read .env file properly. It may be corrupted."
        }
    }
    return $config
}

# Start Docker containers
function Start-DockerContainers {
    param([string]$InstanceName)
    
    # Check if port is available before starting
    $config = Get-ExistingConfig
    if ($config['HTTP_WEB_PORT']) {
        $port = [int]$config['HTTP_WEB_PORT']
        Write-Status "Checking if port $port is available..."
        if (-not (Test-PortAvailable -Port $port)) {
            Write-Error "Port $port is already in use. Please check your .env file and choose a different port."
            return $false
        }
        Write-Status "Port $port is available"
    }
    
    Write-Status "Starting Poznote with Docker Compose..."
    
    try {
        Write-Status "Building and starting containers..."
        
        if ($InstanceName) {
            $process = Start-Process -FilePath "docker" -ArgumentList "compose", "-p", $InstanceName, "up", "-d", "--build" -PassThru -Wait -NoNewWindow -RedirectStandardOutput "temp_docker_out.txt" -RedirectStandardError "temp_docker_err.txt"
        } else {
            $process = Start-Process -FilePath "docker" -ArgumentList "compose", "up", "-d", "--build" -PassThru -Wait -NoNewWindow -RedirectStandardOutput "temp_docker_out.txt" -RedirectStandardError "temp_docker_err.txt"
        }
        
        # Capture output
        $stdout = ""
        $stderr = ""
        
        if (Test-Path "temp_docker_out.txt") {
            $stdout = Get-Content "temp_docker_out.txt" -Raw
            Remove-Item "temp_docker_out.txt" -Force
        }
        
        if (Test-Path "temp_docker_err.txt") {
            $stderr = Get-Content "temp_docker_err.txt" -Raw
            Remove-Item "temp_docker_err.txt" -Force
        }
        
        $output = ($stdout + $stderr).Trim()
        
        if ($process.ExitCode -ne 0) {
            Write-Error "Docker compose failed (exit code: $($process.ExitCode))"
            return $false
        }
        
        # Wait for containers to start
        Write-Status "Waiting for services to start..."
        
        $maxAttempts = 60  # Maximum 5 minutes (60 * 5 seconds)
        $attempt = 0
        $containersReady = $false
        
        while ($attempt -lt $maxAttempts -and -not $containersReady) {
            Start-Sleep -Seconds 5
            $attempt++
            
            try {
                if ($InstanceName) {
                    $status = docker compose -p $InstanceName ps 2>$null
                } else {
                    $status = docker compose ps 2>$null
                }
                
                # Check if all containers are running (Up status)
                if ($status -match "Up" -and $status -notmatch "Exit") {
                    # Additional check: make sure web server is responding
                    try {
                        # Try to get the port from .env file
                        $config = Get-ExistingConfig
                        $port = if ($config['HTTP_WEB_PORT']) { $config['HTTP_WEB_PORT'] } else { "8040" }
                        
                        $response = Invoke-WebRequest -Uri "http://localhost:$port" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
                        if ($response.StatusCode -eq 200) {
                            $containersReady = $true
                            Write-Success "Poznote started successfully and is responding!"
                        } else {
                            Write-Host "." -NoNewline -ForegroundColor $Colors.Gray
                        }
                    } catch {
                        Write-Host "." -NoNewline -ForegroundColor $Colors.Gray
                    }
                } else {
                    Write-Host "." -NoNewline -ForegroundColor $Colors.Gray
                }
            } catch {
                Write-Host "." -NoNewline -ForegroundColor $Colors.Gray
            }
        }
        
        Write-Host "" # New line after dots
        
        if ($containersReady) {
            return $true
        } else {
            Write-Error "Failed to start Poznote containers within timeout (5 minutes)"
            
            return $false
        }
    }
    catch {
        # Clean up temp files if they exist
        if (Test-Path "temp_docker_out.txt") { Remove-Item "temp_docker_out.txt" -Force }
        if (Test-Path "temp_docker_err.txt") { Remove-Item "temp_docker_err.txt" -Force }
        
        Write-Error "Failed to execute docker compose: $($_.Exception.Message)"
        return $false
    }
}

# Update containers
function Update-DockerContainers {
    param([string]$InstanceName)
    
    # Check if port is available before updating (only if port changed)
    $config = Get-ExistingConfig
    if ($config['HTTP_WEB_PORT']) {
        $currentPort = [int]$config['HTTP_WEB_PORT']
        # Note: For updates, we assume the current port is OK since it's the same configuration
        # Only check availability if this is a new installation (no existing containers)
        $instanceName = if ($InstanceName) { $InstanceName } else { Split-Path -Leaf (Get-Location) }
        $existingContainer = docker ps -a --format "{{.Names}}" | Where-Object { $_ -match "^$instanceName-webserver-1$" }
        
        if (-not $existingContainer) {
            Write-Status "Checking if port $currentPort is available..."
            if (-not (Test-PortAvailable -Port $currentPort)) {
                Write-Error "Port $currentPort is already in use. Please check your .env file and choose a different port."
                return $false
            }
            Write-Status "Port $currentPort is available"
        }
    }
    
    Write-Status "Stopping existing containers..."
    try {
        if ($InstanceName) {
            $null = Start-Process -FilePath "docker" -ArgumentList "compose", "-p", $InstanceName, "down" -Wait -NoNewWindow
        } else {
            $null = Start-Process -FilePath "docker" -ArgumentList "compose", "down" -Wait -NoNewWindow
        }
    } catch {
        # Continue even if stop fails (containers might not be running)
        Write-Warning "Could not stop containers, continuing anyway..."
    }
    
    Write-Status "Pulling latest images..."
    try {
        if ($InstanceName) {
            $null = Start-Process -FilePath "docker" -ArgumentList "compose", "-p", $InstanceName, "pull" -Wait -NoNewWindow
        } else {
            $null = Start-Process -FilePath "docker" -ArgumentList "compose", "pull" -Wait -NoNewWindow
        }
    } catch {
        # Continue even if pull fails (images might be up to date)
        Write-Warning "Could not pull images, continuing with build..."
    }
    
    Write-Status "Building and starting updated containers..."
    return Start-DockerContainers -InstanceName $InstanceName
}

# Pull latest code
function Update-Code {
    Write-Status "Pulling latest changes from repository..."
    
    # Check git status first
    try {
        $gitStatus = git status --porcelain 2>&1
        if ($gitStatus) {
            Write-Warning "There are uncommitted changes in the repository:"
            Write-Host $gitStatus -ForegroundColor $Colors.Yellow
        }
    } catch {
        # Ignore status check errors
    }
    
    try {
        Write-Status "Executing: git pull origin main"
        
        # Execute git pull and capture both stdout and stderr separately
        $gitProcess = Start-Process -FilePath "git" -ArgumentList "pull", "origin", "main" -PassThru -Wait -NoNewWindow -RedirectStandardOutput "temp_git_out.txt" -RedirectStandardError "temp_git_err.txt"
        
        $stdout = ""
        $stderr = ""
        
        if (Test-Path "temp_git_out.txt") {
            $stdout = Get-Content "temp_git_out.txt" -Raw
            Remove-Item "temp_git_out.txt" -Force
        }
        
        if (Test-Path "temp_git_err.txt") {
            $stderr = Get-Content "temp_git_err.txt" -Raw
            Remove-Item "temp_git_err.txt" -Force
        }
        
        $gitOutput = ($stdout + $stderr).Trim()
        
        if ($gitProcess.ExitCode -eq 0) {
            Write-Success "Successfully pulled latest changes"
            if ($gitOutput) {
                Write-Host "Git output:" -ForegroundColor $Colors.Gray
                Write-Host $gitOutput -ForegroundColor $Colors.Gray
            }
            return $true
        } else {
            Write-Error "Git pull failed (exit code: $($gitProcess.ExitCode))"
            Write-Host "Git output:" -ForegroundColor $Colors.Red
            Write-Host $gitOutput -ForegroundColor $Colors.Gray
            return $false
        }
    } catch {
        # Clean up temp files if they exist
        if (Test-Path "temp_git_out.txt") { Remove-Item "temp_git_out.txt" -Force }
        if (Test-Path "temp_git_err.txt") { Remove-Item "temp_git_err.txt" -Force }
        
        Write-Error "Failed to execute git pull: $($_.Exception.Message)"
        return $false
    }
}

# New installation
function New-Installation {   
    $instanceName = Split-Path -Leaf (Get-Location)
    Write-Status "Using instance name: $instanceName"
    
    Write-Status "Creating .env configuration file..."
    Write-Host ""
    Write-Host "Please configure your Poznote installation:" -ForegroundColor $Colors.Green
    Write-Host ""
    
    # Get configuration
    $username = Get-UserInput "Username [admin]" "admin"
    
    Write-Host ""
    Write-Status "Password requirements:"
    Write-Host " - Minimum 8 characters" -ForegroundColor $Colors.Gray
    Write-Host " - Mix of letters and numbers recommended" -ForegroundColor $Colors.Gray
    Write-Host ""
    
    while ($true) {
        $password = Get-UserInput "Poznote Password [admin123]" "admin123"
        if (Test-Password $password) { break }
    }
    
    $port = Get-ValidPort "Web Server Port [8040]" "8040"
    
    if ($password -eq "admin123") {
        Write-Warning "You are using the default password! Please change it for production use."
    }
    
    # Create configuration
    New-EnvFile -Username $username -Password $password -Port $port
    
    # Create data directories
    Write-Status "Creating data directories..."
    @("data", "data/database", "data/entries", "data/attachments") | ForEach-Object {
        if (-not (Test-Path $_)) { New-Item -Path $_ -ItemType Directory -Force | Out-Null }
    }
    Write-Success "Data directories created"
    
    # Start containers
    if (Start-DockerContainers -InstanceName $instanceName) {
        Write-Host ""
        Write-Success "Poznote has been installed successfully!"
        
        # Show current configuration
        $config = @{
            'HTTP_WEB_PORT' = $port
            'POZNOTE_USERNAME' = $username
            'POZNOTE_PASSWORD' = $password
        }
        Show-CurrentConfiguration -Config $config
        Write-Status "To update Poznote or change settings, run setup script again with :"
        Write-Host ""
        Write-Host "powershell -ExecutionPolicy Bypass -NoProfile -File `".\setup.ps1`""
        Write-Host ""
    } else {
        Write-Error "Installation failed. Please check the error message above for details."
        exit 1
    }
}

# Update existing installation
function Update-Installation {
    $config = Get-ExistingConfig
    
    # Validate configuration
    if (-not $config['HTTP_WEB_PORT'] -or -not $config['POZNOTE_USERNAME'] -or -not $config['POZNOTE_PASSWORD']) {
        Write-Error "Configuration file is incomplete or corrupted. Please run a new installation."
        exit 1
    }
    
    Write-Host "Poznote Update" -ForegroundColor $Colors.Blue
    Show-CurrentConfiguration -Config $config
    
    $instanceName = Split-Path -Leaf (Get-Location)
    
    if (-not (Update-Code)) {
        Write-Error "Failed to update code"
        exit 1
    }
    
    Write-Status "Preserving existing configuration..."
    
    if (Update-DockerContainers -InstanceName $instanceName) {
        Write-Success "Poznote has been updated successfully!"
        Write-Host ""
    } else {
        Write-Error "Update failed. Please check the logs above."
        exit 1
    }
}

# Change settings
function Update-Settings {
    $config = Get-ExistingConfig
    
    # Validate configuration
    if (-not $config['HTTP_WEB_PORT'] -or -not $config['POZNOTE_USERNAME'] -or -not $config['POZNOTE_PASSWORD']) {
        Write-Error "Configuration file is incomplete or corrupted. Please run a new installation."
        exit 1
    }
    
    Show-CurrentConfiguration -Config $config
    Write-Host "Update your configuration:" -ForegroundColor $Colors.Green
    Write-Host ""
    
    # Get new values
    $username = Get-UserInput "Username [$($config['POZNOTE_USERNAME'])]" $config['POZNOTE_USERNAME']
    
    while ($true) {
        $password = Get-UserInput "Password [$($config['POZNOTE_PASSWORD'])]" $config['POZNOTE_PASSWORD']
        if (Test-Password $password) { break }
    }
    
    $port = Get-ValidPort "Web Server Port [$($config['HTTP_WEB_PORT'])]" $config['HTTP_WEB_PORT'] $config['HTTP_WEB_PORT']
    
    # Update configuration
    New-EnvFile -Username $username -Password $password -Port $port
    
    # Check if new port is available before restarting (only if port changed)
    if ($port -ne $config['HTTP_WEB_PORT']) {
        $portInt = [int]$port
        Write-Status "Checking if new port $port is available..."
        if (-not (Test-PortAvailable -Port $portInt)) {
            Write-Error "Port $port is already in use. Please choose a different port."
            exit 1
        }
        Write-Status "Port $port is available"
    } else {
        Write-Status "Using existing port $port (no change)"
    }
    
    # Restart containers with new configuration
    $instanceName = Split-Path -Leaf (Get-Location)
    Write-Status "Restarting containers with new configuration..."
    
    try {
        # Stop containers
        Write-Status "Stopping existing containers..."
        if ($instanceName) {
            $null = Start-Process -FilePath "docker" -ArgumentList "compose", "-p", $instanceName, "down" -Wait -NoNewWindow
        } else {
            $null = Start-Process -FilePath "docker" -ArgumentList "compose", "down" -Wait -NoNewWindow
        }
        
        Start-Sleep -Seconds 5
        
        # Start with new configuration
        if (Start-DockerContainers -InstanceName $instanceName) {
            Write-Host ""
            Write-Success "Configuration updated successfully!"
            
            # Show current configuration
            $config = @{
                'HTTP_WEB_PORT' = $port
                'POZNOTE_USERNAME' = $username
                'POZNOTE_PASSWORD' = $password
            }
            Show-CurrentConfiguration -Config $config
        } else {
            Write-Error "Failed to restart containers with new configuration"
            exit 1
        }
    }
    catch {
        Write-Error "Failed to restart containers: $($_.Exception.Message)"
        exit 1
    }
}

# Main menu for existing installations
function Show-MainMenu {
    while ($true) {
        Write-Host ""
        Write-Host "What would you like to do?" -ForegroundColor $Colors.Green
        Write-Host ""
        Write-Host "  1. Update application (get latest code)" -ForegroundColor $Colors.White
        Write-Host "  2. Change settings (login/password/port)" -ForegroundColor $Colors.White
        Write-Host "  3. Cancel" -ForegroundColor $Colors.Gray
        Write-Host ""
        
        $choice = Read-Host "Please select an option (1-3)"
        
        switch ($choice) {
            "1" { Update-Installation; return }
            "2" { Update-Settings; return }
            "3" { Write-Status "Operation cancelled."; exit 0 }
            default { Write-Warning "Invalid choice. Please select 1, 2, or 3." }
        }
    }
}

# Main execution
if ($Help) { Show-Help; exit 0 }

try {
    if (Test-ExistingInstallation) {
        $config = Get-ExistingConfig
        
        # Check if configuration is valid
        if ($config.Count -gt 0 -and $config['HTTP_WEB_PORT'] -and $config['POZNOTE_USERNAME'] -and $config['POZNOTE_PASSWORD']) {
            Show-CurrentConfiguration -Config $config
            Show-MainMenu
        } else {
            Write-Warning "Existing .env file found but configuration is incomplete or corrupted."
            Write-Status "Starting fresh installation..."
            New-Installation
        }
    } else {
        New-Installation
    }
}
catch {
    Write-Error "Setup failed: $($_.Exception.Message)"
    exit 1
}