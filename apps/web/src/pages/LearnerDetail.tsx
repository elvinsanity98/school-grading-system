import { ENROLLMENT_STATUSES } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { sectionLabel, useSections, useYearChoice } from '../components/bits';
import { Alert, Badge, Button, Card, CardTitle, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Spinner, errorMessage, useToast } from '../components/ui';
import { del, downloadReport, get, post, put, qs } from '../lib/api';
import { useSession } from '../lib/auth';
import { dateLabel, learnerName, titleCase } from '../lib/format';
import type { LearnerDetail } from '../lib/types';
import { LearnerFormModal } from './Learners';

export default function LearnerDetailPage() {
  const { id } = useParams();
  const learnerId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, currentYearId } = useSession();
  const { yearId } = useYearChoice();
  const sections = useSections(yearId ?? currentYearId);
  const q = useQuery({ queryKey: ['learner', learnerId], queryFn: () => get<LearnerDetail>(`/learners/${learnerId}`) });
  const [editing, setEditing] = useState(false);
  const [creds, setCreds] = useState<{ username: string; tempPassword: string } | null>(null);
  const [sectionPick, setSectionPick] = useState('');
  const [external, setExternal] = useState(false);
  const [removeRec, setRemoveRec] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [parentName, setParentName] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['learner', learnerId] });
    void qc.invalidateQueries({ queryKey: ['learners'] });
    void qc.invalidateQueries({ queryKey: ['sections'] });
  };
  const fail = (e: unknown) => toast.error(errorMessage(e));

  const account = useMutation({
    mutationFn: () => post<{ username: string; tempPassword: string }>(`/learners/${learnerId}/account`),
    onSuccess: (c) => {
      setCreds(c);
      refresh();
    },
    onError: fail,
  });
  const parent = useMutation({
    mutationFn: (fullName: string) => post<{ username: string; tempPassword: string }>(`/learners/${learnerId}/parent-account`, { fullName }),
    onSuccess: (c) => {
      setParentOpen(false);
      setCreds(c);
      refresh();
    },
    onError: fail,
  });
  const resetAccount = useMutation({
    mutationFn: (userId: number) => post<{ username: string; tempPassword: string }>(`/learners/${learnerId}/accounts/${userId}/reset-password`),
    onSuccess: (c) => {
      setCreds(c);
      refresh();
    },
    onError: fail,
  });
  const enroll = useMutation({
    mutationFn: () => post('/enrollments', { learnerId, schoolYearId: yearId ?? currentYearId, sectionId: Number(sectionPick) }),
    onSuccess: () => {
      toast.ok('Enrolled.');
      setSectionPick('');
      refresh();
    },
    onError: fail,
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: number; status: string }) => put(`/enrollments/${v.id}`, { status: v.status }),
    onSuccess: () => {
      toast.ok('Status updated.');
      refresh();
    },
    onError: fail,
  });
  const removeExternal = useMutation({
    mutationFn: (rid: number) => del(`/external-records/${rid}`),
    onSuccess: () => {
      setRemoveRec(null);
      refresh();
    },
    onError: fail,
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const l = q.data;
  const year = yearId ?? currentYearId;
  const enrolledThisYear = l.enrollments.some((e) => e.schoolYearId === year);
  const hasStudentAccount = l.accounts.some((a) => a.role === 'STUDENT');

  return (
    <>
      <PageHeader
        back={
          <Link to="/learners" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Learners
          </Link>
        }
        title={learnerName(l)}
        sub={`LRN ${l.lrn}`}
        actions={
          <>
            <Button icon={<FileText className="size-4" />} onClick={() => downloadReport(`/reports/sf10${qs({ learnerId })}`, `SF10_${l.lastName}.pdf`).catch(fail)}>
              SF10 record
            </Button>
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Badge tone={l.status === 'ACTIVE' ? 'ok' : 'warn'}>{titleCase(l.status)}</Badge>}>Profile</CardTitle>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            {(
              [
                ['Sex', l.sex === 'M' ? 'Male' : 'Female'],
                ['Date of birth', dateLabel(l.birthDate)],
                ['Place of birth', l.birthPlace],
                ['Address', l.address],
                ['Religion', l.religion],
                ['Mother tongue', l.motherTongue],
                ['Indigenous group', l.ipGroup],
                ['Parent / guardian', [l.guardianName, l.guardianRelation && `(${l.guardianRelation})`].filter(Boolean).join(' ')],
                ['Contact number', l.guardianContact],
                ['Previous school', l.previousSchool],
              ] as Array<[string, string | null]>
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v || <span className="text-muted">-</span>}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Enrollment</CardTitle>
            {l.enrollments.length === 0 ? <p className="text-sm text-muted">Never enrolled in this school.</p> : null}
            <ul className="divide-y divide-line">
              {l.enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">
                      SY {e.schoolYear}: Grade {e.section.gradeLevel} - {e.section.name}
                    </p>
                    <p className="text-xs text-muted">
                      {e.section.strand} · Adviser: {e.section.adviser ?? 'none'}
                    </p>
                  </div>
                  <Select aria-label="Enrollment status" className="h-9 w-auto" value={e.status} onChange={(ev) => setStatus.mutate({ id: e.id, status: ev.target.value })}>
                    {ENROLLMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
            {!enrolledThisYear && year ? (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <Field label="Enroll this school year in" className="min-w-52 flex-1">
                  {(id) => (
                    <Select id={id} value={sectionPick} onChange={(e) => setSectionPick(e.target.value)}>
                      <option value="">Choose a section</option>
                      {sections.data?.map((s) => (
                        <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button variant="primary" disabled={!sectionPick} loading={enroll.isPending} onClick={() => enroll.mutate()}>
                  Enroll
                </Button>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardTitle sub="The learner signs in with the LRN. A parent gets a separate account that sees only this learner." action={<div className="flex gap-2">{!hasStudentAccount ? <Button size="sm" icon={<KeyRound className="size-3.5" />} loading={account.isPending} onClick={() => account.mutate()}>Learner account</Button> : null}<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => { setParentName(l.guardianName ?? ''); setParentOpen(true); }}>Parent account</Button></div>}>
              Portal accounts
            </CardTitle>
            {l.accounts.length === 0 ? <p className="text-sm text-muted">No accounts yet.</p> : (
              <ul className="divide-y divide-line">
                {l.accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">{a.role === 'STUDENT' ? 'Learner' : 'Parent / guardian'}{a.role === 'PARENT' ? `: ${a.fullName}` : ''}</p>
                      <p className="font-mono text-xs text-muted">{a.username}</p>
                    </div>
                    <Button size="sm" loading={resetAccount.isPending && resetAccount.variables === a.id} onClick={() => resetAccount.mutate(a.id)}>Reset password</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardTitle sub="Grades from schools before this one, printed on the SF10" action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setExternal(true)}>Add record</Button>}>
            Records from previous schools
          </CardTitle>
          {l.externalRecords.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : null}
          <div className="flex flex-col gap-3">
            {l.externalRecords.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.schoolName} · SY {r.schoolYear} · Grade {r.gradeLevel}, {r.period}
                  </p>
                  <Button size="sm" variant="ghost" aria-label="Delete record" onClick={() => setRemoveRec(r.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  {r.subjects.length} subjects · General average {r.generalAverage ?? '-'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {editing ? <LearnerFormModal learner={l} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} /> : null}
      {external ? <ExternalModal learnerId={learnerId} onClose={() => setExternal(false)} onSaved={() => { setExternal(false); refresh(); }} /> : null}

      <Modal open={parentOpen} onClose={() => setParentOpen(false)} title="Parent or guardian account" footer={<><Button onClick={() => setParentOpen(false)}>Cancel</Button><Button variant="primary" disabled={parentName.trim().length < 2} loading={parent.isPending} onClick={() => parent.mutate(parentName.trim())}>Create account</Button></>}>
        <Field label="Name of the parent or guardian">{(id) => <Input id={id} value={parentName} onChange={(e) => setParentName(e.target.value)} />}</Field>
      </Modal>

      <Modal open={creds != null} onClose={() => setCreds(null)} title="One-time password" footer={<Button variant="primary" onClick={() => setCreds(null)}>Done</Button>}>
        {creds ? (
          <div className="flex flex-col gap-3">
            <Alert tone="warn" title="Write this down now">The password is shown only once. The learner must change it at first sign-in.</Alert>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Username</dt>
              <dd className="font-mono font-semibold">{creds.username}</dd>
              <dt className="text-muted">Password</dt>
              <dd className="font-mono font-semibold">{creds.tempPassword}</dd>
            </dl>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog open={removeRec != null} danger title="Delete this previous-school record?" confirmLabel="Delete" loading={removeExternal.isPending} onConfirm={() => removeRec != null && removeExternal.mutate(removeRec)} onClose={() => setRemoveRec(null)}>
        It will no longer be printed on the SF10.
      </ConfirmDialog>

      {user.role === 'ADMIN' && l.enrollments.length === 0 ? (
        <div className="mt-6">
          <Button variant="ghost" className="text-bad" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
            Delete this learner
          </Button>
          <ConfirmDialog
            open={deleting}
            danger
            title="Delete learner?"
            confirmLabel="Delete"
            onConfirm={async () => {
              try {
                await del(`/learners/${learnerId}`);
                toast.ok('Learner deleted.');
                void qc.invalidateQueries({ queryKey: ['learners'] });
                navigate('/learners');
              } catch (e) {
                fail(e);
                setDeleting(false);
              }
            }}
            onClose={() => setDeleting(false)}
          >
            This learner was never enrolled, so nothing else is affected.
          </ConfirmDialog>
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ previous school record

interface SubjRow {
  subject: string;
  type: string;
  q1: string;
  q2: string;
  final: string;
  remarks: string;
}

function ExternalModal({ learnerId, onClose, onSaved }: { learnerId: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ schoolName: '', schoolId: '', schoolYear: '', period: '', gradeLevel: '11', strandName: '', sectionName: '', generalAverage: '' });
  const [rows, setRows] = useState<SubjRow[]>([{ subject: '', type: 'Core', q1: '', q2: '', final: '', remarks: 'Passed' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  const setRow = (i: number, patch: Partial<SubjRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await post(`/learners/${learnerId}/external-records`, {
        schoolName: f.schoolName,
        schoolId: f.schoolId,
        schoolYear: f.schoolYear,
        period: f.period,
        gradeLevel: Number(f.gradeLevel),
        strandName: f.strandName,
        sectionName: f.sectionName,
        generalAverage: num(f.generalAverage),
        subjects: rows.filter((r) => r.subject.trim()).map((r) => ({ subject: r.subject, type: r.type, q1: num(r.q1), q2: num(r.q2), final: num(r.final), remarks: r.remarks })),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open wide onClose={onClose} title="Record from a previous school" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save record</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School name" className="sm:col-span-2">{(id) => <Input id={id} value={f.schoolName} onChange={(e) => setF({ ...f, schoolName: e.target.value })} />}</Field>
          <Field label="School year" hint="e.g. 2025-2026">{(id) => <Input id={id} value={f.schoolYear} onChange={(e) => setF({ ...f, schoolYear: e.target.value })} />}</Field>
          <Field label="School ID">{(id) => <Input id={id} value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })} />}</Field>
          <Field label="Grade level">{(id) => <Select id={id} value={f.gradeLevel} onChange={(e) => setF({ ...f, gradeLevel: e.target.value })}><option value="11">11</option><option value="12">12</option></Select>}</Field>
          <Field label="Period" hint="as that school named it, e.g. 1st Semester or Term 2">{(id) => <Input id={id} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />}</Field>
          <Field label="Track / strand">{(id) => <Input id={id} value={f.strandName} onChange={(e) => setF({ ...f, strandName: e.target.value })} />}</Field>
          <Field label="Section">{(id) => <Input id={id} value={f.sectionName} onChange={(e) => setF({ ...f, sectionName: e.target.value })} />}</Field>
          <Field label="General average">{(id) => <Input id={id} inputMode="numeric" value={f.generalAverage} onChange={(e) => setF({ ...f, generalAverage: e.target.value.replace(/\D/g, '') })} />}</Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Subjects</p>
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-2 sm:grid-cols-[1fr_7rem_4rem_4rem_4rem_6rem_2.5rem]">
                <Input aria-label="Subject" className="col-span-4 sm:col-span-1" placeholder="Subject" value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })} />
                <Select aria-label="Type" value={r.type} onChange={(e) => setRow(i, { type: e.target.value })}><option>Core</option><option>Applied</option><option>Specialized</option></Select>
                <Input aria-label="Q1" placeholder="Q1" inputMode="numeric" value={r.q1} onChange={(e) => setRow(i, { q1: e.target.value.replace(/\D/g, '') })} />
                <Input aria-label="Q2" placeholder="Q2" inputMode="numeric" value={r.q2} onChange={(e) => setRow(i, { q2: e.target.value.replace(/\D/g, '') })} />
                <Input aria-label="Final" placeholder="Final" inputMode="numeric" value={r.final} onChange={(e) => setRow(i, { final: e.target.value.replace(/\D/g, '') })} />
                <Select aria-label="Action" value={r.remarks} onChange={(e) => setRow(i, { remarks: e.target.value })}><option>Passed</option><option>Failed</option></Select>
                <Button variant="ghost" aria-label="Remove subject" className="px-0" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setRows((rs) => [...rs, { subject: '', type: 'Core', q1: '', q2: '', final: '', remarks: 'Passed' }])}>
            Add subject
          </Button>
        </div>
        {error ? <Alert tone="bad">{error}</Alert> : null}
      </div>
    </Modal>
  );
}
