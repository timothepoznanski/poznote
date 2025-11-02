#!/bin/bash

# Poznote API REST Test Script
# Tests all API endpoints documented in README.md

# Configuration
BASE_URL="http://localhost:8040"
USERNAME="admin"
PASSWORD="XXXXXXXXXXXX"
AUTH="$USERNAME:$PASSWORD"

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
    print_test "2. api_list_notes.php - List all notes"
    
    RESPONSE=$(curl -s -u "$AUTH" "$BASE_URL/api_list_notes.php")
    
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        NOTE_COUNT=$(echo "$RESPONSE" | jq '.notes | length')
        print_success "List notes works ($NOTE_COUNT notes found)"
        echo "$RESPONSE" | jq '.notes[0:2]' 2>/dev/null
        
        # Store first note ID for later tests
        FIRST_NOTE_ID=$(echo "$RESPONSE" | jq -r '.notes[0].id // empty')
        if [ -n "$FIRST_NOTE_ID" ]; then
            print_info "Using note ID $FIRST_NOTE_ID for subsequent tests"
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
            "workspace": "Poznote"
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
            "name": "TestWorkspace"
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
    
    if [ "$HTTP_CODE" = "400" ]; then
        print_success "Correctly rejects old 'id' parameter (HTTP 400)"
    else
        print_error "Should reject 'id' parameter but got HTTP $HTTP_CODE"
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
            \"workspace\": \"Poznote\"
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
        "$BASE_URL/api_attachments.php?action=list&note_id=$TEST_NOTE_ID")
    
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
            "name": "TestWorkspace"
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
    test_list_notes
    test_create_note
    test_workspaces_list
    test_workspaces_create
    test_apply_tags
    test_favorites
    test_share_note
    test_attachments_list
    test_delete_note
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
