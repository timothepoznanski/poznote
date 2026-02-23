/**
 * Index icon scale settings module
 */


// Function to show index icon scale settings prompt
function showIndexIconScalePrompt() {
    // Close settings menus
    if (typeof closeSettingsMenus === 'function') {
        closeSettingsMenus();
    }

    // Get modal elements
    const modal = document.getElementById('indexIconScaleModal');
    const scaleInput = document.getElementById('indexIconScaleInput');
    const scaleValueDisplay = document.getElementById('indexIconScaleValue');
    const cancelBtn = document.getElementById('cancelIndexIconScaleBtn');
    const saveBtn = document.getElementById('saveIndexIconScaleBtn');

    if (!modal || !scaleInput || !scaleValueDisplay) {
        return;
    }

    // Add event listeners if they don't exist yet
    if (!modal.hasAttribute('data-initialized')) {
        cancelBtn?.addEventListener('click', closeIndexIconScaleModal);
        saveBtn?.addEventListener('click', saveIndexIconScale);
        scaleInput?.addEventListener('input', function() {
            scaleValueDisplay.textContent = parseFloat(this.value).toFixed(1) + 'x';
        });

        // Mark as initialized
        modal.setAttribute('data-initialized', 'true');
    }

    // Load current setting
    loadCurrentIndexIconScale();

    // Show modal
    modal.style.display = 'block';
}

// Function to close modal
function closeIndexIconScaleModal() {
    const modal = document.getElementById('indexIconScaleModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Function to load current setting
function loadCurrentIndexIconScale() {
    const scaleInput = document.getElementById('indexIconScaleInput');
    const scaleValueDisplay = document.getElementById('indexIconScaleValue');

    const scale = localStorage.getItem('index_icon_scale') || '1.0';
    if (scaleInput) {
        scaleInput.value = scale;
    }
    if (scaleValueDisplay) {
        scaleValueDisplay.textContent = parseFloat(scale).toFixed(1) + 'x';
    }
}

// Function to save setting
function saveIndexIconScale() {
    const scaleInput = document.getElementById('indexIconScaleInput');
    if (!scaleInput) return;

    const scale = scaleInput.value;

    // Save to localStorage for immediate effect
    localStorage.setItem('index_icon_scale', scale);

    updateIndexIconScaleBadge(scale);
    closeIndexIconScaleModal();
    applyIndexIconScale(scale);
}

// Function to update the badge in settings page
function updateIndexIconScaleBadge(scale) {
    const badge = document.getElementById('index-icon-scale-badge');
    if (badge) {
        badge.textContent = parseFloat(scale).toFixed(1) + 'x';
    }
}

// Function to apply the scale (index.php only)
function applyIndexIconScale(scale) {
    if (!scale || scale === '1.0') {
        const styleTag = document.getElementById('index-icon-scale-style');
        if (styleTag) styleTag.remove();
        return;
    }

    let styleTag = document.getElementById('index-icon-scale-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'index-icon-scale-style';
        document.head.appendChild(styleTag);
    }
    
    const s = parseFloat(scale);
    styleTag.innerHTML = `
        /* Sidebar: howto / home / settings / create */
        .sidebar-howto i,
        .sidebar-howto [class*="lucide-"],
        .sidebar-home i,
        .sidebar-home [class*="lucide-"],
        .sidebar-settings i,
        .sidebar-settings [class*="lucide-"],
        .sidebar-plus i,
        .sidebar-plus [class*="lucide-"],
        .sidebar-plus .lucide-plus-circle {
            font-size: ${1.0 * s}em !important;
        }

        /* Folder icon */
        .folder-icon {
            font-size: ${1.1 * s}rem !important;
        }

        /* Note editor toolbar icons */
        .toolbar-btn {
            min-width: ${38 * s}px !important;
            min-height: ${38 * s}px !important;
        }
        .toolbar-btn i, .toolbar-btn [class*="lucide-"] {
            font-size: ${0.75 * s}em !important;
        }
    `;
}

// Initialize on page load
(function() {
    // Only apply visual scaling on the index layout
    const isIndexLayout = !!(
        document.getElementById('left_col') &&
        document.querySelector('.sidebar-title-actions')
    );
    if (!isIndexLayout) {
        return;
    }

    // 1. Check data attribute (from PHP)
    // 2. Fallback to localStorage
    // 3. Fallback to default 1.0
    let scale = localStorage.getItem('index_icon_scale') || '1.0';

    if (scale !== '1.0') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => applyIndexIconScale(scale));
        } else {
            applyIndexIconScale(scale);
        }
    }
})();
