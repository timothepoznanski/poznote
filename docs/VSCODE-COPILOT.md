# Using Poznote MCP Server with VS Code Copilot

This guide explains how to configure and use the Poznote MCP server with VS Code Copilot.

## Prerequisites

- Visual Studio Code installed
- **GitHub Copilot subscription:** A paid (or trial) [GitHub Copilot](https://github.com/features/copilot) plan is required, with the Copilot Chat extension enabled in VS Code
- Poznote MCP server running (via Docker Compose)
- MCP server accessible on 127.0.0.1 (default port: 8045)

## Configuration

### 1. Verify MCP Server is Running

Check that your MCP server container is running:

```bash
docker ps | grep mcp
```

You should see the MCP server running. Note the port number in the output (default is 8045).

### 2. Configure VS Code

Add the Poznote MCP server to your `mcp.json` file. The location depends on your operating system :

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

If the file doesn't exist, create it with the following configuration :

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    }
  }
}
```

> **Note:** Replace `8045` with your actual MCP server port if you've customized it in your `docker-compose.yml`.

#### Using an authentication token

If the MCP server was started with `POZNOTE_MCP_AUTH_TOKEN` (see [Inbound authentication token](MCP-SERVER.md#inbound-authentication-token)), add the matching header, otherwise every call is rejected with `401 Unauthorized`:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

To keep the token out of `mcp.json`, VS Code can prompt for it instead: declare an `inputs` entry with `"password": true` and reference it as `"Authorization": "Bearer ${input:poznote-token}"`.

### 3. Reload VS Code

After updating `mcp.json`, reload VS Code for the changes to take effect:
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type "Reload Window" and press Enter

## Remote Server Setup

If your Poznote instance runs on a remote server, use SSH port forwarding to securely connect.

### 1. Establish SSH Tunnel

If you prefer the command line, create a classic SSH tunnel:

```bash
ssh -L 8045:127.0.0.1:8045 user@your-server
```

Keep this connection open while using VS Code Copilot with Poznote.

If you are already connected to the remote machine through VS Code Remote SSH, Dev Containers, or Codespaces, you can also create the tunnel directly from VS Code in the `PORTS` view:

1. Open the `PORTS` panel in VS Code.
2. Forward remote port `8045`.
3. Keep the forwarded port active while using Copilot.
4. If VS Code assigns a local port other than `8045`, use that local port in `mcp.json`.

### 2. Configure VS Code

Use the same `mcp.json` configuration as for local installation:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    }
  }
}
```

The SSH tunnel or VS Code forwarded port exposes the remote MCP server to your local machine, so VS Code connects to `127.0.0.1`.

## Usage Examples

Once configured, you can interact with your Poznote instance directly from VS Code using natural language in Copilot Chat:

### Basic Operations

```
# List all notes
@poznote List all my notes

# Search notes
@poznote Search for notes about "docker"

# Get a specific note
@poznote Show me note 123

# List workspaces
@poznote What workspaces do I have?

# List folders
@poznote Show me all folders in my workspace
```

### Creating and Updating Notes

> **Workspace**: if you do not specify the workspace in your request, the note is created in the connected user's default workspace. Explicitly name the target workspace to avoid any confusion, for example: *"in workspace 'Projets'"*.

```
@poznote Create a note titled "Meeting Notes" in workspace "Projets" with content about the new feature

@poznote Update note 456 with new content about the deployment process

@poznote Delete note 456 (moves it to the trash)

@poznote Create a note "Renew passport" in workspace "Perso" and remind me on September 1st at 9am

@poznote Create a folder called "Projects"
```

### Reminders

```
@poznote Remind me about note 123 next Monday at 8am

@poznote Set a weekly reminder on note 123, every Monday at 9am

@poznote Does note 123 have a reminder?

@poznote Remove the reminder from note 123
```

### Task Lists

```
@poznote Show me the tasks of note 123

@poznote Add a task "Buy milk" due tomorrow at 6:30pm with a reminder to note 123

@poznote Add a task "Weekly report" to note 123, due every Friday

@poznote Mark the task "Buy milk" in note 123 as done

@poznote Move the due date of task "Buy milk" in note 123 to next Monday

@poznote Delete the task "Buy milk" from note 123
```

### Advanced Operations

```
@poznote Duplicate note 789

@poznote Mark note 123 as favorite

@poznote Move note 456 to folder "Projects"

@poznote Convert note 123 to Markdown

@poznote Which notes link to note 123?

@poznote Enable public sharing for note 123

@poznote List all my publicly shared notes and folders

@poznote What version of Poznote am I running?
```

### Folders and Workspaces

```
@poznote Rename folder 12 to "Archive"

@poznote Delete folder 12 and move its notes to trash

@poznote Create a workspace called "Work"

@poznote Rename the workspace "Work" to "Job"

@poznote Delete the workspace "Job"
```

### Trash and Restore

```
@poznote Show me all notes in the trash

@poznote Restore note 123 from the trash

@poznote Empty the trash
```

### Git Synchronization

```
@poznote What's the status of Git sync?

@poznote Push my notes to Git

@poznote Pull notes from Git
```

### Backups and Settings

```
@poznote List all backups

@poznote Create a backup of my data

@poznote Restore the backup poznote_backup_2026-02-02_15-30-00.zip

@poznote Delete the backup poznote_backup_2026-02-02_15-30-00.zip

@poznote What is the "timezone" setting?

@poznote Set the "timezone" setting to "Europe/Paris"
```

### Working with Content

```
@poznote Can you summarize all my notes tagged with "important"?

@poznote Help me organize my notes into folders based on their topics

@poznote Create a weekly report based on my meeting notes
```

## Troubleshooting

### Connection Issues

If VS Code Copilot cannot connect to the MCP server:

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

4. **Verify mcp.json syntax:**
   Ensure your JSON is valid (no trailing commas, proper quotes, etc.)

### MCP Server Not Recognized

If VS Code doesn't recognize the Poznote MCP server:

1. Check that you've reloaded VS Code after editing `mcp.json`
2. Verify that GitHub Copilot is enabled and active
3. Check the VS Code output panel for any error messages:
   - View → Output
   - Select "GitHub Copilot" from the dropdown

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

## Available MCP Tools

The Poznote MCP server provides the following tools that VS Code Copilot can use:

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

Most tools accept an optional `user_id` parameter to target specific user profiles. The exceptions are the system-level tools `get_system_info`, `list_backups`, `create_backup` and `delete_backup`, which do not take `user_id`. You can specify this in your prompts:

```
@poznote List notes for user 2
```

## Advanced Configuration

### Multiple Poznote Instances

If you run multiple Poznote instances, you can configure them with different names:

```json
{
  "servers": {
    "poznote-personal": {
      "type": "http",
      "url": "http://127.0.0.1:8045/mcp"
    },
    "poznote-work": {
      "type": "http",
      "url": "http://127.0.0.1:9045/mcp"
    }
  }
}
```

Then reference them explicitly:
```
@poznote-work List my work notes
```

### Custom Port Configuration

If your MCP server runs on a different port, update the URL in `mcp.json`:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://127.0.0.1:YOUR_PORT/mcp"
    }
  }
}
```

## Security Notes

⚠️ **Important:** Anyone who can reach the MCP endpoint can manage every note. By default it is only reachable from 127.0.0.1; if you expose it further, set `POZNOTE_MCP_AUTH_TOKEN` so clients must present a bearer token (see [Using an authentication token](#using-an-authentication-token)).

**Default configuration (secure):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from 127.0.0.1
```

**For remote access, always use SSH tunneling** as described in the [Remote Server Setup](#remote-server-setup) section.

Full details: [MCP Server Security](MCP-SERVER.md#security).

## Resources

- [Main MCP Server Documentation](MCP-SERVER.md)
- [VS Code MCP Official Documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Claude CLI Setup](CLAUDE-CLI.md)
- [Security Considerations](MCP-SERVER.md#security-considerations)

## Support

For issues or questions:
- Check the [main MCP documentation](MCP-SERVER.md)
- Review MCP server logs: `docker compose logs mcp-server`
- Verify Poznote API is accessible
- Check VS Code output panel for errors
