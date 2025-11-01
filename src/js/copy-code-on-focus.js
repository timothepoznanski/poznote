/* copy-code-on-focus.js
   Listens for focus/click events inside code blocks (<pre>, <code>, .code-block)
   and copies their textual content to the clipboard when the user focuses/clicks inside.
   Non-intrusive: only triggers on user interaction, respects navigator.clipboard availability,
   and shows a short visual feedback by adding a `copied` class to the element for 600ms.
*/
(function () {
    'use strict';

    // long-press copy script (no debug logs)

    // CSS class added for feedback. The project likely has global CSS; keep class name minimal.
    var FEEDBACK_CLASS = 'copied-by-focus';
    var FEEDBACK_TIMEOUT = 600;

    function getCodeContainer(target) {
        // Walk up until we find a code/pre element or an element with class code-block
        var el = target;
        while (el) {
            if (!el.tagName) return null;
            var tag = el.tagName.toLowerCase();
            if (tag === 'code' || tag === 'pre') return el;
            if (el.classList && el.classList.contains('code-block')) return el;
            el = el.parentElement;
        }
        return null;
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

    function showFeedback(el) {
        if (!el) return;
        el.classList.add(FEEDBACK_CLASS);
        setTimeout(function () {
            el.classList.remove(FEEDBACK_CLASS);
        }, FEEDBACK_TIMEOUT);
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

    // (No direct click handler.) Long-press handling below will perform copy.

    // Long-press handling: start timer on pointerdown, cancel on pointerup/pointercancel/leave
    var longPressTimer = null;
    var longPressElement = null;
    var LONG_PRESS_MS = 1000;
    var pointerStartX = 0;
    var pointerStartY = 0;
    var isSelecting = false;

    function startLongPress(e) {
        if (e.button && e.button !== 0) return; // ignore non-primary
        var target = e.target || e.srcElement;
        var codeEl = getCodeContainer(target);
        if (!codeEl) return;
        
        // Check if there's already text selected in the code block
        var selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            var range = selection.getRangeAt(0);
            var selectionContainer = range.commonAncestorContainer;
            // Check if the selection is within our code element
            var selectionElement = selectionContainer.nodeType === 3 ? selectionContainer.parentElement : selectionContainer;
            if (codeEl.contains(selectionElement)) {
                return; // Don't start long press if there's already a selection in the code block
            }
        }
        
        // Store pointer position to detect movement (selection)
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        isSelecting = false;
        
        // store element and start timer
        longPressElement = codeEl;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        longPressTimer = setTimeout(function () {
            // Only perform copy if we're not in the middle of selecting text
            if (isSelecting) {
                longPressElement = null;
                longPressTimer = null;
                return;
            }
            
            // Double-check if a text selection has been made during the long press
            var selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                var range = selection.getRangeAt(0);
                var selectionContainer = range.commonAncestorContainer;
                var selectionElement = selectionContainer.nodeType === 3 ? selectionContainer.parentElement : selectionContainer;
                if (longPressElement.contains(selectionElement)) {
                    // User has selected text in the code block, don't copy the whole block
                    longPressElement = null;
                    longPressTimer = null;
                    return;
                }
            }
            
            // perform copy
            var text = normalizeCodeText(longPressElement);
            if (!text) { longPressElement = null; longPressTimer = null; return; }
            copyText(text).then(function (ok) {
                if (ok) {
                    showFeedback(longPressElement);
                    showToast('Copied to clipboard!');
                } else {
                    showToast('Copy failed — select the code and press Ctrl+C');
                }
                longPressElement = null;
                longPressTimer = null;
            }).catch(function () {
                showToast('Copy failed — select the code and press Ctrl+C');
                longPressElement = null;
                longPressTimer = null;
            });
        }, LONG_PRESS_MS);
    }

    function handlePointerMove(e) {
        if (!longPressTimer || !longPressElement) return;
        
        // Calculate movement distance
        var deltaX = Math.abs(e.clientX - pointerStartX);
        var deltaY = Math.abs(e.clientY - pointerStartY);
        
        // If there's significant movement, consider it a selection gesture
        if (deltaX > 5 || deltaY > 5) {
            isSelecting = true;
            // Cancel the long press timer since user is selecting text
            cancelLongPress();
        }
    }

    function cancelLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressElement = null;
        }
        isSelecting = false;
    }

    document.addEventListener('pointerdown', startLongPress, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', cancelLongPress, true);
    document.addEventListener('pointercancel', cancelLongPress, true);
    document.addEventListener('pointerleave', cancelLongPress, true);

    // Add a tiny style for feedback if possible
    function injectStyle() {
        try {
            var css = '.' + FEEDBACK_CLASS + ' { outline: 2px solid #007DB8; transition: outline .15s ease-in-out; }';
            var head = document.head || document.getElementsByTagName('head')[0];
            var style = document.createElement('style');
            style.type = 'text/css';
            if (style.styleSheet) {
                style.styleSheet.cssText = css;
            } else {
                style.appendChild(document.createTextNode(css));
            }
            head.appendChild(style);
        } catch (e) {
            // Ignore
        }
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
            
            // Check if button already exists
            var existingBtn = block.querySelector('.code-block-copy-btn');
            var btn;
            
            if (existingBtn) {
                btn = existingBtn;
                // Remove old event listeners by cloning the button
                var newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                btn = newBtn;
            } else {
                // Create copy button
                btn = document.createElement('button');
                btn.className = 'code-block-copy-btn';
                btn.setAttribute('type', 'button');
                btn.setAttribute('aria-label', 'Copy code to clipboard');
                btn.setAttribute('title', 'Copy code');
                
                // SVG icon for copy
                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            }
            
            // Add/re-attach click handler
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
                        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                        
                        showToast('Copied to clipboard!');
                        
                        // Reset button after 2 seconds
                        setTimeout(function() {
                            btn.classList.remove('copied');
                            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                        }, 2000);
                    } else {
                        showToast('Copy failed — select the code and press Ctrl+C');
                    }
                }).catch(function () {
                    showToast('Copy failed — select the code and press Ctrl+C');
                });
            });
            
            // Add button to the code block only if it's new
            if (!existingBtn) {
                block.appendChild(btn);
            }
        });
    }

    // Expose the function globally so it can be called after AJAX note loads
    window.reinitializeCodeCopyButtons = addCopyButtonToCodeBlocks;

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
            injectStyle(); 
            try { ensureToastContainer(); } catch(e){} 
            addCopyButtonToCodeBlocks();
            observeCodeBlocks();
        });
    } else {
        injectStyle();
        try { ensureToastContainer(); } catch(e){}
        addCopyButtonToCodeBlocks();
        observeCodeBlocks();
    }

})();