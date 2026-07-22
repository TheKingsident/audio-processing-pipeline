import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { jobsDb } from '../../db/jobs.js';
import { config } from '../../config/index.js';
import { enqueueTranscriptionJob } from '../../lib/queue.js';
import { logger } from '../../lib/logger.js';

const router = express.Router();

if (!existsSync(config.storage.uploadDir)) {
  mkdirSync(config.storage.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.storage.uploadDir),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `${uuidv4()}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

router.post('/', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const localPath = req.file.path;
    const job = jobsDb.createJob({
      sourceFile: localPath,
      status: 'transcribing',
    });

    await enqueueTranscriptionJob(job.jobId, localPath);

    logger.info({ jobId: job.jobId, localPath }, 'Audio file uploaded and transcription job queued');

    res.status(201).json({
      jobId: job.jobId,
      status: job.status,
      message: 'Audio file uploaded successfully. Transcription queued.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;