/**
 * Process bootstrap.
 *
 * Verifies the database is reachable before accepting traffic, then starts the
 * HTTP server and installs a graceful shutdown that drains in-flight requests
 * before closing the pool.
 */
import http from 'node:http';
import { createApp } from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import { healthcheck, closePool } from './db/pool.js';
import { ensureDirectories } from './storage/storage.service.js';
import { verifyTransport } from './services/email/mailer.js';
import { closeAll as closeStreams } from './services/realtime.service.js';
import { registerJobs, start as startJobs, stop as stopJobs } from './jobs/index.js';

const app = createApp();
const server = http.createServer(app);

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

/**
 * Listen failures, reported as themselves.
 *
 * A port already in use is by far the most common way this process fails to
 * start, and without this handler the diagnosis is actively misleading: the
 * listen error arrives as an uncaught exception, the shutdown path then calls
 * `server.close()` on a server that never opened, and the last thing printed
 * is "Server is not running." That reads as though the process stopped on its
 * own rather than as though something else already holds the port.
 *
 * Exits straight away instead of going through `shutdown`: there are no
 * in-flight requests to drain on a server that never accepted one.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(
      'Port ' + env.PORT + ' is already in use - another copy of this server is probably ' +
        'still running. Stop that one, or set PORT in backend/.env to a free port.',
    );
  } else if (err.code === 'EACCES') {
    logger.fatal('Not allowed to bind port ' + env.PORT + '. Pick a port above 1024.');
  } else {
    logger.fatal({ err }, 'HTTP server error');
  }

  closePool()
    .catch(() => {})
    .finally(() => process.exit(1));
});

async function start() {
  await ensureDirectories();

  try {
    const db = await healthcheck();
    logger.info({ latencyMs: db.latencyMs, database: env.DB_NAME }, 'PostgreSQL connected');
  } catch (err) {
    logger.error(
      { err: err.message },
      'Cannot reach PostgreSQL. Check DB_* values in .env, then run: npm run db:create && npm run migrate',
    );
    process.exit(1);
  }

  // Surfaces a broken mail configuration now rather than when the first
  // customer cannot receive their verification code. Deliberately not fatal:
  // email being down must not take the whole API down with it.
  await verifyTransport();

  registerJobs();
  startJobs();

  server.listen(env.PORT, () => {
    logger.info(
      'ServiceMitra API listening on http://localhost:' +
        env.PORT +
        env.API_PREFIX +
        '  [' +
        env.NODE_ENV +
        ']',
    );
  });
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const force = setTimeout(() => {
    logger.error('Forced shutdown after 15s timeout');
    process.exit(1);
  }, 15_000);
  force.unref();

  // Stop taking new background work, then release the open SSE connections,
  // which would otherwise keep the server alive past the drain.
  stopJobs();
  closeStreams();

  // Nothing to drain when the server never started listening - calling close()
  // here is what produced the misleading "Server is not running." line that
  // used to be the last thing on screen after a failed boot.
  if (!server.listening) {
    try {
      await closePool();
    } catch (closeErr) {
      logger.error({ err: closeErr }, 'Error while closing the database pool');
    }
    logger.info('Shutdown complete');
    process.exit(1);
    return;
  }

  server.close(async (err) => {
    if (err) logger.error({ err }, 'Error while closing HTTP server');
    try {
      await closePool();
    } catch (closeErr) {
      logger.error({ err: closeErr }, 'Error while closing the database pool');
    }
    logger.info('Shutdown complete');
    process.exit(err ? 1 : 0);
  });
}

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});

start();

export { app, server };
