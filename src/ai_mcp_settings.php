<?php
/**
 * The "External tools" section of the two AI assistant settings pages
 * (discussion #1611): ai_settings.php manages the instance servers and the
 * two switches of the feature, ai_settings_user.php the user's own servers.
 * Both pages call poznoteAiMcpHandlePost() before rendering and
 * poznoteAiMcpRenderSection() where the section goes.
 *
 * $scope is 'instance' or 'user', as for the connection test of the AI
 * server. The pages gate access themselves (requireAdmin(), or
 * requireActiveAccountOwner()): a stored key follows the URL typed next to
 * it, which is only right for the owner of the configuration.
 */

require_once __DIR__ . '/ai_config.php';
require_once __DIR__ . '/version_helper.php';
require_once __DIR__ . '/lib/ai-tools.php';

function poznoteAiMcpH(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function poznoteAiMcpLoadServers(string $scope, ?PDO $con): array {
    return $scope === 'instance' ? poznoteAiMcpInstanceServers() : poznoteAiMcpUserServers($con);
}

function poznoteAiMcpSaveServers(string $scope, ?PDO $con, array $servers): bool {
    return $scope === 'instance' ? poznoteSaveAiMcpInstanceServers($servers) : poznoteSaveAiMcpUserServers($con, $servers);
}

/**
 * The server as the settings check contacts it: a user's own server may only
 * be a public host unless the account is an admin's (GHSA-mr2c-9992-59wx).
 * The flag is never stored, the chat sets it again (poznoteAiMcpServersForChat).
 */
function poznoteAiMcpCheckTarget(string $scope, array $server): array {
    $restricted = $scope !== 'instance' && poznoteOutboundRestrictedForUser(function_exists('getCurrentUserId') ? (int)(getCurrentUserId() ?? 0) : 0);
    return array_merge($server, ['restricted' => $restricted]);
}

/**
 * True when the page of this scope may manage servers at all. The admin
 * always may, the switch off included: the chat only calls the servers once
 * "Allow external tools" is on (poznoteAiMcpServersForChat).
 */
function poznoteAiMcpScopeAllowed(string $scope): bool {
    return $scope === 'instance' ? true : poznoteAiMcpUserServersAllowed();
}

/**
 * Read the fields of a posted server form over $stored, the server being
 * edited or a blank one. A key or a header value left as the mask keeps the
 * stored one. Returns ['server' => array, 'error' => '' | translated message].
 */
function poznoteAiMcpReadServerForm(array $stored): array {
    $server = $stored;
    $server['url'] = trim((string)($_POST['mcp_url'] ?? ''));
    if (!aiMcpIsValidUrl($server['url'])) {
        return ['server' => $stored, 'error' => t('ai_mcp.messages.url_invalid', [], 'Enter the full URL of the server, starting with http:// or https://.')];
    }

    $name = trim((string)($_POST['mcp_name'] ?? ''));
    $server['name'] = $name !== ''
        ? mb_substr($name, 0, AI_MCP_SERVER_NAME_MAX)
        : (string)parse_url($server['url'], PHP_URL_HOST);

    $apiKey = trim((string)($_POST['mcp_api_key'] ?? ''));
    if ($apiKey !== AI_UPSTREAM_HEADER_MASK) {
        // Sent in a header: printable ASCII, which leaves no room for a line break
        if (preg_match('/^[\x21-\x7E]*$/', $apiKey) !== 1) {
            return ['server' => $stored, 'error' => t('ai_mcp.messages.key_invalid', [], 'The API key contains characters that cannot be sent in a header.')];
        }
        $server['api_key'] = $apiKey;
    }

    $headersField = poznoteAiReadHeadersField((string)($_POST['mcp_headers'] ?? ''), $stored['headers']);
    if ($headersField['error'] !== '') {
        return ['server' => $stored, 'error' => $headersField['error']];
    }
    $server['headers'] = $headersField['headers'];

    $server['enabled'] = isset($_POST['mcp_enabled']);
    $checked = is_array($_POST['mcp_tools'] ?? null) ? $_POST['mcp_tools'] : [];
    foreach ($server['tools'] as &$tool) {
        $tool['enabled'] = in_array($tool['name'], $checked, true);
    }
    unset($tool);

    return ['server' => $server, 'error' => ''];
}

/**
 * Handle a form of the section. Returns null when the request is none of
 * them, else ['message' => string, 'error' => string, 'draft' => bool, the
 * refused "add" form is to be shown again as it was typed].
 */
function poznoteAiMcpHandlePost(string $scope, ?PDO $con): ?array {
    $action = $_SERVER['REQUEST_METHOD'] === 'POST' ? (string)($_POST['action'] ?? '') : '';
    $result = ['message' => '', 'error' => '', 'draft' => false];
    $saveError = t('ai_settings.messages.save_error', [], 'Failed to save configuration.');

    if ($action === 'ai_tools' && $scope === 'user') {
        $checked = is_array($_POST['ai_tools'] ?? null) ? $_POST['ai_tools'] : [];
        $disabled = array_values(array_diff(array_keys(aiToolHandlers()), $checked));
        if (poznoteSaveAiDisabledTools($con, $disabled)) {
            $result['message'] = t('ai_mcp.builtin_saved', [], 'Tools saved.');
        } else {
            $result['error'] = $saveError;
        }
        return $result;
    }

    if (!in_array($action, ['mcp_add', 'mcp_server'], true) || !poznoteAiMcpScopeAllowed($scope)) {
        return null;
    }

    $servers = poznoteAiMcpLoadServers($scope, $con);

    if ($action === 'mcp_add') {
        if (count($servers) >= AI_MCP_MAX_SERVERS) {
            $result['error'] = t('ai_mcp.messages.too_many', ['max' => AI_MCP_MAX_SERVERS], 'No more than {{max}} servers.');
            return $result;
        }
        $form = poznoteAiMcpReadServerForm(['id' => aiMcpNewServerId(), 'name' => '', 'url' => '', 'api_key' => '', 'headers' => [], 'enabled' => true, 'tools' => []]);
        if ($form['error'] !== '') {
            $result['error'] = $form['error'];
            $result['draft'] = true;
            return $result;
        }
        // The "add" form has no switch: a server starts in use
        $server = array_merge($form['server'], ['enabled' => true]);
        $check = aiMcpFetchTools(poznoteAiMcpCheckTarget($scope, $server), getAppVersion());
        $server['tools'] = $check['tools'];
        $servers[] = $server;
        if (!poznoteAiMcpSaveServers($scope, $con, $servers)) {
            $result['error'] = $saveError;
            return $result;
        }
        if ($check['error'] !== '') {
            $result['error'] = t('ai_mcp.messages.added_unreachable', ['error' => $check['error']], 'Server added, but it could not be checked: {{error}}');
        } else {
            $result['message'] = t('ai_mcp.messages.added', ['count' => count($server['tools'])], 'Server added. {{count}} tool(s) found.');
        }
        return $result;
    }

    $index = array_search((string)($_POST['mcp_server_id'] ?? ''), array_column($servers, 'id'), true);
    if ($index === false) {
        $result['error'] = t('ai_mcp.messages.not_found', [], 'This server no longer exists.');
        return $result;
    }
    $do = (string)($_POST['mcp_do'] ?? 'save');

    if ($do === 'delete') {
        array_splice($servers, $index, 1);
        if (poznoteAiMcpSaveServers($scope, $con, $servers)) {
            $result['message'] = t('ai_mcp.messages.deleted', [], 'Server deleted.');
        } else {
            $result['error'] = $saveError;
        }
        return $result;
    }

    $form = poznoteAiMcpReadServerForm($servers[$index]);
    if ($form['error'] !== '') {
        $result['error'] = $form['error'];
        return $result;
    }
    $server = $form['server'];
    // The check button saves what the form holds first, so that a corrected
    // URL or key is the one being checked
    $check = $do === 'check' ? aiMcpFetchTools(poznoteAiMcpCheckTarget($scope, $server), getAppVersion()) : null;
    if ($check !== null) {
        $server['tools'] = $check['tools'];
    }
    $servers[$index] = $server;
    if (!poznoteAiMcpSaveServers($scope, $con, $servers)) {
        $result['error'] = $saveError;
    } elseif ($check === null) {
        $result['message'] = t('ai_mcp.messages.saved', [], 'Server saved.');
    } elseif ($check['error'] !== '') {
        $result['error'] = t('ai_settings.test_failure', ['error' => $check['error']], 'Connection failed: {{error}}');
    } else {
        $result['message'] = t('ai_mcp.messages.checked', ['count' => count($server['tools'])], 'Connection successful. {{count}} tool(s) found.');
    }
    return $result;
}

/** The fields shared by the form of a stored server and the "add" form. */
function poznoteAiMcpRenderServerFields(array $server, string $idPrefix): void {
    ?>
                    <div class="git-field-group">
                        <label class="git-field-label" for="<?php echo $idPrefix; ?>_name"><?php echo t_h('ai_mcp.server_name_label', [], 'Name'); ?></label>
                        <input type="text" name="mcp_name" id="<?php echo $idPrefix; ?>_name" class="git-field-input"
                               value="<?php echo poznoteAiMcpH($server['name']); ?>" maxlength="<?php echo AI_MCP_SERVER_NAME_MAX; ?>" placeholder="Exa" autocomplete="off">
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="<?php echo $idPrefix; ?>_url"><?php echo t_h('ai_settings.url_label', [], 'Server URL'); ?></label>
                        <input type="text" name="mcp_url" id="<?php echo $idPrefix; ?>_url" class="git-field-input"
                               value="<?php echo poznoteAiMcpH($server['url']); ?>" maxlength="<?php echo AI_MCP_URL_MAX; ?>" placeholder="https://mcp.exa.ai/mcp" autocomplete="off" required>
                        <span class="label-desc"><?php echo t_h('ai_mcp.server_url_description', [], 'URL of the MCP endpoint of the server. It is called from the Poznote server, not from your browser.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="<?php echo $idPrefix; ?>_key"><?php echo t_h('ai_settings.api_key_label', [], 'API key (optional)'); ?></label>
                        <input type="password" name="mcp_api_key" id="<?php echo $idPrefix; ?>_key" class="git-field-input"
                               value="<?php echo $server['api_key'] !== '' ? AI_UPSTREAM_HEADER_MASK : ''; ?>" autocomplete="off">
                        <span class="label-desc"><?php echo t_h('ai_mcp.api_key_description', [], 'Sent as a Bearer token in the Authorization header. Leave empty when the server takes its key in a custom header, or needs none.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="<?php echo $idPrefix; ?>_headers"><?php echo t_h('ai_settings.headers_label', [], 'Custom headers (optional)'); ?></label>
                        <textarea name="mcp_headers" id="<?php echo $idPrefix; ?>_headers" class="git-field-input" rows="2" spellcheck="false" autocomplete="off"
                                  placeholder="x-api-key: ..."><?php echo poznoteAiMcpH($server['headers_text']); ?></textarea>
                        <span class="label-desc"><?php echo t_h('ai_mcp.headers_description', [], 'One header per line, written as Name: value, sent with every request to this server. Saved values are hidden: leave a line as it is to keep its value.'); ?></span>
                    </div>
    <?php
}

/**
 * Render the section. $state is what poznoteAiMcpHandlePost() returned (or
 * null). The user page shows nothing unless users may add servers.
 */
function poznoteAiMcpRenderSection(string $scope, ?PDO $con, ?array $state): void {
    if ($scope === 'user' && !poznoteAiMcpScopeAllowed($scope)) {
        return;
    }
    $servers = poznoteAiMcpScopeAllowed($scope) ? poznoteAiMcpLoadServers($scope, $con) : [];
    $draft = !empty($state['draft']);
    ?>
        <div class="git-sync-section" id="ai-external-tools">
            <h2><i class="lucide lucide-plug"></i> <?php echo t_h('ai_mcp.title', [], 'External tools'); ?></h2>
            <p class="git-sync-description git-sync-description-left ai-mcp-intro"><?php echo $scope === 'instance'
                ? t_h('ai_mcp.description_instance', [], 'Connect the assistant to remote MCP servers, a web search service for instance, so that it can call their tools next to its own. The servers added here are offered to the users allowed to use the assistant configured above. Only servers reached over HTTP with an API key or custom headers are supported.')
                : t_h('ai_mcp.description_user', [], 'Connect the assistant to remote MCP servers, a web search service for instance, so that it can call their tools next to its own. The servers added here are only used in your own conversations. Only servers reached over HTTP with an API key or custom headers are supported.'); ?></p>

            <?php if ($scope === 'instance'): ?>
            <?php // Both switches save as soon as they are flipped (js/ai-settings-form.js), they have no form ?>
            <div class="git-config-fields">
                <div class="form-check">
                    <label class="switch">
                        <input type="checkbox" id="mcp_enabled" data-global-setting="ai_chat_mcp_enabled" <?php echo poznoteAiMcpEnabled() ? 'checked' : ''; ?>>
                        <span class="slider round"></span>
                    </label>
                    <div class="check-label">
                        <span class="label-title"><?php echo t_h('ai_mcp.enable_label', [], 'Allow external tools'); ?></span>
                        <span class="label-desc"><?php echo t_h('ai_mcp.enable_description', [], 'The assistant may call the tools of the servers connected below, and a globe button in the chat turns them on and off. What these tools return comes from outside Poznote, and what the assistant sends them leaves this instance.'); ?></span>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <?php if (poznoteAiMcpScopeAllowed($scope)): ?>
            <?php foreach ($servers as $server): ?>
            <?php
                $prefix = 'mcp_' . $server['id'];
                $toolCount = count(array_filter(array_column($server['tools'], 'enabled')));
                $server['headers_text'] = aiUpstreamMaskHeaders($server['headers']);
            ?>
            <div class="ai-mcp-server">
                <div class="ai-mcp-server-head">
                    <span class="ai-mcp-server-name"><?php echo poznoteAiMcpH($server['name']); ?></span>
                    <span class="ai-mcp-server-status"><?php echo $server['enabled']
                        ? t_h('ai_mcp.server_status', ['count' => $toolCount, 'total' => count($server['tools'])], '{{count}} of {{total}} tool(s) in use')
                        : t_h('ai_mcp.server_status_off', [], 'Turned off'); ?></span>
                </div>
                <form method="post">
                    <input type="hidden" name="action" value="mcp_server">
                    <input type="hidden" name="mcp_server_id" value="<?php echo $server['id']; ?>">
                    <div class="git-config-fields">
                        <div class="form-check">
                            <label class="switch">
                                <input type="checkbox" name="mcp_enabled" id="<?php echo $prefix; ?>_enabled" <?php echo $server['enabled'] ? 'checked' : ''; ?>>
                                <span class="slider round"></span>
                            </label>
                            <div class="check-label">
                                <span class="label-title"><?php echo t_h('ai_mcp.server_enabled_label', [], 'Use this server'); ?></span>
                            </div>
                        </div>

                        <?php poznoteAiMcpRenderServerFields($server, $prefix); ?>

                        <div class="git-field-group">
                            <span class="git-field-label"><?php echo t_h('ai_mcp.tools_label', [], 'Tools the assistant may call'); ?></span>
                            <?php if ($server['tools'] === []): ?>
                            <p class="config-hint"><?php echo t_h('ai_mcp.tools_empty', [], 'No tools yet. Check the connection to read the tools this server offers.'); ?></p>
                            <?php else: ?>
                            <div class="ai-user-list">
                                <?php foreach ($server['tools'] as $toolIndex => $tool): ?>
                                <label class="ai-user" for="<?php echo $prefix . '_tool_' . $toolIndex; ?>" title="<?php echo poznoteAiMcpH($tool['description']); ?>">
                                    <input type="checkbox" id="<?php echo $prefix . '_tool_' . $toolIndex; ?>" name="mcp_tools[]"
                                           value="<?php echo poznoteAiMcpH($tool['name']); ?>" <?php echo $tool['enabled'] ? 'checked' : ''; ?>>
                                    <span class="ai-user-copy">
                                        <span class="ai-user-name"><?php echo poznoteAiMcpH($tool['name']); ?></span>
                                        <?php if ($tool['description'] !== ''): ?>
                                        <span class="ai-user-meta"><?php echo poznoteAiMcpH($tool['description']); ?></span>
                                        <?php endif; ?>
                                    </span>
                                </label>
                                <?php endforeach; ?>
                            </div>
                            <?php endif; ?>
                        </div>

                        <div class="git-field-actions">
                            <button type="submit" name="mcp_do" value="save" class="btn btn-primary">
                                <i class="lucide lucide-save"></i>
                                <?php echo t_h('common.save', [], 'Save'); ?>
                            </button>
                            <button type="submit" name="mcp_do" value="check" class="btn btn-secondary">
                                <i class="lucide lucide-plug"></i>
                                <?php echo t_h('ai_mcp.check_button', [], 'Check and refresh tools'); ?>
                            </button>
                            <button type="submit" name="mcp_do" value="delete" class="btn btn-secondary" formnovalidate>
                                <i class="lucide lucide-trash-2"></i>
                                <?php echo t_h('common.delete', [], 'Delete'); ?>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            <?php endforeach; ?>

            <?php if (count($servers) < AI_MCP_MAX_SERVERS): ?>
            <div class="ai-mcp-server">
                <div class="ai-mcp-server-head">
                    <span class="ai-mcp-server-name"><?php echo t_h('ai_mcp.add_title', [], 'Add a server'); ?></span>
                </div>
                <form method="post">
                    <input type="hidden" name="action" value="mcp_add">
                    <div class="git-config-fields">
                        <?php poznoteAiMcpRenderServerFields([
                            'name' => $draft ? (string)($_POST['mcp_name'] ?? '') : '',
                            'url' => $draft ? (string)($_POST['mcp_url'] ?? '') : '',
                            'api_key' => '',
                            'headers_text' => $draft ? (string)($_POST['mcp_headers'] ?? '') : '',
                        ], 'mcp_new'); ?>
                        <div class="git-field-actions">
                            <button type="submit" class="btn btn-primary">
                                <i class="lucide lucide-plus"></i>
                                <?php echo t_h('ai_mcp.add_button', [], 'Add and read its tools'); ?>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            <?php endif; ?>
            <?php endif; ?>

            <?php if ($scope === 'instance'): ?>
            <?php // Without external tools, users have no servers to connect: the switch waits for the first one ?>
            <div class="git-config-fields">
                <div class="form-check">
                    <label class="switch">
                        <input type="checkbox" id="mcp_user_servers_enabled" data-global-setting="ai_chat_mcp_user_servers_enabled" <?php echo (string)getGlobalSetting('ai_chat_mcp_user_servers_enabled', '0') === '1' ? 'checked' : ''; ?> <?php echo poznoteAiMcpEnabled() ? '' : 'disabled'; ?>>
                        <span class="slider round"></span>
                    </label>
                    <div class="check-label">
                        <span class="label-title"><?php echo t_h('ai_mcp.user_servers_label', [], 'Allow users to connect their own servers'); ?></span>
                        <span class="label-desc"><?php echo t_h('ai_mcp.user_servers_description', [], 'Every user gets an External tools section in their own AI assistant settings. Their servers are called from the Poznote server, with the keys they enter there.'); ?></span>
                    </div>
                </div>
            </div>
            <?php endif; ?>
        </div>
    <?php
}

/**
 * Render the list of the assistant's own tools, each one a checkbox the
 * user can clear (ai_settings_user.php, for every user).
 */
function poznoteAiMcpRenderBuiltinTools(?PDO $con): void {
    $disabled = poznoteAiDisabledTools($con);
    $readOnly = aiReadOnlyToolNames();
    $groups = [
        t('ai_mcp.builtin_read_label', [], 'Reading your notes') => $readOnly,
        t('ai_mcp.builtin_write_label', [], 'Changing your notes') => array_values(array_diff(array_keys(aiToolHandlers()), $readOnly)),
    ];
    ?>
        <div class="git-sync-section" id="ai-builtin-tools">
            <h2><i class="lucide lucide-wrench"></i> <?php echo t_h('ai_mcp.builtin_title', [], 'Assistant tools'); ?></h2>
            <p class="git-sync-description git-sync-description-left ai-mcp-intro"><?php echo t_h('ai_mcp.builtin_description', [], 'What the assistant can do with your notes. Untick a tool to keep the assistant from using it. With the whole second list unticked, the assistant can still read your notes but no longer change them: the cautious choice when it also searches the web.'); ?></p>

            <form method="post">
                <input type="hidden" name="action" value="ai_tools">
                <div class="git-config-fields">
                    <?php foreach ($groups as $groupLabel => $toolNames): ?>
                    <div class="git-field-group">
                        <span class="git-field-label"><?php echo poznoteAiMcpH($groupLabel); ?></span>
                        <div class="ai-user-list">
                            <?php foreach ($toolNames as $toolName): ?>
                            <label class="ai-user" for="ai_tool_<?php echo $toolName; ?>">
                                <input type="checkbox" id="ai_tool_<?php echo $toolName; ?>" name="ai_tools[]"
                                       value="<?php echo $toolName; ?>" <?php echo in_array($toolName, $disabled, true) ? '' : 'checked'; ?>>
                                <span class="ai-user-copy">
                                    <span class="ai-user-name"><?php echo $toolName; ?></span>
                                </span>
                            </label>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endforeach; ?>

                    <div class="git-field-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('ai_mcp.builtin_save', [], 'Save tools'); ?>
                        </button>
                    </div>
                </div>
            </form>
        </div>
    <?php
}
