<?php
/**
 * Client-side bootstrap of the transcription settings form, shared by
 * stt_settings.php and stt_settings_user.php.
 *
 * $sttSettingsScope says which configuration the page edits ('instance' or
 * 'user'): the test endpoint falls back to that configuration's stored key
 * when the field still shows the mask.
 *
 * @var string $sttSettingsScope
 * @var string $sttLocalHost
 * @var string $cache_v
 */
?>
    <script>
    window.poznoteSttSettingsScope = <?php echo json_encode($sttSettingsScope); ?>;
    window.poznoteSttSettingsI18n = {
        testing: <?php echo json_encode(t('ai_settings.testing', [], 'Testing connection...')); ?>,
        success: <?php echo json_encode(t('ai_settings.test_success', [], 'Connection successful. {{count}} model(s) available. Click a model below and save.')); ?>,
        failure: <?php echo json_encode(t('ai_settings.test_failure', [], 'Connection failed: {{error}}')); ?>,
        modelHint: <?php echo json_encode(t('ai_settings.model_empty_hint', ['button' => t('ai_settings.test', [], 'Check access and list models')], 'Click "{{button}}" above, then select one.')); ?>,
        modelNoneFound: <?php echo json_encode(t('stt_settings.model_none_found', [], 'This server lists no model. Type the model name into the field below if you know it, or check the server documentation.')); ?>,
        apiKeyOptional: <?php echo json_encode(t('ai_settings.api_key_label', [], 'API key (optional)')); ?>,
        apiKeyRequired: <?php echo json_encode(t('ai_settings.api_key_label_required', [], 'API key')); ?>
    };
    window.poznoteSttLocalHost = <?php echo json_encode($sttLocalHost); ?>;
    </script>
    <script src="js/stt-settings-form.js?v=<?php echo $cache_v; ?>"></script>
