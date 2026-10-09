import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { TermPicker, YearSelect, useYearChoice } from '../components/bits';
import { Alert, Badge, Button, Card, CardTitle, Checkbox, Empty, PageHeader, Spinner, StatusBadge, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { get, post, qs } from '../lib/api';
import { dateTimeLabel } from '../lib/format';
import type { ApprovalRow, ReopenRow } from '../lib/types';
import { NoteModal } from './ClassRecord';

export default function ApprovalsPage() {
  const { yearId, setYearId } = useYearChoice();
  const [term, setTerm] = useState(1);
  const [filter, setFilter] = useState<'SUBMITTED' | 'ALL'>('SUBMITTED');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [returning, setReturning] = useState<ApprovalRow | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const rows = useQuery({ queryKey: ['approvals', yearId, term], queryFn: () => get<ApprovalRow[]>(`/approvals${qs({ schoolYearId: yearId, term })}`), enabled: yearId != null });
  const requests = useQuery({ queryKey: ['reopen-requests'], queryFn: () => get<ReopenRow[]>('/reopen-requests?status=PENDING') });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['approvals'] });
    void qc.invalidateQueries({ queryKey: ['reopen-requests'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
    void qc.invalidateQueries({ queryKey: ['record'] });
  };

  const bulk = useMutation({
    mutationFn: (classIds: number[]) => post<{ approved: number; skipped: number[] }>('/approvals/bulk', { classIds }),
    onSuccess: (r) => {
      toast.ok(`${r.approved} class record${r.approved === 1 ? '' : 's'} approved.`);
      setPicked(new Set());
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const decide = useMutation({
    mutationFn: (v: { id: number; approve: boolean }) => post(`/reopen-requests/${v.id}/decide`, { approve: v.approve }),
    onSuccess: (_r, v) => {
      toast.ok(v.approve ? 'Record reopened for the teacher.' : 'Request declined.');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const shown = (rows.data ?? []).filter((r) => (filter === 'SUBMITTED' ? r.status === 'SUBMITTED' : true));
  const submitted = shown.filter((r) => r.status === 'SUBMITTED');
  const counts = (s: string) => (rows.data ?? []).filter((r) => r.status === s).length;

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader title="Approvals" sub="Review class records that teachers submitted. Approved records are locked and appear on report cards." actions={<><YearSelect value={yearId} onChange={setYearId} /><TermPicker value={term} onChange={setTerm} /></>} />

      {requests.data && requests.data.length > 0 ? (
        <Card className="mb-4">
          <CardTitle sub="Teachers ask to change a record that is already approved">Requests to reopen</CardTitle>
          <ul className="divide-y divide-line">
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.subject} <span className="font-normal text-muted">· Grade {r.section} · Term {r.term}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {r.teacher} · {dateTimeLabel(r.createdAt)}
                  </p>
                  <p className="mt-1 text-sm">&ldquo;{r.reason}&rdquo;</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>
                    Decline
                  </Button>
                  <Button size="sm" variant="primary" loading={decide.isPending} icon={<RotateCcw className="size-4" />} onClick={() => decide.mutate({ id: r.id, approve: true })}>
                    Reopen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-2 text-sm">
          <Badge tone="info">{counts('SUBMITTED')} submitted</Badge>
          <Badge tone="ok">{counts('APPROVED')} approved</Badge>
          <Badge tone="warn">{counts('RETURNED')} returned</Badge>
          <Badge>{counts('DRAFT')} not submitted</Badge>
        </div>
        <Checkbox checked={filter === 'ALL'} onChange={(e) => setFilter(e.target.checked ? 'ALL' : 'SUBMITTED')} label="Show all class records" />
        <div className="ml-auto flex gap-2">
          {submitted.length ? (
            <Button variant="primary" icon={<Check className="size-4" />} loading={bulk.isPending} onClick={() => bulk.mutate(picked.size ? [...picked] : submitted.map((r) => r.classId))}>
              {picked.size ? `Approve ${picked.size} selected` : `Approve all ${submitted.length}`}
            </Button>
          ) : null}
        </div>
      </div>

      {rows.isPending ? (
        <Spinner />
      ) : rows.isError ? (
        <Alert tone="bad">{errorMessage(rows.error)}</Alert>
      ) : shown.length === 0 ? (
        <Card>
          <Empty title="Nothing waiting for approval" icon={<ClipboardCheck className="size-8" />}>
            When teachers submit their Term {term} class records they appear here.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls} style={{ width: 36 }} />
                <th className={thCls}>Subject</th>
                <th className={thCls}>Section</th>
                <th className={thCls}>Teacher</th>
                <th className={thCls}>Status</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.classId} className="hover:bg-surface-2/60">
                  <td className={tdCls}>{r.status === 'SUBMITTED' ? <input type="checkbox" className="size-4 accent-[var(--brand)]" aria-label={`Select ${r.subject}`} checked={picked.has(r.classId)} onChange={() => toggle(r.classId)} /> : null}</td>
                  <td className={tdCls}>
                    <Link to={`/classes/${r.classId}`} className="font-medium hover:text-brand">
                      {r.subject}
                    </Link>
                    <p className="text-xs text-muted">{r.items} items</p>
                  </td>
                  <td className={tdCls}>
                    Grade {r.section}
                    <p className="text-xs text-muted">{r.strand}</p>
                  </td>
                  <td className={tdCls}>{r.teacher ?? <span className="text-warn">not assigned</span>}</td>
                  <td className={tdCls}>
                    <StatusBadge status={r.status} />
                    {r.submittedAt && r.status === 'SUBMITTED' ? <p className="mt-0.5 text-xs text-muted">{dateTimeLabel(r.submittedAt)}</p> : null}
                    {r.status === 'RETURNED' && r.note ? <p className="mt-0.5 max-w-xs text-xs text-warn">{r.note}</p> : null}
                  </td>
                  <td className={tdCls + ' text-right'}>
                    <div className="flex justify-end gap-2">
                      <Link to={`/classes/${r.classId}`}>
                        <Button size="sm">Open</Button>
                      </Link>
                      {r.status === 'SUBMITTED' ? (
                        <>
                          <Button size="sm" onClick={() => setReturning(r)}>Return</Button>
                          <Button size="sm" variant="primary" loading={bulk.isPending} onClick={() => bulk.mutate([r.classId])}>Approve</Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <NoteModal
        open={returning != null}
        title={`Return ${returning?.subject ?? ''}`}
        label="What must the teacher correct?"
        action="Return"
        onClose={() => setReturning(null)}
        onSubmit={async (note) => {
          await post(`/classes/${returning!.classId}/return`, { note });
          toast.ok('Returned to the teacher.');
          setReturning(null);
          refresh();
        }}
      />
    </>
  );
}
