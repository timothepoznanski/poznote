#!/usr/bin/env node
/**
 * Poznote API JavaScript/Node.js Example
 * 
 * This script demonstrates how to interact with the Poznote API using Node.js.
 * Install required package: npm install node-fetch
 */

// For Node.js < 18, uncomment the following line:
// const fetch = require('node-fetch');

class PoznoteAPI {
    /**
     * Initialize API client
     * @param {string} baseUrl - Base URL of your Poznote installation
     * @param {string} apiKey - API key for authentication (recommended)
     * @param {Object} basicAuth - Basic auth credentials {username, password}
     */
    constructor(baseUrl, apiKey = null, basicAuth = null) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.apiUrl = `${this.baseUrl}/src`;
        this.headers = {
            'Content-Type': 'application/json'
        };
        
        if (apiKey) {
            this.headers['X-API-Key'] = apiKey;
        } else if (basicAuth) {
            const encoded = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64');
            this.headers['Authorization'] = `Basic ${encoded}`;
        }
    }
    
    /**
     * Make an API request
     */
    async request(endpoint, method = 'GET', data = null, params = null) {
        let url = `${this.apiUrl}/${endpoint}`;
        
        if (params) {
            const queryString = new URLSearchParams(params).toString();
            url += `?${queryString}`;
        }
        
        const options = {
            method,
            headers: this.headers
        };
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            return { success: false, message: error.message };
        }
    }
    
    /**
     * List notes with optional filters
     */
    async listNotes({ workspace, folder, tag, favorite, search } = {}) {
        const params = {};
        if (workspace) params.workspace = workspace;
        if (folder) params.folder = folder;
        if (tag) params.tag = tag;
        if (favorite !== undefined) params.favorite = favorite ? '1' : '0';
        if (search) params.search = search;
        
        return await this.request('api_list_notes.php', 'GET', null, params);
    }
    
    /**
     * Create a new note
     */
    async createNote({
        heading,
        contentHtml = '',
        contentText = '',
        tags = '',
        folder = 'Default',
        workspace = 'Poznote',
        type = 'note',
        location = ''
    }) {
        const data = {
            heading,
            entry: contentHtml || contentText,
            entrycontent: contentText || contentHtml,
            tags,
            folder_name: folder,
            workspace,
            type,
            location
        };
        
        return await this.request('api_create_note.php', 'POST', data);
    }
    
    /**
     * Update an existing note
     */
    async updateNote(noteId, updates = {}) {
        const data = { id: noteId };
        
        if (updates.heading) data.heading = updates.heading;
        if (updates.contentHtml) data.entry = updates.contentHtml;
        if (updates.contentText) data.entrycontent = updates.contentText;
        if (updates.tags) data.tags = updates.tags;
        if (updates.folder) data.folder = updates.folder;
        if (updates.workspace) data.workspace = updates.workspace;
        
        return await this.request('api_update_note.php', 'POST', data);
    }
    
    /**
     * Delete a note (move to trash)
     */
    async deleteNote(noteId) {
        return await this.request('api_delete_note.php', 'POST', { id: noteId });
    }
    
    /**
     * Duplicate a note
     */
    async duplicateNote(noteId) {
        return await this.request('api_duplicate_note.php', 'POST', { id: noteId });
    }
    
    /**
     * Toggle favorite status
     */
    async toggleFavorite(noteId, isFavorite) {
        return await this.request('api_favorites.php', 'POST', {
            id: noteId,
            favorite: isFavorite ? 1 : 0
        });
    }
    
    /**
     * List all workspaces
     */
    async listWorkspaces() {
        return await this.request('api_workspaces.php', 'GET');
    }
    
    /**
     * Create a new workspace
     */
    async createWorkspace(name) {
        return await this.request('api_workspaces.php', 'POST', {
            action: 'create',
            name
        });
    }
    
    /**
     * List all tags
     */
    async listTags(workspace = null) {
        const params = workspace ? { workspace } : {};
        return await this.request('api_list_tags.php', 'GET', null, params);
    }
    
    /**
     * List all folders
     */
    async listFolders(workspace = null) {
        const params = { get_folders: '1' };
        if (workspace) params.workspace = workspace;
        return await this.request('api_list_notes.php', 'GET', null, params);
    }
}

/**
 * Example usage
 */
async function main() {
    // Initialize API client
    const api = new PoznoteAPI(
        'http://localhost',
        'your-api-key-here'
        // Or use basic auth:
        // null,
        // { username: 'your-username', password: 'your-password' }
    );
    
    console.log('=== Poznote API Examples ===\n');
    
    // Example 1: List all notes
    console.log('1. Listing all notes...');
    const notes = await api.listNotes();
    if (notes.success) {
        console.log(`   Found ${notes.notes?.length || 0} notes`);
        notes.notes?.slice(0, 3).forEach(note => {
            console.log(`   - ${note.heading} (ID: ${note.id})`);
        });
    }
    console.log();
    
    // Example 2: Create a new note
    console.log('2. Creating a new note...');
    const newNote = await api.createNote({
        heading: 'API Test Note',
        contentText: `This note was created via the API at ${new Date().toISOString()}`,
        tags: 'api,test,javascript',
        folder: 'Default',
        workspace: 'Poznote'
    });
    let noteId;
    if (newNote.success) {
        noteId = newNote.id;
        console.log(`   Created note with ID: ${noteId}`);
    }
    console.log();
    
    // Example 3: Update the note
    console.log('3. Updating the note...');
    const updateResult = await api.updateNote(noteId, {
        heading: 'Updated API Test Note',
        contentText: 'This note was updated via the API'
    });
    console.log(`   Update success: ${updateResult.success}`);
    console.log();
    
    // Example 4: Add to favorites
    console.log('4. Adding note to favorites...');
    const favResult = await api.toggleFavorite(noteId, true);
    console.log(`   Favorite success: ${favResult.success}`);
    console.log();
    
    // Example 5: Duplicate the note
    console.log('5. Duplicating the note...');
    const dupResult = await api.duplicateNote(noteId);
    if (dupResult.success) {
        console.log(`   Duplicated note ID: ${dupResult.new_id}`);
    }
    console.log();
    
    // Example 6: List workspaces
    console.log('6. Listing workspaces...');
    const workspaces = await api.listWorkspaces();
    if (workspaces.success) {
        workspaces.workspaces?.forEach(ws => {
            console.log(`   - ${ws.name}`);
        });
    }
    console.log();
    
    // Example 7: List tags
    console.log('7. Listing tags...');
    const tags = await api.listTags();
    if (tags.success) {
        tags.tags?.slice(0, 5).forEach(tag => {
            console.log(`   - ${tag.tag} (${tag.count} notes)`);
        });
    }
    console.log();
    
    // Example 8: Search notes
    console.log('8. Searching for notes containing "API"...');
    const searchResults = await api.listNotes({ search: 'API' });
    if (searchResults.success) {
        console.log(`   Found ${searchResults.notes?.length || 0} notes`);
    }
    console.log();
    
    // Example 9: Filter by tag
    console.log('9. Filtering notes by tag "test"...');
    const taggedNotes = await api.listNotes({ tag: 'test' });
    if (taggedNotes.success) {
        console.log(`   Found ${taggedNotes.notes?.length || 0} notes with tag "test"`);
    }
    console.log();
    
    // Example 10: Delete the note
    console.log('10. Deleting the note...');
    const deleteResult = await api.deleteNote(noteId);
    console.log(`    Delete success: ${deleteResult.success}`);
    console.log();
    
    console.log('=== Examples Complete ===');
}

// Run examples
if (require.main === module) {
    main().catch(console.error);
}

module.exports = PoznoteAPI;
