#!/bin/bash

# Poznote Installation and Update Script
# This script automates the installation and update process for Poznote

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

# Function to show help
show_help() {
    cat << 'EOF'
Poznote Setup Script for Linux/macOS

USAGE:
    ./setup.sh [OPTIONS]

OPTIONS:
    -h, --help       Show this help message

EXAMPLES:
    ./setup.sh       Interactive menu for installation, update, or configuration

FEATURES:
    • Automatic detection of existing installations
    • Interactive menu with options:
      - New installation (fresh setup)
      - Update application (pull latest code)
      - Change configuration (password/port)
    • Configuration preservation during updates

REQUIREMENTS:
    - Docker Engine and Docker Compose
    - Bash shell
EOF
}

# Reconfigure existing installation
reconfigure_poznote() {
    echo -e "${BLUE}========================================="
    echo -e "    Poznote Configuration Update"
    echo -e "=========================================${NC}"

    if [ ! -f ".env" ]; then
        print_error "No existing configuration found (.env file missing)."
        print_warning "Please run the installation first: ./setup.sh"
        exit 1
    fi

    load_env_config
    
    echo -e "\n${BLUE}Current configuration:${NC}"
    echo -e "  • URL: ${GREEN}http://your-server:${HTTP_WEB_PORT}${NC}"
    echo -e "  • Username: ${POZNOTE_USERNAME}"
    echo -e "  • Password: ${POZNOTE_PASSWORD}"
    echo -e "  • Application Name Displayed: ${APP_NAME_DISPLAYED:-Poznote}"

    echo -e "\n${GREEN}Update your configuration:${NC}\n"

    # Get new values
    read -p "Username [$POZNOTE_USERNAME]: " NEW_POZNOTE_USERNAME
    POZNOTE_USERNAME=${NEW_POZNOTE_USERNAME:-$POZNOTE_USERNAME}

    read -p "Password [$POZNOTE_PASSWORD]: " NEW_POZNOTE_PASSWORD
    POZNOTE_PASSWORD=${NEW_POZNOTE_PASSWORD:-$POZNOTE_PASSWORD}

    HTTP_WEB_PORT=$(get_port_with_validation "Web Server Port [$HTTP_WEB_PORT]: " "$HTTP_WEB_PORT" "$HTTP_WEB_PORT")

    read -p "Application Name [${APP_NAME_DISPLAYED:-Poznote}]: " NEW_APP_NAME
    APP_NAME_DISPLAYED=${NEW_APP_NAME:-${APP_NAME_DISPLAYED:-Poznote}}

    if [ "$POZNOTE_PASSWORD" = "admin123" ]; then
        print_warning "You are using the default password! Please change it for production use."
    fi

    # Update .env file
    create_env_file
    manage_containers "restart"
    
    echo -e "\n${GREEN}========================================="
    echo -e "    Configuration Update Complete!"
    echo -e "=========================================${NC}\n"
    
    echo -e "${GREEN}Your Poznote configuration has been updated!${NC}"
    echo -e "${BLUE}Access your instance at: ${GREEN}http://your-server:$HTTP_WEB_PORT${NC}"
    echo -e "${BLUE}Username: ${YELLOW}$POZNOTE_USERNAME${NC}"
    echo -e "${BLUE}Password: ${YELLOW}$POZNOTE_PASSWORD${NC}"
    echo -e "${BLUE}Application Name Displayed: ${YELLOW}${APP_NAME_DISPLAYED:-Poznote}${NC}"
}

# Check Docker installation
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is installed but not running. Please start Docker service and try again."
        exit 1
    fi
    
    print_success "Docker is installed and running"
}

# Check if Poznote is already installed
check_existing_installation() {
    local indicators=0
    [ -d "./data/entries" ] && ((indicators++))
    [ -d "./data/attachments" ] && ((indicators++))
    [ -d "./data/mysql" ] && ((indicators++))
    
    # Count .env only if it's different from template
    if [ -f ".env" ] && [ -f ".env.template" ]; then
        ! cmp -s ".env" ".env.template" && ((indicators++))
    elif [ -f ".env" ] && [ ! -f ".env.template" ]; then
        ((indicators++))
    fi
    
    [ $indicators -ge 2 ]
}

# Load environment configuration
load_env_config() {
    if [ -f ".env" ]; then
        print_status "Loading existing configuration..."
        # Use a safer method to load .env that doesn't execute arbitrary commands
        while IFS='=' read -r key value; do
            # Skip empty lines and comments
            [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
            # Remove leading/trailing whitespace and quotes from value
            value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//")
            # Export the variable
            export "$key"="$value"
        done < ".env"
        print_success "Configuration loaded"
    fi
}

# Get template values
get_template_values() {
    if [ -f ".env.template" ]; then
        TEMPLATE_USERNAME=$(grep "^POZNOTE_USERNAME=" .env.template | cut -d'=' -f2)
        TEMPLATE_PASSWORD=$(grep "^POZNOTE_PASSWORD=" .env.template | cut -d'=' -f2)
        TEMPLATE_PORT=$(grep "^HTTP_WEB_PORT=" .env.template | cut -d'=' -f2 | tr -d ' \t\r\n')
        TEMPLATE_APP_NAME=$(grep "^APP_NAME_DISPLAYED=" .env.template | cut -d'=' -f2 | tr -d ' \t\r\n')
    fi
}

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

# Get and validate port with availability check
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

# Get user input for configuration
get_user_config() {
    local is_update=$1
    get_template_values
    
    if [ "$is_update" = "true" ]; then
        print_status "Current configuration will be preserved. Press Enter to keep current values:"
        echo
    fi
    
    # Get username
    if [ "$is_update" = "true" ] && [ -n "$POZNOTE_USERNAME" ]; then
        read -p "Username (current: $POZNOTE_USERNAME): " NEW_USERNAME
        POZNOTE_USERNAME=${NEW_USERNAME:-$POZNOTE_USERNAME}
    else
        read -p "Username (default: $TEMPLATE_USERNAME): " POZNOTE_USERNAME
        POZNOTE_USERNAME=${POZNOTE_USERNAME:-$TEMPLATE_USERNAME}
        
        if [ -z "$POZNOTE_USERNAME" ]; then
            POZNOTE_USERNAME="admin"
        fi
    fi
    
    # Get password
    if [ "$is_update" = "true" ] && [ -n "$POZNOTE_PASSWORD" ]; then
        read -p "Poznote Password (current: [hidden], press Enter to keep): " NEW_PASSWORD
        POZNOTE_PASSWORD=${NEW_PASSWORD:-$POZNOTE_PASSWORD}
    else
        read -p "Poznote Password (default: $TEMPLATE_PASSWORD): " POZNOTE_PASSWORD
        POZNOTE_PASSWORD=${POZNOTE_PASSWORD:-$TEMPLATE_PASSWORD}
        
        if [ -z "$POZNOTE_PASSWORD" ]; then
            POZNOTE_PASSWORD="admin123"
        fi
    fi
    
    # Get port with availability check
    if [ "$is_update" = "true" ] && [ -n "$HTTP_WEB_PORT" ]; then
        HTTP_WEB_PORT=$(get_port_with_validation "HTTP Port (current: $HTTP_WEB_PORT, press Enter to keep or enter new): " "$HTTP_WEB_PORT" "$HTTP_WEB_PORT")
    else
        HTTP_WEB_PORT=$(get_port_with_validation "HTTP Port (default: ${TEMPLATE_PORT:-8040}): " "${TEMPLATE_PORT:-8040}")
    fi
    
    # Get application name
    if [ "$is_update" = "true" ] && [ -n "$APP_NAME_DISPLAYED" ]; then
        read -p "Application Name (current: $APP_NAME_DISPLAYED): " NEW_APP_NAME
        APP_NAME_DISPLAYED=${NEW_APP_NAME:-$APP_NAME_DISPLAYED}
    else
        # Use default value for new installations
        APP_NAME_DISPLAYED="Poznote"
    fi
    
    if [ "$POZNOTE_PASSWORD" = "admin123" ]; then
        print_warning "You are using the default password! Please change it for production use."
    fi
}

# Create or update .env file
create_env_file() {
    print_status "Creating .env file..."
    
    if [ ! -f ".env.template" ]; then
        print_error ".env.template file not found. Cannot create .env file."
        exit 1
    fi
    
    cp ".env.template" ".env"
    
    # Use sed for more robust replacement that handles spaces
    sed -i "s/^POZNOTE_USERNAME=.*/POZNOTE_USERNAME=$POZNOTE_USERNAME/" .env
    sed -i "s/^POZNOTE_PASSWORD=.*/POZNOTE_PASSWORD=$POZNOTE_PASSWORD/" .env
    sed -i "s/^HTTP_WEB_PORT=.*/HTTP_WEB_PORT=$HTTP_WEB_PORT/" .env
    sed -i "s/^APP_NAME_DISPLAYED=.*/APP_NAME_DISPLAYED=$APP_NAME_DISPLAYED/" .env
    
    print_success ".env file created from template"
}

# Manage Docker containers
manage_containers() {
    local action=$1
    
    case $action in
        "update")
            print_status "Updating Poznote containers..."
            
            # Stop existing containers if running
            if docker compose ps -q 2>/dev/null | grep -q .; then
                print_status "Stopping existing containers..."
                docker compose down
            fi
            
            print_status "Pulling latest Docker images..."
            docker compose pull
            
            print_status "Building and starting containers..."
            docker compose up -d --build
            ;;
        "restart")
            print_status "Restarting containers with new configuration..."
            docker compose down
            docker compose up -d
            ;;
    esac
    
    # Wait for services
    print_status "Waiting for services to start..."
    sleep 15
    
    # Check if containers are running
    if docker compose ps | grep -q "Up"; then
        print_success "Poznote containers are running"
    else
        print_error "Failed to start containers"
        docker compose logs
        exit 1
    fi
}

# Show post-installation information
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
    echo "  🌐 URL: http://your-server:$HTTP_WEB_PORT"
    echo "  🔑 Username: $POZNOTE_USERNAME"
    echo "  🔑 Password: $POZNOTE_PASSWORD"
    echo "  📱 Application Name Displayed: ${APP_NAME_DISPLAYED:-Poznote}"
    
    if [ "$is_update" != "true" ]; then
        echo
        print_status "⚙️  To update Poznote, change username/password/port or modify the application name, run:"
        echo "  ./setup.sh"
    fi

}

# Main function
main() {
    # Handle command line arguments
    case "$1" in
        -h|--help) show_help; exit 0 ;;
        "") ;; # No arguments, proceed normally
        *) print_error "Unknown option: $1"; echo "Use --help for usage information."; exit 1 ;;
    esac

    echo "======================================="
    echo "  🗒️  Poznote Installation & Update Tool  "
    echo "======================================="
    echo
    
    check_docker
    
    if check_existing_installation; then
        # Existing installation - show menu
        echo -e "${BLUE}========================================="
        echo -e "    Poznote Management Menu"
        echo -e "=========================================${NC}"
        
        load_env_config
        
        if [ -n "$HTTP_WEB_PORT" ]; then
            echo -e "\n${BLUE}Current configuration:${NC}"
            echo -e "  • URL: ${GREEN}http://your-server:${HTTP_WEB_PORT}${NC}"
            echo -e "  • Username: ${POZNOTE_USERNAME}"
            echo -e "  • Password: ${POZNOTE_PASSWORD}"
            echo -e "  • Application Name Displayed: ${APP_NAME_DISPLAYED:-Poznote}"
        fi
        
        echo -e "\n${GREEN}What would you like to do?${NC}"
        echo -e "  1) Update application (pull latest code)"
        echo -e "  2) Change configuration (username/password/port/Application name displayed)"
        echo -e "  3) Cancel"
        
        while true; do
            echo
            read -p "Please select an option (1-3): " choice
            
            case $choice in
                1)
                    print_status "Starting application update..."
                    
                    print_status "📥 Pulling latest changes from repository..."
                    echo
                    if git pull origin main; then
                        echo
                        print_success "✅ Successfully pulled latest changes"
                    else
                        echo
                        print_warning "⚠️  Git pull failed or no changes, continuing with local files"
                    fi
                    
                    print_status "Preserving existing configuration..."
                    manage_containers "update"
                    show_info "true"
                    exit 0
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
        # Fresh installation
        print_status "🆕 No existing installation found. Proceeding with fresh installation."
        
        get_user_config "false"
        create_env_file
        manage_containers "update"
        show_info "false"
    fi
}

# Run main function
main "$@"
