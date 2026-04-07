import type { Request, Response, NextFunction } from 'express';

const ALLOWED_ORIGINS: Set<string> | null = (() => {
  const configured = process.env.CORS_ORIGINS
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return new Set(configured);
  return null;
})();

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin) {
    if (ALLOWED_ORIGINS && !ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
