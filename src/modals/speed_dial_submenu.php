<?php
// The speed dials of the workspace, beside the "Add to a speed dial" entry of the
// note and folder menus (js/utils-menus.js). Only once there are several: with
// the default one alone, the menus add and remove directly. Included by modals.php
// and list_folders.php.
require_once __DIR__ . '/../lib/speed-dial.php';
$speedDialBoardsWorkspace = trim((string)getWorkspaceFilter());
$speedDialBoardsList = ($speedDialBoardsWorkspace !== '' && $speedDialBoardsWorkspace !== '__last_opened__' && isset($con))
    ? poznoteSpeedDialBoards($con, $speedDialBoardsWorkspace)
    : [];
if (count($speedDialBoardsList) > 1):
?>
<div id="speedDialSubmenu" class="speed-dial-submenu" role="menu" hidden>
	<?php foreach ($speedDialBoardsList as $speedDialBoard): ?>
	<button type="button" class="speed-dial-submenu-item" role="menuitemcheckbox" aria-checked="false" data-tag="<?php echo htmlspecialchars($speedDialBoard, ENT_QUOTES, 'UTF-8'); ?>">
		<span class="speed-dial-submenu-box"><i class="lucide lucide-check"></i></span>
		<span class="speed-dial-submenu-name"><?php echo htmlspecialchars(poznoteSpeedDialBoardName($speedDialBoard) ?? t('speed_dial.default_name', [], 'Default'), ENT_QUOTES, 'UTF-8'); ?></span>
	</button>
	<?php endforeach; ?>
</div>
<?php endif; ?>
