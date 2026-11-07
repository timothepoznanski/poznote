<?php
/**
 * The per-user access list of the two admin pages that grant an instance
 * server profile by profile: AI Assistant (ai_settings.php, ai_chat_enabled)
 * and Transcription (stt_settings.php, stt_enabled).
 *
 * The markup lived twice, once per page, and the admin rule below is the kind
 * of thing that must not drift between them: administrators always have
 * access, whatever the column says (see isAiChatAllowedForUser() and
 * isSttAllowedForUser() in users/db_master.php). Their row is therefore shown
 * ticked and disabled, with a badge saying so, rather than offering a choice
 * that has no effect. A disabled checkbox posts nothing, which is why the
 * setters leave administrator rows exactly as they are.
 *
 * Styles live in css/allowed-users.css, the filter in the page's own script.
 */

if (!function_exists('poznoteRenderAllowedUsersList')) {

/**
 * @param array  $candidates     rows of listAiChatCandidates() / listSttCandidates()
 * @param string $prefix         'ai' or 'stt': names the ids and the field
 * @param string $enabledColumn  the column holding the per-user opt-in
 */
function poznoteRenderAllowedUsersList(array $candidates, string $prefix, string $enabledColumn): void {
    $h = function ($value) { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); };
    $alwaysLabel = t('ai_settings.users_admin_always', [], 'Always allowed');
    $alwaysHint = t('ai_settings.users_admin_always_hint', [], 'Administrators always have access to the configuration on this page.');
    ?>
                        <div class="ai-user-list">
                            <?php foreach ($candidates as $candidate): ?>
                                <?php
                                    $candidateId = (int)$candidate['id'];
                                    $candidateUsername = (string)$candidate['username'];
                                    $candidateName = trim(trim((string)($candidate['first_name'] ?? '')) . ' ' . trim((string)($candidate['last_name'] ?? '')));
                                    if ($candidateName === '') {
                                        $candidateName = $candidateUsername;
                                    }
                                    // The second line only adds information when it is not
                                    // just the name again
                                    $candidateMeta = ($candidateName === $candidateUsername) ? '' : $candidateUsername;
                                    $candidateIsAdmin = !empty($candidate['is_admin']);
                                    if ($candidateIsAdmin) {
                                        $adminTag = t('ai_settings.users_admin', [], 'Administrator');
                                        $candidateMeta = ($candidateMeta === '') ? $adminTag : $candidateMeta . ' · ' . $adminTag;
                                    }
                                ?>
                                <label class="ai-user<?php echo $candidateIsAdmin ? ' ai-user-always' : ''; ?>"
                                       for="<?php echo $h($prefix); ?>_user_<?php echo $candidateId; ?>"
                                       <?php echo $candidateIsAdmin ? 'title="' . $h($alwaysHint) . '"' : ''; ?>>
                                    <input
                                        type="checkbox"
                                        id="<?php echo $h($prefix); ?>_user_<?php echo $candidateId; ?>"
                                        name="<?php echo $h($prefix); ?>_user_ids[]"
                                        value="<?php echo $candidateId; ?>"
                                        <?php echo $candidateIsAdmin ? 'checked disabled' : (!empty($candidate[$enabledColumn]) ? 'checked' : ''); ?>>
                                    <span class="ai-user-copy">
                                        <span class="ai-user-name"><?php echo $h($candidateName); ?></span>
                                        <?php if ($candidateMeta !== ''): ?>
                                        <span class="ai-user-meta"><?php echo $h($candidateMeta); ?></span>
                                        <?php endif; ?>
                                    </span>
                                    <?php if ($candidateIsAdmin): ?>
                                    <span class="ai-user-badge"><?php echo $h($alwaysLabel); ?></span>
                                    <?php endif; ?>
                                </label>
                            <?php endforeach; ?>
                            <div class="ai-user-empty" id="<?php echo $h($prefix); ?>-user-filter-empty" hidden><?php echo t_h('ai_settings.users_filter_empty', [], 'No user matches this filter.'); ?></div>
                        </div>
    <?php
}

}
