import { segmentTranscriptWithLLM, mockSegmentation, parseAndValidateLLMOutput } from './llm.js';

export { segmentTranscriptWithLLM, mockSegmentation, parseAndValidateLLMOutput };
export const segmentTranscript = segmentTranscriptWithLLM;
export default segmentTranscriptWithLLM;