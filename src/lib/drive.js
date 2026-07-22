import { google } from 'googleapis';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

let driveClient = null;

function getDriveClient() {
  if (driveClient) return driveClient;

  if (config.google.serviceAccountKeyPath && existsSync(config.google.serviceAccountKeyPath)) {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.serviceAccountKeyPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
  }

  logger.warn('Google Drive credentials not found. Drive operations will run in mock mode.');
  return null;
}

export async function uploadToDrive(filePath, fileName, folderId = null) {
  const drive = getDriveClient();
  if (!drive) {
    logger.info({ filePath, fileName, folderId }, 'Mock Drive Upload');
    return { id: `mock_drive_id_${Date.now()}`, name: fileName, webViewLink: `https://drive.google.com/file/d/mock_${Date.now()}` };
  }

  const fileMetadata = {
    name: fileName,
    parents: folderId ? [folderId] : undefined,
  };

  const media = {
    mimeType: 'audio/mpeg',
    body: createReadStream(filePath),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, webViewLink, size',
  });

  logger.info({ fileId: response.data.id, fileName }, 'Uploaded file to Drive');
  return response.data;
}

export async function downloadFromDrive(fileId, destPath) {
  const drive = getDriveClient();
  if (!drive) {
    logger.info({ fileId, destPath }, 'Mock Drive Download');
    return destPath;
  }

  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  await new Promise((resolve, reject) => {
    const dest = createWriteStream(destPath);
    response.data
      .on('end', resolve)
      .on('error', reject)
      .pipe(dest);
  });

  logger.info({ fileId, destPath }, 'Downloaded file from Drive');
  return destPath;
}

export async function deleteFromDrive(fileId) {
  const drive = getDriveClient();
  if (!drive) {
    logger.info({ fileId }, 'Mock Drive Delete');
    return;
  }

  await drive.files.delete({ fileId });
  logger.info({ fileId }, 'Deleted raw file from Drive');
}

export async function moveDriveFile(fileId, newParentFolderId, currentParentFolderId = null) {
  const drive = getDriveClient();
  if (!drive) {
    logger.info({ fileId, newParentFolderId }, 'Mock Drive Move');
    return;
  }

  let previousParents = currentParentFolderId;
  if (!previousParents) {
    const file = await drive.files.get({ fileId, fields: 'parents' });
    previousParents = file.data.parents ? file.data.parents.join(',') : '';
  }

  await drive.files.update({
    fileId,
    addParents: newParentFolderId,
    removeParents: previousParents,
    fields: 'id, parents',
  });

  logger.info({ fileId, newParentFolderId }, 'Moved file in Drive');
}

export async function pollDriveFolder(folderId) {
  const drive = getDriveClient();
  if (!drive) {
    logger.info({ folderId }, 'Mock Drive Poll Folder');
    return [];
  }

  if (!folderId) return [];

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, createdTime)',
    pageSize: 50,
    orderBy: 'createdTime desc',
  });

  return response.data.files || [];
}