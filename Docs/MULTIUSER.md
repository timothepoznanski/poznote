# User Profiles Documentation

## Overview

Poznote uses a profile-based architecture where each user has their own isolated data space (notes, attachments, workspaces, tags, folders). 

**Key Concept**: There is ONE global password for everyone, but users select their profile at login to access their own data space.

## Architecture

### Authentication Model

- **Global Authentication**: Uses `POZNOTE_USERNAME` and `POZNOTE_PASSWORD` environment variables
- **User Profiles**: Each user has a profile (username, display name, color, icon) but NO individual password
- **Profile Selection**: At login, users enter the global credentials AND select their profile from a dropdown
- **Data Isolation**: Each profile has completely separate notes, folders, workspaces, tags, and attachments

### Database Structure

Poznote uses:

1. **Master Database** (`data/master.db`): Contains user profiles and global settings
2. **User Databases** (`data/users/{user_id}/database/poznote.db`): Each user has their own SQLite database

### File Structure

```
data/
├── master.db                    # Master database (user profiles, global settings)
└── users/
    ├── 1/                       # User ID 1 (default admin)
    │   ├── database/
    │   │   └── poznote.db       # User's notes database
    │   ├── entries/             # User's note files (HTML/MD)
    │   ├── attachments/         # User's attachments
    │   └── backups/             # User's backups
    ├── 2/                       # User ID 2
    │   ├── database/
    │   ├── entries/
    │   ├── attachments/
    │   └── backups/
    └── ...
```

## Getting Started

### New Installation

No special configuration is needed. On first startup:
1. A default "Admin" profile is created automatically
2. Login with the global password and select the Admin profile

### Upgrading from Legacy Single-User Installation

If you're upgrading from an older version of Poznote:

**Automatic Migration**: When you start the new version, your existing data is automatically migrated:
1. A master database is created with an "Admin" profile
2. Your existing data is moved to `data/users/1/`
3. No manual action required!

The migration runs automatically at startup if it detects the old data structure.

## Configuration

### Basic Configuration

```bash
# Authentication (one global password for all profiles)
POZNOTE_USERNAME=admin
POZNOTE_PASSWORD=changeme123!
```

That's it! No additional configuration needed.

### Docker Compose Example

```yaml
services:
  poznote:
    image: timothepoznanski/poznote:latest
    environment:
      - POZNOTE_USERNAME=admin
      - POZNOTE_PASSWORD=changeme123!
    volumes:
      - ./data:/data
    ports:
      - "8080:80"
```

## User Profile Management

### Admin Interface

Access the user profile management interface at `/admin/users.php` (admin only).

Features:
- Create, edit, delete user profiles
- Set display name, color, and icon for each profile
- Enable/disable user profiles
- Toggle admin status
- View storage statistics per profile

### Profile Properties

Each user profile has:
- **Username**: Unique identifier (used for OIDC matching)
- **Display Name**: Shown in the UI and profile selector
- **Color**: Hex color code for visual identification (e.g., `#667eea`)
- **Icon**: FontAwesome icon class (e.g., `fa-user`, `fa-star`)
- **Admin**: Can manage other profiles
- **Active**: Can login and access the system

### API Endpoints

```http
# List all user profiles (public, for login dropdown)
GET /api/v1/users/profiles

# List all users (admin only)
GET /api/v1/admin/users

# Get a specific user
GET /api/v1/admin/users/{id}

# Create a new user profile
POST /api/v1/admin/users
Content-Type: application/json
{
    "username": "newuser",
    "display_name": "New User"
}

# Update a user profile
PATCH /api/v1/admin/users/{id}
Content-Type: application/json
{
    "display_name": "Updated Name",
    "color": "#ff6b6b",
    "icon": "fa-star",
    "active": true
}

# Delete a user profile
DELETE /api/v1/admin/users/{id}?delete_data=true
```

## User Self-Service

Users can manage their own profile at `/profile.php`:

- Update display name
- Change profile color
- Change profile icon
- View storage statistics (notes count, attachments count, storage used)

Note: Users cannot change their password because there is no per-user password. The global password is configured via environment variables.

## OIDC Integration

Profile management works seamlessly with OIDC authentication:

1. When a user logs in via OIDC, a profile is automatically created using their email or preferred_username
2. OIDC users are matched by their username/email in the profiles database
3. If no matching profile exists, a new one is created automatically

```bash
OIDC_ENABLED=true
OIDC_PROVIDER_URL=https://auth.example.com
OIDC_CLIENT_ID=poznote
OIDC_CLIENT_SECRET=secret
OIDC_ALLOW_EMAILS=admin@example.com,user@example.com
```

## Login Flow

### Standard Login

1. User opens Poznote
2. User enters the global username and password
3. User selects their profile from the dropdown (shows display name, color, icon)
4. User clicks "Login"
5. User accesses their personal data space

### OIDC Login

1. User clicks "Login with OIDC"
2. User authenticates with the OIDC provider
3. Poznote finds or creates a matching user profile
4. User accesses their personal data space

## Single User Mode

If you only need one profile, simply use the default "Admin" profile. The system works exactly like it would with a single user - no extra complexity.

## Backup and Restore

### Per-User Backups

Each user's backup contains only their data:
- Their database
- Their entries
- Their attachments

### Complete System Backup

For a complete system backup, backup the entire `data/` directory:

```bash
# Backup command
tar -czvf poznote-backup-$(date +%Y%m%d).tar.gz data/

# Restore command
tar -xzvf poznote-backup-YYYYMMDD.tar.gz
```

## Security Considerations

1. **Shared Password**: All users share the same login password. This is designed for trusted environments (family, small team)
2. **Data Isolation**: Users cannot access other users' data through the application
3. **Admin Control**: Only admins can create, modify, or delete user profiles
4. **Profile Visibility**: All active profiles are visible on the login page (for selection)

## Use Cases

This profile system is ideal for:

- **Families**: Shared home server where each family member has their own notes
- **Small Teams**: Trusted team members sharing a Poznote instance
- **Personal Use**: One person with multiple "personas" or contexts (work, personal, projects)

For environments requiring per-user passwords and stricter security, consider running separate Poznote instances.

## Troubleshooting

### User Profile Doesn't Appear in Login Dropdown

1. Check if the profile is marked as "active" in admin
2. Verify the master database exists at `data/master.db`

### Database Issues

1. Check file permissions on `data/` directory
2. Ensure SQLite extension is installed
3. Check disk space
