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

# Show help
function Show-Help {
    Write-Host @"
Poznote Setup Script for Windows

USAGE:
    .\setup.ps1         Interactive installation/update
    .\setup.ps1 -Help   Show this help

REQUIREMENTS:
    - Docker Desktop for Windows

"@ -ForegroundColor $Colors.White
}

# Test Docker
function Test-Docker {
    Write-Status "Checking Docker..."
    try {
        $null = docker ps 2>$null
        Write-Success "Docker is running"
    } catch {
        Write-Error "Docker may not be installed or running. Please check Docker Desktop and rerun this setup script."
        exit 1
    }
}

# Check for existing containers
function Test-ExistingContainers {
    $instanceName = Split-Path -Leaf (Get-Location)
    $existingContainers = docker ps -a --format "{{.Names}}" | Where-Object { $_ -match "^$instanceName-" }
    
    if ($existingContainers) {
        Write-Warning "Container with name '$instanceName' already exists!"
        Write-Status "Existing containers:"
        docker ps -a --format "table {{.Names}}`t{{.Status}}" | Where-Object { $_ -match "^$instanceName-" }
        Write-Host ""
        $continue = Read-Host "Do you want to continue anyway? (y/N)"
        if ($continue -notmatch "^[Yy]$") {
            Write-Status "Installation cancelled."
            exit 0
        }
    }
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
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
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
    
    Write-Status "Starting Poznote with Docker Compose..."
    
    try {
        if ($InstanceName) {
            $output = docker compose -p $InstanceName up -d --build 2>&1
        } else {
            $output = docker compose up -d --build 2>&1
        }
        
        # Wait for containers to start
        Write-Status "Waiting for services to start..."
        Start-Sleep -Seconds 15
        
        # Check if containers are running
        if ($InstanceName) {
            $status = docker compose -p $InstanceName ps 2>$null
        } else {
            $status = docker compose ps 2>$null
        }
        
        if ($status -match "Up") {
            Write-Success "Poznote started successfully!"
            return $true
        } else {
            Write-Error "Failed to start Poznote containers"
            Write-Host "Container status:" -ForegroundColor $Colors.Gray
            Write-Host $status -ForegroundColor $Colors.Gray
            Write-Host "Docker output:" -ForegroundColor $Colors.Gray
            Write-Host $output -ForegroundColor $Colors.Gray
            return $false
        }
    }
    catch {
        Write-Error "Docker command failed: $($_.Exception.Message)"
        if ($output) {
            Write-Host "Docker output:" -ForegroundColor $Colors.Gray
            Write-Host $output -ForegroundColor $Colors.Gray
        }
        return $false
    }
}

# Update containers
function Update-DockerContainers {
    param([string]$InstanceName)
    
    Write-Status "Stopping existing containers..."
    if ($InstanceName) {
        docker compose -p $InstanceName down 2>&1 | Out-Null
    } else {
        docker compose down 2>&1 | Out-Null
    }
    
    Write-Status "Pulling latest images..."
    if ($InstanceName) {
        docker compose -p $InstanceName pull 2>&1 | Out-Null
    } else {
        docker compose pull 2>&1 | Out-Null
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
    Write-Host "Poznote Installation" -ForegroundColor $Colors.Blue
    Write-Host ""
    
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
        Write-Host ""
        Write-Host "Access your Poznote instance at: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "http://localhost:$port" -ForegroundColor $Colors.Green
        Write-Host "Username: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$username" -ForegroundColor $Colors.Yellow
        Write-Host "Password: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "$password" -ForegroundColor $Colors.Yellow
        Write-Host ""
    } else {
        Write-Error "Installation failed. Please check Docker Desktop is running and try again."
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
    Write-Host ""
    Write-Host "Current configuration:" -ForegroundColor $Colors.Blue
    Write-Host "  - URL: http://localhost:$($config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    Write-Host "  - Username: $($config['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
    Write-Host "  - Password: $($config['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
    Write-Host ""
    
    $instanceName = Split-Path -Leaf (Get-Location)
    
    if (-not (Update-Code)) {
        Write-Error "Failed to update code"
        exit 1
    }
    
    Write-Status "Preserving existing configuration..."
    
    if (Update-DockerContainers -InstanceName $instanceName) {
        Write-Host ""
        Write-Success "Poznote has been updated successfully!"
        Write-Host ""
        Write-Host "Access your instance at: " -NoNewline -ForegroundColor $Colors.Blue
        Write-Host "http://localhost:$($config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.Green
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
    
    Write-Host "Poznote Configuration Update" -ForegroundColor $Colors.Blue
    Write-Host ""
    Write-Host "Current configuration:" -ForegroundColor $Colors.Blue
    Write-Host "  - Username: $($config['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
    Write-Host "  - Password: $($config['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
    Write-Host "  - Port: $($config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
    Write-Host ""
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
    
    # Restart containers with new configuration
    $instanceName = Split-Path -Leaf (Get-Location)
    Write-Status "Restarting containers with new configuration..."
    
    try {
        # Stop containers
        if ($instanceName) {
            docker compose -p $instanceName down 2>&1 | Out-Null
        } else {
            docker compose down 2>&1 | Out-Null
        }
        
        Start-Sleep -Seconds 5
        
        # Start with new configuration
        if (Start-DockerContainers -InstanceName $instanceName) {
            Write-Host ""
            Write-Success "Configuration updated successfully!"
            Write-Host ""
            Write-Host "Access your instance at: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "http://localhost:$port" -ForegroundColor $Colors.Green
            Write-Host "Username: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$username" -ForegroundColor $Colors.Yellow
            Write-Host "Password: " -NoNewline -ForegroundColor $Colors.Blue
            Write-Host "$password" -ForegroundColor $Colors.Yellow
            Write-Host ""
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
    Test-Docker
    Test-ExistingContainers
    
    if (Test-ExistingInstallation) {
        $config = Get-ExistingConfig
        Write-Host "Poznote Installation Manager" -ForegroundColor $Colors.Blue
        
        # Check if configuration is valid
        if ($config.Count -gt 0 -and $config['HTTP_WEB_PORT'] -and $config['POZNOTE_USERNAME'] -and $config['POZNOTE_PASSWORD']) {
            Write-Host ""
            Write-Host "Current configuration:" -ForegroundColor $Colors.Blue
            Write-Host ""
            Write-Host "  - URL: http://localhost:$($config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
            Write-Host "  - Username: $($config['POZNOTE_USERNAME'])" -ForegroundColor $Colors.White
            Write-Host "  - Password: $($config['POZNOTE_PASSWORD'])" -ForegroundColor $Colors.White
            Write-Host "  - Port: $($config['HTTP_WEB_PORT'])" -ForegroundColor $Colors.White
            
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