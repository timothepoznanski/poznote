<?php
// Which speed dials a note or a folder is on (openSpeedDialBoardsModal() in
// js/utils-menus.js). Only once the workspace has several: with the default one
// alone, the menus add and remove directly. Included by modals.php and
// list_folders.php.
require_once __DIR__ . '/../lib/speed-dial.php';
$speedDialBoardsWorkspace = trim((string)getWorkspaceFilter());
$speedDialBoardsList = ($speedDialBoardsWorkspace !== '' && $speedDialBoardsWorkspace !== '__last_opened__' && isset($con))
    ? poznoteSpeedDialBoards($con, $speedDialBoardsWorkspace)
    : [];
if (count($speedDialBoardsList) > 1):
?>
<div id="speedDialBoardsModal" class="modal">
	<div class="modal-content">
		<div class="modal-header">
			<h3><?php echo t_h('speed_dial.choose_title', [], 'Speed dials'); ?></h3>
		</div>
		<div class="modal-body speed-dial-boards-list">
			<?php foreach ($speedDialBoardsList as $speedDialBoard): ?>
			<label><input type="checkbox" data-tag="<?php echo htmlspecialchars(mb_strtolower($speedDialBoard, 'UTF-8'), ENT_QUOTES, 'UTF-8'); ?>" data-name="<?php echo htmlspecialchars($speedDialBoard, ENT_QUOTES, 'UTF-8'); ?>"> <span><?php echo htmlspecialchars(poznoteSpeedDialBoardName($speedDialBoard) ?? t('speed_dial.default_name', [], 'Default'), ENT_QUOTES, 'UTF-8'); ?></span></label>
			<?php endforeach; ?>
		</div>
		<div class="modal-buttons">
			<button type="button" class="btn-cancel" data-action="close-modal" data-modal="speedDialBoardsModal"><?php echo t_h('common.close', [], 'Close'); ?></button>
		</div>
	</div>
</div>
<?php endif; ?>
