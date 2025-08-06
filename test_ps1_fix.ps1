# Test script pour vérifier le fix PowerShell
# Simulation de la fonction corrigée

param([switch]$Test)

# Colors for output
$Colors = @{
    Red = "Red"; Green = "Green"; Yellow = "Yellow"; Blue = "Blue"; White = "White"; Gray = "Gray"
}

function Write-Status { param($Message); Write-Host "[INFO] $Message" -ForegroundColor $Colors.Blue }
function Write-Warning { param($Message); Write-Host "[WARNING] $Message" -ForegroundColor $Colors.Yellow }

function Get-UserInput {
    param([string]$Prompt, [string]$Default)
    
    if ($Default) {
        $displayPrompt = "$Prompt [$Default]: "
    } else {
        $displayPrompt = "$Prompt : "
    }
    
    $input = Read-Host $displayPrompt
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }
    return $input
}

function Test-PortAvailable {
    param([int]$Port)
    # Pour le test, simulons que le port 8045 est occupé
    if ($Port -eq 8045) {
        return $false
    }
    return $true
}

function Get-PortWithValidation {
    param([string]$Prompt, [string]$Default, [string]$CurrentPort = $null)
    
    Write-Host "DEBUG: Prompt='$Prompt', Default='$Default', CurrentPort='$CurrentPort'" -ForegroundColor Gray
    
    while ($true) {
        $portInput = Get-UserInput $Prompt $Default
        
        # Validate port is numeric and in valid range
        $port = 0
        if (-not [int]::TryParse($portInput, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
            Write-Warning "Invalid port number '$portInput'. Please enter a port between 1 and 65535."
            continue
        }
        
        Write-Host "DEBUG: Port after input='$port'" -ForegroundColor Gray
        
        # Skip availability check if this is the current port (for reconfiguration)
        if ($CurrentPort -and $port.ToString() -eq $CurrentPort) {
            Write-Host "DEBUG: Skipping availability check because port=$port equals CurrentPort=$CurrentPort" -ForegroundColor Gray
            return $port.ToString()
        }
        
        Write-Host "DEBUG: Checking port availability for port $port" -ForegroundColor Gray
        # Check if port is available
        if (-not (Test-PortAvailable -Port $port)) {
            Write-Warning "Port $port is already in use. Please choose a different port."
            Write-Status "Tip: For multiple instances on the same server, use different ports (e.g., 8040, 8041, 8042)."
            continue
        }
        
        return $port.ToString()
    }
}

if ($Test) {
    Write-Host "=== Test PowerShell Fix ===" -ForegroundColor Yellow
    Write-Host "Test 1: Reconfiguration - garder le port actuel 8045" -ForegroundColor Yellow
    Write-Host "Simulation: user appuie ENTER pour garder le port 8045" -ForegroundColor Yellow
    
    # Simulation d'un ENTER (entrée vide)
    $result = "" | Get-PortWithValidation "Web Server Port (current: 8045, press Enter to keep or enter new)" "8045" "8045"
    Write-Host "✅ Résultat: $result" -ForegroundColor Green
    Write-Host "Test terminé sans boucle !" -ForegroundColor Green
}
