import { AccessibilityInfo, AppState } from 'react-native';

// Screen reader tracker (step 1): detects TalkBack/VoiceOver and measures how long it is on.

let started = false;
let srOn = false;
let srSince = null;      // when the current "on" period began
let srTotalMs = 0;       // completed "on" periods
let toggles = 0;         // times the screen reader changed state
let sessionStart = 0;
let log = [];            // event rows
let listeners = new Set();
let subs = [];

const now = () => Date.now();

function emit() {
  listeners.forEach((fn) => fn());
}

function add(event, source) {
  log.push({
    timestamp: new Date().toISOString(),
    event,
    screen_reader_on: srOn,
    source,
    total_on_ms: getState().totalOnMs,
  });
}

function applyState(enabled, source) {
  if (enabled === srOn) return;
  const t = now();
  if (srOn && srSince !== null) srTotalMs += t - srSince; // close the "on" period
  srOn = enabled;
  srSince = enabled ? t : null;
  toggles += 1;
  add('screen_reader_state_changed', source);
  emit();
}

export async function start() {
  if (started) return;
  started = true;
  sessionStart = now();
  srOn = await AccessibilityInfo.isScreenReaderEnabled();
  srSince = srOn ? sessionStart : null;
  add('session_start', 'init');

  subs.push(
    AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) =>
      applyState(enabled, 'listener')
    ),
    // The user often switches TalkBack in Settings, which backgrounds the app.
    // Re-check when the app returns so no change is missed.
    AppState.addEventListener('change', async (next) => {
      if (next === 'active') {
        const enabled = await AccessibilityInfo.isScreenReaderEnabled();
        applyState(enabled, 'resume_check');
      }
    })
  );
  emit();
}

export function stop() {
  if (!started) return;
  add('session_end', 'stop');
  subs.forEach((s) => s.remove());
  subs = [];
  started = false;
}

export function getState() {
  const t = now();
  const currentOnMs = srOn && srSince !== null ? t - srSince : 0;
  return {
    screenReaderOn: srOn,
    currentOnMs,                    // length of the current "on" period
    totalOnMs: srTotalMs + currentOnMs,
    toggles,
    sessionMs: started ? t - sessionStart : 0,
  };
}

export function getLog() {
  return log.slice();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reset() {
  log = [];
  srTotalMs = 0;
  toggles = 0;
  sessionStart = now();
  srSince = srOn ? sessionStart : null;
  add('session_reset', 'user');
  emit();
}

const esc = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv() {
  const cols = ['timestamp', 'event', 'screen_reader_on', 'source', 'total_on_ms'];
  return [cols.join(','), ...log.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
