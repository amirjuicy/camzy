const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const RETENTION_DAYS = 1;
const LOG_TYPES = ['requests', 'warnings', 'errors', 'security'];
const SENSITIVE_KEYS = new Set(['password','currentpassword','newpassword','token','authorization','payment_authority','payment_ref_id','paymentauthority','paymentrefid','card','cardnumber','cvv','secret']);

function ensureDir(){ try{fs.mkdirSync(LOG_DIR,{recursive:true});}catch(_){} }

function today(){ return new Date().toISOString().slice(0,10); }
function isLogType(t){ return LOG_TYPES.includes(String(t||'')); }
function normType(t, fallback){ const s=String(t||''); if(isLogType(s)) return s; return fallback||'requests'; }
function logFile(type, date){
  const tp = normType(type);
  const d = isLogDate(date) ? String(date) : today();
  return path.join(LOG_DIR, `${d}-${tp}.log`);
}

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
function isLogDate(value){
  const s=String(value||'');
  if(!DATE_RE.test(s)) return false;
  const d=new Date(s+'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0,10)===s;
}
// Resolve which typed file an entry belongs in.
// Explicit meta.logType wins. Then level: security->security, error->errors, warn->warnings.
// Otherwise route by HTTP status: 5xx->errors, 401/403/404/429->warnings, rest->requests.
function typeForEntry(level, meta){
  if(meta && isLogType(meta.logType)) return meta.logType;
  const l=String(level||'').toLowerCase();
  if(l==='security') return 'security';
  if(l==='error') return 'errors';
  if(l==='warn') return 'warnings';
  if(meta && typeof meta==='object'){
    if(meta.security === true) return 'security';
    const st = meta.status != null ? meta.status : meta.statusCode;
    const n = Number(st);
    if(Number.isFinite(n)){
      if(n >= 500) return 'errors';
      if(n === 401 || n === 403 || n === 404 || n === 429) return 'warnings';
    }
  }
  return 'requests';
}
function logFilePath(date, type){
  if(isLogDate(date)) return logFile(normType(type), date);
  return logFile(normType(type));
}
function logFileInfo(date, type){
  const tp = normType(type);
  const p=logFilePath(date, tp);
  let exists=null, size=0;
  try{ const st=fs.statSync(p); exists=true; size=st.size; }catch(_){ exists=false; }
  const fileName=path.basename(p);
  return { date: isLogDate(date)?String(date):today(), type: tp, fileName, path:`server/logs/${fileName}`, exists, size };
}
function readLogFile(date, type){
  if(!isLogDate(date)) return null;
  const p=logFile(normType(type), date);
  try{ return fs.readFileSync(p,'utf8'); }catch(_){ return null; }
}

function sanitize(obj){
  if(!obj||typeof obj!=='object') return obj;
  const out = Array.isArray(obj)?[...obj]:{...obj};
  for(const k of Object.keys(out)){
    if(SENSITIVE_KEYS.has(k.toLowerCase().replace(/[_-]/g,'')) || k.toLowerCase()==='authorization' || k.toLowerCase().includes('password') || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('payment_')){
      out[k]='[REDACTED]';
    } else if(out[k]&&typeof out[k]==='object') out[k]=sanitize(out[k]);
  }
  return out;
}

function isSensitiveParam(name){
  const n = String(name || '').toLowerCase().replace(/[_-]/g, '');
  return n === 'accesstoken' || n === 'token' || n === 'authorization' || n === 'auth'
    || n.includes('password') || n.includes('secret')
    || n.indexOf('payment') === 0 || n.indexOf('card') === 0 || n === 'cvv';
}
// Redact sensitive query values before any URL/path is logged. Keeps the path,
// parameter names, non-sensitive values and status info intact. Name matching
// is case-insensitive and tolerant of _/-/URL-encoded spellings.
function redactUrl(raw){
  if (typeof raw !== 'string' || !raw) return raw;
  const hash = raw.indexOf('#');
  const frag = hash === -1 ? '' : raw.slice(hash);
  const nofrag = hash === -1 ? raw : raw.slice(0, hash);
  const q = nofrag.indexOf('?');
  if (q === -1) return raw;
  const redacted = nofrag.slice(q + 1).split('&').map((pair) => {
    const eq = pair.indexOf('=');
    const name = eq === -1 ? pair : pair.slice(0, eq);
    let dec = name;
    try { dec = decodeURIComponent(name.replace(/\+/g, ' ')); } catch (_) {}
    if (isSensitiveParam(dec)) return (eq === -1 ? name : name + '=') + '[REDACTED]';
    return pair;
  });
  return nofrag.slice(0, q) + '?' + redacted.join('&') + frag;
}

function genId(){ try{ return require('crypto').randomUUID(); }catch(_){ return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9); } }

function requestIdMiddleware(req,res,next){
  const id = genId();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

function appendEntry(entry, type, date){
  ensureDir();
  const line = JSON.stringify(entry)+'\n';
  try{ fs.appendFileSync(logFile(type, date), line); }catch(_){}
  cleanup();
}

function write(level, msg, meta){
  ensureDir();
  const entry = { timestamp: new Date().toISOString(), level, message: msg };
  if(meta){
    const m=sanitize(meta);
    if(m.requestId) { entry.requestId=m.requestId; }
    entry.meta=m;
  }
  appendEntry(entry, typeForEntry(level, meta));
}

let lastCleanup=0;
// Files with a date < cutoff (today minus RETENTION_DAYS, calendar days) are
// older than 1 day and safe to delete. Today's files (active/current) and
// yesterday's files (previous 24 hours) are always kept, for all log types.
function cutoffDateStr(){
  const d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  return d.toISOString().slice(0,10);
}
function cleanup(force){
  const now=Date.now();
  if(!force && now-lastCleanup<3600000) return;
  lastCleanup=now;
  try{
    const cutoff = cutoffDateStr();
    const files=fs.readdirSync(LOG_DIR);
    for(const f of files){
      let m=f.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
      if(m){
        // Legacy single-file format: split into typed files on first sight, then remove.
        try{ migrateLegacyFile(m[1]); }catch(_){}
        continue;
      }
      m=f.match(/^(\d{4}-\d{2}-\d{2})-(requests|warnings|errors|security)\.log$/);
      if(!m) continue;
      if(m[1] < cutoff){
        try{ fs.unlinkSync(path.join(LOG_DIR,f)); }catch(_){}
      }
    }
  }catch(_){}
}
// Run once on server startup and once per day afterwards.
let _cleanupTimer=null;
function startLogCleanupScheduler(){
  try{ cleanup(true); }catch(_){}
  if(_cleanupTimer) return _cleanupTimer;
  _cleanupTimer = setInterval(()=>{ try{ cleanup(true); }catch(_){} }, 24*60*60*1000);
  if(_cleanupTimer && typeof _cleanupTimer.unref === 'function') _cleanupTimer.unref();
  return _cleanupTimer;
}

// Split a legacy YYYY-MM-DD.log into typed files without losing data.
// Original file is removed only after all its lines were appended to typed files.
function migrateLegacyFile(date){
  if(!isLogDate(date)) return false;
  const src = path.join(LOG_DIR, `${date}.log`);
  let content;
  try{ content = fs.readFileSync(src, 'utf8'); }catch(_){ return false; }
  const buckets = { requests: [], warnings: [], errors: [], security: [] };
  let unparsed = [];
  for(const line of content.split('\n')){
    if(!line) continue;
    try{
      const e = JSON.parse(line);
      const tp = typeForEntry(e.level, e.meta);
      buckets[tp].push(line);
    }catch(_){ unparsed.push(line); }
  }
  if(unparsed.length) buckets.requests.push(...unparsed);
  for(const tp of LOG_TYPES){
    if(!buckets[tp].length) continue;
    try{ fs.appendFileSync(logFile(tp, date), buckets[tp].join('\n')+'\n'); }catch(_){ return false; }
  }
  // Also migrate into today's files if legacy date is today? No — keep per-date files.
  try{ fs.unlinkSync(src); }catch(_){}
  return true;
}
function migrateLegacyLogs(){
  ensureDir();
  let files=[];
  try{ files=fs.readdirSync(LOG_DIR); }catch(_){ return 0; }
  let n=0;
  for(const f of files){
    const m=f.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
    if(m){ try{ if(migrateLegacyFile(m[1])) n++; }catch(_){} }
  }
  return n;
}

function isSecurityPath(p){
  const s=String(p||'');
  return s.includes('/api/auth/') || s.includes('/api/admin/login') || s.includes('/api/admin/password');
}

function requestLogger(req,res,next){
  const start=Date.now();
  req._startAt = start;
  res.on('finish',()=>{
    const duration=Date.now()-start;
    const userId = req.admin?.id || req.user?.id || null;
    const statusCode = res.statusCode;
    const base = {
      requestId: req.requestId,
      method:req.method, path:redactUrl(req.originalUrl), statusCode, status: statusCode, durationMs:duration, duration,
      ...(userId?{userId}:{})
    };
    if(statusCode>=500){
      write('error','request',base);
    } else if(statusCode===401||statusCode===403||statusCode===404||statusCode===429){
      write('warn','request',base);
      // Auth failures / rate limits are also security-relevant: mirror into security log.
      if(statusCode===401||statusCode===403||statusCode===429||isSecurityPath(req.originalUrl)){
        const entry = { timestamp: new Date().toISOString(), level: 'security', message: 'security event', meta: sanitize({ ...base, security: true }) };
        if(base.requestId) entry.requestId = base.requestId;
        appendEntry(entry, 'security');
      }
    } else {
      write('info','request',base);
    }
  });
  next();
}

function logError(msg, meta){ write('error', msg, meta); }
function logInfo(msg, meta){ write('info', msg, meta); }
function logWarn(msg, meta){ write('warn', msg, meta); }
function logSecurity(msg, meta){
  const m = (meta && typeof meta==='object') ? { ...meta, logType: 'security', security: true } : { logType: 'security', security: true };
  write('security', msg, m);
}

function stripStack(entry){
  if(!entry || typeof entry!=='object') return entry;
  const copy={...entry};
  if(copy.meta) copy.meta={...copy.meta};
  // Remove stack from both top-level and meta to avoid leaking to client via admin API
  delete copy.stack;
  if(copy.meta) { delete copy.meta.stack; }
  if(copy.requestId && copy.meta) delete copy.meta.requestId;
  return copy;
}
const TYPED_RE=/^(\d{4}-\d{2}-\d{2})-(requests|warnings|errors|security)\.log$/;
function filesForType(type){
  ensureDir();
  let files=[];
  try{
    files=fs.readdirSync(LOG_DIR).filter(f=>{
      if(!TYPED_RE.test(f)) return false;
      if(type && normType(type) !== f.match(TYPED_RE)[2]) return false;
      return true;
    }).sort().reverse();
  }catch(_){ return []; }
  return files;
}
function readLogs({ type, level, limit=100, offset=0 }={}){
  ensureDir();
  // Backward compat: level=security also selects the security log file.
  let tp = isLogType(type) ? type : null;
  if(!tp && String(level||'').toLowerCase()==='security') tp = 'security';
  const files = filesForType(tp);
  const entries=[];
  for(const f of files){
    try{
      const lines=fs.readFileSync(path.join(LOG_DIR,f),'utf8').split('\n').filter(Boolean);
      for(const line of lines){
        try{
          const e=JSON.parse(line);
          if(level && String(level).toLowerCase()!=='security' && String(e.level).toLowerCase()!==String(level).toLowerCase()) continue;
          let sanitized=sanitize(e);
          sanitized=stripStack(sanitized);
          entries.push(sanitized);
        }catch(_){}
      }
    }catch(_){}
  }
  entries.sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
  const o=Math.max(0,parseInt(offset,10)||0);
  const l=Math.min(Math.max(1,parseInt(limit,10)||100),500);
  return { total: entries.length, items: entries.slice(o,o+l) };
}

function listLogFiles(type){
  ensureDir();
  try{
    return fs.readdirSync(LOG_DIR)
      .filter(f=>{
        const m=f.match(TYPED_RE);
        if(!m) return false;
        if(type && normType(type)!==m[2]) return false;
        return true;
      })
      .map(f=>{
        const m=f.match(TYPED_RE);
        const date=m[1], tp=m[2];
        let size=0;
        try{ size=fs.statSync(path.join(LOG_DIR,f)).size; }catch(_){}
        return { fileName:f, date, type: tp, path:`server/logs/${f}`, size };
      })
      .sort((a,b)=> (b.date.localeCompare(a.date) || a.type.localeCompare(b.type)));
  }catch(_){ return []; }
}

module.exports={ LOG_DIR, LOG_TYPES, RETENTION_DAYS, write, logInfo, logError, logWarn, logSecurity, requestIdMiddleware, requestLogger, sanitize, redactUrl, isSensitiveParam, readLogs, logFilePath, logFileInfo, readLogFile, listLogFiles, isLogDate, isLogType, normType, typeForEntry, migrateLegacyLogs, cleanup, cleanupLogs: cleanup, startLogCleanupScheduler };
migrateLegacyLogs();
startLogCleanupScheduler();
