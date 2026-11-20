export class ApiError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export const fail = (status, code, message) => { throw new ApiError(status, code, message); };
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred';
  if (error instanceof ApiError) ({ status, code, message } = error);
  else if (error.code === 11000) { status = 409; code = 'DUPLICATE_KEY'; message = 'Unique value or reservation conflicts with an existing record'; }
  else if (error.code === 121) { status = 400; code = 'INVALID_DOCUMENT'; message = 'Document failed validation'; }
  else if (error.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Invalid JSON body'; }
  else if (error.type === 'entity.too.large') { status = 413; code = 'BODY_TOO_LARGE'; message = 'Request body is too large'; }
  else if (['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError'].includes(error.name)) {
    status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Database is temporarily unavailable';
  }
  res.status(status).json({ error: { code, message } });
}
