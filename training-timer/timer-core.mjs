export const PHASE = Object.freeze({ PREP: "prep", WORK: "work", REST: "rest", LONG_REST: "longRest", DONE: "done" });

export function normalizeTemplate(input = {}) {
  return {
    id: String(input.id || crypto.randomUUID()),
    name: String(input.name || "未命名訓練").trim().slice(0, 30) || "未命名訓練",
    work: clampInt(input.work, 1, 600, 30),
    rest: clampInt(input.rest, 0, 120, 30),
    sets: clampInt(input.sets, 1, 20, 16),
    cycles: clampInt(input.cycles, 1, 20, 1),
    longRest: clampInt(input.longRest, 0, 300, 0)
  };
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

export function createSession(template) {
  const config = normalizeTemplate(template);
  return { config, phase: PHASE.PREP, remaining: 3, set: 1, cycle: 1, resumePhase: null, done: false };
}

export function advance(session) {
  const s = structuredClone(session);
  if (s.phase === PHASE.PREP) {
    s.phase = s.resumePhase || PHASE.WORK;
    s.resumePhase = null;
    s.remaining = s.phase === PHASE.WORK ? s.config.work : s.remaining;
    return { session: s, announcement: s.phase === PHASE.WORK ? "訓練" : "繼續" };
  }
  if (s.phase === PHASE.WORK) {
    const finalSet = s.set >= s.config.sets;
    const finalCycle = s.cycle >= s.config.cycles;
    if (finalSet && finalCycle) {
      s.phase = PHASE.DONE; s.remaining = 0; s.done = true;
      return { session: s, announcement: "訓練完畢" };
    }
    if (finalSet) {
      s.phase = PHASE.LONG_REST; s.remaining = s.config.longRest;
      return s.remaining === 0 ? advance(s) : { session: s, announcement: "大休息" };
    }
    s.phase = PHASE.REST; s.remaining = s.config.rest;
    return s.remaining === 0 ? advance(s) : { session: s, announcement: "休息" };
  }
  if (s.phase === PHASE.REST) {
    s.set += 1; s.phase = PHASE.WORK; s.remaining = s.config.work;
    return { session: s, announcement: "訓練" };
  }
  if (s.phase === PHASE.LONG_REST) {
    s.cycle += 1; s.set = 1; s.phase = PHASE.WORK; s.remaining = s.config.work;
    return { session: s, announcement: "訓練" };
  }
  return { session: s, announcement: null };
}

export function phaseLabel(phase) {
  return ({ prep: "準備", work: "訓練", rest: "休息", longRest: "大休息", done: "完成" })[phase] || "";
}

export function nextLabel(session) {
  if (session.phase === PHASE.PREP) return session.resumePhase ? "繼續" : "訓練";
  if (session.phase === PHASE.REST || session.phase === PHASE.LONG_REST) return "訓練";
  if (session.phase === PHASE.WORK) {
    if (session.set >= session.config.sets) return session.cycle >= session.config.cycles ? "訓練完畢" : "大休息";
    return "休息";
  }
  return "";
}

export function overallProgress(session) {
  const completedSets = (session.cycle - 1) * session.config.sets + (session.set - 1);
  const total = session.config.sets * session.config.cycles;
  const within = session.phase === PHASE.WORK ? 0.5 * (1 - session.remaining / session.config.work) :
    session.phase === PHASE.REST ? 0.5 + 0.5 * (1 - session.remaining / Math.max(1, session.config.rest)) : 0;
  return session.done ? 1 : Math.min(1, Math.max(0, (completedSets + within) / total));
}
