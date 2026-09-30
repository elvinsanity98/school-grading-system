import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { authenticate } from './auth';
import { config, isProd } from './config';
import type { Db } from './db';
import { AppError, forbidden, isForeignKeyViolation, isUniqueViolation } from './errors';
import advisoryRoutes from './routes/advisory';
import adminRoutes from './routes/admin';
import catalogRoutes from './routes/catalog';
import dashboardRoutes from './routes/dashboard';
import learnersRoutes from './routes/learners';
import portalRoutes from './routes/portal';
import publicRoutes from './routes/public';
import recordsRoutes from './routes/records';
import reportsRoutes from './routes/reports';
import schoolRoutes from './routes/school';
import sectionsRoutes from './routes/sections';
import sessionRoutes from './routes/session';
import usersRoutes from './routes/users';

export interface BuildOptions {
  db: Db;
  logger?: boolean;
  /** Turn off for tests that hammer the login route. */
  rateLimit?: boolean;
}

/** Endpoints a user may call while a password change is still required. */
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/session', '/api/auth/change-password']);

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const useRateLimit = opts.rateLimit ?? true;
  const app = Fastify({
    logger: opts.logger
      ? { level: isProd ? 'info' : 'debug', redact: ['req.headers.authorization'] }
      : false,
    trustProxy: true,
    bodyLimit: 8 * 1024 * 1024,
  });

  app.decorate('db', opts.db);
  app.decorateRequest('user', null);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'", 'blob:'],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // The API can be served over plain http on a school LAN, so no HSTS here.
    hsts: false,
  });

  // The Android app runs from https://localhost (or http://localhost) inside its WebView.
  const allowedOrigins = new Set([
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...config.corsOrigins,
  ]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  if (useRateLimit) {
    await app.register(rateLimit, {
      global: true,
      max: 600,
      timeWindow: '1 minute',
      // Signed-in users are counted one by one: a whole school behind one public IP must not share a budget.
      keyGenerator: (req) => {
        const auth = req.headers.authorization;
        return auth ? `t:${auth.slice(-24)}` : req.ip;
      },
    });
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: err.message, code: err.code, details: err.details });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Some fields are not valid.', code: 'BAD_REQUEST', details: err.issues });
    }
    if (isUniqueViolation(err)) {
      return reply.code(409).send({ error: 'That record already exists.', code: 'CONFLICT' });
    }
    if (isForeignKeyViolation(err)) {
      return reply.code(409).send({ error: 'This record is still in use by other records.', code: 'IN_USE' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: (err as Error).message, code: 'BAD_REQUEST' });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'Something went wrong on the server.', code: 'SERVER_ERROR' });
  });

  await app.register(
    async (api) => {
      await api.register(publicRoutes, { rateLimit: useRateLimit });

      await api.register(async (secured) => {
        secured.addHook('preHandler', authenticate);
        secured.addHook('preHandler', async (req) => {
          const path = req.url.split('?')[0] ?? '';
          if (req.user?.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(path)) {
            throw forbidden('Please set a new password first.');
          }
        });
        await secured.register(sessionRoutes);
        await secured.register(schoolRoutes);
        await secured.register(catalogRoutes);
        await secured.register(usersRoutes);
        await secured.register(learnersRoutes);
        await secured.register(sectionsRoutes);
        await secured.register(recordsRoutes);
        await secured.register(advisoryRoutes);
        await secured.register(portalRoutes);
        await secured.register(reportsRoutes);
        await secured.register(dashboardRoutes);
        await secured.register(adminRoutes);
      });

      api.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'No such endpoint.', code: 'NOT_FOUND' }));
    },
    { prefix: '/api' },
  );

  // The built web app is served by the same process, so one address serves both the
  // browser version and the API that the Android app talks to.
  if (existsSync(join(config.webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      // files are looked up on every request, so a rebuilt web app is served without restarting
      index: ['index.html'],
      setHeaders(res, path) {
        // Hashed build files never change; the entry points must always be re-checked
        // so a new release is picked up.
        const immutable = /[\\/]assets[\\/]/.test(path);
        res.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
      // Real files that are missing must be a 404, not the app shell (a stale page asking for an old chunk).
      const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(path);
      if (req.method === 'GET' && !path.startsWith('/api') && !looksLikeFile) {
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found.', code: 'NOT_FOUND' });
    });
  }

  return app;
}
