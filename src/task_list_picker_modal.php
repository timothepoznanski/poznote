<?php // Task list picker for embedding a task list in a note (/tasklist slash command) ?>
<div id="taskListPickerModal" class="modal">
    <div class="modal-content">
        <h3><?php echo t_h('modals.tasklist_picker.title', [], 'Insert task list'); ?></h3>
        <div class="modal-body">
            <p><?php echo t_h('modals.tasklist_picker.description', [], 'Choose the task list to display in this note.'); ?></p>
            <input type="text" id="taskListPickerSearchInput" placeholder="<?php echo t_h('modals.task_move.search_placeholder', [], 'Search task lists...'); ?>">
            <div id="taskListPickerList" class="move-task-list"></div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-danger" data-action="close-modal" data-modal="taskListPickerModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="confirmTaskListPickerBtn" disabled><?php echo t_h('modals.tasklist_picker.confirm', [], 'Insert'); ?></button>
        </div>
    </div>
</div>
