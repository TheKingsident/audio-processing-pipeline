import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { jobsDb } from '../db/jobs.js';
import { processAudioCuts } from '../lib/ffmpeg.js';
import { processUploadAndCleanup } from './uploader.js';
import { redisConnection } from '../lib/queue.js';
import { join } from 'path';

export async function processEditJob(job) {
  const { jobId } = job.data;
  logger.info({ jobId }, 'Processing edit job');

  const jobRecord = jobsDb.getJob(jobId);
  if (!jobRecord) {
    throw new Error(`Job ${jobId} not found`);
  }

  const cutsToUse = jobRecord.reviewedCuts || jobRecord.proposedCuts || [];
  if (cutsToUse.length === 0) {
    throw new Error(`Job ${jobId} has no cuts to process`);
  }

  jobsDb.updateJob(jobId, { status: 'editing' });

  const outputDir = join(config.storage.processedDir, jobId);

  try {
    const localOutputFiles = await processAudioCuts(jobRecord.sourceFile, cutsToUse, outputDir);
    logger.info({ jobId, localOutputFiles }, 'Audio editing complete, proceeding to upload step');

    return await processUploadAndCleanup(jobId, localOutputFiles);
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Editor worker failed');
    jobsDb.updateJob(jobId, {
      status: 'failed',
      error: `Edit error: ${err.message}`,
    });
    throw err;
  }
}

export function createEditUploadWorker() {
  return new Worker(config.queue.editUpload, processEditJob, {
    connection: redisConnection,
    concurrency: 1, // Concurrency 1 to prevent FFmpeg resource exhaustion
  });
}

export default createEditUploadWorker;