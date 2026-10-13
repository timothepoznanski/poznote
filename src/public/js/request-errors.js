/**
 * Request failures, told apart.
 *
 * Loaded on every page whose scripts report a failed API call to the user,
 * before those scripts. Kept out of js/modal-alerts.js because some of these
 * pages (trash.php, tasks.php, offline.php) show their errors without it.
 */

// An error modal used to say "Network error" or a fixed sentence whenever the
// API did not answer with its own {"error": ...}: a proxy page, an empty 500
// and an unplugged cable all read the same (issue 1618). These two helpers
// keep the one clue that tells them apart.

/**
 * response.json() that remembers the HTTP status. The parsed object carries it
 * in a hidden _httpStatus; a body that is not JSON rejects with an Error whose
 * httpStatus is set, so the caller's catch can name it.
 */
window.readApiJson = function(response) {
    return response.text().then(function(text) {
        var data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            var error = new Error('HTTP ' + response.status);
            error.httpStatus = response.status;
            throw error;
        }

        if (data && typeof data === 'object') {
            try {
                Object.defineProperty(data, '_httpStatus', { value: response.status, enumerable: false });
            } catch (e) { /* frozen or exotic object: the status is only a bonus */ }
        }
        return data;
    });
};

/**
 * The message an error modal should show for a failed request.
 * source: the parsed API answer, a Response, or what a catch received.
 * The API's own message wins; otherwise the fallback is completed with the
 * cause: "(HTTP 502)", "(network error)" or the exception's text. Without a
 * fallback the cause stands alone, for callers that prefix it themselves.
 */
window.apiErrorMessage = function(source, fallback) {
    var translate = (typeof window.t === 'function') ? window.t : function(key, vars, text) { return text; };
    var isError = source instanceof Error;

    if (source && !isError && typeof source === 'object') {
        if (typeof source.error === 'string' && source.error) return source.error;
        if (typeof source.message === 'string' && source.message) return source.message;
    }
    if (typeof source === 'string' && source) return source;

    var networkText = translate('ui.alerts.network_error', {}, 'Network error');
    var text = fallback || translate('ui.alerts.request_failed', {}, 'The request failed');
    var status = source ? Number(source.httpStatus || source._httpStatus || source.status) || 0 : 0;
    var detail = '';

    if (status) {
        detail = 'HTTP ' + status;
    } else if (isError && /^(Failed to fetch|Load failed|NetworkError|Network request failed)/i.test(source.message || '')) {
        // What Chromium, Safari and Firefox call a request that never arrived.
        if (!fallback) return networkText;
        if (/network/i.test(text) || text.indexOf(networkText) !== -1) return text;
        detail = networkText.charAt(0).toLowerCase() + networkText.slice(1);
    } else if (isError && source.message) {
        // Thrown by the caller with the API's message, or a script error:
        // on its own when there is no sentence to attach it to.
        if (!fallback) return source.message;
        detail = source.message;
    }

    if (!detail) return text;

    var endsWithPeriod = /\.$/.test(text);
    return text.replace(/[.:\s]+$/, '') + ' (' + detail + ')' + (endsWithPeriod ? '.' : '');
};
