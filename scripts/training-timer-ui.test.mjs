import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as core from '../training-timer/timer-core.mjs';

const source = readFileSync(new URL('../training-timer/app.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, '');
function setup() {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', hidden: false, disabled: false, textContent: '', style: {},
      listeners: {}, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute() {}, querySelectorAll() { return []; },
      close() { this.closed = true; }, showModal() {},
    });
    return nodes.get(selector);
  };
  const context = vm.createContext({ ...core, structuredClone,
    document: { querySelector: node, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null }, navigator: {}, window: { confirm: () => true },
    speechSynthesis: { cancel() {} }, clearInterval() {}, clearTimeout() {}, setTimeout: () => 1,
  });
  vm.runInContext(source, context);
  vm.runInContext(`store.templates.push(normalizeTemplate({ ...DEFAULT, id: 'next', name: '下一套', work: 45 }));`, context);
  const select = () => node('#template-list').listeners.click({ target: { closest: () => ({ dataset: { action: 'select' }, closest: () => ({ dataset: { id: 'next' } }) }) } });
  return { node, context, select, run: code => vm.runInContext(code, context) };
}

test('completed workout switches to the selected setup and can start a fresh session', async () => {
  const app = setup();
  app.run('session = createSession(current); session.done = true; finishSession();');
  await app.select();
  assert.equal(app.node('#timer-view').hidden, true);
  assert.equal(app.node('#setup-view').hidden, false);
  assert.equal(app.node('#start-plan-name').textContent, '下一套');
  assert.equal(app.node('#template-select').value, 'next');
  assert.equal(app.node('#pause-button').disabled, false);
  assert.equal(app.node('#skip-button').disabled, false);
  assert.equal(app.run('session'), null);
  app.run('requestWakeLock = async () => {}; startPhaseClock = () => {};');
  await app.node('#start-button').listeners.click();
  assert.equal(app.run('session.config.id'), 'next');
  assert.equal(app.run('session.config.work'), 45);
  assert.equal(app.run('session.done'), false);
});

for (const accepted of [false, true]) {
  test(`unfinished workout switch confirmation: ${accepted}`, async () => {
    const app = setup();
    app.run(`session = createSession(current); running = true; confirmAction = async () => ${accepted};`);
    await app.select();
    assert.equal(app.run('current.id'), accepted ? 'next' : 'basic');
    assert.equal(app.run('session === null'), accepted);
    assert.equal(app.run('running'), !accepted);
  });
}

test('switching from setup selects the plan without starting a timer', async () => {
  const app = setup();
  await app.select();
  assert.equal(app.run('current.id'), 'next');
  assert.equal(app.run('session'), null);
  assert.equal(app.node('#template-dialog').closed, true);
});
