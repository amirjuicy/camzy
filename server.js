const app = require('./server/app');
const { logInfo, logError } = require('./server/logger');
const backupScheduler = require('./server/backup-scheduler');
const PORT = parseInt(process.env.PORT, 10) || 3003;

process.on('uncaughtException', (err) => { logError('uncaughtException', { error: err.message, stack: err.stack?.slice(0,2000) }); });
process.on('unhandledRejection', (reason) => { logError('unhandledRejection', { error: String(reason).slice(0,2000) }); });

const server = app.listen(PORT, () => {
  console.log(`Camzy dev server running at http://127.0.0.1:${PORT}`);
  logInfo('server started', { port: 3003 });
  // Daily production backup scheduler (00:00 server-local by default).
  // The boot catch-up run is deduplicated, so a restart never doubles up.
  try { logInfo('backup scheduler', backupScheduler.startBackupScheduler()); }
  catch (e) { logError('backup scheduler start failed', { error: String((e && e.message) || e) }); }
});
server.on('error', (err) => {
  console.error(`Failed to listen on port ${PORT}: ${err.message}`);
  logError('server listen error', { error: err.message, port: PORT });
  process.exit(1);
});
function shutdown(sig){
  logInfo('server shutdown', { signal: sig });
  server.close(()=> process.exit(0));
  setTimeout(()=> process.exit(0), 3003);
}
process.on('SIGINT', ()=> shutdown('SIGINT'));
process.on('SIGTERM', ()=> shutdown('SIGTERM'));
