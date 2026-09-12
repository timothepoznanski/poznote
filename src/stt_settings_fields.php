<?php
/**
 * The provider / URL / key / model / language block of the transcription
 * settings, shared by stt_settings.php (instance) and stt_settings_user.php
 * (personal).
 *
 * The AI assistant pages carry two copies of the equivalent block and they
 * have already drifted; there is no reason to repeat that here. Both callers
 * define $sttConfig (the array shape poznoteSttInstanceConfig() and
 * poznoteSttUserConfig() both return), $sttProvider and $sttLocalHost.
 *
 * @var array $sttConfig
 * @var string $sttProvider
 * @var string $sttLocalHost
 */
?>
                    <div class="git-field-group">
                        <label class="git-field-label" for="stt_provider"><?php echo t_h('stt_settings.provider_label', [], 'Transcription server'); ?></label>
                        <select name="stt_provider" id="stt_provider" class="git-field-input">
                            <option value="speaches" <?php echo $sttProvider === 'speaches' ? 'selected' : ''; ?>>Speaches (local)</option>
                            <option value="whispercpp" <?php echo $sttProvider === 'whispercpp' ? 'selected' : ''; ?>>whisper.cpp (local)</option>
                            <option value="localai" <?php echo $sttProvider === 'localai' ? 'selected' : ''; ?>>LocalAI (local)</option>
                            <option value="openai" <?php echo $sttProvider === 'openai' ? 'selected' : ''; ?>>OpenAI</option>
                            <option value="custom" <?php echo $sttProvider === 'custom' ? 'selected' : ''; ?>><?php echo t_h('ai_settings.provider_custom', [], 'Other (custom URL)'); ?></option>
                        </select>
                    </div>

                    <div class="git-field-group" id="stt-url-group">
                        <label class="git-field-label" for="stt_url"><?php echo t_h('ai_settings.url_label', [], 'Server URL'); ?></label>
                        <input type="text" name="stt_url" id="stt_url" class="git-field-input"
                               value="<?php echo htmlspecialchars($sttConfig['url']); ?>"
                               placeholder="http://<?php echo htmlspecialchars($sttLocalHost); ?>:8000">
                        <span class="label-desc"><?php echo t_h('stt_settings.url_description', [], 'Base URL of a server exposing POST /v1/audio/transcriptions. For a container running on the Docker host, use http://host.docker.internal:8000'); ?></span>
                    </div>

                    <div class="git-field-group" id="stt-key-group">
                        <label class="git-field-label" for="stt_api_key" id="stt-key-label"><?php echo t_h('ai_settings.api_key_label', [], 'API key (optional)'); ?></label>
                        <input type="password" name="stt_api_key" id="stt_api_key" class="git-field-input"
                               value="<?php echo $sttConfig['api_key'] !== '' ? '••••••••' : ''; ?>"
                               placeholder="sk-..." autocomplete="off">
                        <span class="label-desc" id="stt-key-desc"><?php echo t_h('stt_settings.api_key_description', [], 'Leave empty for a local server that asks for none. Required for OpenAI.'); ?></span>
                    </div>

                    <div class="git-field-actions">
                        <button type="button" id="stt-test-btn" class="btn btn-secondary">
                            <i class="lucide lucide-plug"></i>
                            <?php echo t_h('ai_settings.test', [], 'Check access and list models'); ?>
                        </button>
                    </div>
                    <div id="stt-test-result" class="config-hint" hidden></div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="stt_model"><?php echo t_h('ai_settings.model_label', [], 'Model'); ?></label>
                        <?php
                        // A free text field with a datalist rather than the AI page's
                        // select: whisper.cpp answers /v1/models with nothing at all,
                        // and a select would then leave no way to name the model. The
                        // test fills the list when the server does offer one.
                        ?>
                        <input type="text" name="stt_model" id="stt_model" class="git-field-input"
                               value="<?php echo htmlspecialchars($sttConfig['model']); ?>"
                               list="stt-model-options" autocomplete="off"
                               placeholder="Systran/faster-whisper-small">
                        <datalist id="stt-model-options"></datalist>
                        <span class="label-desc"><?php echo t_h('stt_settings.model_description', [], 'A Whisper model such as Systran/faster-whisper-small. Check access above to list what the server offers. whisper.cpp serves the single model it was started with and ignores this, but a value is still required.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="stt_language"><?php echo t_h('stt_settings.language_label', [], 'Spoken language'); ?></label>
                        <input type="text" name="stt_language" id="stt_language" class="git-field-input"
                               value="<?php echo htmlspecialchars($sttConfig['language']); ?>"
                               placeholder="fr" maxlength="2" autocomplete="off"
                               pattern="[A-Za-z]{2}">
                        <span class="label-desc"><?php echo t_h('stt_settings.language_description', [], 'Two-letter code such as en, fr or de. Leave empty to let the server detect the language, which is what Whisper does well; set it when you always dictate in the same one and short sentences get mistaken for another.'); ?></span>
                    </div>
