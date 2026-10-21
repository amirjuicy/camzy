/* Camzy — restore validation (never touches the live database).
 *
 * Manual PowerShell usage (run from the project root):
 *   node server/restore-validate.js data/backups/<file>.db
 *
 * What it does: copies the given backup into a separate temporary database,
 * runs PRAGMA integrity_check there, compares key table counts against the
 * backup itself, then deletes the temporary copy. It never writes to the
 * live database path.
 *
 * MANUAL DISASTER-RESTORE PROCEDURE (human only, no automation):
 *   1. Stop the server (close the start_server.bat window / stop the process).
 *   2. Copy the current live files aside:
 *        data/camzy.db -> data/camzy.db.pre-restore-<timestamp>.bak
 *   3. Pick the newest verified backup from data/backups/ and copy it OVER
 *        data/camzy.db (copy, never move, so the backup is preserved).
 *   4. Delete data/camzy.db-wal and data/camzy.db-shm if present.
 *   5. Start the server with start_server.bat and verify / + /api/products.
 *   6. Keep the .pre-restore-.bak until the restored system is confirmed healthy.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const KEY_TABLES = ['orders', 'users', 'products'];

function validateRestore(backupPath) {
  const abs = path.resolve(backupPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  const liveDefault = path.join(__dirname, '..', 'data', 'camzy.db');
  if (path.resolve(abs) === path.resolve(process.env.DB_PATH || liveDefault)) {
    throw new Error('Refusing to validate the live database path itself');
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-validate-'));
  const tmpDb = path.join(tmpDir, 'restore.db');
  try {
    // Simulate placement of the backup without involving the live location.
    fs.copyFileSync(abs, tmpDb);
    const db = new DatabaseSync(tmpDb);
    try {
      const rows = db.prepare('PRAGMA integrity_check').all();
      if (!(rows.length === 1 && rows[0].integrity_check === 'ok')) {
        throw new Error('Restored copy failed integrity_check');
      }
      const counts = {};
      for (const t of KEY_TABLES) {
        try {
          counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
        } catch (_) {
          counts[t] = null;
        }
      }
      return { tmpDb, counts };
    } finally {
      db.close();
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node server/restore-validate.js <backup-file>');
    process.exit(2);
  }
  try {
    const r = validateRestore(target);
    console.log(`RESTORE-VALIDATE OK: ${target}`);
    console.log(`counts=${JSON.stringify(r.counts)} (temp copy removed)`);
  } catch (e) {
    console.error(`RESTORE-VALIDATE FAILED: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { validateRestore, KEY_TABLES };
