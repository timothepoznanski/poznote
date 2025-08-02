#!/bin/bash

# Poznote Installation and Update Script
# This script can be used for both initial installation and updates

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to show help
show_help() {
    echo "Poznote Setup Script for Linux/macOS"
    echo ""
    echo "USAGE:"
    echo "    ./setup.sh [OPTIONS]"
    echo ""
    echo "OPTIONS:"
    echo "    -h, --help       Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "    ./setup.sh                   # Interactive menu for installation, update, or configuration"
    echo ""
    echo "FEATURES:"
    echo "    • Automatic detection of existing installations"
    echo "    • Interactive menu with options:"
    echo "      - New installation (fresh setup)"
    echo "      - Update application (pull latest code)"
    echo "      - Change configuration (password/port)"
    echo "    • Smart backup creation during configuration changes"
    echo "    • Configuration preservation during updates"
    echo ""
    echo "REQUIREMENTS:"
    echo "    - Docker Engine and Docker Compose"
    echo "    - Bash shell"
    echo "    - sudo access (for file permissions)"
}

# Function to reconfigure existing installation
reconfigure_poznote() {
    echo -e "${BLUE}========================================="
    echo -e "    Poznote Configuration Update"
    echo -e "=========================================${NC}"

    # Check if .env exists
    if [ ! -f ".env" ]; then
        print_error "No existing configuration found (.env file missing)."
        print_warning "Please run the installation first: ./setup.sh"
        exit 1
    fi

    # Load current configuration
    if [ -f ".env" ]; then
        source ".env"
    fi
    
    echo -e "\n${BLUE}Current configuration:${NC}"
    echo -e "  • Web Port: ${HTTP_WEB_PORT}"
    echo -e "  • Password: ${POZNOTE_PASSWORD}"

    echo -e "\n${GREEN}Update your configuration:${NC}\n"

    # Get new values
    read -p "Web Server Port [$HTTP_WEB_PORT]: " NEW_HTTP_WEB_PORT
    NEW_HTTP_WEB_PORT=${NEW_HTTP_WEB_PORT:-$HTTP_WEB_PORT}

    read -p "Poznote Password [$POZNOTE_PASSWORD]: " NEW_POZNOTE_PASSWORD
    NEW_POZNOTE_PASSWORD=${NEW_POZNOTE_PASSWORD:-$POZNOTE_PASSWORD}

    if [ "$NEW_POZNOTE_PASSWORD" = "admin123" ]; then
        print_warning "You are using the default password! Please change it for production use."
    fi

    # Update .env file with new values, preserving everything else
    cat > .env << EOF
MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD
MYSQL_USER=$MYSQL_USER
MYSQL_PASSWORD=$MYSQL_PASSWORD
# Database name (fixed for containerized environment)
MYSQL_DATABASE=$MYSQL_DATABASE

# Authentication - Change this password for security
POZNOTE_PASSWORD=$NEW_POZNOTE_PASSWORD

# Environment ports and paths
HTTP_WEB_PORT=$NEW_HTTP_WEB_PORT
DB_DATA_PATH=$DB_DATA_PATH
ENTRIES_DATA_PATH=$ENTRIES_DATA_PATH
ATTACHMENTS_DATA_PATH=$ATTACHMENTS_DATA_PATH

EOF

    print_success "Configuration updated successfully!"

    # Restart containers with new configuration
    print_status "Restarting Poznote with new configuration..."
    
    # Stop containers first
    print_status "Stopping containers..."
    if docker compose down; then
        print_status "Starting containers with new configuration..."
        if docker compose up -d; then
            print_success "Poznote restarted successfully with new configuration!"
        
            echo -e "\n${GREEN}========================================="
            echo -e "    Configuration Update Complete!"
            echo -e "=========================================${NC}\n"
            
            echo -e "${GREEN}Your Poznote configuration has been updated!${NC}"
            echo ""
            echo -e "${BLUE}Access your Poznote instance at:${NC}"
            echo -e "  • Web Interface: ${GREEN}http://localhost:$NEW_HTTP_WEB_PORT${NC}"
            echo ""
            echo -e "${BLUE}New login credentials:${NC}"
            echo -e "  • Password: ${YELLOW}$NEW_POZNOTE_PASSWORD${NC}"
        else
            print_error "Failed to start Poznote."
            exit 1
        fi
    else
        print_error "Failed to stop Poznote."
        exit 1
    fi
}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker is installed but not running."
        echo "Please start Docker service and try again."
        exit 1
    fi
    
    print_success "Docker is installed and running"
}

# Function to check if Poznote is already installed
check_existing_installation() {
    # Check for indicators of an existing installation
    # Don't consider docker compose.yml or .env.template as indicators
    local indicators=0
    
    [ -d "../ENTRIES_DATA" ] && ((indicators++))
    [ -d "../ATTACHMENTS_DATA" ] && ((indicators++))
    [ -d "../DB_DATA" ] && ((indicators++))
    
    # Only count .env if it's not identical to .env.template
    if [ -f ".env" ] && [ -f ".env.template" ]; then
        if ! cmp -s ".env" ".env.template"; then
            ((indicators++))
        fi
    elif [ -f ".env" ] && [ ! -f ".env.template" ]; then
        ((indicators++))
    fi
    
    # If 2 or more indicators, consider it an existing installation
    [ $indicators -ge 2 ]
}

# Function to backup existing data
backup_data() {
    local backup_dir="backup_$(date +%Y%m%d_%H%M%S)"
    print_status "Creating backup in $backup_dir..."
    
    mkdir -p "$backup_dir"
    
    # Backup .env file only
    if [ -f ".env" ]; then
        cp ".env" "$backup_dir/"
        print_success "Backed up .env configuration"
    fi
    
    print_success "Configuration backup created in $backup_dir"
    print_status "Note: Only configuration (.env) is backed up. Your data remains in place."
    echo "$backup_dir"
}

# Function to load existing environment variables
load_existing_env() {
    if [ -f ".env" ]; then
        print_status "Loading existing configuration..."
        source ".env"
        
        # Use existing values as defaults
        DEFAULT_PASSWORD="$POZNOTE_PASSWORD"
        DEFAULT_PORT="$HTTP_WEB_PORT"
        DEFAULT_DB_PASSWORD="$MYSQL_ROOT_PASSWORD"
        
        print_success "Loaded existing configuration"
    fi
}

# Function to prompt for configuration
configure_poznote() {
    local is_update=$1
    
    if [ "$is_update" = "true" ]; then
        print_status "Current configuration will be preserved. Press Enter to keep current values or enter new ones:"
        echo
    fi
    
    # Get Poznote password
    if [ "$is_update" = "true" ] && [ -n "$DEFAULT_PASSWORD" ]; then
        read -p "Poznote Password (current: [hidden], press Enter to keep): " POZNOTE_PASSWORD
        echo
        POZNOTE_PASSWORD=${POZNOTE_PASSWORD:-$DEFAULT_PASSWORD}
    else
        while [ -z "$POZNOTE_PASSWORD" ]; do
            read -s -p "Enter Poznote Password: " POZNOTE_PASSWORD
            echo
            if [ -z "$POZNOTE_PASSWORD" ]; then
                print_error "Password cannot be empty"
            fi
        done
    fi
    
    # Get HTTP port
    if [ "$is_update" = "true" ] && [ -n "$DEFAULT_PORT" ]; then
        read -p "HTTP Port (current: $DEFAULT_PORT): " HTTP_WEB_PORT
        HTTP_WEB_PORT=${HTTP_WEB_PORT:-$DEFAULT_PORT}
    else
        read -p "HTTP Port (default: 8077): " HTTP_WEB_PORT
        HTTP_WEB_PORT=${HTTP_WEB_PORT:-8077}
    fi
    
    # Validate port
    if ! [[ "$HTTP_WEB_PORT" =~ ^[0-9]+$ ]] || [ "$HTTP_WEB_PORT" -lt 1 ] || [ "$HTTP_WEB_PORT" -gt 65535 ]; then
        print_error "Invalid port number. Using default 8077."
        HTTP_WEB_PORT=8077
    fi
    
    # Get MySQL password (hidden for updates)
    if [ "$is_update" = "true" ] && [ -n "$DEFAULT_DB_PASSWORD" ]; then
        read -s -p "MySQL Root Password (current: [hidden], press Enter to keep): " MYSQL_ROOT_PASSWORD
        echo
        MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-$DEFAULT_DB_PASSWORD}
    else
        while [ -z "$MYSQL_ROOT_PASSWORD" ]; do
            read -s -p "Enter MySQL Root Password: " MYSQL_ROOT_PASSWORD
            echo
            if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
                print_error "MySQL password cannot be empty"
            fi
        done
    fi
}

# Function to create .env file
create_env_file() {
    print_status "Creating .env file..."
    
    cat > .env << EOF
# Poznote Configuration
POZNOTE_PASSWORD=$POZNOTE_PASSWORD
HTTP_WEB_PORT=$HTTP_WEB_PORT

# Database Configuration
MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD
MYSQL_DATABASE=poznote_db
MYSQL_USER=poznote_user
MYSQL_PASSWORD=$MYSQL_ROOT_PASSWORD

# Docker Configuration
DB_DATA_PATH=./data/mysql
ENTRIES_DATA_PATH=./data/entries
ATTACHMENTS_DATA_PATH=./data/attachments

EOF
    
    print_success ".env file created"
}

# Function to update Docker containers
update_containers() {
    print_status "Updating Poznote containers..."
    
    # Stop existing containers if they're running
    if docker compose ps -q 2>/dev/null | grep -q .; then
        print_status "Stopping existing containers..."
        docker compose down
    fi
    
    # Pull latest images
    print_status "Pulling latest Docker images..."
    docker compose pull
    
    # Start containers
    print_status "Starting containers..."
    docker compose up -d
    
    # Wait for containers to be ready
    print_status "Waiting for services to start..."
    sleep 15
    
    # Check if containers are running
    if docker compose ps | grep -q "Up"; then
        print_success "Poznote containers are running"
    else
        print_error "Failed to start containers"
        echo "Container logs:"
        docker compose logs
        exit 1
    fi
}

# Function to show post-installation information
show_info() {
    local is_update=$1
    
    echo
    echo "========================================="
    if [ "$is_update" = "true" ]; then
        print_success "🎉 Poznote has been successfully updated!"
    else
        print_success "🎉 Poznote has been successfully installed!"
    fi
    echo "========================================="
    echo
    print_status "📋 Access Information:"
    echo "  🌐 URL: http://localhost:$HTTP_WEB_PORT"
    echo "  🔑 Username: admin (default)"
    echo "  🔑 Password: [the password you configured]"
    echo
    print_status "🔧 Management Commands:"
    echo "  📊 View logs: docker compose logs -f"
    echo "  🔄 Restart: docker compose restart"
    echo "  ⏹️  Stop: docker compose down"
    echo "  ▶️  Start: docker compose up -d"
    echo "  🗑️  Remove: docker compose down -v (⚠️  WARNING: This deletes all data!)"
    echo
    print_status "💡 Configuration Management:"
    echo "  🔧 To change password or port: Edit .env file and restart containers"
    echo "  📝 To update Poznote: Run this script again"
    echo "  💾 Data location: ./data/ directory"
    echo
    if [ "$is_update" = "true" ]; then
        print_status "✅ Your data and settings have been preserved during the update."
    else
        print_status "📁 Your notes and data are stored in Docker volumes and will persist between restarts."
    fi
    echo
    print_warning "💡 Remember: To change password or port, edit the .env file and run 'docker compose down && docker compose up -d'"
}

# Main installation/update function
main() {
    # Handle command line arguments
    case "$1" in
        -h|--help)
            show_help
            exit 0
            ;;
        "")
            # No arguments, proceed with normal installation/update
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac

    echo "======================================="
    echo "  🗒️  Poznote Installation & Update Tool  "
    echo "======================================="
    echo
    
    # Check prerequisites
    check_docker
    
    # Check if this is an update or fresh installation
    if check_existing_installation; then
        echo -e "${BLUE}========================================="
        echo -e "    Poznote Management Menu"
        echo -e "=========================================${NC}"
        
        # Load and display current configuration
        if [ -f ".env" ]; then
            source ".env"
            echo -e "\n${BLUE}Current configuration:${NC}"
            echo -e "  • Web Port: ${HTTP_WEB_PORT}"
            echo -e "  • Password: ${POZNOTE_PASSWORD}"
        fi
        
        echo -e "\n${GREEN}What would you like to do?${NC}"
        echo -e "  1) Update application (pull latest code)"
        echo -e "  2) Change configuration (password/port)"
        echo -e "  3) Cancel"
        
        while true; do
            echo
            read -p "Please select an option (1-3): " choice
            
            case $choice in
                1)
                    print_status "Starting application update..."
                    IS_UPDATE=true
                    
                    # Pull latest changes from Git
                    print_status "📥 Pulling latest changes from repository..."
                    if git pull origin main 2>/dev/null; then
                        print_success "✅ Successfully pulled latest changes"
                    else
                        print_warning "⚠️  Git pull failed or no changes, continuing with local files"
                    fi
                    echo
                    
                    # Load existing configuration (no backup needed for updates)
                    load_existing_env
                    break
                    ;;
                2)
                    reconfigure_poznote
                    exit 0
                    ;;
                3)
                    print_status "Operation cancelled."
                    exit 0
                    ;;
                *)
                    print_warning "Invalid choice. Please select 1, 2, or 3."
                    ;;
            esac
        done
    else
        print_status "🆕 No existing installation found. Proceeding with fresh installation."
        IS_UPDATE=false
    fi
    
    # Configure Poznote
    configure_poznote $IS_UPDATE
    
    # Create .env file
    create_env_file
    
    # Update/start containers
    update_containers
    
    # Show final information
    show_info $IS_UPDATE
}

# Run main function
main "$@"
