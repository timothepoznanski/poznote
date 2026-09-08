/**
 * Image actions inside a note.
 * 
 * What the image menu does to the note: deleting (including the underlying attachment),
 * toggling borders, resizing by drag, and attaching or removing a link. Markdown-backed
 * images are edited through their source, so those paths defer to the js/markdown-*.js
 * modules.
 */

/**
 * Delete an image (works for both Excalidraw and regular images)
 */
function deleteImage(img) {
    if (!img) return;

    // Show confirmation modal
    if (typeof window.modalAlert !== 'undefined' && typeof window.modalAlert.confirm === 'function') {
        window.modalAlert.confirm(
            (window.t ? window.t('editor.images.delete_confirm.message', {}, 'Are you sure you want to delete this image? This action cannot be undone.') : 'Are you sure you want to delete this image? This action cannot be undone.'),
            (window.t ? window.t('editor.images.delete_confirm.title', {}, 'Delete Image') : 'Delete Image')
        ).then(function (confirmed) {
            if (confirmed) {
                performImageDeletion(img);
            }
        });
    } else {
        // Fallback to native confirm if modal not available
        if (confirm(window.t ? window.t('editor.images.delete_confirm.message', {}, 'Are you sure you want to delete this image? This action cannot be undone.') : 'Are you sure you want to delete this image? This action cannot be undone.')) {
            performImageDeletion(img);
        }
    }
}

/**
 * Perform the actual image deletion
 */
function performImageDeletion(img) {
    if (!img) return;

    try {
        // Mark image as manually deleted to avoid double deletion from observer
        img._manuallyDeleted = true;

        if (isSourceBackedMarkdownImage(img)) {
            const markdownNoteEntry = img.closest('.noteentry');
            const markdownNoteIdMatch = markdownNoteEntry?.id.match(/entry(\d+)/);
            const markdownNoteId = markdownNoteIdMatch ? markdownNoteIdMatch[1] : null;

            if (deleteSourceBackedMarkdownImage(img)) {
                deleteImageAttachmentIfOwnedByNote(img, markdownNoteId);
            }
            return;
        }

        deleteImageAttachmentIfOwnedByNote(img);

        // Find the container (could be excalidraw-container or just the img itself)
        const container = img.closest('.excalidraw-container');
        const elementToRemove = container || img;

        // Remove the element from DOM
        elementToRemove.remove();

        // Clean up any following empty elements or line breaks
        const nextElement = elementToRemove.nextElementSibling;
        if (nextElement && (nextElement.tagName === 'BR' ||
            (nextElement.tagName === 'DIV' && nextElement.innerHTML.trim() === '') ||
            nextElement.innerHTML === '&nbsp;')) {
            nextElement.remove();
        }

        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }

        if (typeof window.saveNoteImmediately === 'function') {
            window.saveNoteImmediately(); // Save to server
        } else if (typeof window.saveNoteToServer === 'function') {
            window.saveNoteToServer();
        }

    } catch (error) {
        console.warn('Error deleting image:', error);
    }
}

function deleteImageAttachmentIfOwnedByNote(img, expectedNoteId) {
    const src = img ? img.getAttribute('src') : '';
    if (!src) return;

    const attachmentMatch = src.match(/\/api\/v1\/notes\/(\d+)\/attachments\/([a-fA-F0-9_-]+)/);
    if (!attachmentMatch) return;

    const noteId = attachmentMatch[1];
    const attachmentId = attachmentMatch[2];
    const noteEntry = img.closest('.noteentry');
    const noteIdMatch = noteEntry?.id.match(/entry(\d+)/);
    const activeNoteId = expectedNoteId || (noteIdMatch ? noteIdMatch[1] : null);

    if (!activeNoteId || noteId !== activeNoteId) return;

    if (typeof window.deleteAttachment === 'function') {
        const oldNoteId = window.currentNoteIdForAttachments;
        window.currentNoteIdForAttachments = noteId;
        window.deleteAttachment(attachmentId);
        window.currentNoteIdForAttachments = oldNoteId;
        return;
    }

    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('note_id', noteId);
    formData.append('attachment_id', attachmentId);
    if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
        formData.append('workspace', window.selectedWorkspace);
    }
    fetch('/api/v1/notes/' + noteId + '/attachments', { method: 'POST', body: formData });
}

function isSourceBackedMarkdownImage(img) {
    return !!(img && img.closest('.markdown-preview') && (
        img.hasAttribute('data-markdown-image-index') ||
        !!img.closest('.excalidraw-container[data-markdown-excalidraw-index]')
    ));
}

function toggleSourceBackedMarkdownImageBorder(img, borderClass) {
    if (!isSourceBackedMarkdownImage(img)) {
        return false;
    }

    if (img.closest('.excalidraw-container[data-markdown-excalidraw-index]')) {
        if (typeof window.toggleMarkdownExcalidrawImageBorder === 'function') {
            return window.toggleMarkdownExcalidrawImageBorder(img, borderClass);
        }

        console.warn('Markdown Excalidraw image border toggle is not available.');
        return false;
    }

    if (typeof window.toggleMarkdownImageBorder === 'function') {
        return window.toggleMarkdownImageBorder(img, borderClass);
    }

    console.warn('Markdown image border toggle is not available.');
    return false;
}

function resizeSourceBackedMarkdownImage(img, width) {
    if (!isSourceBackedMarkdownImage(img)) {
        return false;
    }

    if (img.closest('.excalidraw-container[data-markdown-excalidraw-index]')) {
        if (typeof window.resizeMarkdownExcalidrawImage === 'function') {
            return window.resizeMarkdownExcalidrawImage(img, width);
        }

        console.warn('Markdown Excalidraw image resize is not available.');
        return false;
    }

    if (typeof window.resizeMarkdownImage === 'function') {
        return window.resizeMarkdownImage(img, width);
    }

    console.warn('Markdown image resize is not available.');
    return false;
}

function deleteSourceBackedMarkdownImage(img) {
    if (!isSourceBackedMarkdownImage(img)) {
        return false;
    }

    if (img.closest('.excalidraw-container[data-markdown-excalidraw-index]')) {
        if (typeof window.deleteMarkdownExcalidrawImage === 'function') {
            return window.deleteMarkdownExcalidrawImage(img);
        }

        console.warn('Markdown Excalidraw image delete is not available.');
        return false;
    }

    if (typeof window.deleteMarkdownImage === 'function') {
        return window.deleteMarkdownImage(img);
    }

    console.warn('Markdown image delete is not available.');
    return false;
}

/**
 * Toggle a 1px gray border around an image
 */
function toggleImageBorder(img) {
    if (!img) return;

    try {
        if (toggleSourceBackedMarkdownImageBorder(img, 'img-with-border')) {
            return;
        }

        // Check if image currently has the border class
        const hasBorderClass = img.classList.contains('img-with-border');

        if (hasBorderClass) {
            // Remove border class
            img.classList.remove('img-with-border');
        } else {
            // Remove the no-padding border class if present
            img.classList.remove('img-with-border-no-padding');
            // Add border class (with padding, rounded corners, and #ddd border)
            img.classList.add('img-with-border');
        }

        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }

        if (typeof window.saveNoteImmediately === 'function') {
            window.saveNoteImmediately(); // Save to server
        } else if (typeof window.saveNoteToServer === 'function') {
            window.saveNoteToServer();
        }

    } catch (error) {
        console.warn('Error toggling image border:', error);
    }
}

/**
 * Toggle a 1px gray border around an image without padding
 */
function toggleImageBorderNoPadding(img) {
    if (!img) return;

    try {
        if (toggleSourceBackedMarkdownImageBorder(img, 'img-with-border-no-padding')) {
            return;
        }

        // Check if image currently has the no-padding border class
        const hasBorderClass = img.classList.contains('img-with-border-no-padding');

        if (hasBorderClass) {
            // Remove border class
            img.classList.remove('img-with-border-no-padding');
        } else {
            // Remove the padded border class if present
            img.classList.remove('img-with-border');
            // Add border class without padding
            img.classList.add('img-with-border-no-padding');
        }

        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }

        // Trigger automatic save after a short delay
        setTimeout(function () {
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately(); // Save to server
            }
        }, 100);

    } catch (error) {
        console.warn('Error toggling image border without padding:', error);
    }
}

/**
 * Add or edit a link on an image
 */
function addOrEditImageLink(img) {
    if (!img) return;

    try {
        // Check if the image is already wrapped in a link
        const existingLink = img.closest('a');
        const currentUrl = existingLink ? existingLink.href : '';

        // Show modal instead of prompt
        showImageLinkModal(currentUrl, function (url) {
            // If user cancelled or provided empty string
            if (url === null || url === undefined) return;

            // If empty string, remove link if it exists
            if (url.trim() === '') {
                if (existingLink) {
                    removeImageLink(img);
                }
                return;
            }

            // Validate and sanitize URL
            let finalUrl = url.trim();
            if (!finalUrl.match(/^https?:\/\//i)) {
                // Add https:// if no protocol specified
                finalUrl = 'https://' + finalUrl;
            }

            if (existingLink) {
                // Update existing link
                existingLink.href = finalUrl;
                existingLink.setAttribute('target', '_blank');
                existingLink.setAttribute('rel', 'noopener noreferrer');
            } else {
                // Create new link wrapper
                const link = document.createElement('a');
                link.href = finalUrl;
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                link.setAttribute('data-image-link', 'true'); // Mark this as an image link

                // Wrap the image in the link
                img.parentNode.insertBefore(link, img);
                link.appendChild(img);
            }

            // Mark note as modified and save
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }

            setTimeout(function () {
                if (typeof window.saveNoteImmediately === 'function') {
                    window.saveNoteImmediately();
                }
            }, 100);
        }, existingLink ? 'edit' : 'add');

    } catch (error) {
        console.warn('Error adding/editing image link:', error);
    }
}

/**
 * Show modal for adding/editing image link
 */
function showImageLinkModal(defaultUrl, callback, mode) {
    const t = window.t || ((key, params, fallback) => fallback);
    const isEdit = mode === 'edit';

    // Create modal if it doesn't exist
    let modal = document.getElementById('imageLinkModal');
    if (!modal) {
        const modalHtml = `
            <div id="imageLinkModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="imageLinkModalTitle">${t('image_menu.link_modal.title_add', null, 'Add Link to Image')}</h3>
                    </div>
                    <div class="modal-body">
                        <p style="margin: 0 0 12px 0; color: #666; font-size: 13px; line-height: 1.5;">
                            ${t('image_menu.link_modal.description', null, 'Ce lien rendra l\'image clickable lorsque la note sera définie comme publique.')}
                        </p>
                        <input type="text" id="imageLinkModalInput" placeholder="${t('image_menu.link_modal.url_placeholder', null, 'https://www.example.com')}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                    </div>
                    <div class="modal-buttons">
                        <button type="button" class="btn-cancel" onclick="closeImageLinkModal()">${t('image_menu.link_modal.cancel', null, 'Cancel')}</button>
                        <button type="button" id="imageLinkModalConfirmBtn" class="btn-primary">${t('image_menu.link_modal.ok', null, 'OK')}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('imageLinkModal');

        // Add event listeners
        const input = document.getElementById('imageLinkModalInput');
        const confirmBtn = document.getElementById('imageLinkModalConfirmBtn');

        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                confirmImageLinkModal();
            }
        });

        confirmBtn.addEventListener('click', confirmImageLinkModal);
    }

    // Update modal content
    const titleEl = document.getElementById('imageLinkModalTitle');
    const inputEl = document.getElementById('imageLinkModalInput');

    titleEl.textContent = isEdit
        ? t('image_menu.link_modal.title_edit', null, 'Edit Image Link')
        : t('image_menu.link_modal.title_add', null, 'Add Link to Image');

    inputEl.value = defaultUrl || '';

    // Store callback
    window.imageLinkModalCallback = callback;

    // Show modal
    modal.style.display = 'flex';

    // Focus input
    setTimeout(() => inputEl.focus(), 100);
}

/**
 * Close image link modal
 */
function closeImageLinkModal() {
    const modal = document.getElementById('imageLinkModal');
    if (modal) {
        modal.style.display = 'none';
    }
    window.imageLinkModalCallback = null;
}

/**
 * Confirm image link modal
 */
function confirmImageLinkModal() {
    const inputValue = document.getElementById('imageLinkModalInput').value;
    const callback = window.imageLinkModalCallback;

    closeImageLinkModal();

    if (callback) {
        callback(inputValue);
    }
}

/**
 * Remove link from an image
 */
function removeImageLink(img) {
    if (!img) return;

    try {
        const link = img.closest('a');
        if (link) {
            // Replace the link with just the image
            link.parentNode.insertBefore(img, link);
            link.remove();

            // Mark note as modified and save
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }

            setTimeout(function () {
                if (typeof window.saveNoteImmediately === 'function') {
                    window.saveNoteImmediately();
                }
            }, 100);

            // Reinitialize image click handlers to remove old event listeners
            setTimeout(function () {
                reinitializeImageClickHandlers();
            }, 150);
        }
    } catch (error) {
        console.warn('Error removing image link:', error);
    }
}

/**
 * Enable resize mode for an image with a handle in the bottom-right corner
 */
function enableImageResize(img) {
    if (!img) return;

    // Remove any existing resize handles first
    const existingHandles = document.querySelectorAll('.image-resize-handle');
    existingHandles.forEach(handle => {
        if (typeof handle._cleanupImageResize === 'function') {
            handle._cleanupImageResize();
        }
        handle.remove();
    });
    window.isImageResizeInProgress = false;

    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'image-resize-handle';
    resizeHandle.innerHTML = '⤡';

    // Position the image as relative so the handle can be positioned absolutely
    const originalPosition = img.style.position;
    img.style.position = 'relative';
    img.style.display = 'inline-block';

    // Set a flag to prevent the MutationObserver in main.js from thinking this is a deletion
    // during the wrapping process (which involves moving the image in the DOM)
    img._isResizing = true;

    // Create a wrapper if the image doesn't have one OR if parent doesn't have the resize wrapper class
    let wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('image-resize-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'image-resize-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.maxWidth = '100%';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
    } else {
        // Ensure wrapper has proper positioning even if it already exists
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
    }

    // Reset the flag after a short delay to ensure the MutationObserver has processed the move
    setTimeout(function () {
        delete img._isResizing;
    }, 100);

    // Add the handle to the wrapper
    wrapper.appendChild(resizeHandle);

    // Trigger modification indicator immediately
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let activeTouchId = null;
    const minResizeWidth = 50;

    function setImageResizeInProgress(isActive) {
        window.isImageResizeInProgress = isActive;
    }

    function cleanupImageResizeListeners() {
        document.removeEventListener('mousemove', handleImageResizeMove);
        document.removeEventListener('touchmove', handleImageResizeMove);
        document.removeEventListener('mouseup', finishImageResize);
        document.removeEventListener('touchend', finishImageResize);
        document.removeEventListener('touchcancel', finishImageResize);
    }

    resizeHandle._cleanupImageResize = function () {
        setImageResizeInProgress(false);
        cleanupImageResizeListeners();
    };

    function findActiveTouch(touchList) {
        if (!touchList || touchList.length === 0) {
            return null;
        }

        if (activeTouchId === null) {
            return touchList[0];
        }

        for (let i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === activeTouchId) {
                return touchList[i];
            }
        }

        return null;
    }

    function getResizeClientX(e) {
        const activeTouch = findActiveTouch(e.touches) || findActiveTouch(e.changedTouches);
        if (activeTouch) {
            return activeTouch.clientX;
        }

        return typeof e.clientX === 'number' ? e.clientX : null;
    }

    function eventIncludesActiveTouch(e) {
        if (activeTouchId === null || !e.changedTouches || e.changedTouches.length === 0) {
            return true;
        }

        return !!findActiveTouch(e.changedTouches);
    }

    function applyResizeWidth(clientX) {
        const deltaX = clientX - startX;
        const newWidth = Math.max(minResizeWidth, startWidth + deltaX);

        img.style.width = newWidth + 'px';
        img.style.height = 'auto';
        img.setAttribute('width', Math.round(newWidth));

        // Update wrapper size
        wrapper.style.width = newWidth + 'px';
    }

    function startImageResize(e) {
        if (e.type === 'mousedown' && e.button !== 0) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const clientX = getResizeClientX(e);
        if (clientX === null) {
            return;
        }

        isResizing = true;
        activeTouchId = e.touches && e.touches.length ? e.touches[0].identifier : null;
        startX = clientX;
        startWidth = img.offsetWidth;
        setImageResizeInProgress(true);

        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';

        // Mark as modified on actual resize start too
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }

    function handleImageResizeMove(e) {
        if (!isResizing) return;

        e.preventDefault();
        e.stopPropagation();

        const clientX = getResizeClientX(e);
        if (clientX === null) {
            return;
        }

        applyResizeWidth(clientX);
    }

    function finishImageResize(e) {
        if (!isResizing) return;
        if (e && !eventIncludesActiveTouch(e)) return;

        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        isResizing = false;
        activeTouchId = null;
        resizeHandle._cleanupImageResize();
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Save the final width
        const finalWidth = Math.round(img.offsetWidth);
        img.setAttribute('width', finalWidth);
        img.style.width = finalWidth + 'px';
        img.removeAttribute('height'); // Let browser calculate height from aspect ratio

        // Clean up: remove the handle
        if (resizeHandle && resizeHandle.parentNode) {
            resizeHandle.remove();
        }

        // Clean up: remove the wrapper but preserve the image with its new size
        const currentWrapper = img.parentElement;
        if (currentWrapper && currentWrapper.classList.contains('image-resize-wrapper')) {
            const parent = currentWrapper.parentNode;
            if (parent) {
                parent.insertBefore(img, currentWrapper);
                parent.removeChild(currentWrapper);
            }
        }

        // Revert style changes made ONLY for positioning the handle
        img.style.position = (originalPosition === 'static' ? '' : originalPosition);
        if (img.style.display === 'inline-block' && !img.getAttribute('style').includes('display: inline-block')) {
            // Only revert display if we added it and it's not in the inline style attribute already
            // Actually, keeping inline-block is usually safer for resized images.
        }

        if (resizeSourceBackedMarkdownImage(img, finalWidth)) {
            return;
        }

        // Trigger note save and modification indicator
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }

        if (typeof window.saveNoteImmediately === 'function') {
            window.saveNoteImmediately();
        } else if (typeof window.saveNoteToServer === 'function') {
            window.saveNoteToServer();
        }
    }

    resizeHandle.addEventListener('mousedown', startImageResize);
    resizeHandle.addEventListener('touchstart', startImageResize, { passive: false });
    document.addEventListener('mousemove', handleImageResizeMove);
    document.addEventListener('touchmove', handleImageResizeMove, { passive: false });
    document.addEventListener('mouseup', finishImageResize);
    document.addEventListener('touchend', finishImageResize, { passive: false });
    document.addEventListener('touchcancel', finishImageResize, { passive: false });

    // Click outside to remove handle
    setTimeout(() => {
        document.addEventListener('click', function closeResize(e) {
            if (!wrapper.contains(e.target) && e.target !== resizeHandle) {
                resizeHandle.remove();
                resizeHandle._cleanupImageResize();
                document.removeEventListener('click', closeResize);
            }
        });
    }, 10);
}

/**
 * Show toast with image link URL
 */
function showImageLinkToast(url, mouseX, mouseY) {
    // Remove any existing toast first to avoid duplication
    const existingToast = document.querySelector('.image-link-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'image-link-toast';
    toast.style.position = 'fixed';
    toast.style.background = '#2d3748';
    toast.style.color = '#e2e8f0';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '6px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.fontSize = '12px';
    toast.style.maxWidth = '400px';
    toast.style.wordBreak = 'break-all';
    toast.style.border = '1px solid rgba(255,255,255,0.1)';
    toast.style.zIndex = '10000';
    toast.style.pointerEvents = 'none';
    toast.style.whiteSpace = 'nowrap';
    toast.style.overflow = 'hidden';
    toast.style.textOverflow = 'ellipsis';

    // Position near mouse cursor (offset slightly to not block the image)
    toast.style.left = (mouseX + 15) + 'px';
    toast.style.top = (mouseY + 15) + 'px';

    // Add URL (no icon)
    toast.innerHTML = `<span>${url}</span>`;

    document.body.appendChild(toast);

    return toast;
}

/**
 * Update toast position
 */
function updateImageLinkToastPosition(toast, mouseX, mouseY) {
    if (!toast) return;
    toast.style.left = (mouseX + 15) + 'px';
    toast.style.top = (mouseY + 15) + 'px';
}

/**
 * Hide image link toast
 */
function hideImageLinkToast(toast) {
    if (!toast) return;

    if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
    }
}

// Initialize image click handlers when this script loads
(function initImageHandlers() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reinitializeImageClickHandlers);
    } else {
        reinitializeImageClickHandlers();
    }
})();

window.invalidateNoteDomCache = invalidateNoteDomCache;
