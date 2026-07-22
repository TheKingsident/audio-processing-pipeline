import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { jobsDb } from '../db/jobs.js';
import { transcribeWithWhisperX } from '../lib/whisper.js';
import { redisConnection, enqueueSegmentationJob } from '../lib/queue.js';

export async function processTranscriptionJob(job) {
  const { jobId, filePath } = job.data;
  logger.info({ jobId, filePath }, 'Processing transcription job');

  const jobRecord = jobsDb.getJob(jobId);
  if (!jobRecord) {
    throw new Error(`Job ${jobId} not found in database`);
  }

  jobsDb.updateJob(jobId, { status: 'transcribing' });

  try {
    const transcriptWords = await transcribeWithWhisperX(filePath, (progress) => {
      job.updateProgress(progress).catch(() => {});
    });

    jobsDb.updateJob(jobId, {
      status: 'segmenting',
      transcript: transcriptWords,
    });

    await enqueueSegmentationJob(jobId);
    logger.info({ jobId, wordCount: transcriptWords.length }, 'Transcription completed successfully');
    return { wordCount: transcriptWords.length };
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Transcription worker failed');
    jobsDb.updateJob(jobId, {
      status: 'failed',
      error: `Transcription error: ${err.message}`,
    });
    throw err;
  }
}

export function createTranscriptionWorker() {
  return new Worker(config.queue.transcription, processTranscriptionJob, {
    connection: redisConnection,
    concurrency: config.queue.concurrency,
  });
}

export default createTranscriptionWorker;