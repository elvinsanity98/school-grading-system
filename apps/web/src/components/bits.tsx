import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { SEMESTER_LABEL, semesterOfQuarter } from '@bnhs/core';
import { cx, Segmented, Select } from './ui';
import { get } from '../lib/api';
import { useSession } from '../lib/auth';
import type { ClassStatus, SectionRow } from '../lib/types';

const PILL: Record<string, string> = {
  DRAFT: 'bg-surface-2 text-muted',
  SUBMITTED: 'bg-info-soft text-info',
  APPROVED: 'bg-ok-soft text-ok',
  RETURNED: 'bg-warn-soft text-warn',
};
const PILL_TITLE: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'Submitted', APPROVED: 'Approved', RETURNED: 'Returned for corrections' };

/** Four little Q1-Q4 chips showing where each quarter of a class stands. */
export function QuarterPills({ classId, statuses, semester }: { classId: number; statuses: ClassStatus[]; semester?: number }) {
  return (
    <div className="flex gap-1">
      {statuses
        .filter((s) => (semester ? semesterOfQuarter(s.quarter) === semester : true))
        .map((s) => (
          <Link
            key={s.quarter}
            to={`/classes/${classId}?quarter=${s.quarter}`}
            title={`Quarter ${s.quarter}: ${PILL_TITLE[s.status] ?? s.status}`}
            className={cx('rounded-md px-2 py-1 text-xs font-semibold tnum', PILL[s.status] ?? PILL.DRAFT)}
          >
            Q{s.quarter}
          </Link>
        ))}
    </div>
  );
}

export function QuarterPicker({ value, onChange, quarters = [1, 2, 3, 4], openQuarters }: { value: number; onChange: (q: number) => void; quarters?: number[]; openQuarters?: number[] }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={quarters.map((q) => ({ id: q, label: `Q${q}${openQuarters?.includes(q) ? ' •' : ''}`, title: openQuarters?.includes(q) ? 'Open for encoding' : undefined }))}
    />
  );
}

export function SemesterPicker({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { id: 1, label: SEMESTER_LABEL[1] },
        { id: 2, label: SEMESTER_LABEL[2] },
      ]}
    />
  );
}

const YEAR_KEY = 'bnhs.year';
const subscribeYear = (cb: () => void) => {
  window.addEventListener('bnhs:year', cb);
  return () => window.removeEventListener('bnhs:year', cb);
};
const readYear = () => Number(sessionStorage.getItem(YEAR_KEY) ?? 0);

/** School year choice that survives navigation; defaults to the current school year. */
export function useYearChoice(): { yearId: number | null; setYearId: (id: number) => void } {
  const { years, currentYearId } = useSession();
  const stored = useSyncExternalStore(subscribeYear, readYear);
  const yearId = years.some((y) => y.id === stored) ? stored : currentYearId;
  return {
    yearId,
    setYearId: (id: number) => {
      sessionStorage.setItem(YEAR_KEY, String(id));
      window.dispatchEvent(new Event('bnhs:year'));
    },
  };
}

export function YearSelect({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const { years } = useSession();
  if (years.length <= 1) return null;
  return (
    <Select aria-label="School year" className="w-auto" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          SY {y.name}
        </option>
      ))}
    </Select>
  );
}

export function useSections(yearId: number | null) {
  return useQuery({
    queryKey: ['sections', yearId],
    queryFn: () => get<SectionRow[]>(`/sections?schoolYearId=${yearId}`),
    enabled: yearId != null,
  });
}

export const sectionLabel = (s: { gradeLevel: number; name: string; strand?: { code: string } | string }): string => {
  const strand = typeof s.strand === 'string' ? s.strand : s.strand?.code;
  return `${s.gradeLevel} - ${s.name}${strand ? ` (${strand})` : ''}`;
};

export function GradeChip({ value, passing = 75 }: { value: number | null | undefined; passing?: number }) {
  if (value == null) return <span className="text-muted">-</span>;
  return <span className={cx('tnum font-semibold', value < passing && 'text-bad')}>{value}</span>;
}
