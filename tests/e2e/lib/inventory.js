// What Poznote offers, read from its own sources rather than from anyone's memory:
// when a route, a slash command, a setting, a toolbar action... appears in the code,
// it shows up here, and lib/coverage.js refuses to pass until the feature catalog
// claims it. Each extractor is a plain regex over the sources, on purpose: it must
// keep working when the code around it moves.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(SRC, 'public');

function walk(dir, keep, found = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!['vendor', 'node_modules', 'data', 'webfonts', 'api-docs'].includes(entry.name)) walk(full, keep, found);
        } else if (keep(entry.name)) {
            found.push(full);
        }
    }
    return found;
}

const read = (file) => fs.readFileSync(file, 'utf8');
const unique = (values) => [...new Set(values)].sort();
const captures = (text, regex) => [...text.matchAll(regex)].map((match) => match[1]);

const phpFiles = walk(SRC, (name) => name.endsWith('.php'));
const jsFiles = walk(path.join(PUBLIC, 'js'), (name) => name.endsWith('.js'));
const allPhp = phpFiles.map(read).join('\n');
const allJs = jsFiles.map(read).join('\n');
const router = read(path.join(PUBLIC, 'api', 'v1', 'index.php'));
const slash = read(path.join(PUBLIC, 'js', 'slash-command.js'));
const mcp = read(path.join(ROOT, 'mcp-server', 'src', 'poznote_mcp', 'server.py'));

/** "GET /notes/{id}", every route of the REST API. */
const routes = () => unique([...router.matchAll(/\$router->(get|post|put|patch|delete)\(\s*'([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`));

/** Every PHP script a browser can reach, relative to the document root. */
const pages = () => unique(walk(PUBLIC, (name) => name.endsWith('.php'))
    .map((file) => path.relative(PUBLIC, file))
    .filter((file) => !file.startsWith(`api${path.sep}`)));

/** Actions wired through data-action, in the markup and in the scripts. */
const actions = () => unique(captures(`${allPhp}\n${allJs}`, /data-action=\\?["']([a-z0-9][a-z0-9_-]*)\\?["']/g));

/** Items of the slash menu declared by a literal id. */
const slashItems = () => unique(captures(slash, /\bid:\s*'([a-z0-9-]+)'/g));

/** Keys of the per-user and global settings. */
const settings = () => {
    const php = captures(allPhp, /\b(?:getSetting|getGlobalSetting|setSetting|setGlobalSetting|getUserSetting|setUserSetting)\(\s*(?:\$[a-zA-Z]+\s*,\s*)?'([a-z0-9_]+)'/g);
    const api = captures(allJs, /settings\/([a-z][a-z0-9_]+)\b/g);
    const helpers = captures(allJs, /\b(?:saveSettingValue|loadSettingValue|putSetting|saveSetting)\(\s*'([a-z0-9_]+)'/g);
    const toggles = captures(allJs, /setupToggleCard\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([a-z0-9_]+)'/g);
    return unique([...php, ...api, ...helpers, ...toggles].filter((key) => /^[a-z]/.test(key)));
};

/** Cards of the settings page. */
const cards = () => unique(captures(allPhp, /id=\\?["']([a-z0-9-]+-card)\\?["']/g));

/** Tools the MCP server exposes. */
const mcpTools = () => unique(captures(mcp, /@_tool\(\)\s*\n(?:@[^\n]*\n)*def ([a-z_]+)\(/g));

const themes = () => unique(captures(read(path.join(SRC, 'theme_catalog.php')), /'id'\s*=>\s*'([a-z0-9-]+)'/g));
const languages = () => unique(fs.readdirSync(path.join(SRC, 'i18n')).filter((name) => name.endsWith('.json')).map((name) => name.replace('.json', '')));
const modals = () => unique(captures(`${allPhp}\n${allJs}`, /id=\\?["']([a-zA-Z][a-zA-Z0-9_-]*Modal)\\?["']/g));

const KINDS = { route: routes, page: pages, action: actions, slash: slashItems, setting: settings, card: cards, mcp: mcpTools, theme: themes, lang: languages, modal: modals };

module.exports = { KINDS, ROOT, inventory: () => Object.fromEntries(Object.entries(KINDS).map(([kind, extract]) => [kind, extract()])) };
