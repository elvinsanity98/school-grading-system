import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { StatusPill, TermPicker, YearSelect, sectionLabel, useSections, useYearChoice } from '../components/bits';
import { Alert, Card, Checkbox, Empty, PageHeader, Select, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { get, put, qs } from '../lib/api';
import { useSession, isOfficeRole } from '../lib/auth';
import type { ClassRow, Teacher } from '../lib/types';

export default function ClassesPage() {
  const { user } = useSession();
  const office = isOfficeRole(user.role);
  const { yearId, setYearId } = useYearChoice();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(1);
  const sectionId = params.get('sectionId') ? Number(params.get('sectionId')) : undefined;
  const unassigned = params.get('unassigned') === 'true';
  const toast = useToast();
  const qc = useQueryClient();

  const sections = useSections(office ? yearId : null);
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: () => get<Teacher[]>('/teachers'), enabled: office });
  const classes = useQuery({
    queryKey: ['classes', yearId, term, sectionId, unassigned],
    queryFn: () => get<ClassRow[]>(`/classes${qs({ schoolYearId: yearId, term, sectionId, unassigned: unassigned || undefined })}`),
    enabled: yearId != null,
  });

  const assign = useMutation({
    mutationFn: (v: { id: number; teacherId: number | null }) => put(`/classes/${v.id}`, { teacherId: v.teacherId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.ok('Teacher assigned.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title={office ? 'Classes and teaching loads' : 'My classes'}
        sub={office ? 'Every subject taught to a section, with its teacher.' : 'Open a class to encode scores.'}
        actions={
          <>
            {office ? <YearSelect value={yearId} onChange={setYearId} /> : null}
            <TermPicker value={term} onChange={setTerm} />
          </>
        }
      />

      {office ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Select aria-label="Section" className="w-auto" value={sectionId ?? ''} onChange={(e) => setParam('sectionId', e.target.value || null)}>
            <option value="">All sections</option>
            {sections.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s)}
              </option>
            ))}
          </Select>
          <Checkbox checked={unassigned} onChange={(e) => setParam('unassigned', e.target.checked ? 'true' : null)} label="Only classes without a teacher" />
        </div>
      ) : null}

      {classes.isPending ? (
        <Spinner />
      ) : classes.isError ? (
        <Alert tone="bad">{errorMessage(classes.error)}</Alert>
      ) : classes.data.length === 0 ? (
        <Card>
          <Empty title={office ? 'No classes found' : 'No classes assigned to you'} icon={<BookOpenCheck className="size-8" />}>
            {office ? 'Create sections first. Classes are made from the curriculum.' : 'When the registrar gives you a subject and section for this term it appears here.'}
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Subject</th>
                <th className={thCls}>Section</th>
                {office ? <th className={thCls}>Teacher</th> : <th className={thCls + ' text-right'}>Learners</th>}
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {classes.data.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <td className={tdCls}>
                    <Link to={`/classes/${c.id}`} className="font-medium hover:text-brand">
                      {c.subject.name}
                    </Link>
                    <p className="text-xs text-muted">{c.subject.code}</p>
                  </td>
                  <td className={tdCls}>
                    Grade {c.section.gradeLevel} - {c.section.name}
                    <p className="text-xs text-muted">
                      {c.section.strand} · {c.section.learners} learners
                    </p>
                  </td>
                  {office ? (
                    <td className={tdCls}>
                      <Select aria-label={`Teacher for ${c.subject.name}`} className="h-9 min-w-44" value={c.teacher?.id ?? ''} onChange={(e) => assign.mutate({ id: c.id, teacherId: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">- not assigned -</option>
                        {teachers.data?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fullName}
                          </option>
                        ))}
                      </Select>
                    </td>
                  ) : (
                    <td className={tdCls + ' text-right tnum'}>{c.section.learners}</td>
                  )}
                  <td className={tdCls}>
                    <StatusPill classId={c.id} status={c.status} term={c.term} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
