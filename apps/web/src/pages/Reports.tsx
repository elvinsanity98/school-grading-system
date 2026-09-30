import { HONORS_LABEL, type HonorsLevel } from '@bnhs/core';
import { useQuery } from '@tanstack/react-query';
import { Award, Download, FileText, FileSpreadsheet, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { SemesterPicker, YearSelect, sectionLabel, useSections, useYearChoice } from '../components/bits';
import { Alert, Badge, Button, Card, CardTitle, Empty, Field, PageHeader, Select, Spinner, TableWrap, errorMessage, tableCls, tdCls, thCls, useToast } from '../components/ui';
import { downloadReport, get, qs } from '../lib/api';
import { shortName } from '../lib/format';
import type { LearnerBrief } from '../lib/types';

interface HonorsData {
  schoolYear: string;
  semester: number;
  count: number;
  rows: Array<LearnerBrief & { grade: number; section: string; generalAverage: number; honors: HonorsLevel }>;
}

export default function ReportsPage() {
  const toast = useToast();
  const { yearId, setYearId } = useYearChoice();
  const sections = useSections(yearId);
  const [sectionId, setSectionId] = useState('');
  const [semester, setSemester] = useState(1);
  const [grade, setGrade] = useState('');
  const fail = (e: unknown) => toast.error(errorMessage(e));

  const honors = useQuery({
    queryKey: ['honors', yearId, semester, grade],
    queryFn: () => get<HonorsData>(`/reports/honors${qs({ schoolYearId: yearId, semester, gradeLevel: grade })}`),
    enabled: yearId != null,
  });

  return (
    <>
      <PageHeader title="Reports" sub="Report cards, summaries and lists. PDF files open in a new tab; Excel files download." actions={<YearSelect value={yearId} onChange={setYearId} />} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Pick a section and a semester">Section reports</CardTitle>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Section">
                {(id) => (
                  <Select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                    <option value="">Choose a section</option>
                    {sections.data?.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
                  </Select>
                )}
              </Field>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-medium">Semester</span>
                <SemesterPicker value={semester} onChange={setSemester} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={!sectionId} icon={<FileText className="size-4" />} variant="primary" onClick={() => downloadReport(`/reports/sf9-section${qs({ sectionId, semester })}`, `SF9_Sem${semester}.pdf`).catch(fail)}>
                Report cards (SF9), all learners
              </Button>
              <Button disabled={!sectionId} icon={<FileText className="size-4" />} onClick={() => downloadReport(`/reports/sf9-section${qs({ sectionId, semester, draft: 1 })}`, `SF9_DRAFT_Sem${semester}.pdf`).catch(fail)}>
                Draft copies (unofficial)
              </Button>
              <Button disabled={!sectionId} icon={<FileSpreadsheet className="size-4" />} onClick={() => downloadReport(`/reports/section-summary${qs({ sectionId, semester })}`, `Summary_Sem${semester}.xlsx`).catch(fail)}>
                Summary of grades (Excel)
              </Button>
              <Button disabled={!sectionId} icon={<FileSpreadsheet className="size-4" />} onClick={() => downloadReport(`/reports/masterlist${qs({ sectionId })}`, 'Masterlist.xlsx').catch(fail)}>
                Master list (Excel)
              </Button>
            </div>
            <p className="text-xs text-muted">Official copies use approved grades only.</p>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Learners of the school, one at a time">Permanent record (SF10)</CardTitle>
          <div className="flex flex-col items-start gap-3 text-sm">
            <p className="text-muted">Open a learner from the Learners page and press <b className="text-ink">SF10 record</b>. It lists every approved semester in this school and any records you encoded from previous schools.</p>
            <Link to="/learners"><Button icon={<GraduationCap className="size-4" />}>Go to learners</Button></Link>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle
            sub="General average and no subject below the minimum (DO 36, s. 2016). Confirm good conduct separately."
            action={
              <Button size="sm" icon={<Download className="size-4" />} disabled={!honors.data?.count} onClick={() => downloadReport(`/reports/honors${qs({ schoolYearId: yearId, semester, gradeLevel: grade, format: 'xlsx' })}`, 'Honors.xlsx').catch(fail)}>
                Excel
              </Button>
            }
          >
            Honor roll
          </CardTitle>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SemesterPicker value={semester} onChange={setSemester} />
            <Select aria-label="Grade level" className="w-auto" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">All grade levels</option>
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </Select>
          </div>
          {honors.isPending ? (
            <Spinner />
          ) : honors.isError ? (
            <Alert tone="bad">{errorMessage(honors.error)}</Alert>
          ) : honors.data.rows.length === 0 ? (
            <Empty title="No honor students yet" icon={<Award className="size-8" />}>Honors are computed from approved grades once both quarters of the semester are approved.</Empty>
          ) : (
            <TableWrap>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>#</th>
                    <th className={thCls}>Learner</th>
                    <th className={thCls}>Section</th>
                    <th className={thCls + ' text-center'}>General average</th>
                    <th className={thCls}>Award</th>
                  </tr>
                </thead>
                <tbody>
                  {honors.data.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className={tdCls + ' text-muted tnum'}>{i + 1}</td>
                      <td className={tdCls + ' font-medium'}>{shortName(r)}</td>
                      <td className={tdCls}>{r.grade} - {r.section}</td>
                      <td className={tdCls + ' text-center font-semibold tnum'}>{r.generalAverage}</td>
                      <td className={tdCls}><Badge tone="brand"><Award className="size-3" />{HONORS_LABEL[r.honors]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
