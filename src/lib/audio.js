import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { logger } from '../lib/logger.js';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export async function getAudioInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
}

export async function extractAudio(inputPath, outputPath, options = {}) {
  const {
    start = 0,
    duration = null,
    format = 'mp3',
    bitrate = '192k',
    sampleRate = 44100,
    channels = 2,
  } = options;

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .outputOptions([
        `-acodec libmp3lame`,
        `-b:a ${bitrate}`,
        `-ar ${sampleRate}`,
        `-ac ${channels}`,
      ])
      .output(outputPath);

    if (start > 0) {
      cmd = cmd.seekInput(start);
    }
    if (duration) {
      cmd = cmd.duration(duration);
    }

    cmd.on('end', () => resolve(outputPath))
       .on('error', reject)
       .run();
  });
}

export async function concatenateAudio(inputPaths, outputPath, options = {}) {
  const { format = 'mp3', bitrate = '192k' } = options;

  // Create concat file
  const concatPath = join(process.cwd(), 'src', 'temp', `concat_${randomUUID()}.txt`);
  const content = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  
  await import('fs').then(fs => fs.promises.writeFile(concatPath, content));

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        `-c copy`,
      ])
      .output(outputPath)
      .on('end', async () => {
        await import('fs').then(fs => fs.promises.unlink(concatPath).catch(() => {}));
        resolve(outputPath);
      })
      .on('error', reject)
      .run();
  });
}

export async function trimAudio(inputPath, outputPath, start, end, options = {}) {
  const duration = end - start;
  return extractAudio(inputPath, outputPath, { ...options, start, duration });
}

export async function normalizeAudio(inputPath, outputPath, options = {}) {
  const { targetLevel = -16, truePeak = -1.5 } = options;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters([
        `loudnorm=I=${targetLevel}:TP=${truePeak}:LRA=11:print_format=json`
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function convertFormat(inputPath, outputPath, format, options = {}) {
  const { bitrate = '192k', sampleRate = 44100, channels = 2 } = options;

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    
    if (format === 'mp3') {
      cmd = cmd.outputOptions([`-acodec libmp3lame`, `-b:a ${bitrate}`]);
    } else if (format === 'wav') {
      cmd = cmd.outputOptions([`-acodec pcm_s16le`]);
    } else if (format === 'ogg') {
      cmd = cmd.outputOptions([`-acodec libvorbis`, `-b:a ${bitrate}`]);
    }

    cmd = cmd.outputOptions([`-ar ${sampleRate}`, `-ac ${channels}`])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

export async function getWaveformData(inputPath, width = 800) {
  const info = await getAudioInfo(inputPath);
  const duration = info.format.duration;
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilter('showwavespic=s=800x200:colors=#3b82f6')
      .outputFormat('apng')
      .output('pipe:1')
      .on('end', (stdout) => resolve(stdout))
      .on('error', reject)
      .run();
  });
}

// Batch processing helpers
export async function splitAudioByTimestamps(inputPath, outputDir, segments, options = {}) {
  const results = [];
  
  for (const [index, segment] of segments.entries()) {
    const { start, end, name } = segment;
    const outputPath = join(outputDir, `${name || `segment_${index}`}.mp3`);
    
    await trimAudio(inputPath, outputPath, start, end, options);
    results.push({ ...segment, outputPath });
  }
  
  return results;
}

export async function mergeAudioFiles(inputPaths, outputPath, options = {}) {
  return concatenateAudio(inputPaths, outputPath, options);
}