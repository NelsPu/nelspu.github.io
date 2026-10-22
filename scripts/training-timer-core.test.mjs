import test from "node:test";
import assert from "node:assert/strict";
import { PHASE, advance, createSession, nextLabel, normalizeTemplate } from "../training-timer/timer-core.mjs";

const base = { id: "t", name: "測試", prep: 3, work: 30, rest: 30, sets: 2, cycles: 1, longRest: 0 };

test("設定預設值與實際上限", () => {
  assert.deepEqual(normalizeTemplate({ id: "x", name: "基本訓練" }), { id: "x", name: "基本訓練", prep: 3, work: 30, rest: 30, sets: 16, cycles: 1, longRest: 0 });
  const value = normalizeTemplate({ prep: 99, work: 999, rest: 999, sets: 99, cycles: 99, longRest: 999 });
  assert.equal(value.prep, 30);
  assert.equal(value.work, 600);
  assert.equal(value.rest, 120);
  assert.equal(value.sets, 20);
  assert.equal(value.cycles, 20);
  assert.equal(value.longRest, 300);
});

test("自訂準備時間後進入完整訓練時間", () => {
  const session = createSession({ ...base, prep: 12 });
  assert.equal(session.remaining, 12);
  const first = advance(session);
  assert.equal(first.announcement, "訓練");
  assert.equal(first.session.phase, PHASE.WORK);
  assert.equal(first.session.remaining, 30);
});

test("單循環最後一組直接完成", () => {
  let session = advance(createSession(base)).session;
  let result = advance(session);
  assert.equal(result.session.phase, PHASE.REST);
  session = advance(result.session).session;
  result = advance(session);
  assert.equal(result.session.phase, PHASE.DONE);
  assert.equal(result.announcement, "訓練完畢");
});

test("多循環末組進入大休息", () => {
  const config = { ...base, sets: 1, cycles: 2, longRest: 60 };
  const work = advance(createSession(config)).session;
  const result = advance(work);
  assert.equal(result.session.phase, PHASE.LONG_REST);
  assert.equal(result.session.remaining, 60);
  const next = advance(result.session);
  assert.equal(next.session.phase, PHASE.WORK);
  assert.equal(next.session.cycle, 2);
});

test("零秒休息立即前進", () => {
  const work = advance(createSession({ ...base, rest: 0 })).session;
  const result = advance(work);
  assert.equal(result.session.phase, PHASE.WORK);
  assert.equal(result.session.set, 2);
});

test("轉場提示符合目前位置", () => {
  const first = createSession(base);
  assert.equal(nextLabel(first), "訓練");
  const work = advance(first).session;
  assert.equal(nextLabel(work), "休息");
  assert.equal(nextLabel({ ...work, set: 2 }), "訓練完畢");
});
