// Workspace display map and localStorage management
(function(){
    try {
        var params = new URLSearchParams(window.location.search);
        if (!params.has('workspace')) {
            var stored = null;
            try { stored = localStorage.getItem('poznote_selected_workspace'); } catch(e) {}
            if (stored && window.workspaceDisplayMap) {
                var left = document.querySelector('.left-header-text');
                if (left) {
                    if (window.workspaceDisplayMap[stored]) left.textContent = window.workspaceDisplayMap[stored];
                    else left.textContent = stored;
                }
            }
        }
    } catch(e) {}
})();
