import { ENROLLMENT_STATUSES } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, Download, FileText, KeyRound, Layers, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { YearSelect, sectionLabel, useSections, useYearChoice } from '../components/bits';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, Empty, Field, Input, Modal, PageHeader, Select, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { del, downloadReport, get, post, put, qs } from '../lib/api';
import { saveCsv } from '../lib/csv';
import { shortName, titleCase } from '../lib/format';
import type { LearnerBrief, LearnerListItem, SectionRow, Strand, Teacher } from '../lib/types';

export default function SectionsPage() {
  const { yearId, setYearId } = useYearChoice();
  const sections = useSections(yearId);
  const [adding, setAdding] = useState(false);
  const grades = [11, 12];

  return (
    <>
      <PageHeader
        title="Sections"
        sub="Sections, advisers and the learners in each."
        actions={
          <>
            <YearSelect value={yearId} onChange={setYearId} />
            <Button variant="primary" icon={<Plus className="size-4" />} disabled={yearId == null} onClick={() => setAdding(true)}>
              Add section
            </Button>
          </>
        }
      />
      {sections.isPending ? (
        <Spinner />
      ) : sections.isError ? (
        <Alert tone="bad">{errorMessage(sections.error)}</Alert>
      ) : sections.data.length === 0 ? (
        <Card>
          <Empty title="No sections in this school year" icon={<Layers className="size-8" />} action={<Button variant="primary" onClick={() => setAdding(true)}>Add the first section</Button>}>
            Adding a section also creates its class records from the curriculum.
          </Empty>
        </Card>
      ) : (
        grades.map((g) => {
          const list = sections.data.filter((s) => s.gradeLevel === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Grade {g}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((s) => (
                  <Link key={s.id} to={`/sections/${s.id}`} className="rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold">{s.name}</p>
                        <p className="text-sm text-muted">{s.strand.code} · {s.strand.name}</p>
                      </div>
                      <Badge tone="brand">{s.enrolled} learners</Badge>
                    </div>
                    <p className="mt-3 text-sm">
                      <span className="text-muted">Adviser: </span>
                      {s.adviser?.fullName ?? <span className="text-warn">not assigned</span>}
                    </p>
                    <p className="text-xs text-muted">{s.male} male · {s.female} female · {s.classes} class records{s.room ? ` · ${s.room}` : ''}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
      {adding && yearId != null ? <SectionModal yearId={yearId} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function SectionModal({ yearId, section, onClose }: { yearId: number; section?: SectionRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const strands = useQuery({ queryKey: ['strands'], queryFn: () => get<Strand[]>('/strands') });
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: () => get<Teacher[]>('/teachers') });
  const [grade, setGrade] = useState(String(section?.gradeLevel ?? 11));
  const [strandId, setStrandId] = useState(String(section?.strand.id ?? ''));
  const [name, setName] = useState(section?.name ?? '');
  const [adviserId, setAdviserId] = useState(String(section?.adviser?.id ?? ''));
  const [room, setRoom] = useState(section?.room ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { schoolYearId: yearId, gradeLevel: Number(grade), strandId: Number(strandId), name, adviserId: adviserId ? Number(adviserId) : null, room };
      return section ? put(`/sections/${section.id}`, body) : post<{ id: number; classesCreated: number }>('/sections', body);
    },
    onSuccess: (r) => {
      toast.ok(section ? 'Section updated.' : `Section added with ${(r as { classesCreated: number }).classesCreated} class records.`);
      void qc.invalidateQueries({ queryKey: ['sections'] });
      void qc.invalidateQueries({ queryKey: ['section'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={section ? 'Edit section' : 'Add section'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!strandId || !name.trim()} onClick={() => save.mutate()}>{section ? 'Save' : 'Add section'}</Button></>}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Grade level">{(id) => <Select id={id} value={grade} disabled={Boolean(section)} onChange={(e) => setGrade(e.target.value)}><option value="11">Grade 11</option><option value="12">Grade 12</option></Select>}</Field>
          <Field label="Strand">
            {(id) => (
              <Select id={id} value={strandId} disabled={Boolean(section)} onChange={(e) => setStrandId(e.target.value)}>
                <option value="">Choose</option>
                {strands.data?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Section name" hint="For example Newton, Rizal, A">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Class adviser">
          {(id) => (
            <Select id={id} value={adviserId} onChange={(e) => setAdviserId(e.target.value)}>
              <option value="">Not assigned yet</option>
              {teachers.data?.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Room (optional)">{(id) => <Input id={id} value={room} onChange={(e) => setRoom(e.target.value)} />}</Field>
        {error ? <Alert tone="bad">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ one section

interface SectionDetailData {
  id: number;
  name: string;
  gradeLevel: number;
  room: string | null;
  schoolYear: { id: number; name: string };
  strand: { id: number; code: string; name: string; track: string };
  adviser: { id: number; fullName: string } | null;
  learners: Array<LearnerBrief & { enrollmentId: number; status: string }>;
}

export function SectionDetailPage() {
  const { id } = useParams();
  const sectionId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['section', sectionId], queryFn: () => get<SectionDetailData>(`/sections/${sectionId}`) });
  const all = useSections(q.data?.schoolYear.id ?? null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<(LearnerBrief & { enrollmentId: number }) | null>(null);
  const [removing, setRemoving] = useState<(LearnerBrief & { enrollmentId: number }) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creds, setCreds] = useState<Array<{ lrn: string; name: string; username: string; tempPassword: string }> | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['section', sectionId] });
    void qc.invalidateQueries({ queryKey: ['sections'] });
    void qc.invalidateQueries({ queryKey: ['learners'] });
  };
  const fail = (e: unknown) => toast.error(errorMessage(e));

  const setStatus = useMutation({ mutationFn: (v: { id: number; status: string }) => put(`/enrollments/${v.id}`, { status: v.status }), onSuccess: refresh, onError: fail });
  const generate = useMutation({
    mutationFn: () => post<{ created: number }>(`/sections/${sectionId}/generate-classes`),
    onSuccess: (r) => {
      toast.ok(r.created ? `${r.created} class records created.` : 'All class records already exist.');
      refresh();
    },
    onError: fail,
  });
  const accounts = useMutation({
    mutationFn: () => post<{ created: number; accounts: NonNullable<typeof creds> }>('/learners/accounts/bulk', { sectionId }),
    onSuccess: (r) => (r.created ? setCreds(r.accounts) : toast.info('Every learner in this section already has an account.')),
    onError: fail,
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const s = q.data;
  const sectionRow = all.data?.find((x) => x.id === s.id);
  const targets = all.data?.filter((x) => x.id !== s.id && x.gradeLevel === s.gradeLevel && x.strand.id === s.strand.id) ?? [];

  return (
    <>
      <PageHeader
        back={<Link to="/sections" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Sections</Link>}
        title={`Grade ${s.gradeLevel} - ${s.name}`}
        sub={`${s.strand.code} · SY ${s.schoolYear.name} · Adviser: ${s.adviser?.fullName ?? 'not assigned'}${s.room ? ` · ${s.room}` : ''}`}
        actions={
          <>
            <Link to={`/classes?sectionId=${s.id}`}><Button icon={<BookOpenCheck className="size-4" />}>Class records</Button></Link>
            <Link to={`/advisory/${s.id}`}><Button icon={<FileText className="size-4" />}>Grades and cards</Button></Link>
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>Add learners</Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" loading={generate.isPending} icon={<BookOpenCheck className="size-4" />} onClick={() => generate.mutate()}>Create missing class records</Button>
        <Button size="sm" loading={accounts.isPending} icon={<KeyRound className="size-4" />} onClick={() => accounts.mutate()}>Create learner accounts</Button>
        <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadReport(`/reports/masterlist${qs({ sectionId })}`, `Masterlist_${s.name}.xlsx`).catch(fail)}>Master list</Button>
      </div>

      {s.learners.length === 0 ? (
        <Card>
          <Empty title="No learners yet" icon={<Users className="size-8" />} action={<Button variant="primary" onClick={() => setAdding(true)}>Add learners</Button>}>
            Pick from learners who are not enrolled this school year, or import a class list from the Learners page.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls} style={{ width: 40 }}>#</th>
                <th className={thCls}>LRN</th>
                <th className={thCls}>Name</th>
                <th className={thCls}>Sex</th>
                <th className={thCls}>Status</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {s.learners.map((l, i) => (
                <tr key={l.enrollmentId} className={l.status === 'ENROLLED' || l.status === 'LATE_ENROLLEE' ? '' : 'opacity-70'}>
                  <td className={tdCls + ' text-muted tnum'}>{i + 1}</td>
                  <td className={tdCls + ' tnum'}>{l.lrn}</td>
                  <td className={tdCls}><Link to={`/learners/${l.id}`} className="font-medium hover:text-brand">{shortName(l)}</Link></td>
                  <td className={tdCls}>{l.sex}</td>
                  <td className={tdCls}>
                    <Select aria-label="Status" className="h-9 w-auto" value={l.status} onChange={(e) => setStatus.mutate({ id: l.enrollmentId, status: e.target.value })}>
                      {ENROLLMENT_STATUSES.map((st) => <option key={st} value={st}>{titleCase(st)}</option>)}
                    </Select>
                  </td>
                  <td className={tdCls + ' text-right'}>
                    <div className="flex justify-end gap-1">
                      {targets.length ? <Button size="sm" variant="ghost" onClick={() => setMoving(l)}>Move</Button> : null}
                      <Button size="sm" variant="ghost" aria-label={`Remove ${shortName(l)}`} onClick={() => setRemoving(l)}><Trash2 className="size-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {s.learners.length === 0 ? (
        <div className="mt-6">
          <Button variant="ghost" className="text-bad" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>Delete this section</Button>
        </div>
      ) : null}

      {editing && sectionRow ? <SectionModal yearId={s.schoolYear.id} section={sectionRow} onClose={() => setEditing(false)} /> : null}
      {adding ? <AddLearnersModal sectionId={s.id} schoolYearId={s.schoolYear.id} onClose={() => { setAdding(false); refresh(); }} /> : null}

      <Modal open={moving != null} onClose={() => setMoving(null)} title={`Move ${moving ? shortName(moving) : ''}`}>
        <MoveForm
          targets={targets}
          onMove={async (target) => {
            try {
              await put(`/enrollments/${moving!.enrollmentId}`, { sectionId: target });
              toast.ok('Learner moved.');
              setMoving(null);
              refresh();
            } catch (e) {
              fail(e);
            }
          }}
        />
      </Modal>

      <ConfirmDialog
        open={removing != null}
        danger
        title="Remove from this section?"
        confirmLabel="Remove"
        onConfirm={async () => {
          try {
            await del(`/enrollments/${removing!.enrollmentId}`);
            toast.ok('Removed.');
            setRemoving(null);
            refresh();
          } catch (e) {
            fail(e);
            setRemoving(null);
          }
        }}
        onClose={() => setRemoving(null)}
      >
        <b>{removing ? shortName(removing) : ''}</b> will no longer be enrolled this school year. If scores were already recorded, set the status to Dropped out or Transferred out instead.
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        danger
        title="Delete this section?"
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await del(`/sections/${sectionId}`);
            toast.ok('Section deleted.');
            void qc.invalidateQueries({ queryKey: ['sections'] });
            navigate('/sections');
          } catch (e) {
            fail(e);
            setDeleting(false);
          }
        }}
        onClose={() => setDeleting(false)}
      >
        Its empty class records are deleted too.
      </ConfirmDialog>

      <Modal
        open={creds != null}
        wide
        onClose={() => setCreds(null)}
        title={`${creds?.length ?? 0} accounts created`}
        footer={
          <>
            <Button icon={<Download className="size-4" />} onClick={() => void saveCsv(`learner-accounts-${s.name}.csv`, [['LRN', 'Name', 'Username', 'One-time password'], ...(creds ?? []).map((c) => [c.lrn, c.name, c.username, c.tempPassword])])}>Save as CSV</Button>
            <Button variant="primary" onClick={() => setCreds(null)}>Done</Button>
          </>
        }
      >
        <Alert tone="warn" title="Save or print this list now">One-time passwords are shown only once. Each learner must choose a new password at first sign-in. Give every learner only their own line.</Alert>
        <div className="mt-3"><TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Name</th><th className={thCls}>Username</th><th className={thCls}>Password</th></tr></thead>
            <tbody>{creds?.map((c) => <tr key={c.username}><td className={tdCls}>{c.name}</td><td className={tdCls + ' font-mono'}>{c.username}</td><td className={tdCls + ' font-mono font-semibold'}>{c.tempPassword}</td></tr>)}</tbody>
          </table>
        </TableWrap></div>
      </Modal>
    </>
  );
}

function MoveForm({ targets, onMove }: { targets: SectionRow[]; onMove: (id: number) => Promise<void> }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Only sections of the same grade level and strand are listed. Scores already recorded stay with the learner.</p>
      <Select aria-label="Move to" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Choose a section</option>
        {targets.map((t) => <option key={t.id} value={t.id}>{sectionLabel(t)}</option>)}
      </Select>
      <Button variant="primary" disabled={!target} loading={busy} onClick={async () => { setBusy(true); await onMove(Number(target)); setBusy(false); }}>Move</Button>
    </div>
  );
}

function AddLearnersModal({ sectionId, schoolYearId, onClose }: { sectionId: number; schoolYearId: number; onClose: () => void }) {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const q = useQuery({
    queryKey: ['learners', 'unenrolled', schoolYearId, term],
    queryFn: () => get<{ items: LearnerListItem[] }>(`/learners${qs({ unenrolled: true, schoolYearId, q: term, pageSize: 100 })}`),
  });
  const enroll = useMutation({
    mutationFn: () => post<{ enrolled: number; skipped: unknown[] }>('/enrollments/bulk', { schoolYearId, sectionId, learnerIds: [...picked] }),
    onSuccess: (r) => {
      toast.ok(`${r.enrolled} learner${r.enrolled === 1 ? '' : 's'} enrolled.`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Modal open wide onClose={onClose} title="Add learners to this section" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={picked.size === 0} loading={enroll.isPending} onClick={() => enroll.mutate()}>Enroll {picked.size || ''} selected</Button></>}>
      <div className="flex flex-col gap-3">
        <Input aria-label="Search" placeholder="Search name or LRN" value={term} onChange={(e) => setTerm(e.target.value)} />
        {q.isPending ? <Spinner /> : q.data!.items.length === 0 ? (
          <Empty title="Everyone is already enrolled">Add a new learner from the Learners page first.</Empty>
        ) : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {q.data!.items.map((l) => (
              <li key={l.id} className="px-3 py-2">
                <Checkbox checked={picked.has(l.id)} onChange={() => toggle(l.id)} label={<span>{shortName(l)} <span className="text-xs text-muted">LRN {l.lrn}</span></span>} className="w-full" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
