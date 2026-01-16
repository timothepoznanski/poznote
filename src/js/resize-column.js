// Resizable left column functionality
let isResizing = false;

function initResizableColumn() {
    const resizeHandle = document.getElementById('resizeHandle');
    const leftCol = document.getElementById('left_col');
    const rightCol = document.getElementById('right_col');

    if (!resizeHandle || !leftCol || !rightCol) {
        return; // Elements not found or mobile version
    }

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('leftColWidth');
    if (savedWidth && parseInt(savedWidth) >= 200 && parseInt(savedWidth) <= 800) {
        document.documentElement.style.setProperty('--left-col-width', savedWidth + 'px');
        leftCol.style.width = savedWidth + 'px';
    }

    // Load saved collapsed state from localStorage
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        document.body.classList.add('sidebar-collapsed');
    }

    // Initialize toggle button
    initToggleSidebar();

    resizeHandle.addEventListener('mousedown', startResizing);
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);

    // Prevent text selection during resize
    resizeHandle.addEventListener('selectstart', function(e) {
        e.preventDefault();
    });
}

function startResizing(e) {
    // Don't start resizing if clicking on the toggle button
    if (e.target.closest('.toggle-sidebar-btn')) {
        return;
    }

    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

function handleResize(e) {
    if (!isResizing) return;
    
    e.preventDefault();
    const leftCol = document.getElementById('left_col');
    const minWidth = 200;
    const maxWidth = 800;
    
    // Calculate new width based on mouse position
    const newWidth = Math.min(Math.max(e.clientX, minWidth), maxWidth);
    
    // Update CSS variable and element width
    document.documentElement.style.setProperty('--left-col-width', newWidth + 'px');
    if (leftCol) {
        leftCol.style.width = newWidth + 'px';
    }
}

function stopResizing() {
    if (!isResizing) return;
    
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // Save the new width to localStorage
    const leftCol = document.getElementById('left_col');
    if (leftCol) {
        const currentWidth = leftCol.offsetWidth;
        localStorage.setItem('leftColWidth', currentWidth);
    }
}

// Initialize resizable column when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initResizableColumn();
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    initResizableColumn();
}

// Toggle sidebar functionality
function initToggleSidebar() {
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleSidebar();
    });

    // Add keyboard support
    toggleBtn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSidebar();
        }
    });
}

function toggleSidebar() {
    const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

// Expose functions globally for debugging
window.resizeColumn = {
    init: initResizableColumn,
    isResizing: function() { return isResizing; },
    getWidth: function() {
        const leftCol = document.getElementById('left_col');
        return leftCol ? leftCol.offsetWidth : null;
    },
    setWidth: function(width) {
        const leftCol = document.getElementById('left_col');
        const validWidth = Math.min(Math.max(width, 200), 800);
        if (leftCol) {
            document.documentElement.style.setProperty('--left-col-width', validWidth + 'px');
            leftCol.style.width = validWidth + 'px';
            localStorage.setItem('leftColWidth', validWidth);
        }
    },
    toggleSidebar: toggleSidebar,
    isCollapsed: function() {
        return document.body.classList.contains('sidebar-collapsed');
    }
};
