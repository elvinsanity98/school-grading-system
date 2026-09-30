import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Checkbox, Field, Input, errorMessage } from '../components/ui';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Shown once, when the database has no users: creates the school, the administrator and the first school year. */
export function FirstRun({ schoolName }: { schoolName: string }) {
  const { adoptToken } = useAuth();
  const [form, setForm] = useState({
    schoolName,
    adminName: '',
    username: 'admin',
    password: '',
    confirm: '',
    sampleCurriculum: true,
    sy: '2026-2027',
    start: '2026-06-08',
    end: '2027-03-31',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError('The two passwords are not the same.');
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/setup', {
        schoolName: form.schoolName,
        adminName: form.adminName,
        username: form.username,
        password: form.password,
        sampleCurriculum: form.sampleCurriculum,
        schoolYear: { name: form.sy, startDate: form.start, endDate: form.end },
      });
      await adoptToken(r.token);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-12 rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold">Set up the grading system</h1>
          <p className="text-sm text-muted">This runs once. You can change everything later in Setup.</p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 font-semibold">School</h2>
          <Field label="School name">{(id) => <Input id={id} value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} required />}</Field>
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold">Administrator account</h2>
          <p className="mb-3 text-sm text-muted">The administrator manages users, the curriculum and school years. Use a password only you know.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" className="sm:col-span-2">
              {(id) => <Input id={id} autoComplete="name" value={form.adminName} onChange={(e) => set('adminName', e.target.value)} required />}
            </Field>
            <Field label="Username" hint="Letters and numbers, no spaces">
              {(id) => <Input id={id} autoCapitalize="none" autoComplete="username" value={form.username} onChange={(e) => set('username', e.target.value.toLowerCase())} required />}
            </Field>
            <span className="hidden sm:block" />
            <Field label="Password" hint="At least 8 characters with a letter and a number">
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} />}
            </Field>
            <Field label="Repeat password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} required />}</Field>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">First school year</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="School year">{(id) => <Input id={id} value={form.sy} pattern="\d{4}-\d{4}" onChange={(e) => set('sy', e.target.value)} required />}</Field>
            <Field label="First day of classes">{(id) => <Input id={id} type="date" value={form.start} onChange={(e) => set('start', e.target.value)} required />}</Field>
            <Field label="Last day of classes">{(id) => <Input id={id} type="date" value={form.end} onChange={(e) => set('end', e.target.value)} required />}</Field>
          </div>
          <div className="mt-4">
            <Checkbox checked={form.sampleCurriculum} onChange={(e) => set('sampleCurriculum', e.target.checked)} label="Load the sample Senior High School strands, subjects and curriculum" />
            <p className="mt-1 ml-6 text-xs text-muted">STEM, ABM, HUMSS, GAS and two TVL strands with their core, applied and specialized subjects. Edit them to match the program of your school.</p>
          </div>
        </Card>
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Create and sign in
        </Button>
      </form>
    </div>
  );
}
