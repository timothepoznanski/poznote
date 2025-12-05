# API Documentation

Complete REST API reference for Poznote.

## Table of Contents
- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Notes Management](#notes-management)
- [Trash Management](#trash-management)
- [Folders Management](#folders-management)
- [Workspaces Management](#workspaces-management)
- [Tags Management](#tags-management)
- [Favorites Management](#favorites-management)
- [Attachments Management](#attachments-management)
- [Backup Management](#backup-management)
- [System Information](#system-information)
- [Interactive Documentation](#interactive-documentation)

---

## Getting Started

### Base URL

All API endpoints are relative to your Poznote installation URL:

```
http://localhost:8040/
```

Or for your production server:
```
https://poznote.example.com/
```

### Response Format

All API responses are in JSON format unless otherwise specified.

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Authentication

Poznote API uses **HTTP Basic Authentication**.

### How to Authenticate

Include your credentials with every request:

**Using curl:**
```bash
curl -u 'username:password' http://localhost:8040/api_endpoint.php
```

**Using Authorization header:**
```bash
curl -H "Authorization: Basic $(echo -n 'username:password' | base64)" \
  http://localhost:8040/api_endpoint.php
```

**Using Python requests:**
```python
import requests

response = requests.get(
    'http://localhost:8040/api_endpoint.php',
    auth=('username', 'password')
)
```

**Using JavaScript fetch:**
```javascript
const response = await fetch('http://localhost:8040/api_endpoint.php', {
  headers: {
    'Authorization': 'Basic ' + btoa('username:password')
  }
});
```

### Authentication Errors

**401 Unauthorized:**
- Incorrect username or password
- Missing authentication header

---

## Notes Management

### List Notes

Get all notes with metadata.

**Endpoint:** `GET /api_list_notes.php`

**Parameters:**
- `workspace` (optional) - Filter by workspace name

**Example: List all notes**
```bash
curl -u 'username:password' \
  http://localhost:8040/api_list_notes.php
```

**Example: Filter by workspace**
```bash
curl -u 'username:password' \
  "http://localhost:8040/api_list_notes.php?workspace=Personal"
```

**Response:**
```json
{
  "success": true,
  "notes": [
    {
      "id": 123,
      "heading": "My Note Title",
      "subheading": "Optional subtitle",
      "location": "2025-12-05",
      "tags": "work,important",
      "folder": "Projects",
      "workspace": "Personal",
      "created_at": "2025-12-05 10:30:00",
      "updated_at": "2025-12-05 14:20:00",
      "is_favorite": true,
      "file_path": "/data/entries/123.html"
    }
  ]
}
```

---

### Create Note

Create a new note.

**Endpoint:** `POST /api_create_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `heading` (required) - Note title
- `entrycontent` (required) - Note content (HTML or Markdown)
- `tags` (optional) - Comma-separated tags
- `folder_name` (optional) - Folder name
- `workspace` (optional) - Workspace name (default: "Poznote")

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "entrycontent": "<p>This is the content of my note</p>",
    "tags": "work,important",
    "folder_name": "Projects",
    "workspace": "Personal"
  }' \
  http://localhost:8040/api_create_note.php
```

**Response:**
```json
{
  "success": true,
  "note_id": 124,
  "message": "Note created successfully"
}
```

---

### Update Note

Update an existing note.

**Endpoint:** `POST /api_update_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `id` (required) - Note ID
- `heading` (optional) - New title
- `entrycontent` (optional) - New content
- `tags` (optional) - New tags (comma-separated)
- `folder` (optional) - New folder name

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123,
    "heading": "Updated Title",
    "entrycontent": "<p>Updated content</p>",
    "tags": "work,updated",
    "folder": "Archive"
  }' \
  http://localhost:8040/api_update_note.php
```

**Response:**
```json
{
  "success": true,
  "message": "Note updated successfully"
}
```

---

### Delete Note

Move a note to trash.

**Endpoint:** `DELETE /api_delete_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `note_id` (required) - Note ID to delete

**Example:**
```bash
curl -X DELETE -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123}' \
  http://localhost:8040/api_delete_note.php
```

**Response:**
```json
{
  "success": true,
  "message": "Note moved to trash"
}
```

---

### Move Note

Move a note to a different folder or workspace.

**Endpoint:** `POST /api_move_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `note_id` (required) - Note ID
- `folder_name` (optional) - Target folder (null or empty for no folder)
- `workspace` (optional) - Target workspace

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": 123,
    "folder_name": "Archive",
    "workspace": "Personal"
  }' \
  http://localhost:8040/api_move_note.php
```

**Response:**
```json
{
  "success": true,
  "message": "Note moved successfully"
}
```

---

### Duplicate Note

Create a copy of an existing note.

**Endpoint:** `POST /api_duplicate_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `note_id` (required) - ID of note to duplicate

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123}' \
  http://localhost:8040/api_duplicate_note.php
```

**Response:**
```json
{
  "success": true,
  "new_note_id": 125,
  "message": "Note duplicated successfully"
}
```

---

### Share Note

Create, get, or revoke a public sharing link for a note.

**Endpoint:** `POST /api_share_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `note_id` (required) - Note ID
- `action` (required) - Action: `create`, `get`, or `revoke`

**Example: Create share link**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123, "action": "create"}' \
  http://localhost:8040/api_share_note.php
```

**Response:**
```json
{
  "success": true,
  "share_url": "http://localhost:8040/public_note.php?token=abc123def456",
  "token": "abc123def456"
}
```

**Example: Get existing share URL**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123, "action": "get"}' \
  http://localhost:8040/api_share_note.php
```

**Example: Revoke sharing**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"note_id": 123, "action": "revoke"}' \
  http://localhost:8040/api_share_note.php
```

**Response:**
```json
{
  "success": true,
  "message": "Sharing revoked"
}
```

---

### Download Note

Download a single note as HTML file.

**Endpoint:** `GET /api_download_note.php`

**Parameters:**
- `id` (required) - Note ID

**Example:**
```bash
curl -u 'username:password' \
  "http://localhost:8040/api_download_note.php?id=123" \
  -o note.html
```

**Response:** HTML file download

---

## Trash Management

### List Trash

Get all notes currently in the trash.

**Endpoint:** `GET /api_list_trash.php`

**Example:**
```bash
curl -u 'username:password' \
  http://localhost:8040/api_list_trash.php
```

**Response:**
```json
{
  "success": true,
  "trash": [
    {
      "id": 123,
      "heading": "Deleted Note",
      "deleted_at": "2025-12-05 15:30:00",
      "workspace": "Personal",
      "folder": "Projects"
    }
  ]
}
```

---

### Restore Note

Restore a note from trash back to its original location.

**Endpoint:** `POST /api_restore_note.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `id` (required) - Note ID to restore

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123}' \
  http://localhost:8040/api_restore_note.php
```

**Response:**
```json
{
  "success": true,
  "message": "Note restored successfully"
}
```

---

### Permanently Delete Note

Permanently delete a note (cannot be undone).

**Endpoint:** `POST /api_permanent_delete.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `id` (required) - Note ID to permanently delete

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"id": 123}' \
  http://localhost:8040/api_permanent_delete.php
```

**Response:**
```json
{
  "success": true,
  "message": "Note permanently deleted"
}
```

---

### Empty Trash

Permanently delete all notes in trash.

**Endpoint:** `POST /api_empty_trash.php`

**Example:**
```bash
curl -X POST -u 'username:password' \
  http://localhost:8040/api_empty_trash.php
```

**Response:**
```json
{
  "success": true,
  "deleted_count": 5,
  "message": "Trash emptied successfully"
}
```

---

## Folders Management

### List Folders

Get all folders for a workspace.

**Endpoint:** `GET /api_folders.php`

**Parameters:**
- `workspace` (required) - Workspace name

**Example:**
```bash
curl -u 'username:password' \
  "http://localhost:8040/api_folders.php?workspace=Personal"
```

**Response:**
```json
{
  "success": true,
  "folders": [
    {
      "name": "Projects",
      "note_count": 15
    },
    {
      "name": "Archive",
      "note_count": 8
    }
  ]
}
```

---

### Create Folder

Create a new folder in a workspace.

**Endpoint:** `POST /api_create_folder.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `folder_name` (required) - New folder name
- `workspace` (required) - Workspace name

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "folder_name": "My Projects",
    "workspace": "Personal"
  }' \
  http://localhost:8040/api_create_folder.php
```

**Response:**
```json
{
  "success": true,
  "message": "Folder created successfully"
}
```

---

### Delete Folder

Delete a folder and move its contents to "No Folder".

**Endpoint:** `DELETE /api_delete_folder.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `folder_name` (required) - Folder name to delete
- `workspace` (required) - Workspace name

**Example:**
```bash
curl -X DELETE -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "folder_name": "Old Projects",
    "workspace": "Personal"
  }' \
  http://localhost:8040/api_delete_folder.php
```

**Response:**
```json
{
  "success": true,
  "message": "Folder deleted, notes moved to No Folder"
}
```

---

## Workspaces Management

### List Workspaces

Get all available workspaces.

**Endpoint:** `GET /api_workspaces.php?action=list`

**Example:**
```bash
curl -u 'username:password' \
  "http://localhost:8040/api_workspaces.php?action=list"
```

**Response:**
```json
{
  "success": true,
  "workspaces": [
    {
      "name": "Poznote",
      "note_count": 42,
      "is_default": true
    },
    {
      "name": "Personal",
      "note_count": 28,
      "is_default": false
    },
    {
      "name": "Work",
      "note_count": 15,
      "is_default": false
    }
  ]
}
```

---

### Create Workspace

Create a new workspace.

**Endpoint:** `POST /api_workspaces.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `action` - Must be `"create"`
- `name` (required) - New workspace name

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "name": "MyProject"
  }' \
  http://localhost:8040/api_workspaces.php
```

**Response:**
```json
{
  "success": true,
  "message": "Workspace created successfully"
}
```

---

### Delete Workspace

Delete a workspace (notes are moved to default "Poznote" workspace).

**Endpoint:** `POST /api_workspaces.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `action` - Must be `"delete"`
- `name` (required) - Workspace name to delete

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete",
    "name": "OldWorkspace"
  }' \
  http://localhost:8040/api_workspaces.php
```

**Response:**
```json
{
  "success": true,
  "message": "Workspace deleted, notes moved to Poznote"
}
```

---

### Rename Workspace

Rename an existing workspace.

**Endpoint:** `POST /api_workspaces.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `action` - Must be `"rename"`
- `old_name` (required) - Current workspace name
- `new_name` (required) - New workspace name

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "rename",
    "old_name": "OldName",
    "new_name": "NewName"
  }' \
  http://localhost:8040/api_workspaces.php
```

**Response:**
```json
{
  "success": true,
  "message": "Workspace renamed successfully"
}
```

---

## Tags Management

### List Tags

Get all tags used across all notes.

**Endpoint:** `GET /api_list_tags.php`

**Example:**
```bash
curl -u 'username:password' \
  http://localhost:8040/api_list_tags.php
```

**Response:**
```json
{
  "success": true,
  "tags": [
    {
      "name": "work",
      "count": 25
    },
    {
      "name": "important",
      "count": 18
    },
    {
      "name": "meeting",
      "count": 12
    }
  ]
}
```

---

### Apply Tags

Add or update tags for a specific note (replaces existing tags).

**Endpoint:** `POST /api_apply_tags.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `note_id` (required) - Note ID
- `tags` (required) - Tags as comma-separated string or array

**Example: Comma-separated string**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": 123,
    "tags": "work,urgent,meeting"
  }' \
  http://localhost:8040/api_apply_tags.php
```

**Example: Array format**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "note_id": 123,
    "tags": ["work", "urgent", "meeting"]
  }' \
  http://localhost:8040/api_apply_tags.php
```

**Response:**
```json
{
  "success": true,
  "message": "Tags applied successfully"
}
```

---

## Favorites Management

### Toggle Favorite

Toggle favorite status for a note (add or remove).

**Endpoint:** `POST /api_favorites.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `action` - Must be `"toggle_favorite"`
- `note_id` (required) - Note ID
- `workspace` (required) - Workspace name

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "toggle_favorite",
    "note_id": 123,
    "workspace": "Personal"
  }' \
  http://localhost:8040/api_favorites.php
```

**Response:**
```json
{
  "success": true,
  "is_favorite": true,
  "message": "Note added to favorites"
}
```

---

## Attachments Management

### List Attachments

Get all file attachments for a specific note.

**Endpoint:** `GET /api_attachments.php?action=list&note_id={id}`

**Parameters:**
- `action` - Must be `"list"`
- `note_id` (required) - Note ID

**Example:**
```bash
curl -u 'username:password' \
  "http://localhost:8040/api_attachments.php?action=list&note_id=123"
```

**Response:**
```json
{
  "success": true,
  "attachments": [
    {
      "filename": "document.pdf",
      "size": 1048576,
      "upload_date": "2025-12-05 10:30:00",
      "url": "/data/attachments/note_123/document.pdf"
    },
    {
      "filename": "image.png",
      "size": 524288,
      "upload_date": "2025-12-05 11:15:00",
      "url": "/data/attachments/note_123/image.png"
    }
  ]
}
```

---

### Upload Attachment

Upload a file and attach it to a note.

**Endpoint:** `POST /api_attachments.php`

**Content-Type:** `multipart/form-data`

**Form Parameters:**
- `action` - Must be `"upload"`
- `note_id` (required) - Note ID
- `file` (required) - File to upload

**Example:**
```bash
curl -X POST -u 'username:password' \
  -F "action=upload" \
  -F "note_id=123" \
  -F "file=@/path/to/file.pdf" \
  http://localhost:8040/api_attachments.php
```

**Response:**
```json
{
  "success": true,
  "filename": "file.pdf",
  "size": 1048576,
  "url": "/data/attachments/note_123/file.pdf",
  "message": "File uploaded successfully"
}
```

---

### Delete Attachment

Delete an attachment from a note.

**Endpoint:** `POST /api_attachments.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `action` - Must be `"delete"`
- `note_id` (required) - Note ID
- `filename` (required) - Filename to delete

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete",
    "note_id": 123,
    "filename": "document.pdf"
  }' \
  http://localhost:8040/api_attachments.php
```

**Response:**
```json
{
  "success": true,
  "message": "Attachment deleted successfully"
}
```

---

## Backup Management

### Create Backup

Create a complete backup of all notes, attachments, and database.

**Endpoint:** `POST /api_backup.php`

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  http://localhost:8040/api_backup.php
```

**Response:**
```json
{
  "success": true,
  "filename": "poznote_backup_2025-12-05_14-30-15.zip",
  "size": 5242880,
  "message": "Backup created successfully"
}
```

---

### List Backups

Get a list of all available backup files.

**Endpoint:** `GET /api_list_backups.php`

**Example:**
```bash
curl -u 'username:password' \
  http://localhost:8040/api_list_backups.php
```

**Response:**
```json
{
  "success": true,
  "backups": [
    {
      "filename": "poznote_backup_2025-12-05_14-30-15.zip",
      "size": 5242880,
      "date": "2025-12-05 14:30:15"
    },
    {
      "filename": "poznote_backup_2025-12-04_14-30-15.zip",
      "size": 5120000,
      "date": "2025-12-04 14:30:15"
    }
  ]
}
```

---

### Download Backup

Download a specific backup file.

**Endpoint:** `GET /api_download_backup.php?filename={name}`

**Parameters:**
- `filename` (required) - Backup filename

**Example:**
```bash
curl -u 'username:password' \
  "http://localhost:8040/api_download_backup.php?filename=poznote_backup_2025-12-05_14-30-15.zip" \
  -o backup.zip
```

**Response:** ZIP file download

---

### Delete Backup

Delete a specific backup file.

**Endpoint:** `POST /api_delete_backup.php`

**Content-Type:** `application/json`

**Body Parameters:**
- `filename` (required) - Backup filename to delete

**Example:**
```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"filename": "poznote_backup_2025-12-04_14-30-15.zip"}' \
  http://localhost:8040/api_delete_backup.php
```

**Response:**
```json
{
  "success": true,
  "message": "Backup deleted successfully"
}
```

---

## System Information

### Check Version

Get the current Poznote version and system information.

**Endpoint:** `GET /api_version.php`

**Example:**
```bash
curl -u 'username:password' \
  http://localhost:8040/api_version.php
```

**Response:**
```json
{
  "success": true,
  "version": "1.2.0",
  "php_version": "8.2.10",
  "sqlite_version": "3.42.0",
  "server_time": "2025-12-05 14:30:15"
}
```

---

### Check Updates

Check if a newer version is available.

**Endpoint:** `GET /api_check_updates.php`

**Example:**
```bash
curl -u 'username:password' \
  http://localhost:8040/api_check_updates.php
```

**Response (update available):**
```json
{
  "success": true,
  "update_available": true,
  "current_version": "1.2.0",
  "latest_version": "1.3.0",
  "release_url": "https://github.com/timothepoznanski/poznote/releases/tag/v1.3.0"
}
```

**Response (up to date):**
```json
{
  "success": true,
  "update_available": false,
  "current_version": "1.2.0",
  "message": "You are running the latest version"
}
```

---

## Interactive Documentation

### Swagger UI

Poznote includes **Swagger UI** for interactive API documentation.

**Access:** Settings > API Documentation

Or directly at: `http://localhost:8040/api-docs/`

**Features:**
- Browse all endpoints
- View request/response schemas
- Test API calls directly from the browser
- Try authentication with your credentials
- See examples for each endpoint

### OpenAPI Specification

The complete API specification is available in OpenAPI 3.0 format:

**Location:** `/api-docs/openapi.yaml`

**Download:**
```bash
curl -u 'username:password' \
  http://localhost:8040/api-docs/openapi.yaml \
  -o poznote-api.yaml
```

Use this file to:
- Generate API clients in various languages
- Import into API testing tools (Postman, Insomnia)
- Auto-generate documentation

---

## Rate Limiting

Currently, there are **no rate limits** on the API. However, consider:

- Be reasonable with request frequency
- Use caching where appropriate
- Batch operations when possible

Future versions may implement rate limiting for security.

---

## Error Codes

Common error codes you may encounter:

| Code | Description |
|------|-------------|
| `401` | Authentication failed |
| `403` | Forbidden - insufficient permissions |
| `404` | Resource not found |
| `400` | Bad request - invalid parameters |
| `500` | Internal server error |

---

## Code Examples

### Python Example

```python
import requests
import json

# Configuration
BASE_URL = "http://localhost:8040"
AUTH = ("admin", "admin123!")

# Create a note
def create_note(title, content, tags=None):
    response = requests.post(
        f"{BASE_URL}/api_create_note.php",
        auth=AUTH,
        json={
            "heading": title,
            "entrycontent": content,
            "tags": tags or "",
            "workspace": "Personal"
        }
    )
    return response.json()

# List all notes
def list_notes():
    response = requests.get(
        f"{BASE_URL}/api_list_notes.php",
        auth=AUTH
    )
    return response.json()

# Example usage
result = create_note(
    title="My Python Note",
    content="<p>Created via API</p>",
    tags="python,api"
)
print(f"Created note ID: {result.get('note_id')}")

notes = list_notes()
print(f"Total notes: {len(notes.get('notes', []))}")
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:8040';
const AUTH = {
  username: 'admin',
  password: 'admin123!'
};

// Create a note
async function createNote(title, content, tags = '') {
  const response = await axios.post(
    `${BASE_URL}/api_create_note.php`,
    {
      heading: title,
      entrycontent: content,
      tags: tags,
      workspace: 'Personal'
    },
    { auth: AUTH }
  );
  return response.data;
}

// List all notes
async function listNotes() {
  const response = await axios.get(
    `${BASE_URL}/api_list_notes.php`,
    { auth: AUTH }
  );
  return response.data;
}

// Example usage
(async () => {
  const result = await createNote(
    'My JavaScript Note',
    '<p>Created via API</p>',
    'javascript,api'
  );
  console.log(`Created note ID: ${result.note_id}`);

  const notes = await listNotes();
  console.log(`Total notes: ${notes.notes.length}`);
})();
```

### PHP Example

```php
<?php

$baseUrl = 'http://localhost:8040';
$username = 'admin';
$password = 'admin123!';

// Create a note
function createNote($title, $content, $tags = '') {
    global $baseUrl, $username, $password;
    
    $ch = curl_init($baseUrl . '/api_create_note.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_USERPWD, "$username:$password");
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'heading' => $title,
        'entrycontent' => $content,
        'tags' => $tags,
        'workspace' => 'Personal'
    ]));
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return json_decode($response, true);
}

// List all notes
function listNotes() {
    global $baseUrl, $username, $password;
    
    $ch = curl_init($baseUrl . '/api_list_notes.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERPWD, "$username:$password");
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return json_decode($response, true);
}

// Example usage
$result = createNote(
    'My PHP Note',
    '<p>Created via API</p>',
    'php,api'
);
echo "Created note ID: " . $result['note_id'] . "\n";

$notes = listNotes();
echo "Total notes: " . count($notes['notes']) . "\n";
```

---

## Need More?

### Missing an Endpoint?

If you need additional REST API functionality that isn't currently available, feel free to:

- [Open an issue on GitHub](https://github.com/timothepoznanski/poznote/issues)
- Describe your use case
- Suggest the endpoint functionality

We're always looking to improve the API based on community feedback!

---

## Related Guides

- [Installation Guide](Installation-Guide)
- [Backup and Restore](Backup-and-Restore)
- [Configuration](Configuration)
- [Tech Stack](Tech-Stack)
