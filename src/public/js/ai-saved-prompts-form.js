/**
 * Saved prompts section of ai_settings_user.php (discussion #1678): one fold
 * per prompt showing its name, opened on a click to edit it. "Add a prompt"
 * appends an open fold from #ai-prompt-template, the bin takes a fold out of
 * the form, and the name in a summary follows what is typed. The server
 * drops prompts left without a text when the form is saved.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var list = document.getElementById('ai-prompts-list');
        var addBtn = document.getElementById('ai-prompt-add');
        var template = document.getElementById('ai-prompt-template');
        if (!list || !addBtn || !template) return;
        var max = parseInt(addBtn.getAttribute('data-max'), 10) || 30;
        var newLabel = list.getAttribute('data-new-label') || 'New prompt';

        function folds() { return list.querySelectorAll('.ai-prompt'); }

        function updateAddButton() {
            addBtn.disabled = folds().length >= max;
        }

        function focusName(fold) {
            var name = fold.querySelector('input');
            if (name) name.focus();
        }

        addBtn.addEventListener('click', function () {
            if (folds().length >= max) return;
            // A new prompt still blank: write in that one
            var blank = Array.prototype.find.call(folds(), function (fold) {
                return fold.querySelector('input').value.trim() === ''
                    && fold.querySelector('textarea').value.trim() === '';
            });
            if (blank) {
                blank.open = true;
                focusName(blank);
                return;
            }
            list.appendChild(template.content.cloneNode(true));
            updateAddButton();
            focusName(list.lastElementChild);
        });

        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action="remove-prompt"]');
            if (!btn) return;
            // The bin sits in the summary: do not fold or unfold on the way
            e.preventDefault();
            var fold = btn.closest('.ai-prompt');
            if (fold) fold.remove();
            updateAddButton();
        });

        list.addEventListener('input', function (e) {
            if (e.target.tagName !== 'INPUT') return;
            var fold = e.target.closest('.ai-prompt');
            var name = fold && fold.querySelector('.ai-prompt-name');
            if (!name) return;
            var value = e.target.value.trim();
            name.textContent = value || newLabel;
            name.classList.toggle('ai-prompt-name-new', !value);
        });

        updateAddButton();
    });
})();
