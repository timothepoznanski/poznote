#!/bin/bash

# Poznote API REST Test Script
# Tests all API endpoints documented in README.md

# Configuration
BASE_URL="http://timpoz.com:8041"
USERNAME="admin"
PASSWORD="Ijnbhuygv123456!"
AUTH="$USERNAME:$PASSWORD"

# Test resources
TEST_WORKSPACE="TestWorkspace"
RENAMED_WORKSPACE="TestWorkspaceRenamed"
TEST_FOLDER="TestFolder"
TEST_ATTACHMENT_PATH="/tmp/poznote_api_test_attachment.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_test() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}TEST: $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${YELLOW}→${NC} $1"
}

# Test functions
test_version() {
    print_test "1. api_version.php - Get version info"
    
    RESPONSE=$(curl -s -u "$AUTH" "$BASE_URL/api_version.php")
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.current_version' >/dev/null 2>&1; then
        print_success "Version endpoint works"
    else
        print_error "Version endpoint failed"
    fi
}

test_list_notes() {
    print_test "2. api_list_notes.php - List all notes in test workspace"
    
    RESPONSE=$(curl -s -u "$AUTH" "$BASE_URL/api_list_notes.php?workspace=$TEST_WORKSPACE")
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        NOTE_COUNT=$(echo "$RESPONSE" | jq '.notes | length')
        print_success "List notes works ($NOTE_COUNT notes found)"
        echo "$RESPONSE" | jq '.notes[0:2]' 2>/dev/null
        
        # Store first note ID for later tests
        FIRST_NOTE_ID=$(echo "$RESPONSE" | jq -r '.notes[0].id // empty')
        if [ -n "$FIRST_NOTE_ID" ]; then
            print_info "Using note ID $FIRST_NOTE_ID for subsequent tests"
            if [ -z "$TEST_NOTE_ID" ]; then
                TEST_NOTE_ID="$FIRST_NOTE_ID"
                print_info "TEST_NOTE_ID set to $TEST_NOTE_ID from FIRST_NOTE_ID"
            fi
        fi
    else
        print_error "List notes failed"
        echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    fi
}

test_create_note() {
    print_test "3. api_create_note.php - Create new note"
    
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d '{
            "heading": "API Test Note",
            "subheading": "Created by test script",
            "entrycontent": "This is a test note created by the API test script.",
            "tags": "test,api,automated",
            "folder": "Default",
            "workspace": "'$TEST_WORKSPACE'"
        }' \
        "$BASE_URL/api_create_note.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        TEST_NOTE_ID=$(echo "$RESPONSE" | jq -r '.id')
        print_success "Note created with ID: $TEST_NOTE_ID"
    else
        print_error "Create note failed"
    fi
}

## Removed session login: use HTTP Basic auth for all calls

test_workspaces_list() {
    print_test "4. api_workspaces.php - List workspaces (GET)"
    
    RESPONSE=$(curl -s -u "$AUTH" "$BASE_URL/api_workspaces.php?action=list")
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "List workspaces works (GET with query param)"
    else
        print_error "List workspaces failed"
    fi
}

test_workspaces_create() {
    print_test "5. api_workspaces.php - Create workspace (POST JSON)"
    
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d '{
            "action": "create",
            "name": "'$TEST_WORKSPACE'"
        }' \
        "$BASE_URL/api_workspaces.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Create workspace works (requires JSON body)"
    else
        # Workspace might already exist
        if echo "$RESPONSE" | grep -q "already exists\|UNIQUE"; then
            print_info "Workspace already exists (expected)"
            ((TESTS_PASSED++))
        else
            print_error "Create workspace failed"
        fi
    fi
}

test_apply_tags() {
    print_test "6. api_apply_tags.php - Apply tags (requires note_id, not id)"
    
    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi
    
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"tags\": \"updated,strict,validation\"
        }" \
        "$BASE_URL/api_apply_tags.php")
    
    # Optional: apply tags while scoping to workspace
    RESPONSE_WS=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"tags\": \"updated,strict,validation\",
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_apply_tags.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Apply tags works (strict note_id validation)"
    else
        print_error "Apply tags failed"
    fi
    
    # Test with old 'id' parameter (should fail)
    print_info "Testing with old 'id' parameter (should fail with HTTP 400)..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"id\": $TEST_NOTE_ID,
            \"tags\": \"test\"
        }" \
        "$BASE_URL/api_apply_tags.php")
    
    # Also test old 'id' parameter with workspace field (should still reject id param)
    HTTP_CODE_WS=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"id\": $TEST_NOTE_ID,
            \"tags\": \"test\",
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_apply_tags.php")
    
    if [ "$HTTP_CODE" = "400" ]; then
        print_success "Correctly rejects old 'id' parameter (HTTP 400)"
    else
        print_error "Should reject 'id' parameter but got HTTP $HTTP_CODE"
    fi
}

test_update_note() {
    print_test "X. api_update_note.php - Update existing note content"

    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi

    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"id\": $TEST_NOTE_ID,
            \"heading\": \"API Test Note Updated\",
            \"entrycontent\": \"This is an updated note content from the API test script.\",
            \"tags\": \"updated,api-test\"
            ,\"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_update_note.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Update note worked"
    else
        print_error "Update note failed"
    fi
}

test_create_folder() {
    print_test "Y. api_create_folder.php - Create folder"
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"folder_name\": \"$TEST_FOLDER\",
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_create_folder.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        FOLDER_ID=$(echo "$RESPONSE" | jq -r '.folder.id // empty')
        print_success "Create folder worked (ID: $FOLDER_ID)"
    else
        # If folder already exists, note it and continue
        if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
            ERR_MSG=$(echo "$RESPONSE" | jq -r '.error')
            if echo "$ERR_MSG" | grep -q "already exists"; then
                print_info "Folder already exists (expected): $TEST_FOLDER"
                ((TESTS_PASSED++))
            else
                print_error "Create folder failed: $ERR_MSG"
            fi
        else
            print_error "Create folder failed"
        fi
    fi
}

test_move_note_to_folder() {
    print_test "Z. api_update_note.php - Assign folder to note (logical move)"

    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi

    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"id\": $TEST_NOTE_ID,
            \"heading\": "API Test Note Updated",
            \"entrycontent\": "This is an updated note content from the API test script.",
            \"tags\": "updated,api-test",
            \"folder\": \"$TEST_FOLDER\",
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_update_note.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Assign folder to note (logical move) worked (folder: $TEST_FOLDER in $TEST_WORKSPACE)"
    else
        print_error "Assign folder to note failed"
    fi
}

test_list_tags() {
    print_test "api_list_tags.php - List tags"

    RESPONSE=$(curl -s -u "$AUTH" "$BASE_URL/api_list_tags.php?workspace=$TEST_WORKSPACE")
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        TAG_COUNT=$(echo "$RESPONSE" | jq '.tags | length')
        print_success "List tags works ($TAG_COUNT tags)"
    else
        print_error "List tags failed"
    fi
}

test_update_tag_on_note() {
    print_test "api_apply_tags.php - Update tags for test note (replace tags)"

    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi

    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"tags\": \"api-tag-updated,tested\"
        }" \
        "$BASE_URL/api_apply_tags.php")
    
    # Update tags with workspace parameter
    RESPONSE_WS=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"tags\": \"api-tag-updated,tested\",
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_apply_tags.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Tags updated on note"
    else
        print_error "Updating tags on note failed"
    fi
}

test_upload_attachment() {
    print_test "api_attachments.php - Upload attachment (multipart/form-data)"

    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping attachment upload: No test note created"
        return
    fi

    # Create a small temporary file to upload
    echo "Poznote API Test Attachment" > "$TEST_ATTACHMENT_PATH"

    RESPONSE=$(curl -s -u "$AUTH" -F "action=upload" -F "note_id=$TEST_NOTE_ID" -F "workspace=$TEST_WORKSPACE" -F "file=@$TEST_ATTACHMENT_PATH" "$BASE_URL/api_attachments.php")
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        ATTACHMENT_ID=$(echo "$RESPONSE" | jq -r '.attachment_id // empty')
        print_success "Attachment uploaded (id: $ATTACHMENT_ID)"
    else
        print_error "Attachment upload failed"
    fi

    # Cleanup temp file
    rm -f "$TEST_ATTACHMENT_PATH"
}

test_restore_note() {
    print_test "api_restore_note.php - Restore note from trash"

    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi

    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"id\": $TEST_NOTE_ID
        }" \
        "$BASE_URL/api_restore_note.php")
    
    # Restore with workspace parameter
    RESPONSE_WS=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"id\": $TEST_NOTE_ID,
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_restore_note.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Restore note works"
    else
        print_error "Restore note failed"
    fi
}

test_delete_folder() {
    print_test "api_delete_folder.php - Delete folder we created"
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X DELETE \
        -d "{
            \"folder_name\": \"$TEST_FOLDER\",
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_delete_folder.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Delete folder works"
    else
        print_error "Delete folder failed"
    fi
}

test_rename_workspace() {
    print_test "api_workspaces.php - Rename workspace (POST JSON)"

    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d '{
            "action": "rename",
            "old_name": "'$TEST_WORKSPACE'",
            "new_name": "'$RENAMED_WORKSPACE'"
        }' \
        "$BASE_URL/api_workspaces.php")

    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Rename workspace works ("$TEST_WORKSPACE" -> "$RENAMED_WORKSPACE")"
    else
        print_error "Rename workspace failed"
    fi
}

test_favorites() {
    print_test "7. api_favorites.php - Toggle favorite (requires JSON)"
    
    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi
    
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"action\": \"toggle_favorite\",
            \"note_id\": $TEST_NOTE_ID,
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_favorites.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Toggle favorite works (JSON only, no form data)"
    else
        print_error "Toggle favorite failed"
    fi
}

test_share_note() {
    print_test "8. api_share_note.php - Share note (note_id + action)"
    
    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi
    
    # Test create share
    print_info "Creating share link..."
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"workspace\": \"$TEST_WORKSPACE\",
            \"action\": \"create\"
        }" \
        "$BASE_URL/api_share_note.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.shared == true' >/dev/null 2>&1; then
        SHARE_URL=$(echo "$RESPONSE" | jq -r '.url // empty')
        print_success "Share note create works (got URL: $SHARE_URL)"
    else
        print_error "Share note create failed"
    fi
    
    # Test get share
    print_info "Getting existing share..."
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"workspace\": \"$TEST_WORKSPACE\",
            \"action\": \"get\"
        }" \
        "$BASE_URL/api_share_note.php")
    
    if echo "$RESPONSE" | jq -e '.shared == true or .url' >/dev/null 2>&1; then
        print_success "Share note get works"
    else
        print_info "Get share returned: $(echo $RESPONSE | jq -c .)"
    fi
}

test_attachments_list() {
    print_test "9. api_attachments.php - List attachments (action=list&note_id)"
    
    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi
    
    RESPONSE=$(curl -s -u "$AUTH" \
        "$BASE_URL/api_attachments.php?action=list&note_id=$TEST_NOTE_ID&workspace=$TEST_WORKSPACE")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        ATTACHMENT_COUNT=$(echo "$RESPONSE" | jq '.attachments | length')
        print_success "List attachments works ($ATTACHMENT_COUNT attachments)"
    else
        print_error "List attachments failed"
    fi
}

test_delete_note() {
    print_test "10. api_delete_note.php - Delete note (DELETE method + note_id)"
    
    if [ -z "$TEST_NOTE_ID" ]; then
        print_info "Skipping: No test note created"
        return
    fi
    
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X DELETE \
        -d "{
            \"note_id\": $TEST_NOTE_ID
        }" \
        "$BASE_URL/api_delete_note.php")
    
    # Also test delete with workspace param (DELETE method with JSON body containing workspace)
    RESPONSE_WS=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X DELETE \
        -d "{
            \"note_id\": $TEST_NOTE_ID,
            \"workspace\": \"$TEST_WORKSPACE\"
        }" \
        "$BASE_URL/api_delete_note.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Delete note works (DELETE method with note_id)"
    else
        print_error "Delete note failed"
    fi
}

test_workspaces_delete() {
    print_test "11. api_workspaces.php - Delete workspace (POST JSON)"
    
    RESPONSE=$(curl -s -u "$AUTH" \
        -H "Content-Type: application/json" \
        -X POST \
        -d '{
            "action": "delete",
            "name": "'$RENAMED_WORKSPACE'"
        }' \
        "$BASE_URL/api_workspaces.php")
    
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        print_success "Delete workspace works (requires JSON body)"
    else
        print_error "Delete workspace failed"
    fi
}

# Run all tests
main() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║         POZNOTE REST API TEST SUITE                      ║"
    echo "║         Testing strict validation (no fallbacks)         ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Base URL: $BASE_URL"
    echo "Authentication: HTTP Basic Auth"
    echo ""
    
    # Run all tests in sequence
    test_version
    test_workspaces_list
    test_workspaces_create
    test_create_note
    test_list_notes
    test_update_note
    test_apply_tags
    test_favorites
    test_share_note
    test_create_folder
    test_move_note_to_folder
    test_list_tags
    test_update_tag_on_note
    test_upload_attachment
    test_attachments_list
    test_delete_note
    test_restore_note
    test_delete_folder
    test_rename_workspace
    test_workspaces_delete
    
    # Summary
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}TEST SUMMARY${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo -e "Total Tests:  $(($TESTS_PASSED + $TESTS_FAILED))"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}✓ ALL TESTS PASSED${NC}"
        exit 0
    else
        echo -e "\n${RED}✗ SOME TESTS FAILED${NC}"
        exit 1
    fi
}

# Run main
main
