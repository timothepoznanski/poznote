<?php
require 'auth.php';
requireAuth();

@ob_start();
include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo t_h('offline.page.title', [], 'Offline Notes'); ?> - <?php echo t_h('app.name'); ?></title>
	<script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
	<meta name="color-scheme" content="dark light">
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
	<script src="js/offline-notes.js"></script>
</head>
<body class="shared-page offline-page">
	<div class="shared-container">
		<h2 class="shared-header">
			<?php echo t_h('offline.page.title', [], 'Offline Notes'); ?>
		</h2>
		
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
		</div>
		
		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input 
					type="text" 
					id="filterInput" 
					class="filter-input" 
					placeholder="<?php echo t_h('offline.page.filter_placeholder', [], 'Filter by title...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn" style="display: none;">
					<i class="fa-times"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats"></div>
		</div>
		
		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="fa-spinner fa-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="offlineNotesContainer"></div>
			<div id="emptyMessage" class="empty-message" style="display: none;">
		<i class="fa-plane"></i>
		<p><?php echo t_h('offline.page.no_offline_notes', [], 'No offline notes yet.'); ?></p>
				<p class="empty-hint"><?php echo t_h('offline.page.offline_hint', [], 'Make a note available offline by clicking the download button in the note toolbar.'); ?></p>
			</div>
		</div>
	</div>
	
	<script>
	const workspace = <?php echo json_encode($pageWorkspace); ?>;
	let offlineNotes = [];
	let filteredNotes = [];
	let filterText = '';
	
	// Load offline notes on page load
	document.addEventListener('DOMContentLoaded', function() {
		// Attach event listener to back button
		document.getElementById('backToNotesBtn').addEventListener('click', goBackToNotes);
		
		// Attach filter event listeners
		const filterInput = document.getElementById('filterInput');
		const clearFilterBtn = document.getElementById('clearFilterBtn');
		
		// Check for initial filter from URL
		const urlParams = new URLSearchParams(window.location.search);
		const initialFilter = urlParams.get('filter');
		if (initialFilter) {
			filterInput.value = initialFilter;
			filterText = initialFilter.trim().toLowerCase();
			updateClearButton();
		}
		
		filterInput.addEventListener('input', function() {
			filterText = this.value.trim().toLowerCase();
			applyFilter();
			updateClearButton();
		});
		
		clearFilterBtn.addEventListener('click', function() {
			filterInput.value = '';
			filterText = '';
			applyFilter();
			updateClearButton();
			filterInput.focus();
		});
		
		// Clear filter on Escape key
		filterInput.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				filterInput.value = '';
				filterText = '';
				applyFilter();
				updateClearButton();
			}
		});
		
		// Load offline notes after setting up event listeners
		loadOfflineNotes();
	});
	
	function updateClearButton() {
		const clearBtn = document.getElementById('clearFilterBtn');
		clearBtn.style.display = filterText ? 'flex' : 'none';
	}
	
	function applyFilter() {
		if (!filterText) {
			filteredNotes = [...offlineNotes];
		} else {
			filteredNotes = offlineNotes.filter(note => {
				const title = (note.title || '').toLowerCase();
				const tags = (note.tags || '').toLowerCase();
				const folder = (note.folder || '').toLowerCase();
				return title.includes(filterText) || tags.includes(filterText) || folder.includes(filterText);
			});
		}
		renderOfflineNotes();
		updateFilterStats();
	}
	
	function updateFilterStats() {
		const statsDiv = document.getElementById('filterStats');
		if (filterText && filteredNotes.length < offlineNotes.length) {
			statsDiv.textContent = `${filteredNotes.length} / ${offlineNotes.length}`;
			statsDiv.style.display = 'block';
		} else {
			statsDiv.style.display = 'none';
		}
	}
	
	function goBackToNotes() {
		const params = new URLSearchParams();
		if (workspace) {
			params.append('workspace', workspace);
		}
		window.location.href = 'index.php' + (params.toString() ? '?' + params.toString() : '');
	}
	
	async function loadOfflineNotes() {
		const spinner = document.getElementById('loadingSpinner');
		const container = document.getElementById('offlineNotesContainer');
		const emptyMessage = document.getElementById('emptyMessage');
		
		spinner.style.display = 'block';
		container.innerHTML = '';
		emptyMessage.style.display = 'none';
		
		try {
			// Get all offline notes from IndexedDB
			if (window.OfflineNotesManager) {
				offlineNotes = await window.OfflineNotesManager.getAllOfflineNotes();
				
				// Sort by timestamp (most recent first)
				offlineNotes.sort((a, b) => b.timestamp - a.timestamp);
			} else {
				throw new Error('Offline Notes Manager not loaded');
			}
			
			spinner.style.display = 'none';
			
			if (offlineNotes.length === 0) {
				emptyMessage.style.display = 'block';
				return;
			}
			
			// Apply current filter
			applyFilter();
		} catch (error) {
			spinner.style.display = 'none';
			container.innerHTML = '<div class="error-message"><i class="fa-exclamation-triangle"></i> <?php echo t_h('common.error', [], 'Error'); ?>: ' + error.message + '</div>';
		}
	}
	
	function renderOfflineNotes() {
		const container = document.getElementById('offlineNotesContainer');
		const emptyMessage = document.getElementById('emptyMessage');
		
		container.innerHTML = '';
		
		// Show empty message if no notes match the filter
		if (filteredNotes.length === 0) {
			if (filterText) {
				// No results for filter
				const noResultsDiv = document.createElement('div');
				noResultsDiv.className = 'empty-message';
				noResultsDiv.innerHTML = '<p><?php echo t_h('offline.page.no_filter_results', [], 'No notes match your search.'); ?></p>';
				container.appendChild(noResultsDiv);
			} else {
				emptyMessage.style.display = 'block';
			}
			return;
		}
		
		emptyMessage.style.display = 'none';
		
		const list = document.createElement('div');
		list.className = 'shared-notes-list offline-notes-list';
		
		filteredNotes.forEach(note => {
			const item = document.createElement('div');
			item.className = 'shared-note-item offline-note-item';
			item.dataset.noteId = note.id;
			
			// Note info container
			const infoContainer = document.createElement('div');
			infoContainer.className = 'offline-note-info';
			
			// Note name (clickable)
			const noteLink = document.createElement('a');
			noteLink.href = 'index.php?note=' + note.id + (workspace ? '&workspace=' + encodeURIComponent(workspace) : '');
			noteLink.textContent = note.title || '<?php echo t_h('common.untitled', [], 'Untitled'); ?>';
			noteLink.className = 'note-name';
			infoContainer.appendChild(noteLink);
			
			// Note metadata
			const metaDiv = document.createElement('div');
			metaDiv.className = 'offline-note-meta';
			
			// Folder
			if (note.folder) {
				const folderSpan = document.createElement('span');
				folderSpan.className = 'note-folder';
				folderSpan.innerHTML = '<i class="fa-folder"></i> ' + note.folder;
				metaDiv.appendChild(folderSpan);
			}
			
			// Tags
			if (note.tags) {
				const tagsSpan = document.createElement('span');
				tagsSpan.className = 'note-tags';
				tagsSpan.innerHTML = '<i class="fa-tags"></i> ' + note.tags;
				metaDiv.appendChild(tagsSpan);
			}
			
			infoContainer.appendChild(metaDiv);
			item.appendChild(infoContainer);
			
			// Actions
			const actionsDiv = document.createElement('div');
			actionsDiv.className = 'note-actions';
			
			// Remove from offline button
			const removeBtn = document.createElement('button');
			removeBtn.className = 'btn btn-sm btn-danger';
			removeBtn.innerHTML = '<i class="fa-trash"></i>';
			removeBtn.title = '<?php echo t_h('offline.page.remove_offline', [], 'Remove from offline'); ?>';
			removeBtn.onclick = () => removeFromOffline(note.id);
			
			actionsDiv.appendChild(removeBtn);
			item.appendChild(actionsDiv);
			
			list.appendChild(item);
		});
		
		container.appendChild(list);
	}
	
	function formatDate(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now - date;
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		
		if (diffDays === 0) {
			const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
			if (diffHours === 0) {
				const diffMinutes = Math.floor(diffMs / (1000 * 60));
				if (diffMinutes === 0) {
					return '<?php echo t_h('offline.page.just_now', [], 'Just now'); ?>';
				}
				return diffMinutes + ' <?php echo t_h('offline.page.minutes_ago', [], 'min ago'); ?>';
			}
			return diffHours + ' <?php echo t_h('offline.page.hours_ago', [], 'h ago'); ?>';
		} else if (diffDays === 1) {
			return '<?php echo t_h('common.date.yesterday', [], 'Yesterday'); ?>';
		} else if (diffDays < 7) {
			return diffDays + ' <?php echo t_h('common.date.days_ago', [], 'days ago'); ?>';
		} else {
			return date.toLocaleDateString();
		}
	}
	
	function showNoteContent(note) {
		const modal = document.createElement('div');
		modal.id = 'contentModal';
		modal.className = 'modal';
		modal.style.display = 'flex';
		
		const content = document.createElement('div');
		content.className = 'modal-content';
		content.style.maxWidth = '800px';
		content.style.width = '90%';
		content.style.maxHeight = '80vh';
		
		const header = document.createElement('div');
		header.className = 'modal-header';
		const h3 = document.createElement('h3');
		h3.textContent = note.title || '<?php echo t_h('common.untitled', [], 'Untitled'); ?>';
		h3.style.marginBottom = '10px';
		header.appendChild(h3);
		
		// Meta info
		const metaInfo = document.createElement('div');
		metaInfo.style.fontSize = '13px';
		metaInfo.style.color = '#666';
		metaInfo.style.marginBottom = '10px';
		let metaText = '';
		if (note.folder) metaText += '📁 ' + note.folder + ' • ';
		if (note.tags) metaText += '🏷️ ' + note.tags + ' • ';
		metaText += '🕒 ' + formatDate(note.timestamp);
		metaInfo.textContent = metaText;
		header.appendChild(metaInfo);
		
		content.appendChild(header);
		
		const body = document.createElement('div');
		body.className = 'modal-body';
		body.style.overflow = 'auto';
		body.style.maxHeight = 'calc(80vh - 150px)';
		
		// Display content
		const contentDiv = document.createElement('div');
		contentDiv.className = 'offline-note-content-display';
		contentDiv.style.padding = '15px';
		contentDiv.style.backgroundColor = 'var(--bg-secondary, #f5f5f5)';
		contentDiv.style.borderRadius = '8px';
		contentDiv.style.minHeight = '200px';
		
		if (note.noteType === 'markdown' && note.markdownContent) {
			// Display markdown content as plain text for now
			const pre = document.createElement('pre');
			pre.style.whiteSpace = 'pre-wrap';
			pre.style.fontFamily = 'monospace';
			pre.textContent = note.markdownContent;
			contentDiv.appendChild(pre);
		} else if (note.noteType === 'tasklist' && note.tasklistData) {
			// Display tasklist as JSON for now
			const pre = document.createElement('pre');
			pre.style.whiteSpace = 'pre-wrap';
			pre.style.fontFamily = 'monospace';
			pre.textContent = JSON.stringify(note.tasklistData, null, 2);
			contentDiv.appendChild(pre);
		} else {
			// Display HTML content
			contentDiv.innerHTML = note.content || '<em><?php echo t_h('offline.page.no_content', [], 'No content'); ?></em>';
		}
		
		body.appendChild(contentDiv);
		content.appendChild(body);
		
		const footer = document.createElement('div');
		footer.className = 'modal-footer';
		
		const closeBtn = document.createElement('button');
		closeBtn.className = 'btn btn-secondary';
		closeBtn.textContent = '<?php echo t_h('common.close', [], 'Close'); ?>';
		closeBtn.onclick = () => {
			document.body.removeChild(modal);
		};
		
		footer.appendChild(closeBtn);
		content.appendChild(footer);
		
		modal.appendChild(content);
		document.body.appendChild(modal);
		
		// Close on background click
		modal.onclick = (e) => {
			if (e.target === modal) {
				document.body.removeChild(modal);
			}
		};
		
		// Close on Escape key
		const escHandler = (e) => {
			if (e.key === 'Escape') {
				document.body.removeChild(modal);
				document.removeEventListener('keydown', escHandler);
			}
		};
		document.addEventListener('keydown', escHandler);
	}
	
	async function removeFromOffline(noteId) {
		if (!confirm('<?php echo t_h('offline.page.confirm_remove', [], 'Remove this note from offline storage?'); ?>')) {
			return;
		}
		
		try {
			if (window.OfflineNotesManager) {
				await window.OfflineNotesManager.removeNoteOffline(noteId);
				
				// Remove from arrays
				offlineNotes = offlineNotes.filter(note => note.id !== noteId);
				
				// Reapply filter
				applyFilter();
				
				// Show empty message if no more offline notes
				if (offlineNotes.length === 0) {
					document.getElementById('offlineNotesContainer').innerHTML = '';
					document.getElementById('emptyMessage').style.display = 'block';
				}
			}
		} catch (error) {
			alert('<?php echo t_h('common.error', [], 'Error'); ?>: ' + error.message);
		}
	}
	</script>
	
	<style>
	.offline-note-info {
		flex: 1;
		min-width: 0;
	}
	
	.offline-note-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 8px;
		font-size: 13px;
		color: #666;
	}
	
	.note-type-badge {
		display: inline-block;
		padding: 2px 8px;
		background: #007DB8;
		color: white;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
	}
	
	.note-folder,
	.note-tags,
	.note-date {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	
	.note-folder i,
	.note-tags i,
	.note-date i {
		opacity: 0.7;
	}
	
	.offline-note-content-display {
		word-wrap: break-word;
		overflow-wrap: break-word;
	}
	
	.offline-note-content-display img {
		max-width: 100%;
		height: auto;
	}
	
	[data-theme="dark"] .offline-note-meta {
		color: #aaa;
	}
	
	[data-theme="dark"] .offline-note-content-display {
		background-color: #2a2a2a !important;
	}
	
	@media (max-width: 768px) {
		.offline-note-meta {
			font-size: 12px;
			gap: 8px;
		}
		
		.note-type-badge {
			font-size: 10px;
		}
	}
	</style>
</body>
</html>
