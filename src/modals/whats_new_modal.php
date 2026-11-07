<?php
/**
 * "What's new" popup (discussion 1446): the release notes of the versions
 * installed since the user last looked, shown by js/whats-new.js.
 *
 * Included by modals.php (shown by itself after an update) and by
 * settings.php, whose "Release notes" card of the About section reopens it
 * on demand (window.showWhatsNew()).
 */
?>
<!-- What's new: release notes shown once after an update (js/whats-new.js) -->
<div id="whatsNewModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="whatsNewTitle">
    <div class="modal-content whats-new-content">
        <div class="whats-new-header">
            <h3 id="whatsNewTitle"><?php echo t_h('whats_new.title', [], "What's new in Poznote"); ?></h3>
            <p class="whats-new-subtitle" id="whatsNewSubtitle"></p>
            <a class="whats-new-community" href="<?php echo htmlspecialchars(function_exists('poznoteAboutLink') ? poznoteAboutLink('discord_url') : 'https://discord.gg/fuEV6uqf4N', ENT_QUOTES); ?>" target="_blank" rel="noopener noreferrer"><i class="lucide lucide-message-circle"></i><span><?php echo t_h('whats_new.community', [], 'Questions or ideas? Join the community on Discord'); ?></span></a>
        </div>
        <div class="whats-new-versions" id="whatsNewVersions" role="navigation" aria-label="<?php echo t_h('whats_new.versions', [], 'Versions'); ?>" hidden></div>
        <div class="whats-new-body" id="whatsNewBody" tabindex="0"></div>
        <div class="whats-new-links">
            <a href="https://github.com/timothepoznanski/poznote" target="_blank" rel="noopener noreferrer"><i class="lucide lucide-star"></i><span><?php echo t_h('whats_new.star', [], 'Star on GitHub'); ?></span></a>
            <a href="https://ko-fi.com/timothepoznanski" target="_blank" rel="noopener noreferrer"><i class="lucide lucide-heart"></i><span><?php echo t_h('whats_new.donate', [], 'Support Poznote'); ?></span></a>
        </div>
        <div class="whats-new-footer">
            <label class="whats-new-never"><input type="checkbox" id="whatsNewNever"><span><?php echo t_h('whats_new.never', [], 'Do not show this after updates'); ?></span></label>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" id="whatsNewSaveNote"><?php echo t_h('whats_new.save_note', [], 'Save as note'); ?></button>
                <button type="button" class="btn-primary" id="whatsNewClose"><?php echo t_h('common.close'); ?></button>
            </div>
        </div>
    </div>
</div>
