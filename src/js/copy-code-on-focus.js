/* copy-code-on-focus.js
   Adds copy buttons to code blocks and provides clipboard functionality.
*/
(function () {
    'use strict';

    var COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    var CHECK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var DELETE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

    function tl(key, fallback) {
        return window.t ? window.t(key, {}, fallback) : fallback;
    }

    function setCopyIcon(btn) {
        btn.innerHTML = COPY_ICON_SVG;
    }

    function setCheckIcon(btn) {
        btn.innerHTML = CHECK_ICON_SVG;
    }

    async function copyText(text) {
        // Prefer navigator.clipboard when available
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (e) {
                // fallthrough to execCommand fallback
            }
        }
        // Fallback copy using a temporary textarea + execCommand('copy')
        return copyViaTextarea(text);
    }

    function copyViaTextarea(text) {
        try {
            var ta = document.createElement('textarea');
            // Place off-screen
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            ta.setAttribute('readonly', '');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            var ok = false;
            try {
                ok = document.execCommand('copy');
            } catch (e) {
                ok = false;
            }
            try { document.body.removeChild(ta); } catch (e) {}
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    // Lightweight accessible toast helper
    function ensureToastContainer() {
        var id = 'copy-toast-container';
        var container = document.getElementById(id);
        if (container) return container;
        container = document.createElement('div');
        container.id = id;
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        container.style.position = 'fixed';
        container.style.top = '16px';
        container.style.right = '16px';
        container.style.zIndex = 2147483647; // very high
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
        return container;
    }

    function showToast(message, duration) {
        try {
            duration = duration || 1800;
            var container = ensureToastContainer();
            var toast = document.createElement('div');
            toast.className = 'copy-toast-message';
            toast.style.pointerEvents = 'auto';
            toast.style.background = '#2d3748';
            toast.style.color = '#e2e8f0';
            toast.style.padding = '10px 16px';
            toast.style.marginTop = '8px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            toast.style.fontSize = '14px';
            toast.style.fontWeight = '500';
            toast.style.maxWidth = '280px';
            toast.style.wordBreak = 'break-word';
            toast.style.border = '1px solid rgba(255,255,255,0.1)';
            toast.style.userSelect = 'none';
            toast.style.webkitUserSelect = 'none';
            toast.style.mozUserSelect = 'none';
            toast.style.msUserSelect = 'none';
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 160ms ease-in-out, transform 160ms ease-in-out';
            toast.style.transform = 'translateY(-6px)';
            toast.textContent = message;
            container.appendChild(toast);
            // Force reflow to enable transition
            // eslint-disable-next-line no-unused-expressions
            toast.offsetHeight;
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';

            // Each toast has its own timer so multiple toasts can appear independently
            var tId = setTimeout(function () {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-6px)';
                setTimeout(function () { try { container.removeChild(toast); } catch (e) {} }, 220);
            }, duration);

            // toast shown (silent)
        } catch (e) { /* ignore */ }
    }

    function normalizeCodeText(el) {
        if (!el) return '';
        // Clone the element to avoid modifying the original
        var clone = el.cloneNode(true);
        
        // Remove the copy button from the clone if present
        var btn = clone.querySelector('.code-block-copy-btn');
        if (btn) {
            btn.remove();
        }
        
        // Remove the delete button from the clone if present
        var delBtn = clone.querySelector('.code-block-delete-btn');
        if (delBtn) {
            delBtn.remove();
        }
        
        // Get text content and normalize spaces
        var text = clone.textContent || clone.innerText || '';
        
        // Replace non-breaking spaces with regular spaces
        text = text.replace(/\u00A0/g, ' ');
        
        // Remove trailing whitespace from each line but keep line breaks
        text = text.split('\n').map(function(line) {
            return line.trimEnd();
        }).join('\n');
        
        // Remove leading/trailing empty lines
        text = text.trim();
        
        return text;
    }

    function ensureCodeBlockActionHost(block) {
        if (!block || !block.parentNode) return block;

        var host = block.parentElement;
        if (host && host.classList && host.classList.contains('code-block-actions-host')) {
            host.style.position = 'relative';
            host.style.maxWidth = '100%';
            host.style.boxSizing = 'border-box';
            return host;
        }

        host = document.createElement('div');
        host.className = 'code-block-actions-host';
        host.style.position = 'relative';
        host.style.maxWidth = '100%';
        host.style.boxSizing = 'border-box';

        block.parentNode.insertBefore(host, block);
        host.appendChild(block);

        return host;
    }

    function getCodeBlockRemovalTarget(block) {
        if (!block) return block;

        var host = block.parentElement;
        if (host && host.classList && host.classList.contains('code-block-actions-host')) {
            return host;
        }

        return block;
    }

    // Add copy button to code blocks
    function addCopyButtonToCodeBlocks() {
        // Find all code blocks
        var codeBlocks = document.querySelectorAll('pre, .code-block');
        
        codeBlocks.forEach(function(block) {
            // Skip inline code elements
            if (block.tagName.toLowerCase() === 'code' && block.parentElement.tagName.toLowerCase() !== 'pre') {
                return;
            }

            var actionHost = ensureCodeBlockActionHost(block);
            
            // Check if button already exists
            var existingBtn = block.querySelector('.code-block-copy-btn') || actionHost.querySelector('.code-block-copy-btn');
            var existingDelBtn = block.querySelector('.code-block-delete-btn') || actionHost.querySelector('.code-block-delete-btn');
            var btn;
            var delBtn;
            
            if (existingBtn) {
                btn = existingBtn;
                // Remove old event listeners by cloning the button
                var newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                btn = newBtn;
                btn.setAttribute('aria-label', 'Copy code to clipboard');
                btn.setAttribute('title', 'Copy code');
                setCopyIcon(btn);
            } else {
                // Create copy button
                btn = document.createElement('button');
                btn.className = 'code-block-copy-btn';
                btn.setAttribute('type', 'button');
                btn.setAttribute('aria-label', 'Copy code to clipboard');
                btn.setAttribute('title', 'Copy code');
                
                // SVG icon for copy
                setCopyIcon(btn);
            }

            if (btn.parentNode !== actionHost) {
                if (btn.parentNode) {
                    btn.parentNode.removeChild(btn);
                }
                actionHost.appendChild(btn);
            }

            var deleteBtnLabel = tl('editor.code_block_delete.title', 'Delete code block');

            if (existingDelBtn) {
                delBtn = existingDelBtn;
                var newDelBtn = delBtn.cloneNode(true);
                delBtn.parentNode.replaceChild(newDelBtn, delBtn);
                delBtn = newDelBtn;
                delBtn.setAttribute('aria-label', deleteBtnLabel);
                delBtn.setAttribute('title', deleteBtnLabel);
                delBtn.innerHTML = DELETE_ICON_SVG;
            } else {
                delBtn = document.createElement('button');
                delBtn.className = 'code-block-delete-btn';
                delBtn.setAttribute('type', 'button');
                delBtn.setAttribute('aria-label', deleteBtnLabel);
                delBtn.setAttribute('title', deleteBtnLabel);
                delBtn.innerHTML = DELETE_ICON_SVG;
            }

            if (delBtn.parentNode !== actionHost) {
                if (delBtn.parentNode) {
                    delBtn.parentNode.removeChild(delBtn);
                }
                actionHost.appendChild(delBtn);
            }
            
            // Add/re-attach click handler for copy
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                var text = normalizeCodeText(block);
                
                if (!text) {
                    showToast('No text found to copy');
                    return;
                }
                
                copyText(text).then(function (ok) {
                    if (ok) {
                        // Visual feedback on button
                        btn.classList.add('copied');
                        setCheckIcon(btn);
                        
                        showToast('Copied to clipboard!');
                        
                        // Reset button after 2 seconds
                        setTimeout(function() {
                            btn.classList.remove('copied');
                            setCopyIcon(btn);
                        }, 2000);
                    } else {
                        showToast('Copy failed — select the code and press Ctrl+C');
                    }
                }).catch(function () {
                    showToast('Copy failed — select the code and press Ctrl+C');
                });
            });

            // Add delete click handler
            delBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var confirmTitle = tl('editor.code_block_delete.confirm_title', 'Delete code block');
                var confirmMsg   = tl('editor.code_block_delete.confirm_message', 'Do you want to delete this code block?');

                var doDelete = function() {
                    // --- Markdown mode: update source and re-render ---
                    var markdownPreview = block.closest('.markdown-preview');
                    if (markdownPreview) {
                        var noteEntry = markdownPreview.closest('.noteentry');
                        if (noteEntry) {
                            var noteId   = noteEntry.id.replace('entry', '');
                            var editorDiv = noteEntry.querySelector('.markdown-editor');
                            if (editorDiv) {
                                // Determine index of this <pre> among all <pre> in the preview
                                var allPres  = Array.from(markdownPreview.querySelectorAll('pre'));
                                var preIndex = allPres.indexOf(block);
                                if (preIndex !== -1) {
                                    var content = typeof window.getMarkdownContent === 'function'
                                        ? window.getMarkdownContent(noteId)
                                        : editorDiv.textContent;
                                    var lines = content.split('\n');
                                    // Find the nth fenced code block (``` … ```)
                                    var blockCount = -1;
                                    var startLine  = -1;
                                    var endLine    = -1;
                                    var inBlock    = false;
                                    for (var i = 0; i < lines.length; i++) {
                                        if (/^\s*```/.test(lines[i])) {
                                            if (!inBlock) {
                                                blockCount++;
                                                if (blockCount === preIndex) {
                                                    startLine = i;
                                                    inBlock   = true;
                                                }
                                            } else {
                                                if (blockCount === preIndex) {
                                                    endLine = i;
                                                    break;
                                                }
                                                inBlock = false;
                                            }
                                        }
                                    }
                                    if (startLine !== -1 && endLine !== -1) {
                                        lines.splice(startLine, endLine - startLine + 1);
                                        var newContent = lines.join('\n');
                                        editorDiv.textContent = newContent;
                                        noteEntry.setAttribute('data-markdown-content', newContent);
                                        if (typeof window.markNoteAsModified === 'function') {
                                            window.markNoteAsModified();
                                        }
                                        // Re-render the preview
                                        if (noteEntry.classList.contains('markdown-split-mode')) {
                                            editorDiv.dispatchEvent(new Event('input', { bubbles: true }));
                                        } else if (typeof window.switchToPreviewMode === 'function') {
                                            window.switchToPreviewMode(noteId);
                                        }
                                        return;
                                    }
                                }
                            }
                        }
                    }

                    // --- Rich-text mode: remove the DOM block directly ---
                    var noteentry = block.closest('.noteentry') || document.querySelector('.noteentry');
                    var removalTarget = getCodeBlockRemovalTarget(block);
                    removalTarget.remove();
                    if (typeof window.markNoteAsModified === 'function') {
                        window.markNoteAsModified();
                    }
                    if (noteentry) {
                        noteentry.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };

                if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
                    window.modalAlert.confirm(confirmMsg, confirmTitle).then(function(confirmed) {
                        if (confirmed) doDelete();
                    });
                } else if (confirm(confirmMsg)) {
                    doDelete();
                }
            });
        });
    }

    // Detect horizontal overflow on code blocks and toggle 'has-x-overflow' class
    // to avoid reserving scrollbar space when no horizontal scroll is needed.
    function updateCodeBlockOverflow() {
        var blocks = document.querySelectorAll('pre code.hljs, pre.code-block, .code-block');
        blocks.forEach(function(block) {
            if (block.scrollWidth > block.clientWidth) {
                block.classList.add('has-x-overflow');
            } else {
                block.classList.remove('has-x-overflow');
            }
        });
    }

    // Expose the function globally so it can be called after AJAX note loads
    window.reinitializeCodeCopyButtons = function() {
        addCopyButtonToCodeBlocks();
        updateCodeBlockOverflow();
    };

    // Watch for dynamically added code blocks
    function observeCodeBlocks() {
        var observer = new MutationObserver(function(mutations) {
            var shouldUpdate = false;
            
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { // Element node
                            var tagName = node.tagName ? node.tagName.toLowerCase() : '';
                            if (tagName === 'pre' || node.classList && node.classList.contains('code-block')) {
                                shouldUpdate = true;
                            } else if (node.querySelectorAll) {
                                var hasCodeBlocks = node.querySelectorAll('pre, .code-block').length > 0;
                                if (hasCodeBlocks) {
                                    shouldUpdate = true;
                                }
                            }
                        }
                    });
                }
            });
            
            if (shouldUpdate) {
                addCopyButtonToCodeBlocks();
                updateCodeBlockOverflow();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { 
            try { ensureToastContainer(); } catch(e){} 
            addCopyButtonToCodeBlocks();
            updateCodeBlockOverflow();
            observeCodeBlocks();
            window.addEventListener('resize', updateCodeBlockOverflow);
        });
    } else {
        try { ensureToastContainer(); } catch(e){}
        addCopyButtonToCodeBlocks();
        updateCodeBlockOverflow();
        observeCodeBlocks();
        window.addEventListener('resize', updateCodeBlockOverflow);
    }

})();