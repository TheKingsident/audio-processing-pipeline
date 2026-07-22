import { jobsDb } from '../db/jobs.js';
import { logger } from '../lib/logger.js';
import { uploadToDrive, deleteFromDrive } from '../lib/drive.js';
import { config } from '../config/index.js';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { dirname } from 'path';

export async function processUploadAndCleanup(jobId, localOutputFiles) {
  logger.info({ jobId, localOutputFiles }, 'Starting Drive upload step');

  jobsDb.updateJob(jobId, { status: 'uploading' });

  const driveResults = {};

  try {
    for (const [type, filePath] of Object.entries(localOutputFiles)) {
      if (existsSync(filePath)) {
        const fileName = `${jobId}_${type}.mp3`;
        const driveFile = await uploadToDrive(filePath, fileName, config.google.finalFolderId);
        driveResults[type] = driveFile.id || driveFile.webViewLink;
      }
    }

    const jobRecord = jobsDb.getJob(jobId);

    // On CONFIRMED upload success: delete local temp files + raw source file
    for (const [type, filePath] of Object.entries(localOutputFiles)) {
      try {
        if (existsSync(filePath)) unlinkSync(filePath);
      } catch (e) {}
    }

    if (jobRecord && jobRecord.sourceFile && existsSync(jobRecord.sourceFile)) {
      try {
        unlinkSync(jobRecord.sourceFile);
        logger.info({ sourceFile: jobRecord.sourceFile }, 'Deleted local raw source audio');
      } catch (e) {}
    }

    // Delete raw source from Drive if sourceFile was a Drive ID or tracked
    if (jobRecord && jobRecord.sourceFile && jobRecord.sourceFile.startsWith('drive_')) {
      const driveFileId = jobRecord.sourceFile.replace('drive_', '');
      try {
        await deleteFromDrive(driveFileId);
      } catch (e) {}
    }

    jobsDb.updateJob(jobId, {
      status: 'done',
      outputFiles: driveResults,
    });

    logger.info({ jobId, driveResults }, 'Upload confirmed and temp files cleaned up. Job done!');
    return driveResults;
  } catch (err) {
    logger.error({ jobId, err: err.message }, 'Upload step failed. Local files retained.');
    jobsDb.updateJob(jobId, {
      status: 'failed',
      error: `Upload error: ${err.message}`,
    });
    throw err;
  }
}
