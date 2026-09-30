import { deliverFile } from './platform';

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF, and a comma / semicolon / tab delimiter. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // A text cell that starts with = + - @ is run as a formula when the file is opened in Excel.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export async function saveCsv(filename: string, rows: unknown[][]): Promise<void> {
  // BOM so Excel opens accented names correctly
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  await deliverFile(blob, filename);
}

/** Header names people might use in a class list, mapped to our field names. */
const HEADER_ALIASES: Record<string, string> = {
  lrn: 'lrn',
  'learner reference number': 'lrn',
  lastname: 'lastName',
  'last name': 'lastName',
  surname: 'lastName',
  apelyido: 'lastName',
  firstname: 'firstName',
  'first name': 'firstName',
  'given name': 'firstName',
  pangalan: 'firstName',
  middlename: 'middleName',
  'middle name': 'middleName',
  extname: 'extName',
  'name extension': 'extName',
  extension: 'extName',
  suffix: 'extName',
  sex: 'sex',
  gender: 'sex',
  birthdate: 'birthDate',
  'birth date': 'birthDate',
  'date of birth': 'birthDate',
  birthday: 'birthDate',
  address: 'address',
  guardian: 'guardianName',
  'guardian name': 'guardianName',
  'parent/guardian': 'guardianName',
  'parent or guardian': 'guardianName',
  contact: 'guardianContact',
  'contact no': 'guardianContact',
  'contact number': 'guardianContact',
  'guardian contact': 'guardianContact',
};

export interface ImportRow {
  lrn: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  extName?: string;
  sex: string;
  birthDate: string;
  address?: string;
  guardianName?: string;
  guardianContact?: string;
}

/** Turns spreadsheet rows (first row = headers) into learner objects. Unknown columns are ignored. */
export function learnersFromCsv(rows: string[][]): { rows: ImportRow[]; missing: string[] } {
  const [head, ...body] = rows;
  if (!head) return { rows: [], missing: ['lrn', 'lastName', 'firstName', 'sex', 'birthDate'] };
  const fields = head.map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[_*]/g, ' ').replace(/\s+/g, ' ').trim()] ?? HEADER_ALIASES[h.toLowerCase().replace(/[\s_*]/g, '')] ?? '');
  const missing = ['lrn', 'lastName', 'firstName', 'sex', 'birthDate'].filter((f) => !fields.includes(f));
  const out = body.map((r) => {
    const o: Record<string, string> = {};
    fields.forEach((f, i) => {
      if (f) o[f] = r[i] ?? '';
    });
    return { lrn: '', lastName: '', firstName: '', sex: '', birthDate: '', ...o } as ImportRow;
  });
  return { rows: out, missing };
}

export const LEARNER_CSV_TEMPLATE: string[][] = [
  ['LRN', 'Last Name', 'First Name', 'Middle Name', 'Ext Name', 'Sex', 'Birthdate', 'Address', 'Guardian', 'Contact No'],
  ['123456789012', 'Dela Cruz', 'Juan', 'Santos', '', 'M', '2009-03-25', 'Sample Barangay, Sample Town', 'Maria Dela Cruz', '09171234567'],
];
