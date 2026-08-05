import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { jobsDb } from '../db/jobs.js';
import { transcribeWithWhisperX } from '../lib/whisper.js';
import { getRedisConfig, enqueueSegmentationJob } from '../lib/queue.js';

export async function processTranscriptionJob(job) {
  const { jobId, filePath } = job.data;
  logger.info({ jobId, filePath }, 'Processing transcription job');

  const jobRecord = jobsDb.getJob(jobId);
  if (!jobRecord) {
    throw new Error(`Job ${jobId} not found in database`);
  }

  jobsDb.updateJob(jobId, { status: 'transcribing', progress: 0 });

  try {
    let lastProgress = -1;
    const transcriptWords = await transcribeWithWhisperX(filePath, (progress) => {
      job.updateProgress(progress).catch(() => {});
      if (progress !== lastProgress) {
        lastProgress = progress;
        jobsDb.updateJob(jobId, { progress });
      }
    });

    jobsDb.updateJob(jobId, {
      status: 'segmenting',
      progress: 100,
      transcript: transcriptWords,
    });

    await enqueueSegmentationJob(jobId);
    logger.info({ jobId }, 'Transcription complete. Enqueued for segmentation.');
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Transcription failed');
    jobsDb.updateJob(jobId, {
      status: 'failed',
      error: `Transcription error: ${err.message}`,
    });
    throw err;
  }
}

export function createTranscriptionWorker() {
  return new Worker(config.queue.transcription, processTranscriptionJob, {
    connection: getRedisConfig(),
    concurrency: config.queue.concurrency,
  });
}

export default createTranscriptionWorker;