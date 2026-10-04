/**
 * Image context menu inside a note.
 * 
 * Mouse handling on images in note content, and the menu it opens: view larger,
 * download, and the entries that delegate to the image actions module. The menu
 * opens on right click (a tap on touch screens); a left click on an image that
 * carries a link opens that link in a new tab.
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
        // Capture phase, ahead of the attachment, table and insert menus that
        // also listen on the document
        document.addEventListener('click', handleImageClick, true);
        document.addEventListener('contextmenu', handleImageContextMenu, true);

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
    // A standalone diagram carries the id of its note; one embedded in a
    // note does not, and gets its own Edit entry further down. The id opened
    // is that of the note the diagram is shown in, not the one frozen in the
    // markup: an imported or duplicated note still carries the id of the
    // note it came from, and Edit would open that one, and save into it.
    let excalidrawNoteId = img.getAttribute('data-excalidraw-note-id');
    if (excalidrawNoteId) {
        const hostEntry = img.closest('.noteentry[data-note-id]');
        if (hostEntry && !hostEntry.hasAttribute('data-linked-note-id')) {
            excalidrawNoteId = hostEntry.getAttribute('data-note-id');
        }
    }

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

    // Link options for HTML images only: in a Markdown note they would change the
    // rendered preview and never the source, so the link would be lost on save.
    // A link written in the Markdown source still opens on left click.
    const canEditLink = !isMarkdownNote;
    const existingLink = img.closest('a');

    if (canEditLink && !existingLink) {
        // If no existing link, show direct "Add Link" button
        menuHTML += `
            <div class="image-menu-item" data-action="add-link">
                <i class="lucide lucide-link"></i>
                ${t('image_menu.add_link', null, 'Ajouter un lien')}
            </div>
        `;
    } else if (canEditLink) {
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
 * The image under an event target that the menu applies to, or null.
 * @param {EventTarget} target
 * @returns {HTMLImageElement|null}
 */
function getMenuImageFromTarget(target) {
    const img = target && target.closest ? target.closest('img') : null;
    if (!img || !img.src || img.src.trim() === '') return null;
    // Attachment cards have their own menu (js/note-attachment-menu.js)
    if (img.closest('.note-attachment-previews')) return null;
    return img;
}

/**
 * Touch screens have no right click, so a tap opens the menu there.
 */
function isTouchOnlyPointer() {
    return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

/**
 * Open an image's link in a new tab. Only web and mail links are followed.
 * @param {string} href
 */
function openImageLink(href) {
    let url;
    try {
        url = new URL(href, window.location.href);
    } catch (e) {
        return;
    }
    if (!/^(https?|mailto):$/.test(url.protocol)) return;
    window.open(url.href, '_blank', 'noopener');
}

/**
 * Left click on an image: follow its link in a new tab. Without a link the
 * click goes on like any other click, except on touch screens where it opens
 * the menu.
 */
function handleImageClick(event) {
    if (event.button !== 0) return;

    const img = getMenuImageFromTarget(event.target);
    if (!img) return;

    const link = img.closest('a[href]');
    if (link) {
        // Keeps the editor's link handling (and the browser) from acting on it too
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openImageLink(link.href);
        return;
    }

    if (isTouchOnlyPointer()) {
        showImageMenu(event, img);
    }
}

/**
 * Right click on an image: open the image menu instead of the browser's.
 */
function handleImageContextMenu(event) {
    const img = getMenuImageFromTarget(event.target);
    if (!img) return;

    showImageMenu(event, img);
}

/**
 * Show the image menu at the pointer
 * @param {MouseEvent} event - The click or contextmenu event
 * @param {HTMLImageElement} img - The image element
 */
function showImageMenu(event, img) {
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

    // Keep the browser menu away from the image menu itself
    menu.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // Close on any press outside the menu (a right click elsewhere included) or Escape
    function closeMenu(e) {
        if (e.type === 'keydown' && e.key !== 'Escape') return;
        const submenu = menu._associatedSubmenu;
        if (e.type === 'mousedown' && (menu.contains(e.target) || (submenu && submenu.contains(e.target)))) return;
        removeImageMenu(menu);
        document.removeEventListener('mousedown', closeMenu, true);
        document.removeEventListener('keydown', closeMenu, true);
    }
    document.addEventListener('mousedown', closeMenu, true);
    document.addEventListener('keydown', closeMenu, true);
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
