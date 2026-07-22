import { createTranscriptionWorker } from './transcribe.js';
import { createSegmentationWorker } from './segment.js';
import { createEditUploadWorker } from './editor.js';
import { startWatcherCronSchedules } from './watcher.js';
import { logger } from '../lib/logger.js';
import { initDatabase } from '../db/index.js';

async function startWorkers() {
  logger.info('Initializing Database for Background Workers...');
  initDatabase();

  logger.info('Starting BullMQ Workers...');

  const transcribeWorker = createTranscriptionWorker();
  const segmentWorker = createSegmentationWorker();
  const editUploadWorker = createEditUploadWorker();

  startWatcherCronSchedules();

  logger.info('All workers and cron schedules started successfully.');

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await transcribeWorker.close();
    await segmentWorker.close();
    await editUploadWorker.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startWorkers().catch((err) => {
  logger.error({ err: err.message }, 'Failed to start workers');
  process.exit(1);
});
