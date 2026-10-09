import { FlaskConical, RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Button, Select, cx, errorMessage, useToast } from './ui';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DemoInfo } from '../lib/types';

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/** Login page of the public demo: sign in as any role with one click. */
export function DemoLoginPanel({ demo }: { demo: DemoInfo }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(username: string) {
    setBusy(username);
    setError(null);
    try {
      await signIn(username, demo.password);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-brand/30 bg-brand-soft p-4" aria-label="Demo accounts">
      <div className="mb-3 flex items-start gap-2">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div>
          <h2 className="font-semibold">Try the demo</h2>
          <p className="text-[13px] text-muted">
            Made-up learners and grades. Pick a role to sign in with one click. The data resets every {demo.resetEveryHours} hours.
          </p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {demo.accounts.map((a) => (
          <li key={a.username}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void enter(a.username)}
              className={cx(
                'flex h-full w-full flex-col items-start rounded-lg border border-line bg-surface p-2.5 text-left transition-colors hover:border-brand disabled:opacity-60',
                busy === a.username && 'border-brand',
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <UserRound className="size-4 text-brand" aria-hidden />
                {a.label}
              </span>
              <span className="mt-0.5 text-xs text-muted">{busy === a.username ? 'Signing in...' : a.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
    </section>
  );
}

/** Strip at the top of the demo: what this is, switch role, start over. */
export function DemoBar({ demo, username }: { demo: DemoInfo; username: string }) {
  const { signIn } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const known = demo.accounts.some((a) => a.username === username);

  async function switchTo(next: string) {
    if (!next) return;
    setBusy(true);
    try {
      await signIn(next, demo.password);
      window.location.assign('/');
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await post('/demo/reset');
      window.location.assign('/');
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-brand px-3 py-2 text-[13px] text-on-brand sm:px-6" role="region" aria-label="Demo">
      <span className="flex items-center gap-1.5 font-semibold">
        <FlaskConical className="size-4" aria-hidden /> Demo version
      </span>
      <span className="opacity-90">Made-up data. Next automatic reset about {timeLabel(demo.nextResetAt)}.</span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="opacity-90">View as</span>
          <Select aria-label="View the demo as" className="h-8 w-44 border-0 bg-surface text-ink" disabled={busy} value={known ? username : ''} onChange={(e) => void switchTo(e.target.value)}>
            {known ? null : <option value="">Another account</option>}
            {demo.accounts.map((a) => (
              <option key={a.username} value={a.username}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
        <Button size="sm" className="bg-surface text-ink" loading={busy} icon={<RotateCcw className="size-3.5" />} onClick={() => void reset()}>
          Reset demo
        </Button>
      </span>
    </div>
  );
}
