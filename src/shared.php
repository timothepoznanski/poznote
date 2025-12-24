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
	<title><?php echo t_h('shared.page.title', [], 'Shared Notes'); ?> - <?php echo t_h('app.name'); ?></title>
	<script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
	<meta name="color-scheme" content="dark light">
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
</head>
<body class="shared-page">
	<div class="shared-container">
		<h2 class="shared-header"><?php echo t_h('shared.page.title', [], 'Shared Notes'); ?></h2>
		
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" onclick="goBackToNotes()" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
		</div>
		
		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="fa-spinner fa-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="sharedNotesContainer"></div>
			<div id="emptyMessage" class="empty-message" style="display: none;">
				<i class="fa-share-nodes"></i>
				<p><?php echo t_h('shared.page.no_shared_notes', [], 'No shared notes yet.'); ?></p>
				<p class="empty-hint"><?php echo t_h('shared.page.share_hint', [], 'Share a note by clicking the share button in the note toolbar.'); ?></p>
			</div>
		</div>
	</div>
	
	<!-- Confirmation Modal -->
	<div id="confirmModal" class="modal" style="display: none;">
		<div class="modal-content">
			<div class="modal-header">
				<h3><?php echo t_h('shared.confirm.revoke_title', [], 'Revoke Sharing'); ?></h3>
			</div>
			<div class="modal-body">
				<p id="confirmMessage"></p>
			</div>
			<div class="modal-footer">
				<button class="btn btn-secondary" onclick="closeConfirmModal()"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
				<button class="btn btn-danger" id="confirmBtn"><?php echo t_h('shared.actions.revoke', [], 'Revoke'); ?></button>
			</div>
		</div>
	</div>
	
	<script>
	const workspace = <?php echo json_encode($pageWorkspace); ?>;
	let sharedNotes = [];
	
	// Load shared notes on page load
	document.addEventListener('DOMContentLoaded', function() {
		loadSharedNotes();
	});
	
	function goBackToNotes() {
		const params = new URLSearchParams();
		if (workspace) {
			params.append('workspace', workspace);
		}
		window.location.href = 'index.php' + (params.toString() ? '?' + params.toString() : '');
	}
	
	async function loadSharedNotes() {
		const spinner = document.getElementById('loadingSpinner');
		const container = document.getElementById('sharedNotesContainer');
		const emptyMessage = document.getElementById('emptyMessage');
		
		spinner.style.display = 'block';
		container.innerHTML = '';
		emptyMessage.style.display = 'none';
		
		try {
			const params = new URLSearchParams();
			if (workspace) {
				params.append('workspace', workspace);
			}
			
			const response = await fetch('api_list_shared.php?' + params.toString());
			const data = await response.json();
			
			if (data.error) {
				throw new Error(data.error);
			}
			
			sharedNotes = data.shared_notes || [];
			
			spinner.style.display = 'none';
			
			if (sharedNotes.length === 0) {
				emptyMessage.style.display = 'block';
				return;
			}
			
			renderSharedNotes();
		} catch (error) {
			spinner.style.display = 'none';
			container.innerHTML = '<div class="error-message"><i class="fa-exclamation-triangle"></i> <?php echo t_h('common.error', [], 'Error'); ?>: ' + error.message + '</div>';
		}
	}
	
	function renderSharedNotes() {
		const container = document.getElementById('sharedNotesContainer');
		
		const table = document.createElement('table');
		table.className = 'shared-notes-table';
		
		// Table header
		const thead = document.createElement('thead');
		thead.innerHTML = `
			<tr>
				<th><?php echo t_h('shared.table.note', [], 'Note'); ?></th>
				<th><?php echo t_h('shared.table.folder', [], 'Folder'); ?></th>
				<th><?php echo t_h('shared.table.shared_date', [], 'Shared'); ?></th>
				<th><?php echo t_h('shared.table.url', [], 'Public URL'); ?></th>
				<th class="actions-column"><?php echo t_h('shared.table.actions', [], 'Actions'); ?></th>
			</tr>
		`;
		table.appendChild(thead);
		
		// Table body
		const tbody = document.createElement('tbody');
		
		sharedNotes.forEach(note => {
			const row = document.createElement('tr');
			row.dataset.noteId = note.note_id;
			
			// Note name (clickable to open note)
			const noteCell = document.createElement('td');
			noteCell.className = 'note-cell';
			const noteLink = document.createElement('a');
			noteLink.href = 'index.php?note=' + note.note_id + (workspace ? '&workspace=' + encodeURIComponent(workspace) : '');
			noteLink.textContent = note.heading || '<?php echo t_h('common.untitled', [], 'Untitled'); ?>';
			noteLink.className = 'note-link';
			noteCell.appendChild(noteLink);
			row.appendChild(noteCell);
			
			// Folder
			const folderCell = document.createElement('td');
			folderCell.className = 'folder-cell';
			folderCell.textContent = note.folder || '<?php echo t_h('common.uncategorized', [], 'Uncategorized'); ?>';
			row.appendChild(folderCell);
			
			// Shared date
			const dateCell = document.createElement('td');
			dateCell.className = 'date-cell';
			dateCell.textContent = formatDate(note.shared_date);
			row.appendChild(dateCell);
			
			// URL (with copy button)
			const urlCell = document.createElement('td');
			urlCell.className = 'url-cell';
			const urlWrapper = document.createElement('div');
			urlWrapper.className = 'url-wrapper';
			const urlInput = document.createElement('input');
			urlInput.type = 'text';
			urlInput.value = note.url;
			urlInput.className = 'url-input';
			urlInput.readonly = true;
			const copyBtn = document.createElement('button');
			copyBtn.className = 'btn-copy';
			copyBtn.innerHTML = '<i class="fa-copy"></i>';
			copyBtn.title = '<?php echo t_h('shared.actions.copy', [], 'Copy URL'); ?>';
			copyBtn.onclick = () => copyUrl(note.url, copyBtn);
			urlWrapper.appendChild(urlInput);
			urlWrapper.appendChild(copyBtn);
			urlCell.appendChild(urlWrapper);
			row.appendChild(urlCell);
			
			// Actions
			const actionsCell = document.createElement('td');
			actionsCell.className = 'actions-cell';
			
			const openBtn = document.createElement('button');
			openBtn.className = 'btn btn-sm btn-secondary';
			openBtn.innerHTML = '<i class="fa-external-link"></i>';
			openBtn.title = '<?php echo t_h('shared.actions.open', [], 'Open public view'); ?>';
			openBtn.onclick = () => window.open(note.url, '_blank');
			
			const revokeBtn = document.createElement('button');
			revokeBtn.className = 'btn btn-sm btn-danger';
			revokeBtn.innerHTML = '<i class="fa-ban"></i>';
			revokeBtn.title = '<?php echo t_h('shared.actions.revoke', [], 'Revoke'); ?>';
			revokeBtn.onclick = () => confirmRevoke(note.note_id, note.heading);
			
			actionsCell.appendChild(openBtn);
			actionsCell.appendChild(revokeBtn);
			row.appendChild(actionsCell);
			
			tbody.appendChild(row);
		});
		
		table.appendChild(tbody);
		container.appendChild(table);
	}
	
	function formatDate(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now - date;
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		
		if (diffDays === 0) {
			return '<?php echo t_h('common.date.today', [], 'Today'); ?>';
		} else if (diffDays === 1) {
			return '<?php echo t_h('common.date.yesterday', [], 'Yesterday'); ?>';
		} else if (diffDays < 7) {
			return diffDays + ' <?php echo t_h('common.date.days_ago', [], 'days ago'); ?>';
		} else {
			return date.toLocaleDateString();
		}
	}
	
	async function copyUrl(url, button) {
		try {
			await navigator.clipboard.writeText(url);
			const originalHTML = button.innerHTML;
			button.innerHTML = '<i class="fa-check"></i>';
			button.classList.add('copied');
			setTimeout(() => {
				button.innerHTML = originalHTML;
				button.classList.remove('copied');
			}, 2000);
		} catch (err) {
			// Fallback for older browsers
			const input = document.createElement('input');
			input.value = url;
			document.body.appendChild(input);
			input.select();
			document.execCommand('copy');
			document.body.removeChild(input);
			
			const originalHTML = button.innerHTML;
			button.innerHTML = '<i class="fa-check"></i>';
			setTimeout(() => {
				button.innerHTML = originalHTML;
			}, 2000);
		}
	}
	
	function confirmRevoke(noteId, noteHeading) {
		const modal = document.getElementById('confirmModal');
		const message = document.getElementById('confirmMessage');
		const confirmBtn = document.getElementById('confirmBtn');
		
		message.textContent = '<?php echo t_h('shared.confirm.revoke_message', [], 'Are you sure you want to revoke sharing for'); ?> "' + noteHeading + '"?';
		
		confirmBtn.onclick = () => revokeShare(noteId);
		
		modal.style.display = 'block';
	}
	
	function closeConfirmModal() {
		document.getElementById('confirmModal').style.display = 'none';
	}
	
	async function revokeShare(noteId) {
		try {
			const response = await fetch('api_share_note.php', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					note_id: noteId,
					action: 'revoke'
				})
			});
			
			const data = await response.json();
			
			if (data.error) {
				throw new Error(data.error);
			}
			
			if (data.revoked) {
				closeConfirmModal();
				// Remove the note from the list
				const row = document.querySelector(`tr[data-note-id="${noteId}"]`);
				if (row) {
					row.remove();
				}
				
				// Update sharedNotes array
				sharedNotes = sharedNotes.filter(note => note.note_id !== noteId);
				
				// Show empty message if no more shared notes
				if (sharedNotes.length === 0) {
					document.getElementById('sharedNotesContainer').innerHTML = '';
					document.getElementById('emptyMessage').style.display = 'block';
				}
			}
		} catch (error) {
			alert('<?php echo t_h('common.error', [], 'Error'); ?>: ' + error.message);
		}
	}
	
	// Close modal when clicking outside
	window.onclick = function(event) {
		const modal = document.getElementById('confirmModal');
		if (event.target === modal) {
			closeConfirmModal();
		}
	};
	</script>
</body>
</html>
