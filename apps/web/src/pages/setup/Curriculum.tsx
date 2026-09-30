import { SUBJECT_TYPES, SUBJECT_TYPE_LABEL, TRACKS, TRACK_LABEL, type SubjectType, type Track } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, CardTitle, Checkbox, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Spinner, TableWrap, Tabs, errorMessage, tableCls, tdCls, thCls, useToast } from '../../components/ui';
import { del, get, post, put } from '../../lib/api';
import type { CurriculumRow, Strand, Subject, WeightProfile } from '../../lib/types';

type Tab = 'curriculum' | 'subjects' | 'strands' | 'weights';

export default function CurriculumPage() {
  const [tab, setTab] = useState<Tab>('curriculum');
  return (
    <>
      <PageHeader title="Curriculum" sub="Strands, subjects, the subjects each strand takes per semester, and the grading weights." />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'curriculum', label: 'Program of studies' },
          { id: 'subjects', label: 'Subjects' },
          { id: 'strands', label: 'Strands' },
          { id: 'weights', label: 'Weights' },
        ]}
      />
      {tab === 'curriculum' ? <ProgramTab /> : null}
      {tab === 'subjects' ? <SubjectsTab /> : null}
      {tab === 'strands' ? <StrandsTab /> : null}
      {tab === 'weights' ? <WeightsTab /> : null}
    </>
  );
}

// ------------------------------------------------------------------ program of studies

function ProgramTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const strands = useQuery({ queryKey: ['strands'], queryFn: () => get<Strand[]>('/strands') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const [strandId, setStrandId] = useState('');
  const [grade, setGrade] = useState('11');
  const [semester, setSemester] = useState('1');
  const [adding, setAdding] = useState(false);
  const activeStrand = strandId || String(strands.data?.[0]?.id ?? '');
  const rows = useQuery({
    queryKey: ['curriculum', activeStrand, grade, semester],
    queryFn: () => get<CurriculumRow[]>(`/curriculum?strandId=${activeStrand}&gradeLevel=${grade}&semester=${semester}`),
    enabled: Boolean(activeStrand),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/curriculum/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['curriculum'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">
        New sections copy their class records from this list, so set it up before creating sections. Changing it later does not remove class records that already exist; use <b>Create missing class records</b> on the section to add new subjects.
      </Alert>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Strand">{(id) => <Select id={id} className="w-auto" value={activeStrand} onChange={(e) => setStrandId(e.target.value)}>{strands.data?.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</Select>}</Field>
        <Field label="Grade">{(id) => <Select id={id} className="w-auto" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="11">Grade 11</option><option value="12">Grade 12</option></Select>}</Field>
        <Field label="Semester">{(id) => <Select id={id} className="w-auto" value={semester} onChange={(e) => setSemester(e.target.value)}><option value="1">1st semester</option><option value="2">2nd semester</option></Select>}</Field>
        <Button className="ml-auto" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add subject</Button>
      </div>
      {rows.isPending ? <Spinner /> : rows.isError ? <Alert tone="bad">{errorMessage(rows.error)}</Alert> : (
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Subject</th><th className={thCls}>Type</th><th className={thCls}>Applies to</th><th className={thCls} /></tr></thead>
            <tbody>
              {rows.data.length === 0 ? <tr><td className={tdCls + ' text-muted'} colSpan={4}>No subjects for this slot yet.</td></tr> : null}
              {rows.data.map((r) => (
                <tr key={r.id}>
                  <td className={tdCls + ' font-medium'}>{r.subject.name}{r.subject.isImmersion ? <Badge tone="info" className="ml-2">Immersion / research</Badge> : null}</td>
                  <td className={tdCls}>{SUBJECT_TYPE_LABEL[r.subject.type as SubjectType] ?? r.subject.type}</td>
                  <td className={tdCls}>{r.strand ? r.strand.code : <Badge>All strands</Badge>}</td>
                  <td className={tdCls + ' text-right'}><Button size="sm" variant="ghost" aria-label={`Remove ${r.subject.name}`} onClick={() => remove.mutate(r.id)}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {adding ? <AddToProgram strands={strands.data ?? []} subjects={subjects.data ?? []} defaults={{ strandId: activeStrand, grade, semester }} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function AddToProgram({ strands, subjects, defaults, onClose }: { strands: Strand[]; subjects: Subject[]; defaults: { strandId: string; grade: string; semester: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState('');
  const [strandId, setStrandId] = useState(defaults.strandId);
  const [error, setError] = useState<string | null>(null);
  const subj = subjects.find((s) => s.id === Number(subjectId));
  const save = useMutation({
    mutationFn: () => post('/curriculum', { subjectId: Number(subjectId), strandId: strandId === 'ALL' ? null : Number(strandId), gradeLevel: Number(defaults.grade), semester: Number(defaults.semester), sortOrder: 500 }),
    onSuccess: () => { toast.ok('Subject added.'); void qc.invalidateQueries({ queryKey: ['curriculum'] }); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={`Add subject: Grade ${defaults.grade}, ${defaults.semester === '1' ? '1st' : '2nd'} semester`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!subjectId} loading={save.isPending} onClick={() => save.mutate()}>Add</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Subject">
          {(id) => (
            <Select id={id} value={subjectId} onChange={(e) => { setSubjectId(e.target.value); const s = subjects.find((x) => x.id === Number(e.target.value)); if (s?.type === 'CORE') setStrandId('ALL'); }}>
              <option value="">Choose a subject</option>
              {subjects.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Applies to" hint={subj?.type === 'CORE' ? 'Core subjects are taken by every strand' : undefined}>
          {(id) => (
            <Select id={id} value={strandId} onChange={(e) => setStrandId(e.target.value)}>
              <option value="ALL">All strands</option>
              {strands.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select>
          )}
        </Field>
        <p className="text-xs text-muted">Missing the subject? Add it under the Subjects tab first.</p>
        {error ? <Alert tone="bad">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ subjects

function SubjectsTab() {
  const q = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const profiles = useQuery({ queryKey: ['weights'], queryFn: () => get<WeightProfile[]>('/weight-profiles') });
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const label = (code: string | null | undefined) => {
    const p = profiles.data?.find((x) => x.code === code);
    return p ? `${p.ww}/${p.pt}/${p.qa}` : '-';
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add subject</Button></div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : (
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Code</th><th className={thCls}>Subject</th><th className={thCls}>Type</th><th className={thCls}>Weights WW/PT/QA (academic | TVL)</th><th className={thCls} /></tr></thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
                  <td className={tdCls + ' font-mono text-[13px]'}>{s.code}</td>
                  <td className={tdCls}>{s.name}{s.isImmersion ? <Badge tone="info" className="ml-2">Immersion</Badge> : null}</td>
                  <td className={tdCls}>{SUBJECT_TYPE_LABEL[s.type as SubjectType]}</td>
                  <td className={tdCls + ' tnum'}>{s.weightProfileId ? <Badge tone="warn">custom</Badge> : `${label(s.academicProfile)} | ${label(s.tvlProfile)}`}</td>
                  <td className={tdCls + ' text-right'}><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {editing ? <SubjectModal subject={editing === 'new' ? undefined : editing} profiles={profiles.data ?? []} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function SubjectModal({ subject, profiles, onClose }: { subject?: Subject; profiles: WeightProfile[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ code: subject?.code ?? '', name: subject?.name ?? '', type: (subject?.type ?? 'SPECIALIZED') as SubjectType, isImmersion: subject?.isImmersion ?? false, weightProfileId: subject?.weightProfileId ? String(subject.weightProfileId) : '', active: subject?.active ?? true });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, weightProfileId: f.weightProfileId ? Number(f.weightProfileId) : null };
      return subject ? put(`/subjects/${subject.id}`, body) : post('/subjects', body);
    },
    onSuccess: () => { toast.ok('Saved.'); void qc.invalidateQueries({ queryKey: ['subjects'] }); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={subject ? 'Edit subject' : 'Add subject'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f.code.trim() || !f.name.trim()} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code" className="col-span-1">{(id) => <Input id={id} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}</Field>
          <Field label="Type" className="col-span-2">{(id) => <Select id={id} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as SubjectType })}>{SUBJECT_TYPES.map((t) => <option key={t} value={t}>{SUBJECT_TYPE_LABEL[t]}</option>)}</Select>}</Field>
        </div>
        <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Checkbox checked={f.isImmersion} onChange={(e) => setF({ ...f, isImmersion: e.target.checked })} label="Work Immersion, Research, Business Enterprise Simulation, Exhibit or Performance" />
        <Field label="Weights" hint="Normally automatic from the subject type and the strand's track (DO 8, s. 2015)">
          {(id) => (
            <Select id={id} value={f.weightProfileId} onChange={(e) => setF({ ...f, weightProfileId: e.target.value })}>
              <option value="">Automatic</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.ww}/{p.pt}/{p.qa} - {p.name}</option>)}
            </Select>
          )}
        </Field>
        {subject ? <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Active (can be added to the program of studies)" /> : null}
        {error ? <Alert tone="bad">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ strands

function StrandsTab() {
  const q = useQuery({ queryKey: ['strands'], queryFn: () => get<Strand[]>('/strands') });
  const [editing, setEditing] = useState<Strand | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add strand</Button></div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : (
        <TableWrap>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Code</th><th className={thCls}>Name</th><th className={thCls}>Track</th><th className={thCls}>Status</th><th className={thCls} /></tr></thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td className={tdCls + ' font-semibold'}>{s.code}</td>
                  <td className={tdCls}>{s.name}</td>
                  <td className={tdCls}>{TRACK_LABEL[s.track as Track]}</td>
                  <td className={tdCls}>{s.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td className={tdCls + ' text-right'}><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {editing ? <StrandModal strand={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function StrandModal({ strand, onClose }: { strand?: Strand; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ code: strand?.code ?? '', name: strand?.name ?? '', track: (strand?.track ?? 'ACADEMIC') as Track, active: strand?.active ?? true });
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () => (strand ? put(`/strands/${strand.id}`, f) : post('/strands', f)),
    onSuccess: () => { toast.ok('Saved.'); void qc.invalidateQueries({ queryKey: ['strands'] }); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/strands/${strand!.id}`),
    onSuccess: () => { toast.ok('Strand deleted.'); void qc.invalidateQueries({ queryKey: ['strands'] }); onClose(); },
    onError: (e) => { setConfirm(false); setError(errorMessage(e)); },
  });
  return (
    <>
      <Modal open onClose={onClose} title={strand ? 'Edit strand' : 'Add strand'} footer={<>{strand ? <Button variant="danger" className="mr-auto" onClick={() => setConfirm(true)}>Delete</Button> : null}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f.code.trim() || !f.name.trim()} onClick={() => save.mutate()}>Save</Button></>}>
        <div className="flex flex-col gap-3">
          <Field label="Code" hint="Short name such as STEM or TVL-ICT">{(id) => <Input id={id} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}</Field>
          <Field label="Full name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Track" hint="Decides the grading weights of applied and specialized subjects">{(id) => <Select id={id} value={f.track} onChange={(e) => setF({ ...f, track: e.target.value as Track })}>{TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}</Select>}</Field>
          <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Active (new sections can use it)" />
          {error ? <Alert tone="bad">{error}</Alert> : null}
        </div>
      </Modal>
      <ConfirmDialog open={confirm} danger title="Delete strand?" confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirm(false)}>A strand that has sections cannot be deleted; deactivate it instead.</ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------ weights

function WeightsTab() {
  const q = useQuery({ queryKey: ['weights'], queryFn: () => get<WeightProfile[]>('/weight-profiles') });
  const toast = useToast();
  const recompute = useMutation({
    mutationFn: () => post<{ recomputed: number; lockedSkipped: number }>('/admin/recompute'),
    onSuccess: (r) => toast.ok(`${r.recomputed} open class records recomputed. ${r.lockedSkipped} approved records were left untouched.`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warn" title="Change these only when DepEd changes the rules">
        The percentages come from DepEd Order No. 8, s. 2015. After changing them, recompute so open class records use the new weights. Approved (locked) records keep the weights they were approved with.
      </Alert>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((p) => <WeightCard key={p.id} p={p} />)}
        </div>
      )}
      <div><Button loading={recompute.isPending} onClick={() => recompute.mutate()}>Recompute open class records</Button></div>
    </div>
  );
}

function WeightCard({ p }: { p: WeightProfile }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ ww: String(p.ww), pt: String(p.pt), qa: String(p.qa) });
  const sum = Number(v.ww) + Number(v.pt) + Number(v.qa);
  const dirty = Number(v.ww) !== p.ww || Number(v.pt) !== p.pt || Number(v.qa) !== p.qa;
  const save = useMutation({
    mutationFn: () => put(`/weight-profiles/${p.id}`, { ww: Number(v.ww), pt: Number(v.pt), qa: Number(v.qa) }),
    onSuccess: () => { toast.ok('Weights saved. Recompute to apply them to open records.'); void qc.invalidateQueries({ queryKey: ['weights'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const field = (label: string, k: 'ww' | 'pt' | 'qa') => (
    <Field label={label}>{(id) => <Input id={id} inputMode="decimal" className="text-center" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(',', '.') })} />}</Field>
  );
  return (
    <Card>
      <CardTitle sub={p.code}>{p.name}</CardTitle>
      <div className="grid grid-cols-3 gap-3">
        {field('Written Work %', 'ww')}
        {field('Performance %', 'pt')}
        {field('Quarterly %', 'qa')}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={sum === 100 ? 'text-sm text-ok' : 'text-sm text-bad'}>Total {sum}% {sum === 100 ? '' : '(must be 100)'}</span>
        <Button size="sm" variant="primary" disabled={!dirty || sum !== 100} loading={save.isPending} icon={<Save className="size-3.5" />} onClick={() => save.mutate()}>Save</Button>
      </div>
    </Card>
  );
}
