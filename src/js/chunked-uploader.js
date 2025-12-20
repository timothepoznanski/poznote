/**
 * Chunked Upload Manager for Poznote
 * Handles large file uploads by splitting them into smaller chunks
 */

class ChunkedUploader {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 5 * 1024 * 1024; // 5MB chunks
        this.maxRetries = options.maxRetries || 3;
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || (() => {});
    }

    async uploadFile(file, endpoint = '/api_chunked_restore.php') {
        if (!file) {
            const msg = (window.t ? window.t('restore_import.chunked.errors.no_file_provided', null, 'No file provided') : 'No file provided');
            throw new Error(msg);
        }

        this.file = file;
        this.endpoint = endpoint;
        this.fileId = this.generateFileId();
        this.totalChunks = Math.ceil(file.size / this.chunkSize);

        console.log(`Starting chunked upload: ${file.name} (${file.size} bytes, ${this.totalChunks} chunks)`);

        try {
            // Upload all chunks
            for (let i = 0; i < this.totalChunks; i++) {
                await this.uploadChunk(i);
                this.onProgress((i + 1) / this.totalChunks * 100);
            }

            // Assemble chunks on server
            await this.assembleChunks();

            this.onComplete();
        } catch (error) {
            this.onError(error);
            throw error;
        }
    }

    async uploadChunk(chunkIndex) {
        const start = chunkIndex * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const chunk = this.file.slice(start, end);

        const formData = new FormData();
        formData.append('action', 'upload_chunk');
        formData.append('file_id', this.fileId);
        formData.append('chunk_index', chunkIndex);
        formData.append('total_chunks', this.totalChunks);
        formData.append('file_name', this.file.name);
        formData.append('chunk_size', this.chunkSize);
        formData.append('chunk', chunk);

        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(this.endpoint, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();

                if (!result.success) {
                    const fallback = (window.t ? window.t('restore_import.chunked.errors.upload_failed', null, 'Upload failed') : 'Upload failed');
                    throw new Error(result.error || fallback);
                }

                return result;
            } catch (error) {
                lastError = error;
                console.warn(`Chunk ${chunkIndex} attempt ${attempt} failed:`, error);

                if (attempt < this.maxRetries) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }

        throw new Error(`Failed to upload chunk ${chunkIndex} after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    async assembleChunks() {
        const formData = new FormData();
        formData.append('action', 'assemble_chunks');
        formData.append('file_id', this.fileId);

        const response = await fetch(this.endpoint, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
            const fallback = (window.t ? window.t('restore_import.chunked.errors.assembly_failed', null, 'Assembly failed') : 'Assembly failed');
            throw new Error(result.error || fallback);
        }

        return result;
    }

    async cleanup() {
        if (!this.fileId) return;

        try {
            const formData = new FormData();
            formData.append('action', 'cleanup_chunks');
            formData.append('file_id', this.fileId);

            await fetch(this.endpoint, {
                method: 'POST',
                body: formData
            });
        } catch (error) {
            console.warn((window.t ? window.t('restore_import.chunked.errors.cleanup_failed_prefix', null, 'Cleanup failed:') : 'Cleanup failed:'), error);
        }
    }

    generateFileId() {
        return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = [
        (window.t ? window.t('restore_import.units.bytes', null, 'Bytes') : 'Bytes'),
        (window.t ? window.t('restore_import.units.kb', null, 'KB') : 'KB'),
        (window.t ? window.t('restore_import.units.mb', null, 'MB') : 'MB'),
        (window.t ? window.t('restore_import.units.gb', null, 'GB') : 'GB')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChunkedUploader;
}