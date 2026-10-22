import { PHASE, advance, createSession, normalizeTemplate, overallProgress, phaseLabel } from "./timer-core.mjs?v=14";

const STORE_KEY = "moonforest-training-timer-v1";
const DEFAULT = normalizeTemplate({ id: "basic", name: "基本訓練", prep: 3, work: 30, rest: 30, sets: 16, cycles: 1, longRest: 0 });
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];

let store = loadStore();
let current = normalizeTemplate(store.templates.find(item => item.id === store.defaultId) || store.templates[0]);
let savedSnapshot = JSON.stringify(current);
let session = null;
let running = false;
let endAt = 0;
let tickHandle = 0;
let lastSpokenSecond = null;
let wakeLock = null;
let toastTimer = 0;

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(parsed?.templates) && parsed.templates.length) {
      return { templates: parsed.templates.map(normalizeTemplate), defaultId: parsed.templates.some(t => t.id === parsed.defaultId) ? parsed.defaultId : parsed.templates[0].id, sound: parsed.sound !== false };
    }
  } catch {}
  return { templates: [DEFAULT], defaultId: DEFAULT.id, sound: true };
}

function persist() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
function formatTime(seconds) { const value = Math.max(0, Math.ceil(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }
function summary(t) { return `${t.sets} 組 · ${t.cycles} 循環`; }
function isDirty() { return JSON.stringify(current) !== savedSnapshot; }

function renderSetup() {
  const select = $("#template-select");
  select.innerHTML = store.templates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}${t.id === store.defaultId ? "（預設）" : ""}</option>`).join("");
  select.value = current.id;
  all(".value-card").forEach(card => {
    const field = card.dataset.field; const range = card.querySelector("[data-range]");
    const storedValue = Number(current[field]);
    const value = Number.isFinite(storedValue) ? storedValue : Number(range?.value || 0);
    card.querySelector("[data-output]").textContent = card.dataset.kind === "time" ? formatTime(value) : card.dataset.kind === "seconds" ? `${value} 秒` : `${value} ${field === "sets" ? "組" : "次"}`;
    const rangeValue = range?.dataset.rangeMode === "seconds" ? value % 60 : value;
    if (range) { range.value = String(rangeValue); range.style.setProperty("--range-progress", `${(rangeValue - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100}%`); }
    const minuteOutput = card.querySelector("[data-minute-output]");
    if (minuteOutput) minuteOutput.textContent = `${Math.floor(value / 60)} 分`;
  });
  $("#start-summary").textContent = summary(current);
  $("#unsaved-note").hidden = !isDirty();
  renderSound();
}

function renderSound() {
  const label = store.sound ? "關閉語音" : "開啟語音";
  [$("#sound-toggle"), $("#timer-sound")].forEach(button => {
    button.classList.toggle("is-muted", !store.sound);
    button.setAttribute("aria-pressed", String(!store.sound));
    button.setAttribute("aria-label", label);
    button.title = label;
  });
}

function adjust(field, delta) {
  const limits = { prep: [3, 30], work: [1, 600], rest: [0, 120], sets: [1, 20], cycles: [1, 20], longRest: [0, 300] }[field];
  current = { ...current, [field]: Math.min(limits[1], Math.max(limits[0], current[field] + delta)) };
  renderSetup();
}

all("[data-step]").forEach(button => {
  let repeat;
  const run = () => adjust(button.closest(".value-card").dataset.field, Number(button.dataset.step));
  button.addEventListener("click", run);
  button.addEventListener("pointerdown", () => { repeat = setTimeout(() => { run(); repeat = setInterval(run, 90); }, 450); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(type => button.addEventListener(type, () => { clearTimeout(repeat); clearInterval(repeat); }));
});

all("[data-range]").forEach(range => range.addEventListener("input", () => {
  const card = range.closest(".value-card");
  const field = card.dataset.field;
  const value = range.dataset.rangeMode === "seconds" ? Math.floor(current[field] / 60) * 60 + Number(range.value) : Number(range.value);
  const limits = { prep: [3, 30], work: [1, 600], rest: [0, 120], sets: [1, 20], cycles: [1, 20], longRest: [0, 300] }[field];
  current = { ...current, [field]: Math.min(limits[1], Math.max(limits[0], value)) };
  renderSetup();
}));

$("#template-select").addEventListener("change", event => {
  if (isDirty() && !window.confirm("目前設定尚未儲存，仍要切換訓練計劃嗎？")) { event.target.value = current.id; return; }
  current = normalizeTemplate(store.templates.find(t => t.id === event.target.value)); savedSnapshot = JSON.stringify(current); renderSetup();
});

function renderTemplateList() {
  const query = $("#template-search").value.trim().toLocaleLowerCase("zh-Hant");
  const matches = store.templates.filter(t => t.name.toLocaleLowerCase("zh-Hant").includes(query));
  $("#template-list").innerHTML = matches.length
    ? matches.map(t => `<div class="template-row" data-id="${escapeHtml(t.id)}"><div><p>${escapeHtml(t.name)} ${t.id === store.defaultId ? '<span class="default-badge">預設</span>' : ""}</p><small>${t.prep} 秒準備 · ${formatTime(t.work)} 訓練 · ${formatTime(t.rest)} 休息 · ${t.sets} 組 × ${t.cycles}</small></div><div class="template-row-actions"><button data-action="default" title="設為預設">★</button><button data-action="copy" title="複製">複製</button><button data-action="rename" title="重新命名">改名</button><button data-action="delete" title="刪除">刪除</button></div></div>`).join("")
    : '<p class="template-empty">找不到符合的訓練計劃</p>';
}

function openTemplateDialog(focusSearch = false) {
  $("#template-search").value = ""; renderTemplateList(); $("#template-dialog").showModal();
  if (focusSearch) requestAnimationFrame(() => $("#template-search").focus());
}

$("#template-menu-button").addEventListener("click", () => openTemplateDialog());
$("#template-search-button").addEventListener("click", () => openTemplateDialog(true));
$("#timer-search-button").addEventListener("click", () => openTemplateDialog(true));
$("#template-search").addEventListener("input", renderTemplateList);
$("#template-list").addEventListener("click", async event => {
  const button = event.target.closest("button"); if (!button) return;
  const id = button.closest(".template-row").dataset.id; const item = store.templates.find(t => t.id === id);
  if (button.dataset.action === "default") { store.defaultId = id; persist(); renderTemplateList(); renderSetup(); toast("已設為預設訓練計劃"); }
  if (button.dataset.action === "copy") { const name = await askName("複製訓練計劃", `${item.name} 複本`); if (name) addTemplate({ ...item, id: crypto.randomUUID(), name }); }
  if (button.dataset.action === "rename") { const name = await askName("重新命名", item.name); if (name) { item.name = name; if (current.id === id) current.name = name; persist(); savedSnapshot = current.id === id ? JSON.stringify(current) : savedSnapshot; renderTemplateList(); renderSetup(); } }
  if (button.dataset.action === "delete") {
    if (store.templates.length === 1) return toast("至少需要保留一套訓練計劃");
    if (id === store.defaultId) return toast("請先將另一套訓練計劃設為預設");
    if (await confirmAction("刪除訓練計劃？", `「${item.name}」刪除後無法復原。`)) { store.templates = store.templates.filter(t => t.id !== id); if (current.id === id) { current = normalizeTemplate(store.templates.find(t => t.id === store.defaultId)); savedSnapshot = JSON.stringify(current); } persist(); renderTemplateList(); renderSetup(); }
  }
});

$("#new-template").addEventListener("click", async () => { const name = await askName("新增訓練計劃", "新訓練"); if (name) addTemplate({ ...DEFAULT, id: crypto.randomUUID(), name }); });
$("#save-as-template").addEventListener("click", async () => { const name = await askName("另存新訓練計劃", `${current.name} 複本`); if (name) addTemplate({ ...current, id: crypto.randomUUID(), name }); });
$("#save-template").addEventListener("click", () => { const index = store.templates.findIndex(t => t.id === current.id); if (index < 0) return; store.templates[index] = normalizeTemplate(current); persist(); savedSnapshot = JSON.stringify(current); renderTemplateList(); renderSetup(); toast("訓練計劃已儲存"); });

function addTemplate(template) { const item = normalizeTemplate(template); store.templates.push(item); current = item; savedSnapshot = JSON.stringify(item); persist(); $("#template-search").value = ""; renderTemplateList(); renderSetup(); toast("訓練計劃已新增"); }
function askName(title, value) { return new Promise(resolve => { const dialog = $("#name-dialog"), input = $("#template-name-input"); $("#name-title").textContent = title; input.value = value; dialog.showModal(); requestAnimationFrame(() => input.select()); dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm" ? input.value.trim().slice(0, 30) : ""), { once: true }); }); }
function confirmAction(title, message) { return new Promise(resolve => { const dialog = $("#confirm-dialog"); $("#confirm-title").textContent = title; $("#confirm-message").textContent = message; dialog.showModal(); dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }); }); }

function toggleSound() { store.sound = !store.sound; persist(); if (!store.sound) speechSynthesis.cancel(); renderSound(); }
$("#sound-toggle").addEventListener("click", toggleSound); $("#timer-sound").addEventListener("click", toggleSound);

$("#start-button").addEventListener("click", async () => {
  speechSynthesis.cancel(); if (store.sound) speak("");
  session = createSession(current); running = true; lastSpokenSecond = null;
  $("#setup-view").hidden = true; $("#timer-view").hidden = false;
  await requestWakeLock(); startPhaseClock(session.remaining); renderTimer();
});

function startPhaseClock(seconds) { session.remaining = seconds; endAt = performance.now() + seconds * 1000; clearInterval(tickHandle); tickHandle = setInterval(tick, 80); tick(); }
function tick() {
  if (!running || !session) return;
  const remaining = Math.max(0, (endAt - performance.now()) / 1000); session.remaining = remaining;
  const second = Math.ceil(remaining);
  if (second > 0 && second <= 3 && second !== lastSpokenSecond) { lastSpokenSecond = second; speak(String(second)); }
  if (remaining <= 0) transitionNow();
  renderTimer();
}

function phaseDuration(value) {
  if (value.phase === PHASE.PREP) return value.resumePhase ? 3 : value.config.prep;
  if (value.phase === PHASE.WORK) return value.config.work;
  if (value.phase === PHASE.REST) return value.config.rest;
  if (value.phase === PHASE.LONG_REST) return value.config.longRest;
  return 1;
}

function nextPhaseDescription(value) {
  const time = seconds => formatTime(seconds);
  if (value.done) return "做得很好，訓練完成";
  if (value.phase === PHASE.PREP) return value.resumePhase ? `接著：繼續${phaseLabel(value.resumePhase)}` : `接著：訓練 ${time(value.config.work)}`;
  if (value.phase === PHASE.REST || value.phase === PHASE.LONG_REST) return `接著：訓練 ${time(value.config.work)}`;
  if (value.phase === PHASE.WORK) {
    const finalSet = value.set >= value.config.sets;
    const finalCycle = value.cycle >= value.config.cycles;
    if (finalSet && finalCycle) return "接著：訓練完成";
    if (finalSet) return value.config.longRest > 0 ? `接著：大休息 ${time(value.config.longRest)}` : `接著：訓練 ${time(value.config.work)}`;
    return value.config.rest > 0 ? `接著：休息 ${time(value.config.rest)}` : `接著：訓練 ${time(value.config.work)}`;
  }
  return "";
}

function renderTimer() {
  if (!session) return;
  const view = $("#timer-view"); view.className = `timer-view phase-${session.phase}`;
  view.classList.toggle("is-countdown", running && !session.done && session.remaining > 0 && session.remaining <= 3);
  view.classList.toggle("is-paused", !running && !session.done);
  $("#timer-template").textContent = current.name; $("#phase-label").textContent = phaseLabel(session.phase);
  $("#timer-digits").textContent = formatTime(session.remaining); $("#next-label").textContent = nextPhaseDescription(session);
  const remainingPercent = Math.min(100, Math.max(0, session.remaining / Math.max(1, phaseDuration(session)) * 100));
  $("#timer-ring-progress").style.strokeDashoffset = String(100 - remainingPercent);
  $("#set-status").textContent = `${session.set} / ${session.config.sets}`; $("#cycle-status").textContent = `${session.cycle} / ${session.config.cycles}`;
  $("#progress-bar").style.width = `${overallProgress(session) * 100}%`;
  $("#pause-button").textContent = running ? "暫停" : "繼續";
}

$("#pause-button").addEventListener("click", () => {
  if (!session || session.done) return;
  if (running) { session.remaining = Math.max(0, (endAt - performance.now()) / 1000); running = false; clearInterval(tickHandle); speechSynthesis.cancel(); renderTimer(); }
  else { const pausedPhase = session.phase; const pausedRemaining = session.remaining; session.phase = PHASE.PREP; session.resumePhase = pausedPhase; session.remaining = 3; session.pausedRemaining = pausedRemaining; running = true; lastSpokenSecond = null; startPhaseClock(3); }
});

function resumeAwareAdvance(value) {
  if (value.phase === PHASE.PREP && value.resumePhase) { const copy = structuredClone(value); const phase = copy.resumePhase; copy.phase = phase; copy.resumePhase = null; copy.remaining = copy.pausedRemaining; delete copy.pausedRemaining; return { session: copy, announcement: "繼續" }; }
  return advance(value);
}

// Resume prep needs the preserved remainder; tick uses this wrapper for that one path.
function advanceCurrent(value) { return resumeAwareAdvance(value); }

// Replace tick's phase transition without duplicating its timing loop.
function transitionNow() {
  const result = advanceCurrent(session); session = result.session; lastSpokenSecond = null;
  if (result.announcement) speak(result.announcement);
  if (session.done) finishSession(); else startPhaseClock(session.remaining);
}

$("#skip-button").addEventListener("click", async () => {
  if (!session || session.done || !await confirmAction("跳過目前階段？", `將直接結束「${phaseLabel(session.phase)}」並前往下一階段。`)) return;
  speechSynthesis.cancel(); transitionNow();
});
$("#stop-button").addEventListener("click", async () => {
  if (session?.done) return exitTimer();
  if (await confirmAction("結束這次訓練？", "本次會直接停止，不會播放「訓練完畢」。")) exitTimer();
});

function finishSession() { running = false; clearInterval(tickHandle); releaseWakeLock(); renderTimer(); $("#pause-button").disabled = true; $("#skip-button").disabled = true; $("#stop-button").textContent = "返回設定"; }
function exitTimer() { running = false; clearInterval(tickHandle); speechSynthesis.cancel(); releaseWakeLock(); session = null; $("#timer-view").hidden = true; $("#setup-view").hidden = false; $("#pause-button").disabled = false; $("#skip-button").disabled = false; $("#stop-button").textContent = "結束"; renderSetup(); }

async function requestWakeLock() { try { if ("wakeLock" in navigator) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } else toast("此瀏覽器不支援保持螢幕常亮"); } catch { toast("無法保持螢幕常亮，請檢查瀏覽器設定"); } }
function releaseWakeLock() { wakeLock?.release().catch(() => {}); wakeLock = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session && !session.done && !wakeLock) requestWakeLock(); });
function speak(text) { if (!store.sound || !("speechSynthesis" in window)) return; const utterance = new SpeechSynthesisUtterance(text || " "); utterance.lang = "zh-TW"; utterance.rate = .95; speechSynthesis.speak(utterance); }
function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2200); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=14").catch(() => {});
renderSetup();
