import { z } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Please sign in.') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You are not allowed to do that.') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (what = 'Record') => new AppError(404, `${what} not found.`, 'NOT_FOUND');
export const conflict = (msg: string) => new AppError(409, msg, 'CONFLICT');
export const locked = (msg: string) => new AppError(423, msg, 'LOCKED');

/** Validate `data` with a zod schema or fail with a 400 that lists every problem. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const details = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = details[0];
  const where = first?.path ? `${first.path}: ` : '';
  throw badRequest(`${where}${first?.message ?? 'Invalid input.'}`, details);
}

/** Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/** Prisma foreign-key violation (P2003). */
export function isForeignKeyViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2003';
}
