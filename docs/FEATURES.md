# Poznote Features

This document provides a detailed overview of the core features of Poznote.

## Table of Contents
1. [Templates](#1-templates)
2. [Linked Notes (Shortcuts)](#2-linked-notes-shortcuts)
3. [HTML ↔ Markdown Conversion](#3-html--markdown-conversion)
4. [Graphical Editor (Excalidraw)](#4-graphical-editor-excalidraw)
5. [Kanban View](#5-kanban-view)
6. [Notification System](#6-notification-system)
7. [Public Sharing](#7-public-sharing)
8. [Task Lists](#8-task-lists)
9. [Audio Player](#9-audio-player)
10. [Unified Search (Notes & Tags)](#10-unified-search-notes--tags)
11. [Customization & Interface](#11-customization--interface)

---

## 1. Templates
Templates allow you to quickly create new notes based on existing structures.

- **Creating a template**: In the creation menu (+), select "Template". You can then pick an existing note to transform it into a template. It will be copied into a special folder named "Templates".
- **Usage**: To create a note from a template, go to the "Templates" folder and duplicate the desired note.
- **Organization**: Templates are standard notes stored in the "Templates" folder, making them easy to edit and maintain.

## 2. Linked Notes (Shortcuts)
Linked notes allow you to display the same note in multiple folders without duplicating it.

- **How it works**: A shortcut is just a pointer to the original note. Any changes made to the original are immediately visible via the shortcut.
- **Creation**: Use the "Shortcut" option in the creation menu to link an existing note to your current folder.

## 3. HTML ↔ Markdown Conversion
Poznote natively supports both HTML (Rich Text) and Markdown formats.

- **Markdown Editing**: You can change a note's type to "Markdown" to use a plain text editor with syntax highlighting.
- **Rendering**: The rendering engine converts Markdown to HTML in real-time, including support for:
    - **Mermaid** diagrams.
    - **LaTeX** mathematical formulas (via `$` for inline and `3408045` for blocks).
- **Export/Import**: You can download any note in Markdown format, even if it was originally written in HTML.

## 4. Graphical Editor (Excalidraw)
Poznote integrates **Excalidraw** for creating diagrams and free-hand drawings.

- **Integration**: Create dedicated "Excalidraw" notes or embed drawings directly within your HTML notes.
- **Visual Editing**: The editor allows smooth manipulation of shapes, text, and images with automatic JSON-based saving.

## 5. Kanban View
Transform any folder into an agile dashboard.

- **How it works**: Within a folder, subfolders become columns (e.g., To Do, In Progress, Done).
- **Interaction**: Drag and drop notes between columns to update their status.

## 6. Notification System
An integrated notification system keeps you updated on your actions without interrupting your workflow.

- **Success Notifications**: Confirmations after saving, deleting, or successful imports.
- **Error Notifications**: Alerts for network issues or synchronization conflicts.
- **Interactivity**: Some notifications allow you to undo an action or reload the page if needed.

## 7. Public Sharing
Poznote allows you to share your notes with the world via secure public URLs.

- **Sharing Options**:
    - **Read-only**: Visitors can view the note but cannot modify it.
    - **Task Mode (Check-only)** : Ideal for shared grocery or task lists. Visitors can check/uncheck boxes but cannot edit task text.
    - **Access complet**: Allows total collaboration on the note.
- **Security**: Share links are randomly generated and can be revoked at any time.

## 8. Task Lists
The "Task List" is a specialized note type designed for productivity.

- **Dedicated Interface**: Unlike text notes, it features a quick-add field at the top.
- **Task Management**:
    - **Reordering**: Drag and drop tasks to change their order.
    - **Importance**: Mark tasks as "Priority" (star/flame icon).
    - **Cleanup**: An option allows you to delete all completed tasks with one click to keep your list clean.

## 9. Audio Player
Poznote features a minimalist integrated audio player.

- **Compatibility**: Supports `.mp3`, `.wav`, `.ogg`, `.m4a` formats.
- **Usage**: Simply upload an audio file as an attachment to a note to play it directly from the interface.

## 10. Unified Search (Notes & Tags)
The unified search system helps you find your information instantly.

- **Search Modes**:
    - **Notes**: Search within titles and note content.
    - **Tags**: Search among the labels you have assigned to your notes.
- **Fast Navigation**: 
    - In search mode, use the **Enter** key to jump to the next result in the sidebar list.
    - Real-time search: results refine with every character typed.

## 11. Customization & Interface
Adapt Poznote to your visual and functional needs.

- **Interface Customization**: Hide unnecessary elements (toolbar buttons, specific note types) via settings.
- **Custom Styles**: Support for custom CSS, workspace background images, and synchronized dark/light modes.
