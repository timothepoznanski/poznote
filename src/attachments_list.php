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
	<title><?php echo t_h('attachments.list.title', [], 'Notes with Attachments'); ?> - <?php echo t_h('app.name'); ?></title>
	<script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
	<meta name="color-scheme" content="dark light">
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
	<style>
		.attachment-row {
			display: flex;
			align-items: center;
			padding: 12px 0;
			border-bottom: 1px solid var(--border-color, #e0e0e0);
			gap: 20px;
		}
		.attachment-row:last-child {
			border-bottom: none;
		}
		.attachment-note-name {
			flex: 0 0 250px;
			font-weight: 500;
			color: var(--link-color, #007bff);
			text-decoration: none;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.attachment-note-name:hover {
			text-decoration: underline;
		}
		.attachment-file-name {
			flex: 1;
			color: var(--text-muted, #666);
			font-size: 14px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.attachments-list-container {
			max-width: 900px;
			margin: 0 auto;
		}
		@media (max-width: 600px) {
			.attachment-row {
				flex-direction: column;
				align-items: flex-start;
				gap: 5px;
			}
			.attachment-note-name {
				flex: none;
				width: 100%;
			}
		}
	</style>
</head>
<body class="shared-page">
	<div class="shared-container">
		<h2 class="shared-header"><?php echo t_h('attachments.list.title', [], 'Notes with Attachments'); ?></h2>
		
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" onclick="goBackToNotes()">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
		</div>
		
		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input type="text" id="filterInput" class="filter-input" placeholder="<?php echo t_h('attachments.list.filter_placeholder', [], 'Filter...'); ?>"/>
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
			<div id="attachmentsContainer" class="attachments-list-container"></div>
			<div id="emptyMessage" class="empty-message" style="display: none;">
				<i class="fa-paperclip"></i>
				<p><?php echo t_h('attachments.list.no_attachments', [], 'No notes with attachments yet.'); ?></p>
			</div>
		</div>
	</div>
	
	<script>
	const workspace = <?php echo json_encode($pageWorkspace); ?>;
	let allRows = [];
	let filteredRows = [];
	let filterText = '';
	
	document.addEventListener('DOMContentLoaded', function() {
		const filterInput = document.getElementById('filterInput');
		const clearFilterBtn = document.getElementById('clearFilterBtn');
		
		filterInput.addEventListener('input', function() {
			filterText = this.value.trim().toLowerCase();
			applyFilter();
			clearFilterBtn.style.display = filterText ? 'flex' : 'none';
		});
		
		clearFilterBtn.addEventListener('click', function() {
			filterInput.value = '';
			filterText = '';
			applyFilter();
			this.style.display = 'none';
			filterInput.focus();
		});
		
		filterInput.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				filterInput.value = '';
				filterText = '';
				applyFilter();
				clearFilterBtn.style.display = 'none';
			}
		});
		
		loadAttachments();
	});
	
	function goBackToNotes() {
		window.location.href = 'index.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
	}
	
	async function loadAttachments() {
		const spinner = document.getElementById('loadingSpinner');
		const container = document.getElementById('attachmentsContainer');
		const emptyMessage = document.getElementById('emptyMessage');
		
		try {
			const response = await fetch('api_list_notes_with_attachments.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : ''), {
				credentials: 'same-origin'
			});
			
			if (!response.ok) throw new Error('HTTP error ' + response.status);
			
			const data = await response.json();
			if (data.error) throw new Error(data.error);
			
			spinner.style.display = 'none';
			
			// Flatten: one row per attachment
			allRows = [];
			(data.notes || []).forEach(note => {
				(note.attachments || []).forEach(att => {
					allRows.push({
						noteId: note.id,
						noteName: note.heading || '<?php echo t_h('common.untitled', [], 'Untitled'); ?>',
						fileName: att.original_filename || att.filename
					});
				});
			});
			
			if (allRows.length === 0) {
				emptyMessage.style.display = 'block';
				return;
			}
			
			applyFilter();
		} catch (error) {
			spinner.style.display = 'none';
			container.innerHTML = '<div class="error-message"><i class="fa-exclamation-triangle"></i> Error: ' + error.message + '</div>';
		}
	}
	
	function applyFilter() {
		filteredRows = filterText 
			? allRows.filter(r => r.noteName.toLowerCase().includes(filterText) || r.fileName.toLowerCase().includes(filterText))
			: [...allRows];
		
		renderRows();
		
		const statsDiv = document.getElementById('filterStats');
		if (filterText && filteredRows.length < allRows.length) {
			statsDiv.textContent = filteredRows.length + ' / ' + allRows.length;
			statsDiv.style.display = 'block';
		} else {
			statsDiv.style.display = 'none';
		}
	}
	
	function renderRows() {
		const container = document.getElementById('attachmentsContainer');
		const emptyMessage = document.getElementById('emptyMessage');
		
		if (filteredRows.length === 0) {
			container.innerHTML = filterText 
				? '<div class="empty-message"><p><?php echo t_h('attachments.list.no_filter_results', [], 'No results.'); ?></p></div>'
				: '';
			emptyMessage.style.display = filterText ? 'none' : 'block';
			return;
		}
		
		emptyMessage.style.display = 'none';
		
		container.innerHTML = filteredRows.map(row => `
			<div class="attachment-row">
				<a href="index.php?note=${row.noteId}${workspace ? '&workspace=' + encodeURIComponent(workspace) : ''}" class="attachment-note-name" title="${escapeHtml(row.noteName)}">${escapeHtml(row.noteName)}</a>
				<span class="attachment-file-name" title="${escapeHtml(row.fileName)}">${escapeHtml(row.fileName)}</span>
			</div>
		`).join('');
	}
	
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
	</script>
</body>
</html>
