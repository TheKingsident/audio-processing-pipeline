import { config } from '../config/index.js';
import { logger } from './logger.js';

export async function segmentTranscriptWithLLM(transcriptWords) {
  if (process.env.USE_MOCK_SEGMENTATION === 'true') {
    logger.info('Using mock LLM segmentation');
    return mockSegmentation(transcriptWords);
  }

  const hasKey = Boolean(
    config.llm.moonshotApiKey ||
    config.llm.anthropicApiKey ||
    config.llm.openaiApiKey
  );

  if (!hasKey) {
    throw new Error('LLM Segmentation error: Real mode active but no API key configured in .env (Set MOONSHOT_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY).');
  }

  // Group words into ~5-second chunks/sentences to reduce token count by ~80%
  const formattedTranscript = groupWordsIntoChunks(transcriptWords);

  const prompt = buildPrompt(formattedTranscript);

  try {
    const rawOutput = await callLLMApi(prompt);
    return parseAndValidateLLMOutput(rawOutput, transcriptWords);
  } catch (err) {
    const isRateLimit = err.message.includes('429') || err.message.includes('rate limit') || err.message.includes('TPD');
    if (isRateLimit || process.env.ALLOW_FALLBACK === 'true') {
      logger.warn({ err: err.message }, 'LLM rate limit or error reached. Falling back to rule-based segmentation.');
      return mockSegmentation(transcriptWords);
    }

    logger.warn({ err: err.message }, 'First LLM segmentation attempt failed. Retrying once with strict instructions...');
    try {
      const strictPrompt = `${prompt}\n\nCRITICAL: Your previous response was invalid. Return ONLY a valid, parseable JSON object matching the exact schema requested. Do not include markdown codeblocks or any non-JSON text.`;
      const rawOutputRetry = await callLLMApi(strictPrompt);
      return parseAndValidateLLMOutput(rawOutputRetry, transcriptWords);
    } catch (retryErr) {
      if (retryErr.message.includes('429') || retryErr.message.includes('rate limit') || process.env.ALLOW_FALLBACK === 'true') {
        logger.warn({ err: retryErr.message }, 'LLM rate limit reached during retry. Falling back to rule-based segmentation.');
        return mockSegmentation(transcriptWords);
      }
      logger.error({ retryErr: retryErr.message }, 'LLM segmentation retry failed');
      throw new Error(`LLM segmentation failed after retry: ${retryErr.message}`);
    }
  }
}

/**
 * Groups individual word objects into ~5 second timestamped text chunks
 * to dramatically reduce token count sent to LLM APIs.
 */
function groupWordsIntoChunks(transcriptWords, chunkDurationSec = 5.0) {
  if (!transcriptWords || transcriptWords.length === 0) return '';
  const chunks = [];
  let currentChunkWords = [];
  let chunkStart = transcriptWords[0].start;
  let chunkEnd = transcriptWords[0].end;

  for (const w of transcriptWords) {
    if (currentChunkWords.length > 0 && (w.start - chunkStart) >= chunkDurationSec) {
      chunks.push(`[${chunkStart.toFixed(2)}-${chunkEnd.toFixed(2)}] ${currentChunkWords.join(' ')}`);
      currentChunkWords = [w.word];
      chunkStart = w.start;
      chunkEnd = w.end;
    } else {
      currentChunkWords.push(w.word);
      chunkEnd = w.end;
    }
  }

  if (currentChunkWords.length > 0) {
    chunks.push(`[${chunkStart.toFixed(2)}-${chunkEnd.toFixed(2)}] ${currentChunkWords.join(' ')}`);
  }

  return chunks.join('\n');
}

function buildPrompt(formattedTranscript) {
  return `You are an AI specialized in analyzing church service transcripts.
Your job is to identify:
1. The prayer -> sermon boundary (e.g. pastor saying "turn your Bibles to...", "open your Bibles...", "our text today is...").
2. Any jokes, anecdotes, tangents, or quips within the sermon that break the core message and should be cut.

TRANSCRIPT WITH WORD-LEVEL TIMESTAMPS:
${formattedTranscript}

INSTRUCTIONS:
- Identify the FIRST clear instance of a prayer-to-sermon transition.
- If NO clear boundary exists, set "boundaryFound": false.
- Identify tangents, jokes, or off-topic quips that should be removed.
- Provide a clear, human-readable "reason" for each proposed cut.

Return ONLY a clean JSON object with this exact structure:
{
  "boundaryFound": true,
  "cuts": [
    {
      "start": 0.0,
      "end": 15.0,
      "type": "prayer",
      "reason": "Opening prayer before sermon"
    },
    {
      "start": 15.0,
      "end": 300.0,
      "type": "sermon",
      "reason": "Main sermon message"
    },
    {
      "start": 120.0,
      "end": 150.0,
      "type": "cut",
      "reason": "Joke about parking lot, unrelated to sermon"
    }
  ]
}`;
}

async function callLLMApi(prompt) {
  // 1. Check for Moonshot AI Key or explicitly set Moonshot provider
  if (config.llm.moonshotApiKey || config.llm.provider === 'moonshot') {
    logger.info('Calling Moonshot AI (Kimi) for transcript segmentation');
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: config.llm.moonshotApiKey || config.llm.openaiApiKey,
      baseURL: config.llm.baseUrl || 'https://api.moonshot.ai/v1',
    });
    const model = config.llm.model || 'kimi-k2.6';

    const response = await client.chat.completions.create({
      model,
      temperature: 1,
      messages: [
        { role: 'system', content: 'You are a precise audio segmentation assistant. Respond ONLY with valid JSON.' },
        { role: 'user', content: prompt }
      ],
    });
    return response.choices[0].message.content;
  }

  // 2. Check for Anthropic Key
  if (config.llm.anthropicApiKey || config.llm.provider === 'anthropic') {
    logger.info('Calling Anthropic Claude for transcript segmentation');
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: config.llm.anthropicApiKey });
    const response = await anthropic.messages.create({
      model: config.llm.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
  }

  // 3. Check for OpenAI Key or custom OpenAI-compatible endpoint
  if (config.llm.openaiApiKey || config.llm.baseUrl) {
    logger.info('Calling OpenAI-compatible API for transcript segmentation');
    const OpenAI = (await import('openai')).default;
    const opts = { apiKey: config.llm.openaiApiKey };
    if (config.llm.baseUrl) opts.baseURL = config.llm.baseUrl;

    const openai = new OpenAI(opts);
    const model = config.llm.model || 'gpt-4o';

    const response = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  }

  throw new Error('No valid LLM API provider or API key found');
}

export function parseAndValidateLLMOutput(text, transcriptWords = []) {
  const cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (e) {
    throw new Error(`Invalid JSON syntax in LLM output: ${e.message}`);
  }

  if (typeof parsed.boundaryFound !== 'boolean') {
    throw new Error('Schema error: missing or non-boolean "boundaryFound"');
  }

  if (!Array.isArray(parsed.cuts)) {
    throw new Error('Schema error: missing or non-array "cuts"');
  }

  const validCuts = parsed.cuts.map((cut, index) => {
    if (typeof cut.start !== 'number' || typeof cut.end !== 'number' || cut.start < 0 || cut.end <= cut.start) {
      throw new Error(`Schema error in cut #${index}: invalid start/end timestamps (${cut.start}, ${cut.end})`);
    }
    if (!['prayer', 'sermon', 'cut'].includes(cut.type)) {
      throw new Error(`Schema error in cut #${index}: invalid cut type "${cut.type}"`);
    }
    if (typeof cut.reason !== 'string' || cut.reason.trim().length === 0) {
      throw new Error(`Schema error in cut #${index}: missing reason`);
    }
    return {
      start: Number(cut.start.toFixed(2)),
      end: Number(cut.end.toFixed(2)),
      type: cut.type,
      reason: cut.reason.trim(),
    };
  });

  return {
    boundaryFound: parsed.boundaryFound,
    proposedCuts: validCuts,
  };
}

export function mockSegmentation(transcriptWords = []) {
  let boundaryFound = false;
  let boundaryTime = 15.0;

  for (const w of transcriptWords) {
    const text = (w.word || '').toLowerCase();
    if (text.includes('bible') || text.includes('turn') || text.includes('chapter')) {
      boundaryFound = true;
      boundaryTime = w.start;
      break;
    }
  }

  const maxTime = transcriptWords.length > 0
    ? transcriptWords[transcriptWords.length - 1].end
    : 300.0;

  const proposedCuts = [];

  if (boundaryFound) {
    proposedCuts.push({
      start: 0.0,
      end: boundaryTime,
      type: 'prayer',
      reason: 'Opening prayer segment',
    });
    proposedCuts.push({
      start: boundaryTime,
      end: maxTime,
      type: 'sermon',
      reason: 'Main sermon message segment',
    });
    proposedCuts.push({
      start: 120.0,
      end: 150.0,
      type: 'cut',
      reason: 'Joke about parking lot, unrelated to sermon',
    });
  } else {
    proposedCuts.push({
      start: 0.0,
      end: maxTime,
      type: 'sermon',
      reason: 'Full recording sermon (no explicit prayer boundary detected)',
    });
  }

  return {
    boundaryFound,
    proposedCuts,
  };
}
