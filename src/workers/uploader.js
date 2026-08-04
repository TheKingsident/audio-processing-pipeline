import { jobsDb } from '../db/jobs.js';
import { logger } from '../lib/logger.js';
import { uploadToDrive, deleteFromDrive } from '../lib/drive.js';
import { config } from '../config/index.js';
import { existsSync, unlinkSync } from 'fs';

export async function processUploadAndCleanup(jobId, localOutputFiles) {
  const isDriveEnabled = config.google.enableDriveUpload && config.google.finalFolderId;

  if (!isDriveEnabled) {
    logger.info({ jobId, localOutputFiles }, 'Local Storage Mode active (ENABLE_DRIVE_UPLOAD=false). Preserving clips on disk.');

    jobsDb.updateJob(jobId, {
      status: 'done',
      outputFiles: localOutputFiles,
    });

    logger.info({ jobId, localOutputFiles }, 'Audio editing complete! Final files saved locally in ./src/temp/processed/');
    return localOutputFiles;
  }

  // ── Drive Upload Mode (Production) ──────────────────────────────────────
  logger.info({ jobId, localOutputFiles }, 'Drive Upload Mode active. Uploading processed files to Google Drive...');

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
