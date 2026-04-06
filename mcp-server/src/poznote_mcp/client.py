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

        # Check whether user_id / workspace were explicitly provided (via param or env var).
        # If not, they will be fetched from the Poznote API settings endpoint.
        _explicit_user_id = user_id or os.getenv("POZNOTE_USER_ID", "")
        _explicit_workspace = workspace or os.getenv("POZNOTE_DEFAULT_WORKSPACE", "")

        self.user_id = str(_explicit_user_id) if _explicit_user_id else "1"
        self.default_workspace = _explicit_workspace if _explicit_workspace else "Poznote"
        
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

        # Fetch remote config from Poznote settings if env vars were not explicitly set.
        if not _explicit_user_id or not _explicit_workspace:
            self._load_remote_config(
                update_user_id=not bool(_explicit_user_id),
                update_workspace=not bool(_explicit_workspace),
            )

    def _load_remote_config(self, update_user_id: bool = True, update_workspace: bool = True) -> None:
        """Fetch MCP configuration from GET /api/v1/system/mcp-config.

        Called once at client initialisation when POZNOTE_USER_ID or
        POZNOTE_DEFAULT_WORKSPACE env vars are absent.  Falls back silently to
        the built-in defaults so that the server still starts even if the PHP
        app is temporarily unavailable.
        """
        try:
            response = self.client.get("/system/mcp-config")
            if response.status_code == 200:
                data = response.json()
                if update_user_id and data.get("mcp_user_id"):
                    self.user_id = str(data["mcp_user_id"])
                    self.client.headers.update({"X-User-ID": self.user_id})
                if update_workspace and data.get("mcp_default_workspace"):
                    self.default_workspace = data["mcp_default_workspace"]
                if data.get("mcp_debug"):
                    import logging as _logging
                    _logging.getLogger().setLevel(_logging.DEBUG)
                    logger.debug("Debug logging enabled via remote MCP config.")
                logger.info(
                    "Remote MCP config loaded: user_id=%s workspace=%s debug=%s",
                    self.user_id,
                    self.default_workspace,
                    data.get("mcp_debug", False),
                )
            else:
                logger.warning(
                    "Could not fetch remote MCP config (HTTP %s) – using defaults.",
                    response.status_code,
                )
        except Exception as exc:
            logger.warning("Could not fetch remote MCP config: %s – using defaults.", exc)

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

    def get_git_status(self, user_id: str | int | None = None) -> dict | None:
        """Get Git synchronization status"""
        response = self.client.get("/git-sync/status", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        return response.json()

    def git_push(self, user_id: str | int | None = None) -> dict:
        """Force push notes to Git provider"""
        response = self.client.post("/git-sync/push", headers=self._headers_for_user(user_id))
        response.raise_for_status()
        return response.json()

    def git_pull(self, user_id: str | int | None = None) -> dict:
        """Force pull notes from Git provider"""
        response = self.client.post("/git-sync/pull", headers=self._headers_for_user(user_id))
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

    def restore_backup(self, filename: str, user_id: str | int | None = None) -> dict:
        """Restore a backup file
        
        Args:
            filename: Name of the backup file to restore
            user_id: User profile ID to access (optional, overrides default)
        """
        response = self.client.post(f"/backups/{filename}/restore", headers=self._headers_for_user(user_id))
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
