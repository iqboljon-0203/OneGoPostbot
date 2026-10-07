import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss' } }
      : undefined,
  base: { service: 'onegopost-bot' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const apiLogger = logger.child({ module: 'api' });
export const botLogger = logger.child({ module: 'bot' });
export const analyticsLogger = logger.child({ module: 'analytics' });
