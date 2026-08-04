import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' || (process.env.REDIS_HOST && process.env.REDIS_HOST.includes('upstash.io')),
  },

  db: {
    path: process.env.DB_PATH || './data/church-audio-pipeline.db',
  },

  storage: {
    uploadDir: process.env.UPLOAD_DIR || './src/temp/uploads',
    processedDir: process.env.PROCESSED_DIR || './src/temp/processed',
    maxFileSize: process.env.MAX_FILE_SIZE || '500MB',
  },

  ffmpeg: {
    path: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  },

  queue: {
    transcription: 'transcription-queue',
    segmentation: 'segmentation-queue',
    editUpload: 'edit-upload-queue',
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  },

  google: {
    enableDriveUpload: process.env.ENABLE_DRIVE_UPLOAD === 'true',
    serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || '',
    toProcessFolderId: process.env.GOOGLE_DRIVE_TO_PROCESS_FOLDER_ID || '',
    inProgressFolderId: process.env.GOOGLE_DRIVE_IN_PROGRESS_FOLDER_ID || '',
    finalFolderId: process.env.GOOGLE_DRIVE_FINAL_FOLDER_ID || '',
  },

  llm: {
    provider: process.env.LLM_PROVIDER || '', // 'moonshot' | 'anthropic' | 'openai' | 'custom'
    moonshotApiKey: process.env.MOONSHOT_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || '',
    model: process.env.LLM_MODEL || '',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;