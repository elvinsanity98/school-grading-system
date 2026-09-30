import { transmutationTable } from '@bnhs/core';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { DatabaseBackup, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, CardTitle, Empty, Input, PageHeader, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../../components/ui';
import { downloadReport, get, post, qs } from '../../lib/api';
import { dateTimeLabel } from '../../lib/format';
import type { AuditRow } from '../../lib/types';

export function AuditPage() {
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['audit', action, user],
    queryFn: ({ pageParam }) => get<AuditRow[]>(`/audit${qs({ limit: 100, action, user, before: pageParam })}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]!.id : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeader title="Audit log" sub="Who did what and when. Sign-ins, grade changes, approvals, printing and setup changes are recorded." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input aria-label="Filter by action" className="max-w-52" placeholder="Action, e.g. APPROVED" value={action} onChange={(e) => setAction(e.target.value)} />
        <Input aria-label="Filter by user" className="max-w-52" placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} />
      </div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : rows.length === 0 ? (
        <Card><Empty title="Nothing recorded yet" /></Card>
      ) : (
        <>
          <TableWrap>
            <table className={tableCls}>
              <thead><tr><th className={thCls}>When</th><th className={thCls}>Who</th><th className={thCls}>Action</th><th className={thCls}>Record</th><th className={thCls}>Details</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={tdCls + ' whitespace-nowrap text-muted'}>{dateTimeLabel(r.at)}</td>
                    <td className={tdCls}>{r.username ?? <span className="text-muted">-</span>}</td>
                    <td className={tdCls + ' font-mono text-[12px]'}>{r.action}</td>
                    <td className={tdCls + ' text-muted'}>{r.entity ? `${r.entity}${r.entityId ? ` #${r.entityId}` : ''}` : ''}</td>
                    <td className={tdCls + ' max-w-md truncate font-mono text-[12px] text-muted'} title={r.detail ?? ''}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {q.hasNextPage ? <div className="mt-3 text-center"><Button loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load older entries</Button></div> : null}
        </>
      )}
    </>
  );
}

interface SystemInfo {
  version: string;
  node: string;
  dbFile: string;
  dbBytes: number;
  counts: { learners: number; users: number; scores: number; audits: number };
}

export function SystemPage() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['system'], queryFn: () => get<SystemInfo>('/admin/system') });
  const recompute = useMutation({
    mutationFn: () => post<{ recomputed: number; lockedSkipped: number }>('/admin/recompute'),
    onSuccess: (r) => toast.ok(`${r.recomputed} class records recomputed.`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const table = useMemo(() => transmutationTable(), []);
  return (
    <>
      <PageHeader title="System and backup" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Everything is stored in one file on the school server">Backup</CardTitle>
          <div className="flex flex-col items-start gap-3 text-sm">
            <p>Download a copy of the whole database (learners, grades, users). Keep it somewhere safe, for example a flash drive kept by the school head. Do this at least after each quarter is approved.</p>
            <Button variant="primary" icon={<DatabaseBackup className="size-4" />} onClick={() => downloadReport('/admin/backup', 'bnhs-backup.db').catch((e) => toast.error(errorMessage(e)))}>Download backup</Button>
            <p className="text-xs text-muted">To restore: stop the server, replace <code>apps/server/data/bnhs.db</code> with the backup file, start the server again. See docs/DEPLOYMENT.md.</p>
          </div>
        </Card>
        <Card>
          <CardTitle>About this system</CardTitle>
          {q.isPending ? <Spinner /> : q.isError ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : (
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Version</dt><dd>{q.data.version}</dd>
              <dt className="text-muted">Database size</dt><dd>{(q.data.dbBytes / 1024 / 1024).toFixed(2)} MB</dd>
              <dt className="text-muted">Learners</dt><dd className="tnum">{q.data.counts.learners}</dd>
              <dt className="text-muted">Accounts</dt><dd className="tnum">{q.data.counts.users}</dd>
              <dt className="text-muted">Scores stored</dt><dd className="tnum">{q.data.counts.scores}</dd>
              <dt className="text-muted">Audit entries</dt><dd className="tnum">{q.data.counts.audits}</dd>
            </dl>
          )}
          <div className="mt-3"><Button icon={<RefreshCw className="size-4" />} loading={recompute.isPending} onClick={() => recompute.mutate()}>Recompute all open grades</Button></div>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle sub="DepEd Order No. 8, s. 2015: initial grade to transmuted (quarterly) grade">Transmutation table</CardTitle>
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((col) => (
              <table key={col} className="w-full text-sm tnum">
                <thead><tr><th className="py-1 text-left text-xs text-muted">Initial grade</th><th className="py-1 text-right text-xs text-muted">Grade</th></tr></thead>
                <tbody>
                  {table.slice(col * 11, col * 11 + 11).map((r) => (
                    <tr key={r.grade} className="border-t border-line"><td className="py-0.5">{r.from === r.to ? r.from : `${r.from.toFixed(2)} - ${r.to.toFixed(2)}`}</td><td className="py-0.5 text-right font-semibold">{r.grade}</td></tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
