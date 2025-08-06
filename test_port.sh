#!/bin/bash

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check if port is already in use
check_port_available() {
    local port=$1
    
    if command -v netstat &> /dev/null; then
        if netstat -ln | grep -q ":$port "; then
            return 1  # Port is in use
        else
            return 0  # Port is available
        fi
    elif command -v ss &> /dev/null; then
        if ss -ln | grep -q ":$port "; then
            return 1  # Port is in use
        else
            return 0  # Port is available
        fi
    elif command -v lsof &> /dev/null; then
        if lsof -i :$port &> /dev/null; then
            return 1  # Port is in use
        else
            return 0  # Port is available
        fi
    else
        # If no tools available, assume port is free
        return 0
    fi
}

# Test function
get_port_with_validation() {
    local prompt="$1"
    local default_port="$2"
    local current_port="$3"  # Optional: current port to exclude from availability check
    local port
    local first_attempt=true
    
    echo "DEBUG: prompt='$prompt', default_port='$default_port', current_port='$current_port'"
    
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
            break
        fi
        
        echo "DEBUG: Checking port availability for port $port"
        # Check if port is available - force display to stderr to ensure visibility
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
        break
    done
}

# Test scenario: reconfiguration with current port 8040
echo "=== Test 1: Reconfiguration scenario with current port 8040 ==="
echo "Simulating: user presses ENTER to keep current port 8040"
echo "" | get_port_with_validation "Web Server Port [8040]: " "8040" "8040"

echo -e "\n=== Test 2: New installation scenario ==="
echo "Simulating: user presses ENTER for default port 8040"
echo "" | get_port_with_validation "HTTP Port (default: 8040): " "8040"
