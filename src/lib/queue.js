import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export function getRedisConfig() {
  const commonOpts = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    keepAlive: 10000,
    family: 4,
  };

  if (config.redis.url) {
    const isTls = config.redis.url.startsWith('rediss://');
    return new Redis(config.redis.url, {
      ...commonOpts,
      tls: isTls ? {} : undefined,
    });
  }

  const redisOpts = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    ...commonOpts,
  };

  if (config.redis.tls) {
    redisOpts.tls = {};
  }

  return new Redis(redisOpts);
}

export const transcriptionQueue = new Queue(config.queue.transcription, {
  connection: getRedisConfig(),
});

export const segmentationQueue = new Queue(config.queue.segmentation, {
  connection: getRedisConfig(),
});

export const editUploadQueue = new Queue(config.queue.editUpload, {
  connection: getRedisConfig(),
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
