<!-- Background Image Settings Modal -->
<div id="backgroundImageModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><?php echo t_h('modals.background_image.title', [], 'Background Image Settings'); ?></h3>
        </div>
        <div class="modal-body">
            <p><?php echo t_h('modals.background_image.description', [], 'Upload a background image for your workspace. You can adjust the opacity to make it subtle.'); ?></p>
            
            <div class="background-preview-container" id="backgroundPreviewContainer">
                <div class="background-preview" id="backgroundPreview">
                    <p class="no-background-text"><?php echo t_h('modals.background_image.no_image', [], 'No background image set'); ?></p>
                </div>
            </div>
            
            <div class="background-upload-controls">
                <input type="file" id="backgroundImageInput" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style="display: none;">
                <button type="button" class="btn-secondary" id="uploadBackgroundBtn">
                    <?php echo t_h('modals.background_image.upload', [], 'Upload Image'); ?>
                </button>
                <button type="button" class="btn-danger" id="removeBackgroundBtn" style="display: none;">
                    <?php echo t_h('modals.background_image.remove', [], 'Remove'); ?>
                </button>
            </div>
            
            <div class="background-opacity-control">
                <label for="backgroundOpacityInput">
                    <?php echo t_h('modals.background_image.opacity', [], 'Background Opacity'); ?>: 
                    <span id="backgroundOpacityValue">30</span>%
                </label>
                <input type="range" id="backgroundOpacityInput" min="5" max="25" step="1" value="25">
            </div>
        </div>
        <div class="modal-buttons">
            <button type="button" class="btn-cancel" id="cancelBackgroundBtn"><?php echo t_h('common.cancel'); ?></button>
            <button type="button" class="btn-primary" id="saveBackgroundBtn"><?php echo t_h('common.save'); ?></button>
        </div>
    </div>
</div>
