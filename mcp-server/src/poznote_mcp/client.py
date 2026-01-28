"""
Poznote API Client - HTTP client for communicating with Poznote REST API
"""

import httpx
from typing import Optional
import os
import logging

logger = logging.getLogger("poznote-mcp.client")


class PoznoteClient:
    """Client for Poznote REST API v1"""
    
    def __init__(
        self,
        base_url: str | None = None,
        username: str | None = None,
        password: str | None = None,
        workspace: str | None = None,
        user_id: str | int | None = None,
    ):
        # Default includes Poznote's typical dev port (8040). Users can override with POZNOTE_API_URL.
        self.base_url = (base_url or os.getenv("POZNOTE_API_URL", "http://localhost:8040/api/v1")).rstrip("/")
        self.username = username or os.getenv("POZNOTE_USERNAME", "")
        self.password = password or os.getenv("POZNOTE_PASSWORD", "")
        self.default_workspace = workspace or os.getenv("POZNOTE_DEFAULT_WORKSPACE", "Poznote")
        self.user_id = str(user_id or os.getenv("POZNOTE_USER_ID", "1"))
        
        # Configure HTTP client with Basic Auth
        auth = None
        if self.username and self.password:
            auth = httpx.BasicAuth(self.username, self.password)
        
        # Headers include X-User-ID for multi-user support
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-User-ID": self.user_id
        }
        
        self.client = httpx.Client(
            base_url=self.base_url,
            auth=auth,
            timeout=30.0,
            headers=headers
        )

    def _headers_for_user(self, user_id: str | int | None) -> dict | None:
        if user_id is None:
            return None
        return {"X-User-ID": str(user_id)}
    
    def list_notes(self, workspace: str | None = None, user_id: str | int | None = None) -> list[dict]:
        """
        List all notes
        
        Returns list of notes with: id, heading, tags, folder, workspace, updated, created
        """
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get("/notes", params=params, headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("notes", [])
        return []
    
    def get_note(self, note_id: int, workspace: str | None = None, user_id: str | int | None = None) -> dict | None:
        """
        Get a specific note with its content
        
        Returns note with: id, heading, content, tags, folder, workspace, updated, created
        """
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get(f"/notes/{note_id}", params=params, headers=self._headers_for_user(user_id))
        
        if response.status_code == 404:
            return None
        
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("note")
        return None
    
    def search_notes(
        self,
        query: str,
        limit: int = 10,
        workspace: str | None = None,
        user_id: str | int | None = None,
    ) -> list[dict]:
        """
        Search notes by text query
        
        Returns list of matching notes with excerpts
        """
        params = {"q": query, "limit": limit}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get("/notes/search", params=params, headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("results", [])
        return []
    
    def create_note(
        self,
        title: str,
        content: str,
        tags: str | None = None,
        folder_name: str | None = None,
        workspace: str | None = None,
        note_type: str | None = None,
        user_id: str | int | None = None,
    ) -> dict | None:
        """
        Create a new note
        
        Returns the created note with its ID
        """
        ws = workspace if workspace else self.default_workspace
        
        payload = {
            "heading": title,
            "content": content,
            "workspace": ws,
        }
        
        if tags:
            payload["tags"] = tags
        if folder_name:
            payload["folder_name"] = folder_name
        if note_type:
            payload["type"] = note_type
        
        response = self.client.post("/notes", json=payload, headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("note", {"id": data.get("id")})
        return None
    
    def update_note(
        self,
        note_id: int,
        content: str | None = None,
        title: str | None = None,
        tags: str | None = None,
        workspace: str | None = None,
        user_id: str | int | None = None,
    ) -> dict | None:
        """
        Update an existing note
        
        Returns the updated note
        """
        payload = {}
        
        if content is not None:
            payload["content"] = content
        if title is not None:
            payload["heading"] = title
        if tags is not None:
            payload["tags"] = tags
        
        if not payload:
            return None
        
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.patch(
            f"/notes/{note_id}",
            json=payload,
            params=params,
            headers=self._headers_for_user(user_id),
        )
        
        if response.status_code == 404:
            return None
        
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("note", {"id": note_id})
        return None
    
    def delete_note(
        self,
        note_id: int,
        workspace: str | None = None,
        user_id: str | int | None = None,
    ) -> bool:
        """
        Delete a note
        
        Returns True if successful, False otherwise
        """
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.delete(
            f"/notes/{note_id}",
            params=params,
            headers=self._headers_for_user(user_id),
        )
        
        if response.status_code == 404:
            return False
        
        response.raise_for_status()
        data = response.json()
        
        return data.get("success", False)
    
    def create_folder(
        self,
        folder_name: str,
        parent_folder_id: int | None = None,
        workspace: str | None = None,
        user_id: str | int | None = None,
    ) -> dict | None:
        """
        Create a new folder
        
        Returns the created folder with its ID
        """
        ws = workspace or self.default_workspace
        
        payload = {
            "folder_name": folder_name,
            "workspace": ws,
        }
        
        if parent_folder_id is not None:
            payload["parent_folder_id"] = parent_folder_id
        
        response = self.client.post("/folders", json=payload, headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("folder")
        return None

    def list_folders(self, workspace: str | None = None, user_id: str | int | None = None) -> list[dict]:
        """List all folders in the specified workspace"""
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get("/folders", params=params, headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("folders", [])
        return []

    def list_workspaces(self, user_id: str | int | None = None) -> list[dict]:
        """List all available workspaces"""
        response = self.client.get("/workspaces", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("workspaces", [])
        return []

    def list_tags(self, user_id: str | int | None = None) -> list[str]:
        """List all unique tags"""
        response = self.client.get("/tags", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("tags", [])
        return []

    def get_trash(self, user_id: str | int | None = None) -> list[dict]:
        """List all notes in trash"""
        response = self.client.get("/trash", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("notes", [])
        return []

    def empty_trash(self, user_id: str | int | None = None) -> bool:
        """Empty the trash (permanently delete all notes in trash)"""
        response = self.client.delete("/trash", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        return data.get("success", False)

    def restore_note(self, note_id: int, user_id: str | int | None = None) -> bool:
        """Restore a note from trash"""
        response = self.client.post(f"/notes/{note_id}/restore", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        return data.get("success", False)

    def duplicate_note(self, note_id: int, user_id: str | int | None = None) -> dict | None:
        """Duplicate an existing note"""
        response = self.client.post(f"/notes/{note_id}/duplicate", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("note")
        return None

    def toggle_favorite(self, note_id: int, user_id: str | int | None = None) -> bool:
        """Toggle favorite status for a note"""
        response = self.client.post(f"/notes/{note_id}/favorite", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        return data.get("success", False)

    def list_attachments(self, note_id: int, user_id: str | int | None = None) -> list[dict]:
        """List all attachments for a note"""
        response = self.client.get(f"/notes/{note_id}/attachments", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            return data.get("attachments", [])
        return []

    def move_note_to_folder(self, note_id: int, folder_id: int, user_id: str | int | None = None) -> bool:
        """Move a note to a specific folder"""
        payload = {"folder_id": folder_id}
        response = self.client.post(f"/notes/{note_id}/folder", json=payload, headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        return data.get("success", False)

    def remove_note_from_folder(self, note_id: int, user_id: str | int | None = None) -> bool:
        """Remove a note from its current folder (move to root)"""
        response = self.client.post(f"/notes/{note_id}/remove-folder", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        return data.get("success", False)

    def get_note_share_status(self, note_id: int, user_id: str | int | None = None) -> dict | None:
        """Get public sharing status for a note"""
        response = self.client.get(f"/notes/{note_id}/share", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            return data.get("share")
        return None

    def create_note_share(self, note_id: int, user_id: str | int | None = None) -> dict | None:
        """Enable public sharing for a note and return the link"""
        response = self.client.post(f"/notes/{note_id}/share", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            return data.get("share")
        return None

    def delete_note_share(self, note_id: int, user_id: str | int | None = None) -> bool:
        """Disable public sharing for a note"""
        response = self.client.delete(f"/notes/{note_id}/share", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        return data.get("success", False)

    def get_folder_share_status(self, folder_id: int, user_id: str | int | None = None) -> dict | None:
        """Get public sharing status for a folder"""
        response = self.client.get(f"/folders/{folder_id}/share", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            return data.get("share")
        return None

    def convert_note_type(self, note_id: int, user_id: str | int | None = None) -> dict | None:
        """Convert note between Markdown and HTML"""
        response = self.client.post(f"/notes/{note_id}/convert", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            return data.get("note")
        return None

    def get_github_status(self, user_id: str | int | None = None) -> dict | None:
        """Get GitHub synchronization status"""
        response = self.client.get("/github-sync/status", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        return response.json()

    def github_push(self, user_id: str | int | None = None) -> dict:
        """Force push notes to GitHub"""
        response = self.client.post("/github-sync/push", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        return response.json()

    def github_pull(self, user_id: str | int | None = None) -> dict:
        """Force pull notes from GitHub"""
        response = self.client.post("/github-sync/pull", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        return response.json()

    def get_system_version(self) -> dict:
        """Get Poznote version information"""
        response = self.client.get("/system/version")
        response.raise_for_status()
        return response.json()

    def list_backups(self) -> list[dict]:
        """List all available backups"""
        response = self.client.get("/backups")
        response.raise_for_status()
        return response.json()

    def create_backup(self) -> dict:
        """Trigger a new full backup"""
        response = self.client.post("/backups")
        response.raise_for_status()
        return response.json()

    def get_setting(self, key: str, user_id: str | int | None = None) -> dict:
        """Get a specific application setting"""
        response = self.client.get(f"/settings/{key}", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        return response.json()
    
    def close(self):
        """Close the HTTP client"""
        self.client.close()
