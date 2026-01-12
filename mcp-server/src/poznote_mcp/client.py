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
    ):
        self.base_url = (base_url or os.getenv("POZNOTE_API_URL", "http://localhost/api/v1")).rstrip("/")
        self.username = username or os.getenv("POZNOTE_USERNAME", "")
        self.password = password or os.getenv("POZNOTE_PASSWORD", "")
        self.default_workspace = workspace or os.getenv("POZNOTE_DEFAULT_WORKSPACE", "Poznote")
        
        # Configure HTTP client with Basic Auth
        auth = None
        if self.username and self.password:
            auth = httpx.BasicAuth(self.username, self.password)
        
        self.client = httpx.Client(
            base_url=self.base_url,
            auth=auth,
            timeout=30.0,
            headers={"Accept": "application/json", "Content-Type": "application/json"}
        )
    
    def list_notes(self, workspace: str | None = None) -> list[dict]:
        """
        List all notes
        
        Returns list of notes with: id, heading, tags, folder, workspace, updated, created
        """
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get("/notes", params=params)
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("notes", [])
        return []
    
    def get_note(self, note_id: int, workspace: str | None = None) -> dict | None:
        """
        Get a specific note with its content
        
        Returns note with: id, heading, content, tags, folder, workspace, updated, created
        """
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get(f"/notes/{note_id}", params=params)
        
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
        workspace: str | None = None
    ) -> list[dict]:
        """
        Search notes by text query
        
        Returns list of matching notes with excerpts
        """
        params = {"q": query, "limit": limit}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.get("/notes/search", params=params)
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
    ) -> dict | None:
        """
        Create a new note
        
        Returns the created note with its ID
        """
        # DEBUG: Log input parameter
        logger.info(f"[CLIENT] create_note called with workspace={workspace!r}")
        
        # Use provided workspace or fall back to default
        ws = workspace if workspace else self.default_workspace
        
        logger.info(f"[CLIENT] Using workspace: {ws!r} (default_workspace={self.default_workspace!r})")
        
        payload = {
            "heading": title,
            "content": content,
            "workspace": ws,
        }
        
        if tags:
            payload["tags"] = tags
        if folder_name:
            payload["folder_name"] = folder_name
        
        logger.info(f"Creating note with payload: {payload}")
        logger.info(f"API URL: {self.base_url}/notes")
        
        response = self.client.post("/notes", json=payload)
        response.raise_for_status()
        data = response.json()
        
        logger.info(f"API response: {data}")
        
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
        
        response = self.client.patch(f"/notes/{note_id}", json=payload, params=params)
        
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
    ) -> bool:
        """
        Delete a note
        
        Returns True if successful, False otherwise
        """
        params = {}
        ws = workspace or self.default_workspace
        if ws:
            params["workspace"] = ws
        
        response = self.client.delete(f"/notes/{note_id}", params=params)
        
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
        
        logger.info(f"Creating folder with payload: {payload}")
        logger.info(f"API URL: {self.base_url}/folders")
        
        response = self.client.post("/folders", json=payload)
        response.raise_for_status()
        data = response.json()
        
        logger.info(f"API response: {data}")
        
        if data.get("success"):
            return data.get("folder")
        return None
    
    def close(self):
        """Close the HTTP client"""
        self.client.close()
