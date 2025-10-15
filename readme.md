# Poznote

[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Open%20Source-green)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-purple?logo=php)](https://www.php.net/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-blue?logo=sqlite)](https://www.sqlite.org/)

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Try Poznote](#try-poznote)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Backup and Restore](#backup-and-restore)
- [Offline View](#offline-view)
- [API Documentation](#api-documentation)

## Introduction

Poznote is a lightweight, free, self-hosted note-taking web app that gives you full control over your data — with zero vendor lock-in. Notes are stored as plain HTML files, keeping them accessible even without the app. Despite its minimal resource usage, Poznote delivers powerful features like a rich text editor, tagging, workspaces, file attachments, REST API, full-text search, responsive design, and note sharing. It’s built for those who value efficiency above all — fast, simple, and always under your control.

![poznote](readme/poznote.png)

![poznote-mobile](readme/poznote-mobile.png)

## Features

- 📝 Rich Text Editor
- 🔍 Powerful Search
- 🏷️ Tag system
- 📎 File Attachments
- 📱 Responsive design
- 🖥️ Multi-instance support
- 🗂️ Workspaces
- 🏠 Self-hosted
- 💾 Built-in backup and export tools
- 🗑️ Trash system with restore functionality
- 🔗 Public note sharing
- 🌐 REST API for automation

## Try Poznote

A Poznote demo is available on [poznote-demo.up.railway.app](https://poznote-demo.up.railway.app)

Username: `poznote`
<br>
Password: `poznote`

## Tech Stack

Poznote prioritizes simplicity and portability - no complex frameworks, no heavy dependencies. Just straightforward, reliable web technologies that ensure your notes remain accessible and under your control.

<details>
<summary>If you are interested in the tech stack on which Poznote is built, <strong>have a look here.</strong></summary>

### Backend
- **PHP 8.x** - Server-side scripting language
- **SQLite 3** - Lightweight, file-based relational database

### Frontend
- **HTML5** - Markup and structure
- **CSS3** - Styling and responsive design
- **JavaScript (Vanilla)** - Interactive features and dynamic content
- **AJAX** - Asynchronous data loading

### Storage
- **HTML files** - Notes are stored as plain HTML files in the filesystem
- **SQLite database** - Metadata, tags, relationships, and user data
- **File attachments** - Stored directly in the filesystem

### Infrastructure
- **Apache HTTP Server** - Web server
- **Docker** - Containerization for easy deployment and portability
</details>

## Installation

Choose your deployment method:

- 🖥️ Deploy Poznote on your own machine or server **👉 [View Self-Hosted Guide](SELF_HOSTED.md)**

- ☁️ Deploy Poznote on cloud platforms **👉 [View Cloud Deployment Guide](CLOUD.md)**

## Backup and Restore

Poznote includes built-in backup (export) and restoration (import) functionality accessible through Settings.

**Complete Backup**

Single ZIP containing database, all notes, and attachments for all workspaces:

  - Includes an `index.html` at the root for offline browsing
  - Notes are organized by workspace and folder
  - Attachments are accessible via clickable links

**Complete Restore** 

Upload the complete backup ZIP to restore everything:

  - Replaces database, restores all notes, and attachments
  - Works for all workspaces at once

⚠️ Database import completely replaces current data. The database contains metadata (titles, tags, dates) while actual note content is stored in HTML files. 

## Offline View

The **📦 Complete Backup** creates a standalone offline version of your notes. Simply extract the ZIP and open `index.html` in any web browser.

## API Documentation

Poznote provides a REST API for programmatic access to notes, folders, workspaces, tags, and attachments.

Access the **Swagger UI documentation** directly from Poznote in `Settings > API Documentation`.
