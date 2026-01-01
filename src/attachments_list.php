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
	<link type="text/css" rel="stylesheet" href="css/attachments_list.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
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
				<input type="text" id="filterInput" class="filter-input" placeholder="<?php echo t_h('attachments.list.filter_placeholder'); ?>"/>
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
			
			// Group: one row per note with all its attachments
			allRows = (data.notes || []).map(note => ({
				noteId: note.id,
				noteName: note.heading || '<?php echo t_h('common.untitled', [], 'Untitled'); ?>',
				attachments: (note.attachments || []).map(att => ({
					id: att.id,
					filename: att.original_filename || att.filename
				}))
			}));
			
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
			? allRows.filter(r => {
					const nameMatch = r.noteName.toLowerCase().includes(filterText);
					const fileMatch = r.attachments.some(att => att.filename.toLowerCase().includes(filterText));
					return nameMatch || fileMatch;
				})
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
		
		container.innerHTML = filteredRows.map(row => {
			const attachmentsList = row.attachments.map(att => 
				`<div class="attachment-file-item">
					<i class="fa-paperclip"></i>
					<a href="#" class="attachment-file-link" onclick="downloadAttachment('${att.id}', '${row.noteId}'); return false;" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</a>
				</div>`
			).join('');
			
			return `
				<div class="attachment-row">
					<a href="index.php?note=${row.noteId}${workspace ? '&workspace=' + encodeURIComponent(workspace) : ''}" class="attachment-note-name" title="${escapeHtml(row.noteName)}">
						${escapeHtml(row.noteName)}

					</a>
					<div class="attachment-files-list">
						${attachmentsList}
					</div>
				</div>
			`;
		}).join('');
	}
	
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
	
	function downloadAttachment(attachmentId, noteId) {
		if (!noteId || !attachmentId) {
			console.error('Missing noteId or attachmentId');
			return;
		}
		window.open('api_attachments.php?action=download&note_id=' + noteId + '&attachment_id=' + attachmentId, '_blank');
	}
	</script>
</body>
</html>
