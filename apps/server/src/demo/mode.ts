import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo, wipeAllData, type DemoAccount } from './seed';

export interface DemoOptions {
  /** The data is wiped and reloaded this often. */
  resetEveryHours: number;
  /** Visitors may press "Reset demo" at most this often. */
  minManualGapMs?: number;
}

export interface DemoInfo {
  enabled: true;
  /** Public on purpose: every account in the demo shares it. */
  password: string;
  accounts: readonly DemoAccount[];
  resetEveryHours: number;
  lastResetAt: string;
  nextResetAt: string;
}

export interface DemoController {
  info(): DemoInfo;
  /** Returns false when asked again too soon. */
  reset(manual: boolean): Promise<boolean>;
  /** The reset in progress, if any. */
  pending(): Promise<void> | null;
  stop(): void;
}

/**
 * Things a visitor must not be able to do in a shared, public demo: they would lock the next
 * visitor out (passwords, accounts) or pull files off the server.
 */
const DISABLED: Array<[string, RegExp]> = [
  ['POST', /^\/api\/auth\/change-password$/],
  ['POST', /^\/api\/users$/],
  ['PUT', /^\/api\/users\/\d+$/],
  ['POST', /^\/api\/users\/\d+\/reset-password$/],
  ['POST', /^\/api\/learners\/\d+\/accounts\/\d+\/reset-password$/],
  ['GET', /^\/api\/admin\/backup$/],
];

export function createDemo(db: Db, opts: DemoOptions): DemoController {
  const every = Math.max(0.05, opts.resetEveryHours) * 3_600_000;
  const minGap = opts.minManualGapMs ?? 5 * 60_000;
  let last = Date.now();
  let busy: Promise<void> | null = null;
  const timer = setInterval(() => void run(), every);
  timer.unref();

  async function run(): Promise<void> {
    if (busy) return busy;
    busy = (async () => {
      await wipeAllData(db);
      await seedDemo(db);
      last = Date.now();
    })().finally(() => {
      busy = null;
    });
    return busy;
  }

  return {
    info: () => ({
      enabled: true,
      password: DEMO_PASSWORD,
      accounts: DEMO_ACCOUNTS,
      resetEveryHours: opts.resetEveryHours,
      lastResetAt: new Date(last).toISOString(),
      nextResetAt: new Date(last + every).toISOString(),
    }),
    async reset(manual) {
      if (manual && Date.now() - last < minGap) return false;
      await run();
      return true;
    },
    pending: () => busy,
    stop: () => clearInterval(timer),
  };
}

/** Wires the controller into the app: the gate during a reset, the disabled actions, the reset endpoint. */
export async function installDemo(app: FastifyInstance, controller: DemoController): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    // a reset takes a couple of seconds; requests wait for it instead of failing
    const p = controller.pending();
    if (p) await p;
    const path = req.url.split('?')[0] ?? '';
    if (DISABLED.some(([method, re]) => method === req.method && re.test(path))) {
      return reply.code(403).send({ error: 'This is turned off in the demo so that everyone can keep trying it.', code: 'DEMO_DISABLED' });
    }
    return undefined;
  });

  app.post('/api/demo/reset', async (_req, reply) => {
    const done = await controller.reset(true);
    if (!done) {
      return reply.code(429).send({ error: 'The demo was reset a moment ago. Please wait a few minutes before resetting it again.', code: 'TOO_SOON' });
    }
    return { ok: true, ...controller.info() };
  });

  app.addHook('onClose', async () => controller.stop());
}
