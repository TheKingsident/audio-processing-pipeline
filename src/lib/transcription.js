import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

export async function transcribeWithWhisperX(audioPath, options = {}) {
  const {
    model = 'large-v2',
    language = 'en',
    device = 'cuda',
    computeType = 'float16',
    batchSize = 16,
    outputDir = null,
  } = options;

  const outputDirPath = outputDir || join(process.cwd(), 'src', 'temp', 'transcripts');
  
  // Build command arguments
  const args = [
    audioPath,
    '--model', model,
    '--language', language,
    '--device', device,
    '--compute_type', computeType,
    '--batch_size', String(batchSize),
    '--output_dir', outputDirPath,
    '--output_format', 'json',
    '--word_timestamps', 'True',
  ];

  // Check if diarization is requested
  if (options.diarize) {
    args.push('--diarize');
    if (options.hfToken) {
      args.push('--hf_token', options.hfToken);
    }
  }

  logger.info({ args: args.filter(a => a !== options.hfToken) }, 'Running WhisperX');

  try {
    const { stdout, stderr } = await execFileAsync('whisperx', args, {
      timeout: 3600000, // 1 hour timeout
      maxBuffer: 1024 * 1024 * 50, // 50MB buffer
    });

    if (stderr) {
      logger.warn({ stderr }, 'WhisperX stderr');
    }

    // Find output JSON file
    const fs = await import('fs');
    const files = await fs.promises.readdir(outputDirPath);
    const jsonFile = files.find(f => f.endsWith('.json') && f.includes(join(audioPath).split('/').pop().split('.')[0]));
    
    if (!jsonFile) {
      throw new Error('No output JSON file found from WhisperX');
    }

    const result = JSON.parse(
      await fs.promises.readFile(join(outputDirPath, jsonFile), 'utf-8')
    );

    // Clean up transcript file if not needed
    if (!options.keepTranscriptFile) {
      await fs.promises.unlink(join(outputDirPath, jsonFile)).catch(() => {});
    }

    return normalizeWhisperXResult(result);
  } catch (error) {
    logger.error({ err: error, audioPath }, 'WhisperX transcription failed');
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

function normalizeWhisperXResult(result) {
  // WhisperX returns segments with words array containing word-level timestamps
  const words = [];
  
  for (const segment of result.segments || []) {
    for (const word of segment.words || []) {
      words.push({
        word: word.word,
        start: word.start,
        end: word.end,
        score: word.score || 1.0,
        speaker: word.speaker || segment.speaker || null,
      });
    }
  }

  return {
    language: result.language,
    duration: result.segments[result.segments.length - 1]?.end || 0,
    segments: result.segments.map(s => ({
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text,
      speaker: s.speaker || null,
    })),
    words,
  };
}

export async function transcribeWithWhisperLocal(audioPath, options = {}) {
  // Fallback to local whisper.cpp or openai-whisper if WhisperX not available
  const { model = 'base', language = 'en' } = options;
  
  const args = [
    audioPath,
    '--model', model,
    '--language', language,
    '--output_format', 'json',
    '--word_timestamps', 'True',
  ];

  try {
    const { stdout } = await execFileAsync('whisper', args, {
      timeout: 3600000,
      maxBuffer: 1024 * 1024 * 50,
    });

    const result = JSON.parse(stdout);
    return normalizeWhisperResult(result);
  } catch (error) {
    logger.error({ err: error }, 'Local whisper failed');
    throw error;
  }
}

function normalizeWhisperResult(result) {
  const words = [];
  for (const segment of result.segments || []) {
    for (const word of segment.words || []) {
      words.push({
        word: word.word,
        start: word.start,
        end: word.end,
        score: word.probability || 1.0,
      });
    }
  }

  return {
    language: result.language,
    duration: result.segments[result.segments.length - 1]?.end || 0,
    segments: result.segments.map(s => ({
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    words,
  };
}