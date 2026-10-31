// Shared by every spec: API client, throwaway accounts, a `page` that fails the
// test on any browser-side error, and small ZIP and TOTP helpers (no dependency
// beyond Playwright).
const base = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BASE_URL = process.env.POZNOTE_E2E_URL || 'http://127.0.0.1:8199';
const ADMIN = { username: 'admin_change_me', password: 'admin', id: 1 };
const content = (name) => fs.readFileSync(path.join(__dirname, '..', 'content', name), 'utf8');
const KITCHEN_MD = content('kitchen-sink.md');
const KITCHEN_HTML = content('kitchen-sink.html');
// A real 1x1 PNG, built here so that no binary sits in the repository
const PNG = (() => {
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
        return Buffer.concat([head, body, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(Buffer.from([0, 37, 99, 235]))), chunk('IEND', Buffer.alloc(0))]);
})();

/** API v1 as one account. Every call returns {status, json, text, body, headers}. */
class Api {
    constructor(context, account) { this.context = context; this.account = account; }

    static async open(playwright, account) {
        const auth = Buffer.from(`${account.username}:${account.password}`).toString('base64');
        const context = await playwright.request.newContext({
            baseURL: BASE_URL,
            extraHTTPHeaders: { Authorization: `Basic ${auth}`, 'X-User-ID': String(account.id) },
        });
        return new Api(context, account);
    }

    async call(method, url, options = {}) {
        const target = url.startsWith('/') && !url.startsWith('/api') && !options.raw ? `/api/v1${url}` : url;
        const response = await this.context.fetch(target, {
            method, maxRedirects: 0, timeout: 45_000,
            data: options.json, multipart: options.multipart, form: options.form, params: options.params,
        });
        const body = await response.body();
        const text = body.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return { status: response.status(), headers: response.headers(), body, text, json };
    }

    get(url, options) { return this.call('GET', url, options); }
    post(url, json = {}, options = {}) { return this.call('POST', url, { json, ...options }); }
    put(url, json = {}) { return this.call('PUT', url, { json }); }
    patch(url, json = {}) { return this.call('PATCH', url, { json }); }
    del(url, options) { return this.call('DELETE', url, options); }

    /** Fails with the status and the body, which is what a report reader needs. */
    async ok(promise, statuses = [200, 201]) {
        const response = await promise;
        base.expect(statuses, `HTTP ${response.status}: ${response.text.slice(0, 300)}`).toContain(response.status);
        return response;
    }

    async createNote(fields) {
        const { json } = await this.ok(this.post('/notes', fields));
        return json.note || json;
    }

    async getNote(id) { return (await this.ok(this.get(`/notes/${id}`))).json.note; }
    async dispose() { await this.context.dispose(); }
}

let accountCounter = 0;

/** A new account, so that no spec depends on what another one left behind. */
async function newAccount(playwright, prefix = 'e2e', fixedName = false) {
    const admin = await Api.open(playwright, ADMIN);
    const username = fixedName ? prefix : `${prefix}-${process.pid}-${++accountCounter}`;
    const password = `Pass-${username}-2026`;
    const created = await admin.ok(admin.post('/admin/users', { username }));
    const id = (created.json.user || created.json).id;
    await admin.ok(admin.post(`/admin/users/${id}/reset-password`, { action: 'set_password', new_password: password }));
    await admin.dispose();
    return { username, password, id };
}

/** Signs in through the form and dismisses the start guide. */
async function login(page, account) {
    await page.goto('/login.php');
    await page.fill('#username', account.username);
    await page.fill('#password', account.password);
    await page.click('button.login-button');
    await page.waitForURL((url) => !url.toString().includes('login.php'));
    await page.evaluate(() => fetch('api/v1/settings/welcome_setup', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'done' }),
    }));
}

/** Quiet network, within reason: some pages poll, which must not fail a test. */
async function settled(page) {
    await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {});
}

async function openNote(page, id) {
    await page.goto(`/index.php?note=${id}`);
    await settled(page);
}

/** What the browser reports as wrong during a test. */
const test = base.test.extend({
    allowedErrors: [[], { option: true }],
    page: async ({ page, allowedErrors }, use, testInfo) => {
        const errors = [];
        const record = (text) => {
            if (!allowedErrors.some((pattern) => pattern.test(text))) errors.push(text);
        };
        page.on('pageerror', (error) => record(`JavaScript: ${error.message}`));
        page.on('console', (message) => {
            if (message.type() === 'error') record(`Console: ${message.text()} (${message.location().url})`);
        });
        page.on('response', (response) => {
            if (response.status() >= 500) record(`HTTP ${response.status()}: ${response.url()}`);
        });
        await use(page);
        if (errors.length > 0 && testInfo.status === testInfo.expectedStatus) {
            base.expect([...new Set(errors)], 'errors reported by the browser').toEqual([]);
        }
    },
});

// --- ZIP, just enough to read an archive and to write a small one --------------
function readZip(buffer) {
    const files = {};
    let end = buffer.length - 22;
    while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < 0) throw new Error('not a ZIP archive');
    let offset = buffer.readUInt32LE(end + 16);
    const count = buffer.readUInt16LE(end + 10);
    for (let index = 0; index < count; index++) {
        const method = buffer.readUInt16LE(offset + 10);
        const size = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extra = buffer.readUInt16LE(offset + 30);
        const comment = buffer.readUInt16LE(offset + 32);
        const local = buffer.readUInt32LE(offset + 42);
        const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
        const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        const data = buffer.subarray(start, start + size);
        files[name] = method === 8 ? zlib.inflateRawSync(data) : data;
        offset += 46 + nameLength + extra + comment;
    }
    return files;
}

function writeZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, value] of Object.entries(entries)) {
        const data = Buffer.from(value);
        const nameBytes = Buffer.from(name);
        const crc = zlib.crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBytes, data);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + data.length;
    }
    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, directory, end]);
}

function totp(secret, stepOffset = 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of secret.toUpperCase().replace(/=+$/, '')) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
    const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
    const counter = Buffer.alloc(8);
    counter.writeUInt32BE(Math.floor(Date.now() / 30000) + stepOffset, 4);
    const hash = crypto.createHmac('sha1', key).update(counter).digest();
    const offset = hash[hash.length - 1] & 15;
    return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

/** Runs a command in the throwaway instance. */
function inInstance(command) {
    const container = process.env.POZNOTE_E2E_CONTAINER || 'poznote-e2e-8199';
    return execFileSync('docker', ['exec', container, 'sh', '-c', command], { encoding: 'utf8', timeout: 30_000 });
}

/** The CSRF token a page embeds, for the endpoints that only accept it. */
async function csrfOf(page, url) {
    const html = await (await page.request.get(url)).text();
    const match = html.match(/csrfToken["']?\s*[:=]\s*["']([0-9a-f]+)/) || html.match(/name="csrf_token" value="([^"]+)"/);
    if (!match) throw new Error(`no CSRF token in ${url}`);
    return match[1];
}

module.exports = { inInstance, csrfOf, test, expect: base.expect, Api, ADMIN, BASE_URL, KITCHEN_MD, KITCHEN_HTML, PNG, newAccount, login, openNote, settled, readZip, writeZip, totp };
