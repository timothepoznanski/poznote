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
    
    resizeHandle.addEventListener('mousedown', startResizing);
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);
    
    // Prevent text selection during resize
    resizeHandle.addEventListener('selectstart', function(e) {
        e.preventDefault();
    });
}

function startResizing(e) {
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
    }
};
