<?php
/**
 * Renders the currently opened note in the right column: edit toolbar,
 * tags/folder row, attachments and the note content itself.
 *
 * Included by index.php inside #right_col; shares its variable scope
 * ($con, $res_right, $settings, $workspace_filter, search variables...).
 * Populates $tasklist_ids and $markdown_ids consumed by the init scripts.
 */

            // Array to collect tasklist and markdown IDs for initialization
            $tasklist_ids = [];
            $markdown_ids = [];
                        
            // Check if we should display a note or nothing
            if ($res_right) {
                // Prepare per-note lookups once, outside the display loop
                $stmt_shared = null;
                try {
                    $stmt_shared = $con->prepare('SELECT 1 FROM shared_notes WHERE note_id = ? AND access_mode IS NOT NULL LIMIT 1');
                } catch (Exception $e) {
                    error_log('note_display: failed to prepare shared_notes lookup: ' . $e->getMessage());
                }
                $checkExistingLink = $con->prepare("SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0 LIMIT 1");

                while($row = $res_right->fetch(PDO::FETCH_ASSOC))
                {
                    if (!$isPublicWorkspaceReadonly && function_exists('ensureAutomaticSnapshotForOpenedNote')) {
                        ensureAutomaticSnapshotForOpenedNote($con, (int)$row['id']);
                    }

                    // Check if note is shared
                    $is_shared = false;
                    if ($stmt_shared) {
                        try {
                            $stmt_shared->execute([$row['id']]);
                            $is_shared = $stmt_shared->fetchColumn() !== false;
                        } catch (Exception $e) {
                            error_log('note_display: shared_notes lookup failed for note ' . $row['id'] . ': ' . $e->getMessage());
                        }
                    }

                    // Decode the attachments JSON once for the whole rendering pass
                    $attachments_data = null;
                    if (!empty($row['attachments'])) {
                        $decoded_attachments = json_decode($row['attachments'], true);
                        if (is_array($decoded_attachments)) {
                            $attachments_data = $decoded_attachments;
                        }
                    }
                    // Check if note is shared for CSS class
                    $share_class = $is_shared ? ' is-shared' : '';
                
                    $note_type = $row['type'] ?? 'note';
                    
                    $filename = getEntryFilename($row["id"], $note_type);
                    $title = $row['heading'];
                    // Ensure we have a safe JSON-encoded title for JavaScript
                    $title_safe = $title ?? 'Note';
                    $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    if ($title_json === false) $title_json = '"Note"';
                    
                    if ($note_type === 'tasklist') {
                        // Prefer the first valid JSON representation between file storage and DB.
                        $fileContent = is_readable($filename) ? file_get_contents($filename) : '';
                        if ($fileContent === false) {
                            $fileContent = '';
                        }
                        $entryfinal = resolveTasklistStoredContent($fileContent, $row['entry'] ?? '');
                        $tasklist_json = htmlspecialchars($entryfinal, ENT_QUOTES);
                    } else {
                        // For all other notes (including Excalidraw), prefer the HTML file content
                        if (is_readable($filename)) {
                            $entryfinal = file_get_contents($filename);
                        } else {
                            $entryfinal = $row['entry'] ?? '';
                        }
                        $tasklist_json = '';
                    }
               
                    // Note display
                    $markdown_attr = ($note_type === 'markdown') ? ' data-markdown-note="true"' : '';
                    $tasklist_attr = ($note_type === 'tasklist') ? ' data-tasklist-note="true"' : '';
                    echo '<div id="note'.$row['id'].'" class="notecard">';
                    echo '<div class="innernote"'.$markdown_attr.$tasklist_attr.'>';
                    echo '<div class="note-header">';
                    echo '<div class="note-edit-toolbar">';
                    
                    // Back/Forward navigation buttons (desktop only)
                    echo '<button type="button" id="note-history-back" class="toolbar-btn btn-history-nav btn-history-back history-disabled" title="' . t_h('editor.toolbar.go_back', [], 'Go back') . '" disabled><i class="lucide lucide-circle-chevron-left"></i></button>';
                    
                    // Build home URL with search preservation
                    $home_url = 'index.php';
                    $home_params = [];
                    if (!empty($search)) {
                        $home_params[] = 'search=' . urlencode($search);
                        $home_params[] = 'preserve_notes=1';
                    }
                    if (!empty($tags_search)) {
                        $home_params[] = 'tags_search=' . urlencode($tags_search);
                        $home_params[] = 'preserve_tags=1';
                    }
                    if (!empty($created_from)) {
                        $home_params[] = 'created_from=' . urlencode($created_from);
                    }
                    if (!empty($created_to)) {
                        $home_params[] = 'created_to=' . urlencode($created_to);
                    }
                    if (!empty($folder_filter)) {
                        $home_params[] = 'folder=' . urlencode($folder_filter);
                    }
                    if ($search_combined) {
                        $home_params[] = 'search_combined=1';
                    }

                    // Always preserve workspace parameter 
                    if (!empty($workspace_filter)) {
                        $home_params[] = 'workspace=' . urlencode($workspace_filter);
                    }
                    if (!empty($home_params)) {
                        $home_url .= '?' . implode('&', $home_params);
                    }
                
                    // Home button (mobile only)
                    echo '<button type="button" class="toolbar-btn btn-home mobile-home-btn" title="' . t_h('editor.toolbar.back_to_notes') . '" data-action="scroll-to-left-column"><i class="lucide lucide-home"></i></button>';
                    
                    if (!$isPublicWorkspaceReadonly) {
                        // Text formatting buttons (save button removed - auto-save is now automatic)
                        echo '<button type="button" class="toolbar-btn btn-bold text-format-btn" title="' . t_h('editor.toolbar.bold') . '" data-action="exec-bold"><i class="lucide lucide-bold"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-italic text-format-btn" title="' . t_h('editor.toolbar.italic') . '" data-action="exec-italic"><i class="lucide lucide-italic"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-underline text-format-btn" title="' . t_h('editor.toolbar.underline') . '" data-action="exec-underline"><i class="lucide lucide-underline"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-strikethrough text-format-btn" title="' . t_h('editor.toolbar.strikethrough') . '" data-action="exec-strikethrough"><i class="lucide lucide-strikethrough"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-link text-format-btn" title="' . t_h('editor.toolbar.link') . '" data-action="add-link"><i class="lucide lucide-link"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-color text-format-btn" title="' . t_h('editor.toolbar.text_color') . '" data-action="toggle-red-color"><i class="lucide lucide-palette"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-highlight text-format-btn" title="' . t_h('editor.toolbar.highlight') . '" data-action="toggle-yellow-highlight"><i class="lucide lucide-paintbrush"></i></button>';
                        if ($note_type !== 'markdown') {
                            echo '<button type="button" class="toolbar-btn btn-list-ul text-format-btn" title="' . t_h('editor.toolbar.bullet_list') . '" data-action="exec-unordered-list"><i class="lucide lucide-list-ul"></i></button>';
                            echo '<button type="button" class="toolbar-btn btn-list-ol text-format-btn" title="' . t_h('editor.toolbar.numbered_list') . '" data-action="exec-ordered-list"><i class="lucide lucide-list-ol"></i></button>';
                        }
                        echo '<button type="button" class="toolbar-btn btn-text-height text-format-btn" title="' . t_h('slash_menu.title', [], 'Title') . '" data-action="change-font-size"><i class="lucide lucide-type-height"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-code text-format-btn" title="' . t_h('editor.toolbar.code_block') . '" data-action="toggle-code-block"><i class="lucide lucide-code"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-inline-code text-format-btn" title="' . t_h('editor.toolbar.inline_code') . '" data-action="toggle-inline-code"><i class="lucide lucide-terminal"></i></button>';
                        if ($note_type !== 'markdown') {
                            echo '<button type="button" class="toolbar-btn btn-eraser text-format-btn" title="' . t_h('editor.toolbar.clear_formatting') . '" data-action="exec-remove-format"><i class="lucide lucide-eraser"></i></button>';
                        }

                        if ($note_type === 'tasklist') {
                            echo '<div class="tasklist-actions-dropdown">';
                            echo '<button type="button" class="toolbar-btn btn-tasklist-actions note-action-btn" title="' . t_h('tasklist.actions', [], 'Task list actions') . '" data-action="toggle-tasklist-actions" data-note-id="' . $row['id'] . '" aria-haspopup="true" aria-expanded="false"><i class="lucide lucide-check-square"></i></button>';
                            echo '<div id="tasklist-actions-menu-' . $row['id'] . '" class="dropdown-menu tasklist-actions-menu" hidden>';
                            echo '<button type="button" class="dropdown-item" data-action="clear-completed-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-trash"></i> ' . t_h('tasklist.clear_completed', [], 'Clear completed tasks') . '</button>';
                            echo '<button type="button" class="dropdown-item" data-action="uncheck-all-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-square"></i> ' . t_h('tasklist.uncheck_all', [], 'Uncheck all tasks') . '</button>';
                            echo '</div>';
                            echo '</div>';
                        }

                        echo '<button type="button" class="toolbar-btn btn-checklist note-action-btn" title="' . t_h('editor.toolbar.insert_checklist') . '" data-action="insert-checklist"><i class="lucide lucide-list-check"></i></button>';
                    }

                
                    // Favorite / Share / Attachment buttons
                    // Calculate visible attachments count (excluding inline images that are already visible in the note)
                    $attachments_count = 0;
                    $visible_attachments_count = 0;
                    if ($attachments_data !== null) {
                        $attachments_count = count($attachments_data);
                        $visible_attachments_count = poznoteCountDisplayableAttachments($attachments_data, $row['entry'] ?? '');
                    }
                
                    $is_favorite = intval($row['favorite'] ?? 0);
                    $favorite_class = $is_favorite ? ' is-favorite' : '';
                    $favorite_title = $is_favorite
                        ? t_h('index.toolbar.favorite_remove', [], 'Remove from favorites')
                        : t_h('index.toolbar.favorite_add', [], 'Add to favorites');

                    if (!$isPublicWorkspaceReadonly) {
                        echo '<button type="button" class="toolbar-btn btn-favorite note-action-btn'.$favorite_class.'" title="'.$favorite_title.'" data-action="toggle-favorite" data-note-id="'.$row['id'].'"><i class="lucide lucide-star"></i></button>';
                    }

                    if (!$isPublicWorkspaceReadonly) {
                        echo '<button type="button" class="toolbar-btn btn-share note-action-btn'.$share_class.'" title="'.t_h('index.toolbar.share_note', [], 'Share note').'" data-action="open-share-modal" data-note-id="'.$row['id'].'"><i class="lucide lucide-share-2"></i></button>';
                    }
                    
                    $attachment_indicator_class = ($visible_attachments_count > 0) ? ' has-attachments' : '';
                    echo '<button type="button" class="toolbar-btn btn-attachment note-action-btn'.$attachment_indicator_class.'" title="'.t_h('index.toolbar.attachments_with_count', ['count' => $visible_attachments_count], 'Attachments ({{count}})').'" data-action="show-attachment-dialog" data-note-id="'.$row['id'].'"><i class="lucide lucide-paperclip"></i></button>';
                    
                    // Reminder button
                    $has_reminder = !empty($row['reminder_at']);
                    $reminder_class = $has_reminder ? ' has-reminder' : '';
                    if (!$isPublicWorkspaceReadonly) {
                        echo '<button type="button" class="toolbar-btn btn-reminder note-action-btn'.$reminder_class.'" title="'.t_h('reminder.toolbar_button', [], 'Set reminder').'" data-action="open-reminder-modal" data-note-id="'.$row['id'].'" data-reminder-at="'.htmlspecialchars($row['reminder_at'] ?? '', ENT_QUOTES).'"><i class="lucide lucide-bell"></i></button>';
                    }
                    
                    // Open in new tab button
                    echo '<button type="button" class="toolbar-btn btn-open-new-tab note-action-btn" title="'.t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab').'" data-action="open-note-new-tab" data-note-id="'.$row['id'].'"><i class="lucide lucide-external-link"></i></button>';

                    // Check if this note already has a linked note (for toolbar + mobile menu)
                    $hasLinkedNote = false;
                    if ($note_type !== 'linked') {
                        $checkExistingLink->execute([$row['id']]);
                        $hasLinkedNote = (bool)$checkExistingLink->fetch();
                    }
                        
                    // Generate dates safely for JavaScript with robust encoding
                    $created_raw = $row['created'] ?? '';
                    $updated_raw = $row['updated'] ?? '';
                    
                    // Clean and validate dates
                    $created_clean = trim($created_raw);
                    $updated_clean = trim($updated_raw);
                    
                    // Convert UTC timestamps to user's timezone
                    $final_created = convertUtcToUserTimezone($created_clean);
                    $final_updated = convertUtcToUserTimezone($updated_clean);
                    
                    // Fallback to current time if conversion failed
                    if (empty($final_created)) $final_created = convertUtcToUserTimezone(gmdate('Y-m-d H:i:s'));
                    if (empty($final_updated)) $final_updated = convertUtcToUserTimezone(gmdate('Y-m-d H:i:s'));
                    
                    // Encode with ALL safety flags to handle emojis and special characters
                    $created_json = json_encode($final_created, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $updated_json = json_encode($final_updated, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    
                    // Final safety check
                    if ($created_json === false) $created_json = '"' . date('Y-m-d H:i:s') . '"';
                    if ($updated_json === false) $updated_json = '"' . date('Y-m-d H:i:s') . '"';
                    
                    // Escape quotes for HTML attributes to prevent onclick corruption
                    $created_json_escaped = htmlspecialchars($created_json, ENT_QUOTES);
                    $updated_json_escaped = htmlspecialchars($updated_json, ENT_QUOTES);
                    
                    // Prepare additional data for note info
                    $folder_name = $row['folder'] ?? t('modals.folder.no_folder', [], 'No folder');
                    // Get the complete folder path including parents
                    $folder_id = $row['folder_id'] ?? null;
                    $folder_path = $folder_id ? getFolderPath($folder_id, $con) : $folder_name;
                    $tags_data = $row['tags'] ?? '';
                    
                    // Encode additional data safely for JavaScript
                    $folder_json = json_encode($folder_name, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $favorite_json = json_encode($is_favorite, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $tags_json = json_encode($tags_data, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $attachments_count_json = json_encode($attachments_count, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    
                    // Safety checks
                    if ($folder_json === false) $folder_json = 'null';
                    if ($favorite_json === false) $favorite_json = '0';
                    if ($tags_json === false) $tags_json = '""';
                    if ($attachments_count_json === false) $attachments_count_json = '0';
                    
                    // Escape for HTML attributes
                    $folder_json_escaped = htmlspecialchars($folder_json, ENT_QUOTES);
                    $favorite_json_escaped = htmlspecialchars($favorite_json, ENT_QUOTES);
                    $tags_json_escaped = htmlspecialchars($tags_json, ENT_QUOTES);
                    $attachments_count_json_escaped = htmlspecialchars($attachments_count_json, ENT_QUOTES);
                    
                    if (!$isPublicWorkspaceReadonly) {
                        echo '<button type="button" class="toolbar-btn btn-duplicate note-action-btn" data-action="duplicate-note" data-note-id="'.$row['id'].'" title="'.t_h('common.duplicate', [], 'Duplicate').'"><i class="lucide lucide-copy"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-move note-action-btn" data-action="show-move-folder-dialog" data-note-id="'.$row['id'].'" title="'.t_h('common.move', [], 'Move').'"><i class="lucide lucide-folder-output"></i></button>';

                        if ($note_type !== 'linked' && !$hasLinkedNote) {
                            echo '<button type="button" class="toolbar-btn btn-create-linked-note note-action-btn" title="' . t_h('editor.toolbar.create_linked_note') . '" data-action="create-linked-note"><i class="lucide lucide-link"></i></button>';
                        }
                    }
                    
                    // Download button
                    echo '<button type="button" class="toolbar-btn btn-download note-action-btn" title="'.t_h('common.download', [], 'Download').'" data-action="show-export-modal" data-note-id="'.$row['id'].'" data-filename="'.htmlspecialchars($filename, ENT_QUOTES).'" data-title="'.htmlspecialchars($title_safe, ENT_QUOTES).'" data-note-type="'.$note_type.'"><i class="lucide lucide-download"></i></button>';

                    if (!$isPublicWorkspaceReadonly) {
                        if ($note_type === 'markdown') {
                            echo '<button type="button" class="toolbar-btn btn-convert note-action-btn" data-action="show-convert-modal" data-note-id="'.$row['id'].'" data-convert-to="html" title="'.t_h('index.toolbar.convert_to_html', [], 'Convert to HTML').'"><i class="lucide lucide-refresh-cw-alt"></i></button>';
                        } elseif ($note_type === 'note') {
                            echo '<button type="button" class="toolbar-btn btn-convert note-action-btn" data-action="show-convert-modal" data-note-id="'.$row['id'].'" data-convert-to="markdown" title="'.t_h('index.toolbar.convert_to_markdown', [], 'Convert to Markdown').'"><i class="lucide lucide-refresh-cw-alt"></i></button>';
                        }
                    }

                    if ($note_type === 'note' || $note_type === 'markdown') {
                        echo '<button type="button" class="toolbar-btn btn-search-replace note-action-btn" title="' . t_h('editor.toolbar.search_replace', [], 'Search and replace') . '" data-action="open-search-replace-modal" data-note-id="'.$row['id'].'"><i class="lucide lucide-search"></i></button>';
                    }

                    if (!$isPublicWorkspaceReadonly) {
                        echo '<button type="button" class="toolbar-btn btn-snapshot note-action-btn desktop-only" data-action="show-snapshot" data-note-id="'.$row['id'].'" title="'.t_h('snapshot.menu_item', [], 'Snapshots').'"><i class="lucide lucide-history"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-trash note-action-btn" data-action="delete-note" data-note-id="'.$row['id'].'" title="'.t_h('common.delete', [], 'Delete').'"><i class="lucide lucide-trash-2"></i></button>';
                    }
                    
                    // Forward navigation button (desktop only)
                    echo '<button type="button" id="note-history-forward" class="toolbar-btn btn-history-nav btn-history-forward history-disabled" title="' . t_h('editor.toolbar.go_forward', [], 'Go forward') . '" disabled><i class="lucide lucide-circle-chevron-right"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-info note-action-btn" title="'.t_h('common.information', [], 'Information').'" data-action="show-note-info" data-note-id="'.$row['id'].'" data-created="'.htmlspecialchars($final_created, ENT_QUOTES).'" data-updated="'.htmlspecialchars($final_updated, ENT_QUOTES).'" data-folder="'.htmlspecialchars($folder_name, ENT_QUOTES).'" data-favorite="'.$is_favorite.'" data-tags="'.htmlspecialchars($tags_data, ENT_QUOTES).'" data-attachments-count="'.$attachments_count.'"><i class="lucide lucide-info-circle"></i></button>';
                
                    // Overflow menu button (3 dots - shown on both mobile and desktop)
                    // Marked as note-action-btn so it can be hidden during text selection (hide-on-selection)
                    echo '<div class="toolbar-menu-anchor">';
                    echo '<button type="button" class="toolbar-btn mobile-more-btn note-action-btn" title="'.t_h('common.menu', [], 'Menu').'" data-action="toggle-mobile-toolbar-menu" aria-haspopup="true" aria-expanded="false"><i class="lucide lucide-more-vertical"></i></button>';

                    // Dropdown menu (actions moved here - visible on both mobile and desktop)
                    echo '<div class="dropdown-menu mobile-toolbar-menu" hidden role="menu" aria-label="'.t_h('index.toolbar.menu_actions', [], 'Menu actions').'">';

                    if ($note_type === 'markdown') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="open-markdown-syntax"><i class="lucide lucide-book-open"></i> '.t_h('markdown_syntax.menu_item', [], 'Markdown syntax').'</button>';
                    }

                    // Search and replace button (only for note and markdown types, shown in mobile menu)
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-search-replace"><i class="lucide lucide-search"></i> '.t_h('editor.toolbar.search_replace', [], 'Search and replace').'</button>';
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="insert-audio-file"><i class="lucide lucide-mic"></i> '.t_h('slash_menu.audio', [], 'Audio').'</button>';
                    }

                    // Task list actions (only for tasklist notes, shown in mobile menu)
                    if ($note_type === 'tasklist') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="clear-completed-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-check-square"></i> '.t_h('tasklist.clear_completed', [], 'Clear completed tasks').'</button>';
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="uncheck-all-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-square"></i> '.t_h('tasklist.uncheck_all', [], 'Uncheck all tasks').'</button>';
                    }
                    
                    if ($note_type !== 'linked' && !$hasLinkedNote) {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-create-linked-note"><i class="lucide lucide-link"></i> '.t_h('editor.toolbar.create_linked_note').'</button>';
                    }

                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-duplicate"><i class="lucide lucide-copy"></i> '.t_h('common.duplicate', [], 'Duplicate').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-move"><i class="lucide lucide-folder-output"></i> '.t_h('common.move', [], 'Move').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-download"><i class="lucide lucide-download"></i> '.t_h('common.download', [], 'Download').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="print-note" data-note-id="'.$row['id'].'" data-note-type="'.$note_type.'"><i class="lucide lucide-printer"></i> '.t_h('common.print', [], 'Print').'</button>';

                    // Convert button (only for markdown and note types, with appropriate icon)
                    if ($note_type === 'markdown') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-convert"><i class="lucide lucide-refresh-cw-alt"></i> '.t_h('index.toolbar.convert_to_html', [], 'Convert to HTML').'</button>';
                    } elseif ($note_type === 'note') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-convert"><i class="lucide lucide-refresh-cw-alt"></i> '.t_h('index.toolbar.convert_to_markdown', [], 'Convert to Markdown').'</button>';
                    }

                    if (!$isPublicWorkspaceReadonly) {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="show-snapshot" data-note-id="'.$row['id'].'"><i class="lucide lucide-history"></i> '.t_h('snapshot.menu_item', [], 'Snapshot').'</button>';
                    }
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-info"><i class="lucide lucide-info"></i> '.t_h('common.information', [], 'Information').'</button>';
                    echo '</div>';
                    echo '</div>';
                
                    echo '</div>';
                    
                    // Search and replace bar (hidden by default) - inside note-header
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        echo '<div class="search-replace-bar" id="searchReplaceBar'.$row['id'].'" style="display: none;">';
                        echo '<div class="search-replace-controls">';
                        echo '<button type="button" class="search-replace-btn search-replace-toggle-btn" id="searchToggleReplaceBtn'.$row['id'].'" title="'.t_h('search_replace.toggle_replace', [], 'Toggle replace').'" aria-expanded="false"><i class="lucide lucide-chevron-down"></i></button>';
                        echo '<div class="search-replace-input-group">';
                        echo '<input type="text" class="search-replace-input" id="searchInput'.$row['id'].'" placeholder="'.t_h('search_replace.search_placeholder', [], 'Find...').'" autocomplete="off">';
                        echo '<span class="search-replace-count" id="searchCount'.$row['id'].'"></span>';
                        echo '</div>';
                        echo '<div class="search-replace-buttons">';
                        echo '<button type="button" class="search-replace-btn search-replace-prev-btn" id="searchPrevBtn'.$row['id'].'" title="'.t_h('search_replace.previous', [], 'Previous').'"><i class="lucide lucide-chevron-left"></i></button>';
                        echo '<button type="button" class="search-replace-btn search-replace-next-btn" id="searchNextBtn'.$row['id'].'" title="'.t_h('search_replace.next', [], 'Next').'"><i class="lucide lucide-chevron-right"></i></button>';
                        echo '<button type="button" class="search-replace-btn search-replace-close-btn" id="searchCloseBtn'.$row['id'].'" title="'.t_h('search_replace.close', [], 'Close').'"><i class="lucide lucide-x"></i></button>';
                        echo '</div>';
                        echo '</div>';
                        echo '<div class="search-replace-replace-row" id="searchReplaceRow'.$row['id'].'">';
                        echo '<div class="search-replace-input-group">';
                        echo '<input type="text" class="search-replace-input" id="replaceInput'.$row['id'].'" placeholder="'.t_h('search_replace.replace_placeholder', [], 'Replace...').'" autocomplete="off">';
                        echo '</div>';
                        echo '<div class="search-replace-buttons">';
                        echo '<button type="button" class="search-replace-btn" id="replaceBtn'.$row['id'].'" title="'.t_h('search_replace.replace_one', [], 'Replace').'">'.t_h('search_replace.replace', [], 'Replace').'</button>';
                        echo '<button type="button" class="search-replace-btn" id="replaceAllBtn'.$row['id'].'" title="'.t_h('search_replace.replace_all', [], 'Replace All').'">'.t_h('search_replace.replace_all', [], 'All').'</button>';
                        echo '</div>';
                        echo '</div>';
                        echo '</div>';
                    }
                    
                    echo '</div>';
                
                    // Tags container with folder: keep a hidden input for JS but remove the visible icon/input.
                    // Keep the .note-tags-row wrapper so CSS spacing is preserved; JS will render the editable tags UI inside the .name_tags element.
                    echo '<div class="note-tags-row">';
                    echo '<div class="folder-wrapper">';
                    echo '<span class="lucide lucide-folder icon_folder cursor-pointer" data-action="show-move-folder-dialog" data-note-id="'.$row['id'].'" title="'.t_h('settings.folder.change_folder', [], 'Change folder').'"></span>';
                    $folder_path_segments = $folder_id ? getFolderPathSegments($folder_id, $con) : [];
                    if (!empty($folder_path_segments)) {
                        // Breadcrumb: each segment reveals (expands) its folder in the left folder list
                        $reveal_title = t_h('index.folder_path.reveal_in_list', [], 'Show in folder list');
                        echo '<span class="folder_name folder-breadcrumb">';
                        foreach ($folder_path_segments as $segment_index => $segment) {
                            if ($segment_index > 0) {
                                echo '<span class="folder-path-separator">/</span>';
                            }
                            echo '<span class="folder-path-segment" data-action="reveal-folder-in-tree" data-folder-id="'.(int)$segment['id'].'" title="'.$reveal_title.'">'.htmlspecialchars($segment['name'], ENT_QUOTES).'</span>';
                        }
                        echo '</span>';
                    } else {
                        echo '<span class="folder_name cursor-pointer" data-action="show-move-folder-dialog" data-note-id="'.$row['id'].'" title="'.t_h('settings.folder.change_folder', [], 'Change folder').'">'.htmlspecialchars($folder_path, ENT_QUOTES).'</span>';
                    }
                    echo '</div>';
                    
                    echo '<div class="tag-actions-dropdown">';
                    echo '<span class="lucide lucide-tag icon_tag cursor-pointer" data-action="show-tag-edit-modal" data-note-id="'.$row['id'].'" title="'.t_h('tags.manage_note_tags', [], 'Manage note tags').'"></span>';
                    echo '</div>';

                    echo '<span class="name_tags">'
                        .'<input type="hidden" id="tags'.$row['id'].'" value="'.htmlspecialchars(str_replace(',', ' ', $row['tags'] ?? ''), ENT_QUOTES).'"/>'
                    .'</span>';
                    echo '</div>';
                
                    // Build attachment links row HTML (shown only when full attachment previews are disabled).
                    $attachment_links_html = '';
                    if (!$attachment_previews_in_note_setting && !empty($attachments_data)) {
                        // Get note content to check for inline images
                        $note_content = $row['entry'] ?? '';

                        $attachment_links = [];
                        $visible_links_count = 0;
                        foreach ($attachments_data as $attachment) {
                            if (isset($attachment['id']) && isset($attachment['original_filename'])) {
                                $original_filename = (string)$attachment['original_filename'];
                                $safe_filename = htmlspecialchars($original_filename, ENT_QUOTES);

                                // Check if this is an image attachment that's displayed inline in the note content
                                // Inline images (pasted) should be hidden from the attachments list
                                $is_inline_image = false;
                                $mime_type = $attachment['mime_type'] ?? '';
                                $is_image = strpos($mime_type, 'image/') === 0;
                                // Also check extension as fallback
                                if (!$is_image && isset($attachment['original_filename'])) {
                                    $ext = strtolower(pathinfo($attachment['original_filename'], PATHINFO_EXTENSION));
                                    $is_image = in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);
                                }

                                if ($is_image) {
                                    $attachment_id_pattern = 'attachments/' . $attachment['id'];
                                    // Check in raw content
                                    $is_inline_image = (strpos($note_content, $attachment_id_pattern) !== false);

                                    // If not found, try with escaped version just in case (e.g. for some specific editors)
                                    if (!$is_inline_image) {
                                        $is_inline_image = (strpos($note_content, urlencode($attachment_id_pattern)) !== false);
                                    }
                                }

                                $link_style = $is_inline_image ? ' style="display: none;"' : '';
                                $link_attr = $is_inline_image ? ' data-is-inline-image="true"' : '';
                                $attachment_links[] = '<a href="#" class="attachment-link"' . $link_attr . $link_style . ' data-action="download-attachment" data-attachment-id="'.$attachment['id'].'" data-note-id="'.$row['id'].'" title="'.t_h('attachments.actions.download', ['filename' => $original_filename], 'Download {{filename}}').'">'.$safe_filename.'</a>';
                                if (!$is_inline_image) $visible_links_count++;
                            }
                        }
                        $row_style = ($visible_links_count === 0) ? ' style="display: none;"' : '';
                        $attachment_links_html = '<div class="note-attachments-row"' . $row_style . '>'
                            . '<button type="button" class="icon-attachment-btn" title="'.t_h('attachments.actions.open_attachments', [], 'Open attachments').'" data-action="show-attachment-dialog" data-note-id="'.$row['id'].'" aria-label="'.t_h('attachments.actions.open_attachments', [], 'Open attachments').'"><span class="lucide lucide-paperclip icon_attachment"></span></button>'
                            . '<span class="note-attachments-list">'
                            . implode(' ', $attachment_links)
                            . '</span>'
                            . '</div>';
                    }
                    if (!$attachments_at_bottom_setting) {
                        echo $attachment_links_html;
                    }
                    
                    // Hidden folder value for the note
                    echo '<input type="hidden" id="folder'.$row['id'].'" value="'.htmlspecialchars($row['folder'] ?: '', ENT_QUOTES).'"/>';
                    echo '<input type="hidden" id="folderId'.$row['id'].'" value="'.htmlspecialchars($row['folder_id'] ?: '', ENT_QUOTES).'"/>';
                    
                    // Title - disable for protected note
                    // If the heading is a localized default note title, treat it as a placeholder.
                    $heading = htmlspecialchars_decode($row['heading'] ?: 'New note');
                    $defaultMatch = matchDefaultNoteTitle($heading);
                    $isDefaultTitle = $defaultMatch !== null;
                    $titleValue = $isDefaultTitle ? '' : htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
                    if ($isDefaultTitle) {
                        $defaultNum = isset($defaultMatch['number']) && $defaultMatch['number'] !== '' ? $defaultMatch['number'] : null;
                        $titlePlaceholder = $defaultNum
                            ? t_h('index.note.new_note_numbered', ['number' => $defaultNum], 'New note ({{number}})')
                            : t_h('index.note.new_note', [], 'New note');
                    } else {
                        $titlePlaceholder = t_h('index.note.title_placeholder', [], 'Title ?');
                    }
                    $titleReadonlyAttr = $isPublicWorkspaceReadonly ? ' readonly' : '';
                    $titleNoteIcon = '';
                    if (!empty($show_note_icons_setting)) {
                        $noteIconRaw = !empty($row['icon']) ? $row['icon'] : '';
                        $noteIconColor = !empty($row['icon_color']) ? (string)$row['icon_color'] : '';
                        $titleNoteIcon = renderEditableNoteIcon($row['id'], $heading, $noteIconRaw, $noteIconColor, 'note-title-icon');
                    }
                    echo '<h4 class="note-title-heading">'.$titleNoteIcon.'<input class="css-title" autocomplete="off" autocapitalize="off" spellcheck="false" id="inp'.$row['id'].'" type="text" placeholder="'.$titlePlaceholder.'" value="'.$titleValue.'"'.$titleReadonlyAttr.'/></h4>';
                    // Subline: creation date and location (visible when enabled in settings)
                    $created_display = '';
                    if (!empty($created_clean)) {
                        $created_display = formatUtcDateTimeForDisplay($created_clean, 'd/m/Y H:i');
                    }
                    if ($created_display === '' && !empty($final_created)) {
                        $created_display = $final_created;
                    }
                
                    $has_created = !empty($created_display) && $show_note_created_setting;

                    // Show the subline if created date setting is enabled
                    if ($show_note_created_setting && $has_created) {
                        echo '<div class="note-subline">';
                        echo '<span class="note-sub-created">' . htmlspecialchars($created_display, ENT_QUOTES) . '</span>';
                        echo '</div>';
                    }
                    
                    // Note content with font size style
                    $data_attr = '';
                    
                    if ($note_type === 'tasklist') {
                        // For tasklist, properly encode JSON for HTML attribute from file content
                        $tasklist_json_raw = $entryfinal; // Use file content instead of database
                        $tasklist_json_encoded = htmlspecialchars($tasklist_json_raw, ENT_QUOTES);
                        $data_attr = ' data-tasklist-json="'.$tasklist_json_encoded.'"';
                        // Display empty content initially, will be replaced by JavaScript
                        $display_content = '';
                    }
                    
                    // For markdown notes, store the markdown content in a data attribute
                    if ($note_type === 'markdown') {
                        if ($isPublicWorkspaceReadonly) {
                            // Public workspace visitors must never receive raw scripts
                            // embedded in markdown (stored XSS against other users).
                            $entryfinal = sanitizeMarkdownContent($entryfinal);
                        }
                        $markdown_content = htmlspecialchars($entryfinal, ENT_QUOTES);
                        $data_attr .= ' data-markdown-content="'.$markdown_content.'"';
                        // Start with the raw markdown displayed
                        $display_content = htmlspecialchars($entryfinal, ENT_NOQUOTES);
                    } else {
                        // For all other notes (HTML, Excalidraw), use the file content directly
                        $display_content = $entryfinal;

                        // Unescape media tags if they were HTML-escaped in the content
                        // This allows iframes, audio, and video to render properly
                        $display_content = unescapeMediaInHtml($display_content);

                        if ($isPublicWorkspaceReadonly) {
                            // Public workspace visitors must never receive raw note HTML
                            // (stored XSS against other users of the instance). Applied
                            // after unescapeMediaInHtml so re-enabled media tags are
                            // sanitized too, matching the public_note.php policy.
                            if (!function_exists('sanitizePublicNoteHtml')) {
                                require_once __DIR__ . '/public_helpers.php';
                            }
                            $display_content = sanitizePublicNoteHtml($display_content);
                        }
                    }
                    
                    // Public workspace access keeps the standard UI but disables content editing.
                    $editable = $isPublicWorkspaceReadonly ? 'false' : 'true';
                    $entry_editable = ($note_type === 'markdown') ? 'false' : $editable;
                    $excalidraw_attr = '';

                    $placeholder_desktop = t('index.editor.placeholder_desktop', [], 'Enter text, use / to open commands menu, paste images or drag-and-drop an image at the cursor.');
                    $placeholder_mobile = t('index.editor.placeholder_mobile', [], 'Enter text or paste images here...');
                    $placeholder_attr = ' data-ph="' . htmlspecialchars($placeholder_desktop, ENT_QUOTES) . '"';
                    // On mobile, slash command is not enabled for HTML + Markdown notes
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        $placeholder_attr .= ' data-ph-mobile="' . htmlspecialchars($placeholder_mobile, ENT_QUOTES) . '"';
                    }

                    $linked_note_id_attr = '';
                    if (isset($row['linked_note_id']) && $row['linked_note_id']) {
                        $linked_note_id_attr = ' data-linked-note-id="'.$row['linked_note_id'].'"';
                    }
                    if ($attachment_previews_in_note_setting && !$attachments_at_bottom_setting) {
                        echo poznoteRenderAttachmentPreviews($row['id'], $row['attachments'] ?? '', $workspace_filter, $entryfinal ?? '');
                    }
                    $spellcheck_enabled = poznoteSettingEnabled($settings['spellcheck_html_notes'], false);
                    $spellcheck_attr = ($note_type === 'note' && $spellcheck_enabled) ? 'true' : 'false';
                    $lang_attr = ($note_type === 'note' && $spellcheck_enabled) ? ' lang="'.htmlspecialchars(getUserLanguage(), ENT_QUOTES).'"' : '';
                    echo '<div class="noteentry" autocomplete="off" autocapitalize="off" spellcheck="'.$spellcheck_attr.'"'.$lang_attr.' id="entry'.$row['id'].'" data-note-id="'.$row['id'].'" data-note-heading="'.htmlspecialchars($row['heading'] ?? '', ENT_QUOTES).'"'.$placeholder_attr.' contenteditable="'.$entry_editable.'" data-note-type="'.$note_type.'"'.$data_attr.$excalidraw_attr.$linked_note_id_attr.'>'.$display_content.'</div>';
                    if ($attachments_at_bottom_setting) {
                        if ($attachment_previews_in_note_setting) {
                            echo poznoteRenderAttachmentPreviews($row['id'], $row['attachments'] ?? '', $workspace_filter, $entryfinal ?? '');
                        } else {
                            echo $attachment_links_html;
                        }
                    }
                    echo '<div class="note-scroll-edge-controls">';
                    echo '<button type="button" class="note-scroll-edge-btn note-scroll-top-btn" data-action="scroll-note-top" data-note-id="'.$row['id'].'" title="'.t_h('common.scroll_top', [], 'Scroll to top').'" aria-label="'.t_h('common.scroll_top', [], 'Scroll to top').'" hidden><i class="lucide lucide-arrow-up"></i></button>';
                    echo '<button type="button" class="note-scroll-edge-btn note-scroll-bottom-btn" data-action="scroll-note-bottom" data-note-id="'.$row['id'].'" title="'.t_h('common.scroll_bottom', [], 'Scroll to bottom').'" aria-label="'.t_h('common.scroll_bottom', [], 'Scroll to bottom').'" hidden><i class="lucide lucide-arrow-down"></i></button>';
                    echo '</div>';
                    echo '<div class="note-bottom-space"></div>';
                    echo '</div>';
                    echo '</div>';
                    
                    // Collect tasklist and markdown IDs for later initialization
                    if ($note_type === 'tasklist') {
                        $tasklist_ids[] = $row['id'];
                    }
                    if ($note_type === 'markdown') {
                        $markdown_ids[] = $row['id'];
                    }
                }
            }
