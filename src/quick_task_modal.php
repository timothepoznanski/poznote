<?php // Quick Add Task modal, shared between index.php (via modals.php) and tasks.php ?>
<div id="quickTaskModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.quick_task.title', [], 'Add task'); ?></h3>
        <div class="modal-body">
            <input type="text" id="quickTaskTextInput" maxlength="4000" autocomplete="off" placeholder="<?php echo t_h('modals.quick_task.text_placeholder', [], 'What needs to be done?'); ?>">
            <p><?php echo t_h('modals.quick_task.description', [], 'Choose the task list to add this task to.'); ?></p>
            <input type="text" id="quickTaskSearchInput" placeholder="<?php echo t_h('modals.task_move.search_placeholder', [], 'Search task lists...'); ?>">
            <div id="quickTaskList" class="move-task-list"></div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-primary" id="confirmQuickTaskBtn" disabled><?php echo t_h('modals.quick_task.confirm', [], 'Add task'); ?></button>
            <button type="button" class="btn-cancel" data-action="close-modal" data-modal="quickTaskModal"><?php echo t_h('common.cancel'); ?></button>
        </div>
    </div>
</div>
