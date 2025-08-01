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
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
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
    if [ -f ".env" ] && [ -f "docker-compose.yml" ]; then
        return 0  # Installation exists
    else
        return 1  # No installation found
    fi
}

# Function to backup existing data
backup_data() {
    local backup_dir="backup_$(date +%Y%m%d_%H%M%S)"
    print_status "Creating backup in $backup_dir..."
    
    mkdir -p "$backup_dir"
    
    # Backup .env file
    if [ -f ".env" ]; then
        cp ".env" "$backup_dir/"
        print_success "Backed up .env file"
    fi
    
    # Backup docker-compose files
    if [ -f "docker-compose.yml" ]; then
        cp "docker-compose.yml" "$backup_dir/"
    fi
    if [ -f "docker-compose-dev.yml" ]; then
        cp "docker-compose-dev.yml" "$backup_dir/"
    fi
    
    # Backup custom data if it exists
    for dir in data entries attachments; do
        if [ -d "$dir" ]; then
            cp -r "$dir" "$backup_dir/"
            print_success "Backed up $dir directory"
        fi
    done
    
    print_success "Backup created in $backup_dir"
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

# Application Environment
APP_ENV=production
EOF
    
    print_success ".env file created"
}

# Function to update Docker containers
update_containers() {
    print_status "Updating Poznote containers..."
    
    # Stop existing containers if they're running
    if docker-compose ps -q 2>/dev/null | grep -q .; then
        print_status "Stopping existing containers..."
        docker-compose down
    fi
    
    # Pull latest images
    print_status "Pulling latest Docker images..."
    docker-compose pull
    
    # Start containers
    print_status "Starting containers..."
    docker-compose up -d
    
    # Wait for containers to be ready
    print_status "Waiting for services to start..."
    sleep 15
    
    # Check if containers are running
    if docker-compose ps | grep -q "Up"; then
        print_success "Poznote containers are running"
    else
        print_error "Failed to start containers"
        echo "Container logs:"
        docker-compose logs
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
    echo "  📊 View logs: docker-compose logs -f"
    echo "  🔄 Restart: docker-compose restart"
    echo "  ⏹️  Stop: docker-compose down"
    echo "  ▶️  Start: docker-compose up -d"
    echo "  🗑️  Remove: docker-compose down -v (⚠️  WARNING: This deletes all data!)"
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
    print_warning "💡 Remember: To change password or port, edit the .env file and run 'docker-compose down && docker-compose up -d'"
}

# Main installation/update function
main() {
    echo "======================================="
    echo "  🗒️  Poznote Installation & Update Tool  "
    echo "======================================="
    echo
    
    # Check prerequisites
    check_docker
    
    # Check if this is an update or fresh installation
    if check_existing_installation; then
        print_warning "🔄 Existing Poznote installation detected."
        echo
        read -p "Do you want to update Poznote? (y/N): " update_choice
        if [[ $update_choice =~ ^[Yy]$ ]]; then
            IS_UPDATE=true
            
            # Create backup
            read -p "Create backup before update? (Y/n): " backup_choice
            if [[ ! $backup_choice =~ ^[Nn]$ ]]; then
                BACKUP_DIR=$(backup_data)
                print_success "💾 Backup created. You can restore from $BACKUP_DIR if needed."
                echo
            fi
            
            # Load existing configuration
            load_existing_env
        else
            print_status "Update cancelled."
            exit 0
        fi
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
