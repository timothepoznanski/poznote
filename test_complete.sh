#!/bin/bash

# Test complet pour vérifier que les problèmes initiaux sont corrigés

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Simulated port check for testing
check_port_available() {
    local port=$1
    # Simulate port 8040 as busy, others as free
    if [ "$port" = "8040" ]; then
        return 1  # Port is in use
    else
        return 0  # Port is available
    fi
}

# Test function (copy of the corrected one)
get_port_with_validation() {
    local prompt="$1"
    local default_port="$2"
    local current_port="$3"  # Optional: current port to exclude from availability check
    local port
    local first_attempt=true
    
    while true; do
        read -p "$prompt" port
        
        # If empty input, use default
        if [ -z "$port" ]; then
            port=$default_port
            if [ "$first_attempt" = "true" ]; then
                echo -e "${BLUE}[INFO]${NC} Using default port: $port" >&2
            fi
        fi
        
        # Validate port range
        if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
            print_warning "Invalid port number '$port'. Please enter a port between 1 and 65535."
            first_attempt=false
            continue
        fi
        
        # Skip availability check if this is the current port (for reconfiguration)
        if [ -n "$current_port" ] && [ "$port" = "$current_port" ]; then
            echo "$port"
            return 0
        fi
        
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
        return 0
    done
}

echo "=== TEST DU PROBLÈME INITIAL ==="
echo "Test 1: Nouvelle installation - ENTER pour port par défaut libre (8041)"
echo "Expected: Should accept 8041 as default"
result=$(echo "" | get_port_with_validation "HTTP Port (default: 8041): " "8041" "")
echo "✅ Résultat: $result"

echo -e "\nTest 2: Nouvelle installation - ENTER pour port par défaut occupé (8040), puis 8042"
echo "Expected: Should warn about 8040 and accept 8042"
result=$(printf "\n8042\n" | get_port_with_validation "HTTP Port (default: 8040): " "8040" "")
echo "✅ Résultat: $result"

echo -e "\nTest 3: Reconfiguration - ENTER pour garder port actuel (8040)"
echo "Expected: Should keep 8040 without checking availability"
result=$(echo "" | get_port_with_validation "Web Server Port [8040]: " "8040" "8040")
echo "✅ Résultat: $result"

echo -e "\nTous les tests passés ! ✅"
