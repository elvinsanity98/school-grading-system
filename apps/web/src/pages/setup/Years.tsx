import { SCHOOL_MONTHS, MONTH_NAME } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Lock, LockOpen, Pencil, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardTitle, ConfirmDialog, Field, Input, Modal, PageHeader, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../../components/ui';
import { del, get, post, put } from '../../lib/api';
import { useAuth, useSession } from '../../lib/auth';
import { dateLabel } from '../../lib/format';
import type { SchoolYear } from '../../lib/types';

export default function YearsPage() {
  const { years, user, currentYearId } = useSession();
  const { refresh } = useAuth();
  const toast = useToast();
  const admin = user.role === 'ADMIN';
  const [selected, setSelected] = useState<number | null>(currentYearId);
  const [editing, setEditing] = useState<SchoolYear | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SchoolYear | null>(null);
  const year = years.find((y) => y.id === selected) ?? years[0];
  const fail = (e: unknown) => toast.error(errorMessage(e));

  const setCurrent = useMutation({ mutationFn: (id: number) => post(`/school-years/${id}/set-current`), onSuccess: async () => { await refresh(); toast.ok('Current school year changed.'); }, onError: fail });
  const period = useMutation({
    mutationFn: (v: { id: number; status?: 'OPEN' | 'CLOSED'; released?: boolean }) => put(`/periods/${v.id}`, { status: v.status, released: v.released }),
    onSuccess: async () => { await refresh(); toast.ok('Saved.'); },
    onError: fail,
  });

  return (
    <>
      <PageHeader title="School years and grading periods" sub="Open a term so teachers can encode, then release approved grades to learners." actions={admin ? <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => setEditing('new')}>New school year</Button> : undefined} />

      {years.length === 0 ? (
        <Alert tone="warn" title="No school year yet">{admin ? 'Create the first school year to start.' : 'Ask the administrator to create a school year.'}</Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            {years.map((y) => (
              <button key={y.id} onClick={() => setSelected(y.id)} className={`rounded-xl border p-3 text-left transition-colors ${y.id === year?.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">SY {y.name}</span>
                  {y.isCurrent ? <Badge tone="ok">Current</Badge> : null}
                </div>
                <p className="text-xs text-muted">{dateLabel(y.startDate)} to {dateLabel(y.endDate)}</p>
              </button>
            ))}
          </div>

          {year ? (
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card>
                <CardTitle
                  sub={`${dateLabel(year.startDate)} to ${dateLabel(year.endDate)}`}
                  action={admin ? (
                    <div className="flex gap-2">
                      {!year.isCurrent ? <Button size="sm" onClick={() => setCurrent.mutate(year.id)}>Make current</Button> : null}
                      <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(year)}>Edit</Button>
                      <Button size="sm" variant="ghost" aria-label="Delete school year" onClick={() => setDeleting(year)}><Trash2 className="size-4" /></Button>
                    </div>
                  ) : undefined}
                >
                  SY {year.name}
                </CardTitle>
                <TableWrap>
                  <table className={tableCls}>
                    <thead>
                      <tr><th className={thCls}>Term</th><th className={thCls}>Encoding</th><th className={thCls}>Learners can see approved grades</th></tr>
                    </thead>
                    <tbody>
                      {year.periods.map((p) => (
                        <tr key={p.id}>
                          <td className={tdCls + ' font-medium'}>Term {p.term}</td>
                          <td className={tdCls}>
                            <Button size="sm" variant={p.status === 'OPEN' ? 'soft' : 'secondary'} icon={p.status === 'OPEN' ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />} onClick={() => period.mutate({ id: p.id, status: p.status === 'OPEN' ? 'CLOSED' : 'OPEN' })}>
                              {p.status === 'OPEN' ? 'Open (click to close)' : 'Closed (click to open)'}
                            </Button>
                          </td>
                          <td className={tdCls}>
                            <Button size="sm" variant={p.released ? 'soft' : 'secondary'} icon={<Send className="size-3.5" />} onClick={() => period.mutate({ id: p.id, released: !p.released })}>
                              {p.released ? 'Released (click to withdraw)' : 'Not released'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                <p className="mt-2 text-xs text-muted">Teachers can change scores only while a term is open. Registrars and administrators can still encode when it is closed.</p>
              </Card>
              <SchoolDays year={year} />
            </div>
          ) : null}
        </div>
      )}

      {editing ? <YearModal year={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} /> : null}
      <ConfirmDialog
        open={deleting != null}
        danger
        title={`Delete SY ${deleting?.name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await del(`/school-years/${deleting!.id}`);
            toast.ok('School year deleted.');
            setDeleting(null);
            setSelected(null);
            await refresh();
          } catch (e) {
            fail(e);
            setDeleting(null);
          }
        }}
        onClose={() => setDeleting(null)}
      >
        Only a school year without sections can be deleted.
      </ConfirmDialog>
    </>
  );
}

function SchoolDays({ year }: { year: SchoolYear }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['school-days', year.id], queryFn: () => get<Array<{ year: number; month: number; days: number }>>(`/school-years/${year.id}/school-days`) });
  const startYear = Number(year.startDate.slice(0, 4));
  const [vals, setVals] = useState<Record<number, string>>({});
  useEffect(() => {
    if (q.data) setVals(Object.fromEntries(q.data.map((d) => [d.month, String(d.days)])));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      put(`/school-years/${year.id}/school-days`, Object.entries(vals).filter(([, v]) => v !== '').map(([m, v]) => ({ month: Number(m), year: Number(m) >= 6 ? startYear : startYear + 1, days: Number(v) }))),
    onSuccess: () => { toast.ok('School days saved.'); void qc.invalidateQueries({ queryKey: ['school-days', year.id] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardTitle sub="Number of class days each month. Advisers use these for attendance on the report card." action={<Button size="sm" variant="primary" loading={save.isPending} icon={<Save className="size-3.5" />} onClick={() => save.mutate()}>Save</Button>}>School days per month</CardTitle>
      {q.isPending ? <Spinner /> : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {SCHOOL_MONTHS.map((m) => (
            <Field key={m} label={`${MONTH_NAME[m]} ${m >= 6 ? startYear : startYear + 1}`}>
              {(id) => <Input id={id} inputMode="numeric" value={vals[m] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [m]: e.target.value.replace(/\D/g, '').slice(0, 2) }))} />}
            </Field>
          ))}
        </div>
      )}
    </Card>
  );
}

function YearModal({ year, onClose, onSaved }: { year?: SchoolYear; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [name, setName] = useState(year?.name ?? `${thisYear}-${thisYear + 1}`);
  const [start, setStart] = useState(year?.startDate ?? `${thisYear}-06-08`);
  const [end, setEnd] = useState(year?.endDate ?? `${thisYear + 1}-03-31`);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => (year ? put(`/school-years/${year.id}`, { name, startDate: start, endDate: end }) : post('/school-years', { name, startDate: start, endDate: end })),
    onSuccess: async () => { toast.ok('Saved.'); await onSaved(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={year ? 'Edit school year' : 'New school year'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="School year" hint="For example 2026-2027">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day of classes">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Last day of classes">{(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        {error ? <Alert tone="bad">{error}</Alert> : null}
      </div>
    </Modal>
  );
}
