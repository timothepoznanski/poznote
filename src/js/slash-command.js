// Slash Command Menu for Poznote
// Shows a command menu when user types "/" in an HTML note

(function () {
    'use strict';

    // Helper functions to replace deprecated execCommand
    function insertHeading(level) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === 3 ? container.parentElement : container;
        const tag = 'h' + level;

        // Check if already in a heading
        const existingHeading = element.closest('h1, h2, h3, h4, h5, h6');
        if (existingHeading) {
            // Already a heading, change the level
            if (existingHeading.tagName.toLowerCase() !== tag) {
                const newHeading = document.createElement(tag);
                newHeading.innerHTML = existingHeading.innerHTML;
                existingHeading.replaceWith(newHeading);
                // Place cursor at end
                range.selectNodeContents(newHeading);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            return;
        }

        // Create new heading
        const heading = document.createElement(tag);
        
        // If we have selected content, wrap it
        if (!range.collapsed) {
            heading.appendChild(range.extractContents());
        } else {
            heading.appendChild(document.createElement('br'));
        }

        range.insertNode(heading);
        
        // Place cursor inside heading
        const newRange = document.createRange();
        newRange.selectNodeContents(heading);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    function insertList(ordered) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === 3 ? container.parentElement : container;

        // Check if already in a list
        const existingList = element.closest('ul, ol');
        if (existingList) {
            // Toggle list type or unwrap if same type
            const listTag = ordered ? 'ol' : 'ul';
            if (existingList.tagName.toLowerCase() === listTag) {
                // Same type, unwrap the list
                const items = Array.from(existingList.querySelectorAll('li'));
                items.forEach(li => {
                    const p = document.createElement('p');
                    p.innerHTML = li.innerHTML;
                    existingList.parentNode.insertBefore(p, existingList);
                });
                existingList.remove();
            } else {
                // Different type, convert
                const newList = document.createElement(listTag);
                newList.innerHTML = existingList.innerHTML;
                existingList.replaceWith(newList);
            }
            return;
        }

        // Create new list
        const list = document.createElement(ordered ? 'ol' : 'ul');
        const li = document.createElement('li');
        
        // If we have selected content, wrap it
        if (!range.collapsed) {
            li.appendChild(range.extractContents());
        } else {
            li.appendChild(document.createElement('br'));
        }

        list.appendChild(li);
        range.insertNode(list);
        
        // Place cursor inside li
        const newRange = document.createRange();
        newRange.selectNodeContents(li);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    // Slash command menu items - actions match toolbar exactly
    // Order matches toolbar
    const SLASH_COMMANDS = [
        {
            id: 'title',
            icon: 'fa-text-height',
            label: 'Title',
            submenu: [
                { id: 'h1', label: 'Heading 1', action: () => insertHeading(1) },
                { id: 'h2', label: 'Heading 2', action: () => insertHeading(2) },
                { id: 'h3', label: 'Heading 3', action: () => insertHeading(3) },
                { id: 'h4', label: 'Heading 4', action: () => insertHeading(4) },
                { id: 'h5', label: 'Heading 5', action: () => insertHeading(5) },
                { id: 'h6', label: 'Heading 6', action: () => insertHeading(6) }
            ]
        },
        {
            id: 'bullet-list',
            icon: 'fa-list-ul',
            label: 'Bullet list',
            action: function () {
                insertList(false);
            }
        },
        {
            id: 'numbered-list',
            icon: 'fa-list-ol',
            label: 'Numbered list',
            action: function () {
                insertList(true);
            }
        },
        {
            id: 'excalidraw',
            icon: 'fal fa-paint-brush',
            label: 'Excalidraw',
            action: function () {
                if (typeof window.insertExcalidrawDiagram === 'function') {
                    window.insertExcalidrawDiagram();
                }
            },
            mobileHidden: true
        },
        {
            id: 'emoji',
            icon: 'fa-smile',
            label: 'Emoji',
            action: function () {
                if (typeof window.toggleEmojiPicker === 'function') {
                    window.toggleEmojiPicker();
                }
            }
        },
        {
            id: 'table',
            icon: 'fa-table',
            label: 'Table',
            action: function () {
                if (typeof window.toggleTablePicker === 'function') {
                    window.toggleTablePicker();
                }
            }
        },
        {
            id: 'checklist',
            icon: 'fa-list-check',
            label: 'Checklist',
            action: function () {
                if (typeof window.insertChecklist === 'function') {
                    window.insertChecklist();
                }
            }
        },
        {
            id: 'separator',
            icon: 'fa-minus',
            label: 'Separator',
            action: function () {
                if (typeof window.insertSeparator === 'function') {
                    window.insertSeparator();
                }
            }
        },
        {
            id: 'note-reference',
            icon: 'fa-at',
            label: 'Link to note',
            action: function () {
                if (typeof window.openNoteReferenceModal === 'function') {
                    window.openNoteReferenceModal();
                }
            }
        }
    ];

    let slashMenuElement = null;
    let submenuElement = null;
    let selectedIndex = 0;
    let selectedSubmenuIndex = 0;
    let filteredCommands = [];
    let currentSubmenu = null;
    let slashTextNode = null;  // Le nœud texte contenant le slash
    let slashOffset = -1;      // La position du slash dans le nœud
    let filterText = '';
    let savedNoteEntry = null;

    function isInHtmlNote() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;

        const range = selection.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        const editableElement = container.closest && container.closest('[contenteditable="true"]');
        const noteEntry = container.closest && container.closest('.noteentry');

        if (!editableElement || !noteEntry) return false;

        const noteType = noteEntry.getAttribute('data-note-type');
        if (noteType === 'tasklist' || noteType === 'markdown') return false;

        return true;
    }

    function getFilteredCommands(searchText) {
        const isMobile = window.innerWidth < 800;
        const commands = SLASH_COMMANDS.filter(cmd => {
            if (isMobile && cmd.mobileHidden) return false;
            return true;
        });

        if (!searchText) return commands;

        const search = searchText.toLowerCase();
        return commands.filter(cmd => cmd.label.toLowerCase().includes(search));
    }

    function buildMenuHTML() {
        if (!filteredCommands.length) {
            return '<div class="slash-command-empty">No results</div>';
        }

        return filteredCommands
            .map((cmd, idx) => {
                const selectedClass = idx === selectedIndex ? ' selected' : '';
                const hasSubmenu = cmd.submenu && cmd.submenu.length > 0;
                const submenuIndicator = hasSubmenu ? '<i class="fa fa-chevron-right slash-command-submenu-indicator"></i>' : '';
                return (
                    '<div class="slash-command-item' + selectedClass + '" data-command-id="' + cmd.id + '" data-has-submenu="' + hasSubmenu + '">' +
                    '<i class="slash-command-icon ' + cmd.icon + '"></i>' +
                    '<span class="slash-command-label">' + escapeHtml(cmd.label) + '</span>' +
                    submenuIndicator +
                    '</div>'
                );
            })
            .join('');
    }

    function buildSubmenuHTML(items) {
        return items
            .map((item, idx) => {
                const selectedClass = idx === selectedSubmenuIndex ? ' selected' : '';
                return (
                    '<div class="slash-command-item' + selectedClass + '" data-submenu-id="' + item.id + '">' +
                    '<span class="slash-command-label">' + escapeHtml(item.label) + '</span>' +
                    '</div>'
                );
            })
            .join('');
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function positionMenu(range) {
        if (!slashMenuElement) return;

        const rect = range.getBoundingClientRect();
        const menuRect = slashMenuElement.getBoundingClientRect();

        const padding = 8;
        const x = Math.min(rect.left, window.innerWidth - menuRect.width - padding);
        const y = Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - padding);

        slashMenuElement.style.left = Math.max(padding, x) + 'px';
        slashMenuElement.style.top = Math.max(padding, y) + 'px';
    }

    function hideSubmenu() {
        if (!submenuElement) return;

        try {
            submenuElement.removeEventListener('mousedown', handleMenuMouseDown);
            submenuElement.removeEventListener('click', handleSubmenuClick);
        } catch (e) {}

        try {
            submenuElement.remove();
        } catch (e) {
            if (submenuElement.parentNode) submenuElement.parentNode.removeChild(submenuElement);
        }

        submenuElement = null;
        currentSubmenu = null;
        selectedSubmenuIndex = 0;
    }

    function hideSlashMenu() {
        if (!slashMenuElement) return;

        hideSubmenu();

        try {
            slashMenuElement.removeEventListener('mousedown', handleMenuMouseDown);
            slashMenuElement.removeEventListener('click', handleMenuClick);
            slashMenuElement.removeEventListener('mouseover', handleMenuMouseOver);
        } catch (e) {}

        try {
            slashMenuElement.remove();
        } catch (e) {
            if (slashMenuElement.parentNode) slashMenuElement.parentNode.removeChild(slashMenuElement);
        }

        slashMenuElement = null;
        selectedIndex = 0;
        filteredCommands = [];
        slashTextNode = null;
        slashOffset = -1;
        filterText = '';
    }

    function updateMenuContent() {
        if (!slashMenuElement) return;

        hideSubmenu();
        filteredCommands = getFilteredCommands(filterText);
        selectedIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));
        slashMenuElement.innerHTML = buildMenuHTML();
    }

    function showSubmenu(cmd, parentItem) {
        if (!cmd.submenu || !cmd.submenu.length) return;

        hideSubmenu();

        currentSubmenu = cmd.submenu;
        selectedSubmenuIndex = 0;

        submenuElement = document.createElement('div');
        submenuElement.className = 'slash-command-menu slash-command-submenu';
        submenuElement.innerHTML = buildSubmenuHTML(cmd.submenu);

        document.body.appendChild(submenuElement);

        // Position à droite de l'item parent
        const parentRect = parentItem.getBoundingClientRect();
        const submenuRect = submenuElement.getBoundingClientRect();

        const padding = 8;
        let x = parentRect.right + 4;
        let y = parentRect.top;

        // Si déborde à droite, afficher à gauche
        if (x + submenuRect.width > window.innerWidth - padding) {
            x = parentRect.left - submenuRect.width - 4;
        }

        // Si déborde en bas
        if (y + submenuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, window.innerHeight - submenuRect.height - padding);
        }

        submenuElement.style.left = Math.max(padding, x) + 'px';
        submenuElement.style.top = Math.max(padding, y) + 'px';

        requestAnimationFrame(() => {
            if (submenuElement) submenuElement.classList.add('show');
        });

        submenuElement.addEventListener('mousedown', handleMenuMouseDown);
        submenuElement.addEventListener('click', handleSubmenuClick);
    }

    function deleteSlashText() {
        try {
            if (!slashTextNode || slashOffset < 0) return;

            // Obtenir la position actuelle du curseur
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;

            const currentRange = sel.getRangeAt(0);
            const currentOffset = currentRange.startOffset;
            const currentNode = currentRange.startContainer;

            // Si on est toujours dans le même nœud texte
            if (currentNode === slashTextNode && currentNode.nodeType === 3) {
                // Supprimer depuis le slash jusqu'à la position actuelle
                const text = slashTextNode.textContent;
                const before = text.substring(0, slashOffset);
                const after = text.substring(currentOffset);
                slashTextNode.textContent = before + after;

                // Replacer le curseur
                const newRange = document.createRange();
                newRange.setStart(slashTextNode, before.length);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);

                if (savedNoteEntry) {
                    savedNoteEntry.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        } catch (e) {
            console.error('Error deleting slash text:', e);
        }
    }

    function executeCommand(commandId, isSubmenuItem) {
        let actionToExecute = null;

        if (isSubmenuItem && currentSubmenu) {
            const item = currentSubmenu.find(i => i.id === commandId);
            if (item && item.action) {
                actionToExecute = item.action;
            }
        } else {
            const cmd = SLASH_COMMANDS.find(c => c.id === commandId);
            if (!cmd) return;

            // Si la commande a un sous-menu, l'afficher au lieu d'exécuter
            if (cmd.submenu && cmd.submenu.length > 0) {
                const item = slashMenuElement.querySelector('[data-command-id="' + commandId + '"]');
                if (item) {
                    showSubmenu(cmd, item);
                }
                return;
            }

            if (cmd.action) {
                actionToExecute = cmd.action;
            }
        }

        if (!actionToExecute) return;

        // Supprimer le slash et le texte de filtre AVANT de cacher le menu
        deleteSlashText();
        
        hideSlashMenu();

        // Re-focus sur la note si nécessaire
        if (savedNoteEntry) {
            try { 
                savedNoteEntry.focus(); 
            } catch (e) {}
        }

        // Exécuter la commande
        try {
            actionToExecute();
        } catch (e) {
            console.error('Error executing command:', e);
        }

        savedNoteEntry = null;
    }

    function handleMenuMouseDown(e) {
        // Prevent editor losing focus before we run the command
        e.preventDefault();
    }

    function handleMenuClick(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        const commandId = item.getAttribute('data-command-id');
        if (commandId) executeCommand(commandId, false);
    }

    function handleSubmenuClick(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        const submenuId = item.getAttribute('data-submenu-id');
        if (submenuId) executeCommand(submenuId, true);
    }

    function handleMenuMouseOver(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        const hasSubmenu = item.getAttribute('data-has-submenu') === 'true';
        const commandId = item.getAttribute('data-command-id');
        
        if (hasSubmenu && commandId) {
            const cmd = filteredCommands.find(c => c.id === commandId);
            if (cmd) {
                showSubmenu(cmd, item);
            }
        } else {
            hideSubmenu();
        }
    }

    function handleKeydown(e) {
        if (!slashMenuElement) return;

        // Si un sous-menu est ouvert
        if (submenuElement && currentSubmenu) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        selectedSubmenuIndex = (selectedSubmenuIndex + 1) % currentSubmenu.length;
                        submenuElement.innerHTML = buildSubmenuHTML(currentSubmenu);
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        selectedSubmenuIndex = (selectedSubmenuIndex - 1 + currentSubmenu.length) % currentSubmenu.length;
                        submenuElement.innerHTML = buildSubmenuHTML(currentSubmenu);
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    hideSubmenu();
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        executeCommand(currentSubmenu[selectedSubmenuIndex].id, true);
                    }
                    break;

                case 'Escape':
                    e.preventDefault();
                    hideSubmenu();
                    break;

                default:
                    if (e.key.length === 1 || e.key === 'Delete' || e.key === 'Backspace') {
                        hideSubmenu();
                        if (e.key === 'Backspace') {
                            if (filterText.length === 0) {
                                hideSlashMenu();
                                savedNoteEntry = null;
                            } else {
                                setTimeout(updateFilterFromEditor, 0);
                            }
                        } else {
                            setTimeout(updateFilterFromEditor, 0);
                        }
                    }
                    break;
            }
            return;
        }

        // Navigation dans le menu principal
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (filteredCommands.length) {
                    selectedIndex = (selectedIndex + 1) % filteredCommands.length;
                    updateMenuContent();
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (filteredCommands.length) {
                    selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
                    updateMenuContent();
                }
                break;

            case 'ArrowRight':
                e.preventDefault();
                if (filteredCommands.length) {
                    const cmd = filteredCommands[selectedIndex];
                    if (cmd.submenu && cmd.submenu.length > 0) {
                        const item = slashMenuElement.querySelector('[data-command-id="' + cmd.id + '"]');
                        if (item) {
                            showSubmenu(cmd, item);
                        }
                    }
                }
                break;

            case 'Enter':
                e.preventDefault();
                if (filteredCommands.length) {
                    executeCommand(filteredCommands[selectedIndex].id, false);
                }
                break;

            case 'Escape':
                e.preventDefault();
                hideSlashMenu();
                savedNoteEntry = null;
                break;

            case 'Backspace':
                if (filterText.length === 0) {
                    hideSlashMenu();
                    savedNoteEntry = null;
                } else {
                    setTimeout(updateFilterFromEditor, 0);
                }
                break;

            case ' ':
                hideSlashMenu();
                savedNoteEntry = null;
                break;

            default:
                if (e.key.length === 1 || e.key === 'Delete') {
                    setTimeout(updateFilterFromEditor, 0);
                }
                break;
        }
    }

    function updateFilterFromEditor() {
        if (!slashMenuElement || !slashTextNode || slashOffset < 0) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const currentRange = sel.getRangeAt(0);
        const currentNode = currentRange.startContainer;
        const currentOffset = currentRange.startOffset;

        // Si on est toujours dans le même nœud texte
        if (currentNode === slashTextNode && currentNode.nodeType === 3) {
            // Le texte filtré est entre slashOffset+1 (après le slash) et currentOffset
            const text = slashTextNode.textContent;
            filterText = text.substring(slashOffset + 1, currentOffset);
            selectedIndex = 0;
            updateMenuContent();
        } else {
            // Si on a changé de nœud, fermer le menu
            hideSlashMenu();
            savedNoteEntry = null;
        }
    }

    function showSlashMenu() {
        // Slash menu disabled when toolbar_mode is "full"
        if (document.body.classList.contains('toolbar-mode-full')) {
            return;
        }

        hideSlashMenu();

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const container = range.startContainer;

        // On doit être dans un nœud texte
        if (container.nodeType !== 3) return;

        // Sauvegarder la position du slash (juste avant la position actuelle)
        slashTextNode = container;
        slashOffset = range.startOffset - 1;

        let containerElement = container.parentNode;
        savedNoteEntry = containerElement.closest && containerElement.closest('.noteentry');

        filterText = '';
        selectedIndex = 0;
        filteredCommands = getFilteredCommands('');

        slashMenuElement = document.createElement('div');
        slashMenuElement.className = 'slash-command-menu';
        slashMenuElement.innerHTML = buildMenuHTML();

        document.body.appendChild(slashMenuElement);
        positionMenu(range);

        requestAnimationFrame(() => {
            if (slashMenuElement) slashMenuElement.classList.add('show');
        });

        slashMenuElement.addEventListener('mousedown', handleMenuMouseDown);
        slashMenuElement.addEventListener('click', handleMenuClick);
        slashMenuElement.addEventListener('mouseover', handleMenuMouseOver);
    }

    function handleInput(e) {
        const target = e.target;
        if (!target || !target.classList || !target.classList.contains('noteentry')) return;
        if (!isInHtmlNote()) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;

        const container = range.startContainer;
        if (container.nodeType !== 3) return;

        const offset = range.startOffset;
        if (offset < 1) return;

        const textBefore = container.textContent.substring(0, offset);
        const lastChar = textBefore.charAt(textBefore.length - 1);

        if (lastChar === '/') {
            const charBeforeSlash = textBefore.length > 1 ? textBefore.charAt(textBefore.length - 2) : '';
            if (charBeforeSlash === '' || charBeforeSlash === ' ' || charBeforeSlash === '\n' || charBeforeSlash === '\u00A0') {
                showSlashMenu();
            }
        } else if (slashMenuElement) {
            // If menu is open, update filter from editor
            setTimeout(updateFilterFromEditor, 0);
        }
    }

    function handleClickOutside(e) {
        if (!slashMenuElement) return;

        const isClickInsideMenu = slashMenuElement.contains(e.target);
        const isClickInsideSubmenu = submenuElement && submenuElement.contains(e.target);
        
        if (!isClickInsideMenu && !isClickInsideSubmenu) {
            hideSlashMenu();
            savedNoteEntry = null;
        }
    }

    function init() {
        document.addEventListener('input', handleInput, true);
        document.addEventListener('keydown', handleKeydown, true);
        document.addEventListener('mousedown', handleClickOutside, true);

        window.hideSlashMenu = hideSlashMenu;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
