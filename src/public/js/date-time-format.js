(function () {
    'use strict';

    // Day and month names per app language: mirror of getDateNameLocales() in
    // lib/datetime.php (tests/date-names.test.php keeps them equal). Kept as
    // strict JSON between the markers so the test can read it.
    var DATE_NAMES = /* date-names:start */
    {
        "en": {
            "layout": "{wd}, {month} {d}, {y}",
            "days": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            "days_short": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            "months": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
            "short": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        },
        "fr": {
            "layout": "{wd} {d} {month} {y}",
            "days": ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
            "days_short": ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."],
            "months": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
            "short": ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
        },
        "de": {
            "layout": "{wd}, {d}. {month} {y}",
            "days": ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
            "days_short": ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."],
            "months": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
            "short": ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."]
        },
        "es": {
            "layout": "{wd}, {d} de {month} de {y}",
            "days": ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
            "days_short": ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
            "months": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
            "short": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
        },
        "pt": {
            "layout": "{wd}, {d} de {month} de {y}",
            "days": ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"],
            "days_short": ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
            "months": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
            "short": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
        },
        "ru": {
            "layout": "{wd}, {d} {month} {y} г.",
            "days": ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
            "days_short": ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
            "months": ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
            "short": ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."]
        },
        "zh-cn": {
            "layout": "{y}年{m}月{d}日{wd}",
            "days": ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
            "days_short": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
            "months": ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
            "short": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
        }
    }
    /* date-names:end */;

    function getDateNames() {
        var config = window.POZNOTE_CONFIG || {};
        var lang = String(document.documentElement.lang || config.language || config.lang || 'en').toLowerCase();
        return DATE_NAMES[lang] || DATE_NAMES[lang.split('-')[0]] || DATE_NAMES.en;
    }

    function formatLongDate(date) {
        var names = getDateNames();
        var parts = {
            '{wd}': names.days[date.getDay()],
            '{month}': names.months[date.getMonth()],
            '{m}': String(date.getMonth() + 1),
            '{d}': String(date.getDate()),
            '{y}': String(date.getFullYear())
        };
        return names.layout.replace(/\{wd\}|\{month\}|\{m\}|\{d\}|\{y\}/g, function (token) {
            return parts[token];
        });
    }

    function normalizeFormat(value) {
        if (typeof value === 'string' && value.indexOf('custom:') === 0 && value.slice(7).trim() !== '') {
            return 'custom:' + value.slice(7).trim();
        }

        var allowed = {
            default: true,
            ymd_hi: true,
            ymd_his: true,
            dmy_hi: true,
            mdy_hia: true,
            long: true
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
        var names = getDateNames();
        var values = {
            YYYY: String(date.getFullYear()),
            YY: String(date.getFullYear()).slice(-2),
            MMMM: names.months[date.getMonth()],
            MMM: names.short[date.getMonth()],
            MM: pad(date.getMonth() + 1),
            dddd: names.days[date.getDay()],
            ddd: names.days_short[date.getDay()],
            DD: pad(date.getDate()),
            D: String(date.getDate()),
            HH: pad(date.getHours()),
            hh: pad(hours12Number),
            h: String(hours12Number),
            mm: pad(date.getMinutes()),
            ss: pad(date.getSeconds()),
            SS: pad(date.getSeconds()),
            A: date.getHours() >= 12 ? 'PM' : 'AM',
            a: date.getHours() >= 12 ? 'pm' : 'am'
        };

        return normalizeCustomPattern(pattern).replace(/YYYY|YY|MMMM|MMM|MM|dddd|ddd|DD|D|HH|hh|h|mm|ss|SS|A|a/g, function (token) {
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
        if (format === 'long') {
            return formatLongDate(date) + ' ' + hours24 + ':' + minutes;
        }
        if (format === 'dmy_hi') {
            return day + '/' + month + '/' + year + ' ' + hours24 + ':' + minutes;
        }

        var isPm = date.getHours() >= 12;
        var hours12 = pad((date.getHours() % 12) || 12);
        return month + '/' + day + '/' + year + ' ' + hours12 + ':' + minutes + ' ' + (isPm ? 'PM' : 'AM');
    }

    // Split a custom pattern into date and time halves: whitespace-separated
    // segments containing a date token belong to the date part, the remaining
    // segments with time tokens form the time part.
    function splitCustomPattern(pattern) {
        var segments = normalizeCustomPattern(pattern).split(/\s+/);
        var dateSegments = [];
        var timeSegments = [];

        segments.forEach(function (segment) {
            if (/YYYY|YY|MMM|MM|dddd|ddd|D/.test(segment)) {
                dateSegments.push(segment);
            } else if (/HH|hh|h|mm|ss|SS|A|a/.test(segment)) {
                timeSegments.push(segment);
            }
        });

        return {
            date: dateSegments.join(' '),
            time: timeSegments.join(' ')
        };
    }

    function formatDateOnly(value, options) {
        var opts = options || {};
        var date = parseDate(value, opts);
        if (!date) {
            return value ? String(value) : '';
        }

        var format = getConfiguredFormat();
        if (format.indexOf('custom:') === 0) {
            var datePattern = splitCustomPattern(format.slice(7)).date;
            return datePattern ? formatCustomPattern(date, datePattern) : formatDateTime(value, opts);
        }

        var year = date.getFullYear();
        var month = pad(date.getMonth() + 1);
        var day = pad(date.getDate());

        if (format === 'dmy_hi') {
            return day + '/' + month + '/' + year;
        }
        if (format === 'long') {
            return formatLongDate(date);
        }
        if (format === 'mdy_hia') {
            return month + '/' + day + '/' + year;
        }
        return year + '-' + month + '-' + day;
    }

    function formatTimeOnly(value, options) {
        var opts = options || {};
        var date = parseDate(value, opts);
        if (!date) {
            return value ? String(value) : '';
        }

        var format = getConfiguredFormat();
        if (format.indexOf('custom:') === 0) {
            var timePattern = splitCustomPattern(format.slice(7)).time;
            return timePattern ? formatCustomPattern(date, timePattern) : formatDateTime(value, opts);
        }

        var hours24 = pad(date.getHours());
        var minutes = pad(date.getMinutes());

        if (format === 'ymd_his') {
            return hours24 + ':' + minutes + ':' + pad(date.getSeconds());
        }
        if (format === 'mdy_hia') {
            var isPm = date.getHours() >= 12;
            var hours12 = pad((date.getHours() % 12) || 12);
            return hours12 + ':' + minutes + ' ' + (isPm ? 'PM' : 'AM');
        }
        return hours24 + ':' + minutes;
    }

    window.poznoteGetDateTimeFormat = getConfiguredFormat;
    window.poznoteFormatDateTime = formatDateTime;
    window.poznoteFormatDateOnly = formatDateOnly;
    window.poznoteFormatTimeOnly = formatTimeOnly;
})();
