/**
 * Image context menu inside a note.
 * 
 * Click handling on images in note content, and the menu it opens: view larger,
 * download, and the entries that delegate to the image actions module.
 */

/**
 * Re-initialize image click handlers for note content
 */
function reinitializeImageClickHandlers() {
    // Remove any leftover resize handles that might have been saved in HTML
    const leftoverHandles = document.querySelectorAll('.image-resize-handle');
    leftoverHandles.forEach(handle => handle.remove());

    // Find all images in the note content
    const allImages = document.querySelectorAll('img');

    // Use event delegation on document level (only set once)
    if (!imageClickHandlerInitialized) {
        document.addEventListener('click', function (event) {
            // Check if the click target or any parent is an image
            const img = event.target.tagName === 'IMG' ? event.target : event.target.closest('img');

            if (img && img.tagName === 'IMG') {
                handleImageClick(event);
            }
        }, true); // Use capture phase

        imageClickHandlerInitialized = true;
    }

    // Ensure all images are clickable
    allImages.forEach((img) => {
        img.style.cursor = 'pointer';

        // Remove existing tooltip event listeners to avoid duplicates
        const oldListeners = img._tooltipListeners;
        if (oldListeners) {
            img.removeEventListener('mouseenter', oldListeners.mouseenter);
            img.removeEventListener('mousemove', oldListeners.mousemove);
            img.removeEventListener('mouseleave', oldListeners.mouseleave);
        }

        // Add hover tooltip for images with links (not on public pages)
        if (!window.isPublicNotePage) {
            let currentToast;

            const mouseenterHandler = function (e) {
                // Check if link still exists at the time of hover
                const parentLink = img.closest('a[data-image-link]');
                if (parentLink && parentLink.href) {
                    currentToast = showImageLinkToast(parentLink.href, e.clientX, e.clientY);
                }
            };

            const mousemoveHandler = function (e) {
                // Update toast position as mouse moves
                if (currentToast) {
                    updateImageLinkToastPosition(currentToast, e.clientX, e.clientY);
                }
            };

            const mouseleaveHandler = function () {
                if (currentToast) {
                    hideImageLinkToast(currentToast);
                    currentToast = null;
                }
            };

            img.addEventListener('mouseenter', mouseenterHandler);
            img.addEventListener('mousemove', mousemoveHandler);
            img.addEventListener('mouseleave', mouseleaveHandler);

            // Store listeners for cleanup
            img._tooltipListeners = {
                mouseenter: mouseenterHandler,
                mousemove: mousemoveHandler,
                mouseleave: mouseleaveHandler
            };
        }
    });
}

/**
 * Safely remove the image menu and any associated submenu from the DOM.
 * @param {HTMLElement} menu - The main menu element
 */
function removeImageMenu(menu) {
    if (!menu) return;
    // Remove any associated submenu
    var submenu = menu._associatedSubmenu;
    if (submenu && document.body.contains(submenu)) {
        document.body.removeChild(submenu);
    }
    if (document.body.contains(menu)) {
        document.body.removeChild(menu);
    }
}

/**
 * Build the HTML for the image context menu based on image properties.
 * @param {HTMLImageElement} img - The image element
 * @returns {string} The menu innerHTML
 */
function buildImageMenuHTML(img) {
    // Check if this is an Excalidraw image
    const isExcalidraw = img.getAttribute('data-is-excalidraw') === 'true';
    const excalidrawNoteId = img.getAttribute('data-excalidraw-note-id');

    // Also check if this image is inside an Excalidraw container
    const excalidrawContainer = img.closest('.excalidraw-container');
    const isEmbeddedExcalidraw = excalidrawContainer !== null;
    const diagramId = excalidrawContainer ? excalidrawContainer.id : null;

    // Check if this is a markdown note (to exclude certain options for markdown)
    const isMarkdownNote = img.closest('.markdown-preview') !== null ||
        img.closest('.markdown-editor') !== null ||
        img.closest('.note-entry[data-note-format="markdown"]') !== null;
    const isSourceBackedMarkdownPreviewImage = isSourceBackedMarkdownImage(img);

    // Helper function for translations
    const t = window.t || ((key, params, fallback) => fallback);

    let menuHTML = `
        <div class="image-menu-item" data-action="view-large">
            <i class="lucide-maximize-2"></i>
            ${t('image_menu.view_large', null, 'Open')}
        </div>
        <div class="image-menu-item" data-action="download">
            <i class="lucide lucide-download"></i>
            ${t('image_menu.download', null, 'Download')}
        </div>
    `;

    // Markdown preview images are supported when backed by source syntax.
    const canResizeImage = !isMarkdownNote || isSourceBackedMarkdownPreviewImage;
    if (canResizeImage) {
        menuHTML += `
        <div class="image-menu-item" data-action="resize">
            <i class="lucide-maximize"></i>
            ${t('image_menu.resize', null, 'Resize')}
        </div>
    `;
    }

    // Add Edit option for Excalidraw images (standalone notes)
    if (isExcalidraw && excalidrawNoteId) {
        menuHTML = `
            <div class="image-menu-item" data-action="edit-excalidraw" data-note-id="${excalidrawNoteId}">
                <i class="lucide lucide-pencil"></i>
                ${t('image_menu.edit', null, 'Edit')}
            </div>
        ` + menuHTML;
    }

    // Add Edit option for embedded Excalidraw diagrams
    if (isEmbeddedExcalidraw && diagramId) {
        menuHTML = `
            <div class="image-menu-item" data-action="edit-embedded-excalidraw" data-diagram-id="${diagramId}">
                <i class="lucide lucide-pencil"></i>
                ${t('image_menu.edit', null, 'Edit')}
            </div>
        ` + menuHTML;
    }

    // Add link option for all images
    const existingLink = img.closest('a');

    // If no existing link, show direct "Add Link" button
    if (!existingLink) {
        menuHTML += `
            <div class="image-menu-item" data-action="add-link">
                <i class="lucide lucide-link"></i>
                ${t('image_menu.add_link', null, 'Ajouter un lien')}
            </div>
        `;
    } else {
        // If link exists, create submenu with multiple options
        let linkSubmenuHTML = '';

        // Add "Open link" option first
        linkSubmenuHTML += `
            <div class="image-menu-item image-submenu-item" data-action="open-link" data-url="${existingLink.href}">
                ${t('image_menu.open_link', null, 'Open Link')}
            </div>
        `;

        // Add edit link option
        linkSubmenuHTML += `
            <div class="image-menu-item image-submenu-item" data-action="add-link">
                ${t('image_menu.edit_link', null, 'Modifier le lien')}
            </div>
        `;

        // Add remove link option
        linkSubmenuHTML += `
            <div class="image-menu-item image-submenu-item" data-action="remove-link">
                ${t('image_menu.remove_link', null, 'Retirer le lien')}
            </div>
        `;

        // Add link submenu parent
        menuHTML += `
            <div class="image-menu-item image-menu-parent" data-action="link-submenu" data-submenu-html="${encodeURIComponent(linkSubmenuHTML)}">
                <i class="lucide lucide-link"></i>
                ${t('image_menu.links', null, 'Liens')}
                <i class="lucide lucide-chevron-right" style="margin-left: auto; font-size: 10px;"></i>
            </div>
        `;
    }

    // Add border toggles for HTML images and rendered Markdown images backed by source syntax.
    const canToggleBorder = !isMarkdownNote || isSourceBackedMarkdownPreviewImage;
    if (canToggleBorder) {
        const hasBorder = img.classList.contains('img-with-border');
        const hasBorderNoPadding = img.classList.contains('img-with-border-no-padding');
        menuHTML += `
            <div class="image-menu-item" data-action="toggle-border">
                <i class="lucide lucide-square"></i>
                ${hasBorder ? t('image_menu.remove_border', null, 'Remove Border') : t('image_menu.add_border', null, 'Add Border')}
            </div>
            <div class="image-menu-item" data-action="toggle-border-no-padding">
                <i class="lucide lucide-square"></i>
                ${hasBorderNoPadding ? t('image_menu.remove_border_no_padding', null, 'Remove Border without padding') : t('image_menu.add_border_no_padding', null, 'Add Border without padding')}
            </div>
        `;
    }

    // Add Delete option at the end for HTML images and rendered Markdown images backed by source syntax.
    const canDeleteImage = !isMarkdownNote || isSourceBackedMarkdownPreviewImage;
    if (canDeleteImage) {
        menuHTML += `
            <div class="image-menu-item" data-action="delete-image" style="color: #dc3545;">
                <i class="lucide lucide-trash-2"></i>
                ${t('image_menu.delete_image', null, 'Delete Image')}
            </div>
        `;
    }

    return menuHTML;
}

/**
 * Create and attach the link submenu for the image menu.
 * Handles hover behavior and click delegation for submenu actions.
 * @param {HTMLElement} menu - The main menu element
 * @param {HTMLImageElement} img - The image element
 */
function createImageSubmenu(menu, img) {
    const linkParent = menu.querySelector('.image-menu-parent[data-action="link-submenu"]');
    if (!linkParent) return;

    // Get submenu HTML from data attribute
    const linkSubmenuHTML = decodeURIComponent(linkParent.getAttribute('data-submenu-html'));

    // Create submenu element
    const submenu = document.createElement('div');
    submenu.className = 'image-submenu';
    submenu.style.display = 'none';
    submenu.innerHTML = linkSubmenuHTML;
    document.body.appendChild(submenu);

    // Store reference for cleanup
    menu._associatedSubmenu = submenu;

    linkParent.addEventListener('mouseenter', function () {
        submenu.style.display = 'block';

        // Position submenu like slash menu does
        const parentRect = linkParent.getBoundingClientRect();
        const submenuRect = submenu.getBoundingClientRect();

        const padding = 8;
        let x = parentRect.right + 4;
        let y = parentRect.top;

        // If overflows right, show on left
        if (x + submenuRect.width > window.innerWidth - padding) {
            x = parentRect.left - submenuRect.width - 4;
        }

        // If overflows bottom
        if (y + submenuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, window.innerHeight - submenuRect.height - padding);
        }

        submenu.style.position = 'fixed';
        submenu.style.left = Math.max(padding, x) + 'px';
        submenu.style.top = Math.max(padding, y) + 'px';

        const chevron = linkParent.querySelector('.lucide-chevron-right');
        if (chevron) {
            chevron.style.transform = 'rotate(90deg)';
        }
    });

    linkParent.addEventListener('mouseleave', function (e) {
        // Don't hide if moving to submenu
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || (!submenu.contains(relatedTarget) && relatedTarget !== submenu)) {
            setTimeout(() => {
                if (!submenu.matches(':hover')) {
                    submenu.style.display = 'none';
                    const chevron = linkParent.querySelector('.lucide-chevron-right');
                    if (chevron) {
                        chevron.style.transform = '';
                    }
                }
            }, 100);
        }
    });

    submenu.addEventListener('mouseleave', function (e) {
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || (!linkParent.contains(relatedTarget) && relatedTarget !== linkParent)) {
            submenu.style.display = 'none';
            const chevron = linkParent.querySelector('.lucide-chevron-right');
            if (chevron) {
                chevron.style.transform = '';
            }
        }
    });

    // Add click handlers to submenu items
    submenu.addEventListener('click', function (e) {
        const action = e.target.closest('.image-menu-item')?.getAttribute('data-action');
        handleImageMenuAction(action, img, e);
        removeImageMenu(menu);
    });
}

/**
 * Adjust the image menu position to stay within the viewport.
 * Must be called after the menu is appended to the DOM.
 * @param {HTMLElement} menu - The menu element (already in DOM)
 * @param {number} clickX - clientX of the original click
 * @param {number} clickY - clientY of the original click
 */
function adjustImageMenuPosition(menu, clickX, clickY) {
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    const cursorOffset = 12;

    let left = clickX - (menuRect.width / 2);
    let top = clickY - menuRect.height - cursorOffset;

    if (top < padding) {
        top = clickY + cursorOffset;
    }

    if (top + menuRect.height > viewportHeight - padding) {
        top = Math.max(padding, viewportHeight - menuRect.height - padding);
    }

    left = Math.max(padding, Math.min(left, viewportWidth - menuRect.width - padding));

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.transform = 'none';
}

/**
 * Handle an action from the image context menu.
 * @param {string} action - The action identifier
 * @param {HTMLImageElement} img - The image element
 * @param {Event} e - The click event
 */
function handleImageMenuAction(action, img, e) {
    if (!action) return;

    if (action === 'view-large') {
        viewImageLarge(img.src);
    } else if (action === 'download') {
        downloadImage(img.src);
    } else if (action === 'edit-excalidraw') {
        const noteId = e.target.closest('.image-menu-item')?.getAttribute('data-note-id');
        if (noteId) {
            openExcalidrawNote(noteId);
        }
    } else if (action === 'edit-embedded-excalidraw') {
        const diagramId = e.target.closest('.image-menu-item')?.getAttribute('data-diagram-id');
        if (diagramId && window.openExcalidrawEditor) {
            openExcalidrawEditor(diagramId);
        }
    } else if (action === 'resize') {
        enableImageResize(img);
    } else if (action === 'toggle-border') {
        toggleImageBorder(img);
    } else if (action === 'toggle-border-no-padding') {
        toggleImageBorderNoPadding(img);
    } else if (action === 'delete-image') {
        deleteImage(img);
    } else if (action === 'open-link') {
        const url = e.target.closest('.image-menu-item')?.getAttribute('data-url');
        if (url) {
            window.open(url, '_blank');
        }
    } else if (action === 'add-link') {
        // Stop event propagation to prevent triggering link modal on parent <a> tags
        e.stopPropagation();
        e.preventDefault();
        addOrEditImageLink(img);
    } else if (action === 'remove-link') {
        removeImageLink(img);
    }
}

/**
 * Handle image click to show popup with options
 */
function handleImageClick(event) {
    const img = event.target;

    // Check if image has a valid src
    if (!img.src || img.src.trim() === '') {
        return;
    }

    if (img.closest('.note-attachment-previews')) {
        return;
    }

    // On public pages, if image is in a link, let the link work
    if (window.isPublicNotePage && img.closest('a')) {
        return;
    }

    // Always show the custom menu on left-click, even if image is in a link
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Remove any existing image menu
    const existingMenu = document.querySelector('.image-menu');
    if (existingMenu) {
        removeImageMenu(existingMenu);
    }

    // Create menu element with built HTML
    const menu = document.createElement('div');
    menu.className = 'image-menu';
    menu.innerHTML = buildImageMenuHTML(img);

    // Position the menu at click coordinates
    const clickX = event.clientX;
    const clickY = event.clientY;

    menu.style.position = 'fixed';
    menu.style.left = clickX + 'px';
    menu.style.top = clickY + 'px';
    menu.style.transform = 'translate(-50%, -120%)'; // Center horizontally, position above cursor with more space
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // Create and attach submenu for link options (if applicable)
    createImageSubmenu(menu, img);

    // Adjust position if menu goes off-screen
    adjustImageMenuPosition(menu, clickX, clickY);

    // Handle menu item clicks
    menu.addEventListener('click', function (e) {
        const action = e.target.closest('.image-menu-item')?.getAttribute('data-action');

        // Ignore click on link-submenu parent (handled by hover)
        if (action === 'link-submenu') {
            e.stopPropagation();
            return;
        }

        handleImageMenuAction(action, img, e);
        removeImageMenu(menu);

        // Prevent event bubbling to avoid triggering the global click handler
        e.stopPropagation();
    });

    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== img) {
                removeImageMenu(menu);
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

/**
 * View image in large modal
 */
function viewImageLarge(imageSrc) {
    if (imageSrc.startsWith('data:image/')) {
        // Handle base64 data URLs by creating a blob
        const mimeType = imageSrc.split(';')[0].split(':')[1];
        const base64Data = imageSrc.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        // Open the blob URL in new tab
        window.open(blobUrl, '_blank');

        // Clean up the blob URL after a delay to let the new tab load
        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
        }, 60000);
    } else {
        // For regular URLs, open directly
        window.open(imageSrc, '_blank');
    }
}

/**
 * Download image
 */
function downloadImage(imageSrc) {
    // Determine filename based on image source
    let filename = 'image.png'; // Default
    if (imageSrc.includes('data:image/')) {
        // For base64 images, try to determine the format
        const mimeType = imageSrc.split(';')[0].split(':')[1];
        if (mimeType === 'image/jpeg') filename = 'image.jpg';
        else if (mimeType === 'image/png') filename = 'image.png';
        else if (mimeType === 'image/gif') filename = 'image.gif';
        else if (mimeType === 'image/webp') filename = 'image.webp';
    } else {
        // For regular URLs, extract filename from URL
        try {
            const url = new URL(imageSrc);
            const pathname = url.pathname;
            filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'image.png';
        } catch (e) {
            filename = 'image.png';
        }
    }

    // Create download link
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
