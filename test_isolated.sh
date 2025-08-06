#!/bin/bash

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check if port is already in use (simplified for test)
check_port_available() {
    local port=$1
    # For test, assume port 8040 is "in use" to test the logic
    if [ "$port" = "8040" ]; then
        return 1  # Port is in use
    else
        return 0  # Port is available
    fi
}

# Test function
get_port_with_validation() {
    local prompt="$1"
    local default_port="$2"
    local current_port="$3"  # Optional: current port to exclude from availability check
    local port
    local first_attempt=true
    
    echo "DEBUG: Testing with prompt='$prompt', default_port='$default_port', current_port='$current_port'"
    
    while true; do
        read -p "$prompt" port
        
        # If empty input, use default
        if [ -z "$port" ]; then
            port=$default_port
            if [ "$first_attempt" = "true" ]; then
                echo -e "${BLUE}[INFO]${NC} Using default port: $port" >&2
            fi
        fi
        
        echo "DEBUG: port after input='$port'"
        
        # Validate port range
        if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
            print_warning "Invalid port number '$port'. Please enter a port between 1 and 65535."
            first_attempt=false
            continue
        fi
        
        # Skip availability check if this is the current port (for reconfiguration)
        if [ -n "$current_port" ] && [ "$port" = "$current_port" ]; then
            echo "DEBUG: Skipping availability check because port=$port equals current_port=$current_port"
            echo "$port"
            return 0
        fi
        
        echo "DEBUG: Checking port availability for port $port"
        # Check if port is available
        if ! check_port_available "$port"; then
            if [ "$port" = "$default_port" ] && [ "$first_attempt" = "true" ]; then
                echo -e "${YELLOW}[WARNING]${NC} Default port $port is already in use on this server." >&2
            else
                echo -e "${YELLOW}[WARNING]${NC} Port $port is already in use." >&2
            fi
            echo -e "${BLUE}[INFO]${NC} Please choose a different port (e.g., 8041, 8042, 8043)." >&2
            first_attempt=false
            continue
        fi
        
        echo "$port"
        return 0
    done
}

echo "=== Test 1: Reconfiguration - garder le port actuel 8040 ==="
echo "Simulation: user appuie ENTER"
result=$(echo "" | get_port_with_validation "Web Server Port [8040]: " "8040" "8040")
echo "Résultat: $result"
echo "✅ Test terminé sans boucle !"

echo -e "\n=== Test 2: Nouvelle installation - port 8040 occupé ==="
echo "Simulation: user appuie ENTER puis tape 8041"
result=$(printf "\n8041\n" | get_port_with_validation "HTTP Port (default: 8040): " "8040" "")
echo "Résultat: $result"
echo "✅ Test terminé !"
