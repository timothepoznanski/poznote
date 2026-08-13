# Using Poznote MCP Server with Claude CLI

This guide explains how to configure and use the Poznote MCP server with Claude CLI (Command Line Interface).

## Prerequisites

- **Anthropic API key:** Claude CLI requires a paid [Anthropic API key](https://console.anthropic.com/). Set it before using the CLI:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- Claude CLI installed (`npm install -g @anthropic-ai/claude-cli` or similar)
- Poznote MCP server running (via Docker Compose)
- MCP server accessible on 127.0.0.1 (default port: 8045)

## Installation

### 1. Verify MCP Server is Running

Check that your MCP server container is running:

```bash
docker ps | grep mcp
```

You should see the MCP server running. Note the port number in the output (default is 8045).

### 2. Add MCP Server to Claude CLI

Add the Poznote MCP server using the HTTP transport:

```bash
claude mcp add --transport http poznote http://127.0.0.1:8045/mcp
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
# IMPORTANT: if you do not specify the workspace, the note is created in the
# connected user's default workspace. Always specify the target workspace.
claude "Create a note in Poznote titled 'Meeting Notes' in workspace 'Projets' with content 'Discussion about the new feature'"

# Update an existing note
claude "Update note 456 in Poznote with new content about the deployment process"

# Delete a note (moves it to the trash)
claude "Delete note 456 in Poznote"

# Create a note with a reminder, in one step
claude "Create a note 'Renew passport' in workspace 'Perso' in Poznote and remind me on September 1st at 9am"

# Create a folder
claude "Create a folder called 'Projects' in Poznote"
```

### Reminders

```bash
# Set a reminder on an existing note
claude "Remind me about note 123 in Poznote next Monday at 8am"

# Set a repeating reminder
claude "Set a weekly reminder on note 123 in Poznote, every Monday at 9am"

# Check a reminder
claude "Does note 123 in Poznote have a reminder?"

# Remove a reminder
claude "Remove the reminder from note 123 in Poznote"
```

### Task Lists

```bash
# List the tasks of a task list note
claude "Show me the tasks of note 123 in Poznote"

# Add a task with a due date and a reminder
claude "Add a task 'Buy milk' due tomorrow at 6:30pm with a reminder to note 123 in Poznote"

# Add a recurring task
claude "Add a task 'Weekly report' to note 123 in Poznote, due every Friday"

# Complete a task
claude "Mark the task 'Buy milk' in note 123 as done in Poznote"

# Update or delete a task
claude "Move the due date of task 'Buy milk' in note 123 to next Monday in Poznote"
claude "Delete the task 'Buy milk' from note 123 in Poznote"
```

### Advanced Operations

```bash
# Duplicate a note
claude "Duplicate note 789 in Poznote"

# Toggle favorite
claude "Mark note 123 as favorite in Poznote"

# Move note to folder
claude "Move note 456 to folder 'Projects' in Poznote"

# Convert a note between HTML and Markdown
claude "Convert note 123 in Poznote to Markdown"

# Find the notes linking to a note
claude "Which notes link to note 123 in Poznote?"

# Share a note
claude "Enable public sharing for note 123 in Poznote"

# List everything shared publicly
claude "List all my publicly shared notes and folders in Poznote"

# Get system info
claude "What version of Poznote am I running?"
```

### Folders and Workspaces

```bash
# Rename or delete a folder
claude "Rename folder 12 to 'Archive' in Poznote"
claude "Delete folder 12 in Poznote and move its notes to trash"

# Manage workspaces
claude "Create a workspace called 'Work' in Poznote"
claude "Rename the workspace 'Work' to 'Job' in Poznote"
claude "Delete the workspace 'Job' in Poznote"
```

### Settings

```bash
# Read a setting
claude "What is the 'timezone' setting in Poznote?"

# Update a setting
claude "Set the 'timezone' setting to 'Europe/Paris' in Poznote"
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

# Restore a backup (⚠️ replaces all current user data)
claude "Restore the Poznote backup poznote_backup_2026-02-02_15-30-00.zip"

# Delete a backup file
claude "Delete the Poznote backup poznote_backup_2026-02-02_15-30-00.zip"
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
claude mcp add --transport http poznote http://127.0.0.1:YOUR_PORT/mcp
```

### Removing the Server

To remove the Poznote MCP server from Claude CLI:
```bash
claude mcp remove poznote
```

### Multiple Instances

If you run multiple Poznote instances on different ports, you can configure them with different names:
```bash
claude mcp add --transport http poznote-personal http://127.0.0.1:8045/mcp
claude mcp add --transport http poznote-work http://127.0.0.1:9045/mcp
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
   curl http://127.0.0.1:8045/mcp
   ```
   (Replace `8045` with your configured port)

2. **Verify Docker container status:**
   ```bash
   docker ps | grep mcp
  docker compose logs mcp-server
   ```

3. **Check port binding:**
   Ensure the port is bound to 127.0.0.1 in `docker-compose.yml`:
   ```yaml
   ports:
     - "127.0.0.1:${POZNOTE_MCP_PORT:-8045}:8045"
   ```

### Authentication Errors

The MCP server authenticates to Poznote with the shared token stored in `data/.mcp_token`.

Check these points:
- `./data/.mcp_token` exists on the Poznote host
- the `mcp-server` service mounts `./data:/var/www/html/data:ro`
- the webserver container has been recreated at least once after updating to the token-based MCP setup

### Debug Mode

Enable debug logging for the MCP server by recreating the container with an inline environment variable:
```bash
POZNOTE_DEBUG=true docker compose up -d --force-recreate mcp-server
```

Only the exact lowercase values `true` and `false` are recognized. Any other value is treated as `false` and a warning is written to the MCP logs.

Then check the logs:
```bash
docker compose logs -f mcp-server
```

## Security Notes

⚠️ **Important:** The MCP server does not implement authentication for incoming requests. It should only be accessible from 127.0.0.1 or through a secure tunnel.

**Default configuration (secure):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**For remote access, use SSH tunneling:**
```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

## Available MCP Tools

The Poznote MCP server provides the following tools:

### Note Management
- `get_note` - Get a specific note by ID
- `list_notes` - List all notes
- `search_notes` - Search notes by text query, with optional creation date range
- `create_note` - Create a new note, optionally with a due date/reminder
- `update_note` - Update an existing note, and/or set its due date/reminder
- `delete_note` - Delete a note
- `duplicate_note` - Duplicate a note
- `convert_note` - Convert a note between HTML and Markdown
- `get_backlinks` - Get the notes linking to a note

### Reminders
- `get_reminder` - Get the reminder set on a note
- `set_reminder` - Set or replace a note's reminder, with an optional repeat interval
- `remove_reminder` - Remove the reminder from a note

### Tasks
- `list_tasks` - List the tasks of a tasklist note, with their IDs and due dates
- `add_task` - Add a single task, with an optional due date and reminder
- `update_task` - Update one task (text, due date, reminder, important flag)
- `complete_task` - Mark a task as done, or reopen it
- `delete_task` - Delete one task from a tasklist note

### Organization
- `create_folder` - Create a new folder
- `list_folders` - List all folders
- `rename_folder` - Rename a folder
- `delete_folder` - Delete a folder and move its notes to trash
- `list_workspaces` - List all workspaces
- `create_workspace` - Create a new workspace
- `rename_workspace` - Rename a workspace
- `delete_workspace` - Delete a workspace (cannot delete the last one)
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
- `list_shared` - List all publicly shared notes and folders

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
- `restore_backup` - Restore a backup (replaces current user data)
- `delete_backup` - Delete a backup file
- `get_app_setting` - Get application setting
- `update_app_setting` - Update application setting

### Multi-User Support

Most tools accept an optional `user_id` parameter to target specific user profiles. The exceptions are the system-level tools `get_system_info`, `list_backups`, `create_backup` and `delete_backup`, which do not take `user_id`.
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
- Review MCP server logs: `docker compose logs mcp-server`
- Verify Poznote API is accessible
