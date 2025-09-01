<?php
// Simple HTML generation functions

// Generate workspace display map script
function generateWorkspaceScript($workspaces, $labels) {
    $display_map = generateWorkspaceDisplayMap($workspaces, $labels);
    return '<script>
    window.workspaceDisplayMap = ' . json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) . ';
    </script>';
}

// Generate JavaScript configuration script
function generateConfigScript($search, $tags_search, $note, $current_note_folder, $default_note_folder, $defaultFolderName, $workspace_filter) {
    $current_folder = null;
    if ($note != '' && empty($search) && empty($tags_search)) {
        $current_folder = $current_note_folder ?? $defaultFolderName;
    } else if ($default_note_folder && empty($search) && empty($tags_search)) {
        $current_folder = $default_note_folder;
    }
    
    return '<script>
    window.isSearchMode = ' . ((!empty($search) || !empty($tags_search)) ? 'true' : 'false') . ';
    window.currentNoteFolder = ' . ($current_folder ? json_encode($current_folder) : 'null') . ';
    window.selectedWorkspace = ' . json_encode($workspace_filter) . ';
    </script>';
}

// Generate a simple button
function generateButton($class, $onclick, $title, $icon, $text = '') {
    $html = '<div class="' . htmlspecialchars($class) . '" onclick="' . htmlspecialchars($onclick) . ';">';
    $html .= '<span><span title="' . htmlspecialchars($title) . '" class="' . htmlspecialchars($icon) . '"></span></span>';
    if ($text) {
        $html .= '<span>' . htmlspecialchars($text) . '</span>';
    }
    $html .= '</div>';
    return $html;
}

// Generate a menu item
function generateMenuItem($onclick, $icon, $text, $additional_info = '') {
    return '<div class="settings-menu-item" onclick="' . htmlspecialchars($onclick) . ';">
        <i class="' . htmlspecialchars($icon) . '"></i>
        <span>' . htmlspecialchars($text) . $additional_info . '</span>
    </div>';
}

// Generate unified search form
function generateSearchForm($is_mobile, $search, $tags_search, $workspace_filter, $using_unified_search, $preserve_notes, $preserve_tags) {
    $form_id = $is_mobile ? 'unified-search-form-mobile' : 'unified-search-form';
    $search_id = $is_mobile ? 'unified-search-mobile' : 'unified-search';
    $container_class = $is_mobile ? 'unified-search-container mobile' : 'unified-search-container';
    
    $search_value = htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES);
    $clear_button = '';
    if (!empty($search) || !empty($tags_search)) {
        $clear_button = '<button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="fas fa-times-circle"></span></button>';
    }
    
    // Search type buttons
    $pills_suffix = $is_mobile ? '-mobile' : '';
    $search_pills = '
    <div class="search-type-pills">
        <button type="button" class="search-pill" id="search-notes-btn' . $pills_suffix . '" title="Search in note content" data-type="notes">
            <i class="fas fa-file-alt"></i>
            <span>Notes</span>
        </button>
        <button type="button" class="search-pill" id="search-tags-btn' . $pills_suffix . '" title="Search in one or more tags" data-type="tags">
            <i class="fas fa-tags"></i>
            <span>Tags</span>
        </button>
        <button type="button" class="search-pill" id="search-folders-btn' . $pills_suffix . '" title="Filter folders" data-type="folders">
            <i class="fas fa-folder"></i>
            <span>Folders</span>
        </button>
    </div>';
    
    // Hidden fields
    $search_in_notes_value = ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags) ? '1' : '');
    $search_in_tags_value = ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : '';
    
    return '<form id="' . $form_id . '" action="index.php" method="POST">
        <div class="' . $container_class . '">
            <div class="searchbar-row searchbar-icon-row">
                <div class="searchbar-input-wrapper">
                    <input autocomplete="off" autocapitalize="off" spellcheck="false" id="' . $search_id . '" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Search..." value="' . $search_value . '" />
                    <span class="searchbar-icon"><span class="fas fa-search"></span></span>
                    ' . $clear_button . '
                </div>
            </div>
            
            <div class="search-options-container' . ($is_mobile ? ' mobile' : '') . '">
                ' . $search_pills . '
            </div>
            
            <!-- Hidden inputs for compatibility -->
            <input type="hidden" id="search-notes-hidden' . $pills_suffix . '" name="search" value="' . htmlspecialchars($search ?? '', ENT_QUOTES) . '">
            <input type="hidden" id="search-tags-hidden' . $pills_suffix . '" name="tags_search" value="' . htmlspecialchars($tags_search ?? '', ENT_QUOTES) . '">
            <input type="hidden" name="workspace" value="' . htmlspecialchars($workspace_filter, ENT_QUOTES) . '">
            <input type="hidden" id="search-in-notes' . $pills_suffix . '" name="search_in_notes" value="' . $search_in_notes_value . '">
            <input type="hidden" id="search-in-tags' . $pills_suffix . '" name="search_in_tags" value="' . $search_in_tags_value . '">
            <input type="hidden" id="search-in-folders' . $pills_suffix . '" name="search_in_folders" value="">
        </div>
    </form>';
}
