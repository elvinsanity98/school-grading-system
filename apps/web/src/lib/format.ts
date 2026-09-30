import { formatLearnerName, MONTH_NAME } from '@bnhs/core';
import type { LearnerBrief } from './types';

export const learnerName = (l: Pick<LearnerBrief, 'lastName' | 'firstName' | 'middleName' | 'extName'>): string => formatLearnerName(l);

/** "Reyes, Ana D." for tight spaces. */
export function shortName(l: Pick<LearnerBrief, 'lastName' | 'firstName' | 'middleName'>): string {
  const mi = l.middleName?.trim() ? ` ${l.middleName.trim()[0]!.toUpperCase()}.` : '';
  return `${l.lastName}, ${l.firstName}${mi}`;
}

/** Numbers as they appear on a class record: trim trailing zeros, keep at most 2 decimals. */
export function num(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '';
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

export function fixed2(n: number | null | undefined): string {
  return n == null ? '' : n.toFixed(2);
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const monthName = (m: number): string => MONTH_NAME[m] ?? '';

export const ordinal = (n: number): string => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

export const gradeLabel = (level: number, section: string): string => `${level} - ${section}`;

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
