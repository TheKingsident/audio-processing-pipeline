import pino from 'pino';
import { config } from '../config/index.js';

const transport = config.nodeEnv === 'development' 
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined;

export const logger = pino({
  level: config.logging.level,
  transport,
  base: { service: 'audio-pipeline' },
});

export const createChildLogger = (context) => logger.child(context);