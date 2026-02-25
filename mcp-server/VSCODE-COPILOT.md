# Using Poznote MCP Server with VS Code Copilot

This guide explains how to configure and use the Poznote MCP server with VS Code Copilot.

## Prerequisites

- Visual Studio Code installed
- GitHub Copilot subscription and extension enabled
- Poznote MCP server running (via Docker Compose)
- MCP server accessible on localhost (default port: 8045)

## Configuration

### 1. Verify MCP Server is Running

Check that your MCP server container is running:

```bash
docker ps | grep mcp-server
```

You should see the MCP server running. Note the port number in the output (default is 8045).

### 2. Configure VS Code

Add the Poznote MCP server to your `mcp.json` file:

**Local installation:**
```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://localhost:8045/mcp"
    }
  }
}
```

> **Note:** Replace `8045` with your actual MCP server port if you've customized it in your `docker-compose.yml`.

### 3. Locate mcp.json

The `mcp.json` file location depends on your operating system:

- **Windows:** `C:\Users\YOUR-USERNAME\AppData\Roaming\Code\User\mcp.json`
- **Linux:** `~/.config/Code/User/mcp.json`
- **macOS:** `~/Library/Application Support/Code/User/mcp.json`

If the file doesn't exist, create it with the JSON configuration above.

### 4. Reload VS Code

After updating `mcp.json`, reload VS Code for the changes to take effect:
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type "Reload Window" and press Enter

## Remote Server Setup

If your Poznote instance runs on a remote server, use SSH port forwarding to securely connect.

### 1. Establish SSH Tunnel

```bash
ssh -L 8045:localhost:8045 user@your-server
```

Keep this connection open while using VS Code Copilot with Poznote.

### 2. Configure VS Code

Use the same `mcp.json` configuration as for local installation:

```json
{
  "servers": {
    "poznote": {
      "type": "http",
      "url": "http://localhost:8045/mcp"
    }
  }
}
```

The SSH tunnel forwards the remote MCP server to your local machine, so VS Code connects to `localhost`.

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

```
@poznote Create a note titled "Meeting Notes" with content about the new feature

@poznote Update note 456 with new content about the deployment process

@poznote Create a folder called "Projects"
```

### Advanced Operations

```
@poznote Duplicate note 789

@poznote Mark note 123 as favorite

@poznote Move note 456 to folder "Projects"

@poznote Enable public sharing for note 123

@poznote What version of Poznote am I running?
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

The MCP server authenticates to Poznote using credentials from `docker-compose.yml`. Check these environment variables:

```yaml
environment:
  POZNOTE_USERNAME: ${POZNOTE_MCP_USERNAME:-admin}
  POZNOTE_USER_ID: ${POZNOTE_MCP_USER_ID:-1}
  POZNOTE_DEFAULT_WORKSPACE: ${POZNOTE_MCP_WORKSPACE:-Poznote}
```

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

## Available MCP Tools

The Poznote MCP server provides the following tools that VS Code Copilot can use:

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

Most tools accept an optional `user_id` parameter to target specific user profiles. You can specify this in your prompts:

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
      "url": "http://localhost:8045/mcp"
    },
    "poznote-work": {
      "type": "http",
      "url": "http://localhost:9045/mcp"
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
      "url": "http://localhost:YOUR_PORT/mcp"
    }
  }
}
```

## Security Notes

⚠️ **Important:** The MCP server does not implement authentication for incoming requests. It should only be accessible from localhost or through a secure tunnel.

**Default configuration (secure):**
```yaml
ports:
  - "127.0.0.1:8045:8045"  # Only accessible from localhost
```

**For remote access, always use SSH tunneling** as described in the [Remote Server Setup](#remote-server-setup) section.

## Resources

- [Main MCP Server Documentation](README.md)
- [VS Code MCP Official Documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [Claude CLI Setup](CLAUDE-CLI.md)
- [Security Considerations](README.md#security-considerations)

## Support

For issues or questions:
- Check the [main README](README.md)
- Review MCP server logs: `docker logs poznote-mcp-server`
- Verify Poznote API is accessible
- Check VS Code output panel for errors
