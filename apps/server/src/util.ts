import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from './errors';

export const zId = z.coerce.number().int().positive();

/** "YYYY-MM-DD" in, midnight UTC Date out. Dates without a time of day are stored this way. */
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD')
  .transform((s, ctx) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Not a real date' });
      return z.NEVER;
    }
    return d;
  });

export const zOptDate = z.union([zDate, z.literal('').transform(() => null), z.null()]).optional();

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function idParam(req: FastifyRequest, name = 'id'): number {
  const v = Number((req.params as Record<string, string>)[name]);
  if (!Number.isInteger(v) || v <= 0) throw badRequest(`Invalid ${name}.`);
  return v;
}

/** Empty strings from forms become null. */
export const zNullableText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

export const zText = (max = 200) => z.string().trim().min(1, 'Required').max(max);

export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Title-case a name typed in ALL CAPS or all lowercase, leave mixed case alone. */
export function tidyName(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
