// asyncHandler — removes try/catch boilerplate in controllers
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Success response helper */
export const ok = (res, data = {}, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, ...data });

/** ApiError with statusCode for the central error handler */
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Server-side pagination helper.
 * Parses ?page & ?limit, returns { skip, limit, page } and a meta builder.
 */
export const paginate = (req, defaults = { page: 1, limit: 12, maxLimit: 100 }) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || defaults.page);
  let limit = parseInt(req.query.limit, 10) || defaults.limit;
  limit = Math.min(Math.max(1, limit), defaults.maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip, meta: (total) => buildMeta(total, page, limit) };
};

const buildMeta = (total, page, limit) => ({
  currentPage: page,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  totalItems: total,
  limit
});
