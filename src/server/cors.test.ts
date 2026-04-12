import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// Override CORS_ORIGINS before importing the module. The Set is built at
// module-evaluation time, so we need to set the env var before the first
// dynamic import per test.
function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    headers: {},
    ...overrides,
  } as Request;
}

function mockResponse(): Response & { _status: number; _headers: Record<string, string>; _ended: boolean } {
  const headers: Record<string, string> = {};
  const res = {
    _status: 200,
    _headers: headers,
    _ended: false,
    status(code: number) { res._status = code; return res; },
    setHeader(name: string, value: string) { headers[name] = value; },
    json() { res._ended = true; return res; },
    end() { res._ended = true; },
  } as unknown as Response & { _status: number; _headers: Record<string, string>; _ended: boolean };
  return res;
}

describe('corsMiddleware (no CORS_ORIGINS set — dev mode)', () => {
  let corsMiddleware: typeof import('./cors.js')['corsMiddleware'];

  beforeEach(async () => {
    delete process.env.CORS_ORIGINS;
    vi.resetModules();
    corsMiddleware = (await import('./cors.js')).corsMiddleware;
  });

  it('reflects any origin when CORS_ORIGINS is not configured', () => {
    const req = mockRequest({ headers: { origin: 'https://evil.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://evil.com');
    expect(res._headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(res._headers['Vary']).toBe('Origin');
    expect(next).toHaveBeenCalled();
  });

  it('passes through same-origin requests without setting Allow-Origin', () => {
    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res._headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS');
    expect(next).toHaveBeenCalled();
  });

  it('responds 204 to OPTIONS preflight without calling next', () => {
    const req = mockRequest({ method: 'OPTIONS', headers: { origin: 'https://app.example.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._status).toBe(204);
    expect(res._ended).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('always sets Allow-Methods and Allow-Headers', () => {
    const req = mockRequest({ headers: { origin: 'https://any.com' } });
    const res = mockResponse();
    corsMiddleware(req, res, vi.fn());

    expect(res._headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS');
    expect(res._headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
  });
});

describe('corsMiddleware (CORS_ORIGINS configured)', () => {
  let corsMiddleware: typeof import('./cors.js')['corsMiddleware'];

  beforeEach(async () => {
    process.env.CORS_ORIGINS = 'https://app.example.com, https://admin.example.com';
    vi.resetModules();
    corsMiddleware = (await import('./cors.js')).corsMiddleware;
  });

  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('reflects a whitelisted origin and sets credentials', () => {
    const req = mockRequest({ headers: { origin: 'https://app.example.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(res._headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(next).toHaveBeenCalled();
  });

  it('rejects an origin not in the whitelist with 403', () => {
    const req = mockRequest({ headers: { origin: 'https://evil.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._ended).toBe(true);
    expect(next).not.toHaveBeenCalled();
    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('rejects a substring-matching origin (no partial matches)', () => {
    const req = mockRequest({ headers: { origin: 'https://app.example.com.evil.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('still passes through same-origin requests (no Origin header)', () => {
    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('handles OPTIONS preflight for a whitelisted origin', () => {
    const req = mockRequest({ method: 'OPTIONS', headers: { origin: 'https://admin.example.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._status).toBe(204);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://admin.example.com');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects OPTIONS preflight for a non-whitelisted origin', () => {
    const req = mockRequest({ method: 'OPTIONS', headers: { origin: 'https://nope.com' } });
    const res = mockResponse();
    const next = vi.fn();
    corsMiddleware(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
