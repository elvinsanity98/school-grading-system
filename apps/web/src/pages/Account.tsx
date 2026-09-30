import { ROLE_LABEL } from '@bnhs/core';
import { KeyRound, LogOut, Server } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Button, Card, CardTitle, Field, Input, PageHeader, useToast, errorMessage } from '../components/ui';
import { getServerUrl, post } from '../lib/api';
import { useAuth, useSession } from '../lib/auth';
import { dateTimeLabel } from '../lib/format';
import { isNative } from '../lib/platform';
import { ServerConnect } from './Login';

export function PasswordForm({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const { adoptToken } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== again) return setError('The new passwords are not the same.');
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/auth/change-password', { currentPassword: current, newPassword: next });
      await adoptToken(r.token);
      toast.ok('Password changed.');
      setCurrent('');
      setNext('');
      setAgain('');
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label={forced ? 'Password you were given' : 'Current password'}>
        {(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
      </Field>
      <Field label="New password" hint="At least 8 characters with a letter and a number">
        {(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />}
      </Field>
      <Field label="Repeat new password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />}</Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" variant="primary" loading={busy} icon={<KeyRound className="size-4" />}>
        Change password
      </Button>
    </form>
  );
}

/** Blocks the whole app until a temporary password has been replaced. */
export function ForcePasswordChange() {
  const { user } = useSession();
  const { signOut } = useAuth();
  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Choose your own password</h1>
        <p className="text-sm text-muted">Hello, {user.fullName}. The password you were given is temporary. Set a new one to continue.</p>
      </div>
      <Card>
        <PasswordForm forced />
      </Card>
      <Button variant="ghost" onClick={signOut} icon={<LogOut className="size-4" />}>
        Sign out
      </Button>
    </div>
  );
}

export function AccountPage() {
  const { user, school } = useSession();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [server, setServer] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="My account" />
      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>Profile</CardTitle>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Name</dt>
            <dd className="font-medium">{user.fullName}</dd>
            <dt className="text-muted">Username</dt>
            <dd>{user.username}</dd>
            <dt className="text-muted">Role</dt>
            <dd>{ROLE_LABEL[user.role]}</dd>
            <dt className="text-muted">School</dt>
            <dd>{school.name}</dd>
            <dt className="text-muted">Last sign-in</dt>
            <dd>{dateTimeLabel(user.lastLoginAt) || 'This is your first sign-in'}</dd>
          </dl>
        </Card>
        <Card>
          <CardTitle>Change password</CardTitle>
          <PasswordForm />
        </Card>
        {isNative() ? (
          <Card>
            <CardTitle sub={getServerUrl()}>School server</CardTitle>
            {server ? (
              <ServerConnect onDone={() => window.location.assign('/')} onCancel={() => setServer(false)} />
            ) : (
              <Button onClick={() => setServer(true)} icon={<Server className="size-4" />}>
                Change server address
              </Button>
            )}
          </Card>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => {
            signOut();
            navigate('/');
          }}
          icon={<LogOut className="size-4" />}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
