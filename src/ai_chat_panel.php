<?php
/**
 * AI chat panel markup, included by index.php as the last flex child of
 * <body>: on desktop it docks as the rightmost column (like the outline
 * panel), on phones it overlays the page. The including page is
 * responsible for gating on the instance-wide AI configuration and for
 * loading css/ai-chat.css and js/ai-chat.js.
 */
?>
    <!-- AI CHAT PANEL -->
    <div id="ai-chat-panel">
        <div class="ai-chat-resize-handle" id="aiChatResizeHandle"></div>
        <div class="ai-chat-header">
            <h2 class="ai-chat-title"><i class="lucide lucide-bot"></i> <span data-i18n="ai_chat.title">AI Assistant</span></h2>
            <?php
            // Admins land on the instance configuration, everyone else on their
            // own one when personal API keys are allowed
            $aiPanelSettingsHref = '';
            if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
                $aiPanelSettingsHref = 'ai_settings.php';
            } elseif (function_exists('poznoteAiUserKeysAllowed') && poznoteAiUserKeysAllowed()) {
                $aiPanelSettingsHref = 'ai_settings_user.php';
            }
            ?>
            <?php if ($aiPanelSettingsHref !== ''): ?>
            <a class="ai-chat-header-btn" href="<?php echo $aiPanelSettingsHref; ?>?from=ai-chat" aria-label="<?php echo t_h('ai_settings.title', [], 'AI Assistant'); ?>" title="<?php echo t_h('sidebar.settings', [], 'Settings'); ?>">
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
        <div class="ai-chat-model" title="<?php echo t_h('ai_chat.model_hint', [], 'Open AI Assistant settings.'); ?>">
            <i class="lucide lucide-cpu"></i>
            <span class="ai-chat-model-label" data-i18n="ai_chat.model_label"><?php echo t_h('ai_chat.model_label', [], 'Model:'); ?></span>
            <a href="ai_settings.php?from=ai-chat" class="ai-chat-model-link"><?php echo htmlspecialchars((string)($aiChatConfig['model'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></a>
        </div>
        <!-- Which note "this note" refers to; js/ai-chat.js fills and shows it -->
        <div class="ai-chat-context" id="ai-chat-context" hidden>
            <i class="lucide lucide-file-text"></i>
            <span class="ai-chat-context-label" data-i18n="ai_chat.context_label"><?php echo t_h('ai_chat.context_label', [], 'Context:'); ?></span>
            <span class="ai-chat-context-title" id="ai-chat-context-title"></span>
        </div>
        <form id="ai-chat-form" class="ai-chat-inputbar">
            <textarea id="ai-chat-input" rows="1" placeholder="<?php echo t_h('ai_chat.placeholder', [], 'Ask the assistant...'); ?>" data-i18n-placeholder="ai_chat.placeholder"></textarea>
            <button type="submit" id="ai-chat-send" class="ai-chat-send-btn" title="<?php echo t_h('ai_chat.send', [], 'Send'); ?>">
                <i class="lucide lucide-arrow-up"></i>
            </button>
        </form>
    </div>
