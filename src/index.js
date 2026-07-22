import { startApiServer } from './api/index.js';
import { logger } from './lib/logger.js';
import { config } from './config/index.js';

async function main() {
  logger.info({ env: config.nodeEnv }, 'Starting Church Audio Processing Pipeline Server...');

  const server = await startApiServer();

  const shutdown = () => {
    logger.info('Shutting down API server...');
    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err: err.message }, 'Fatal error starting server');
  process.exit(1);
});
