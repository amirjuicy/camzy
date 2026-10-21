#!/usr/bin/env node
// Production-safe SQLite hot backup using VACUUM INTO (works with WAL, no DB lock/copy corruption)
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'camzy.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');

function backup() {
  if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `camzy-${ts}.db`);

  // VACUUM INTO creates consistent snapshot even while DB is in use (SQLite 3.27+)
  const db = new DatabaseSync(DB_PATH);
  try {
    // Escape single quotes in path
    const safePath = dest.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safePath}'`);
  } finally {
    db.close();
  }

  // Verify backup integrity into temp, don't touch live DB
  const vdb = new DatabaseSync(dest);
  try {
    const row = vdb.prepare('PRAGMA integrity_check').get();
    const ok = row && (row.integrity_check === 'ok' || Object.values(row)[0] === 'ok');
    if (!ok) throw new Error(`Backup integrity check failed: ${JSON.stringify(row)}`);
    // Also ensure tables exist
    vdb.prepare('SELECT count(*) as n FROM sqlite_master').get();
  } finally {
    vdb.close();
  }

  console.log(`Backup created: ${dest}`);
  // Optional prune: keep last 20
  const files = fs.readdirSync(BACKUP_DIR).filter(f=>f.endsWith('.db')).map(f=>path.join(BACKUP_DIR,f)).sort();
  while (files.length > 20) {
    const old = files.shift();
    fs.unlinkSync(old);
    console.log(`Pruned old backup: ${old}`);
  }
  return dest;
}

if (require.main === module) {
  try { backup(); } catch(e){ console.error(e.message); process.exit(1); }
}
module.exports = { backup, DB_PATH, BACKUP_DIR };
