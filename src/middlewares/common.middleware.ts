import { Request, Response, NextFunction } from 'express';
import { logger as log } from '../config/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const method = req.method;
  const url = req.url;
  const ip = req.ip || req.connection.remoteAddress;

  res.on('finish', () => {
    log.info({
      method,
      url,
      ip,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    }, `${method} ${url} ${res.statusCode}`);
  });

  next();
};

// Keep old name as alias for backwards compatibility in index.ts
export const logger = requestLogger;

export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Last-Event-ID');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
};
