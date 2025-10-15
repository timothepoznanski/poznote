# Poznote API Documentation

Complete REST API documentation for Poznote.

## 📚 Access Documentation

### Swagger UI (Interactive)
Access the interactive API documentation at:
```
http://your-server/src/api-docs.php
```

This interface allows you to:
- Browse all available endpoints
- See detailed request/response schemas
- Test API calls directly from your browser
- Download the OpenAPI specification

### OpenAPI Specification
The OpenAPI 3.0 specification file is available at:
```
http://your-server/src/openapi.yaml
```

## 🔐 Authentication

All API endpoints require authentication. Poznote supports three authentication methods:

### 1. API Key (Recommended)
Add your API key in the request header:
```bash
X-API-Key: your-api-key-here
```

### 2. HTTP Basic Auth
Use HTTP Basic Authentication with username and password:
```bash
Authorization: Basic base64(username:password)
```

### 3. Session Cookie
Use a valid PHP session cookie (PHPSESSID) obtained after login.

## 🚀 Quick Start

### Example: Create a Note

```bash
curl -X POST http://your-server/src/api_create_note.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "heading": "My First Note",
    "entry": "<p>This is my first note via API</p>",
    "entrycontent": "This is my first note via API",
    "tags": "test,api",
    "workspace": "Poznote",
    "folder_name": "Default"
  }'
```

### Example: List Notes

```bash
curl -X GET "http://your-server/src/api_list_notes.php?workspace=Poznote" \
  -H "X-API-Key: your-api-key"
```

### Example: Update a Note

```bash
curl -X POST http://your-server/src/api_update_note.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "id": 1234,
    "heading": "Updated Note Title",
    "entry": "<p>Updated content</p>",
    "entrycontent": "Updated content"
  }'
```

## 📋 API Endpoints Overview

### Notes Management
- `GET /api_list_notes.php` - List all notes
- `POST /api_create_note.php` - Create a new note
- `POST /api_update_note.php` - Update an existing note
- `POST /api_delete_note.php` - Delete a note (move to trash)
- `POST /api_duplicate_note.php` - Duplicate a note
- `POST /api_move_note.php` - Move a note to another folder/workspace
- `POST /api_share_note.php` - Share a note publicly

### Workspaces Management
- `GET /api_workspaces.php` - List all workspaces
- `POST /api_workspaces.php` - Create, rename, or delete workspaces

### Folders Management
- `GET /api_list_notes.php?get_folders=1` - List all folders
- `POST /api_create_folder.php` - Create a new folder
- `POST /api_delete_folder.php` - Delete a folder
- `POST /api_move_folder_files.php` - Move files between folders

### Tags Management
- `GET /api_list_tags.php` - List all tags with counts
- `POST /api_apply_tags.php` - Add or remove tags from notes

### Attachments Management
- `GET /api_attachments.php?note_id=123` - List attachments for a note
- `POST /api_attachments.php` - Upload a file attachment
- `DELETE /api_attachments.php` - Delete an attachment

### Favorites Management
- `POST /api_favorites.php` - Add or remove notes from favorites

### Settings Management
- `GET /api_settings.php` - Get user settings
- `POST /api_settings.php` - Update settings
- `GET /api_default_folder_settings.php` - Get default folder
- `POST /api_default_folder_settings.php` - Set default folder

## 📊 Response Format

All API responses follow a standard JSON format:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

## 🔍 Filtering and Search

### Filter by Workspace
```bash
GET /api_list_notes.php?workspace=Personal
```

### Filter by Folder
```bash
GET /api_list_notes.php?folder=Work%20Notes
```

### Filter by Tag
```bash
GET /api_list_notes.php?tag=important
```

### Filter Favorites
```bash
GET /api_list_notes.php?favorite=1
```

### Text Search
```bash
GET /api_list_notes.php?search=meeting
```

### Combined Filters
```bash
GET /api_list_notes.php?workspace=Personal&folder=Work&favorite=1
```

## 🛠️ Development Tools

### Postman Collection
Import the Postman collection for easy API testing:
- File: `Poznote_API.postman_collection.json`
- Environment: `Poznote_API.postman_environment.json`

### Code Examples
See the `docs/api-examples/` directory for code examples in various languages:
- Python (`example.py`)
- JavaScript/Node.js (`example.js`)
- Bash/cURL (`example.sh`)

## 📖 Additional Resources

- [OpenAPI Specification](https://spec.openapi.org/oas/v3.0.3)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [Poznote GitHub Repository](https://github.com/timothepoznanski/poznote)

## 💡 Tips

1. **Use the interactive docs**: The Swagger UI is the best way to explore and test the API
2. **Start with read operations**: Test with `GET` endpoints before trying `POST` operations
3. **Check required fields**: Each endpoint documentation lists required and optional parameters
4. **Use proper JSON encoding**: Ensure your request bodies are valid JSON
5. **Handle errors gracefully**: Always check the `success` field in responses

## 🐛 Troubleshooting

### 401 Unauthorized
- Check that your API key is correct
- Verify the authentication header is properly formatted
- Ensure the API key is included in every request

### 404 Not Found
- Verify the endpoint URL is correct
- Check that the resource (note, workspace, folder) exists
- Ensure workspace/folder names are URL-encoded

### 400 Bad Request
- Validate your JSON request body
- Check that all required fields are present
- Verify data types match the API specification

## 📝 Notes

- All timestamps are in ISO 8601 format
- Tags should be comma-separated without spaces
- Workspace and folder names are case-sensitive
- File uploads for attachments use multipart/form-data
- Maximum upload size depends on PHP configuration

## 🤝 Contributing

Found an issue with the API or documentation? Please report it on the [GitHub repository](https://github.com/timothepoznanski/poznote/issues).
