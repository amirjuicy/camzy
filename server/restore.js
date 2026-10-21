#!/usr/bin/env node
// Safe restore: validates backup integrity in temp, then atomically replaces live DB
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'camzy.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');

function verifyBackup(backupPath) {
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);
  const db = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    const val = row ? Object.values(row)[0] : null;
    if (val !== 'ok') throw new Error(`Integrity check failed: ${JSON.stringify(row)}`);
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } finally { db.close(); }
}

function restore(backupPath, opts = {}) {
  const src = path.resolve(backupPath);
  verifyBackup(src);

  if (opts.verifyOnly) {
    console.log(`Backup verified OK (not restored): ${src}`);
    return;
  }

  // Safe replace: close WAL, copy to temp then rename
  const tmpDest = DB_PATH + '.restore.tmp';
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Backup current live DB before overwrite
  if (fs.existsSync(DB_PATH)) {
    const preBackup = DB_PATH + `.pre-restore-${Date.now()}.bak`;
    try { fs.copyFileSync(DB_PATH, preBackup); } catch(_) {}
  }
  fs.copyFileSync(src, tmpDest);
  // Verify temp copy
  verifyBackup(tmpDest);
  // Atomic replace
  fs.renameSync(tmpDest, DB_PATH);
  // Remove stale WAL/SHM
  for (const suf of ['-wal','-shm']) try{ fs.unlinkSync(DB_PATH+suf);}catch(_){}
  console.log(`Restored ${src} -> ${DB_PATH}`);
}

if (require.main === module) {
  const arg = process.argv[2];
  const verifyOnly = process.argv.includes('--verify-only') || process.argv.includes('--verify');
  if (!arg) {
    console.error('Usage: node server/restore.js <backup-file> [--verify-only]');
    console.error(`Backups in: ${BACKUP_DIR}`);
    const dir = BACKUP_DIR;
    if (fs.existsSync(dir)) console.error('Available:', fs.readdirSync(dir).join(', ') || '(none)');
    process.exit(1);
  }
  try { restore(arg, { verifyOnly }); } catch(e){ console.error(e.message); process.exit(1); }
}
module.exports = { restore, verifyBackup, DB_PATH, BACKUP_DIR };
