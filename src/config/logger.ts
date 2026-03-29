import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } }
    : undefined, // raw JSON in production — Koyeb/Datadog/Loki ingest natively
  base: { service: 'britannia-campaign-engine' },
});

/**
 * Create a child logger scoped to a specific correlation ID.
 * Use this per-request or per-campaign so every log line is traceable.
 */
export function createRequestLogger(correlationId: string) {
  return logger.child({ correlationId });
}
