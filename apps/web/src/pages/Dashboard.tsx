import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpenCheck, CheckCircle2, Circle, ClipboardCheck, Lock, LockOpen, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { QuarterPicker, QuarterPills } from '../components/bits';
import { Alert, Badge, Button, Card, CardTitle, Empty, PageHeader, Progress, Spinner, Stat, cx, errorMessage, useToast } from '../components/ui';
import { get, put, qs } from '../lib/api';
import { useSession } from '../lib/auth';
import type { AtRisk, Dashboard as DashboardData } from '../lib/types';
import { shortName } from '../lib/format';

export default function DashboardPage() {
  const { user } = useSession();
  if (user.role === 'STUDENT' || user.role === 'PARENT') return <Navigate to="/my-grades" replace />;
  return user.role === 'TEACHER' ? <TeacherDashboard /> : <OfficeDashboard />;
}

// ------------------------------------------------------------------ office

function OfficeDashboard() {
  const { years, currentYearId, user, school } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [quarter, setQuarter] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['dashboard', quarter], queryFn: () => get<DashboardData>(`/dashboard${qs({ quarter })}`) });

  const period = useMutation({
    mutationFn: (v: { id: number; status?: 'OPEN' | 'CLOSED'; released?: boolean }) => put(`/periods/${v.id}`, { status: v.status, released: v.released }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['session'] });
      toast.ok('Saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  if (d.kind !== 'office') return null;
  if (!d.year) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty title="No school year yet" action={user.role === 'ADMIN' ? <Link to="/setup/years"><Button variant="primary">Create a school year</Button></Link> : undefined}>
          Ask the administrator to create the first school year.
        </Empty>
      </>
    );
  }

  const year = years.find((y) => y.id === (d.year?.id ?? currentYearId));
  const active = quarter ?? d.quarter;
  const anyOpen = Boolean(year?.periods.some((p) => p.status === 'OPEN'));
  const activeProgress = d.progress.find((p) => p.quarter === active);
  const maxBand = Math.max(1, ...d.distribution.map((x) => x.count));

  return (
    <>
      <PageHeader title="Dashboard" sub={`School year ${d.year.name}`} actions={<QuarterPicker value={active} onChange={setQuarter} />} />

      <GettingStarted
        admin={user.role === 'ADMIN'}
        steps={[
          { done: Boolean(school.principalName), label: 'Fill in the school profile', hint: 'School head, registrar and logo appear on report cards.', to: '/setup/school', adminOnly: true },
          { done: false, label: 'Check the curriculum', hint: 'Make sure the strands and subjects match what your school offers.', to: '/setup/curriculum', adminOnly: true, optional: true },
          { done: d.counts.teachers > 0, label: 'Add the teachers', hint: 'Each gets a username and a one-time password.', to: '/setup/users', adminOnly: true },
          { done: d.counts.sections > 0, label: 'Create the sections', hint: 'Class records are created from the curriculum, then assign a teacher to each.', to: '/sections' },
          { done: d.counts.enrolled > 0, label: 'Enroll the learners', hint: 'Import a class list or add learners one by one.', to: '/learners' },
          { done: anyOpen, label: 'Open Quarter 1 for encoding', hint: 'Teachers can enter scores only while a quarter is open.', to: '/setup/years' },
        ]}
      />

      <div className="mb-4 flex flex-col gap-2">
        {d.pendingApprovals > 0 ? (
          <Alert tone="info" title={`${d.pendingApprovals} class record${d.pendingApprovals === 1 ? '' : 's'} waiting for approval`} action={<Link to="/approvals"><Button size="sm" variant="primary" icon={<ClipboardCheck className="size-4" />}>Review</Button></Link>} />
        ) : null}
        {d.pendingReopen > 0 ? (
          <Alert tone="warn" title={`${d.pendingReopen} request${d.pendingReopen === 1 ? '' : 's'} to reopen an approved record`} action={<Link to="/approvals"><Button size="sm">Open</Button></Link>} />
        ) : null}
        {d.counts.unassignedClasses > 0 ? (
          <Alert tone="warn" title={`${d.counts.unassignedClasses} class${d.counts.unassignedClasses === 1 ? ' has' : 'es have'} no teacher yet`} action={<Link to="/classes?unassigned=true"><Button size="sm">Assign</Button></Link>} />
        ) : null}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Learners enrolled" value={d.counts.enrolled} />
        <Stat label="Sections" value={d.counts.sections} />
        <Stat label="Teachers" value={d.counts.teachers} />
        <Stat label="Class records" value={d.counts.classes} sub={d.counts.unassignedClasses ? `${d.counts.unassignedClasses} without a teacher` : 'All assigned'} tone={d.counts.unassignedClasses ? 'warn' : 'neutral'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle sub="Class records per quarter">Grading progress</CardTitle>
          <div className="flex flex-col gap-4">
            {d.progress.map((p) => {
              const per = year?.periods.find((x) => x.quarter === p.quarter);
              return (
                <div key={p.quarter} className={cx('rounded-lg p-3', p.quarter === active && 'bg-surface-2')}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Quarter {p.quarter}</span>
                      <Badge tone={p.periodStatus === 'OPEN' ? 'ok' : 'neutral'}>{p.periodStatus === 'OPEN' ? 'Open for encoding' : 'Closed'}</Badge>
                      {p.released ? <Badge tone="brand">Released to learners</Badge> : null}
                    </div>
                    {per ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" loading={period.isPending && period.variables?.id === per.id && period.variables.status !== undefined} icon={per.status === 'OPEN' ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />} onClick={() => period.mutate({ id: per.id, status: per.status === 'OPEN' ? 'CLOSED' : 'OPEN' })}>
                          {per.status === 'OPEN' ? 'Close' : 'Open'}
                        </Button>
                        <Button size="sm" loading={period.isPending && period.variables?.id === per.id && period.variables.released !== undefined} icon={<Send className="size-3.5" />} onClick={() => period.mutate({ id: per.id, released: !per.released })}>
                          {per.released ? 'Withdraw' : 'Release'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <Progress
                    total={p.total}
                    parts={[
                      { value: p.approved, className: 'bg-ok', label: 'Approved' },
                      { value: p.submitted, className: 'bg-info', label: 'Submitted' },
                      { value: p.returned, className: 'bg-warn', label: 'Returned' },
                    ]}
                  />
                  <p className="mt-1.5 text-xs text-muted tnum">
                    {p.approved} approved · {p.submitted} submitted · {p.returned} returned · {p.draft} not submitted (of {p.total})
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardTitle sub={`Quarter ${active}, all recorded grades`}>Grade distribution</CardTitle>
            {d.gradesRecorded === 0 ? (
              <p className="py-4 text-sm text-muted">No quarterly grades computed yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {d.distribution.map((b, i) => (
                  <div key={b.label}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span>
                        {b.label} <span className="text-muted">({b.min === 0 ? 'below 75' : `${b.min}-${b.max}`})</span>
                      </span>
                      <span className="font-medium tnum">{b.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className={cx('h-full rounded-full', i === 4 ? 'bg-bad' : 'bg-brand')} style={{ width: `${(b.count / maxBand) * 100}%`, opacity: i === 4 ? 1 : 1 - i * 0.15 }} />
                    </div>
                  </div>
                ))}
                <p className="mt-1 text-xs text-muted">
                  {d.learnersWithFailingGrade} learner{d.learnersWithFailingGrade === 1 ? '' : 's'} with at least one grade below 75.
                </p>
              </div>
            )}
            {activeProgress && activeProgress.approved < activeProgress.total ? <p className="mt-2 text-xs text-muted">Includes grades not approved yet.</p> : null}
          </Card>

          <Card>
            <CardTitle>Enrollment</CardTitle>
            {d.enrollment.length === 0 ? (
              <p className="text-sm text-muted">No learners enrolled yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {d.enrollment.map((e) => (
                    <tr key={`${e.gradeLevel}${e.strand}`} className="border-t border-line first:border-0">
                      <td className="py-1.5">Grade {e.gradeLevel}</td>
                      <td className="py-1.5 text-muted">{e.strand}</td>
                      <td className="py-1.5 text-right font-medium tnum">{e.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

interface Step {
  done: boolean;
  label: string;
  hint: string;
  to: string;
  adminOnly?: boolean;
  optional?: boolean;
}

/** Shown to a new school until the basics are in place. */
function GettingStarted({ steps, admin }: { steps: Step[]; admin: boolean }) {
  const required = steps.filter((s) => !s.optional);
  if (required.every((s) => s.done)) return null;
  const doneCount = required.filter((s) => s.done).length;
  return (
    <Card className="mb-4">
      <CardTitle sub={`${doneCount} of ${required.length} done`}>Getting started</CardTitle>
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const allowed = admin || !s.adminOnly;
          const row = (
            <div className={cx('flex items-start gap-3 rounded-lg p-2', allowed && !s.done && 'hover:bg-surface-2')}>
              {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className={cx('text-sm font-medium', s.done && 'text-muted line-through')}>
                  {i + 1}. {s.label} {s.optional ? <span className="font-normal text-muted">(optional)</span> : null}
                </p>
                <p className="text-xs text-muted">{allowed ? s.hint : `${s.hint} (administrator)`}</p>
              </div>
              {allowed && !s.done ? <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> : null}
            </div>
          );
          return <li key={s.label}>{allowed && !s.done ? <Link to={s.to}>{row}</Link> : row}</li>;
        })}
      </ol>
    </Card>
  );
}

// ------------------------------------------------------------------ teacher

function AtRiskCard({ sectionId }: { sectionId?: number }) {
  const q = useQuery({ queryKey: ['at-risk', sectionId ?? 'mine'], queryFn: () => get<AtRisk>(`/at-risk${qs({ sectionId })}`) });
  if (q.isPending) return null;
  if (q.isError || !q.data.learners.length) return null;
  return (
    <Card className="mt-4">
      <CardTitle sub={`Quarter ${q.data.quarter}: grade below ${q.data.passing}`}>Learners who need help</CardTitle>
      <ul className="divide-y divide-line">
        {q.data.learners.slice(0, 12).map((l) => (
          <li key={l.enrollmentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium">{shortName(l.learner)}</p>
              <p className="text-xs text-muted">{l.section}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {l.subjects.map((s) => (
                <Badge key={s.subject} tone="bad">
                  {s.subject}: {s.grade}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeacherDashboard() {
  const { advisory } = useSession();
  const q = useQuery({ queryKey: ['dashboard', 'teacher'], queryFn: () => get<DashboardData>('/dashboard') });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  if (d.kind !== 'teacher' || !d.year) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty title="No school year yet">The administrator has not created a school year.</Empty>
      </>
    );
  }
  const todo = d.classes.filter((c) => c.statuses.some((s) => d.openQuarters.includes(s.quarter) && (s.status === 'DRAFT' || s.status === 'RETURNED')));

  return (
    <>
      <PageHeader title="Dashboard" sub={`School year ${d.year.name}`} />
      <div className="mb-4 flex flex-col gap-2">
        {d.openQuarters.length ? (
          <Alert tone="info" title={`Quarter ${d.openQuarters.join(' and ')} ${d.openQuarters.length > 1 ? 'are' : 'is'} open for encoding`}>
            {todo.length ? `${todo.length} of your class records still need scores or a submission.` : 'All your open class records are submitted.'}
          </Alert>
        ) : (
          <Alert tone="warn" title="No quarter is open for encoding right now">You can look at your records, but scores cannot be changed until the registrar opens a quarter.</Alert>
        )}
        {d.classes.some((c) => c.statuses.some((s) => s.status === 'RETURNED')) ? (
          <Alert tone="warn" title="A class record was returned to you">Open the record marked Returned, read the note and fix it.</Alert>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub={`${d.classes.length} class${d.classes.length === 1 ? '' : 'es'}`} action={<Link to="/classes" className="flex items-center gap-1 text-sm font-medium text-brand">All <ArrowRight className="size-4" /></Link>}>
            My classes
          </CardTitle>
          {d.classes.length === 0 ? (
            <Empty title="No classes assigned yet" icon={<BookOpenCheck className="size-8" />}>The registrar assigns subjects and sections to teachers.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {d.classes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <Link to={`/classes/${c.id}?quarter=${d.openQuarters.find((oq) => (oq <= 2 ? 1 : 2) === c.semester) ?? (c.semester === 1 ? 1 : 3)}`} className="min-w-0">
                    <p className="truncate font-medium hover:text-brand">{c.subject}</p>
                    <p className="text-xs text-muted">
                      Grade {c.section} · {c.strand} · {c.learners} learners · Sem {c.semester}
                    </p>
                  </Link>
                  <QuarterPills classId={c.id} statuses={c.statuses} semester={c.semester} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>My advisory</CardTitle>
            {d.advisory.length === 0 ? (
              <p className="text-sm text-muted">You are not a class adviser this year.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.advisory.map((s) => (
                  <li key={s.id}>
                    <Link to={`/advisory/${s.id}`} className="flex items-center justify-between rounded-lg border border-line p-3 hover:bg-surface-2">
                      <span>
                        <span className="block font-medium">Grade {s.gradeLevel} - {s.name}</span>
                        <span className="text-xs text-muted">{s.strand} · {s.learners} learners</span>
                      </span>
                      <Users className="size-5 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {d.pendingRequests > 0 ? (
            <Alert tone="info" title={`${d.pendingRequests} reopen request${d.pendingRequests === 1 ? '' : 's'} waiting`}>The registrar has not answered yet.</Alert>
          ) : null}
        </div>
      </div>
      {advisory[0] ? <AtRiskCard sectionId={advisory[0].id} /> : <AtRiskCard />}
    </>
  );
}
