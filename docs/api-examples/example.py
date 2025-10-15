#!/usr/bin/env python3
"""
Poznote API Python Example

This script demonstrates how to interact with the Poznote API using Python.
Install required package: pip install requests
"""

import requests
import json
from datetime import datetime

class PoznoteAPI:
    """Simple wrapper for Poznote API"""
    
    def __init__(self, base_url, api_key=None, username=None, password=None):
        """
        Initialize API client
        
        Args:
            base_url: Base URL of your Poznote installation (e.g., 'http://localhost')
            api_key: API key for authentication (recommended)
            username: Username for basic auth (alternative)
            password: Password for basic auth (alternative)
        """
        self.base_url = base_url.rstrip('/')
        self.api_url = f"{self.base_url}/src"
        self.session = requests.Session()
        
        # Set up authentication
        if api_key:
            self.session.headers['X-API-Key'] = api_key
        elif username and password:
            self.session.auth = (username, password)
        
        self.session.headers['Content-Type'] = 'application/json'
    
    def list_notes(self, workspace=None, folder=None, tag=None, favorite=None, search=None):
        """List notes with optional filters"""
        params = {}
        if workspace:
            params['workspace'] = workspace
        if folder:
            params['folder'] = folder
        if tag:
            params['tag'] = tag
        if favorite is not None:
            params['favorite'] = 1 if favorite else 0
        if search:
            params['search'] = search
        
        response = self.session.get(f"{self.api_url}/api_list_notes.php", params=params)
        return response.json()
    
    def create_note(self, heading, content_html="", content_text="", tags="", 
                   folder="Default", workspace="Poznote", note_type="note", location=""):
        """Create a new note"""
        data = {
            "heading": heading,
            "entry": content_html or content_text,
            "entrycontent": content_text or content_html,
            "tags": tags,
            "folder_name": folder,
            "workspace": workspace,
            "type": note_type,
            "location": location
        }
        
        response = self.session.post(f"{self.api_url}/api_create_note.php", json=data)
        return response.json()
    
    def update_note(self, note_id, heading=None, content_html=None, content_text=None,
                   tags=None, folder=None, workspace=None):
        """Update an existing note"""
        data = {"id": note_id}
        
        if heading:
            data["heading"] = heading
        if content_html:
            data["entry"] = content_html
        if content_text:
            data["entrycontent"] = content_text
        if tags:
            data["tags"] = tags
        if folder:
            data["folder"] = folder
        if workspace:
            data["workspace"] = workspace
        
        response = self.session.post(f"{self.api_url}/api_update_note.php", json=data)
        return response.json()
    
    def delete_note(self, note_id):
        """Delete a note (move to trash)"""
        data = {"id": note_id}
        response = self.session.post(f"{self.api_url}/api_delete_note.php", json=data)
        return response.json()
    
    def duplicate_note(self, note_id):
        """Duplicate a note"""
        data = {"id": note_id}
        response = self.session.post(f"{self.api_url}/api_duplicate_note.php", json=data)
        return response.json()
    
    def toggle_favorite(self, note_id, is_favorite):
        """Add or remove note from favorites"""
        data = {
            "id": note_id,
            "favorite": 1 if is_favorite else 0
        }
        response = self.session.post(f"{self.api_url}/api_favorites.php", json=data)
        return response.json()
    
    def list_workspaces(self):
        """List all workspaces"""
        response = self.session.get(f"{self.api_url}/api_workspaces.php")
        return response.json()
    
    def create_workspace(self, name):
        """Create a new workspace"""
        data = {
            "action": "create",
            "name": name
        }
        response = self.session.post(f"{self.api_url}/api_workspaces.php", json=data)
        return response.json()
    
    def list_tags(self, workspace=None):
        """List all tags with counts"""
        params = {}
        if workspace:
            params['workspace'] = workspace
        
        response = self.session.get(f"{self.api_url}/api_list_tags.php", params=params)
        return response.json()
    
    def list_folders(self, workspace=None):
        """List all folders"""
        params = {"get_folders": "1"}
        if workspace:
            params['workspace'] = workspace
        
        response = self.session.get(f"{self.api_url}/api_list_notes.php", params=params)
        return response.json()


def main():
    """Example usage"""
    
    # Initialize API client
    api = PoznoteAPI(
        base_url="http://localhost",
        api_key="your-api-key-here"
        # Or use basic auth:
        # username="your-username",
        # password="your-password"
    )
    
    print("=== Poznote API Examples ===\n")
    
    # Example 1: List all notes
    print("1. Listing all notes...")
    notes = api.list_notes()
    if notes.get('success'):
        print(f"   Found {len(notes.get('notes', []))} notes")
        for note in notes.get('notes', [])[:3]:  # Show first 3
            print(f"   - {note.get('heading')} (ID: {note.get('id')})")
    print()
    
    # Example 2: Create a new note
    print("2. Creating a new note...")
    new_note = api.create_note(
        heading="API Test Note",
        content_text="This note was created via the API at " + datetime.now().isoformat(),
        tags="api,test,python",
        folder="Default",
        workspace="Poznote"
    )
    if new_note.get('success'):
        note_id = new_note.get('id')
        print(f"   Created note with ID: {note_id}")
    print()
    
    # Example 3: Update the note
    print("3. Updating the note...")
    update_result = api.update_note(
        note_id=note_id,
        heading="Updated API Test Note",
        content_text="This note was updated via the API"
    )
    print(f"   Update success: {update_result.get('success')}")
    print()
    
    # Example 4: Add to favorites
    print("4. Adding note to favorites...")
    fav_result = api.toggle_favorite(note_id, True)
    print(f"   Favorite success: {fav_result.get('success')}")
    print()
    
    # Example 5: Duplicate the note
    print("5. Duplicating the note...")
    dup_result = api.duplicate_note(note_id)
    if dup_result.get('success'):
        print(f"   Duplicated note ID: {dup_result.get('new_id')}")
    print()
    
    # Example 6: List workspaces
    print("6. Listing workspaces...")
    workspaces = api.list_workspaces()
    if workspaces.get('success'):
        for ws in workspaces.get('workspaces', []):
            print(f"   - {ws.get('name')}")
    print()
    
    # Example 7: List tags
    print("7. Listing tags...")
    tags = api.list_tags()
    if tags.get('success'):
        for tag in tags.get('tags', [])[:5]:  # Show first 5
            print(f"   - {tag.get('tag')} ({tag.get('count')} notes)")
    print()
    
    # Example 8: Search notes
    print("8. Searching for notes containing 'API'...")
    search_results = api.list_notes(search="API")
    if search_results.get('success'):
        print(f"   Found {len(search_results.get('notes', []))} notes")
    print()
    
    # Example 9: Filter by tag
    print("9. Filtering notes by tag 'test'...")
    tagged_notes = api.list_notes(tag="test")
    if tagged_notes.get('success'):
        print(f"   Found {len(tagged_notes.get('notes', []))} notes with tag 'test'")
    print()
    
    # Example 10: Delete the note
    print("10. Deleting the note...")
    delete_result = api.delete_note(note_id)
    print(f"    Delete success: {delete_result.get('success')}")
    print()
    
    print("=== Examples Complete ===")


if __name__ == "__main__":
    main()
