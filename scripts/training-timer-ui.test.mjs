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
    localStorage: { getItem: () => null, setItem() {} }, navigator: {}, window: { confirm: () => true }, crypto,
    speechSynthesis: { cancel() {} }, clearInterval() {}, clearTimeout() {}, setTimeout: () => 1,
  });
  vm.runInContext(source, context);
  vm.runInContext(`store.templates.push(normalizeTemplate({ ...DEFAULT, id: 'next', name: '下一套', work: 45 }));`, context);
  const select = () => node('#template-list').listeners.click({ target: { closest: () => ({ dataset: { action: 'select' }, closest: () => ({ dataset: { id: 'next' } }) }) } });
  const action = (action, id = 'next') => node('#template-list').listeners.click({ target: { closest: () => ({ dataset: { action }, closest: () => ({ dataset: { id } }) }) } });
  return { node, context, select, action, run: code => vm.runInContext(code, context) };
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

// Deterministic clock exercises the real UI handlers without waiting minutes.
function stage(phase, running = true) {
  const app = setup();
  Object.assign(app.context, { now: 0, performance: { now: () => app.context.now }, setInterval: () => 1 });
  app.run(`store.sound = false; session = createSession({ ...current, work: 10, rest: 10, longRest: 10, sets: 2, cycles: 2 }); session.phase = '${phase}'; session.remaining = 7; session.set = ${phase === 'longRest' ? 2 : 1}; running = ${running}; endAt = 7000; renderTimer();`);
  app.click = selector => app.node(selector).listeners.click();
  return app;
}

for (const phase of ['prep', 'work', 'rest', 'longRest']) {
  test(`${phase}: pause/resume preserves remainder, including repeated pause during resume countdown`, async () => {
    const app = stage(phase);
    await app.click('#pause-button');
    assert.equal(app.run('running'), false);
    assert.equal(app.run('session.remaining'), 7);
    await app.click('#pause-button');
    assert.equal(app.run('session.resumePhase'), phase);
    app.context.now = 1000;
    await app.click('#pause-button');
    await app.click('#pause-button');
    assert.equal(app.run('session.resumePhase'), phase);
    assert.equal(app.run('session.pausedRemaining'), 7);
    app.context.now = 4000;
    app.run('tick()');
    assert.equal(app.run('session.phase'), phase);
    assert.equal(app.run('session.remaining'), 7);
  });
  for (const paused of [false, true]) {
    test(`${phase}: confirmed skip updates display, paused=${paused}`, async () => {
      const app = stage(phase, !paused);
      app.run('confirmAction = async () => true');
      await app.click('#skip-button');
      const expected = { prep: 'work', work: 'rest', rest: 'work', longRest: 'work' }[phase];
      assert.equal(app.run('session.phase'), expected);
      assert.equal(app.node('#phase-label').textContent, core.phaseLabel(expected));
      assert.equal(app.node('#timer-digits').textContent, '0:10');
      assert.equal(app.run('running'), !paused);
    });
  }
  for (const selector of ['#skip-button', '#restart-button', '#stop-button']) {
    test(`${phase}: cancel ${selector} leaves session intact`, async () => {
      const app = stage(phase);
      app.run('confirmAction = async () => false');
      const before = app.run('JSON.stringify(session)');
      await app.click(selector);
      assert.equal(app.run('JSON.stringify(session)'), before);
      assert.equal(app.run('running'), true);
    });
  }
  test(`${phase}: restart resets phase, set and cycle`, async () => {
    const app = stage(phase);
    app.run('confirmAction = async () => true; session.cycle = 2; session.set = 2');
    await app.click('#restart-button');
    assert.equal(app.run('session.phase'), 'prep');
    assert.equal(app.run('session.set'), 1);
    assert.equal(app.run('session.cycle'), 1);
    assert.equal(app.run('running'), true);
  });
  test(`${phase}: stop returns to setup and clears session`, async () => {
    const app = stage(phase);
    app.run('confirmAction = async () => true');
    await app.click('#stop-button');
    assert.equal(app.run('session'), null);
    assert.equal(app.node('#setup-view').hidden, false);
    assert.equal(app.node('#timer-view').hidden, true);
  });
  test(`${phase}: selecting another plan returns to its setup`, async () => {
    const app = stage(phase);
    app.run('confirmAction = async () => true');
    await app.select();
    assert.equal(app.run('session'), null);
    assert.equal(app.node('#start-plan-name').textContent, '下一套');
  });
  test(`${phase}: delayed skip confirmation never skips a new phase`, async () => {
    const app = stage(phase);
    app.run('confirmAction = () => new Promise(resolve => { globalThis.resolveConfirm = resolve; })');
    const pending = app.click('#skip-button');
    app.context.now = 7000;
    app.run('tick()');
    const after = app.run('JSON.stringify(session)');
    app.run('resolveConfirm(true)');
    await pending;
    assert.equal(app.run('JSON.stringify(session)'), after);
  });
}

test('completion disables pause/skip; restart restores controls; return clears session', async () => {
  const app = stage('work');
  app.run('session.set = 2; session.cycle = 2; transitionNow()');
  assert.equal(app.run('session.done'), true);
  assert.equal(app.node('#pause-button').disabled, true);
  assert.equal(app.node('#skip-button').disabled, true);
  app.run('confirmAction = async () => true');
  await app.click('#restart-button');
  assert.equal(app.run('session.done'), false);
  assert.equal(app.node('#pause-button').disabled, false);
  assert.equal(app.node('#skip-button').disabled, false);
  app.run('session.done = true; finishSession()');
  await app.click('#stop-button');
  assert.equal(app.run('session'), null);
});

for (const [field, min, max] of [['prep', 3, 30], ['work', 1, 600], ['rest', 0, 120], ['sets', 1, 20], ['cycles', 1, 20], ['longRest', 0, 300]]) {
  test(`${field}: adjustment clamps both boundaries and marks unsaved changes`, () => {
    const app = setup();
    app.run(`adjust('${field}', 10000)`);
    assert.equal(app.run(`current.${field}`), max);
    app.run(`adjust('${field}', -10000)`);
    assert.equal(app.run(`current.${field}`), min);
    assert.equal(app.run('isDirty()'), app.run('JSON.stringify(current) !== savedSnapshot'));
  });
}

test('saving updates persisted template and clears dirty state', async () => {
  const app = setup();
  app.run("adjust('work', 5)");
  app.node('#save-template').listeners.click();
  assert.equal(app.run('store.templates[0].work'), 35);
  assert.equal(app.run('isDirty()'), false);
});

test('rename preserves unsaved changes instead of marking them saved', async () => {
  const app = setup();
  app.run("adjust('work', 5); askName = async () => '新名稱'");
  await app.action('rename', 'basic');
  assert.equal(app.run('current.name'), '新名稱');
  assert.equal(app.run('store.templates[0].work'), 30);
  assert.equal(app.run('current.work'), 35);
  assert.equal(app.run('isDirty()'), true);
});

test('copy, default, delete guards and confirmed deletion', async () => {
  const app = setup();
  app.run("askName = async () => '複本'; confirmAction = async () => true");
  await app.action('copy');
  assert.equal(app.run('store.templates.length'), 3);
  assert.equal(app.run('current.work'), 45);
  await app.action('default');
  assert.equal(app.run('store.defaultId'), 'next');
  await app.action('delete');
  assert.equal(app.run('store.templates.length'), 3);
  await app.action('default', 'basic');
  await app.action('delete');
  assert.equal(app.run('store.templates.length'), 2);
  assert.equal(app.run("store.templates.some(t => t.id === 'next')"), false);
});

test('sound toggle updates both controls and saved preference', () => {
  const app = setup();
  app.node('#sound-toggle').listeners.click();
  assert.equal(app.run('store.sound'), false);
  assert.equal(app.node('#timer-sound').title, '開啟語音');
  app.node('#timer-sound').listeners.click();
  assert.equal(app.run('store.sound'), true);
  assert.equal(app.node('#sound-toggle').title, '關閉語音');
});
