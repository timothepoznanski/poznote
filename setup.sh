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

# Check if Poznote is already installed

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
Poznote Setup Script for Linux

USAGE:
    ./setup.sh [OPTIONS]

OPTIONS:
    -h, --help         Show this help message
    --check-updates    Check for available updates (for internal use)

EXAMPLES:
    ./setup.sh         Interactive menu for installation, update, or configuration

FEATURES:
        • Automatic detection of existing installations
        • Interactive menu with options:
            - New installation (fresh setup)
            - Update application (get latest code)
            - Change configuration (login/password/port)
        • Configuration preservation during updates

REQUIREMENTS:
    - Docker Engine and Docker Compose
    - Bash shell

SETUP INFO:
    This script will automatically set up your Poznote installation.
    Make sure Docker is running before executing this script.
EOF
}

# Reconfigure existing installation
reconfigure_poznote() {

    if [ ! -f ".env" ]; then
        print_error "No existing configuration found (.env file missing)."
        print_warning "Please run the installation first: ./setup.sh"
        exit 1
    fi

    load_env_config
    
    echo -e "\n${BLUE}Current configuration:\n${NC}"
    echo -e "  • URL: http://your-server:${HTTP_WEB_PORT}"
    echo -e "  • Username: ${POZNOTE_USERNAME}"
    echo -e "  • Password: ${POZNOTE_PASSWORD}"
    echo -e "  • Port: ${HTTP_WEB_PORT}"
    

    echo -e "\n${GREEN}Update your configuration:${NC}\n"

    # Get new values
    read -p "Username [$POZNOTE_USERNAME]: " NEW_POZNOTE_USERNAME
    POZNOTE_USERNAME=${NEW_POZNOTE_USERNAME:-$POZNOTE_USERNAME}

    while true; do
        read -p "Password [$POZNOTE_PASSWORD]: " NEW_POZNOTE_PASSWORD
        if [ -z "$NEW_POZNOTE_PASSWORD" ]; then
            # Keep current password
            break
        elif validate_password "$NEW_POZNOTE_PASSWORD"; then
            POZNOTE_PASSWORD="$NEW_POZNOTE_PASSWORD"
            break
        fi
        echo "Please try again with a valid password."
    done

    HTTP_WEB_PORT=$(get_port_with_validation "Web Server Port [$HTTP_WEB_PORT]: " "$HTTP_WEB_PORT" "$HTTP_WEB_PORT")

    

    if [ "$POZNOTE_PASSWORD" = "admin123" ]; then
        print_warning "You are using the default password! Please change it for production use."
    fi

    if [ "$POZNOTE_PASSWORD" = "admin123" ]; then
        print_warning "You are using the default password! Please change it for production use."
    fi

    # Update .env file
    create_env_file
    manage_container "restart"
    
    echo -e "\n${GREEN}Configuration Update Complete!${NC}"
                
    echo -e "${BLUE}Username: ${YELLOW}$POZNOTE_USERNAME${NC}"
    echo -e "${BLUE}Password: ${YELLOW}$POZNOTE_PASSWORD${NC}"
    
    echo
    
    # Export variables for use in other functions
    export POZNOTE_USERNAME
    export POZNOTE_PASSWORD  
    export HTTP_WEB_PORT
}

# Check Docker installation

# Check if Poznote is already installed
check_existing_installation() {
    # Installation is detected if .env file exists
    [ -f ".env" ]
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
    # TEMPLATE_APP_NAME removed - not used by this script
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
            echo -e "${BLUE}[INFO]${NC} Please choose a different port." >&2
            first_attempt=false
            continue
        fi
        
        echo "$port"
        return 0
    done
}

# Validate password for security and compatibility
validate_password() {
    local password="$1"
    local forbidden_chars='$`"\|&;<>(){}[]~!#%=?+'
    local has_error=false
    
    # Check minimum length
    if [ ${#password} -lt 8 ]; then
        print_warning "Password must be at least 8 characters long."
        has_error=true
    fi
    
    # Check for forbidden characters
    if [[ "$password" =~ [\$\`\"\'\\\|\&\;\<\>\(\)\{\}\[\]\~\#\%\=\?\+[:space:]] ]]; then
        print_warning "Password contains forbidden characters."
        has_error=true
    fi
    
    # Check if password is too simple
    if [[ "$password" =~ ^[a-zA-Z]+$ ]] || [[ "$password" =~ ^[0-9]+$ ]]; then
        print_warning "Password should contain a mix of letters and numbers for better security."
        has_error=true
    fi
    
    # Show rules if there's an error
    if [ "$has_error" = true ]; then
        echo
        echo "Password requirements:"
        echo "  • Minimum 8 characters"
        echo "  • Mix of letters and numbers recommended"
        echo "  • Allowed special characters: @ - _ . , ! *"
        echo
        return 1
    fi
    
    return 0
}

# Get user input for configuration
get_user_config() {
    local is_update=$1
    get_template_values
    
    if [ "$is_update" = "true" ]; then
        print_status "Current configuration will be preserved. Press Enter to keep current values:\n"
        echo
    fi
    
    # Get instance name (only for new installations)
    if [ "$is_update" != "true" ]; then
        INSTANCE_NAME=$(basename "$(pwd)")
        print_status "Using instance name: $INSTANCE_NAME"
        
        # Validate instance name for Docker compatibility
        if ! [[ "$INSTANCE_NAME" =~ ^[a-z0-9_-]+$ ]]; then
            print_warning "Instance name '$INSTANCE_NAME' contains invalid characters."
            echo "Docker project names must contain only lowercase letters, numbers, underscores, and hyphens."
            echo "Please rename your folder to use only lowercase letters, numbers, _ and - characters."
            echo "Example: rename 'MyPoznote' to 'my-poznote' or 'mypoznote'"
            echo ""
            echo "If you used the bash command from the README, please use the updated version that validates names before cloning."
            exit 1
        fi
        
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
    echo
    print_status "Password requirements:"
    echo "  • Minimum 8 characters"
    echo "  • Mix of letters and numbers recommended"
    echo "  • Allowed special characters: @ - _ . , ! *"
    echo
    
    if [ "$is_update" = "true" ] && [ -n "$POZNOTE_PASSWORD" ]; then
        while true; do
            read -p "Poznote Password (current: [hidden], press Enter to keep): " NEW_PASSWORD
            if [ -z "$NEW_PASSWORD" ]; then
                # Keep current password
                break
            elif validate_password "$NEW_PASSWORD"; then
                POZNOTE_PASSWORD="$NEW_PASSWORD"
                break
            fi
            echo "Please try again with a valid password."
        done
    else
        while true; do
            read -p "Poznote Password (default: $TEMPLATE_PASSWORD): " POZNOTE_PASSWORD
            POZNOTE_PASSWORD=${POZNOTE_PASSWORD:-$TEMPLATE_PASSWORD}
            
            if [ -z "$POZNOTE_PASSWORD" ]; then
                POZNOTE_PASSWORD="admin123"
            fi
            
            if validate_password "$POZNOTE_PASSWORD"; then
                break
            fi
            echo "Please try again with a valid password."
        done
    fi
    
    # Get port with availability check
    if [ "$is_update" = "true" ] && [ -n "$HTTP_WEB_PORT" ]; then
        HTTP_WEB_PORT=$(get_port_with_validation "HTTP Port (current: $HTTP_WEB_PORT, press Enter to keep or enter new): " "$HTTP_WEB_PORT" "$HTTP_WEB_PORT")
    else
        HTTP_WEB_PORT=$(get_port_with_validation "HTTP Port (default: ${TEMPLATE_PORT:-8040}): " "${TEMPLATE_PORT:-8040}")
    fi
    
    
    
    if [ "$POZNOTE_PASSWORD" = "admin123" ]; then
        print_warning "You are using the default password! Please change it for production use."
    fi
    
    # Export variables for use in other functions
    export POZNOTE_USERNAME
    export POZNOTE_PASSWORD  
    export HTTP_WEB_PORT
}

# Create or update .env file
create_env_file() {
    echo
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
    # Deprecated .env variables are not used by this script
    
    print_success ".env file created from template"
}

# Manage Docker container
manage_container() {
    local action=$1
    local project_name=${INSTANCE_NAME:-$(basename "$(pwd)")}
    
    case $action in
        "update")
            print_status "Updating Poznote container..."
            
            # Stop existing container if running
            if docker compose -p "$project_name" ps -q 2>/dev/null | grep -q .; then
                print_status "Stopping existing container..."
                docker compose -p "$project_name" down
            fi
            
            print_status "Pulling latest Docker images..."
            docker compose -p "$project_name" pull
            
            print_status "Building and starting container..."
            docker compose -p "$project_name" up -d --build
            ;;
        "restart")
            print_status "Restarting container with new configuration..."
            docker compose -p "$project_name" down
            docker compose -p "$project_name" up -d
            ;;
    esac
    
    # Wait for services
    print_status "Waiting for services to start..."
    sleep 15
    
    # Check if container is running
    if docker compose -p "$project_name" ps | grep -q "Up"; then
        print_success "Poznote container is running"
    else
        print_error "Failed to start container"
        docker compose -p "$project_name" logs
        exit 1
    fi
}

# Show post-installation information
show_info() {
    local is_update=$1
    
    echo
    if [ "$is_update" = "true" ]; then
        print_success "Poznote has been successfully updated!"
    else
        print_success "Poznote has been successfully installed!"
    fi
    echo
    print_status "Access Information:\n"
    echo "  URL: http://your-server:${HTTP_WEB_PORT}"
    echo "  Username: ${POZNOTE_USERNAME}"
    echo "  Password: ${POZNOTE_PASSWORD}"
    echo
    
    if [ "$is_update" != "true" ]; then
        echo
        print_status "To update Poznote or change settings, run setup script again with:"
        print_status "./setup.sh"
        echo
    fi
}

# Function to check for updates (can be called by PHP)
check_updates_only() {
    local current_commit=$(git rev-parse HEAD 2>/dev/null | cut -c1-8)
    local current_branch=$(git branch --show-current 2>/dev/null || echo "main")
    
    # Fetch latest info
    git fetch origin $current_branch 2>/dev/null
    local remote_commit=$(git rev-parse origin/$current_branch 2>/dev/null | cut -c1-8)
    
    if [ "$current_commit" != "$remote_commit" ]; then
        local behind_count=$(git rev-list --count HEAD..origin/$current_branch 2>/dev/null || echo "0")
        echo "UPDATE_AVAILABLE:$current_commit:$remote_commit:$behind_count:$current_branch"
    else
        echo "UP_TO_DATE:$current_commit:$current_commit:0:$current_branch"
    fi
}

# Function to install Git pre-commit hook for automatic versioning
install_git_hook() {
    print_status "Installing Git pre-commit hook for automatic versioning..."
    
    # Create the hook file
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# Pre-commit hook to automatically update version.txt
# This runs locally before each commit

# Get the directory of the repository
REPO_DIR=$(git rev-parse --show-toplevel)

# Generate new version in format YYMMDDHHmm
NEW_VERSION=$(date +%y%m%d%H%M)

# Update version.txt
echo $NEW_VERSION > "$REPO_DIR/src/version.txt"

# Add version.txt to the commit
git add "$REPO_DIR/src/version.txt"

echo "Auto-updated version to: $NEW_VERSION"
EOF

    # Make it executable
    chmod +x .git/hooks/pre-commit
    
    print_success "Git pre-commit hook installed successfully!"
}

# Main function
main() {
    # Handle command line arguments
    case "$1" in
        -h|--help) show_help; exit 0 ;;
        --check-updates) check_updates_only; exit 0 ;;
        "") ;; # No arguments, proceed normally
        *) print_error "Unknown option: $1"; echo "Use --help for usage information."; exit 1 ;;
    esac
    
    if check_existing_installation; then
        # Existing installation - show menu        
        load_env_config
        
        # Always show configuration if .env exists
        if [ -f ".env" ]; then
            echo ""
            echo "Current configuration:"
            echo ""
            echo "  - URL: http://localhost:${HTTP_WEB_PORT}"
            echo "  - Username: ${POZNOTE_USERNAME}"
            echo "  - Password: ${POZNOTE_PASSWORD}"
            echo "  - Port: ${HTTP_WEB_PORT}"
        fi
        
        echo ""
        echo "What would you like to do?"
        echo ""
        echo "  1. Update application (get latest code)"
        echo "  2. Change settings (login/password/port)"
        echo "  3. Cancel"
        
        while true; do
            echo
            read -p "Please select an option (1-3): " choice
            
            case $choice in
                1)
                    echo
                    print_status "Starting application update..."
                    
                    print_status "Pulling latest changes from repository..."
                    echo
                    if git pull origin main; then
                        echo
                        print_success "Successfully pulled latest changes"
                    else
                        echo
                        print_warning "Git pull failed or no changes, continuing with local files"
                    fi
                    
                    print_status "Preserving existing configuration..."
                    
                    # Ensure data directories exist
                    print_status "Creating/verifying data directories..."
                    mkdir -p data/entries
                    mkdir -p data/database  
                    mkdir -p data/attachments
                    print_success "Data directories created/verified"
                    
                    manage_container "update"
                    install_git_hook
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
        print_status "Proceeding with fresh installation."
        
        get_user_config "false"
        create_env_file
        
        # Create necessary directories for fresh installation
        print_status "Creating data directories..."
        mkdir -p data/entries
        mkdir -p data/database  
        mkdir -p data/attachments
        print_success "Data directories created"
        
        manage_container "update"
        install_git_hook
        show_info "false"
    fi
}

# Run main function
main "$@"
