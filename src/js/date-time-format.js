(function () {
    'use strict';

    function normalizeFormat(value) {
        if (typeof value === 'string' && value.indexOf('custom:') === 0 && value.slice(7).trim() !== '') {
            return 'custom:' + value.slice(7).trim();
        }

        var allowed = {
            default: true,
            ymd_hi: true,
            ymd_his: true,
            dmy_hi: true,
            mdy_hia: true
        };
        return allowed[value] ? value : 'default';
    }

    function getConfiguredFormat() {
        var configValue = window.POZNOTE_CONFIG && typeof window.POZNOTE_CONFIG.dateTimeFormat === 'string'
            ? window.POZNOTE_CONFIG.dateTimeFormat
            : '';
        var bodyValue = document.body ? document.body.getAttribute('data-date-time-format') : '';
        return normalizeFormat(configValue || bodyValue || 'default');
    }

    function parseDate(value, options) {
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        if (!value) {
            return null;
        }

        var normalized = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
            normalized = normalized.replace(' ', 'T');
            if (options && options.utc) {
                normalized += 'Z';
            }
        }

        var date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function normalizeCustomPattern(pattern) {
        return String(pattern || '')
            .trim()
            .replace(/\b(HH|hh|h):MM:SS\b/g, '$1:mm:ss')
            .replace(/\b(HH|hh|h):MM\b/g, '$1:mm');
    }

    function formatCustomPattern(date, pattern) {
        var hours12Number = (date.getHours() % 12) || 12;
        var values = {
            YYYY: String(date.getFullYear()),
            YY: String(date.getFullYear()).slice(-2),
            MM: pad(date.getMonth() + 1),
            DD: pad(date.getDate()),
            HH: pad(date.getHours()),
            hh: pad(hours12Number),
            h: String(hours12Number),
            mm: pad(date.getMinutes()),
            ss: pad(date.getSeconds()),
            SS: pad(date.getSeconds()),
            A: date.getHours() >= 12 ? 'PM' : 'AM',
            a: date.getHours() >= 12 ? 'pm' : 'am'
        };

        return normalizeCustomPattern(pattern).replace(/YYYY|YY|MM|DD|HH|hh|h|mm|ss|SS|A|a/g, function (token) {
            return values[token];
        });
    }

    function formatDateTime(value, options) {
        var opts = options || {};
        var date = parseDate(value, opts);
        if (!date) {
            return value ? String(value) : '';
        }

        var format = getConfiguredFormat();
        if (format.indexOf('custom:') === 0) {
            return formatCustomPattern(date, format.slice(7));
        }

        var year = date.getFullYear();
        var month = pad(date.getMonth() + 1);
        var day = pad(date.getDate());
        var hours24 = pad(date.getHours());
        var minutes = pad(date.getMinutes());
        var seconds = pad(date.getSeconds());

        if (format === 'default' || format === 'ymd_hi') {
            return year + '-' + month + '-' + day + ' ' + hours24 + ':' + minutes;
        }
        if (format === 'ymd_his') {
            return year + '-' + month + '-' + day + ' ' + hours24 + ':' + minutes + ':' + seconds;
        }
        if (format === 'dmy_hi') {
            return day + '/' + month + '/' + year + ' ' + hours24 + ':' + minutes;
        }

        var isPm = date.getHours() >= 12;
        var hours12 = pad((date.getHours() % 12) || 12);
        return month + '/' + day + '/' + year + ' ' + hours12 + ':' + minutes + ' ' + (isPm ? 'PM' : 'AM');
    }

    window.poznoteGetDateTimeFormat = getConfiguredFormat;
    window.poznoteFormatDateTime = formatDateTime;
})();
