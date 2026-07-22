import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { jobsDb } from '../db/jobs.js';
import { segmentTranscriptWithLLM } from '../lib/llm.js';
import { redisConnection } from '../lib/queue.js';

export async function processSegmentationJob(job) {
  const { jobId } = job.data;
  logger.info({ jobId }, 'Processing segmentation job');

  const jobRecord = jobsDb.getJob(jobId);
  if (!jobRecord || !jobRecord.transcript) {
    throw new Error(`Job ${jobId} missing or has no transcript`);
  }

  jobsDb.updateJob(jobId, { status: 'segmenting' });

  try {
    const { boundaryFound, proposedCuts } = await segmentTranscriptWithLLM(jobRecord.transcript);

    const nextStatus = boundaryFound ? 'awaiting_review' : 'no_split_needed';

    jobsDb.updateJob(jobId, {
      status: nextStatus,
      boundaryFound,
      proposedCuts,
    });

    logger.info({ jobId, boundaryFound, cutsCount: proposedCuts.length, status: nextStatus }, 'Segmentation completed. Pipeline paused for human review.');
    return { boundaryFound, cutsCount: proposedCuts.length, status: nextStatus };
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Segmentation worker failed');
    jobsDb.updateJob(jobId, {
      status: 'failed',
      error: `Segmentation error: ${err.message}`,
    });
    throw err;
  }
}

export function createSegmentationWorker() {
  return new Worker(config.queue.segmentation, processSegmentationJob, {
    connection: redisConnection,
    concurrency: config.queue.concurrency,
  });
}

export default createSegmentationWorker;