import { DESCRIPTORS, HONORS_LABEL, MONTH_NAME, descriptorFor } from '@bnhs/core';
import { useQuery } from '@tanstack/react-query';
import { Award, FileText, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GradeChip, TermPicker } from '../components/bits';
import { Alert, Badge, Button, Card, CardTitle, Empty, PageHeader, Select, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { downloadReport, get, qs } from '../lib/api';
import { useSession } from '../lib/auth';
import { dateLabel, learnerName } from '../lib/format';
import type { Card as GradeCard, Learner } from '../lib/types';

interface Me extends Learner {
  enrollments: Array<{ id: number; schoolYear: string; status: string; gradeLevel: number; section: string; strand: string; adviser: string | null }>;
}

/** Learner and parent view of released report card grades. */
export default function MyGradesPage() {
  const { school } = useSession();
  const toast = useToast();
  const me = useQuery({ queryKey: ['me-learner'], queryFn: () => get<Me>('/me/learner') });
  const [enrollmentId, setEnrollmentId] = useState<number | null>(null);
  const [term, setTerm] = useState(1);

  useEffect(() => {
    if (me.data && enrollmentId == null && me.data.enrollments[0]) setEnrollmentId(me.data.enrollments[0].id);
  }, [me.data, enrollmentId]);

  const card = useQuery({
    queryKey: ['me-card', enrollmentId, term],
    queryFn: () => get<GradeCard>(`/me/enrollments/${enrollmentId}/card?term=${term}`),
    enabled: enrollmentId != null,
  });

  if (me.isPending) return <Spinner />;
  if (me.isError) return <Alert tone="bad">{errorMessage(me.error)}</Alert>;
  const l = me.data;
  if (!l.enrollments.length) {
    return (
      <>
        <PageHeader title={learnerName(l)} sub={`LRN ${l.lrn}`} />
        <Card><Empty title="Not enrolled yet">Once the registrar enrolls you in a section, your grades appear here.</Empty></Card>
      </>
    );
  }
  const c = card.data;
  const anyGrade = c?.subjects.some((s) => s.grade != null);

  return (
    <>
      <PageHeader
        title={learnerName(l)}
        sub={`LRN ${l.lrn}`}
        actions={
          <>
            {l.enrollments.length > 1 ? (
              <Select aria-label="School year" className="w-auto" value={enrollmentId ?? ''} onChange={(e) => setEnrollmentId(Number(e.target.value))}>
                {l.enrollments.map((e) => <option key={e.id} value={e.id}>SY {e.schoolYear}: Grade {e.gradeLevel}</option>)}
              </Select>
            ) : null}
            <TermPicker value={term} onChange={setTerm} />
          </>
        }
      />

      {card.isPending ? (
        <Spinner />
      ) : card.isError ? (
        <Alert tone="bad">{errorMessage(card.error)}</Alert>
      ) : c ? (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Grade {c.section.gradeLevel} - {c.section.name} · {c.section.strandName}</p>
                <p className="text-sm text-muted">SY {c.schoolYear.name} · Term {term} · Adviser: {c.section.adviser ?? '-'}</p>
              </div>
              {anyGrade ? (
                <Button icon={<FileText className="size-4" />} onClick={() => downloadReport(`/reports/sf9${qs({ enrollmentId, term })}`, `ReportCard_Term${term}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
                  Download report card (PDF)
                </Button>
              ) : null}
            </div>
          </Card>

          {!anyGrade ? (
            <Card><Empty title="No grades released yet" icon={<Lock className="size-8" />}>Grades appear here after your teachers submit them, the registrar approves them and the school releases the term.</Empty></Card>
          ) : (
            <>
              {c.hasHidden ? <Alert tone="info">Some grades are not released yet. They will appear here when the school releases the term.</Alert> : null}
              <TableWrap>
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th className={thCls}>Subject</th>
                      <th className={thCls + ' text-center'}>Term {c.term} grade</th>
                      <th className={thCls}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.subjects.map((s) => (
                      <tr key={s.classId}>
                        <td className={tdCls + ' font-medium'}>{s.name}</td>
                        <td className={tdCls + ' text-center text-base'}><GradeChip value={s.grade} passing={school.passingGrade} /></td>
                        <td className={tdCls}>
                          {s.grade != null ? (
                            <span className="inline-flex items-center gap-2">
                              {s.remark === 'PASSED' ? <Badge tone="ok">Passed</Badge> : <Badge tone="bad">Failed</Badge>}
                              <span className="text-xs text-muted">{descriptorFor(s.grade)}</span>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className={tdCls + ' font-semibold'} colSpan={1}>General average for the term</td>
                      <td className={tdCls + ' text-center text-lg font-semibold'}><GradeChip value={c.generalAverage} passing={school.passingGrade} /></td>
                      <td className={tdCls}>{c.honors ? <Badge tone="brand"><Award className="size-3" />{HONORS_LABEL[c.honors]}</Badge> : null}</td>
                    </tr>
                  </tbody>
                </table>
              </TableWrap>

              <Card>
                <CardTitle sub="Grading scale (DepEd Order No. 8, s. 2015)">Descriptors</CardTitle>
                <div className="flex flex-wrap gap-2 text-xs">
                  {DESCRIPTORS.map((d) => <Badge key={d.label}>{d.label}: {d.min === 0 ? `below ${school.passingGrade}` : `${d.min}-${d.max}`}</Badge>)}
                </div>
              </Card>

              {c.attendance.some((m) => m.present != null) ? (
                <Card>
                  <CardTitle>Attendance</CardTitle>
                  <TableWrap>
                    <table className={tableCls}>
                      <thead>
                        <tr><th className={thCls}>Month</th><th className={thCls + ' text-center'}>School days</th><th className={thCls + ' text-center'}>Present</th><th className={thCls + ' text-center'}>Absent</th><th className={thCls + ' text-center'}>Tardy</th></tr>
                      </thead>
                      <tbody>
                        {c.attendance.filter((m) => m.present != null).map((m) => (
                          <tr key={`${m.year}-${m.month}`}>
                            <td className={tdCls}>{MONTH_NAME[m.month]} {m.year}</td>
                            <td className={tdCls + ' text-center tnum'}>{m.schoolDays ?? '-'}</td>
                            <td className={tdCls + ' text-center tnum'}>{m.present}</td>
                            <td className={tdCls + ' text-center tnum'}>{m.absent ?? '-'}</td>
                            <td className={tdCls + ' text-center tnum'}>{m.tardy ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </Card>
              ) : null}
            </>
          )}
          <p className="text-xs text-muted">Born {dateLabel(l.birthDate)}. If something looks wrong, tell your class adviser.</p>
        </div>
      ) : null}
    </>
  );
}
