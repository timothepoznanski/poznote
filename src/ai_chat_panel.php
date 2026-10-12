<?php
/**
 * AI chat panel markup, included by index.php and dashboard.php as the last
 * flex child of the page: on desktop it docks as the rightmost column (like
 * the outline panel), on phones it overlays the page. The including page is
 * responsible for gating on the AI configuration ($aiChatConfig from
 * poznoteResolveAiChatConfig()) and for loading css/ai-chat.css, js/ai-chat.js
 * and the two runtimes the latter relies on (js/globals.js for window.t,
 * js/markdown-parser.js for window.parseMarkdown).
 */

// The settings pages link back to the assistant (poznoteSettingsShellOpen() in
// settings_shell.php): tell them which page the panel was opened on so the
// link returns there.
$aiPanelSettingsQuery = 'from=ai-chat'
    . (basename((string)($_SERVER['SCRIPT_NAME'] ?? '')) === 'dashboard.php' ? '&back=dashboard' : '');

// Workspace the assistant is scoped to, resolved the way api_ai_chat.php
// resolves an empty one (its first workspace). js/ai-chat.js prefers the
// live client value and falls back to this on pages without one. The
// including page may set it beforehand (dashboard.php reuses it in its
// multi-workspace notice).
if (!isset($aiPanelWorkspace)) {
    $aiPanelWorkspace = trim((string)getWorkspaceFilter());
    if ($aiPanelWorkspace === '' || $aiPanelWorkspace === '__last_opened__') {
        $aiPanelWorkspace = (string)getFirstWorkspaceName();
    }
}

// Servers whose external tools the chat may call for this user (discussion
// #1611). The globe button of the input bar only exists when there are some.
$aiPanelExternalServers = implode(', ', array_column(
    poznoteAiMcpServersForChat($con, (int)(getAuthenticatedUserId() ?? 0)),
    'name'
));
?>
    <!-- AI CHAT PANEL -->
    <div id="ai-chat-panel">
        <div class="ai-chat-resize-handle" id="aiChatResizeHandle"></div>
        <div class="ai-chat-header">
            <h2 class="ai-chat-title"><i class="lucide lucide-bot"></i> <span data-i18n="ai_chat.title">AI Assistant</span></h2>
            <?php
            // Admins land on the instance configuration, everyone else on their
            // own page: custom instructions, plus their own provider when
            // personal API keys are allowed
            $aiPanelSettingsHref = 'ai_settings_user.php';
            if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
                $aiPanelSettingsHref = 'ai_settings.php';
            }
            ?>
            <?php if ($aiPanelSettingsHref !== ''): ?>
            <a class="ai-chat-header-btn" href="<?php echo htmlspecialchars($aiPanelSettingsHref . '?' . $aiPanelSettingsQuery, ENT_QUOTES, 'UTF-8'); ?>" aria-label="<?php echo t_h('ai_settings.title', [], 'AI Assistant'); ?>" title="<?php echo t_h('sidebar.settings', [], 'Settings'); ?>">
                <i class="lucide lucide-settings"></i>
            </a>
            <?php endif; ?>
            <button type="button" class="ai-chat-header-btn" data-action="ai-chat-new" aria-label="<?php echo t_h('ai_chat.new_chat', [], 'New conversation'); ?>" title="<?php echo t_h('ai_chat.new_chat', [], 'New conversation'); ?>">
                <i class="lucide lucide-plus"></i>
            </button>
            <button type="button" class="ai-chat-header-btn" data-action="ai-chat-history" aria-pressed="false" aria-label="<?php echo t_h('ai_chat.history', [], 'Previous conversations'); ?>" title="<?php echo t_h('ai_chat.history', [], 'Previous conversations'); ?>">
                <i class="lucide lucide-history"></i>
            </button>
            <button type="button" class="ai-chat-header-btn" data-action="ai-chat-clear" aria-label="<?php echo t_h('ai_chat.delete_chat', [], 'Delete this conversation'); ?>" title="<?php echo t_h('ai_chat.delete_chat', [], 'Delete this conversation'); ?>">
                <i class="lucide lucide-trash"></i>
            </button>
            <button type="button" class="ai-chat-header-btn" data-action="toggle-ai-chat" aria-label="<?php echo t_h('common.close'); ?>" title="<?php echo t_h('common.close'); ?>">
                <i class="lucide lucide-x"></i>
            </button>
        </div>
        <div class="ai-chat-messages" id="ai-chat-messages">
            <div class="ai-chat-empty" data-i18n="ai_chat.empty">Ask a question.
The assistant can search, read, create, edit, organize and delete your notes.</div>
        </div>
        <!-- The last conversations of the workspace; js/ai-chat.js fills it and shows it in place of the messages -->
        <div class="ai-chat-history" id="ai-chat-history" hidden></div>
        <div class="ai-chat-model" title="<?php echo t_h('ai_chat.model_hint', [], 'Open AI Assistant settings.'); ?>">
            <i class="lucide lucide-cpu"></i>
            <span class="ai-chat-model-label" data-i18n="ai_chat.model_label"><?php echo t_h('ai_chat.model_label', [], 'Model:'); ?></span>
            <a href="<?php echo htmlspecialchars('ai_settings.php?' . $aiPanelSettingsQuery, ENT_QUOTES, 'UTF-8'); ?>" class="ai-chat-model-link"><?php echo htmlspecialchars((string)($aiChatConfig['model'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></a>
        </div>
        <!-- Workspace every tool runs in; js/ai-chat.js keeps it current on in-page switches -->
        <div class="ai-chat-context ai-chat-workspace" id="ai-chat-workspace"<?php echo $aiPanelWorkspace === '' ? ' hidden' : ''; ?>>
            <i class="lucide lucide-layers"></i>
            <span class="ai-chat-context-label" data-i18n="ai_chat.workspace_label"><?php echo t_h('ai_chat.workspace_label', [], 'Workspace:'); ?></span>
            <span class="ai-chat-context-title" id="ai-chat-workspace-name" data-fallback="<?php echo htmlspecialchars($aiPanelWorkspace, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($aiPanelWorkspace, ENT_QUOTES, 'UTF-8'); ?></span>
        </div>
        <!-- Which note "this note" refers to; js/ai-chat.js fills and shows it -->
        <div class="ai-chat-context" id="ai-chat-context" hidden>
            <i class="lucide lucide-file-text"></i>
            <span class="ai-chat-context-label" data-i18n="ai_chat.context_label"><?php echo t_h('ai_chat.context_label', [], 'Note:'); ?></span>
            <span class="ai-chat-context-title" id="ai-chat-context-title"></span>
        </div>
        <form id="ai-chat-form" class="ai-chat-inputbar">
            <?php if ($aiPanelExternalServers !== ''): ?>
            <!-- External tools on/off; js/ai-chat.js keeps the state and the title -->
            <button type="button" id="ai-chat-external" class="ai-chat-external-btn" data-action="ai-chat-external" aria-pressed="true"
                    data-servers="<?php echo htmlspecialchars($aiPanelExternalServers, ENT_QUOTES, 'UTF-8'); ?>"
                    aria-label="<?php echo t_h('ai_chat.external_tools', [], 'External tools'); ?>">
                <i class="lucide lucide-globe"></i>
            </button>
            <?php endif; ?>
            <textarea id="ai-chat-input" rows="1" placeholder="<?php echo t_h('ai_chat.placeholder', [], 'Ask the assistant...'); ?>" data-i18n-placeholder="ai_chat.placeholder"></textarea>
            <button type="submit" id="ai-chat-send" class="ai-chat-send-btn" title="<?php echo t_h('ai_chat.send', [], 'Send'); ?>">
                <i class="lucide lucide-arrow-up"></i>
            </button>
        </form>
    </div>
