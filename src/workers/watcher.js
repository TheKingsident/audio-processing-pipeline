import cron from 'node-cron';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { jobsDb } from '../db/jobs.js';
import { pollDriveFolder, downloadFromDrive, moveDriveFile } from '../lib/drive.js';
import { enqueueTranscriptionJob } from '../lib/queue.js';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

export async function checkDriveIntake() {
  logger.info('Running Google Drive intake check');

  if (!config.google.toProcessFolderId) {
    logger.info('No "To Be Processed" Drive folder ID configured. Skipping poll.');
    return { checked: true, foundFiles: 0 };
  }

  try {
    const files = await pollDriveFolder(config.google.toProcessFolderId);
    logger.info({ count: files.length }, 'Polled Drive "To Be Processed" folder');

    for (const file of files) {
      logger.info({ fileId: file.id, name: file.name }, 'Processing new Drive file');

      if (!existsSync(config.storage.uploadDir)) {
        mkdirSync(config.storage.uploadDir, { recursive: true });
      }

      const localPath = join(config.storage.uploadDir, `${randomUUID()}_${file.name}`);
      await downloadFromDrive(file.id, localPath);

      const job = jobsDb.createJob({
        sourceFile: localPath,
        status: 'transcribing',
      });

      if (config.google.inProgressFolderId) {
        await moveDriveFile(file.id, config.google.inProgressFolderId, config.google.toProcessFolderId);
      }

      await enqueueTranscriptionJob(job.jobId, localPath);
      logger.info({ jobId: job.jobId, driveFileId: file.id }, 'Claimed Drive file and enqueued transcription job');
    }

    return { checked: true, foundFiles: files.length };
  } catch (err) {
    logger.error({ err: err.message }, 'Watcher check failed');
    throw err;
  }
}

export function startWatcherCronSchedules() {
  const cronExpressions = [
    // Sunday 9:45–10:45am, every 10 min
    '45,55 9 * * 0',
    '5,15,25,35,45 10 * * 0',

    // Sunday 12:30–1:30pm, every 10 min
    '30,40,50 12 * * 0',
    '0,10,20,30 13 * * 0',

    // Wednesday 6:40–7:20pm, every 10 min
    '40,50 18 * * 3',
    '0,10,20 19 * * 3',
  ];

  logger.info({ count: cronExpressions.length }, 'Registering node-cron schedules for Drive watcher');

  cronExpressions.forEach((expr) => {
    cron.schedule(expr, () => {
      checkDriveIntake().catch((err) => logger.error({ err: err.message }, 'Cron watcher error'));
    });
  });
}

export default startWatcherCronSchedules;