# Using Poznote MCP Server with Claude CLI

This guide explains how to configure and use the Poznote MCP server with Claude CLI (Command Line Interface).

## Prerequisites

- Claude CLI installed (`npm install -g @anthropic-ai/claude-cli` or similar)
- Poznote MCP server running (via Docker Compose)
- MCP server accessible on localhost (default port: 8045)

## Installation

### 1. Verify MCP Server is Running

Check that your MCP server container is running:

```bash
docker ps | grep mcp-server
```

You should see the MCP server running. Note the port number in the output (default is 8045).

### 2. Add MCP Server to Claude CLI

Add the Poznote MCP server using the HTTP transport:

```bash
claude mcp add --transport http poznote http://localhost:8045/mcp
```

> **Note:** Replace `8045` with your actual MCP server port if you've customized it in your `docker-compose.yml`.

The configuration will be saved to either:
- **Project-level:** `/your/project/.claude.json` (when run from within a project)
- **User-level:** `~/.claude.json` (global configuration)

### 3. Verify Configuration

List all configured MCP servers:
```bash
claude mcp list
```

You should see `poznote` in the list with its HTTP URL.

### 4. View Server Details

Get detailed information about the Poznote MCP server:
```bash
claude mcp get poznote
```

## Usage Examples

Once configured, you can interact with your Poznote instance using natural language commands:

### Basic Queries

```bash
# List all notes
claude "List all my notes from Poznote"

# Search notes
claude "Search for notes about 'docker' in Poznote"

# Get a specific note
claude "Show me note 123 from Poznote"

# List workspaces
claude "What workspaces do I have in Poznote?"

# List folders
claude "Show me all folders in my Poznote workspace"
```

### Creating and Updating Notes

```bash
# Create a new note
claude "Create a note in Poznote titled 'Meeting Notes' with content 'Discussion about the new feature'"

# Update an existing note
claude "Update note 456 in Poznote with new content about the deployment process"

# Create a folder
claude "Create a folder called 'Projects' in Poznote"
```

### Advanced Operations

```bash
# Duplicate a note
claude "Duplicate note 789 in Poznote"

# Toggle favorite
claude "Mark note 123 as favorite in Poznote"

# Move note to folder
claude "Move note 456 to folder 'Projects' in Poznote"

# Share a note
claude "Enable public sharing for note 123 in Poznote"

# Get system info
claude "What version of Poznote am I running?"
```

### Trash and Restore

```bash
# View trash
claude "Show me all notes in the Poznote trash"

# Restore a note
claude "Restore note 123 from Poznote trash"

# Empty trash
claude "Empty the Poznote trash"
```

### Git Synchronization

```bash
# Check Git sync status
claude "What's the status of Git sync in Poznote?"

# Push to Git
claude "Push my Poznote notes to Git"

# Pull from Git
claude "Pull notes from Git to Poznote"
```

### Backups

```bash
# List backups
claude "List all Poznote backups"

# Create a backup
claude "Create a backup of my Poznote data"
```

## Interactive Mode

Start an interactive session where you can have a conversation with Claude about your notes:

```bash
claude
```

Then ask questions naturally:
- "Can you show me all my notes tagged with 'important'?"
- "Create a summary of all my meeting notes from last week"
- "Help me organize my notes into folders"

## Configuration Options

### Using a Custom Port

If your MCP server runs on a different port (check your `docker-compose.yml` for the `POZNOTE_MCP_PORT` setting):
```bash
claude mcp add --transport http poznote http://localhost:YOUR_PORT/mcp
```

### Removing the Server

To remove the Poznote MCP server from Claude CLI:
```bash
claude mcp remove poznote
```

### Multiple Instances

If you run multiple Poznote instances on different ports, you can configure them with different names:
```bash
claude mcp add --transport http poznote-personal http://localhost:8045/mcp
claude mcp add --transport http poznote-work http://localhost:9045/mcp
```

Then specify which instance to use in your queries:
```bash
claude "List notes from poznote-work"
```

## Troubleshooting

### Connection Issues

If Claude CLI cannot connect to the MCP server:

1. **Check if the MCP server is running:**
   ```bash
   curl http://localhost:8045/mcp
   ```
   (Replace `8045` with your configured port)

2. **Verify Docker container status:**
   ```bash
   docker ps | grep mcp-server
   docker logs poznote-mcp-server
   ```

3. **Check port binding:**
   Ensure the port is bound to localhost in `docker-compose.yml`:
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### Authentication Errors

The MCP server authenticates to Poznote using credentials from `docker-compose.yml`. Check these environment variables:
- `POZNOTE_MCP_USERNAME`
- `POZNOTE_MCP_USER_ID`
- `POZNOTE_MCP_WORKSPACE`

### Debug Mode

Enable debug logging in the MCP server by setting in `docker-compose.yml`:
```yaml
environment:
  POZNOTE_DEBUG: "true"
```

Then check the logs:
```bash
docker logs -f poznote-mcp-server
```

## Security Notes

⚠️ **Important:** The MCP server does not implement authentication for incoming requests. It should only be accessible from localhost or through a secure tunnel.

**Default configuration (secure):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from localhost
```

**For remote access, use SSH tunneling:**
```bash
ssh -L 8045:localhost:8045 user@your-server
```

## Available MCP Tools

The Poznote MCP server provides the following tools:

### Note Management
- `get_note` - Get a specific note by ID
- `list_notes` - List all notes
- `search_notes` - Search notes by text query
- `create_note` - Create a new note
- `update_note` - Update an existing note
- `delete_note` - Delete a note
- `duplicate_note` - Duplicate a note

### Organization
- `create_folder` - Create a new folder
- `list_folders` - List all folders
- `list_workspaces` - List all workspaces
- `list_tags` - List all tags
- `move_note_to_folder` - Move note to folder
- `remove_note_from_folder` - Remove note from folder
- `toggle_favorite` - Toggle favorite status

### Trash Management
- `get_trash` - List notes in trash
- `restore_note` - Restore from trash
- `empty_trash` - Empty trash

### Sharing
- `share_note` - Enable public sharing
- `unshare_note` - Disable public sharing
- `get_note_share_status` - Get sharing status

### Attachments
- `list_attachments` - List note attachments

### Git Synchronization
- `get_git_sync_status` - Get Git sync status
- `git_push` - Push to Git repository
- `git_pull` - Pull from Git repository

### System
- `get_system_info` - Get Poznote version info
- `list_backups` - List system backups
- `create_backup` - Create a backup
- `get_app_setting` - Get application setting

### Multi-User Support

Most tools accept an optional `user_id` parameter to target specific user profiles:
```bash
claude "List notes for user 2 in Poznote"
```

## Related Documentation

- [Main MCP Server Documentation](MCP-SERVER.md)
- [VS Code Copilot Setup](VSCODE-COPILOT.md)
- [Security Considerations](MCP-SERVER.md#security-considerations)

## Support

For issues or questions:
- Check the [main MCP documentation](MCP-SERVER.md)
- Review MCP server logs: `docker logs poznote-mcp-server`
- Verify Poznote API is accessible
