import { AccessibilityInfo, AppState } from 'react-native';

// Screen reader tracker v2: detects TalkBack/VoiceOver, times it, and builds a per-screen struggle report.

let started = false;
let srOn = false;
let srPeriodStart = null; // start of the current "on" period (for display)
let srCheckpoint = null;  // last time SR time was added up (for accounting)
let srTotalMs = 0;
let toggles = 0;
let sessionStart = 0;
let cur = null;           // visit in progress
let visits = [];          // finished visits
let events = [];          // raw event log
let recent = [];          // recent presses, for repeat-tap detection
let listeners = new Set();
let subs = [];

const now = () => Date.now();
const emit = () => listeners.forEach((f) => f());

function logEvent(event, extra = {}) {
  events.push({
    timestamp: new Date().toISOString(),
    event,
    screen_name: cur ? cur.screen : '',
    screen_reader_on: srOn,
    detail: '',
    duration_ms: '',
    sr_ms: '',
    ...extra,
  });
}

// Add the screen reader time that passed since the last checkpoint.
function flushSr(t) {
  if (srOn && srCheckpoint !== null) {
    const d = t - srCheckpoint;
    srTotalMs += d;
    if (cur) cur.srMs += d;
    srCheckpoint = t;
  }
}

function applyState(enabled, source) {
  if (enabled === srOn) return;
  const t = now();
  flushSr(t);
  srOn = enabled;
  srPeriodStart = enabled ? t : null;
  srCheckpoint = enabled ? t : null;
  if (enabled && cur) cur.srSeen = true;
  toggles += 1;
  logEvent('screen_reader_state_changed', { detail: source });
  emit();
}

function newVisit(name, t) {
  return { screen: name, start: t, srMs: 0, srSeen: srOn, taps: 0, repeats: 0, errors: 0, backs: 0 };
}

function closeVisit(t) {
  if (!cur) return;
  flushSr(t);
  const v = { ...cur, durationMs: t - cur.start };
  visits.push(v);
  logEvent('screen_visit', {
    duration_ms: v.durationMs,
    sr_ms: v.srMs,
    detail: `taps=${v.taps};repeat_taps=${v.repeats};form_errors=${v.errors};back=${v.backs}`,
  });
  cur = null;
}

export async function start() {
  if (started) return;
  started = true;
  sessionStart = now();
  srOn = await AccessibilityInfo.isScreenReaderEnabled();
  srPeriodStart = srOn ? sessionStart : null;
  srCheckpoint = srOn ? sessionStart : null;
  logEvent('session_start');
  subs.push(
    AccessibilityInfo.addEventListener('screenReaderChanged', (e) => applyState(e, 'listener')),
    AppState.addEventListener('change', async (next) => {
      if (next === 'active') applyState(await AccessibilityInfo.isScreenReaderEnabled(), 'resume_check');
    })
  );
  emit();
}

export function stop() {
  if (!started) return;
  closeVisit(now());
  subs.forEach((s) => s.remove());
  subs = [];
  started = false;
}

// ---- Screen and struggle tracking ----
export function trackScreen(name) {
  const t = now();
  closeVisit(t);
  cur = newVisit(name, t);
  recent = [];
  emit();
}

export function tap(id) {
  if (!cur) return;
  cur.taps += 1;
  const t = now();
  recent = recent.filter((r) => t - r.t < 3000);
  recent.push({ id, t });
  if (recent.filter((r) => r.id === id).length >= 3) {
    cur.repeats += 1;
    logEvent('struggle_signal', { detail: `repeat_tap:${id}` });
  }
}

export function formError(field) {
  if (!cur) return;
  cur.errors += 1;
  logEvent('struggle_signal', { detail: `form_error:${field}` });
}

export function backNav() {
  if (!cur) return;
  cur.backs += 1;
  logEvent('struggle_signal', { detail: 'back_navigation' });
}

// ---- Reading the data ----
export function getState() {
  const t = now();
  return {
    screenReaderOn: srOn,
    currentOnMs: srOn && srPeriodStart !== null ? t - srPeriodStart : 0,
    totalOnMs: srTotalMs + (srOn && srCheckpoint !== null ? t - srCheckpoint : 0),
    toggles,
    sessionMs: started ? t - sessionStart : 0,
  };
}

function allVisits() {
  const list = visits.slice();
  if (cur) {
    const t = now();
    const extra = srOn && srCheckpoint !== null ? t - srCheckpoint : 0;
    list.push({ ...cur, srMs: cur.srMs + extra, durationMs: t - cur.start });
  }
  return list;
}

const sec = (ms) => Math.round(ms / 100) / 10;

// One row per screen, worst struggle first. Struggle signals only count for visits where a screen reader was on.
export function getReportRows() {
  const map = {};
  allVisits().forEach((v) => {
    const r = (map[v.screen] = map[v.screen] || {
      screen_name: v.screen, visits: 0, sr_visits: 0, total_ms: 0, sr_ms: 0,
      taps_sr: 0, repeat_taps_sr: 0, form_errors_sr: 0, back_navs_sr: 0,
    });
    r.visits += 1;
    r.total_ms += v.durationMs;
    r.sr_ms += v.srMs;
    if (v.srSeen) {
      r.sr_visits += 1;
      r.taps_sr += v.taps;
      r.repeat_taps_sr += v.repeats;
      r.form_errors_sr += v.errors;
      r.back_navs_sr += v.backs;
    }
  });
  return Object.values(map)
    .map((r) => {
      const score = Math.round(r.sr_ms / 10000 + 3 * r.repeat_taps_sr + 2 * r.form_errors_sr + r.back_navs_sr);
      return {
        screen_name: r.screen_name,
        visits: r.visits,
        sr_visits: r.sr_visits,
        total_time_s: sec(r.total_ms),
        sr_time_s: sec(r.sr_ms),
        avg_sr_visit_s: r.sr_visits ? sec(r.sr_ms / r.sr_visits) : 0,
        taps_sr: r.taps_sr,
        repeat_taps_sr: r.repeat_taps_sr,
        form_errors_sr: r.form_errors_sr,
        back_navs_sr: r.back_navs_sr,
        struggle_score: score,
        flag: score >= 10 ? 'STRUGGLE' : score >= 5 ? 'WATCH' : 'OK',
      };
    })
    .sort((a, b) => b.struggle_score - a.struggle_score);
}

const esc = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');

export function toReportCsv() {
  return csv(
    ['screen_name', 'visits', 'sr_visits', 'total_time_s', 'sr_time_s', 'avg_sr_visit_s', 'taps_sr',
     'repeat_taps_sr', 'form_errors_sr', 'back_navs_sr', 'struggle_score', 'flag'],
    getReportRows()
  );
}

export function toEventsCsv() {
  return csv(['timestamp', 'event', 'screen_name', 'screen_reader_on', 'detail', 'duration_ms', 'sr_ms'], events);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reset() {
  visits = [];
  events = [];
  recent = [];
  srTotalMs = 0;
  toggles = 0;
  sessionStart = now();
  srPeriodStart = srOn ? sessionStart : null;
  srCheckpoint = srOn ? sessionStart : null;
  if (cur) cur = newVisit(cur.screen, sessionStart);
  logEvent('session_reset');
  emit();
}
