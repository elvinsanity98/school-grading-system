import { DESCRIPTORS, HONORS_LABEL, MONTH_NAME, OBSERVED_VALUES, VALUE_MARKING_LABEL, formatLearnerName } from '@bnhs/core';
import type { Card } from '../services/card';
import {
  BOTTOM,
  COLOR,
  CONTENT_WIDTH,
  PAGE,
  ageOn,
  centered,
  drawRow,
  headerRow,
  labelValue,
  logoBuffer,
  ordinalSemester,
  sectionTitle,
  signatureLine,
  watermark,
  type Column,
  type Doc,
} from './pdf-kit';

export interface SchoolInfo {
  name: string;
  schoolId: string;
  region: string;
  division: string;
  district: string;
  address: string;
  principalName: string;
  principalTitle: string;
  registrarName: string;
  logo: string | null;
  passingGrade: number;
}

export interface Sf9Options {
  /** Unofficial printout (includes grades that are not approved yet). */
  draft: boolean;
  schoolYearStart: Date;
  /** Start on a fresh page (batch printing). */
  newPage: boolean;
}

function title(s: string): string {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
}

function pageHeader(doc: Doc, school: SchoolInfo, heading: string, subheading: string): number {
  let y = PAGE.margin;
  const logo = logoBuffer(school.logo);
  if (logo) {
    try {
      doc.image(logo, PAGE.margin, y, { fit: [54, 54] });
    } catch {
      /* a broken logo must not stop the report card */
    }
  }
  y += centered(doc, 'Republic of the Philippines', y, 8, false, COLOR.muted) + 1;
  y += centered(doc, 'Department of Education', y, 11, true) + 1;
  const where = [school.region, school.division && `Division of ${school.division}`, school.district && `${school.district} District`]
    .filter(Boolean)
    .join('  |  ');
  if (where) y += centered(doc, where, y, 8, false, COLOR.muted) + 1;
  y += centered(doc, school.name.toUpperCase(), y, 12, true) + 1;
  if (school.schoolId || school.address) {
    y += centered(doc, [school.schoolId && `School ID: ${school.schoolId}`, school.address].filter(Boolean).join('  |  '), y, 8, false, COLOR.muted);
  }
  y += 8;
  y += centered(doc, heading, y, 13, true) + 1;
  y += centered(doc, subheading, y, 8.5, false, COLOR.muted);
  return y + 8;
}

function footer(doc: Doc, text: string): void {
  doc.font('Helvetica').fontSize(6.5).fillColor(COLOR.muted).text(text, PAGE.margin, BOTTOM - 9, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
  doc.fillColor(COLOR.ink);
}

/** SF9-SHS: Learner's Progress Report Card, one semester, two pages (front and back). */
export function drawSf9(doc: Doc, card: Card, school: SchoolInfo, opts: Sf9Options): void {
  if (opts.newPage) doc.addPage();
  if (opts.draft) watermark(doc, 'DRAFT - NOT OFFICIAL');

  const [qa, qb] = card.quarters;
  const genLine = `Generated ${new Date().toISOString().slice(0, 10)}${opts.draft ? '  |  UNOFFICIAL COPY: includes grades that are not yet approved' : ''}`;

  // ------------------------------------------------------------------ page 1: learner and grades
  let y = pageHeader(doc, school, "LEARNER'S PROGRESS REPORT CARD", 'Senior High School  (SF9-SHS)');

  const L = card.learner;
  const age = ageOn(L.birthDate, opts.schoolYearStart);
  const half = CONTENT_WIDTH / 2;
  labelValue(doc, PAGE.margin, y, 'Name:', formatLearnerName(L), 38, half - 44, 9.5);
  labelValue(doc, PAGE.margin + half, y, 'LRN:', L.lrn, 60, half - 60, 9.5);
  y += 15;
  labelValue(doc, PAGE.margin, y, 'Age:', String(age), 38, 60, 9);
  labelValue(doc, PAGE.margin + 110, y, 'Sex:', L.sex === 'M' ? 'Male' : 'Female', 30, 80, 9);
  labelValue(doc, PAGE.margin + half, y, 'School Year:', card.schoolYear.name, 60, half - 60, 9);
  y += 14;
  labelValue(doc, PAGE.margin, y, 'Grade / Section:', `Grade ${card.section.gradeLevel} - ${card.section.name}`, 80, half - 86, 9);
  labelValue(doc, PAGE.margin + half, y, 'Semester:', ordinalSemester(card.semester), 60, half - 60, 9);
  y += 14;
  labelValue(doc, PAGE.margin, y, 'Track / Strand:', `${card.section.strandCode} - ${card.section.strandName}`, 80, CONTENT_WIDTH - 80, 9);
  y += 20;

  const cols: Column[] = [
    { label: 'SUBJECTS', width: 232 },
    { label: `Quarter ${qa}`, width: 50, align: 'center' },
    { label: `Quarter ${qb}`, width: 50, align: 'center' },
    { label: 'Semester Final Grade', width: 80, align: 'center' },
    { label: 'REMARKS', width: 120, align: 'center' },
  ];
  y += headerRow(doc, PAGE.margin, y, cols);

  const groups: Array<{ label: string; rows: Card['subjects'] }> = [
    { label: 'CORE SUBJECTS', rows: card.subjects.filter((s) => s.type === 'CORE') },
    { label: 'APPLIED AND SPECIALIZED SUBJECTS', rows: card.subjects.filter((s) => s.type !== 'CORE') },
  ];
  for (const g of groups) {
    if (!g.rows.length) continue;
    y += drawRow(doc, PAGE.margin, y, [{ label: '', width: CONTENT_WIDTH }], [g.label], { size: 8, bold: true, fill: COLOR.band });
    for (const s of g.rows) {
      const failed = s.finalGrade != null && s.finalGrade < school.passingGrade;
      let remark = s.remark === 'INCOMPLETE' ? '' : title(s.remark);
      if (s.remedial) remark = `${s.remedial.passed ? 'Passed' : 'Failed'} after remedial (${s.remedial.recomputed})`;
      y += drawRow(
        doc,
        PAGE.margin,
        y,
        cols,
        [s.name, s.quarters[0]!.grade ?? '', s.quarters[1]!.grade ?? '', s.finalGrade ?? '', remark],
        { size: 8.5, cellStyle: failed ? { 3: { bold: true, color: COLOR.fail }, 4: { color: COLOR.fail } } : { 3: { bold: true } } },
      );
    }
  }
  const gaText = card.generalAverage ?? '';
  const gaFailed = card.generalAverage != null && card.generalAverage < school.passingGrade;
  y += drawRow(
    doc,
    PAGE.margin,
    y,
    [
      { label: '', width: 332 },
      { label: '', width: 80, align: 'center' },
      { label: '', width: 120, align: 'center' },
    ],
    ['GENERAL AVERAGE FOR THE SEMESTER', gaText, card.complete ? (gaFailed ? 'Failed' : 'Passed') : 'Incomplete'],
    { size: 9, bold: true, fill: COLOR.head, padY: 4, cellStyle: gaFailed ? { 1: { color: COLOR.fail } } : {} },
  );
  if (card.honors) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink).text(`Academic Excellence: ${HONORS_LABEL[card.honors]}`, PAGE.margin, y + 6, { width: CONTENT_WIDTH });
    y += 20;
  }
  if (card.hasHidden) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLOR.muted).text('Some grades are not shown because they have not been approved and released yet.', PAGE.margin, y + 6, { width: CONTENT_WIDTH });
    y += 18;
  }

  y += 14;
  y += sectionTitle(doc, 'Descriptors and grading scale', y);
  const dcols: Column[] = [
    { label: 'Descriptors', width: 220 },
    { label: 'Grading Scale', width: 150, align: 'center' },
    { label: 'Remarks', width: 162, align: 'center' },
  ];
  y += headerRow(doc, PAGE.margin, y, dcols, 8);
  for (const d of DESCRIPTORS) {
    y += drawRow(doc, PAGE.margin, y, dcols, [d.label, d.min === 0 ? `Below ${school.passingGrade}` : `${d.min} - ${d.max}`, d.min >= school.passingGrade ? 'Passed' : 'Failed'], { size: 8, padY: 2 });
  }
  footer(doc, genLine);

  // ------------------------------------------------------------------ page 2: attendance and values
  doc.addPage();
  if (opts.draft) watermark(doc, 'DRAFT - NOT OFFICIAL');
  y = PAGE.margin;
  centered(doc, `${formatLearnerName(L)}   |   LRN ${L.lrn}   |   Grade ${card.section.gradeLevel} - ${card.section.name}   |   ${card.schoolYear.name}, ${ordinalSemester(card.semester)}`, y, 8.5, true, COLOR.muted);
  y += 20;

  y += sectionTitle(doc, 'Report on attendance', y);
  const acols: Column[] = [
    { label: '', width: 112 },
    ...card.attendance.map((m) => ({ label: MONTH_NAME[m.month] ?? '', width: 30, align: 'center' as const })),
    { label: 'Total', width: 60, align: 'center' },
  ];
  y += headerRow(doc, PAGE.margin, y, acols, 8);
  const sum = (pick: (m: Card['attendance'][number]) => number | null) =>
    card.attendance.reduce((t, m) => t + (pick(m) ?? 0), 0);
  const attendanceRows: Array<[string, (m: Card['attendance'][number]) => number | null]> = [
    ['No. of school days', (m) => m.schoolDays],
    ['No. of days present', (m) => m.present],
    ['No. of days absent', (m) => m.absent],
    ['Times tardy', (m) => m.tardy],
  ];
  for (const [label, pick] of attendanceRows) {
    const anyValue = card.attendance.some((m) => pick(m) != null);
    y += drawRow(doc, PAGE.margin, y, acols, [label, ...card.attendance.map((m) => pick(m) ?? ''), anyValue ? sum(pick) : ''], { size: 8, padY: 3, cellStyle: { 0: { bold: true } } });
  }

  y += 18;
  y += sectionTitle(doc, 'Report on learner\'s observed values', y);
  const vcols: Column[] = [
    { label: 'Core Values', width: 80 },
    { label: 'Behavior Statements', width: 292 },
    { label: `Quarter ${qa}`, width: 80, align: 'center' },
    { label: `Quarter ${qb}`, width: 80, align: 'center' },
  ];
  y += headerRow(doc, PAGE.margin, y, vcols, 8);
  let lastCore = '';
  for (const v of OBSERVED_VALUES) {
    const first = v.coreValue !== lastCore;
    lastCore = v.coreValue;
    y += drawRow(doc, PAGE.margin, y, vcols, [first ? v.coreValue : '', v.statement, card.values[v.key]?.[qa] ?? '', card.values[v.key]?.[qb] ?? ''], {
      size: 8,
      padY: 3,
      cellStyle: { 0: { bold: true }, 2: { bold: true }, 3: { bold: true } },
    });
  }
  y += 6;
  const legend = (['AO', 'SO', 'RO', 'NO'] as const).map((k) => `${k} = ${VALUE_MARKING_LABEL[k]}`).join('     ');
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted).text(`Marking:  ${legend}`, PAGE.margin, y, { width: CONTENT_WIDTH });
  doc.fillColor(COLOR.ink);

  // ------------------------------------------------------------------ signatures
  y = Math.max(y + 60, 560);
  const w = 200;
  signatureLine(doc, PAGE.margin, y, w, card.section.adviser ?? '', 'Class Adviser');
  signatureLine(doc, PAGE.width - PAGE.margin - w, y, w, school.principalName, school.principalTitle || 'School Head');
  y += 50;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink).text("Parent's / Guardian's Signature", PAGE.margin, y, { width: CONTENT_WIDTH });
  y += 26;
  for (const q of [qa, qb]) {
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.muted).text(`Quarter ${q}:`, PAGE.margin, y, { width: 60, lineBreak: false });
    doc.lineWidth(0.5).strokeColor(COLOR.ink).moveTo(PAGE.margin + 62, y + 9).lineTo(PAGE.margin + 62 + 240, y + 9).stroke();
    y += 24;
  }
  footer(doc, genLine);
}
