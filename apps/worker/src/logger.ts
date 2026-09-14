import pino from 'pino';

export function createLogger(level: string, pretty: boolean): pino.Logger {
  return pino({
    level,
    base: { service: 'worker' },
    transport: pretty
      ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  });
}

export type Logger = pino.Logger;
