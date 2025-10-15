#!/bin/bash

###############################################################################
# Poznote API Bash/cURL Example
#
# This script demonstrates how to interact with the Poznote API using cURL.
# Make sure to set your API credentials before running.
###############################################################################

# Configuration
BASE_URL="http://localhost"
API_URL="${BASE_URL}/src"

# Authentication (choose one method)
API_KEY="your-api-key-here"
# USERNAME="your-username"
# PASSWORD="your-password"

# Helper function to make API calls with API Key
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ "$method" = "GET" ]; then
        curl -s -X GET \
            -H "X-API-Key: ${API_KEY}" \
            -H "Content-Type: application/json" \
            "${API_URL}/${endpoint}"
    else
        curl -s -X POST \
            -H "X-API-Key: ${API_KEY}" \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${API_URL}/${endpoint}"
    fi
}

# Alternative: Helper function for Basic Auth
api_call_basic() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ "$method" = "GET" ]; then
        curl -s -X GET \
            -u "${USERNAME}:${PASSWORD}" \
            -H "Content-Type: application/json" \
            "${API_URL}/${endpoint}"
    else
        curl -s -X POST \
            -u "${USERNAME}:${PASSWORD}" \
            -H "Content-Type: application/json" \
            -d "${data}" \
            "${API_URL}/${endpoint}"
    fi
}

echo "=== Poznote API Examples ==="
echo ""

# Example 1: List all notes
echo "1. Listing all notes..."
response=$(api_call "GET" "api_list_notes.php")
echo "   Response: ${response}" | head -c 100
echo "..."
echo ""

# Example 2: Create a new note
echo "2. Creating a new note..."
create_data='{
    "heading": "API Test Note",
    "entry": "<p>This note was created via the API</p>",
    "entrycontent": "This note was created via the API",
    "tags": "api,test,bash",
    "folder_name": "Default",
    "workspace": "Poznote"
}'
create_response=$(api_call "POST" "api_create_note.php" "${create_data}")
echo "   Response: ${create_response}"

# Extract note ID from response (requires jq)
if command -v jq &> /dev/null; then
    NOTE_ID=$(echo "${create_response}" | jq -r '.id')
    echo "   Created note ID: ${NOTE_ID}"
else
    echo "   (Install 'jq' to parse JSON responses)"
    NOTE_ID="1234"  # Fallback for examples
fi
echo ""

# Example 3: Update the note
echo "3. Updating the note..."
update_data="{
    \"id\": ${NOTE_ID},
    \"heading\": \"Updated API Test Note\",
    \"entry\": \"<p>This note was updated via the API</p>\",
    \"entrycontent\": \"This note was updated via the API\"
}"
update_response=$(api_call "POST" "api_update_note.php" "${update_data}")
echo "   Response: ${update_response}"
echo ""

# Example 4: Add to favorites
echo "4. Adding note to favorites..."
fav_data="{
    \"id\": ${NOTE_ID},
    \"favorite\": 1
}"
fav_response=$(api_call "POST" "api_favorites.php" "${fav_data}")
echo "   Response: ${fav_response}"
echo ""

# Example 5: Duplicate the note
echo "5. Duplicating the note..."
dup_data="{
    \"id\": ${NOTE_ID}
}"
dup_response=$(api_call "POST" "api_duplicate_note.php" "${dup_data}")
echo "   Response: ${dup_response}"
echo ""

# Example 6: List workspaces
echo "6. Listing workspaces..."
ws_response=$(api_call "GET" "api_workspaces.php")
echo "   Response: ${ws_response}"
echo ""

# Example 7: List tags
echo "7. Listing tags..."
tags_response=$(api_call "GET" "api_list_tags.php")
echo "   Response: ${tags_response}" | head -c 200
echo "..."
echo ""

# Example 8: Search notes
echo "8. Searching for notes containing 'API'..."
search_response=$(api_call "GET" "api_list_notes.php?search=API")
echo "   Response: ${search_response}" | head -c 200
echo "..."
echo ""

# Example 9: Filter by tag
echo "9. Filtering notes by tag 'test'..."
tag_response=$(api_call "GET" "api_list_notes.php?tag=test")
echo "   Response: ${tag_response}" | head -c 200
echo "..."
echo ""

# Example 10: Filter by workspace and folder
echo "10. Filtering by workspace and folder..."
filter_response=$(api_call "GET" "api_list_notes.php?workspace=Poznote&folder=Default")
echo "    Response: ${filter_response}" | head -c 200
echo "..."
echo ""

# Example 11: Get note details (by listing and filtering)
echo "11. Getting specific note details..."
note_response=$(api_call "GET" "api_list_notes.php?search=${NOTE_ID}")
echo "    Response: ${note_response}" | head -c 200
echo "..."
echo ""

# Example 12: Delete the note
echo "12. Deleting the note..."
delete_data="{
    \"id\": ${NOTE_ID}
}"
delete_response=$(api_call "POST" "api_delete_note.php" "${delete_data}")
echo "    Response: ${delete_response}"
echo ""

echo "=== Examples Complete ==="

###############################################################################
# Additional Examples (commented out)
###############################################################################

# Create a workspace
# workspace_data='{"action": "create", "name": "MyWorkspace"}'
# api_call "POST" "api_workspaces.php" "${workspace_data}"

# Create a folder
# folder_data='{"folder_name": "MyFolder", "workspace": "Poznote"}'
# api_call "POST" "api_create_folder.php" "${folder_data}"

# Share a note
# share_data='{"id": 123, "shared": 1}'
# api_call "POST" "api_share_note.php" "${share_data}"

# Upload an attachment (multipart form)
# curl -X POST \
#     -H "X-API-Key: ${API_KEY}" \
#     -F "note_id=123" \
#     -F "file=@/path/to/file.pdf" \
#     "${API_URL}/api_attachments.php"

# List attachments for a note
# api_call "GET" "api_attachments.php?note_id=123"

# Get user settings
# api_call "GET" "api_settings.php"

# List folders
# api_call "GET" "api_list_notes.php?get_folders=1&workspace=Poznote"
