# Tech Stack

Learn about the technologies powering Poznote.

## Philosophy

Poznote prioritizes **simplicity** and **portability** - no complex frameworks, no heavy dependencies. Just straightforward, reliable web technologies that ensure your notes remain accessible and under your control.

---

## Technology Overview

### Backend

#### PHP 8.x
- **Role:** Server-side scripting language
- **Why PHP:** 
  - Mature, stable, and well-documented
  - Excellent file handling capabilities
  - Easy to deploy and maintain
  - Low resource footprint
  - Wide hosting support

#### SQLite 3
- **Role:** Lightweight, file-based relational database
- **Why SQLite:**
  - Zero configuration
  - Single file database
  - ACID compliant
  - Perfect for embedded applications
  - Easy backups (just copy the file)
  - No separate database server needed

---

### Frontend

#### HTML5
- **Role:** Markup and structure
- **Features Used:**
  - Semantic elements
  - Forms and input validation
  - Local storage API
  - File API for attachments

#### CSS3
- **Role:** Styling and responsive design
- **Features:**
  - Flexbox and Grid layouts
  - CSS variables for theming
  - Media queries for responsiveness
  - Custom properties for dark mode
  - Animations and transitions

#### JavaScript (Vanilla)
- **Role:** Interactive features and dynamic content
- **Why Vanilla JS:**
  - No framework bloat
  - Direct DOM manipulation
  - Faster load times
  - Easier to maintain
  - No build process required (except for Excalidraw component)
- **Features:**
  - Dynamic note loading
  - Real-time search
  - Drag and drop
  - AJAX for API calls

#### React + Vite (Excalidraw Component Only)
- **Role:** Excalidraw drawing component
- **Implementation:**
  - Bundled as IIFE (Immediately Invoked Function Expression)
  - Pre-built and included in the project
  - No React dependency in main codebase
  - Isolated from the rest of the application

#### AJAX (XMLHttpRequest / Fetch API)
- **Role:** Asynchronous data loading
- **Usage:**
  - Loading notes without page refresh
  - API calls for CRUD operations
  - Real-time updates
  - File uploads

---

### Storage Architecture

Poznote uses a **hybrid storage approach** combining filesystem and database:

#### HTML/Markdown Files
- **Location:** `/data/entries/`
- **Purpose:** Note content storage
- **Format:** Plain HTML or Markdown files
- **Benefits:**
  - Human-readable
  - Easy to backup
  - Portable across systems
  - Can be edited with any text editor
  - Version control friendly

**File Structure:**
```
data/entries/
├── 1.html       # Note ID 1
├── 2.html       # Note ID 2
├── 3.md         # Note ID 3 (Markdown)
└── ...
```

#### SQLite Database
- **Location:** `/data/database/poznote.db`
- **Purpose:** Metadata and relationships
- **Stores:**
  - Note metadata (titles, dates, locations)
  - Tags and tag associations
  - Folder structures
  - Workspace information
  - User settings
  - Sharing links
  - Favorites

**Key Tables:**
- `entries` - Note metadata
- `tags` - Tag definitions
- `entry_tags` - Note-tag relationships
- `workspaces` - Workspace definitions
- `folders` - Folder structures
- `shares` - Public sharing information

#### File Attachments
- **Location:** `/data/attachments/`
- **Organization:** By note ID
- **Format:** Original files preserved

**Attachment Structure:**
```
data/attachments/
├── note_123/
│   ├── document.pdf
│   ├── image.png
│   └── spreadsheet.xlsx
├── note_124/
│   └── photo.jpg
└── ...
```

---

### Infrastructure

#### Nginx + PHP-FPM
- **Nginx:** High-performance web server
  - Efficient static file serving
  - Reverse proxy capabilities
  - Low memory footprint
  - Event-driven architecture

- **PHP-FPM:** FastCGI Process Manager
  - Better performance than mod_php
  - Process management
  - Adaptive process spawning
  - Separate pool configuration

**Configuration:**
- Static files served directly by Nginx
- PHP files processed by PHP-FPM
- Efficient handling of concurrent requests

#### Alpine Linux
- **Role:** Docker base image
- **Why Alpine:**
  - Minimal size (~5 MB base image)
  - Security-focused
  - Fast boot times
  - Package manager (apk)
  - Perfect for containers

**Final Image Size:**
- Poznote Docker image: ~100-150 MB
- Includes: Nginx, PHP, SQLite, all dependencies

#### Docker
- **Role:** Containerization for easy deployment
- **Benefits:**
  - Consistent environments
  - Easy installation
  - Portable across platforms
  - Isolated from host system
  - Simple updates
  - Version control of entire stack

**Container Architecture:**
```
Poznote Container
├── Nginx (Port 80)
├── PHP-FPM (Unix socket)
├── SQLite
└── File System
    └── /var/www/html/
        ├── src/          (PHP application)
        └── data/         (User data - mounted volume)
```

---

## Design Decisions

### Why No JavaScript Framework?

**Rationale:**
- Reduced complexity
- Faster load times
- Easier maintenance
- No build step (except Excalidraw)
- Lower learning curve for contributors
- Smaller codebase

**When We Use React:**
Only for Excalidraw component:
- Complex drawing functionality
- Well-maintained third-party library
- Pre-bundled, no runtime dependency

### Why SQLite?

**Instead of MySQL/PostgreSQL:**
- No separate database server
- Single file = easy backups
- Perfect for single-user/small team use
- Zero configuration
- Excellent performance for this use case
- Built-in full-text search

**Limitations:**
- Not ideal for high-concurrency
- Single writer at a time
- Not recommended for 100+ simultaneous users

For Poznote's use case (personal/small team note-taking), SQLite is the perfect choice.

### Why File-Based Note Storage?

**Instead of storing in database:**
- **Portability:** Notes are plain files
- **Accessibility:** Can be opened without Poznote
- **Backups:** Easy to backup with standard tools
- **Version Control:** Can use Git if desired
- **Recovery:** Easy to recover individual notes
- **Offline Access:** Files can be read directly

**Hybrid Approach Benefits:**
- Database for fast searches and relationships
- Files for content and portability
- Best of both worlds

---

## Performance Characteristics

### Resource Usage

**Typical Running Instance:**
- RAM: 50-100 MB
- CPU: Minimal (spikes during operations)
- Disk I/O: Low (SQLite + file writes)

**Optimizations:**
- Lazy loading of notes
- Cached database queries
- Efficient file handling
- Minimal JavaScript
- Optimized CSS

### Scalability

**Tested With:**
- 10,000+ notes
- 1000+ tags
- Large attachments (100+ MB files)
- Multiple workspaces

**Performance Remains Excellent:**
- Fast searches (SQLite FTS5)
- Quick note loading
- Responsive UI

---

## Security Features

### Authentication
- Basic HTTP authentication
- Bcrypt password hashing (if using database auth)
- Session management

### Data Protection
- SQL injection prevention (prepared statements)
- XSS protection (output escaping)
- CSRF protection for forms
- File upload validation
- Restricted file access

### Privacy
- All data stored locally
- No external calls (except updates check)
- No analytics or tracking
- No data sharing
- Open source (audit-able)

---

## Dependencies

### PHP Extensions Required
- `pdo_sqlite` - SQLite database access
- `sqlite3` - SQLite support
- `mbstring` - Multi-byte string handling
- `json` - JSON encoding/decoding
- `fileinfo` - File type detection

### JavaScript Libraries
- **None** in main application
- Excalidraw bundled separately

### CSS Frameworks
- **None** - Custom CSS only
- Font Awesome (for icons)

---

## Development Tools

### Build Process

**Main Application:**
- No build process needed
- Direct PHP execution
- Plain CSS and JavaScript

**Excalidraw Component:**
- Vite for bundling
- React compilation
- Output: Single IIFE bundle
- Location: `excalidraw-build/`

**Build Excalidraw:**
```bash
cd excalidraw-build
npm install
npm run build
```

### Docker Build

**Multi-stage build:**
1. Build Excalidraw (Node.js stage)
2. Copy to final image
3. Setup Nginx + PHP-FPM (Alpine stage)
4. Copy application code
5. Configure services

---

## Future Considerations

### Potential Enhancements

**Being Evaluated:**
- PostgreSQL support (for larger deployments)
- Full-text search improvements
- Real-time collaboration
- Mobile apps (native or PWA)
- Plugin system
- Themes

**Maintaining Philosophy:**
Any additions will prioritize:
- Simplicity
- Portability
- Low resource usage
- Easy deployment

---

## For Developers

### Contributing

**Tech You Should Know:**
- PHP 8+ syntax
- SQLite queries
- Vanilla JavaScript
- CSS3 (Flexbox/Grid)
- Docker basics

**No Need to Learn:**
- Complex frameworks
- Build tools (except for Excalidraw changes)
- TypeScript
- Webpack/Rollup/etc.

### Project Structure

```
poznote/
├── src/                    # PHP application
│   ├── api_*.php          # API endpoints
│   ├── *.php              # Page handlers
│   ├── css/               # Stylesheets
│   ├── js/                # JavaScript
│   └── data/              # User data (runtime)
├── excalidraw-build/      # Excalidraw component
│   ├── src/               # React source
│   ├── package.json       # Node dependencies
│   └── vite.config.js     # Build config
├── Dockerfile             # Container definition
└── docker-compose.yml     # Orchestration
```

### Coding Standards

**PHP:**
- PSR-12 style guide
- Clear function names
- Comments for complex logic
- Prepared statements for queries

**JavaScript:**
- ES6+ features
- Consistent naming
- Modular functions
- Comments for clarity

**CSS:**
- BEM-like naming
- Mobile-first responsive
- CSS variables for theming
- Logical organization

---

## Related Guides

- [Installation Guide](Installation-Guide)
- [API Documentation](API-Documentation)
- [Configuration](Configuration)
