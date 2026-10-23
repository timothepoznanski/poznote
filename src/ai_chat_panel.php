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
$aiPanelOnDashboard = basename((string)($_SERVER['SCRIPT_NAME'] ?? '')) === 'dashboard.php';
$aiPanelSettingsQuery = 'from=ai-chat' . ($aiPanelOnDashboard ? '&back=dashboard' : '');

// Workspace the assistant is scoped to, resolved the way api_ai_chat.php
// resolves an empty one (its first workspace). js/ai-chat.js prefers the
// live client value and falls back to this on pages without one. The
// including page may set it beforehand (dashboard.php does).
if (!isset($aiPanelWorkspace)) {
    $aiPanelWorkspace = trim((string)getWorkspaceFilter());
    if ($aiPanelWorkspace === '' || $aiPanelWorkspace === '__last_opened__') {
        $aiPanelWorkspace = (string)getFirstWorkspaceName();
    }
}

// The workspaces of a dashboard showing several (dashboard.php sets them,
// discussion #1652): the assistant searches and reads all of them, read only.
$aiPanelWorkspaces = isset($aiPanelWorkspaces) && is_array($aiPanelWorkspaces) ? $aiPanelWorkspaces : [];
$aiPanelReadOnly = $aiPanelWorkspaces !== [];

// Servers whose external tools the chat may call for this user (discussion
// #1611). The globe button of the input bar only exists when there are some.
$aiPanelExternalServers = implode(', ', array_column(
    poznoteAiMcpServersForChat($con, (int)(getAuthenticatedUserId() ?? 0)),
    'name'
));

// Prompts the user saved in ai_settings_user.php (discussion #1678), offered
// by the lightning button of the input bar and sent in one click
$aiPanelSavedPrompts = poznoteAiSavedPrompts($con);
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
            <?php if ($aiPanelReadOnly): ?>
            <div class="ai-chat-empty"><?php echo t_h('ai_chat.empty_read_only', [], "Ask a question.\nThe assistant searches and reads the notes of every workspace shown on this dashboard, but changes nothing here."); ?></div>
            <?php else: ?>
            <div class="ai-chat-empty" data-i18n="ai_chat.empty">Ask a question.
The assistant can search, read, create, edit, organize and delete your notes.</div>
            <?php endif; ?>
        </div>
        <!-- The last conversations of the workspace; js/ai-chat.js fills it and shows it in place of the messages -->
        <div class="ai-chat-history" id="ai-chat-history" hidden></div>
        <div class="ai-chat-model" title="<?php echo t_h('ai_chat.model_hint', [], 'Open AI Assistant settings.'); ?>">
            <i class="lucide lucide-cpu"></i>
            <span class="ai-chat-model-label" data-i18n="ai_chat.model_label"><?php echo t_h('ai_chat.model_label', [], 'Model:'); ?></span>
            <a href="<?php echo htmlspecialchars('ai_settings.php?' . $aiPanelSettingsQuery, ENT_QUOTES, 'UTF-8'); ?>" class="ai-chat-model-link"><?php echo htmlspecialchars((string)($aiChatConfig['model'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></a>
        </div>
        <?php
        // Both icons of the line open #aiChatWorkspaceInfoModal, which says how
        // to search several workspaces at once (discussion #1652)
        $aiPanelInfoLabel = t_h('ai_chat.workspace_info', [], 'Search several workspaces');
        ?>
        <!-- Workspace every tool runs in, which js/ai-chat.js keeps current on in-page
             switches; on a dashboard showing several, all of them, read only -->
        <div class="ai-chat-context ai-chat-workspace" id="ai-chat-workspace"<?php echo $aiPanelReadOnly ? ' data-read-only="true"' : ($aiPanelWorkspace === '' ? ' hidden' : ''); ?>>
            <button type="button" class="ai-chat-context-btn" data-action="ai-chat-workspace-info" tabindex="-1" aria-hidden="true"><i class="lucide lucide-layers"></i></button>
            <?php if ($aiPanelReadOnly): ?>
            <span class="ai-chat-context-label"><?php echo t_h('ai_chat.workspaces_label', [], 'Workspaces:'); ?></span>
            <span class="ai-chat-context-title" id="ai-chat-workspace-name" data-fallback="<?php echo htmlspecialchars($aiPanelWorkspace, ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo htmlspecialchars(implode(', ', $aiPanelWorkspaces), ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars(implode(', ', $aiPanelWorkspaces), ENT_QUOTES, 'UTF-8'); ?></span>
            <span class="ai-chat-context-label"><?php echo t_h('ai_chat.read_only', [], '(read only)'); ?></span>
            <?php else: ?>
            <span class="ai-chat-context-label" data-i18n="ai_chat.workspace_label"><?php echo t_h('ai_chat.workspace_label', [], 'Workspace:'); ?></span>
            <span class="ai-chat-context-title" id="ai-chat-workspace-name" data-fallback="<?php echo htmlspecialchars($aiPanelWorkspace, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($aiPanelWorkspace, ENT_QUOTES, 'UTF-8'); ?></span>
            <?php endif; ?>
            <button type="button" class="ai-chat-context-btn" data-action="ai-chat-workspace-info" aria-label="<?php echo $aiPanelInfoLabel; ?>" title="<?php echo $aiPanelInfoLabel; ?>"><i class="lucide lucide-info"></i></button>
        </div>
        <!-- Which note "this note" refers to; js/ai-chat.js fills and shows it -->
        <div class="ai-chat-context" id="ai-chat-context" hidden>
            <i class="lucide lucide-file-text"></i>
            <span class="ai-chat-context-label" data-i18n="ai_chat.context_label"><?php echo t_h('ai_chat.context_label', [], 'Note:'); ?></span>
            <span class="ai-chat-context-title" id="ai-chat-context-title"></span>
        </div>
        <form id="ai-chat-form" class="ai-chat-inputbar">
            <!-- Saved prompts; js/ai-chat.js opens the menu and sends the one picked -->
            <button type="button" id="ai-chat-prompts-btn" class="ai-chat-prompts-btn" data-action="ai-chat-prompts" aria-expanded="false" aria-controls="ai-chat-prompts"
                    aria-label="<?php echo t_h('ai_chat.saved_prompts', [], 'Saved prompts'); ?>" title="<?php echo t_h('ai_chat.saved_prompts', [], 'Saved prompts'); ?>">
                <i class="lucide lucide-zap"></i>
            </button>
            <div class="ai-chat-prompts" id="ai-chat-prompts" hidden>
                <?php if ($aiPanelSavedPrompts === []): ?>
                <div class="ai-chat-prompts-empty"><?php echo t_h('ai_chat.saved_prompts_empty', [], 'No saved prompt yet. Save the prompts you send often to send them in one click.'); ?></div>
                <?php endif; ?>
                <?php foreach ($aiPanelSavedPrompts as $aiPanelPrompt): ?>
                <button type="button" class="ai-chat-prompt" data-action="ai-chat-prompt"
                        data-prompt="<?php echo htmlspecialchars($aiPanelPrompt['prompt'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"
                        title="<?php echo htmlspecialchars($aiPanelPrompt['prompt'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
                    <?php echo htmlspecialchars($aiPanelPrompt['title'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>
                </button>
                <?php endforeach; ?>
                <a class="ai-chat-prompts-manage" href="<?php echo htmlspecialchars('ai_settings_user.php?' . $aiPanelSettingsQuery . '#ai-saved-prompts', ENT_QUOTES, 'UTF-8'); ?>">
                    <i class="lucide lucide-settings"></i>
                    <?php echo t_h('ai_chat.saved_prompts_manage', [], 'Manage saved prompts'); ?>
                </a>
            </div>
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

    <?php
    // What the assistant covers and how to search several workspaces: the
    // dashboard is the way, by showing them (its scope menu)
    if ($aiPanelReadOnly) {
        $aiPanelInfoText = t_h('ai_chat.workspace_info_text_multi', [], 'The assistant searches and reads the notes of every workspace shown on this dashboard. It changes nothing here: to edit a note, open it or its workspace and ask there. The menu at the top of the dashboard chooses the workspaces.');
    } elseif ($aiPanelOnDashboard) {
        $aiPanelInfoText = t_h('ai_chat.workspace_info_text_dashboard', [], 'Here the assistant works in this workspace only. Select several workspaces in the menu at the top of the dashboard: the assistant then searches and reads all of them at once, read only.');
    } else {
        $aiPanelInfoText = t_h('ai_chat.workspace_info_text_notes', [], 'Here the assistant works in the current workspace only. To search several workspaces at once, open the dashboard and select them in the menu at the top: the assistant then searches and reads all of them, read only.');
    }
    ?>
    <div id="aiChatWorkspaceInfoModal" class="modal">
        <div class="modal-content">
            <h3><?php echo $aiPanelInfoLabel; ?></h3>
            <div class="modal-body">
                <p><?php echo $aiPanelInfoText; ?></p>
            </div>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" data-action="ai-chat-workspace-info-close"><?php echo t_h('common.close', [], 'Close'); ?></button>
                <?php if (!$aiPanelOnDashboard): ?>
                <button type="button" class="btn-primary" data-action="ai-chat-open-dashboard"><?php echo t_h('ai_chat.open_dashboard', [], 'Open the dashboard'); ?></button>
                <?php endif; ?>
            </div>
        </div>
    </div>
