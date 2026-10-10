import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly issues?: unknown) {
    super(code);
  }
}

/** Validates external input. Throws a 400 HttpError carrying zod's issues. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, 'invalid_request', result.error.issues);
  return result.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, issues: err.issues });
    return;
  }
  // body-parser and similar middleware attach a 4xx status to client errors
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: 'invalid_request' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal' });
}
