import { HONORS_LABEL, MONTH_NAME, OBSERVED_VALUES, SCHOOL_MONTHS, VALUE_MARKINGS, VALUE_MARKING_LABEL, formatLearnerName, quartersOfSemester } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Download, FileText, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { GradeChip, QuarterPicker, SemesterPicker, sectionLabel } from '../components/bits';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, StatusBadge, TableWrap, Tabs, cx, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { downloadReport, get, put, qs } from '../lib/api';
import { useSession } from '../lib/auth';
import { shortName } from '../lib/format';
import type { Card as GradeCard, SummaryPayload } from '../lib/types';

type Tab = 'summary' | 'attendance' | 'values' | 'remedial' | 'cards';

export default function AdvisoryPage() {
  const { id } = useParams();
  const sectionId = Number(id);
  const [tab, setTab] = useState<Tab>('summary');
  const [semester, setSemester] = useState(1);
  const sec = useQuery({ queryKey: ['section', sectionId], queryFn: () => get<{ id: number; name: string; gradeLevel: number; strand: { code: string; name: string }; adviser: { fullName: string } | null; schoolYear: { id: number; name: string }; learners: unknown[] }>(`/sections/${sectionId}`) });

  if (sec.isPending) return <Spinner />;
  if (sec.isError) return <Alert tone="bad">{errorMessage(sec.error)}</Alert>;
  const s = sec.data;

  return (
    <>
      <PageHeader title={`Advisory: ${sectionLabel({ gradeLevel: s.gradeLevel, name: s.name, strand: s.strand })}`} sub={`SY ${s.schoolYear.name} · ${s.learners.length} learners · Adviser: ${s.adviser?.fullName ?? 'none'}`} />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Grades' },
          { id: 'attendance', label: 'Attendance' },
          { id: 'values', label: 'Observed values' },
          { id: 'remedial', label: 'Remedial' },
          { id: 'cards', label: 'Report cards' },
        ]}
      />
      {tab === 'summary' ? <SummaryTab sectionId={sectionId} semester={semester} setSemester={setSemester} /> : null}
      {tab === 'attendance' ? <AttendanceTab sectionId={sectionId} /> : null}
      {tab === 'values' ? <ValuesTab sectionId={sectionId} /> : null}
      {tab === 'remedial' ? <RemedialTab sectionId={sectionId} semester={semester} setSemester={setSemester} /> : null}
      {tab === 'cards' ? <CardsTab sectionId={sectionId} semester={semester} setSemester={setSemester} /> : null}
    </>
  );
}

// ------------------------------------------------------------------ grades summary

function SummaryTab({ sectionId, semester, setSemester }: { sectionId: number; semester: number; setSemester: (s: number) => void }) {
  const [drafts, setDrafts] = useState(true);
  const [metric, setMetric] = useState<'q1' | 'q2' | 'final'>('final');
  const [open, setOpen] = useState<number | null>(null);
  const toast = useToast();
  const q = useQuery({ queryKey: ['summary', sectionId, semester, drafts], queryFn: () => get<SummaryPayload>(`/sections/${sectionId}/summary${qs({ semester, visibility: drafts ? 'all' : 'approved' })}`) });
  const [qa, qb] = quartersOfSemester(semester);

  const pendingClasses = useMemo(() => (q.data?.subjects ?? []).filter((s) => s.statuses.some((x) => x.status !== 'APPROVED')), [q.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SemesterPicker value={semester} onChange={setSemester} />
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { id: 'q1', label: `Q${qa}` },
            { id: 'q2', label: `Q${qb}` },
            { id: 'final', label: 'Final' },
          ]}
        />
        <Checkbox checked={drafts} onChange={(e) => setDrafts(e.target.checked)} label="Include grades not approved yet" />
        <div className="ml-auto flex gap-2">
          <Button icon={<Download className="size-4" />} onClick={() => downloadReport(`/reports/section-summary${qs({ sectionId, semester, draft: drafts ? 1 : undefined })}`, `Summary_Sem${semester}.xlsx`).catch((e) => toast.error(errorMessage(e)))}>
            Excel
          </Button>
        </div>
      </div>

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : q.data.learners.length === 0 ? (
        <Card>
          <Empty title="No learners in this section yet">The registrar enrolls learners into sections.</Empty>
        </Card>
      ) : (
        <>
          {pendingClasses.length ? (
            <Alert tone="info" title={`${pendingClasses.length} subject${pendingClasses.length === 1 ? ' is' : 's are'} not fully approved for this semester`}>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {pendingClasses.map((s) => (
                  <span key={s.classId} className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs text-ink">
                    {s.name}
                    {s.statuses.map((x) => (
                      <StatusBadge key={x.quarter} status={x.status} />
                    ))}
                  </span>
                ))}
              </div>
            </Alert>
          ) : null}

          <div className="grid-wrap" style={{ maxHeight: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th className="stick-l" style={{ textAlign: 'left', paddingLeft: 12, minWidth: 220, top: 0 }}>Learner</th>
                  {q.data.subjects.map((s) => (
                    <th key={s.classId} title={s.name} style={{ top: 0, height: 150, minWidth: 40, verticalAlign: 'bottom', padding: '6px 4px' }}>
                      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'inline-block', maxHeight: 138, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>{s.name}</span>
                    </th>
                  ))}
                  <th style={{ top: 0, minWidth: 64 }}>{metric === 'final' ? 'General Average' : `Q${metric === 'q1' ? qa : qb} Average`}</th>
                  <th style={{ top: 0, minWidth: 76 }}>Remarks</th>
                  <th style={{ top: 0, minWidth: 130 }}>Honors</th>
                </tr>
              </thead>
              <tbody>
                {q.data.learners.map((l) => (
                  <tr key={l.enrollmentId} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setOpen(l.enrollmentId)}>
                    <td className="stick-l" style={{ paddingLeft: 12, height: 36 }}>
                      <span className="font-medium">{shortName(l.learner)}</span>
                    </td>
                    {q.data.subjects.map((s) => {
                      const g = l.grades[s.subjectId];
                      return (
                        <td key={s.classId} className="tnum" style={{ textAlign: 'center' }} title={`Q${qa}: ${g?.q1 ?? '-'}   Q${qb}: ${g?.q2 ?? '-'}   Final: ${g?.final ?? '-'}`}>
                          <GradeChip value={g?.[metric]} passing={q.data.passing} />
                        </td>
                      );
                    })}
                    <td className="tnum" style={{ textAlign: 'center', fontWeight: 700, background: 'var(--surface-2)' }}>
                      <GradeChip value={metric === 'final' ? l.generalAverage : quarterAverage(l.grades, q.data.subjects, metric)} passing={q.data.passing} />
                    </td>
                    <td style={{ textAlign: 'center', padding: '0 8px' }}>
                      {metric !== 'final' ? null : l.remark === 'PASSED' ? <Badge tone="ok">Passed</Badge> : l.remark === 'FAILED' ? <Badge tone="bad">Failed</Badge> : <Badge>Incomplete</Badge>}
                    </td>
                    <td style={{ padding: '0 8px' }}>{metric === 'final' && l.honors ? <Badge tone="brand"><Award className="size-3" />{HONORS_LABEL[l.honors]}</Badge> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Final grade of each subject = average of the two quarterly grades. Hover a grade to see both quarters. Click a learner for the report card.</p>
          {open ? <CardModal enrollmentId={open} semester={semester} draft={drafts} onClose={() => setOpen(null)} /> : null}
        </>
      )}
    </div>
  );
}

/** Average of one quarter across subjects, whole number; blank until every subject has a grade. */
function quarterAverage(grades: SummaryPayload['learners'][number]['grades'], subjects: SummaryPayload['subjects'], which: 'q1' | 'q2'): number | null {
  const vals = subjects.map((s) => grades[s.subjectId]?.[which] ?? null);
  if (!vals.length || vals.some((v) => v == null)) return null;
  return Math.floor((vals as number[]).reduce((a, b) => a + b, 0) / vals.length + 0.5);
}

export function CardModal({ enrollmentId, semester, draft, onClose }: { enrollmentId: number; semester: number; draft: boolean; onClose: () => void }) {
  const toast = useToast();
  const { school } = useSession();
  const q = useQuery({ queryKey: ['card', enrollmentId, semester, draft], queryFn: () => get<GradeCard>(`/enrollments/${enrollmentId}/card${qs({ semester, visibility: draft ? 'all' : 'approved' })}`) });
  const c = q.data;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={c ? formatLearnerName(c.learner) : 'Report card'}
      footer={
        c ? (
          <>
            <Button icon={<FileText className="size-4" />} onClick={() => downloadReport(`/reports/sf9${qs({ enrollmentId, semester })}`, `SF9_${c.learner.lastName}_Sem${semester}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
              SF9 (approved grades)
            </Button>
            <Button variant="soft" onClick={() => downloadReport(`/reports/sf9${qs({ enrollmentId, semester, draft: 1 })}`, `SF9_DRAFT_${c.learner.lastName}_Sem${semester}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
              Draft copy
            </Button>
          </>
        ) : undefined
      }
    >
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            LRN {c!.learner.lrn} · Grade {c!.section.gradeLevel} - {c!.section.name} · {c!.section.strandCode} · {semester === 1 ? '1st' : '2nd'} semester
          </p>
          <TableWrap>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Subject</th>
                  <th className={thCls + ' text-center'}>Q{c!.quarters[0]}</th>
                  <th className={thCls + ' text-center'}>Q{c!.quarters[1]}</th>
                  <th className={thCls + ' text-center'}>Final</th>
                  <th className={thCls}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {c!.subjects.map((s) => (
                  <tr key={s.classId}>
                    <td className={tdCls}>{s.name}</td>
                    <td className={tdCls + ' text-center'}><GradeChip value={s.quarters[0]!.grade} passing={school.passingGrade} /></td>
                    <td className={tdCls + ' text-center'}><GradeChip value={s.quarters[1]!.grade} passing={school.passingGrade} /></td>
                    <td className={tdCls + ' text-center'}><GradeChip value={s.finalGrade} passing={school.passingGrade} /></td>
                    <td className={tdCls}>{s.remark === 'INCOMPLETE' ? '' : s.remark === 'PASSED' ? 'Passed' : 'Failed'}</td>
                  </tr>
                ))}
                <tr className="bg-surface-2 font-semibold">
                  <td className={tdCls} colSpan={3}>General average for the semester</td>
                  <td className={tdCls + ' text-center'}><GradeChip value={c!.generalAverage} passing={school.passingGrade} /></td>
                  <td className={tdCls}>{c!.honors ? HONORS_LABEL[c!.honors] : ''}</td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ attendance

interface AttendanceData {
  month: number;
  year: number;
  schoolDays: number | null;
  learners: Array<{ enrollmentId: number; status: string; id: number; lrn: string; lastName: string; firstName: string; middleName: string | null; sex: string; daysPresent: number | null; timesTardy: number | null }>;
}

function AttendanceTab({ sectionId }: { sectionId: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => {
    const m = new Date().getMonth() + 1;
    return (SCHOOL_MONTHS as readonly number[]).includes(m) ? m : 6;
  });
  const q = useQuery({ queryKey: ['attendance', sectionId, month], queryFn: () => get<AttendanceData>(`/sections/${sectionId}/attendance?month=${month}`) });
  const [days, setDays] = useState('');
  const [rows, setRows] = useState<Record<number, { present: string; tardy: string }>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setDays(q.data.schoolDays == null ? '' : String(q.data.schoolDays));
    setRows(Object.fromEntries(q.data.learners.map((l) => [l.enrollmentId, { present: l.daysPresent == null ? '' : String(l.daysPresent), tardy: l.timesTardy == null ? '' : String(l.timesTardy) }])));
    setDirty(false);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const entries = Object.entries(rows)
        .filter(([, v]) => v.present !== '')
        .map(([id, v]) => ({ enrollmentId: Number(id), daysPresent: Number(v.present), timesTardy: Number(v.tardy || 0) }));
      return put(`/sections/${sectionId}/attendance`, { month, schoolDays: days === '' ? undefined : Number(days), entries });
    },
    onSuccess: () => {
      toast.ok('Attendance saved.');
      void qc.invalidateQueries({ queryKey: ['attendance', sectionId] });
      void qc.invalidateQueries({ queryKey: ['card'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setRow = (id: number, patch: Partial<{ present: string; tardy: string }>) => {
    setRows((r) => ({ ...r, [id]: { present: '', tardy: '', ...r[id], ...patch } }));
    setDirty(true);
  };
  const fillAll = () => {
    if (days === '') return toast.error('Enter the number of school days first.');
    setRows(Object.fromEntries((q.data?.learners ?? []).map((l) => [l.enrollmentId, { present: days, tardy: rows[l.enrollmentId]?.tardy ?? '0' }])));
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Month">
          {(id) => (
            <Select id={id} className="w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {SCHOOL_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {MONTH_NAME[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="School days this month">
          {(id) => <Input id={id} className="w-28" inputMode="numeric" value={days} onChange={(e) => { setDays(e.target.value.replace(/\D/g, '')); setDirty(true); }} />}
        </Field>
        <Button onClick={fillAll}>Everyone present</Button>
        <Button variant="primary" className="ml-auto" disabled={!dirty} loading={save.isPending} icon={<Save className="size-4" />} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Learner</th>
                <th className={thCls + ' text-center'}>Days present</th>
                <th className={thCls + ' text-center'}>Days absent</th>
                <th className={thCls + ' text-center'}>Times tardy</th>
              </tr>
            </thead>
            <tbody>
              {q.data.learners.map((l) => {
                const r = rows[l.enrollmentId] ?? { present: '', tardy: '' };
                const absent = days !== '' && r.present !== '' ? Math.max(0, Number(days) - Number(r.present)) : '';
                const over = days !== '' && r.present !== '' && Number(r.present) > Number(days);
                return (
                  <tr key={l.enrollmentId}>
                    <td className={tdCls}>{shortName(l)}</td>
                    <td className={tdCls + ' text-center'}>
                      <Input aria-label={`Days present, ${shortName(l)}`} className={cx('mx-auto h-9 w-20 text-center', over && 'border-bad')} inputMode="numeric" value={r.present} onChange={(e) => setRow(l.enrollmentId, { present: e.target.value.replace(/\D/g, '') })} />
                    </td>
                    <td className={tdCls + ' text-center tnum'}>{absent}</td>
                    <td className={tdCls + ' text-center'}>
                      <Input aria-label={`Times tardy, ${shortName(l)}`} className="mx-auto h-9 w-20 text-center" inputMode="numeric" value={r.tardy} onChange={(e) => setRow(l.enrollmentId, { tardy: e.target.value.replace(/\D/g, '') })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ observed values

interface ValuesData {
  quarter: number;
  learners: Array<{ enrollmentId: number; status: string; id: number; lrn: string; lastName: string; firstName: string; middleName: string | null; sex: string; marks: Record<string, string> }>;
}

function ValuesTab({ sectionId }: { sectionId: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [quarter, setQuarter] = useState(1);
  const q = useQuery({ queryKey: ['values', sectionId, quarter], queryFn: () => get<ValuesData>(`/sections/${sectionId}/values?quarter=${quarter}`) });
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!q.data) return;
    const m: Record<string, string> = {};
    for (const l of q.data.learners) for (const [k, v] of Object.entries(l.marks)) m[`${l.enrollmentId}:${k}`] = v;
    setMarks(m);
    setChanged(new Set());
  }, [q.data]);

  const set = (enrollmentId: number, key: string, v: string) => {
    setMarks((m) => ({ ...m, [`${enrollmentId}:${key}`]: v }));
    setChanged((c) => new Set(c).add(`${enrollmentId}:${key}`));
  };
  const fillAll = (v: string) => {
    if (!q.data) return;
    const m = { ...marks };
    const c = new Set(changed);
    for (const l of q.data.learners) for (const s of OBSERVED_VALUES) {
      m[`${l.enrollmentId}:${s.key}`] = v;
      c.add(`${l.enrollmentId}:${s.key}`);
    }
    setMarks(m);
    setChanged(c);
  };

  const save = useMutation({
    mutationFn: () =>
      put(`/sections/${sectionId}/values`, {
        quarter,
        entries: [...changed].map((k) => {
          const [enrollmentId, valueKey] = k.split(':') as [string, string];
          return { enrollmentId: Number(enrollmentId), valueKey, marking: marks[k] || null };
        }),
      }),
    onSuccess: () => {
      toast.ok('Observed values saved.');
      void qc.invalidateQueries({ queryKey: ['values', sectionId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <QuarterPicker value={quarter} onChange={setQuarter} />
        <Button onClick={() => fillAll('AO')}>Set everyone to AO</Button>
        <Button variant="primary" className="ml-auto" disabled={changed.size === 0} loading={save.isPending} icon={<Save className="size-4" />} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted">{VALUE_MARKINGS.map((m) => `${m} = ${VALUE_MARKING_LABEL[m]}`).join('   ')}</p>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : (
        <div className="grid-wrap" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr>
                <th className="stick-l" style={{ textAlign: 'left', paddingLeft: 12, minWidth: 220, top: 0 }}>Learner</th>
                {OBSERVED_VALUES.map((s) => (
                  <th key={s.key} title={`${s.coreValue}: ${s.statement}`} style={{ top: 0, minWidth: 84, padding: '6px 4px' }}>
                    <span className="block text-[11px] font-semibold">{s.coreValue}</span>
                    <span className="block text-[11px] font-normal text-muted">{s.key}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data.learners.map((l) => (
                <tr key={l.enrollmentId}>
                  <td className="stick-l" style={{ paddingLeft: 12, height: 40 }}>{shortName(l)}</td>
                  {OBSERVED_VALUES.map((s) => (
                    <td key={s.key} style={{ padding: 3 }}>
                      <select aria-label={`${shortName(l)}, ${s.coreValue} ${s.key}`} className="h-8 w-full rounded-md border border-line bg-surface px-1 text-center text-[13px]" value={marks[`${l.enrollmentId}:${s.key}`] ?? ''} onChange={(e) => set(l.enrollmentId, s.key, e.target.value)}>
                        <option value="">-</option>
                        {VALUE_MARKINGS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink">What do the columns mean?</summary>
        <ul className="mt-2 list-disc pl-5">
          {OBSERVED_VALUES.map((s) => (
            <li key={s.key}>
              <b>{s.key}</b> ({s.coreValue}): {s.statement}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ remedial

interface RemedialData {
  semester: number;
  passing: number;
  items: Array<{ enrollmentId: number; learner: { lastName: string; firstName: string; middleName: string | null }; subjectId: number; subject: string; finalGrade: number; mark: number | null; dateFrom: string | null; dateTo: string | null; recomputed: number | null }>;
}

function RemedialTab({ sectionId, semester, setSemester }: { sectionId: number; semester: number; setSemester: (s: number) => void }) {
  const q = useQuery({ queryKey: ['remedial', sectionId, semester], queryFn: () => get<RemedialData>(`/sections/${sectionId}/remedial?semester=${semester}`) });
  return (
    <div className="flex flex-col gap-4">
      <SemesterPicker value={semester} onChange={setSemester} />
      <p className="text-sm text-muted">Subjects with an approved final grade below the passing grade. Record the remedial class mark here; the recomputed final grade is the average of the final grade and the remedial mark (DO 8, s. 2015).</p>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : q.data.items.length === 0 ? (
        <Card>
          <Empty title="Nobody needs remedial classes">No approved final grade is below {q.data.passing}.</Empty>
        </Card>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Learner</th>
                <th className={thCls}>Subject</th>
                <th className={thCls + ' text-center'}>Final</th>
                <th className={thCls}>Remedial mark</th>
                <th className={thCls}>From</th>
                <th className={thCls}>To</th>
                <th className={thCls + ' text-center'}>Recomputed</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((r) => (
                <RemedialRow key={`${r.enrollmentId}:${r.subjectId}`} row={r} semester={semester} passing={q.data.passing} sectionId={sectionId} />
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

function RemedialRow({ row, semester, passing, sectionId }: { row: RemedialData['items'][number]; semester: number; passing: number; sectionId: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [mark, setMark] = useState(row.mark == null ? '' : String(row.mark));
  const [from, setFrom] = useState(row.dateFrom ?? '');
  const [to, setTo] = useState(row.dateTo ?? '');
  const save = useMutation({
    mutationFn: () => put(`/enrollments/${row.enrollmentId}/remedial`, { subjectId: row.subjectId, semester, mark: mark === '' ? null : Number(mark), dateFrom: from || null, dateTo: to || null }),
    onSuccess: () => {
      toast.ok('Saved.');
      void qc.invalidateQueries({ queryKey: ['remedial', sectionId] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <tr>
      <td className={tdCls}>{shortName(row.learner)}</td>
      <td className={tdCls}>{row.subject}</td>
      <td className={tdCls + ' text-center font-semibold text-bad tnum'}>{row.finalGrade}</td>
      <td className={tdCls}><Input aria-label="Remedial mark" className="h-9 w-20" inputMode="numeric" value={mark} onChange={(e) => setMark(e.target.value.replace(/\D/g, ''))} /></td>
      <td className={tdCls}><Input aria-label="Remedial from" className="h-9" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></td>
      <td className={tdCls}><Input aria-label="Remedial to" className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></td>
      <td className={tdCls + ' text-center tnum'}>{row.recomputed != null ? <span className={row.recomputed >= passing ? 'font-semibold text-ok' : 'font-semibold text-bad'}>{row.recomputed}</span> : ''}</td>
      <td className={tdCls}><Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></td>
    </tr>
  );
}

// ------------------------------------------------------------------ report cards

function CardsTab({ sectionId, semester, setSemester }: { sectionId: number; semester: number; setSemester: (s: number) => void }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['summary', sectionId, semester, 'cards'], queryFn: () => get<SummaryPayload>(`/sections/${sectionId}/summary${qs({ semester, visibility: 'approved' })}`) });
  const fail = (e: unknown) => toast.error(errorMessage(e));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SemesterPicker value={semester} onChange={setSemester} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="primary" icon={<FileText className="size-4" />} onClick={() => downloadReport(`/reports/sf9-section${qs({ sectionId, semester })}`, `SF9_Section_Sem${semester}.pdf`).catch(fail)}>
            All report cards (PDF)
          </Button>
          <Button onClick={() => downloadReport(`/reports/sf9-section${qs({ sectionId, semester, draft: 1 })}`, `SF9_Section_DRAFT_Sem${semester}.pdf`).catch(fail)}>Draft copies</Button>
          <Button icon={<Download className="size-4" />} onClick={() => downloadReport(`/reports/masterlist${qs({ sectionId })}`, 'Masterlist.xlsx').catch(fail)}>
            Master list
          </Button>
        </div>
      </div>
      <Alert tone="info">Official report cards print approved grades only. A draft copy shows every grade computed so far and is watermarked &quot;DRAFT - NOT OFFICIAL&quot;.</Alert>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Learner</th>
                <th className={thCls + ' text-center'}>General average</th>
                <th className={thCls}>Report card</th>
              </tr>
            </thead>
            <tbody>
              {q.data.learners.map((l) => (
                <tr key={l.enrollmentId}>
                  <td className={tdCls}>{shortName(l.learner)}</td>
                  <td className={tdCls + ' text-center'}><GradeChip value={l.generalAverage} passing={q.data.passing} /></td>
                  <td className={tdCls}>
                    <Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => downloadReport(`/reports/sf9${qs({ enrollmentId: l.enrollmentId, semester })}`, `SF9_${l.learner.lastName}.pdf`).catch(fail)}>
                      SF9
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
