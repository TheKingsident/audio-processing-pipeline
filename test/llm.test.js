import { describe, it, expect } from 'vitest';
import { parseAndValidateLLMOutput, mockSegmentation } from '../src/lib/llm.js';

describe('parseAndValidateLLMOutput — schema validation', () => {
  it('parses valid LLM JSON with boundary and cuts', () => {
    const validJson = JSON.stringify({
      boundaryFound: true,
      cuts: [
        { start: 0.0, end: 12.5, type: 'prayer', reason: 'Opening prayer' },
        { start: 12.5, end: 120.0, type: 'sermon', reason: 'Sermon content' },
        { start: 60.0, end: 75.0, type: 'cut', reason: 'Parking lot joke' },
      ],
    });
    const result = parseAndValidateLLMOutput(validJson);
    expect(result.boundaryFound).toBe(true);
    expect(result.proposedCuts).toHaveLength(3);
    expect(result.proposedCuts[0].type).toBe('prayer');
  });

  it('parses boundaryFound=false correctly', () => {
    const json = JSON.stringify({
      boundaryFound: false,
      cuts: [{ start: 0.0, end: 200.0, type: 'sermon', reason: 'Full sermon (no boundary)' }],
    });
    const result = parseAndValidateLLMOutput(json);
    expect(result.boundaryFound).toBe(false);
    expect(result.proposedCuts).toHaveLength(1);
  });

  it('strips markdown codeblock fences before parsing', () => {
    const wrapped = '```json\n{"boundaryFound":false,"cuts":[{"start":0,"end":100,"type":"sermon","reason":"Full recording"}]}\n```';
    const result = parseAndValidateLLMOutput(wrapped);
    expect(result.boundaryFound).toBe(false);
  });

  it('throws if JSON is malformed', () => {
    expect(() => parseAndValidateLLMOutput('not json at all')).toThrow(/Invalid JSON syntax/);
  });

  it('throws if boundaryFound is missing', () => {
    const json = JSON.stringify({ cuts: [] });
    expect(() => parseAndValidateLLMOutput(json)).toThrow(/boundaryFound/);
  });

  it('throws if cuts array is missing', () => {
    const json = JSON.stringify({ boundaryFound: true });
    expect(() => parseAndValidateLLMOutput(json)).toThrow(/cuts/);
  });

  it('throws if a cut has invalid start/end', () => {
    const json = JSON.stringify({
      boundaryFound: true,
      cuts: [{ start: 100, end: 50, type: 'prayer', reason: 'Backwards times' }],
    });
    expect(() => parseAndValidateLLMOutput(json)).toThrow(/start\/end/);
  });

  it('throws if a cut has an invalid type', () => {
    const json = JSON.stringify({
      boundaryFound: true,
      cuts: [{ start: 0, end: 10, type: 'invalid-type', reason: 'Some reason' }],
    });
    expect(() => parseAndValidateLLMOutput(json)).toThrow(/cut type/);
  });

  it('throws if a cut is missing a reason', () => {
    const json = JSON.stringify({
      boundaryFound: true,
      cuts: [{ start: 0, end: 10, type: 'prayer', reason: '' }],
    });
    expect(() => parseAndValidateLLMOutput(json)).toThrow(/reason/);
  });
});

describe('mockSegmentation', () => {
  const wordsWithBoundary = [
    { word: 'Let', start: 0, end: 0.5 },
    { word: 'us', start: 0.5, end: 0.8 },
    { word: 'pray', start: 0.8, end: 1.2 },
    { word: 'turn', start: 5.0, end: 5.4 },
    { word: 'Bible', start: 5.4, end: 5.8 },
  ];

  it('detects boundary when "turn" appears', () => {
    const result = mockSegmentation(wordsWithBoundary);
    expect(result.boundaryFound).toBe(true);
    expect(result.proposedCuts.some(c => c.type === 'prayer')).toBe(true);
    expect(result.proposedCuts.some(c => c.type === 'sermon')).toBe(true);
  });

  it('returns no_split result when no boundary word found', () => {
    const noMatchWords = [{ word: 'Hello', start: 0, end: 1 }];
    const result = mockSegmentation(noMatchWords);
    expect(result.boundaryFound).toBe(false);
    expect(result.proposedCuts.every(c => c.type !== 'prayer')).toBe(true);
  });

  it('includes a cut type when boundary is found and recording is long enough', () => {
    const longWords = [
      { word: 'turn', start: 5.0, end: 5.4 },
      { word: 'Bible', start: 5.4, end: 5.8 },
      { word: 'end', start: 200.0, end: 201.0 },
    ];
    const result = mockSegmentation(longWords);
    expect(result.proposedCuts.some(c => c.type === 'cut')).toBe(true);
  });
});
