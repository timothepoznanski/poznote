# Multiple Instances Setup

Run multiple isolated Poznote instances on the same server.

## Table of Contents
- [Overview](#overview)
- [Use Cases](#use-cases)
- [Architecture](#architecture)
- [Setup Instructions](#setup-instructions)
- [Managing Multiple Instances](#managing-multiple-instances)
- [Best Practices](#best-practices)

---

## Overview

Multiple Poznote instances allow you to run completely isolated installations on a single server. Each instance:
- Has its own data, port, and credentials
- Runs independently in its own Docker container
- Cannot access or interfere with other instances
- Can be updated independently

---

## Use Cases

### Why Run Multiple Instances?

**1. Multi-User Hosting**
- Host Poznote for different users on the same server
- Each user has their own private instance and account
- Complete data isolation between users

**2. Testing and Development**
- Run a production instance alongside a testing instance
- Test new features without affecting your live data
- Experiment with different configurations

**3. Workspace Separation**
- Personal vs. Work instances
- Different projects with complete isolation
- Separate instances for different organizations

---

## Architecture

### Example: Two Users on Same Server

```
Server: my-server.com
├── Poznote-Tom/
│   ├── Port: 8040
│   ├── URL: http://my-server.com:8040
│   ├── Container: poznote-tom-webserver-1
│   ├── Data: ./data/
│   └── .env (Tom's credentials)
│
└── Poznote-Alice/
    ├── Port: 8041
    ├── URL: http://my-server.com:8041
    ├── Container: poznote-alice-webserver-1
    ├── Data: ./data/
    └── .env (Alice's credentials)
```

### Resource Isolation

Each instance has:
- **Separate container** - Independent process
- **Separate data directory** - No shared files
- **Separate port** - No network conflicts
- **Separate database** - No data mixing
- **Separate credentials** - Independent authentication

---

## Setup Instructions

### Method 1: Different Directories

The simplest approach - repeat the installation in different directories.

#### Step 1: Create First Instance (Tom)

```bash
# Create directory for Tom
mkdir poznote-tom
cd poznote-tom

# Create .env file
cat <<EOF > .env
POZNOTE_USERNAME=tom
POZNOTE_PASSWORD=toms_secure_password
HTTP_WEB_PORT=8040
EOF

# Create docker-compose.yml
cat <<'EOF' > docker-compose.yml
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest
    restart: always
    environment:
      SQLITE_DATABASE: /var/www/html/data/database/poznote.db
      POZNOTE_USERNAME: ${POZNOTE_USERNAME}
      POZNOTE_PASSWORD: ${POZNOTE_PASSWORD}
      HTTP_WEB_PORT: ${HTTP_WEB_PORT}
    ports:
      - "${HTTP_WEB_PORT}:80"
    volumes:
      - "./data:/var/www/html/data"
EOF

# Start Tom's instance
docker compose pull
docker compose up -d
```

#### Step 2: Create Second Instance (Alice)

```bash
# Return to parent directory
cd ..

# Create directory for Alice
mkdir poznote-alice
cd poznote-alice

# Create .env file with DIFFERENT port
cat <<EOF > .env
POZNOTE_USERNAME=alice
POZNOTE_PASSWORD=alices_secure_password
HTTP_WEB_PORT=8041
EOF

# Create docker-compose.yml (same as Tom's)
cat <<'EOF' > docker-compose.yml
services:
  webserver:
    image: ghcr.io/timothepoznanski/poznote:latest
    restart: always
    environment:
      SQLITE_DATABASE: /var/www/html/data/database/poznote.db
      POZNOTE_USERNAME: ${POZNOTE_USERNAME}
      POZNOTE_PASSWORD: ${POZNOTE_PASSWORD}
      HTTP_WEB_PORT: ${HTTP_WEB_PORT}
    ports:
      - "${HTTP_WEB_PORT}:80"
    volumes:
      - "./data:/var/www/html/data"
EOF

# Start Alice's instance
docker compose pull
docker compose up -d
```

#### Step 3: Verify Both Instances

```bash
# Check running containers
docker ps

# You should see both containers running:
# poznote-tom-webserver-1    (port 8040)
# poznote-alice-webserver-1  (port 8041)
```

### Access the Instances

- **Tom's Poznote:** http://localhost:8040
  - Username: `tom`
  - Password: `toms_secure_password`

- **Alice's Poznote:** http://localhost:8041
  - Username: `alice`
  - Password: `alices_secure_password`

---

## Managing Multiple Instances

### Starting/Stopping Specific Instances

Each instance is managed independently:

```bash
# Tom's instance
cd poznote-tom
docker compose start   # Start
docker compose stop    # Stop
docker compose restart # Restart

# Alice's instance
cd poznote-alice
docker compose start
docker compose stop
docker compose restart
```

### Updating Specific Instances

Update instances independently:

```bash
# Update Tom's instance only
cd poznote-tom
docker compose down
docker rmi ghcr.io/timothepoznanski/poznote:latest
docker compose pull
docker compose up -d

# Alice's instance remains on the old version
```

### Viewing Logs

```bash
# Tom's logs
cd poznote-tom
docker compose logs

# Alice's logs
cd poznote-alice
docker compose logs
```

### Backup Individual Instances

Each instance can be backed up separately:

```bash
# Backup Tom's data
cd poznote-tom
tar -czf tom-backup-$(date +%Y%m%d).tar.gz data/

# Backup Alice's data
cd poznote-alice
tar -czf alice-backup-$(date +%Y%m%d).tar.gz data/
```

---

## Best Practices

### 1. Port Management

**Systematic Port Assignment:**
```
Instance 1: 8040
Instance 2: 8041
Instance 3: 8042
Instance N: 8040 + (N-1)
```

**Document Your Ports:**
Create a reference file:
```bash
# /root/poznote-instances.txt
Tom:    8040
Alice:  8041
Test:   8042
Prod:   8043
```

### 2. Naming Conventions

Use clear, consistent directory names:
```bash
poznote-tom/          # User-based
poznote-alice/
poznote-production/   # Environment-based
poznote-testing/
poznote-personal/     # Purpose-based
poznote-work/
```

### 3. Resource Monitoring

Monitor resource usage with multiple instances:

```bash
# Check Docker resource usage
docker stats

# Check disk usage
df -h

# Check memory
free -h
```

### 4. Security Considerations

- **Unique passwords** for each instance
- **Firewall rules** to restrict access if needed
- **SSL/TLS** via reverse proxy for production
- **Regular backups** for each instance

### 5. Reverse Proxy Setup (Optional)

For cleaner URLs, use Nginx as reverse proxy:

```nginx
# /etc/nginx/sites-available/poznote-instances

server {
    listen 80;
    server_name tom.poznote.example.com;
    
    location / {
        proxy_pass http://localhost:8040;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name alice.poznote.example.com;
    
    location / {
        proxy_pass http://localhost:8041;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Access via:
- `http://tom.poznote.example.com`
- `http://alice.poznote.example.com`

---

## Scaling Considerations

### Server Resources

**Per Poznote Instance (Approximate):**
- **RAM:** 100-200 MB (idle)
- **CPU:** Minimal (spikes during backup/operations)
- **Disk:** Depends on notes and attachments

**Planning Multiple Instances:**
```
Small VPS (2GB RAM):    ~8-10 light users
Medium VPS (4GB RAM):   ~15-20 light users
Large VPS (8GB RAM):    ~30-40 light users
```

### Performance Tips

1. **Use SSD storage** for better database performance
2. **Regular cleanup** of old backups to save disk space
3. **Monitor disk I/O** if running many instances
4. **Consider separate server** for 20+ instances

---

## Troubleshooting

### Port Conflicts

**Error:** "Port is already allocated"

**Solution:**
```bash
# Check what's using the port
netstat -tulpn | grep 8041

# Change port in .env
nano .env
# Change HTTP_WEB_PORT to unused port

# Restart
docker compose down
docker compose up -d
```

### Container Name Conflicts

**Error:** "Container name already in use"

**Solution:**
Docker Compose uses directory name for container names. Ensure each instance is in a uniquely named directory.

```bash
# Good (unique directory names)
poznote-tom/
poznote-alice/

# Bad (same directory name)
poznote/
poznote/
```

### Cross-Instance Access

**Problem:** Can't access data from one instance in another

**This is by design!** Instances are isolated. To share data:
1. Export notes from Instance A
2. Import into Instance B

---

## Advanced: Docker Compose Profiles

For advanced users, use profiles to manage multiple instances in one compose file:

```yaml
services:
  tom:
    profiles: ["tom"]
    image: ghcr.io/timothepoznanski/poznote:latest
    ports:
      - "8040:80"
    volumes:
      - "./data-tom:/var/www/html/data"
    environment:
      POZNOTE_USERNAME: tom
      POZNOTE_PASSWORD: ${TOM_PASSWORD}
  
  alice:
    profiles: ["alice"]
    image: ghcr.io/timothepoznanski/poznote:latest
    ports:
      - "8041:80"
    volumes:
      - "./data-alice:/var/www/html/data"
    environment:
      POZNOTE_USERNAME: alice
      POZNOTE_PASSWORD: ${ALICE_PASSWORD}
```

Start specific instances:
```bash
docker compose --profile tom up -d
docker compose --profile alice up -d
```

---

## Related Guides

- [Installation Guide](Installation-Guide)
- [Configuration](Configuration)
- [Backup and Restore](Backup-and-Restore)
