import pino from 'pino';
import { config } from '../config/index.js';

const transport = config.nodeEnv === 'development' 
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined;

const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
const logLevel = validLevels.includes(config.logging.level) ? config.logging.level : 'info';

export const logger = pino({
  level: logLevel,
  transport,
  base: { service: 'audio-pipeline' },
});

export const createChildLogger = (context) => logger.child(context);