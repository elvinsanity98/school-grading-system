import { HONORS_LABEL, COMPONENT_LABEL, formatLearnerName, type Component, type HonorsLevel } from '@bnhs/core';
import ExcelJS from 'exceljs';
import type { RecordData } from '../services/record';

const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const BAND_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
};

function boxed(cell: ExcelJS.Cell, opts: { bold?: boolean; fill?: ExcelJS.Fill; align?: 'left' | 'center' | 'right'; wrap?: boolean } = {}) {
  cell.border = THIN;
  cell.font = { bold: opts.bold ?? false, size: 10 };
  if (opts.fill) cell.fill = opts.fill;
  cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: opts.wrap ?? false };
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  wb.creator = 'BNHS SHS Grading System';
  wb.created = new Date();
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ------------------------------------------------------------------ class record

export interface ClassRecordMeta {
  school: string;
  schoolYear: string;
  subject: string;
  section: string;
  strand: string;
  teacher: string;
  term: number;
  status: string;
}

export async function classRecordXlsx(meta: ClassRecordMeta, data: RecordData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Term ${meta.term} Class Record`.slice(0, 31), {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 8 }],
    pageSetup: { orientation: 'landscape', paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const comps: Component[] = ['WW', 'PT', 'QA'];
  const itemsBy = (c: Component) => data.items.filter((i) => i.component === c);
  const weightOf = (c: Component) => (c === 'WW' ? data.weights.ww : c === 'PT' ? data.weights.pt : data.weights.qa);

  // Column map: 1 No., 2 LRN, 3 Name, then per component: items..., Total, PS, WS
  let col = 4;
  const layout = comps.map((c) => {
    const items = itemsBy(c);
    const start = col;
    col += items.length;
    const totalCol = col++;
    const psCol = col++;
    const wsCol = col++;
    return { c, items, start, totalCol, psCol, wsCol, end: wsCol };
  });
  const initialCol = col++;
  const termCol = col++;
  const lastCol = termCol;

  const put = (r: number, c: number, v: ExcelJS.CellValue, style: Parameters<typeof boxed>[1] = {}) => {
    const cell = ws.getCell(r, c);
    cell.value = v;
    boxed(cell, style);
    return cell;
  };

  ws.mergeCells(1, 1, 1, Math.max(lastCol, 10));
  ws.getCell(1, 1).value = meta.school.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, Math.max(lastCol, 10));
  ws.getCell(2, 1).value = `CLASS RECORD  -  ${meta.schoolYear}  -  Term ${meta.term}`;
  ws.getCell(2, 1).font = { bold: true, size: 11 };
  ws.getCell(3, 1).value = `Subject: ${meta.subject}`;
  ws.getCell(3, 1).font = { bold: true };
  ws.getCell(4, 1).value = `Section: ${meta.section}  (${meta.strand})     Teacher: ${meta.teacher || '-'}     Weights: WW ${data.weights.ww}% / PT ${data.weights.pt}% / QA ${data.weights.qa}%     Status: ${meta.status}`;

  // header rows 6-8
  put(6, 1, 'No.', { bold: true, fill: HEAD_FILL, align: 'center' });
  put(6, 2, 'LRN', { bold: true, fill: HEAD_FILL, align: 'center' });
  put(6, 3, "LEARNERS' NAMES", { bold: true, fill: HEAD_FILL, align: 'center' });
  for (const r of [7, 8]) for (const c of [1, 2, 3]) put(r, c, null, { fill: HEAD_FILL });
  ws.mergeCells(6, 1, 7, 1);
  ws.mergeCells(6, 2, 7, 2);
  ws.mergeCells(6, 3, 7, 3);
  put(8, 3, 'Highest Possible Score', { bold: true, fill: HEAD_FILL, align: 'right' });

  for (const l of layout) {
    const width = l.end - l.start + 1;
    for (let c = l.start; c <= l.end; c++) put(6, c, null, { bold: true, fill: HEAD_FILL, align: 'center' });
    ws.getCell(6, l.start).value = `${COMPONENT_LABEL[l.c]} (${weightOf(l.c)}%)`;
    if (width > 1) ws.mergeCells(6, l.start, 6, l.end);
    l.items.forEach((it, i) => {
      put(7, l.start + i, it.title, { bold: true, fill: HEAD_FILL, align: 'center', wrap: true });
      put(8, l.start + i, it.hps, { bold: true, fill: HEAD_FILL, align: 'center' });
    });
    const hpsTotal = l.items.reduce((s, i) => s + i.hps, 0);
    put(7, l.totalCol, 'Total', { bold: true, fill: HEAD_FILL, align: 'center' });
    put(8, l.totalCol, hpsTotal, { bold: true, fill: HEAD_FILL, align: 'center' });
    put(7, l.psCol, 'PS', { bold: true, fill: HEAD_FILL, align: 'center' });
    put(8, l.psCol, 100, { bold: true, fill: HEAD_FILL, align: 'center' });
    put(7, l.wsCol, 'WS', { bold: true, fill: HEAD_FILL, align: 'center' });
    put(8, l.wsCol, `${weightOf(l.c)}%`, { bold: true, fill: HEAD_FILL, align: 'center' });
  }
  put(6, initialCol, 'Initial Grade', { bold: true, fill: HEAD_FILL, align: 'center', wrap: true });
  put(6, termCol, 'Term Grade', { bold: true, fill: HEAD_FILL, align: 'center', wrap: true });
  for (const c of [initialCol, termCol]) {
    put(7, c, null, { fill: HEAD_FILL });
    put(8, c, null, { fill: HEAD_FILL });
    ws.mergeCells(6, c, 8, c);
  }
  ws.getRow(7).height = 42;

  let row = 9;
  for (const [label, sex] of [
    ['MALE', 'M'],
    ['FEMALE', 'F'],
  ] as const) {
    const group = data.learners.filter((l) => l.sex === sex);
    if (!group.length) continue;
    for (let c = 1; c <= lastCol; c++) put(row, c, c === 3 ? label : null, { bold: true, fill: BAND_FILL });
    row++;
    group.forEach((l, i) => {
      const dropped = l.status === 'TRANSFERRED_OUT' || l.status === 'DROPPED_OUT';
      put(row, 1, i + 1, { align: 'center' });
      put(row, 2, l.lrn, { align: 'center' });
      put(row, 3, formatLearnerName(l) + (dropped ? (l.status === 'DROPPED_OUT' ? '  (dropped)' : '  (transferred out)') : ''));
      for (const lay of layout) {
        lay.items.forEach((it, k) => {
          const s = l.scores[it.id];
          put(row, lay.start + k, s?.excused ? 'EX' : (s?.score ?? null), { align: 'center' });
        });
        const res = lay.c === 'WW' ? l.ww : lay.c === 'PT' ? l.pt : l.qa;
        put(row, lay.totalCol, res.hps ? res.total : null, { align: 'center' });
        put(row, lay.psCol, res.ps, { align: 'center' });
        put(row, lay.wsCol, res.ws, { align: 'center' });
      }
      put(row, initialCol, l.initialGrade, { align: 'center' });
      const q = put(row, termCol, l.termGrade, { bold: true, align: 'center' });
      if (l.termGrade != null && l.termGrade < 75) q.font = { bold: true, size: 10, color: { argb: 'FFB91C1C' } };
      row++;
    });
  }

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 34;
  for (let c = 4; c <= lastCol; c++) ws.getColumn(c).width = 9;
  ws.getColumn(initialCol).width = 10;
  ws.getColumn(termCol).width = 11;
  return toBuffer(wb);
}

// ------------------------------------------------------------------ summary of grades per section

export interface SummaryData {
  school: string;
  schoolYear: string;
  section: string;
  strand: string;
  adviser: string;
  term: number;
  subjects: Array<{ subjectId: number; name: string }>;
  learners: Array<{
    lrn: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    extName: string | null;
    sex: string;
    grades: Record<number, number | null>;
    generalAverage: number | null;
    remark: string;
    honors: HonorsLevel | null;
  }>;
  passing: number;
}

export async function sectionSummaryXlsx(d: SummaryData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Term ${d.term} Summary`, {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 6 }],
    pageSetup: { orientation: 'landscape', paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const lastCol = 3 + d.subjects.length + 3;
  ws.mergeCells(1, 1, 1, Math.max(lastCol, 8));
  ws.getCell(1, 1).value = d.school.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, Math.max(lastCol, 8));
  ws.getCell(2, 1).value = `SUMMARY OF GRADES  -  ${d.schoolYear}  -  Term ${d.term}`;
  ws.getCell(2, 1).font = { bold: true, size: 11 };
  ws.getCell(3, 1).value = `Section: ${d.section} (${d.strand})     Adviser: ${d.adviser || '-'}`;

  const put = (r: number, c: number, v: ExcelJS.CellValue, style: Parameters<typeof boxed>[1] = {}) => {
    const cell = ws.getCell(r, c);
    cell.value = v;
    boxed(cell, style);
    return cell;
  };

  for (const c of [1, 2, 3]) {
    put(5, c, null, { bold: true, fill: HEAD_FILL });
    put(6, c, null, { bold: true, fill: HEAD_FILL });
  }
  put(5, 1, 'No.', { bold: true, fill: HEAD_FILL, align: 'center' });
  put(5, 2, 'LRN', { bold: true, fill: HEAD_FILL, align: 'center' });
  put(5, 3, "LEARNERS' NAMES", { bold: true, fill: HEAD_FILL, align: 'center' });
  ws.mergeCells(5, 1, 6, 1);
  ws.mergeCells(5, 2, 6, 2);
  ws.mergeCells(5, 3, 6, 3);
  d.subjects.forEach((s, i) => {
    const c = 4 + i;
    put(5, c, s.name, { bold: true, fill: HEAD_FILL, align: 'center', wrap: true });
    put(6, c, null, { bold: true, fill: HEAD_FILL, align: 'center' });
    ws.mergeCells(5, c, 6, c);
  });
  const gaCol = 4 + d.subjects.length;
  for (const [k, label] of ['General Average', 'Remarks', 'Honors'].entries()) {
    put(5, gaCol + k, label, { bold: true, fill: HEAD_FILL, align: 'center', wrap: true });
    put(6, gaCol + k, null, { fill: HEAD_FILL });
    ws.mergeCells(5, gaCol + k, 6, gaCol + k);
  }
  ws.getRow(5).height = 70;

  let row = 7;
  for (const [label, sex] of [
    ['MALE', 'M'],
    ['FEMALE', 'F'],
  ] as const) {
    const group = d.learners.filter((l) => l.sex === sex);
    if (!group.length) continue;
    for (let c = 1; c <= lastCol; c++) put(row, c, c === 3 ? label : null, { bold: true, fill: BAND_FILL });
    row++;
    group.forEach((l, i) => {
      put(row, 1, i + 1, { align: 'center' });
      put(row, 2, l.lrn, { align: 'center' });
      put(row, 3, formatLearnerName(l));
      d.subjects.forEach((s, k) => {
        const g = l.grades[s.subjectId] ?? null;
        const f = put(row, 4 + k, g, { bold: true, align: 'center' });
        if (g != null && g < d.passing) f.font = { bold: true, size: 10, color: { argb: 'FFB91C1C' } };
      });
      put(row, gaCol, l.generalAverage, { bold: true, align: 'center' });
      put(row, gaCol + 1, l.remark === 'PASSED' ? 'Passed' : l.remark === 'FAILED' ? 'Failed' : 'Incomplete', { align: 'center' });
      put(row, gaCol + 2, l.honors ? HONORS_LABEL[l.honors] : '', { align: 'center' });
      row++;
    });
  }
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 34;
  for (let c = 4; c < gaCol; c++) ws.getColumn(c).width = 12;
  ws.getColumn(gaCol).width = 11;
  ws.getColumn(gaCol + 1).width = 11;
  ws.getColumn(gaCol + 2).width = 20;
  return toBuffer(wb);
}

// ------------------------------------------------------------------ master list (SF1 style)

export interface MasterlistRow {
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  extName: string | null;
  sex: string;
  birthDate: string;
  age: number;
  address: string;
  guardian: string;
  contact: string;
  status: string;
}

export async function masterlistXlsx(title: string, subtitle: string, rows: MasterlistRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Master List', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.mergeCells(1, 1, 1, 10);
  ws.getCell(1, 1).value = title.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, 10);
  ws.getCell(2, 1).value = subtitle;
  const heads = ['No.', 'LRN', "Learner's Name", 'Sex', 'Birth date', 'Age', 'Address', 'Parent / Guardian', 'Contact No.', 'Status'];
  heads.forEach((h, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = h;
    boxed(cell, { bold: true, fill: HEAD_FILL, align: 'center' });
  });
  let r = 5;
  for (const [label, sex] of [
    ['MALE', 'M'],
    ['FEMALE', 'F'],
  ] as const) {
    const group = rows.filter((x) => x.sex === sex);
    if (!group.length) continue;
    for (let c = 1; c <= 10; c++) boxed(ws.getCell(r, c), { bold: true, fill: BAND_FILL });
    ws.getCell(r, 3).value = `${label} (${group.length})`;
    r++;
    group.forEach((x, i) => {
      const vals: ExcelJS.CellValue[] = [i + 1, x.lrn, formatLearnerName(x), x.sex, x.birthDate, x.age, x.address, x.guardian, x.contact, x.status];
      vals.forEach((v, k) => {
        const cell = ws.getCell(r, k + 1);
        cell.value = v;
        boxed(cell, { align: k === 2 || k === 6 || k === 7 ? 'left' : 'center' });
      });
      r++;
    });
  }
  [5, 15, 34, 5, 12, 5, 38, 26, 16, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return toBuffer(wb);
}

// ------------------------------------------------------------------ honors list

export interface HonorsRow {
  grade: number;
  section: string;
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  extName: string | null;
  sex: string;
  generalAverage: number;
  honors: HonorsLevel;
}

export async function honorsXlsx(title: string, rows: HonorsRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Honors', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.mergeCells(1, 1, 1, 7);
  ws.getCell(1, 1).value = title.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ['Rank', 'Grade & Section', 'LRN', "Learner's Name", 'Sex', 'General Average', 'Award'].forEach((h, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    boxed(cell, { bold: true, fill: HEAD_FILL, align: 'center' });
  });
  rows.forEach((x, i) => {
    const vals: ExcelJS.CellValue[] = [i + 1, `${x.grade} - ${x.section}`, x.lrn, formatLearnerName(x), x.sex, x.generalAverage, HONORS_LABEL[x.honors]];
    vals.forEach((v, k) => {
      const cell = ws.getCell(4 + i, k + 1);
      cell.value = v;
      boxed(cell, { align: k === 3 ? 'left' : 'center' });
    });
  });
  [6, 18, 15, 34, 5, 15, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return toBuffer(wb);
}
