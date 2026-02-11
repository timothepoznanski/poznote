# Docker Image Versioning Strategy

Poznote follows semantic versioning (SemVer) for its Docker images, providing multiple tag strategies to suit different upgrade preferences.

## Available Tags

For each stable release (e.g., version `4.1.0`), the following Docker tags are automatically created:

| Tag Format | Example | Description | Auto-updates |
|------------|---------|-------------|--------------|
| **Major** | `poznote:4` | Latest version within major version 4 | ✅ Yes - within v4.x.x |
| **Minor** | `poznote:4.1` | Latest version within minor version 4.1 | ✅ Yes - within v4.1.x |
| **Patch** | `poznote:4.1.0` | Exact version | ❌ No - pinned version |
| **Latest** | `poznote:latest` | Latest stable release | ✅ Yes - latest stable |

## Usage Examples

### Recommended: Major Version Tag (Auto-upgrade without breaking changes)

```bash
docker pull ghcr.io/timothepoznanski/poznote:4
```

**Best for**: Production environments where you want automatic updates within the same major version.

- ✅ Automatically receives bug fixes and new features
- ✅ No breaking changes (semantic versioning promise)
- ✅ Simple migration to next major version when ready
- ✅ Balance between stability and updates

**Migration example**:
```bash
# Stay on v4 and get automatic updates (4.1.0, 4.2.0, 4.3.0, etc.)
docker pull ghcr.io/timothepoznanski/poznote:4

# When v5 is released and you're ready, manually switch
docker pull ghcr.io/timothepoznanski/poznote:5
```

### Minor Version Tag (Fine-grained control)

```bash
docker pull ghcr.io/timothepoznanski/poznote:4.1
```

**Best for**: Environments that want bug fixes but prefer to control minor version upgrades.

- ✅ Automatically receives patch updates (4.1.0 → 4.1.1 → 4.1.2)
- ❌ Won't automatically jump to 4.2.0

### Exact Version Tag (Maximum stability)

```bash
docker pull ghcr.io/timothepoznanski/poznote:4.1.0
```

**Best for**: Environments requiring exact version pinning.

- ✅ Complete control over updates
- ❌ No automatic updates - manual upgrade required

### Latest Tag (Bleeding edge)

```bash
docker pull ghcr.io/timothepoznanski/poznote:latest
```

**Best for**: Development/testing environments.

- ✅ Always the newest stable release
- ⚠️ May include major version changes (potential breaking changes)

## Docker Compose Examples

### Example 1: Major Version (Recommended)

```yaml
version: '3.8'
services:
  poznote:
    image: ghcr.io/timothepoznanski/poznote:4
    ports:
      - "8080:80"
    volumes:
      - ./data:/var/www/html/data
```

### Example 2: Minor Version

```yaml
version: '3.8'
services:
  poznote:
    image: ghcr.io/timothepoznanski/poznote:4.1
    ports:
      - "8080:80"
    volumes:
      - ./data:/var/www/html/data
```

### Example 3: Exact Version

```yaml
version: '3.8'
services:
  poznote:
    image: ghcr.io/timothepoznanski/poznote:4.1.0
    ports:
      - "8080:80"
    volumes:
      - ./data:/var/www/html/data
```

## Pre-release Versions

Test and beta versions (e.g., `4.2.0-beta`, `4.1.5-test`) are published with their full version tag only:

- ✅ Available: `poznote:4.2.0-beta`
- ❌ Not tagged: `poznote:4`, `poznote:4.2`, `poznote:latest`

This prevents pre-release versions from affecting stable tag users.

## Automatic Updates with Watchtower

> **⚠️ Important Limitation**: Watchtower only updates Docker images, not `docker-compose.yml` or `.env` files. If a new version requires new environment variables or configuration changes, your application may break. For production, manual updates are recommended.

To automatically update your Poznote container when new versions are released:

```yaml
version: '3.8'
services:
  poznote:
    image: ghcr.io/timothepoznanski/poznote:4  # Will auto-update within v4.x.x
    ports:
      - "8080:80"
    volumes:
      - ./data:/var/www/html/data
  
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400  # Check daily
```

## MCP Server Versioning

The MCP (Model Context Protocol) server follows the same versioning strategy:

```bash
# Major version
docker pull ghcr.io/timothepoznanski/poznote-mcp:4

# Minor version
docker pull ghcr.io/timothepoznanski/poznote-mcp:4.1

# Exact version
docker pull ghcr.io/timothepoznanski/poznote-mcp:4.1.0

# Latest
docker pull ghcr.io/timothepoznanski/poznote-mcp:latest
```

## Semantic Versioning Explanation

Poznote follows [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
  4  .  1  .  0
```

- **MAJOR** version: Breaking changes / incompatible API changes
- **MINOR** version: New features (backward compatible)
- **PATCH** version: Bug fixes (backward compatible)

## FAQ

**Q: Which tag should I use?**  
A: For most users, use the major version tag (e.g., `poznote:4`) for a good balance between stability and updates.

**Q: How do I know when a new major version is released?**  
A: Check the [GitHub Releases](https://github.com/timothepoznanski/poznote/releases) page for announcements and migration guides.

**Q: Will `poznote:4` ever update to version 5?**  
A: No, it will only receive updates within the 4.x.x range. You must explicitly switch to `poznote:5` when ready.

**Q: What if I want zero automatic updates?**  
A: Use an exact version tag like `poznote:4.1.0`.

**Q: Are old versions kept?**  
A: Yes, we maintain the 20 most recent versions in the registry. Older exact versions remain accessible.

## Security Considerations

- 🔒 Major version tags (`poznote:4`) provide security patches automatically
- 🔒 Exact version tags require manual security updates
- 🔒 Always review release notes before major version upgrades
- 🔒 Use major/minor tags for production to receive security patches

## Support

For questions about versioning or Docker deployment:
- GitHub Issues: https://github.com/timothepoznanski/poznote/issues
- Documentation: https://github.com/timothepoznanski/poznote/tree/main/Docs
