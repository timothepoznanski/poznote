/**
 * Modal Alert System for Poznote
 * Replaces standard alert() and confirm() with styled modals
 */

function tr(key, vars, fallback) {
    try {
        if (typeof window !== 'undefined' && typeof window.t === 'function') {
            return window.t(key, vars || {}, fallback);
        }
    } catch (e) {
        // ignore
    }
    let text = (fallback !== undefined && fallback !== null) ? String(fallback) : String(key);
    if (vars && typeof vars === 'object') {
        Object.keys(vars).forEach((k) => {
            text = text.replaceAll('{{' + k + '}}', String(vars[k]));
        });
    }
    return text;
}

class ModalAlert {
    constructor() {
        this.currentModal = null;
        this.queue = [];
        this.isShowing = false;
    }

    /**
     * Show an alert modal
     * @param {string} message - The message to display
     * @param {string} type - Type of alert ('info', 'warning', 'error', 'success')
     * @param {string} title - Optional title, defaults based on type
     * @returns {Promise} - Resolves when modal is closed
     */
    alert(message, type = 'info', title = null) {
        return new Promise((resolve) => {
            const config = {
                type: 'alert',
                message,
                alertType: type,
                title: title || this.getDefaultTitle(type),
                buttons: [
                    { text: tr('common.close', {}, 'Close'), type: 'primary', action: () => resolve() }
                ]
            };
            
            this.showModal(config);
        });
    }

    /**
     * Show a confirmation modal
     * @param {string} message - The message to display
     * @param {string} title - Optional title
     * @returns {Promise<boolean>} - Resolves with true/false
     */
    confirm(message, title = null) {
        return new Promise((resolve) => {
            const config = {
                type: 'confirm',
                message,
                alertType: 'warning',
                title: title || tr('common.confirmation', {}, 'Confirmation'),
                buttons: [
                    { text: tr('common.cancel', {}, 'Cancel'), type: 'secondary', action: () => resolve(false) },
                    { text: tr('common.confirm', {}, 'Confirm'), type: 'primary', action: () => resolve(true) }
                ]
            };
            
            this.showModal(config);
        });
    }

    /**
     * Show a loading spinner modal
     * @param {string} message - The message to display
     * @param {string} title - Optional title
     * @returns {Object} - Object with close method
     */
    showSpinner(message = null, title = null) {
        if (message === null) message = tr('common.loading', {}, 'Loading...');
        if (title === null) title = tr('common.please_wait', {}, 'Please wait');

        const overlay = document.createElement('div');
        overlay.className = 'alert-modal-overlay spinner-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'alert-modal spinner-modal';
        
        const header = document.createElement('div');
        header.className = 'alert-modal-header';
        
        const titleElement = document.createElement('h3');
        titleElement.className = 'alert-modal-title';
        titleElement.innerHTML = `
            <span class="alert-modal-icon spinner-icon">
                <div class="spinner"></div>
            </span>
            ${title}
        `;
        
        const body = document.createElement('div');
        body.className = 'alert-modal-body';
        body.textContent = message;
        // Allow displayed newlines (\n) in translations to render as line breaks
        body.style.whiteSpace = 'pre-wrap';
        
        // Assemble modal
        header.appendChild(titleElement);
        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);
        
        // Add to DOM
        document.body.appendChild(overlay);
        
        // Show with animation
        requestAnimationFrame(() => {
            overlay.classList.add('show');
        });

        // Return close function
        return {
            close: () => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 300);
            }
        };
    }

    /**
     * Show a custom modal
     * @param {Object} config - Modal configuration
     */
    showModal(config) {
        if (this.isShowing) {
            this.queue.push(config);
            return;
        }

        this.isShowing = true;
        this.createModal(config);
    }

    createModal(config) {
        // Remove existing modal if any
        this.removeCurrentModal();

        // Create modal structure
        const overlay = document.createElement('div');
        overlay.className = 'alert-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'alert-modal';
        
        const header = document.createElement('div');
        header.className = 'alert-modal-header';
        
        const title = document.createElement('h3');
        title.className = 'alert-modal-title';
        // Don't show icon for info type
        if (config.alertType === 'info') {
            title.textContent = config.title;
        } else {
            title.innerHTML = `
                <span class="alert-modal-icon ${config.alertType}">${this.getIcon(config.alertType)}</span>
                ${config.title}
            `;
        }
        
        const body = document.createElement('div');
        body.className = 'alert-modal-body';
        body.textContent = config.message;
        // Allow displayed newlines (\n) in translations to render as line breaks
        body.style.whiteSpace = 'pre-wrap';
        
        const footer = document.createElement('div');
        footer.className = 'alert-modal-footer';
        
        // Create buttons
        config.buttons.forEach(buttonConfig => {
            const button = document.createElement('button');
            button.className = `alert-modal-button ${buttonConfig.type}`;
            button.textContent = buttonConfig.text;
            button.onclick = () => {
                this.closeModal(overlay);
                buttonConfig.action();
            };
            footer.appendChild(button);
        });

        // Assemble modal
        header.appendChild(title);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        
        // Add to DOM
        document.body.appendChild(overlay);
        this.currentModal = overlay;
        
        // Show with animation
        requestAnimationFrame(() => {
            overlay.classList.add('show');
        });

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                this.closeModal(overlay);
                if (config.buttons.length > 0 && config.buttons[0].action) {
                    config.buttons[0].action(); // Execute first button action (usually cancel)
                }
            }
        };

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeModal(overlay);
                if (config.buttons.length > 0 && config.buttons[0].action) {
                    config.buttons[0].action();
                }
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Focus first button
        const firstButton = footer.querySelector('.alert-modal-button');
        if (firstButton) {
            setTimeout(() => firstButton.focus(), 100);
        }
    }

    closeModal(overlay) {
        if (!overlay) return;
        
        overlay.classList.remove('show');
        setTimeout(() => {
            this.removeCurrentModal();
            this.isShowing = false;
            this.processQueue();
        }, 300);
    }

    removeCurrentModal() {
        if (this.currentModal && this.currentModal.parentNode) {
            this.currentModal.parentNode.removeChild(this.currentModal);
        }
        this.currentModal = null;
    }

    processQueue() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this.showModal(next);
        }
    }

    getDefaultTitle(type) {
        const titles = {
            info: tr('common.information', {}, 'Information'),
            warning: tr('common.warning', {}, 'Warning'),
            error: tr('common.error', {}, 'Error'),
            success: tr('common.success', {}, 'Success')
        };
        return titles[type] || tr('common.information', {}, 'Information');
    }

    getIcon(type) {
        const icons = {
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌',
            success: '✅'
        };
        return icons[type] || 'ℹ️';
    }
}

// Create global instance
window.modalAlert = new ModalAlert();

// Override native alert and confirm
window.nativeAlert = window.alert;
window.nativeConfirm = window.confirm;

window.alert = function(message) {
    return window.modalAlert.alert(message, 'info');
};

// Note: window.confirm is NOT overridden because modalAlert.confirm() returns
// a Promise (always truthy), which would break all synchronous if(confirm(...)) callers.
// Use window.modalAlert.confirm(message).then(...) for async confirmations.

// Convenience functions
window.showWarning = function(message, title = null) {
    if (title === null) title = tr('common.warning', {}, 'Warning');
    return window.modalAlert.alert(message, 'warning', title);
};

window.showError = function(message, title = null) {
    if (title === null) title = tr('common.error', {}, 'Error');
    return window.modalAlert.alert(message, 'error', title);
};

window.showSuccess = function(message, title = null) {
    if (title === null) title = tr('common.success', {}, 'Success');
    return window.modalAlert.alert(message, 'success', title);
};

window.showInfo = function(message, title = null) {
    if (title === null) title = tr('common.information', {}, 'Information');
    return window.modalAlert.alert(message, 'info', title);
};

// Special function for cursor warnings
window.showCursorWarning = function() {
    return window.modalAlert.alert(
        tr(
            'modal_alerts.cursor_warning.message',
            {},
            'Please place the cursor in the note editing area where you want to insert content.'
        ),
        'warning',
        tr('modal_alerts.cursor_warning.title', {}, 'Cursor Position Required')
    );
};

// Loading spinner function
window.showLoadingSpinner = function(message = null, title = null) {
    return window.modalAlert.showSpinner(message, title);
};