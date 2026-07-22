import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { logger } from './logger.js';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync, rmSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

export async function getAudioMetadata(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
}

export async function trimAudioSegment(inputPath, outputPath, start, end) {
  const duration = end - start;
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    if (start > 0) cmd = cmd.seekInput(start);
    if (duration > 0) cmd = cmd.duration(duration);

    cmd
      .outputOptions([
        '-acodec libmp3lame',
        '-b:a 192k',
        '-ar 44100',
        '-ac 2',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

export async function concatenateAudioFiles(inputPaths, outputPath) {
  if (inputPaths.length === 0) throw new Error('No input files provided for concatenation');
  if (inputPaths.length === 1) {
    // Just copy or single trim output
    return inputPaths[0];
  }

  const concatListPath = join(tmpdir(), `concat_${randomUUID()}.txt`);
  const content = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  writeFileSync(concatListPath, content, 'utf-8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', () => {
        try { unlinkSync(concatListPath); } catch {}
        resolve(outputPath);
      })
      .on('error', (err) => {
        try { unlinkSync(concatListPath); } catch {}
        reject(err);
      })
      .run();
  });
}

export function calculateKeepSermonSegments(sermonCuts, removeCuts) {
  const keep = [];

  for (const sermon of sermonCuts) {
    let currentStart = sermon.start;

    // Filter cuts that overlap with this sermon segment
    const relevantCuts = removeCuts
      .filter(c => c.end > sermon.start && c.start < sermon.end)
      .sort((a, b) => a.start - b.start);

    for (const cut of relevantCuts) {
      if (cut.start > currentStart) {
        keep.push({
          start: currentStart,
          end: Math.min(cut.start, sermon.end),
          type: 'sermon',
          reason: 'sermon segment keep',
        });
      }
      currentStart = Math.max(currentStart, cut.end);
    }

    if (currentStart < sermon.end) {
      keep.push({
        start: currentStart,
        end: sermon.end,
        type: 'sermon',
        reason: 'sermon segment keep',
      });
    }
  }

  return keep;
}

export async function processAudioCuts(sourceFile, reviewedCuts, outputDir) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const prayerCuts = reviewedCuts.filter(c => c.type === 'prayer');
  const sermonCuts = reviewedCuts.filter(c => c.type === 'sermon');
  const removeCuts = reviewedCuts.filter(c => c.type === 'cut');

  const outputFiles = {};

  // 1. Process Prayer Segment
  if (prayerCuts.length > 0) {
    const prayerOutputPath = join(outputDir, 'prayer_segment.mp3');
    if (prayerCuts.length === 1) {
      await trimAudioSegment(sourceFile, prayerOutputPath, prayerCuts[0].start, prayerCuts[0].end);
    } else {
      const tempFiles = [];
      for (let i = 0; i < prayerCuts.length; i++) {
        const seg = prayerCuts[i];
        const tempSegPath = join(outputDir, `temp_prayer_${i}.mp3`);
        await trimAudioSegment(sourceFile, tempSegPath, seg.start, seg.end);
        tempFiles.push(tempSegPath);
      }
      await concatenateAudioFiles(tempFiles, prayerOutputPath);
      tempFiles.forEach(f => { try { unlinkSync(f); } catch {} });
    }
    outputFiles.prayer = prayerOutputPath;
  }

  // 2. Process Sermon Segment (removing cuts/jokes/tangents)
  const keepSermonSegments = calculateKeepSermonSegments(sermonCuts, removeCuts);
  if (keepSermonSegments.length > 0) {
    const sermonOutputPath = join(outputDir, 'sermon_edited.mp3');
    if (keepSermonSegments.length === 1) {
      await trimAudioSegment(sourceFile, sermonOutputPath, keepSermonSegments[0].start, keepSermonSegments[0].end);
    } else {
      const tempFiles = [];
      for (let i = 0; i < keepSermonSegments.length; i++) {
        const seg = keepSermonSegments[i];
        const tempSegPath = join(outputDir, `temp_sermon_${i}.mp3`);
        await trimAudioSegment(sourceFile, tempSegPath, seg.start, seg.end);
        tempFiles.push(tempSegPath);
      }
      await concatenateAudioFiles(tempFiles, sermonOutputPath);
      tempFiles.forEach(f => { try { unlinkSync(f); } catch {} });
    }
    outputFiles.sermon = sermonOutputPath;
  }

  return outputFiles;
}