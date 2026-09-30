import { formatLearnerName } from '@bnhs/core';
import type { Card } from '../services/card';
import type { SchoolInfo } from './sf9';
import {
  BOTTOM,
  COLOR,
  CONTENT_WIDTH,
  PAGE,
  centered,
  drawRow,
  headerRow,
  labelValue,
  logoBuffer,
  ordinalSemester,
  signatureLine,
  type Column,
  type Doc,
} from './pdf-kit';

export interface Sf10Subject {
  type: string;
  subject: string;
  q1: number | null;
  q2: number | null;
  final: number | null;
  action: string;
}

export interface Sf10Block {
  school: string;
  schoolId: string;
  schoolYear: string;
  semester: number;
  gradeLevel: number;
  strand: string;
  section: string;
  subjects: Sf10Subject[];
  generalAverage: number | null;
  remedial: Array<{ subject: string; final: number; mark: number; recomputed: number; dateFrom: string | null; dateTo: string | null }>;
}

export interface Sf10Learner {
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  extName: string | null;
  sex: string;
  birthDate: string;
  birthPlace: string | null;
}

const TYPE_LABEL: Record<string, string> = { CORE: 'Core', APPLIED: 'Applied', SPECIALIZED: 'Specialized' };

/** Turns the approved semester cards of this school into SF10 blocks. */
export function blockFromCard(card: Card, school: SchoolInfo): Sf10Block {
  return {
    school: school.name,
    schoolId: school.schoolId,
    schoolYear: card.schoolYear.name,
    semester: card.semester,
    gradeLevel: card.section.gradeLevel,
    strand: card.section.strandName,
    section: card.section.name,
    subjects: card.subjects.map((s) => ({
      type: TYPE_LABEL[s.type] ?? s.type,
      subject: s.name,
      q1: s.quarters[0]!.grade,
      q2: s.quarters[1]!.grade,
      final: s.finalGrade,
      action: s.remedial ? (s.remedial.passed ? 'Passed (remedial)' : 'Failed') : s.remark === 'PASSED' ? 'Passed' : s.remark === 'FAILED' ? 'Failed' : '',
    })),
    generalAverage: card.generalAverage,
    remedial: card.subjects
      .filter((s) => s.remedial)
      .map((s) => ({
        subject: s.name,
        final: s.finalGrade ?? 0,
        mark: s.remedial!.mark,
        recomputed: s.remedial!.recomputed,
        dateFrom: s.remedial!.dateFrom,
        dateTo: s.remedial!.dateTo,
      })),
  };
}

const COLS: Column[] = [
  { label: 'Type', width: 62, align: 'center' },
  { label: 'SUBJECTS', width: 250 },
  { label: 'Q1/Q3', width: 46, align: 'center' },
  { label: 'Q2/Q4', width: 46, align: 'center' },
  { label: 'Sem Final', width: 56, align: 'center' },
  { label: 'Action Taken', width: 72, align: 'center' },
];

/** SF10-SHS: Learner's Permanent Academic Record. */
export function drawSf10(doc: Doc, learner: Sf10Learner, blocks: Sf10Block[], school: SchoolInfo): void {
  let y: number = PAGE.margin;
  const logo = logoBuffer(school.logo);
  if (logo) {
    try {
      doc.image(logo, PAGE.margin, y, { fit: [54, 54] });
    } catch {
      /* ignore a broken logo */
    }
  }
  y += centered(doc, 'Republic of the Philippines', y, 8, false, COLOR.muted) + 1;
  y += centered(doc, 'Department of Education', y, 11, true) + 1;
  y += centered(doc, school.name.toUpperCase(), y, 12, true) + 8;
  y += centered(doc, "LEARNER'S PERMANENT ACADEMIC RECORD", y, 13, true) + 1;
  y += centered(doc, 'For Senior High School  (SF10-SHS)', y, 8.5, false, COLOR.muted) + 12;

  const half = CONTENT_WIDTH / 2;
  labelValue(doc, PAGE.margin, y, 'Name:', formatLearnerName(learner), 40, half - 46, 9.5);
  labelValue(doc, PAGE.margin + half, y, 'LRN:', learner.lrn, 60, half - 60, 9.5);
  y += 15;
  labelValue(doc, PAGE.margin, y, 'Sex:', learner.sex === 'M' ? 'Male' : 'Female', 40, 80, 9);
  labelValue(doc, PAGE.margin + half, y, 'Date of birth:', learner.birthDate, 60, half - 60, 9);
  y += 14;
  labelValue(doc, PAGE.margin, y, 'Place of birth:', learner.birthPlace ?? '', 70, CONTENT_WIDTH - 70, 9);
  y += 24;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.ink).text('SCHOLASTIC RECORD', PAGE.margin, y);
  y += 16;

  if (!blocks.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.muted).text('No approved grades are on record yet.', PAGE.margin, y);
    y += 20;
  }

  for (const b of blocks) {
    const estimate = 62 + (b.subjects.length + 2) * 15 + (b.remedial.length ? 40 + b.remedial.length * 15 : 0);
    if (y + estimate > BOTTOM - 20) {
      doc.addPage();
      y = PAGE.margin;
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink);
    doc.text(`School: ${b.school}${b.schoolId ? `   (ID ${b.schoolId})` : ''}`, PAGE.margin, y, { width: CONTENT_WIDTH });
    y += 13;
    labelValue(doc, PAGE.margin, y, 'Grade level:', String(b.gradeLevel), 58, 40, 8.5);
    labelValue(doc, PAGE.margin + 110, y, 'SY:', b.schoolYear, 20, 70, 8.5);
    labelValue(doc, PAGE.margin + 210, y, 'Semester:', ordinalSemester(b.semester), 48, 80, 8.5);
    labelValue(doc, PAGE.margin + 370, y, 'Section:', b.section, 42, 120, 8.5);
    y += 12;
    labelValue(doc, PAGE.margin, y, 'Track / Strand:', b.strand, 70, CONTENT_WIDTH - 70, 8.5);
    y += 14;

    y += headerRow(doc, PAGE.margin, y, COLS, 8);
    for (const s of b.subjects) {
      if (y > BOTTOM - 40) {
        doc.addPage();
        y = PAGE.margin;
        y += headerRow(doc, PAGE.margin, y, COLS, 8);
      }
      const failed = s.action === 'Failed';
      y += drawRow(doc, PAGE.margin, y, COLS, [s.type, s.subject, s.q1 ?? '', s.q2 ?? '', s.final ?? '', s.action], {
        size: 8,
        padY: 2.5,
        cellStyle: failed ? { 4: { bold: true, color: COLOR.fail }, 5: { color: COLOR.fail } } : { 4: { bold: true } },
      });
    }
    y += drawRow(
      doc,
      PAGE.margin,
      y,
      [
        { label: '', width: 360 },
        { label: '', width: 56, align: 'center' },
        { label: '', width: 72 + 44, align: 'center' },
      ],
      ['GENERAL AVERAGE FOR THE SEMESTER', b.generalAverage ?? '', ''],
      { size: 8.5, bold: true, fill: COLOR.head, padY: 3 },
    );

    if (b.remedial.length) {
      y += 6;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.ink).text('Remedial classes', PAGE.margin, y);
      y += 12;
      const rcols: Column[] = [
        { label: 'Subject', width: 220 },
        { label: 'Conducted', width: 110, align: 'center' },
        { label: 'Final grade', width: 50, align: 'center' },
        { label: 'Remedial mark', width: 60, align: 'center' },
        { label: 'Recomputed', width: 92, align: 'center' },
      ];
      y += headerRow(doc, PAGE.margin, y, rcols, 7.5);
      for (const r of b.remedial) {
        y += drawRow(doc, PAGE.margin, y, rcols, [r.subject, [r.dateFrom, r.dateTo].filter(Boolean).join(' to '), r.final, r.mark, r.recomputed], { size: 8, padY: 2.5 });
      }
    }
    y += 18;
  }

  if (y > BOTTOM - 110) {
    doc.addPage();
    y = PAGE.margin;
  }
  y = Math.max(y + 20, BOTTOM - 100);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted).text(`Date issued: ${new Date().toISOString().slice(0, 10)}`, PAGE.margin, y - 26, { width: CONTENT_WIDTH });
  signatureLine(doc, PAGE.margin, y, 200, school.registrarName, 'Prepared by: Registrar');
  signatureLine(doc, PAGE.width - PAGE.margin - 200, y, 200, school.principalName, `Certified true and correct: ${school.principalTitle || 'School Head'}`);
  doc.font('Helvetica').fontSize(6.5).fillColor(COLOR.muted).text('Generated by the BNHS SHS Grading System. Contains only approved grades.', PAGE.margin, BOTTOM - 9, {
    width: CONTENT_WIDTH,
    align: 'center',
    lineBreak: false,
  });
}
