import { config } from '../config/index.js';
import { logger } from './logger.js';

export async function segmentTranscriptWithLLM(transcriptWords) {
  if (process.env.USE_MOCK_SEGMENTATION === 'true' || (!config.llm.anthropicApiKey && !config.llm.openaiApiKey)) {
    logger.info('Using mock LLM segmentation');
    return mockSegmentation(transcriptWords);
  }

  const formattedTranscript = transcriptWords
    .map(w => `[${w.start.toFixed(2)}-${w.end.toFixed(2)}] ${w.word}`)
    .join(' ');

  const prompt = buildPrompt(formattedTranscript);

  try {
    const rawOutput = await callLLMApi(prompt);
    return parseAndValidateLLMOutput(rawOutput, transcriptWords);
  } catch (err) {
    logger.warn({ err: err.message }, 'First LLM segmentation attempt failed. Retrying once with strict instructions...');
    try {
      const strictPrompt = `${prompt}\n\nCRITICAL: Your previous response was invalid. Return ONLY a valid, parseable JSON object matching the exact schema requested. Do not include markdown codeblocks or any non-JSON text.`;
      const rawOutputRetry = await callLLMApi(strictPrompt);
      return parseAndValidateLLMOutput(rawOutputRetry, transcriptWords);
    } catch (retryErr) {
      logger.error({ retryErr: retryErr.message }, 'LLM segmentation retry failed');
      throw new Error(`LLM segmentation failed after retry: ${retryErr.message}`);
    }
  }
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
  if (config.llm.anthropicApiKey) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: config.llm.anthropicApiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
  } else if (config.llm.openaiApiKey) {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: config.llm.openaiApiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  } else {
    throw new Error('No LLM API keys provided');
  }
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
