<?php
/**
 * AI chat panel markup, shared by index.php and dashboard.php.
 * The including page is responsible for gating on the instance-wide
 * AI configuration and for loading css/ai-chat.css and js/ai-chat.js.
 */
?>
    <!-- AI CHAT PANEL -->
    <div id="ai-chat-panel">
        <div class="ai-chat-header">
            <h2 class="ai-chat-title"><i class="lucide lucide-bot"></i> <span data-i18n="ai_chat.title">AI Assistant</span></h2>
            <?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
            <a class="ai-chat-header-btn" href="ai_settings.php" aria-label="<?php echo t_h('ai_settings.title', [], 'AI Assistant'); ?>" title="<?php echo t_h('sidebar.settings', [], 'Settings'); ?>">
                <i class="lucide lucide-settings"></i>
            </a>
            <?php endif; ?>
            <button type="button" class="ai-chat-header-btn" data-action="ai-chat-clear" aria-label="<?php echo t_h('ai_chat.clear', [], 'Clear conversation'); ?>" title="<?php echo t_h('ai_chat.clear', [], 'Clear conversation'); ?>">
                <i class="lucide lucide-trash"></i>
            </button>
            <button type="button" class="ai-chat-header-btn" data-action="toggle-ai-chat" aria-label="<?php echo t_h('common.close'); ?>" title="<?php echo t_h('common.close'); ?>">
                <i class="lucide lucide-x"></i>
            </button>
        </div>
        <div class="ai-chat-messages" id="ai-chat-messages">
            <div class="ai-chat-empty" data-i18n="ai_chat.empty">Ask a question.
The assistant can search, read, create, rename and edit your notes.</div>
        </div>
        <form id="ai-chat-form" class="ai-chat-inputbar">
            <textarea id="ai-chat-input" rows="1" placeholder="<?php echo t_h('ai_chat.placeholder', [], 'Ask the assistant...'); ?>" data-i18n-placeholder="ai_chat.placeholder"></textarea>
            <button type="submit" id="ai-chat-send" class="ai-chat-send-btn" title="<?php echo t_h('ai_chat.send', [], 'Send'); ?>">
                <i class="lucide lucide-arrow-up"></i>
            </button>
        </form>
    </div>
