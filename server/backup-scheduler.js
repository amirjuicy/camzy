'use strict';
/* ── Scheduled production backups ──────────────────────────────────────────
 * Runs createBackup() once per day at the configured wall-clock time in the
 * configured timezone (default 00:00, settings: backup.schedule.*).
 *
 * Safety properties:
 *  - Never duplicates a slot: a slot is satisfied by a successful scheduled
 *    backup for that slot, or by ANY backup file (manual, update-preinstall,
 *    or the external 23:00 task) created close to the slot start.
 *  - Catch-up on boot: if the process was down at 00:00 the missed slot runs
 *    once after start — the same dedupe rules make a restart harmless.
 *  - Failures are recorded in the manifest by createBackup itself (status
 *    'failed' + trigger 'scheduled' + scheduledFor slot); this module only
 *    schedules retries (max 3 attempts per slot, 1h apart) and reports state.
 *  - All work goes through the shared operation lock in backup-manager, so a
 *    scheduled backup can never race an update install or a rollback.
 *
 * Started from server.js (and from server/app.js when run directly); never
 * auto-started on require, so tests and tooling can import it safely.
 * Set CAMZY_BACKUP_SCHEDULER=off to keep the scheduler off in one process.
 */
const fs = require('fs');
const path = require('path');
const bm = require('./backup-manager');
const { logInfo, logError } = require('./logger');

const STALE_AFTER_MS = 26 * 60 * 60 * 1000;         // success older than this => stale
const RETRY_MS = 60 * 60 * 1000;                    // retry a failed slot after 1h
const MAX_ATTEMPTS_PER_SLOT = 3;                    // then wait for the next day
const RECENT_BACKUP_SLACK_MS = 2 * 60 * 60 * 1000;  // dedupe window vs other backup writers
const MAX_TIMER_MS = 12 * 60 * 60 * 1000;           // re-arm at least twice a day
const BUSY_RECHECK_MS = 5 * 1000;                   // an operation is running: poll, don't spin
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }

/* ── Timezone math (DST-safe, no local-string parsing) ───────────────────── */

// Offset (local - UTC) in ms for the given instant and IANA timezone.
function tzOffsetMs(ts, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(ts))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - ts;
}

// Wall-clock fields of an instant in a timezone.
function zonedParts(ts, tz) {
  const d = new Date(ts + tzOffsetMs(ts, tz));
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds()
  };
}

// 'YYYY-MM-DD' of an instant in a timezone (the slot key).
function localDateKey(ts, tz) {
  const p = zonedParts(ts, tz);
  return p.year + '-' + pad2(p.month) + '-' + pad2(p.day);
}

// Local wall-clock (y,mo,d,h,mi) in tz -> epoch ms. Two-pass so DST
// transitions resolve to the correct side of the boundary.
function zonedToUtc(y, mo, d, h, mi, tz) {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  let ts = asUtc - tzOffsetMs(asUtc, tz);
  ts = asUtc - tzOffsetMs(ts, tz);
  return ts;
}

// Epoch ms of HH:MM on the given local day key in tz.
function slotStartFor(dayKey, time, tz) {
  const d = String(dayKey).split('-');
  const t = String(time).split(':');
  return zonedToUtc(Number(d[0]), Number(d[1]), Number(d[2]), Number(t[0]), Number(t[1]), tz);
}

// Epoch ms of the next occurrence of HH:MM in tz strictly AFTER afterTs.
function nextRunAfter(afterTs, time, tz) {
  const t = String(time).split(':');
  const h = Number(t[0]);
  const mi = Number(t[1]);
  const p = zonedParts(afterTs, tz);
  let candidate = zonedToUtc(p.year, p.month, p.day, h, mi, tz);
  if (candidate <= afterTs) {
    const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day) + DAY_MS);
    candidate = zonedToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), h, mi, tz);
    if (candidate <= afterTs) candidate += DAY_MS;  // DST-collapse guard
  }
  return candidate;
}

/* ── Due-slot evaluation (pure; used by the timer, catch-up and tests) ───── */

function slotEntries(backups, slot) {
  return (backups || []).filter((b) => b && b.scheduledFor === slot);
}

// Newest backup-like file (managed .zip or external .db) in the backup dir.
function newestBackupFileMs() {
  let newest = 0;
  let names = [];
  try { names = fs.readdirSync(bm.BACKUP_DIR); } catch (_) { return 0; }
  for (const n of names) {
    if (!/[.](zip|db)$/i.test(n)) continue;
    try {
      const st = fs.statSync(path.join(bm.BACKUP_DIR, n));
      if (st.isFile() && st.mtimeMs > newest) newest = st.mtimeMs;
    } catch (_) {}
  }
  return newest;
}

function evaluateDue(now, cfg, backups) {
  const tz = cfg.timezone;
  const dayKey = localDateKey(now, tz);
  const slotStart = slotStartFor(dayKey, cfg.time, tz);
  const state = {
    now: now, dayKey: dayKey, slotStart: slotStart,
    nextRun: nextRunAfter(now, cfg.time, tz),
    due: false, reason: null, attempts: 0, lastAttemptAt: null
  };
  if (!cfg.enabled) { state.reason = 'disabled'; return state; }
  if (now < slotStart) { state.reason = 'not_due_yet'; return state; }

  const entries = slotEntries(backups, dayKey);
  if (entries.some((e) => e.status === 'success')) { state.reason = 'already_completed'; return state; }

  // Another writer already backed up around this slot (manual click, the
  // pre-install backup, or the external 23:00 scheduled task). Do not double up.
  const newest = newestBackupFileMs();
  if (newest >= (slotStart - RECENT_BACKUP_SLACK_MS) && newest <= now + 60000) {
    state.reason = 'covered_by_recent_backup';
    state.recentBackupAt = new Date(newest).toISOString();
    return state;
  }

  const failed = entries.filter((e) => e.status === 'failed')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  state.attempts = failed.length;
  if (failed.length) state.lastAttemptAt = Date.parse(failed[0].createdAt);
  if (failed.length >= MAX_ATTEMPTS_PER_SLOT) { state.reason = 'max_attempts_reached'; return state; }
  if (failed.length && Number.isFinite(state.lastAttemptAt) && (now - state.lastAttemptAt) < RETRY_MS) {
    state.reason = 'retry_backoff';
    return state;
  }
  state.due = true;
  state.reason = 'due';
  return state;
}

/* ── Run once (idempotent per slot) ──────────────────────────────────────── */

async function runScheduledBackupIfDue(options) {
  options = options || {};
  const cfg = options.settings || bm.getBackupSettings();
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const state = evaluateDue(now, cfg, bm.listBackups());
  if (!state.due) return Object.assign({ ran: false, ok: null }, state);

  try {
    const meta = await bm.createBackup({
      includeUploads: true,
      trigger: 'scheduled',
      scheduledFor: state.dayKey
    });
    logInfo('scheduled backup completed', {
      slot: state.dayKey, filename: meta.filename, size: meta.size,
      durationMs: meta.durationMs, verified: meta.verified
    });
    // state first, then the outcome — otherwise state.reason ('due') would
    // overwrite the run result.
    return Object.assign({}, state, { ran: true, ok: true, due: false, reason: 'completed', backup: meta });
  } catch (e) {
    const err = e && e.message ? e : new Error(String(e));
    if (err.code === 'operation_in_progress') {
      // A backup/update/restore is running: not an attempt, just skip.
      return Object.assign({}, state, { ran: false, ok: null, due: false, reason: 'busy', error: err.message });
    }
    // createBackup already recorded the failed attempt in the manifest.
    logError('scheduled backup failed', { slot: state.dayKey, error: String(err.message || err) });
    return Object.assign({}, state, { ran: true, ok: false, due: false, reason: 'backup_failed', error: String(err.message || err) });
  }
}

/* ── Status for the admin page ───────────────────────────────────────────── */

function describeSchedule(options) {
  const cfg = (options && options.settings) || bm.getBackupSettings();
  const now = (options && typeof options.now === 'number') ? options.now : Date.now();
  const backups = bm.listBackups();
  const byCreatedDesc = backups
    .filter((b) => b && b.createdAt && !Number.isNaN(Date.parse(b.createdAt)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const lastAttempt = byCreatedDesc[0] || null;
  const lastSuccess = byCreatedDesc.find((b) => b.status === 'success') || null;
  const lastFailure = byCreatedDesc.find((b) => b.status === 'failed') || null;
  const lastScheduledSuccess = byCreatedDesc.find((b) => b.status === 'success' && b.trigger === 'scheduled') || null;

  const successAgeMs = lastSuccess ? (now - Date.parse(lastSuccess.createdAt)) : null;
  let stale = false;
  let staleReason = null;
  if (cfg.enabled) {
    if (!lastSuccess) { stale = true; staleReason = 'no_successful_backup'; }
    else if (successAgeMs > STALE_AFTER_MS) { stale = true; staleReason = 'last_success_too_old'; }
    else if (lastFailure && Date.parse(lastFailure.createdAt) > Date.parse(lastSuccess.createdAt)) { staleReason = 'last_attempt_failed'; }
  }

  const state = evaluateDue(now, cfg, backups);
  return {
    enabled: cfg.enabled,
    time: cfg.time,
    timezone: cfg.timezone,
    timezoneSource: cfg.timezoneSource,
    retentionCount: cfg.retentionCount,
    nextRun: new Date(state.nextRun).toISOString(),
    currentSlot: state.dayKey,
    due: state.due,
    dueReason: state.reason,
    attemptsToday: state.attempts,
    lastAttempt: lastAttempt ? {
      filename: lastAttempt.filename, createdAt: lastAttempt.createdAt,
      status: lastAttempt.status, trigger: lastAttempt.trigger || null,
      scheduledFor: lastAttempt.scheduledFor || null, error: lastAttempt.error || null
    } : null,
    lastSuccess: lastSuccess ? {
      filename: lastSuccess.filename, createdAt: lastSuccess.createdAt,
      trigger: lastSuccess.trigger || null, scheduledFor: lastSuccess.scheduledFor || null,
      size: lastSuccess.size || null
    } : null,
    lastScheduledSuccess: lastScheduledSuccess ? {
      filename: lastScheduledSuccess.filename, createdAt: lastScheduledSuccess.createdAt,
      scheduledFor: lastScheduledSuccess.scheduledFor || null
    } : null,
    lastFailure: lastFailure ? {
      filename: lastFailure.filename, createdAt: lastFailure.createdAt,
      error: lastFailure.error || null, scheduledFor: lastFailure.scheduledFor || null
    } : null,
    stale: stale,
    staleReason: staleReason,
    staleAfterHours: STALE_AFTER_MS / 3600000,
    maxAttemptsPerSlot: MAX_ATTEMPTS_PER_SLOT,
    retryAfterHours: RETRY_MS / 3600000,
    runningOperation: bm.currentOperation() ? bm.currentOperation().kind : null
  };
}

/* ── Timer lifecycle ─────────────────────────────────────────────────────── */

let timer = null;
let bootTimer = null;

function clearTimers() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
}

function armTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
  const cfg = bm.getBackupSettings();
  const now = Date.now();
  let delay;
  // A backup/update/rollback is running: never spin on "due" — re-check soon.
  if (bm.currentOperation()) {
    delay = BUSY_RECHECK_MS;
  } else if (cfg.enabled) {
    const state = evaluateDue(now, cfg, bm.listBackups());
    if (state.due) {
      delay = 0;
    } else if (state.reason === 'retry_backoff' && Number.isFinite(state.lastAttemptAt)) {
      // A slot failed earlier today: wake up when the 1h backoff elapses,
      // not tomorrow (otherwise failures would never be retried same-day).
      delay = Math.max(1000, state.lastAttemptAt + RETRY_MS - now);
    } else {
      delay = Math.max(1000, state.nextRun - now);
    }
  } else {
    delay = Math.max(1000, nextRunAfter(now, cfg.time, cfg.timezone) - now);
  }
  if (delay > MAX_TIMER_MS) delay = MAX_TIMER_MS;
  timer = setTimeout(onTimer, delay);
  if (timer.unref) timer.unref();  // never keeps the process alive on its own
}

async function onTimer() {
  try {
    await runScheduledBackupIfDue({});
  } catch (e) { logError('scheduled backup run failed', { error: String((e && e.message) || e) }); }
  // Re-arm only after the run finished, so a slow backup is never re-entered.
  try { armTimer(); } catch (e) { logError('backup timer re-arm failed', { error: String((e && e.message) || e) }); }
}

function startBackupScheduler(options) {
  options = options || {};
  if (process.env.CAMZY_BACKUP_SCHEDULER === 'off') return { started: false, reason: 'disabled_by_env' };
  if (timer || bootTimer) return { started: true, already: true };
  if (options.catchUp !== false) {
    const delayMs = typeof options.catchUpDelayMs === 'number' ? options.catchUpDelayMs : 5000;
    bootTimer = setTimeout(() => {
      bootTimer = null;
      runScheduledBackupIfDue({}).catch((e) => logError('backup catch-up failed', { error: String(e && e.message || e) }));
    }, delayMs);
    if (bootTimer.unref) bootTimer.unref();
  }
  armTimer();
  return { started: true, schedule: describeSchedule() };
}

function stopBackupScheduler() {
  clearTimers();
  return { stopped: true };
}

// Re-read settings and re-arm (called after the admin saves schedule settings).
function restartScheduleTimer() {
  const wasRunning = !!(timer || bootTimer);
  clearTimers();
  if (!wasRunning) return { restarted: false, reason: 'not_running' };
  armTimer();
  return { restarted: true, schedule: describeSchedule() };
}

module.exports = {
  startBackupScheduler,
  stopBackupScheduler,
  restartScheduleTimer,
  runScheduledBackupIfDue,
  describeSchedule,
  evaluateDue,
  newestBackupFileMs,
  // exposed for tests
  _internals: { tzOffsetMs, zonedParts, localDateKey, zonedToUtc, slotStartFor, nextRunAfter, pad2 },
  _constants: { STALE_AFTER_MS, RETRY_MS, MAX_ATTEMPTS_PER_SLOT, RECENT_BACKUP_SLACK_MS, BUSY_RECHECK_MS }
};
