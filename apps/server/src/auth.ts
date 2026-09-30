import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import type { Role } from '@bnhs/core';
import { config } from './config';
import type { Db } from './db';
import { forbidden, unauthorized } from './errors';

// ------------------------------------------------------------------ passwords

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 } as const;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, SCRYPT.keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** scrypt$N$r$p$salt$hash (base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A readable one-time password such as "Kx7m-Pq4t-Rw9z". */
export function generateTempPassword(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += TEMP_ALPHABET[bytes[i]! % TEMP_ALPHABET.length];
    if (i % 4 === 3 && i < 11) out += '-';
  }
  return out;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password needs at least one letter and one number.';
  return null;
}

// ------------------------------------------------------------------ tokens

const secretKey = new TextEncoder().encode(config.jwtSecret);

export async function signToken(user: { id: number; tokenVersion: number }): Promise<string> {
  return new SignJWT({ tv: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(config.tokenTtl)
    .sign(secretKey);
}

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  learnerId: number | null;
  mustChangePassword: boolean;
}

/** Fastify preHandler: fills `req.user` from the Bearer token or answers 401. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let sub: string | undefined;
  let tv: unknown;
  try {
    const { payload } = await jwtVerify(header.slice(7), secretKey, { algorithms: ['HS256'] });
    sub = payload.sub;
    tv = payload.tv;
  } catch {
    throw unauthorized('Your session expired. Please sign in again.');
  }
  const id = Number(sub);
  if (!Number.isInteger(id)) throw unauthorized();
  const db = (req.server as unknown as { db: Db }).db;
  const u = await db.user.findUnique({ where: { id } });
  if (!u || !u.active || u.tokenVersion !== tv) throw unauthorized('Your session expired. Please sign in again.');
  req.user = {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role as Role,
    learnerId: u.learnerId,
    mustChangePassword: u.mustChangePassword,
  };
}

/** Fastify preHandler factory: only the listed roles may pass. */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest): Promise<void> => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
  };
}

export const isOffice = (u: AuthUser) => u.role === 'ADMIN' || u.role === 'REGISTRAR';
export const isStaff = (u: AuthUser) => isOffice(u) || u.role === 'TEACHER';
export const isFamily = (u: AuthUser) => u.role === 'STUDENT' || u.role === 'PARENT';

export function me(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
