// Override loadPoznoteI18n with an absolute URL — globals.js uses a relative
// path which breaks when the page is served from the admin/ subdirectory.
window.loadPoznoteI18n = function() {
    return fetch('/api/v1/system/i18n', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(j) {
            if (j && j.success && j.strings) {
                window.POZNOTE_I18N = { lang: j.lang || 'en', strings: j.strings };
                if (typeof window.applyI18nToDom === 'function') window.applyI18nToDom(document);
            }
        })
        .catch(function() {});
};
window.loadPoznoteI18n();

/**
 * Status Modal Helpers
 */
function showStatusAlert(title, message, onOk = null) {
    const modal = document.getElementById('statusModal');
    if (!modal) return;

    document.getElementById('statusModalTitle').textContent = title;
    document.getElementById('statusModalMessage').textContent = message;

    const confirmBtn = document.getElementById('statusModalConfirmBtn');
    const cancelBtn = document.getElementById('statusModalCancelBtn');

    if (confirmBtn) confirmBtn.style.setProperty('display', 'none', 'important');
    cancelBtn.style.setProperty('display', 'inline-flex', 'important');
    cancelBtn.textContent = 'OK';
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
        if (onOk) onOk();
    };

    modal.style.display = 'flex';
}

function showStatusConfirm(title, message, onConfirm) {
    const modal = document.getElementById('statusModal');
    if (!modal) return;

    document.getElementById('statusModalTitle').textContent = title;
    document.getElementById('statusModalMessage').textContent = message;

    const confirmBtn = document.getElementById('statusModalConfirmBtn');
    const cancelBtn = document.getElementById('statusModalCancelBtn');

    confirmBtn.style.setProperty('display', 'inline-flex', 'important');
    confirmBtn.textContent = 'OK';
    cancelBtn.style.setProperty('display', 'inline-flex', 'important');
    cancelBtn.textContent = window.t('common.cancel', null, 'Annuler');

    cancelBtn.onclick = () => modal.style.display = 'none';
    confirmBtn.onclick = () => {
        modal.style.display = 'none';
        onConfirm();
    };

    modal.style.display = 'flex';
}

/**
 * Handle reconstruction button click
 */
document.addEventListener('DOMContentLoaded', function() {
    const repairBtn = document.querySelector('[data-action="run-repair"]');
    if (repairBtn) {
        repairBtn.addEventListener('click', function() {
            runRepair(this);
        });
    }
});

// Override runRepair to skip the confirmation dialog
async function runRepair(btn) {
    const title = window.t('multiuser.admin.maintenance.repair_registry', null, 'Reconstruction');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="lucide lucide-loader-2 lucide-spin"></i> ' + window.t('multiuser.admin.processing', null, 'Processing...');

    try {
        const response = await fetch('/api/v1/admin/repair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        });
        const result = await response.json();

        if (result.success) {
            let successMsg = window.t('multiuser.admin.maintenance.repair_registry_success', null, "System registry repaired successfully:\n\n- {{scanned}} folders scanned\n- {{added}} users restored\n- {{links}} shared links rebuilt");
            successMsg = successMsg
                .replace('{{scanned}}', result.stats.users_scanned)
                .replace('{{added}}', result.stats.users_added)
                .replace('{{links}}', result.stats.links_rebuilt);

            if (result.stats.errors && result.stats.errors.length > 0) {
                successMsg += '\n\n' + window.t('multiuser.admin.errors_label', null, 'Errors:') + '\n' + result.stats.errors.join('\n');
            }

            showStatusAlert(title, successMsg, () => window.location.reload());
        } else {
            const errorMsg = window.t('multiuser.admin.maintenance.repair_registry_error', null, 'Repair error: {{error}}');
            showStatusAlert(title, errorMsg.replace('{{error}}', result.error));
        }
    } catch (e) {
        const networkErrorPrefix = window.t('multiuser.admin.network_error', null, 'Network error: ');
        showStatusAlert(title, networkErrorPrefix + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}
