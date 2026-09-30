import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, GraduationCap, Plus, Search, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { YearSelect, sectionLabel, useSections, useYearChoice } from '../components/bits';
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, TableWrap, Textarea, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { get, post, put, qs } from '../lib/api';
import { LEARNER_CSV_TEMPLATE, learnersFromCsv, parseCsv, saveCsv, type ImportRow } from '../lib/csv';
import { titleCase } from '../lib/format';
import type { Learner, LearnerListItem } from '../lib/types';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'brand'> = { ACTIVE: 'ok', TRANSFERRED_OUT: 'warn', DROPPED_OUT: 'bad', GRADUATED: 'brand' };

export default function LearnersPage() {
  const navigate = useNavigate();
  const { yearId, setYearId } = useYearChoice();
  const sections = useSections(yearId);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('');
  const [unenrolled, setUnenrolled] = useState(false);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(term);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const q = useQuery({
    queryKey: ['learners', debounced, sectionId, status, unenrolled, page, yearId],
    queryFn: () => get<{ total: number; page: number; pageSize: number; items: LearnerListItem[] }>(`/learners${qs({ q: debounced, sectionId, status, page, pageSize: 50, schoolYearId: yearId, unenrolled: unenrolled || undefined })}`),
    placeholderData: (p) => p,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Learners"
        sub={q.data ? `${q.data.total} learner${q.data.total === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <Button icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>
              Import list
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add learner
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted" aria-hidden />
          <Input aria-label="Search learners" className="pl-9" placeholder="Search name or LRN" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <YearSelect value={yearId} onChange={(id) => { setYearId(id); setSectionId(''); setPage(1); }} />
        <Select aria-label="Section" className="w-auto" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setUnenrolled(false); setPage(1); }}>
          <option value="">All sections</option>
          {sections.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {sectionLabel(s)}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="TRANSFERRED_OUT">Transferred out</option>
          <option value="DROPPED_OUT">Dropped out</option>
          <option value="GRADUATED">Graduated</option>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={unenrolled} onChange={(e) => { setUnenrolled(e.target.checked); setSectionId(''); setPage(1); }} />
          Not yet enrolled this year
        </label>
      </div>

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : q.data.items.length === 0 ? (
        <Card>
          <Empty title="No learners found" icon={<GraduationCap className="size-8" />} action={<Button variant="primary" onClick={() => setImporting(true)}>Import a class list</Button>}>
            Add learners one by one, or import a spreadsheet saved as CSV.
          </Empty>
        </Card>
      ) : (
        <>
          <TableWrap>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>LRN</th>
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Sex</th>
                  <th className={thCls}>This year</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((l) => (
                  <tr key={l.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => navigate(`/learners/${l.id}`)}>
                    <td className={tdCls + ' tnum'}>{l.lrn}</td>
                    <td className={tdCls}>
                      <Link to={`/learners/${l.id}`} className="font-medium hover:text-brand" onClick={(e) => e.stopPropagation()}>
                        {l.lastName}, {l.firstName} {l.middleName ?? ''} {l.extName ?? ''}
                      </Link>
                      {l.hasAccount ? <UserCheck className="ml-2 inline size-3.5 text-ok" aria-label="Has a portal account" /> : null}
                    </td>
                    <td className={tdCls}>{l.sex}</td>
                    <td className={tdCls}>{l.latest ? `${l.latest.schoolYear}: Grade ${l.latest.gradeLevel} - ${l.latest.section} (${l.latest.strand})` : <span className="text-muted">never enrolled</span>}</td>
                    <td className={tdCls}>
                      <Badge tone={STATUS_TONE[l.status] ?? 'neutral'}>{titleCase(l.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-muted">Page {page} of {pages}</span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          ) : null}
        </>
      )}

      {adding ? <LearnerFormModal onClose={() => setAdding(false)} onSaved={(l) => { setAdding(false); navigate(`/learners/${l.id}`); }} /> : null}
      {importing ? <ImportModal onClose={() => setImporting(false)} /> : null}
    </>
  );
}

// ------------------------------------------------------------------ add / edit form

interface FormState {
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string;
  extName: string;
  sex: 'M' | 'F';
  birthDate: string;
  birthPlace: string;
  address: string;
  religion: string;
  motherTongue: string;
  ipGroup: string;
  guardianName: string;
  guardianRelation: string;
  guardianContact: string;
  previousSchool: string;
  status: string;
}

const blank: FormState = { lrn: '', lastName: '', firstName: '', middleName: '', extName: '', sex: 'M', birthDate: '', birthPlace: '', address: '', religion: '', motherTongue: '', ipGroup: '', guardianName: '', guardianRelation: '', guardianContact: '', previousSchool: '', status: 'ACTIVE' };

export function LearnerFormModal({ learner, onClose, onSaved }: { learner?: Learner; onClose: () => void; onSaved: (l: Learner) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<FormState>(() => (learner ? { ...blank, ...Object.fromEntries(Object.entries(learner).map(([k, v]) => [k, v ?? ''])) } as FormState : blank));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: () => (learner ? put<Learner>(`/learners/${learner.id}`, f) : post<Learner>('/learners', f)),
    onSuccess: (l) => {
      toast.ok(learner ? 'Learner updated.' : 'Learner added.');
      void qc.invalidateQueries({ queryKey: ['learners'] });
      void qc.invalidateQueries({ queryKey: ['learner'] });
      onSaved(l);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const text = (label: string, k: keyof FormState, extra: { required?: boolean; hint?: string; inputMode?: 'numeric' | 'tel'; maxLength?: number; className?: string } = {}): ReactNode => (
    <Field label={label} hint={extra.hint} className={extra.className}>
      {(id) => <Input id={id} value={f[k]} required={extra.required} inputMode={extra.inputMode} maxLength={extra.maxLength} onChange={(e) => set(k, e.target.value as never)} />}
    </Field>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={learner ? 'Edit learner' : 'Add learner'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => (document.getElementById('learner-form') as HTMLFormElement | null)?.requestSubmit()}>
            {learner ? 'Save changes' : 'Add learner'}
          </Button>
        </>
      }
    >
      <form id="learner-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
        {text('LRN (12 digits)', 'lrn', { required: true, inputMode: 'numeric', maxLength: 12, className: 'sm:col-span-2' })}
        {text('Last name', 'lastName', { required: true })}
        {text('First name', 'firstName', { required: true })}
        {text('Middle name', 'middleName')}
        {text('Name extension', 'extName', { hint: 'Jr., III, ...' })}
        <Field label="Sex">
          {(id) => (
            <Select id={id} value={f.sex} onChange={(e) => set('sex', e.target.value as 'M' | 'F')}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </Select>
          )}
        </Field>
        <Field label="Date of birth">{(id) => <Input id={id} type="date" value={f.birthDate} required onChange={(e) => set('birthDate', e.target.value)} />}</Field>
        {text('Place of birth', 'birthPlace')}
        {text('Address', 'address')}
        {text('Religion', 'religion')}
        {text('Mother tongue', 'motherTongue')}
        {text('Indigenous group (if any)', 'ipGroup')}
        {text('Previous school', 'previousSchool')}
        {text('Parent / guardian', 'guardianName')}
        {text('Relationship', 'guardianRelation')}
        {text('Contact number', 'guardianContact', { inputMode: 'tel' })}
        {learner ? (
          <Field label="Status">
            {(id) => (
              <Select id={id} value={f.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="TRANSFERRED_OUT">Transferred out</option>
                <option value="DROPPED_OUT">Dropped out</option>
                <option value="GRADUATED">Graduated</option>
              </Select>
            )}
          </Field>
        ) : null}
        {error ? (
          <div className="sm:col-span-2">
            <Alert tone="bad">{error}</Alert>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ CSV import

interface ImportResult {
  received: number;
  created: number;
  skipped: Array<{ row: number; lrn: string; reason: string }>;
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { yearId } = useYearChoice();
  const sections = useSections(yearId);
  const [text, setText] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? learnersFromCsv(parseCsv(text)) : null), [text]);
  const run = useMutation({
    mutationFn: () => post<ImportResult>('/learners/import', { rows: parsed!.rows as ImportRow[], sectionId: sectionId ? Number(sectionId) : undefined }),
    onSuccess: (r) => {
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['learners'] });
      void qc.invalidateQueries({ queryKey: ['sections'] });
      void qc.invalidateQueries({ queryKey: ['section'] });
      toast.ok(`${r.created} new learner${r.created === 1 ? '' : 's'} added.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Import a class list"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!parsed || parsed.missing.length > 0 || parsed.rows.length === 0} loading={run.isPending} onClick={() => run.mutate()}>
              Import {parsed?.rows.length ? `${parsed.rows.length} rows` : ''}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <Alert tone="ok" title={`${result.created} of ${result.received} rows imported`} />
          {result.skipped.length ? (
            <div>
              <p className="mb-1 text-sm font-medium">{result.skipped.length} rows skipped</p>
              <TableWrap>
                <table className={tableCls}>
                  <thead>
                    <tr><th className={thCls}>Row</th><th className={thCls}>LRN</th><th className={thCls}>Why</th></tr>
                  </thead>
                  <tbody>
                    {result.skipped.map((s) => (
                      <tr key={s.row}><td className={tdCls}>{s.row}</td><td className={tdCls}>{s.lrn}</td><td className={tdCls}>{s.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Save your spreadsheet as CSV (Excel: File, Save As, CSV) and choose it here. The first row must have headings: <b>LRN, Last Name, First Name, Sex, Birthdate</b> (Middle Name, Address, Guardian and Contact No are optional). Learners whose LRN already exists are not duplicated.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
                e.target.value = '';
              }}
            />
            <Button icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <Button icon={<Download className="size-4" />} onClick={() => void saveCsv('learner-import-template.csv', LEARNER_CSV_TEMPLATE)}>Download template</Button>
          </div>
          <Field label="Or paste the rows here">{(id) => <Textarea id={id} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="LRN,Last Name,First Name,Sex,Birthdate" className="font-mono text-xs" />}</Field>
          <Field label="Also enroll them in this section (optional)">
            {(id) => (
              <Select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Do not enroll yet</option>
                {sections.data?.map((s) => (
                  <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
                ))}
              </Select>
            )}
          </Field>
          {parsed ? (
            parsed.missing.length ? (
              <Alert tone="bad" title="Some columns are missing">Add these headings: {parsed.missing.join(', ')}.</Alert>
            ) : (
              <div>
                <p className="mb-1 text-sm font-medium">{parsed.rows.length} rows found. Preview:</p>
                <TableWrap>
                  <table className={tableCls}>
                    <thead>
                      <tr><th className={thCls}>LRN</th><th className={thCls}>Name</th><th className={thCls}>Sex</th><th className={thCls}>Birthdate</th></tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 5).map((r, i) => (
                        <tr key={i}><td className={tdCls}>{r.lrn}</td><td className={tdCls}>{r.lastName}, {r.firstName} {r.middleName}</td><td className={tdCls}>{r.sex}</td><td className={tdCls}>{r.birthDate}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            )
          ) : null}
        </div>
      )}
    </Modal>
  );
}
