import { spawn } from 'child_process';
import { readFileSync, rmSync, mkdtempSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { logger } from './logger.js';

export async function transcribeWithWhisperX(audioPath, onProgress) {
  if (process.env.USE_MOCK_TRANSCRIPTION === 'true') {
    logger.info({ audioPath }, 'Using mock transcription mode');
    return mockTranscription(audioPath);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'whisperx-'));
  const pythonCmd = process.env.WHISPERX_PYTHON
    || (process.platform === 'win32' ? 'python' : 'python3');

  const args = [
    '-m', 'whisperx',
    audioPath,
    '--output_format', 'json',
    '--output_dir', tempDir,
    '--language', 'en',
  ];

  return new Promise((resolve, reject) => {
    logger.info({ audioPath, tempDir }, 'Spawning WhisperX subprocess');
    const proc = spawn(pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      const progressMatch = stdout.match(/(\d+)%/);
      if (progressMatch && onProgress) {
        onProgress(parseInt(progressMatch[1], 10));
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        logger.error({ stderr, code }, 'WhisperX failed');
        cleanup(tempDir);
        reject(new Error(`WhisperX exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = await parseWhisperXOutput(tempDir);
        cleanup(tempDir);
        resolve(result);
      } catch (err) {
        cleanup(tempDir);
        reject(err);
      }
    });

    proc.on('error', (err) => {
      cleanup(tempDir);
      logger.warn({ err: err.message }, 'Failed to spawn WhisperX subprocess, falling back to mock transcription if in dev');
      if (process.env.NODE_ENV === 'development' || process.env.ALLOW_FALLBACK === 'true') {
        resolve(mockTranscription(audioPath));
      } else {
        reject(new Error(`Failed to spawn WhisperX: ${err.message}`));
      }
    });
  });
}

async function parseWhisperXOutput(tempDir) {
  const files = readdirSync(tempDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error('No WhisperX output JSON files found');
  }

  const allWords = [];
  let language = 'en';

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(tempDir, file), 'utf-8'));
    if (data.language) language = data.language;

    for (const segment of data.segments || []) {
      for (const word of segment.words || []) {
        if (word.word && typeof word.start === 'number' && typeof word.end === 'number') {
          allWords.push({
            word: word.word.trim(),
            start: Number(word.start.toFixed(2)),
            end: Number(word.end.toFixed(2)),
          });
        }
      }
    }
  }

  allWords.sort((a, b) => a.start - b.start);
  return allWords;
}

function cleanup(tempDir) {
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {}
}

export function mockTranscription(audioPath = '') {
  return [
    { word: 'Welcome', start: 0.0, end: 0.5 },
    { word: 'everyone.', start: 0.5, end: 1.0 },
    { word: 'Let', start: 1.2, end: 1.4 },
    { word: 'us', start: 1.4, end: 1.6 },
    { word: 'pray', start: 1.6, end: 2.0 },
    { word: 'Heavenly', start: 2.5, end: 3.0 },
    { word: 'Father,', start: 3.0, end: 3.5 },
    { word: 'we', start: 3.5, end: 3.7 },
    { word: 'thank', start: 3.7, end: 4.0 },
    { word: 'you', start: 4.0, end: 4.2 },
    { word: 'for', start: 4.2, end: 4.4 },
    { word: 'this', start: 4.4, end: 4.6 },
    { word: 'day.', start: 4.6, end: 5.0 },
    { word: 'Amen.', start: 5.5, end: 6.0 },
    { word: 'Now,', start: 15.0, end: 15.5 },
    { word: 'turn', start: 15.5, end: 15.8 },
    { word: 'your', start: 15.8, end: 16.0 },
    { word: 'Bibles', start: 16.0, end: 16.5 },
    { word: 'to', start: 16.5, end: 16.7 },
    { word: 'John', start: 16.7, end: 17.0 },
    { word: 'chapter', start: 17.0, end: 17.4 },
    { word: 'three,', start: 17.4, end: 17.8 },
    { word: 'verse', start: 17.8, end: 18.1 },
    { word: 'sixteen.', start: 18.1, end: 18.8 },
    { word: 'Today', start: 19.0, end: 19.4 },
    { word: 'we', start: 19.4, end: 19.6 },
    { word: 'study', start: 19.6, end: 20.0 },
    { word: 'God\'s', start: 20.0, end: 20.3 },
    { word: 'love.', start: 20.3, end: 20.8 },
    { word: 'Speaking', start: 120.0, end: 120.5 },
    { word: 'of', start: 120.5, end: 120.7 },
    { word: 'cars,', start: 120.7, end: 121.2 },
    { word: 'the', start: 121.2, end: 121.4 },
    { word: 'parking', start: 121.4, end: 121.8 },
    { word: 'lot', start: 121.8, end: 122.0 },
    { word: 'was', start: 122.0, end: 122.2 },
    { word: 'full!', start: 122.2, end: 122.8 },
    { word: 'Anyway,', start: 150.0, end: 150.5 },
    { word: 'back', start: 150.5, end: 150.8 },
    { word: 'to', start: 150.8, end: 151.0 },
    { word: 'verse', start: 151.0, end: 151.4 },
    { word: 'sixteen.', start: 151.4, end: 152.0 },
  ];
}