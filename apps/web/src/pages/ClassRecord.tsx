import { COMPONENT_LABEL, computeQuarter, quartersOfSemester, type Component, type ItemScore } from '@bnhs/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Copy, Download, LayoutGrid, Loader2, Plus, RotateCcw, Send, ShieldCheck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { GradeChip, QuarterPicker } from '../components/bits';
import { Alert, Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, StatusBadge, Textarea, cx, errorMessage, useToast } from '../components/ui';
import { del, downloadReport, get, post, put, qs } from '../lib/api';
import { isOfficeRole, useSession } from '../lib/auth';
import { dateLabel, num, shortName } from '../lib/format';
import type { RecordItem, RecordLearner, RecordPayload } from '../lib/types';

// ------------------------------------------------------------------ cell parsing

type Cell = { kind: 'blank' } | { kind: 'excused' } | { kind: 'score'; value: number } | { kind: 'invalid'; reason: string };

function parseCell(text: string, hps: number): Cell {
  const t = text.trim();
  if (t === '') return { kind: 'blank' };
  if (/^(ex|x|exc|excused)$/i.test(t)) return { kind: 'excused' };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return { kind: 'invalid', reason: 'Type a number, or EX if excused' };
  if (n > hps) return { kind: 'invalid', reason: `More than the highest possible score (${hps})` };
  return { kind: 'score', value: n };
}

const serverText = (s: { score: number | null; excused: boolean } | undefined): string => (s?.excused ? 'EX' : s?.score == null ? '' : String(s.score));
const keyOf = (itemId: number, enrollmentId: number) => `${itemId}:${enrollmentId}`;

const COMPS: Component[] = ['WW', 'PT', 'QA'];
const ADD_LABEL: Record<Component, string> = { WW: 'Written Work', PT: 'Performance Task', QA: 'Quarterly Assessment' };

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

// ------------------------------------------------------------------ page shell

export default function ClassRecordPage() {
  const { id } = useParams();
  const classId = Number(id);
  const [params, setParams] = useSearchParams();
  const quarter = Number(params.get('quarter') ?? 1);
  const q = useQuery({
    queryKey: ['record', classId, quarter],
    queryFn: () => get<RecordPayload>(`/classes/${classId}/record?quarter=${quarter}`),
    placeholderData: (prev) => prev,
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) {
    return (
      <>
        <PageHeader title="Class record" />
        <Alert tone="bad">{errorMessage(q.error)}</Alert>
        <Link to="/classes" className="mt-3 inline-block text-sm font-medium text-brand">
          Back to classes
        </Link>
      </>
    );
  }
  return <RecordEditor key={`${classId}:${quarter}`} data={q.data} setQuarter={(n) => setParams({ quarter: String(n) }, { replace: true })} fetching={q.isFetching} />;
}

// ------------------------------------------------------------------ editor

function RecordEditor({ data, setQuarter, fetching }: { data: RecordPayload; setQuarter: (n: number) => void; fetching: boolean }) {
  const { user, school } = useSession();
  const office = isOfficeRole(user.role);
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cls = data.class;
  const quarter = data.quarter;
  const recordKey = useMemo(() => ['record', cls.id, quarter] as const, [cls.id, quarter]);

  // ---- local edits (typed but maybe not yet saved)
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const pending = useRef<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const [view, setView] = useState<'grid' | 'learner'>(() => (window.innerWidth < 720 ? 'learner' : 'grid'));
  const [learnerIdx, setLearnerIdx] = useState(0);

  const itemById = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const learners = data.learners;

  const textOf = useCallback(
    (item: RecordItem, l: RecordLearner): string => {
      const k = keyOf(item.id, l.enrollmentId);
      return edits.has(k) ? edits.get(k)! : serverText(l.scores[item.id]);
    },
    [edits],
  );

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current || pending.current.size === 0) return;
    const keys = [...pending.current];
    const snapshot = new Map(keys.map((k) => [k, editsRef.current.get(k) ?? '']));
    const entries: Array<{ itemId: number; enrollmentId: number; score: number | null; excused: boolean }> = [];
    const sendable: string[] = [];
    for (const k of keys) {
      const [itemId, enrollmentId] = k.split(':').map(Number) as [number, number];
      const item = itemById.get(itemId);
      if (!item) continue;
      const cell = parseCell(snapshot.get(k)!, item.hps);
      if (cell.kind === 'invalid') continue; // stays pending and red until fixed
      entries.push({ itemId, enrollmentId, score: cell.kind === 'score' ? cell.value : null, excused: cell.kind === 'excused' });
      sendable.push(k);
    }
    if (!entries.length) {
      setSaveState('error');
      setSaveError('Some scores are not valid. Fix the red cells.');
      return;
    }
    inFlight.current = true;
    setSaveState('saving');
    setSaveError(null);
    try {
      await put(`/classes/${cls.id}/scores`, { quarter, entries });
      await qc.refetchQueries({ queryKey: recordKey });
      setEdits((prev) => {
        const next = new Map(prev);
        for (const k of sendable) if (next.get(k) === snapshot.get(k)) next.delete(k);
        return next;
      });
      for (const k of sendable) if ((editsRef.current.get(k) ?? '') === snapshot.get(k)) pending.current.delete(k);
      setSaveState(pending.current.size ? 'dirty' : 'saved');
    } catch (e) {
      setSaveState('error');
      setSaveError(errorMessage(e));
    } finally {
      inFlight.current = false;
      if (pending.current.size && !timer.current) timer.current = window.setTimeout(() => void flush(), 1200);
    }
  }, [cls.id, itemById, qc, quarter, recordKey]);

  const schedule = useCallback(() => {
    setSaveState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      void flush();
    }, 700);
  }, [flush]);

  const setCell = useCallback(
    (item: RecordItem, l: RecordLearner, text: string) => {
      const k = keyOf(item.id, l.enrollmentId);
      setEdits((prev) => new Map(prev).set(k, text));
      pending.current.add(k);
      schedule();
    },
    [schedule],
  );

  // leaving the page: push whatever is left, and warn if the browser is closed mid-save
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size) {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (pending.current.size) void flush();
    };
  }, [flush]);

  // ---- live computation (same rules as the server, so the numbers update while typing)
  const live = useMemo(() => {
    const out = new Map<number, ReturnType<typeof computeQuarter>>();
    for (const l of learners) {
      const by: Record<Component, ItemScore[]> = { WW: [], PT: [], QA: [] };
      for (const item of data.items) {
        const c = parseCell(textOf(item, l), item.hps);
        by[item.component].push({ hps: item.hps, score: c.kind === 'score' ? c.value : null, excused: c.kind === 'excused' });
      }
      out.set(l.enrollmentId, computeQuarter({ ww: by.WW, pt: by.PT, qa: by.QA, weights: cls.weights }));
    }
    return out;
  }, [learners, data.items, textOf, cls.weights]);

  const stats = useMemo(() => {
    const grades = [...live.values()].map((r) => r.quarterlyGrade).filter((g): g is number => g != null);
    return {
      mean: grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100 : null,
      failing: grades.filter((g) => g < school.passingGrade).length,
      missing: [...live.values()].reduce((s, r) => s + r.missing, 0),
      graded: grades.length,
    };
  }, [live, school.passingGrade]);

  const editable = data.canEdit;
  const status = data.workflow.status;
  const [qA, qB] = quartersOfSemester(cls.semester);

  // ---- item modal
  const [itemModal, setItemModal] = useState<{ mode: 'add'; component: Component } | { mode: 'edit'; item: RecordItem } | null>(null);
  // ---- workflow modals
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['record', cls.id] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['approvals'] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      await flush();
      return post(`/classes/${cls.id}/submit`, { quarter });
    },
    onSuccess: () => {
      toast.ok('Submitted for approval.');
      setConfirmSubmit(false);
      invalidate();
    },
    onError: (e) => {
      setConfirmSubmit(false);
      toast.error(errorMessage(e));
    },
  });
  const approve = useMutation({
    mutationFn: () => post(`/classes/${cls.id}/approve`, { quarter }),
    onSuccess: () => {
      toast.ok('Approved and locked.');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copyItems = useMutation({
    mutationFn: (from: number) => post(`/classes/${cls.id}/copy-items`, { fromQuarter: from, toQuarter: quarter }),
    onSuccess: () => {
      toast.ok('Items copied. Enter the scores.');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const otherQuarter = quarter === qA ? qB : qA;
  const grouped = COMPS.map((c) => ({ c, items: data.items.filter((i) => i.component === c) }));
  const totalItems = data.items.length;

  // ---- keyboard navigation between cells
  const refs = useRef(new Map<string, HTMLInputElement>());
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [data.items]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusAt = (row: number, col: number) => {
    const el = refs.current.get(`${row},${col}`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      focusAt(Math.min(learners.length - 1, Math.max(0, row + dr)), Math.min(flatItems.length - 1, Math.max(0, col + dc)));
    };
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) move(1, 0);
    else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) move(-1, 0);
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) move(0, 1);
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) move(0, -1);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return; // single value: normal paste
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    lines.forEach((line, dr) => {
      line.split('\t').forEach((val, dc) => {
        const l = learners[row + dr];
        const item = flatItems[col + dc];
        if (l && item) setCell(item, l, val.trim());
      });
    });
  };

  const current = learners[Math.min(learnerIdx, learners.length - 1)];

  return (
    <>
      <PageHeader
        back={
          <button onClick={() => navigate(-1)} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Back
          </button>
        }
        title={cls.subject.name}
        sub={
          <>
            Grade {cls.section.gradeLevel} - {cls.section.name} · {cls.section.strand} · {cls.semester === 1 ? '1st' : '2nd'} semester · SY {cls.schoolYear}
            {cls.teacher ? ` · ${cls.teacher.fullName}` : ' · no teacher assigned'}
          </>
        }
        actions={
          <>
            <QuarterPicker value={quarter} onChange={setQuarter} quarters={[qA, qB]} />
            <Button size="md" icon={<Download className="size-4" />} onClick={() => downloadReport(`/reports/class-record${qs({ classId: cls.id, quarter })}`, `ClassRecord_${cls.subject.code}_Q${quarter}.xlsx`).catch((e) => toast.error(errorMessage(e)))}>
              Excel
            </Button>
          </>
        }
      />

      {/* status */}
      <div className="mb-3 flex flex-col gap-2">
        {status === 'RETURNED' && data.workflow.note ? (
          <Alert tone="warn" title="Returned for corrections">
            {data.workflow.note}
          </Alert>
        ) : null}
        {!editable && data.lockedReason ? <Alert tone={status === 'APPROVED' ? 'ok' : 'info'}>{data.lockedReason}</Alert> : null}
        {saveState === 'error' && saveError ? <Alert tone="bad" title="Scores not saved">{saveError}</Alert> : null}
      </div>

      {/* toolbar */}
      <Card className="mb-3" pad={false}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
          <StatusBadge status={status} />
          <span className="text-[13px] text-muted">
            Weights: <b className="text-ink">WW {cls.weights.ww}%</b> · <b className="text-ink">PT {cls.weights.pt}%</b> · <b className="text-ink">QA {cls.weights.qa}%</b>
          </span>
          <span className="text-[13px] text-muted">
            Class average <b className="text-ink tnum">{stats.mean ?? '-'}</b> · Below {school.passingGrade}: <b className={cx('tnum', stats.failing ? 'text-bad' : 'text-ink')}>{stats.failing}</b>
            {stats.missing ? (
              <>
                {' '}
                · Blank scores: <b className="text-warn tnum">{stats.missing}</b>
              </>
            ) : null}
          </span>
          <SaveIndicator state={saveState} fetching={fetching} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Segmented value={view} onChange={setView} options={[{ id: 'grid', label: <span className="inline-flex items-center gap-1"><LayoutGrid className="size-3.5" />Grid</span> }, { id: 'learner', label: <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />Learner</span> }]} />
            {editable ? (
              <>
                <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setItemModal({ mode: 'add', component: 'WW' })}>
                  Add item
                </Button>
                <Button size="sm" variant="primary" icon={<Send className="size-4" />} onClick={() => void flush().then(() => setConfirmSubmit(true))}>
                  Submit
                </Button>
              </>
            ) : null}
            {office && status === 'SUBMITTED' ? (
              <>
                <Button size="sm" onClick={() => setReturnOpen(true)} icon={<RotateCcw className="size-4" />}>
                  Return
                </Button>
                <Button size="sm" variant="primary" loading={approve.isPending} onClick={() => approve.mutate()} icon={<ShieldCheck className="size-4" />}>
                  Approve
                </Button>
              </>
            ) : null}
            {office && status === 'APPROVED' ? (
              <Button size="sm" onClick={() => setReturnOpen(true)} icon={<RotateCcw className="size-4" />}>
                Reopen
              </Button>
            ) : null}
            {!office && status === 'APPROVED' ? (
              <Button size="sm" onClick={() => setReopenOpen(true)} icon={<RotateCcw className="size-4" />}>
                Request reopen
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {totalItems === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="font-medium">No items in Quarter {quarter} yet</p>
            <p className="max-w-md text-sm text-muted">Add the quizzes, activities and the exam you gave this quarter, then enter each learner&apos;s score. The grade is computed for you.</p>
            {editable ? (
              <div className="flex flex-wrap justify-center gap-2">
                {COMPS.map((c) => (
                  <Button key={c} icon={<Plus className="size-4" />} onClick={() => setItemModal({ mode: 'add', component: c })}>
                    {ADD_LABEL[c]}
                  </Button>
                ))}
                <Button icon={<Copy className="size-4" />} loading={copyItems.isPending} onClick={() => copyItems.mutate(otherQuarter)}>
                  Copy items from Quarter {otherQuarter}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : view === 'grid' ? (
        <div className="grid-wrap">
          <table>
            <thead>
              <tr style={{ height: 32 }}>
                <th rowSpan={3} className="stick-l" style={{ top: 0, minWidth: 236, textAlign: 'left', paddingLeft: 12 }}>
                  Learner ({learners.length})
                </th>
                {grouped.map((g) => (
                  <th key={g.c} colSpan={g.items.length + 3} style={{ top: 0, height: 32 }}>
                    {COMPONENT_LABEL[g.c]} <span className="font-normal text-muted">({g.c === 'WW' ? cls.weights.ww : g.c === 'PT' ? cls.weights.pt : cls.weights.qa}%)</span>
                    {editable ? (
                      <button className="ml-2 rounded px-1 text-brand hover:bg-brand-soft" title={`Add ${ADD_LABEL[g.c]} item`} onClick={() => setItemModal({ mode: 'add', component: g.c })}>
                        <Plus className="inline size-3.5" />
                      </button>
                    ) : null}
                  </th>
                ))}
                <th rowSpan={3} style={{ top: 0, minWidth: 64 }}>
                  Initial
                  <br />
                  Grade
                </th>
                <th rowSpan={3} style={{ top: 0, minWidth: 76 }}>
                  Quarterly
                  <br />
                  Grade
                </th>
              </tr>
              <tr style={{ height: 32 }}>
                {grouped.map((g) => (
                  <ItemHeads key={g.c} items={g.items} editable={editable} onEdit={(item) => setItemModal({ mode: 'edit', item })} />
                ))}
              </tr>
              <tr style={{ height: 30 }}>
                {grouped.map((g) => (
                  <HpsCells key={g.c} items={g.items} weight={g.c === 'WW' ? cls.weights.ww : g.c === 'PT' ? cls.weights.pt : cls.weights.qa} />
                ))}
              </tr>
            </thead>
            <tbody>
              {(['M', 'F'] as const).map((sex) => {
                const group = learners.filter((l) => l.sex === sex);
                if (!group.length) return null;
                return [
                  <tr key={sex} className="band">
                    <td className="stick-l" style={{ background: 'var(--surface-2)', paddingLeft: 12, height: 26 }}>
                      {sex === 'M' ? 'MALE' : 'FEMALE'} ({group.length})
                    </td>
                    <td colSpan={totalItems + 3 * 3 + 2} style={{ background: 'var(--surface-2)' }} />
                  </tr>,
                  ...group.map((l, gi) => {
                    const row = learners.indexOf(l);
                    const r = live.get(l.enrollmentId)!;
                    const dropped = l.status === 'DROPPED_OUT' || l.status === 'TRANSFERRED_OUT';
                    let col = -1;
                    return (
                      <tr key={l.enrollmentId} className={dropped ? 'opacity-60' : ''}>
                        <td className="stick-l" style={{ paddingLeft: 12, paddingRight: 8, height: 34 }}>
                          <span className="inline-block w-6 text-muted tnum">{gi + 1}</span>
                          <span className="font-medium">{shortName(l)}</span>
                          {dropped ? <span className="ml-2 text-xs text-muted">({l.status === 'DROPPED_OUT' ? 'dropped' : 'transferred'})</span> : null}
                        </td>
                        {grouped.map((g) => {
                          const res = g.c === 'WW' ? r.ww : g.c === 'PT' ? r.pt : r.qa;
                          return [
                            ...g.items.map((item) => {
                              col += 1;
                              const c = col;
                              const text = textOf(item, l);
                              const parsed = parseCell(text, item.hps);
                              const k = keyOf(item.id, l.enrollmentId);
                              return (
                                <td key={item.id} style={{ minWidth: 60, width: 60 }}>
                                  <input
                                    ref={(el) => {
                                      if (el) refs.current.set(`${row},${c}`, el);
                                      else refs.current.delete(`${row},${c}`);
                                    }}
                                    className={cx('score-input', parsed.kind === 'blank' && 'blank', pending.current.has(k) && parsed.kind !== 'invalid' && 'pending')}
                                    style={parsed.kind === 'invalid' ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : undefined}
                                    title={parsed.kind === 'invalid' ? parsed.reason : `${item.title} (out of ${item.hps})`}
                                    aria-label={`${shortName(l)}, ${item.title}`}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={text}
                                    disabled={!editable}
                                    onChange={(e) => setCell(item, l, e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => onKey(e, row, c)}
                                    onPaste={(e) => onPaste(e, row, c)}
                                    onBlur={() => pending.current.size && void flush()}
                                  />
                                </td>
                              );
                            }),
                            <td key={`${g.c}-t`} className="tnum" style={{ textAlign: 'center', minWidth: 52 }}>{res.hps ? num(res.total) : ''}</td>,
                            <td key={`${g.c}-p`} className="tnum" style={{ textAlign: 'center', minWidth: 56 }}>{res.ps != null ? res.ps.toFixed(2) : ''}</td>,
                            <td key={`${g.c}-w`} className="tnum" style={{ textAlign: 'center', minWidth: 56, background: 'var(--surface-2)' }}>{res.ws != null ? res.ws.toFixed(2) : ''}</td>,
                          ];
                        })}
                        <td className="tnum" style={{ textAlign: 'center' }}>{r.initialGrade != null ? r.initialGrade.toFixed(2) : ''}</td>
                        <td className="tnum" style={{ textAlign: 'center', fontWeight: 700, background: 'var(--surface-2)' }}>
                          <GradeChip value={r.quarterlyGrade} passing={school.passingGrade} />
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : current ? (
        <LearnerView
          learners={learners}
          idx={Math.min(learnerIdx, learners.length - 1)}
          setIdx={setLearnerIdx}
          grouped={grouped}
          textOf={textOf}
          setCell={setCell}
          editable={editable}
          result={live.get(current.enrollmentId)!}
          passing={school.passingGrade}
          onEditItem={(item) => setItemModal({ mode: 'edit', item })}
        />
      ) : (
        <Alert tone="info">No learners are enrolled in this section yet.</Alert>
      )}

      {totalItems > 0 && view === 'grid' ? (
        <p className="mt-2 text-xs text-muted">
          Tip: arrow keys or Enter move between cells. Type <b>EX</b> for an excused item. You can paste a column of scores from Excel. Yellow cells are still blank; blue cells are being saved.
        </p>
      ) : null}

      {itemModal ? <ItemModal state={itemModal} classId={cls.id} quarter={quarter} existing={data.items} canDelete={editable} onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); invalidate(); }} /> : null}

      <ConfirmDialog open={confirmSubmit} title="Submit for approval?" confirmLabel="Submit" loading={submit.isPending} onConfirm={() => submit.mutate()} onClose={() => setConfirmSubmit(false)}>
        <p>
          You are submitting <b>{cls.subject.name}</b>, Quarter {quarter}, for Grade {cls.section.gradeLevel} - {cls.section.name}.
        </p>
        <p className="mt-2 text-muted">After you submit, scores are locked until the registrar approves or returns the record.</p>
        {stats.missing ? <Alert tone="warn" title={`${stats.missing} score${stats.missing === 1 ? ' is' : 's are'} still blank`}>Enter 0 for work that was not handed in, or EX if excused. Blank scores block submission.</Alert> : null}
      </ConfirmDialog>

      <NoteModal
        open={returnOpen}
        title={status === 'APPROVED' ? 'Reopen this record' : 'Return to the teacher'}
        label="What must be corrected?"
        action={status === 'APPROVED' ? 'Reopen' : 'Return'}
        onClose={() => setReturnOpen(false)}
        onSubmit={async (note) => {
          await post(`/classes/${cls.id}/return`, { quarter, note });
          toast.ok(status === 'APPROVED' ? 'Record reopened for the teacher.' : 'Returned to the teacher.');
          setReturnOpen(false);
          invalidate();
        }}
      />
      <NoteModal
        open={reopenOpen}
        title="Ask the registrar to reopen this record"
        label="Why does it need to change?"
        action="Send request"
        onClose={() => setReopenOpen(false)}
        onSubmit={async (reason) => {
          await post(`/classes/${cls.id}/reopen-request`, { quarter, reason });
          toast.ok('Request sent to the registrar.');
          setReopenOpen(false);
        }}
      />
    </>
  );
}

// ------------------------------------------------------------------ pieces

function SaveIndicator({ state, fetching }: { state: SaveState; fetching: boolean }) {
  if (state === 'saving' || (fetching && state === 'dirty')) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-muted">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === 'dirty') return <span className="text-[13px] text-info">Unsaved changes</span>;
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-ok">
        <Check className="size-3.5" /> All changes saved
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-bad">
        <CircleAlert className="size-3.5" /> Not saved
      </span>
    );
  }
  return null;
}

function ItemHeads({ items, editable, onEdit }: { items: RecordItem[]; editable: boolean; onEdit: (i: RecordItem) => void }) {
  return (
    <>
      {items.map((i) => (
        <th key={i.id} style={{ top: 32, minWidth: 60, maxWidth: 80, padding: '0 4px' }} title={`${i.title}${i.dateGiven ? ` (${dateLabel(i.dateGiven)})` : ''}`}>
          {editable ? (
            <button className="block w-full truncate rounded px-1 text-[12px] font-semibold hover:bg-brand-soft hover:text-brand" onClick={() => onEdit(i)}>
              {i.title}
            </button>
          ) : (
            <span className="block max-w-[72px] truncate text-[12px]">{i.title}</span>
          )}
        </th>
      ))}
      <th style={{ top: 32 }}>Total</th>
      <th style={{ top: 32 }}>PS</th>
      <th style={{ top: 32 }}>WS</th>
    </>
  );
}

function HpsCells({ items, weight }: { items: RecordItem[]; weight: number }) {
  const total = items.reduce((s, i) => s + i.hps, 0);
  return (
    <>
      {items.map((i) => (
        <th key={i.id} className="tnum" style={{ top: 64, fontWeight: 500 }} title="Highest possible score">
          {num(i.hps)}
        </th>
      ))}
      <th className="tnum" style={{ top: 64, fontWeight: 500 }}>{num(total)}</th>
      <th className="tnum" style={{ top: 64, fontWeight: 500 }}>100</th>
      <th className="tnum" style={{ top: 64, fontWeight: 500 }}>{weight}%</th>
    </>
  );
}

function LearnerView({
  learners,
  idx,
  setIdx,
  grouped,
  textOf,
  setCell,
  editable,
  result,
  passing,
  onEditItem,
}: {
  learners: RecordLearner[];
  idx: number;
  setIdx: (n: number) => void;
  grouped: Array<{ c: Component; items: RecordItem[] }>;
  textOf: (item: RecordItem, l: RecordLearner) => string;
  setCell: (item: RecordItem, l: RecordLearner, text: string) => void;
  editable: boolean;
  result: ReturnType<typeof computeQuarter>;
  passing: number;
  onEditItem: (i: RecordItem) => void;
}) {
  const l = learners[idx]!;
  return (
    <div className="flex flex-col gap-3">
      <Card pad={false}>
        <div className="flex items-center gap-2 p-2">
          <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)} aria-label="Previous learner">
            <ChevronLeft className="size-5" />
          </Button>
          <Select aria-label="Learner" value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="flex-1">
            {learners.map((x, i) => (
              <option key={x.enrollmentId} value={i}>
                {i + 1}. {shortName(x)}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" disabled={idx === learners.length - 1} onClick={() => setIdx(idx + 1)} aria-label="Next learner">
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-lg font-semibold">{shortName(l)}</p>
            <p className="text-xs text-muted">LRN {l.lrn}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Quarterly grade</p>
            <p className="text-3xl font-semibold tnum">
              <GradeChip value={result.quarterlyGrade} passing={passing} />
            </p>
            <p className="text-xs text-muted tnum">Initial {result.initialGrade != null ? result.initialGrade.toFixed(2) : '-'}</p>
          </div>
        </div>
      </Card>

      {grouped.map((g) => {
        const res = g.c === 'WW' ? result.ww : g.c === 'PT' ? result.pt : result.qa;
        return (
          <Card key={g.c}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{COMPONENT_LABEL[g.c]}</h3>
              <span className="text-xs text-muted tnum">
                {res.hps ? `${num(res.total)} / ${num(res.hps)}` : 'no items'}
                {res.ps != null ? ` · PS ${res.ps.toFixed(2)} · WS ${res.ws?.toFixed(2)}` : ''}
              </span>
            </div>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted">No items yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {g.items.map((item) => {
                  const text = textOf(item, l);
                  const parsed = parseCell(text, item.hps);
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <button className="min-w-0 text-left" disabled={!editable} onClick={() => onEditItem(item)}>
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="text-xs text-muted">out of {num(item.hps)}</span>
                      </button>
                      <input
                        className={cx('h-11 w-24 rounded-lg border border-line bg-surface text-center text-base tnum', parsed.kind === 'blank' && 'border-warn bg-warn-soft', parsed.kind === 'invalid' && 'border-bad bg-bad-soft text-bad')}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`${item.title} score`}
                        value={text}
                        disabled={!editable}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setCell(item, l, e.target.value)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-muted">Type EX for an excused item. Scores are saved automatically.</p>
    </div>
  );
}

function ItemModal({ state, classId, quarter, existing, canDelete, onClose, onSaved }: { state: { mode: 'add'; component: Component } | { mode: 'edit'; item: RecordItem }; classId: number; quarter: number; existing: RecordItem[]; canDelete: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = state.mode === 'edit';
  const [component, setComponent] = useState<Component>(state.mode === 'add' ? state.component : state.item.component);
  const suggested = useMemo(() => {
    const n = existing.filter((i) => i.component === component).length + 1;
    return component === 'WW' ? `Quiz ${n}` : component === 'PT' ? `Task ${n}` : n === 1 ? 'Quarterly Exam' : `Quarterly Exam ${n}`;
  }, [component, existing]);
  const [title, setTitle] = useState(state.mode === 'edit' ? state.item.title : '');
  const [hps, setHps] = useState(state.mode === 'edit' ? String(state.item.hps) : '');
  const [date, setDate] = useState(state.mode === 'edit' ? (state.item.dateGiven ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { title: (title || suggested).trim(), hps: Number(hps), dateGiven: date || null };
      if (state.mode === 'add') await post(`/classes/${classId}/items`, { ...body, quarter, component });
      else await put(`/items/${state.item.id}`, body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (state.mode !== 'edit') return;
    setBusy(true);
    try {
      await del(`/items/${state.item.id}`);
      toast.ok('Item deleted.');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={isEdit ? `Edit item` : `Add item to Quarter ${quarter}`}
        footer={
          <>
            {isEdit && canDelete ? (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!hps || Number(hps) <= 0} onClick={() => void save()}>
              {isEdit ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {!isEdit ? (
            <Field label="Component">
              {(id) => (
                <Select id={id} value={component} onChange={(e) => setComponent(e.target.value as Component)}>
                  {COMPS.map((c) => (
                    <option key={c} value={c}>
                      {COMPONENT_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <p className="text-sm text-muted">
              Component: <Badge tone="brand">{COMPONENT_LABEL[component]}</Badge>
            </p>
          )}
          <Field label="Title">{(id) => <Input id={id} value={title} placeholder={suggested} onChange={(e) => setTitle(e.target.value)} maxLength={60} />}</Field>
          <Field label="Highest possible score" hint="Total points of this item, for example 20">
            {(id) => <Input id={id} inputMode="decimal" value={hps} onChange={(e) => setHps(e.target.value.replace(',', '.'))} required />}
          </Field>
          <Field label="Date given (optional)">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          {error ? <Alert tone="bad">{error}</Alert> : null}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      <ConfirmDialog open={confirmDelete} danger title="Delete this item?" confirmLabel="Delete" loading={busy} onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)}>
        All scores entered for <b>{state.mode === 'edit' ? state.item.title : ''}</b> will be deleted and the grades recomputed.
      </ConfirmDialog>
    </>
  );
}

export function NoteModal({ open, title, label, action, onClose, onSubmit }: { open: boolean; title: string; label: string; action: string; onClose: () => void; onSubmit: (note: string) => Promise<void> }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={note.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(note.trim());
                setNote('');
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      <Field label={label}>{(id) => <Textarea id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} autoFocus />}</Field>
    </Modal>
  );
}
