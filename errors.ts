import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config.js';
import { ZodError } from 'zod';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} was not found.` } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const validationError = err instanceof ZodError;
  const uploadLimitError = typeof err?.code === 'string' && [
    'LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_PART_COUNT', 'LIMIT_FIELD_COUNT', 'LIMIT_FIELD_VALUE'
  ].includes(err.code);
  const status = Number(err?.status ?? err?.statusCode ?? (validationError ? 400 : uploadLimitError ? 413 : 500));
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const requestId = (req.header('x-request-id') ?? cryptoRandomId()).slice(0, 80);
  console.error(JSON.stringify({ level: 'error', event: 'request_error', requestId, method: req.method, path: req.path, status: safeStatus, code: err?.code ?? (validationError ? 'VALIDATION_ERROR' : undefined), message: err?.message ?? 'Unknown error' }));
  const errorBody: Record<string, unknown> = {
    code: safeStatus === 500 ? 'INTERNAL_ERROR' : (validationError ? 'VALIDATION_ERROR' : (err?.code ?? 'REQUEST_FAILED')),
    message: safeStatus === 500 && config.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : (validationError ? 'Request validation failed. Check the submitted fields.' : (err?.message ?? 'Request failed.')),
    requestId
  };
  if (validationError) errorBody.details = err.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
  res.status(safeStatus).json({ error: errorBody });
};
function cryptoRandomId() { return Math.random().toString(36).slice(2, 12); }
