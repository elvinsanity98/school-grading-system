import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, GraduationCap, Server } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, errorMessage } from '../components/ui';
import { get, getServerUrl, needsServerSetup, normalizeServerUrl, pingServer, setServerUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isNative } from '../lib/platform';

export function ServerConnect({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [url, setUrl] = useState(getServerUrl());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const base = normalizeServerUrl(url);
    if (!base) return setError('Type the server address first.');
    setBusy(true);
    setError(null);
    try {
      await pingServer(base);
      setServerUrl(base);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Connect to the school server</h2>
        <p className="text-sm text-muted">Ask the school ICT coordinator for the address, for example http://192.168.1.10:3000 or https://grades.yourschool.edu.ph.</p>
      </div>
      <Field label="Server address">
        {(id) => <Input id={id} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="http://192.168.1.10:3000" value={url} onChange={(e) => setUrl(e.target.value)} />}
      </Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy} icon={<Server className="size-4" />}>
          Connect
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}

export function Login({ schoolName }: { schoolName: string }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeServer, setChangeServer] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_28rem]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#132d7a] p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-12 rounded-xl" />
          <span className="text-lg font-semibold">BNHS SHS Grades</span>
        </div>
        <div className="max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold">{schoolName}</h1>
          <p className="mt-3 text-lg text-white/80">Senior High School grading system following DepEd Order No. 8, s. 2015: class records, report cards and permanent records in one place.</p>
        </div>
        <p className="text-sm text-white/60">Grades of learners are personal information. Sign-ins are recorded.</p>
        <GraduationCap className="pointer-events-none absolute -right-16 -bottom-16 size-96 text-white/5" aria-hidden />
      </div>

      <div className="safe-top safe-bottom flex flex-col justify-center px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/favicon.svg" alt="" className="size-11 rounded-xl" />
            <div className="leading-tight">
              <p className="font-semibold">{schoolName}</p>
              <p className="text-sm text-muted">SHS Grading System</p>
            </div>
          </div>

          {changeServer ? (
            <ServerConnect onDone={() => window.location.reload()} onCancel={() => setChangeServer(false)} />
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Sign in</h2>
                <p className="text-sm text-muted">Teachers and staff use the username from the administrator. Learners use their LRN.</p>
              </div>
              <Field label="Username or LRN">
                {(id) => <Input id={id} autoFocus autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required />}
              </Field>
              <Field label="Password">
                {(id) => (
                  <div className="relative">
                    <Input id={id} type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-11" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} className="absolute top-0 right-0 flex size-10 items-center justify-center text-muted hover:text-ink">
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                )}
              </Field>
              {error ? <Alert tone="bad">{error}</Alert> : null}
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                Sign in
              </Button>
              {isNative() ? (
                <button type="button" onClick={() => setChangeServer(true)} className="flex items-center justify-center gap-2 text-sm text-muted hover:text-ink">
                  <Server className="size-4" /> Server: {getServerUrl()}
                </button>
              ) : null}
              <p className="text-center text-xs text-muted">Forgot your password? Ask the school administrator to reset it.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Public data needed before anyone signs in. */
export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => get<{ needsSetup: boolean; schoolName: string }>('/setup/status'),
    enabled: !needsServerSetup(),
    retry: false,
    staleTime: 30_000,
  });
}
