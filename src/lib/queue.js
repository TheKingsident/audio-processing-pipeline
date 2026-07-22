import { Queue } from 'bullmq';
import { IORedis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export const redisConnection = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redisConnection.on('error', (err) => {
  logger.warn({ err: err.message }, 'Redis connection error (queue will retry or mock mode can be used)');
});

export const transcriptionQueue = new Queue(config.queue.transcription, {
  connection: redisConnection,
});

export const segmentationQueue = new Queue(config.queue.segmentation, {
  connection: redisConnection,
});

export const editUploadQueue = new Queue(config.queue.editUpload, {
  connection: redisConnection,
});

export async function enqueueTranscriptionJob(jobId, filePath) {
  try {
    await transcriptionQueue.add('transcribe', { jobId, filePath });
    logger.info({ jobId, filePath }, 'Enqueued to transcription-queue');
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Failed to enqueue to transcription-queue');
    throw err;
  }
}

export async function enqueueSegmentationJob(jobId) {
  try {
    await segmentationQueue.add('segment', { jobId });
    logger.info({ jobId }, 'Enqueued to segmentation-queue');
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Failed to enqueue to segmentation-queue');
    throw err;
  }
}

export async function enqueueEditUploadJob(jobId) {
  try {
    await editUploadQueue.add('edit-upload', { jobId });
    logger.info({ jobId }, 'Enqueued to edit-upload-queue');
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Failed to enqueue to edit-upload-queue');
    throw err;
  }
}
