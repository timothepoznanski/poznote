# Poznote REST API Documentation

Poznote provides a comprehensive RESTful API v1 for programmatic access to notes, folders, workspaces, tags, attachments, backups, settings, and more.

## Table of Contents

- [Authentication](#authentication)
- [Multi-User Mode](#multi-user-mode)
- [Base URL](#base-url)
- [Response Format](#response-format)
- [HTTP Status Codes](#http-status-codes)
- [Interactive Documentation (Swagger)](#interactive-documentation-swagger)
- [Notes](#notes)
- [Note Sharing](#note-sharing)
- [Folder Sharing](#folder-sharing)
- [Backlinks](#backlinks)
- [Folders](#folders)
- [Trash](#trash)
- [Workspaces](#workspaces)
- [Tags](#tags)
- [Attachments](#attachments)
- [Backups](#backups)
- [Export (Legacy)](#export-legacy)
- [Settings](#settings)
- [System](#system)
- [Git Sync](#git-sync)
- [User Profile](#user-profile)
- [Admin (User Management)](#admin-user-management)
- [Public / Shared Tasks](#public--shared-tasks)
- [Health Check](#health-check)

---

## Authentication

All API endpoints (except public ones) require authentication. For user-facing integrations, use HTTP Basic Authentication. Poznote also accepts the internal Bearer token used by the MCP server.

```bash
curl -u 'username:password' http://YOUR_SERVER/api/v1/notes
```

Use the current password of the profile you authenticate with. Default local passwords are `admin` for administrators and `user` for standard users until they are changed in the Poznote UI.

### Authentication Levels

| Level | Description | Used by |
|-------|-------------|---------|
| **No auth** | No credentials needed | `GET /api/v1/users/profiles`, `GET /api_health.php`, Public tasks |
| **User auth** | Valid credentials, no `X-User-ID` needed | `/api/v1/users/me`, `/api/v1/system/*`, `/api/v1/shared/*` |
| **Data auth** | Valid credentials + `X-User-ID` header | All user data endpoints (notes, folders, tags, etc.) |
| **Admin auth** | Admin credentials, no `X-User-ID` needed | `/api/v1/admin/*`, `/api/v1/users/lookup/*` |

---

## Multi-User Mode

Poznote supports multiple user profiles, each with their own isolated data. For API calls that access **user data** (notes, folders, workspaces, tags, attachments, backups, settings, etc.), you must include the `X-User-ID` header:

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes
```

**Endpoints that do NOT require the `X-User-ID` header:**
- **Admin endpoints**: `/api/v1/admin/*`
- **Public endpoints**: `/api/v1/users/profiles`
- **User profile endpoints**: `/api/v1/users/me`, `/api/v1/users/me/password`, `/api/v1/users/me/password-status`
- **System endpoints**: `/api/v1/system/*` (version, updates, i18n)
- **Shared endpoints**: `/api/v1/shared`, `/api/v1/shared/with-me`

Use `GET /api/v1/users/profiles` to list available user profiles and their IDs.

---

## Base URL

```
/api/v1
```

All endpoints in this document are relative to this base URL unless otherwise noted (legacy endpoints use full paths).

---

## Response Format

All endpoints return JSON. Successful responses typically follow this structure:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error description"
}
```

---

## HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | OK – Request succeeded |
| `201` | Created – Resource created successfully |
| `204` | No Content – CORS preflight |
| `400` | Bad Request – Invalid parameters |
| `401` | Unauthorized – Missing or invalid credentials |
| `403` | Forbidden – Insufficient permissions |
| `404` | Not Found – Resource does not exist |
| `405` | Method Not Allowed |
| `409` | Conflict – Resource already exists |
| `413` | Payload Too Large |
| `500` | Internal Server Error |

---

## Interactive Documentation (Swagger)

Access the **Swagger UI** directly from Poznote at `Settings > API Documentation` to browse all endpoints, view request/response schemas, and test API calls interactively.

---

## Notes

### List Notes

```
GET /notes
```

List all notes for a user with optional filtering and sorting.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace name |
| `folder` | string | Filter by folder name |
| `folder_id` | integer | Filter by folder ID |
| `tag` | string | Filter by tag |
| `search` | string | Search in heading and content |
| `favorite` | boolean | Filter favorites only |
| `sort` | string | Sort order: `updated_desc`, `created_desc`, `heading_asc` |
| `get_folders` | boolean | Include folder information |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes
```

Filter notes by workspace, folder, and tag:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes?workspace=Personal&folder=Projects&tag=important"
```

### List Notes with Attachments

```
GET /notes/with-attachments
```

List all notes that have file attachments.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/with-attachments
```

### Get Note

```
GET /notes/{id}
```

Get a specific note by ID, including its content.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123
```

### Resolve Note by Reference

```
GET /notes/resolve
```

Resolve a note by title (reference) inside a workspace.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `reference` | string | Note title to search for |
| `workspace` | string | Workspace to search in |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes/resolve?reference=My+Note&workspace=Personal"
```

### Search Notes

```
GET /notes/search
```

Search notes by heading or content.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes/search?q=docker"
```

### Create Note

```
POST /notes
```

Create a new note with title, content, tags, folder and workspace.

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `heading` | string | Yes | Note title |
| `content` | string | No | Note content (HTML or Markdown) |
| `entry` | string | No | Alternative field for content |
| `tags` | string | No | Comma-separated tags |
| `folder_id` | integer | No | Target folder ID |
| `folder` | string | No | Target folder name |
| `workspace` | string | No | Target workspace |
| `type` | string | No | Note type: `note` (HTML), `markdown`, `tasklist` |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "My New Note",
    "content": "This is the content of my note",
    "tags": "work,important",
    "folder_id": 12,
    "workspace": "Personal",
    "type": "markdown"
  }' \
  http://YOUR_SERVER/api/v1/notes
```

### Update Note

```
PATCH /notes/{id}
```

Update an existing note by ID. Only include fields you want to modify.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `heading` | string | Updated title |
| `content` | string | Updated content |
| `tags` | string | Updated comma-separated tags |
| `folder_id` | integer | Move to folder |
| `workspace` | string | Move to workspace |
| `git_push` | boolean | Trigger Git sync after update |

```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "heading": "Updated Title",
    "content": "Updated content here",
    "tags": "work,updated"
  }' \
  http://YOUR_SERVER/api/v1/notes/123
```

### Delete Note

```
DELETE /notes/{id}
```

Move a note to trash (soft delete by default).

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `permanent` | boolean | If `true`, permanently delete (bypass trash) |

Move to trash:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123
```

Permanently delete:
```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/notes/123?permanent=true"
```

### Restore Note

```
POST /notes/{id}/restore
```

Restore a note from trash.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/restore
```

### Duplicate Note

```
POST /notes/{id}/duplicate
```

Create a copy of an existing note.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/duplicate
```

### Create Template from Note

```
POST /notes/{id}/create-template
```

Create a reusable template from an existing note.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/create-template
```

### Convert Note Type

```
POST /notes/{id}/convert
```

Convert a note between Markdown and HTML formats.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/convert
```

### Update Tags

```
PUT /notes/{id}/tags
```

Replace all tags on a note.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `tags` | string | Comma-separated tag list |

```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"tags": "work,urgent,meeting"}' \
  http://YOUR_SERVER/api/v1/notes/123/tags
```

### Toggle Favorite

```
POST /notes/{id}/favorite
```

Toggle favorite status for a note.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/favorite
```

### Move Note to Folder

```
POST /notes/{id}/folder
```

Move a note to a different folder.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `folder_id` | integer | Target folder ID |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"folder_id": 45}' \
  http://YOUR_SERVER/api/v1/notes/123/folder
```

### Remove Note from Folder

```
POST /notes/{id}/remove-folder
```

Remove a note from its folder (move to root).

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/remove-folder
```

### Emergency Save (Beacon)

```
POST /notes/{id}/beacon
```

Emergency save via `sendBeacon` API. Accepts FormData instead of JSON. Used internally by the browser when navigating away or closing the page.

---

## Note Sharing

### Get Share Status

```
GET /notes/{id}/share
```

Check if a note is shared and get share details.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/share
```

### Create Share Link

```
POST /notes/{id}/share
```

Create a public share link for a note.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `theme` | string | Display theme: `light` or `dark` |
| `indexable` | boolean | Allow search engine indexing |
| `password` | string | Optional password protection |
| `custom_token` | string | Custom URL token (slug) |
| `access_mode` | string | Access mode for the share |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light",
    "indexable": false,
    "password": "optional-password"
  }' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

### Update Share Settings

```
PATCH /notes/{id}/share
```

Update share settings on an existing share.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `theme` | string | Display theme |
| `indexable` | boolean | Allow indexing |
| `password` | string | Password protection |
| `custom_token` | string | Custom URL token |
| `access_mode` | string | Access mode |
| `allowed_users` | array | User IDs with access |

```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"theme": "dark", "indexable": true}' \
  http://YOUR_SERVER/api/v1/notes/123/share
```

### Revoke Share Link

```
DELETE /notes/{id}/share
```

Remove sharing access for a note.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/share
```

### List All Shared Notes

```
GET /shared
```

Get list of all shared notes and folders. Does not require the `X-User-ID` header.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/shared
```

### List Items Shared With Me

```
GET /shared/with-me
```

List notes and folders shared with the current user by other users.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/shared/with-me
```

---

## Folder Sharing

### Get Folder Share Status

```
GET /folders/{id}/share
```

Check if a folder is shared.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/5/share
```

### Create Folder Share Link

```
POST /folders/{id}/share
```

Share a folder. All notes in the folder will also be shared.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `theme` | string | Display theme: `light` or `dark` |
| `indexable` | integer | Allow indexing (`0` or `1`) |
| `password` | string | Optional password protection |
| `custom_token` | string | Custom URL slug |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light",
    "indexable": 0,
    "password": "optional-password"
  }' \
  http://YOUR_SERVER/api/v1/folders/5/share
```

With custom token:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"custom_token": "my-shared-folder"}' \
  http://YOUR_SERVER/api/v1/folders/5/share
```

### Update Folder Share Settings

```
PATCH /folders/{id}/share
```

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `indexable` | integer | Allow indexing |
| `password` | string | Password protection |
| `custom_token` | string | Custom token |
| `allowed_users` | array | User IDs with access |

```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"indexable": 1, "password": "new-password"}' \
  http://YOUR_SERVER/api/v1/folders/5/share
```

### Revoke Folder Share Link

```
DELETE /folders/{id}/share
```

Revoke folder sharing. All notes in the folder will also be unshared.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/5/share
```

---

## Backlinks

### Get Backlinks

```
GET /notes/{id}/backlinks
```

Get all notes that link to this note. Supports HTML links, URL parameters, and wiki-link syntax `[[Note Title]]`.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/backlinks
```

---

## Folders

### List Folders

```
GET /folders
```

List all folders in a workspace.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace |
| `tree` | boolean | Return hierarchical tree structure |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/folders?workspace=Personal"
```

Get folder tree (nested structure):
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/folders?workspace=Personal&tree=true"
```

### Get Folder

```
GET /folders/{id}
```

Get details of a specific folder.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12
```

### Get Folder Counts

```
GET /folders/counts
```

Get note counts for all folders.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/folders/counts?workspace=Personal"
```

### Get Suggested Folders

```
GET /folders/suggested
```

Get a list of suggested folders based on usage patterns.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/suggested
```

### Get Folder Path

```
GET /folders/{id}/path
```

Get the full breadcrumb path for a folder.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12/path
```

### Get Note Count in Folder

```
GET /folders/{id}/notes
```

Get the number of notes in a folder (recursive).

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12/notes
```

### Create Folder

```
POST /folders
```

Create a new folder.

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Folder name |
| `workspace` | string | No | Target workspace |
| `parent_id` | integer | No | Parent folder ID (for subfolders) |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Projects",
    "workspace": "Personal"
  }' \
  http://YOUR_SERVER/api/v1/folders
```

Create a subfolder:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "2024",
    "workspace": "Personal",
    "parent_id": 12
  }' \
  http://YOUR_SERVER/api/v1/folders
```

### Rename Folder

```
PATCH /folders/{id}
```

Rename an existing folder.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New folder name |

```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Folder Name"}' \
  http://YOUR_SERVER/api/v1/folders/12
```

### Move Folder

```
POST /folders/{id}/move
```

Move folder to a different parent or workspace.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `parent_id` | integer\|null | New parent folder ID (`null` for root) |
| `target_workspace` | string | Target workspace (for cross-workspace move) |

Move to another parent:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"parent_id": 56}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

Move to root:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"parent_id": null}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

Move to another workspace:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"target_workspace": "New Workspace", "parent_id": null}' \
  http://YOUR_SERVER/api/v1/folders/34/move
```

### Move Files Between Folders

```
POST /folders/move-files
```

Move all files from one folder to another.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `source_folder_id` | integer | Source folder ID |
| `target_folder_id` | integer | Target folder ID |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"source_folder_id": 10, "target_folder_id": 20}' \
  http://YOUR_SERVER/api/v1/folders/move-files
```

### Create Kanban Structure

```
POST /folders/kanban-structure
```

Create a Kanban board folder structure.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"workspace": "Personal", "name": "Project Board"}' \
  http://YOUR_SERVER/api/v1/folders/kanban-structure
```

### Update Folder Icon

```
PUT /folders/{id}/icon
```

Set a custom icon for a folder.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `icon` | string | Icon class name (e.g. `fa-folder-open`) |

```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"icon": "fa-folder-open"}' \
  http://YOUR_SERVER/api/v1/folders/12/icon
```

### Empty Folder

```
POST /folders/{id}/empty
```

Move all notes in a folder to trash.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12/empty
```

### Delete Folder

```
DELETE /folders/{id}
```

Delete a folder.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/folders/12
```

---

## Trash

### List Trash

```
GET /trash
```

Get all notes in trash.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace |
| `search` | string | Search in trashed notes |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/trash
```

Filter by workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/trash?workspace=Personal"
```

### Empty Trash

```
DELETE /trash
```

Permanently delete all notes in trash.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Only empty trash for a specific workspace |

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/trash
```

### Permanently Delete Note from Trash

```
DELETE /trash/{id}
```

Delete a specific note permanently from trash.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/trash/123
```

---

## Workspaces

### List Workspaces

```
GET /workspaces
```

Get all workspaces.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/workspaces
```

### Create Workspace

```
POST /workspaces
```

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Workspace name |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"name": "MyProject"}' \
  http://YOUR_SERVER/api/v1/workspaces
```

### Rename Workspace

```
PATCH /workspaces/{name}
```

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `new_name` | string | New workspace name |

```bash
curl -X PATCH -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"new_name": "NewName"}' \
  http://YOUR_SERVER/api/v1/workspaces/OldName
```

### Delete Workspace

```
DELETE /workspaces/{name}
```

Delete a workspace and all its contents.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/workspaces/OldWorkspace
```

---

## Tags

### List Tags

```
GET /tags
```

Get all unique tags.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/tags
```

Filter by workspace:
```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api/v1/tags?workspace=Personal"
```

---

## Attachments

### List Attachments

```
GET /notes/{noteId}/attachments
```

Get all attachments for a specific note.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Workspace context |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/attachments
```

### Upload Attachment

```
POST /notes/{noteId}/attachments
```

Upload a file attachment to a note.

**Request Body (multipart/form-data):**

| Field | Type | Description |
|-------|------|-------------|
| `file` | file | The file to upload |
| `workspace` | string | Workspace context |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -F "file=@/path/to/file.pdf" \
  http://YOUR_SERVER/api/v1/notes/123/attachments
```

### Download Attachment

```
GET /notes/{noteId}/attachments/{attachmentId}
```

Download a specific attachment. This endpoint also supports unauthenticated access for publicly shared notes using the `token` query parameter.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Workspace context |
| `token` | string | Public share token (for shared notes) |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/attachments/456 \
  -o downloaded-file.pdf
```

### Delete Attachment

```
DELETE /notes/{noteId}/attachments/{attachmentId}
```

Delete an attachment from a note.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/notes/123/attachments/456
```

---

## Backups

### List Backups

```
GET /backups
```

Get a list of all backup files with sizes and timestamps.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups
```

### Create Backup

```
POST /backups
```

Create a complete backup ZIP containing database, all notes, and attachments.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups
```

### Download Backup

```
GET /backups/{filename}
```

Download a specific backup file.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip \
  -o backup.zip
```

### Upload Backup

```
POST /backups/upload
```

Upload a local backup ZIP to the server's backup directory. The file is stored with a standard timestamped name and its `filename` is returned for use with the restore endpoint.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -F "file=@demo.zip" \
  http://YOUR_SERVER/api/v1/backups/upload
```

**Response (201):**

```json
{
  "success": true,
  "filename": "poznote_backup_2025-01-05_12-00-00.zip",
  "size": 102400,
  "size_mb": 0.1,
  "restore_url": "/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip/restore",
  "download_url": "/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip"
}
```

### Restore Backup

```
POST /backups/{filename}/restore
```

Restore a backup file. This replaces all current user data.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip/restore
```

### Delete Backup

```
DELETE /backups/{filename}
```

Delete a backup file.

```bash
curl -X DELETE -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/backups/poznote_backup_2025-01-05_12-00-00.zip
```

---

## Export (Legacy)

These endpoints use legacy URL paths (not under `/api/v1`) and are primarily used for file downloads.

### Export Note

Export a single note in various formats.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Note ID (required) |
| `format` | string | `html`, `markdown`, or `json` |
| `type` | string | Note type hint |
| `disposition` | string | `attachment` (download) or `inline` (display) |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_export_note.php?id=123&format=html" \
  -o exported-note.html
```

### Export Folder

Export a folder as ZIP.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `folder_id` | integer | Folder ID |
| `workspace` | string | Workspace filter |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_export_folder.php?folder_id=123" \
  -o folder-export.zip
```

### Export Structured Notes

Export all notes preserving folder hierarchy.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Workspace filter |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_export_structured.php?workspace=Personal" \
  -o structured-export.zip
```

### Export All Notes

Export all note files as ZIP.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Workspace filter (optional) |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api_export_entries.php \
  -o all-notes.zip
```

### Export All Attachments

Export all attachments as ZIP with metadata.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api_export_attachments.php \
  -o all-attachments.zip
```

### Download Note (with styling)

Download a note file with proper headers and inline styling.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Note ID (required) |
| `type` | string | Note type hint |

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  "http://YOUR_SERVER/api_download_note.php?id=123" \
  -o note.html
```

---

## Settings

### Get Setting

```
GET /settings/{key}
```

Get a setting value (user-level or global).

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/settings/language
```

### Update Setting

```
PUT /settings/{key}
```

Set a setting value. Global settings require admin privileges.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `value` | mixed | The setting value |

```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"value": "fr"}' \
  http://YOUR_SERVER/api/v1/settings/language
```

**Global settings (admin only):**
- `login_display_name`
- `custom_css_path` *(read-only via this API — use `POST /api_upload_css.php` to upload a file or `DELETE /api_upload_css.php` to remove it)*
- `git_sync_enabled`
- `import_max_individual_files`
- `import_max_zip_files`

---

## System

System endpoints do **not** require the `X-User-ID` header.

### Get Version

```
GET /system/version
```

Get current version and system information.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/system/version
```

### Check for Updates

```
GET /system/updates
```

Check if a newer version is available on GitHub.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/system/updates
```

### Get Translations

```
GET /system/i18n
```

Get translation/localization strings.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `lang` | string | Language code (e.g. `fr`, `en`) |

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/system/i18n
```

---

## Git Sync

Git sync endpoints allow managing synchronization with GitHub or Forgejo repositories. Each user configures their own repository independently.

Both `/git-sync/` and `/github-sync/` prefixes are supported (the latter is a legacy alias).

### Get Sync Status

```
GET /git-sync/status
```

Get Git sync configuration and status.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/git-sync/status
```

### Test Connection

```
POST /git-sync/test
```

Test the Git connection and credentials.

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/git-sync/test
```

### Push Notes

```
POST /git-sync/push
```

Push notes to the configured Git repository.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `workspace` | string | Workspace to push (optional, pushes all if omitted) |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/git-sync/push
```

Push a specific workspace:
```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{"workspace": "Personal"}' \
  http://YOUR_SERVER/api/v1/git-sync/push
```

### Pull Notes

```
POST /git-sync/pull
```

Pull notes from the configured Git repository.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `workspace` | string | Workspace to pull (optional, pulls all if omitted) |

```bash
curl -X POST -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/git-sync/pull
```

### Get Sync Progress

```
GET /git-sync/progress
```

Get the current sync progress from the session.

```bash
curl -u 'username:password' -H "X-User-ID: 1" \
  http://YOUR_SERVER/api/v1/git-sync/progress
```

### Save Git Configuration

```
PUT /git-sync/config
```

Save per-user Git sync configuration.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `provider` | string | `github` or `forgejo` |
| `repo` | string | Repository in `owner/repo` format |
| `token` | string | Access token (PAT) |
| `branch` | string | Git branch (default: `main`) |
| `api_base` | string | API base URL (Forgejo only) |
| `author_name` | string | Commit author name |
| `author_email` | string | Commit author email |

```bash
curl -X PUT -u 'username:password' -H "X-User-ID: 1" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github",
    "repo": "username/my-notes",
    "token": "ghp_xxxxxxxxxxxx",
    "branch": "main",
    "author_name": "John",
    "author_email": "john@example.com"
  }' \
  http://YOUR_SERVER/api/v1/git-sync/config
```

---

## User Profile

### List User Profiles (Public)

```
GET /users/profiles
```

Get list of active user profiles for the login selector. **No authentication required.**

```bash
curl http://YOUR_SERVER/api/v1/users/profiles
```

### Get Current User

```
GET /users/me
```

Get the current authenticated user's profile.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/users/me
```

### Change Password

```
POST /users/me/password
```

Change the current user's password.

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `old_password` | string | Yes | Current password |
| `new_password` | string | Yes | New password |

```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"old_password": "current", "new_password": "newpass"}' \
  http://YOUR_SERVER/api/v1/users/me/password
```

### Get Password Status

```
GET /users/me/password-status
```

Check whether the current user has a custom password or is using the `.env` fallback.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/users/me/password-status
```

---

## Admin (User Management)

Admin endpoints require administrator credentials and do **not** require the `X-User-ID` header.

### List All Users with Statistics

```
GET /admin/users
```

Get detailed list of all users with storage info.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users
```

### Get Specific User

```
GET /admin/users/{id}
```

Get detailed information about a user.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users/1
```

### Create User

```
POST /admin/users
```

Create a new user profile.

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Username |
| `email` | string | No | Email address |

```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser"}' \
  http://YOUR_SERVER/api/v1/admin/users
```

### Update User

```
PATCH /admin/users/{id}
```

Update user properties.

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `username` | string | New username |
| `active` | boolean | Active status |
| `is_admin` | boolean | Admin privileges |

```bash
curl -X PATCH -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{
    "username": "renameduser",
    "active": true,
    "is_admin": false
  }' \
  http://YOUR_SERVER/api/v1/admin/users/2
```

### Delete User

```
DELETE /admin/users/{id}
```

Delete a user profile.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `delete_data` | boolean | If `true`, also delete all user data |

Delete profile only:
```bash
curl -X DELETE -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users/2
```

Delete profile and all data:
```bash
curl -X DELETE -u 'username:password' \
  "http://YOUR_SERVER/api/v1/admin/users/2?delete_data=true"
```

### Reset User Password

```
POST /admin/users/{id}/reset-password
```

Reset or set a custom password for a user.

```bash
curl -X POST -u 'username:password' \
  -H "Content-Type: application/json" \
  -d '{"password": "new-password"}' \
  http://YOUR_SERVER/api/v1/admin/users/2/reset-password
```

### Get User Password Status

```
GET /admin/users/{id}/password-status
```

Check whether a user has a custom password or is using the `.env` fallback.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/users/2/password-status
```

### Lookup User by Username

```
GET /users/lookup/{username}
```

Get user ID by username. Admin only. Used by backup scripts.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/users/lookup/Nina
```

### Get System Statistics

```
GET /admin/stats
```

Get aggregated statistics for all users.

```bash
curl -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/stats
```

### Repair Master Database

```
POST /admin/repair
```

Scan and rebuild the master database registry.

```bash
curl -X POST -u 'username:password' \
  http://YOUR_SERVER/api/v1/admin/repair
```

---

## Public / Shared Tasks

These endpoints manage interactive tasks on publicly shared notes. They use a `token` query parameter for authentication instead of HTTP Basic Auth.

### Update Task

```
PATCH /public/tasks/{id}
```

Update a task's status or text on a shared note.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | Public share token |

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `completed` | boolean | Task completion status |
| `text` | string | Task text |

```bash
curl -X PATCH \
  -H "Content-Type: application/json" \
  -d '{"completed": true}' \
  "http://YOUR_SERVER/api/v1/public/tasks/0?token=abc123"
```

### Add Task

```
POST /public/tasks
```

Add a new task to a shared task list.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | Public share token |

**Request Body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Task text |

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"text": "New task item"}' \
  "http://YOUR_SERVER/api/v1/public/tasks?token=abc123"
```

### Delete Task

```
DELETE /public/tasks/{id}
```

Delete a task from a shared task list.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | Public share token |

```bash
curl -X DELETE \
  "http://YOUR_SERVER/api/v1/public/tasks/0?token=abc123"
```

---

---

## Health Check

```
GET /api_health.php
```

Health check endpoint. **No authentication required.** Returns service status, name, and version.

```bash
curl http://YOUR_SERVER/api_health.php
```

**Response:**
```json
{
  "status": "ok",
  "service": "poznote",
  "version": "x.x.x"
}
```

---

## Endpoint Reference (Quick Summary)

### Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notes` | List notes |
| `GET` | `/notes/with-attachments` | List notes with attachments |
| `GET` | `/notes/resolve` | Resolve note by reference |
| `GET` | `/notes/search` | Search notes |
| `GET` | `/notes/{id}` | Get note |
| `POST` | `/notes` | Create note |
| `PATCH` | `/notes/{id}` | Update note |
| `DELETE` | `/notes/{id}` | Delete note |
| `POST` | `/notes/{id}/restore` | Restore from trash |
| `POST` | `/notes/{id}/duplicate` | Duplicate note |
| `POST` | `/notes/{id}/create-template` | Create template |
| `POST` | `/notes/{id}/convert` | Convert type |
| `POST` | `/notes/{id}/beacon` | Emergency save |
| `PUT` | `/notes/{id}/tags` | Update tags |
| `POST` | `/notes/{id}/favorite` | Toggle favorite |
| `POST` | `/notes/{id}/folder` | Move to folder |
| `POST` | `/notes/{id}/remove-folder` | Remove from folder |

### Note Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notes/{id}/share` | Get share status |
| `POST` | `/notes/{id}/share` | Create share link |
| `PATCH` | `/notes/{id}/share` | Update share settings |
| `DELETE` | `/notes/{id}/share` | Revoke share |
| `GET` | `/shared` | List shared notes |
| `GET` | `/shared/with-me` | Shared with me |

### Backlinks
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notes/{id}/backlinks` | Get backlinks |

### Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/folders` | List folders |
| `GET` | `/folders/counts` | Folder counts |
| `GET` | `/folders/suggested` | Suggested folders |
| `GET` | `/folders/{id}` | Get folder |
| `GET` | `/folders/{id}/notes` | Note count |
| `GET` | `/folders/{id}/path` | Folder path |
| `POST` | `/folders` | Create folder |
| `PATCH` | `/folders/{id}` | Rename folder |
| `DELETE` | `/folders/{id}` | Delete folder |
| `POST` | `/folders/{id}/move` | Move folder |
| `POST` | `/folders/{id}/empty` | Empty folder |
| `PUT` | `/folders/{id}/icon` | Update icon |
| `POST` | `/folders/move-files` | Move files |
| `POST` | `/folders/kanban-structure` | Create Kanban |

### Folder Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/folders/{id}/share` | Get share status |
| `POST` | `/folders/{id}/share` | Create share link |
| `PATCH` | `/folders/{id}/share` | Update share |
| `DELETE` | `/folders/{id}/share` | Revoke share |

### Trash
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/trash` | List trash |
| `DELETE` | `/trash` | Empty trash |
| `DELETE` | `/trash/{id}` | Delete from trash |

### Workspaces
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/workspaces` | List workspaces |
| `POST` | `/workspaces` | Create workspace |
| `PATCH` | `/workspaces/{name}` | Rename workspace |
| `DELETE` | `/workspaces/{name}` | Delete workspace |

### Tags
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tags` | List tags |

### Attachments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notes/{noteId}/attachments` | List attachments |
| `POST` | `/notes/{noteId}/attachments` | Upload attachment |
| `GET` | `/notes/{noteId}/attachments/{id}` | Download attachment |
| `DELETE` | `/notes/{noteId}/attachments/{id}` | Delete attachment |

### Backups
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/backups` | List backups |
| `POST` | `/backups` | Create backup |
| `GET` | `/backups/{filename}` | Download backup |
| `POST` | `/backups/upload` | Upload backup ZIP |
| `POST` | `/backups/{filename}/restore` | Restore backup |
| `DELETE` | `/backups/{filename}` | Delete backup |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/settings/{key}` | Get setting |
| `PUT` | `/settings/{key}` | Update setting |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/system/version` | Version info |
| `GET` | `/system/updates` | Check updates |
| `GET` | `/system/i18n` | Translations |

### Git Sync
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/git-sync/status` | Sync status |
| `POST` | `/git-sync/test` | Test connection |
| `POST` | `/git-sync/push` | Push notes |
| `POST` | `/git-sync/pull` | Pull notes |
| `GET` | `/git-sync/progress` | Sync progress |
| `PUT` | `/git-sync/config` | Save config |

### User Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/profiles` | List profiles (public) |
| `GET` | `/users/me` | Current user |
| `POST` | `/users/me/password` | Change password |
| `GET` | `/users/me/password-status` | Password status |
| `GET` | `/users/lookup/{username}` | Lookup by name |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users` | List users |
| `GET` | `/admin/users/{id}` | Get user |
| `POST` | `/admin/users` | Create user |
| `PATCH` | `/admin/users/{id}` | Update user |
| `DELETE` | `/admin/users/{id}` | Delete user |
| `POST` | `/admin/users/{id}/reset-password` | Reset password |
| `GET` | `/admin/users/{id}/password-status` | Password status |
| `GET` | `/admin/stats` | System stats |
| `POST` | `/admin/repair` | Repair database |

### Public Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/public/tasks/{id}` | Update task |
| `POST` | `/public/tasks` | Add task |
| `DELETE` | `/public/tasks/{id}` | Delete task |
