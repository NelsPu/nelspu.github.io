const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function setup(extra = {}) {
    const listeners = {};
    const context = vm.createContext({
        document: { addEventListener: (event, fn) => { listeners[event] = fn; } },
        AbortController, setTimeout, clearTimeout, console, ...extra
    });
    vm.runInContext(source, context);
    return { context, listeners };
}

test('failed and malformed project responses reject, allowing the error UI', async () => {
    for (const response of [{ ok: false, status: 503 }, { ok: true, json: async () => ({}) }]) {
        const { context } = setup({ fetch: async () => response });
        await assert.rejects(context.fetchProjects());
    }
});

test('a stalled JSON body is aborted and its timeout is cleared', async () => {
    let fireTimeout, cleared = false;
    let bodyStarted;
    const ready = new Promise(resolve => { bodyStarted = resolve; });
    const { context } = setup({
        setTimeout: fn => { fireTimeout = fn; return 1; },
        clearTimeout: () => { cleared = true; },
        fetch: async (_, { signal }) => ({ ok: true, json: () => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
            bodyStarted();
        }) })
    });
    const request = context.fetchProjects();
    await ready;
    fireTimeout();
    await assert.rejects(request, /aborted/);
    assert.equal(cleared, true);
});

test('clipboard permission failure selects all five fields for manual copying', async () => {
    let copy, selected = false;
    const template = { value: '案場地區：\n房屋類型：\n室內坪數：\n預計交屋時間：\n預算方向：', focus() {}, select() {}, setSelectionRange(start, end) { selected = start === 0 && end === this.value.length; } };
    const button = { hidden: true, addEventListener: (_, fn) => { copy = fn; } };
    const status = {};
    const { context } = setup({ document: { addEventListener() {}, getElementById: id => ({ 'copy-consultation': button, 'consultation-template': template, 'copy-status': status }[id]) }, navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
    context.initConsultationCopy();
    await copy();
    assert.equal(button.hidden, false);
    assert.equal(selected, true);
    assert.match(status.textContent, /格式已選取/);
});

test('contact tracking records only method, placement and page path', () => {
    let recorded;
    const { context, listeners } = setup({ window: { gtag: (...args) => { recorded = args; }, location: { pathname: '/project.html' } } });
    context.initContactTracking();
    const link = { getAttribute: () => 'mailto:private@example.com?body=not-for-analytics', dataset: {}, classList: { contains: () => false }, closest: () => null };
    listeners.click({ target: { closest: () => link } });
    assert.equal(recorded[1], 'contact_click');
    assert.deepEqual(JSON.parse(JSON.stringify(recorded[2])), { contact_method: 'email', contact_location: 'content', page_path: '/project.html' });
});
