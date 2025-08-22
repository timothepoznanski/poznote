#!/bin/bash

# Poznote Quick Installer
# This script handles the complete installation workflow including
# instance naming, conflict checking, and repository cloning

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if Docker is available (basic check)
check_docker_basic() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running or not accessible. Please start Docker or check permissions."
        exit 1
    fi
}

# Check for existing Docker containers that might conflict
check_docker_conflicts() {
    local project_name="$1"
    local container_name="${project_name}-webserver-1"
    
    # Check if container with same name exists
    if docker ps -a --format "{{.Names}}" | grep -q "^${container_name}$"; then
        return 1  # Conflict exists
    fi
    
    return 0  # No conflict
}

# Get and validate instance name with conflict checking
get_instance_name() {
    local instance_name
    
    print_status "🚀 Welcome to Poznote installer!"
    print_status ""
    print_status "Choose a unique name for this Poznote instance."
    print_status "This will be used for the folder name and Docker containers."
    print_status "Examples: poznote, poznote-work, poznote-prod, my-notes"
    print_status ""
    
    while true; do
        read -p "Instance name [poznote]: " instance_name
        instance_name=${instance_name:-poznote}
        
        # Validate name format (alphanumeric, hyphens, underscores)
        if ! [[ "$instance_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
            print_warning "Instance name can only contain letters, numbers, hyphens, and underscores."
            continue
        fi
        
        # Check if directory already exists
        if [ -d "$instance_name" ]; then
            print_warning "Directory '$instance_name' already exists."
            read -p "Do you want to use a different name? (y/N): " choice
            case $choice in
                [yY]|[yY][eE][sS]) continue ;;
                *) 
                    print_status "Will use existing directory and update/reinstall."
                    break
                    ;;
            esac
        fi
        
        # Check for Docker conflicts
        if ! check_docker_conflicts "$instance_name"; then
            print_warning "Docker container '${instance_name}-webserver-1' already exists."
            print_status "You can:"
            print_status "  1. Choose a different instance name"
            print_status "  2. Continue anyway (may cause conflicts)"
            print_status "  3. Remove existing container first: docker rm -f ${instance_name}-webserver-1"
            read -p "Choose different name? (Y/n): " choice
            case $choice in
                [nN]|[nN][oO]) 
                    print_warning "Proceeding with potential conflicts..."
                    break 
                    ;;
                *) continue ;;
            esac
        fi
        
        # All checks passed
        print_success "Instance name '$instance_name' is available!"
        break
    done
    
    echo "$instance_name"
}

# Main installation workflow
main() {
    print_status "🔍 Checking Docker availability..."
    check_docker_basic
    
    # Get instance name with all validations
    instance_name=$(get_instance_name)
    
    print_status ""
    print_status "📥 Installing Poznote instance: '$instance_name'"
    
    # Clone or update repository
    if [ -d "$instance_name" ]; then
        print_status "📂 Using existing directory '$instance_name'"
        cd "$instance_name"
        
        # Check if it's a git repository
        if [ -d ".git" ]; then
            print_status "🔄 Updating existing installation..."
            git pull origin main || print_warning "Failed to update repository"
        else
            print_error "Directory exists but is not a git repository"
            exit 1
        fi
    else
        print_status "📥 Cloning Poznote repository..."
        git clone https://github.com/timothepoznanski/poznote.git "$instance_name"
        cd "$instance_name"
    fi
    
    # Make setup script executable
    chmod +x setup.sh
    
    print_status ""
    print_success "✅ Repository ready! Starting setup..."
    print_status ""
    
    # Run the setup script with the instance name pre-configured
    export POZNOTE_INSTANCE_NAME="$instance_name"
    ./setup.sh
}

# Run main function
main "$@"
