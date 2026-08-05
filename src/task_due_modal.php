<?php
// Task due-date modal, shared between index.php (via modals.php) and tasks.php.
// Mirrors the note reminder modal: date + time triggers, a "remind me" toggle
// wired to the notifications system, and an optional email toggle.
$taskDueEmailAvailable = false;
$taskDueEmailAddress = '';
try {
    if (!function_exists('getGlobalSetting')) {
        require_once __DIR__ . '/users/db_master.php';
    }
    $taskDueSmtpHost = function_exists('getGlobalSetting') ? trim((string)getGlobalSetting('smtp_host', '')) : '';
    $taskDueSmtpFrom = function_exists('getGlobalSetting') ? trim((string)getGlobalSetting('smtp_from_email', '')) : '';
    $taskDueSmtpEnabledSetting = function_exists('getGlobalSetting') ? getGlobalSetting('smtp_enabled', null) : null;
    $taskDueSmtpEnabled = $taskDueSmtpEnabledSetting === null || $taskDueSmtpEnabledSetting === '' || filter_var($taskDueSmtpEnabledSetting, FILTER_VALIDATE_BOOLEAN);
    $taskDueUser = function_exists('getCurrentUser') ? getCurrentUser() : [];
    $taskDueEmailAddress = trim((string)($taskDueUser['email'] ?? ''));
    $taskDueEmailAvailable = $taskDueSmtpEnabled
        && $taskDueSmtpHost !== ''
        && filter_var($taskDueSmtpFrom, FILTER_VALIDATE_EMAIL)
        && filter_var($taskDueEmailAddress, FILTER_VALIDATE_EMAIL);
} catch (Throwable $e) {
    $taskDueEmailAvailable = false;
    $taskDueEmailAddress = '';
}
?>
<div
    id="taskDueModal"
    class="modal"
    data-email-available="<?php echo $taskDueEmailAvailable ? '1' : '0'; ?>"
    data-txt-date="<?php echo t_h('reminder.modal.date_placeholder', [], 'Date'); ?>"
    data-txt-time="<?php echo t_h('reminder.modal.time_placeholder', [], 'Time'); ?>"
    data-txt-no-date="<?php echo t_h('reminder.modal.no_date_configured', [], 'No date configured'); ?>"
    data-txt-remove-time="<?php echo t_h('tasklist.due_remove_time', [], 'Remove time'); ?>"
>
    <div class="modal-content">
        <h3><?php echo t_h('tasklist.due_date', [], 'Due date'); ?></h3>
        <div class="reminder-form">
            <div class="reminder-input-row">
                <button type="button" id="taskDueDateBtn" class="reminder-datetime-part">
                    <i class="lucide lucide-calendar-alt"></i>
                    <span id="taskDueDateBtnLabel"><?php echo t_h('reminder.modal.date_placeholder', [], 'Date'); ?></span>
                </button>
                <button type="button" id="taskDueTimeBtn" class="reminder-datetime-part">
                    <i class="lucide lucide-clock"></i>
                    <span id="taskDueTimeBtnLabel"><?php echo t_h('reminder.modal.time_placeholder', [], 'Time'); ?></span>
                </button>
            </div>
            <div class="reminder-email-option" id="taskDueRemindOption">
                <label class="reminder-email-label" for="taskDueRemindInput">
                    <span class="reminder-email-copy">
                        <span class="reminder-email-title">
                            <i class="lucide lucide-bell"></i>
                            <?php echo t_h('tasklist.remind_me', [], 'Remind me'); ?>
                        </span>
                        <span class="reminder-email-hint">
                            <?php echo t_h('tasklist.remind_me_hint', [], 'A notification fires at the due date and time.'); ?>
                        </span>
                    </span>
                    <span class="toggle-switch reminder-email-switch">
                        <input type="checkbox" id="taskDueRemindInput">
                        <span class="toggle-slider"></span>
                    </span>
                </label>
            </div>
            <div class="reminder-email-option initially-hidden" id="taskDueEmailOption">
                <label class="reminder-email-label" for="taskDueEmailInput">
                    <span class="reminder-email-copy">
                        <span class="reminder-email-title">
                            <i class="lucide lucide-mail"></i>
                            <?php echo t_h('reminder.modal.email_toggle', [], 'Send me an email'); ?>
                        </span>
                        <span class="reminder-email-hint">
                            <?php echo t_h('reminder.modal.email_hint', ['email' => $taskDueEmailAddress], 'To {{email}}'); ?>
                        </span>
                    </span>
                    <span class="toggle-switch reminder-email-switch">
                        <input type="checkbox" id="taskDueEmailInput" <?php echo $taskDueEmailAvailable ? 'checked' : ''; ?>>
                        <span class="toggle-slider"></span>
                    </span>
                </label>
            </div>
            <div class="reminder-current-info is-empty" id="taskDueCurrentInfo">
                <i class="lucide lucide-calendar-alt"></i>
                <span id="taskDueCurrentDate"></span>
            </div>
        </div>
        <div class="modal-buttons reminder-modal-actions">
            <button type="button" class="btn-danger initially-hidden reminder-modal-action" id="taskDueRemoveBtn"><?php echo t_h('tasklist.due_remove', [], 'Remove due date'); ?></button>
            <button type="button" class="btn-cancel reminder-modal-action" data-action="close-modal" data-modal="taskDueModal"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary reminder-modal-action" id="taskDueSaveBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>
