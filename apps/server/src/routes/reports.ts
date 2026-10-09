import { formatLearnerName, TERMS, type HonorsLevel } from '@bnhs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { isFamily, isOffice, me, requireRole, type AuthUser } from '../auth';
import { badRequest, forbidden, notFound } from '../errors';
import { ageOn, newDoc, termLabel, type Doc } from '../reports/pdf-kit';
import { blockFromCard, drawSf10, type Sf10Block } from '../reports/sf10';
import { drawSf9, type SchoolInfo } from '../reports/sf9';
import { classRecordXlsx, honorsXlsx, masterlistXlsx, sectionSummaryXlsx, type HonorsRow } from '../reports/xlsx';
import { buildCard, buildCards, type Visibility } from '../services/card';
import { classState, compareLearners, loadClass } from '../services/grades';
import { loadRecordData } from '../services/record';
import { idParam } from '../util';

const termSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'report';
}

export default async function reportsRoutes(app: FastifyInstance) {
  const db = app.db;
  const office = requireRole('ADMIN', 'REGISTRAR');

  async function schoolInfo(): Promise<SchoolInfo> {
    const s = await db.school.findUnique({ where: { id: 1 } });
    if (!s) throw badRequest('School profile is not set up yet.');
    return {
      name: s.name,
      schoolId: s.schoolId,
      region: s.region,
      division: s.division,
      district: s.district,
      address: s.address,
      principalName: s.principalName,
      principalTitle: s.principalTitle,
      registrarName: s.registrarName,
      logo: s.logo,
      passingGrade: s.passingGrade,
    };
  }

  function sendPdf(reply: FastifyReply, doc: Doc, filename: string) {
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${safeName(filename)}.pdf"`)
      .header('Cache-Control', 'no-store');
    doc.end();
    return reply.send(doc);
  }

  function sendXlsx(reply: FastifyReply, buf: Buffer, filename: string) {
    return reply
      .header('Content-Type', XLSX)
      .header('Content-Disposition', `attachment; filename="${safeName(filename)}.xlsx"`)
      .header('Cache-Control', 'no-store')
      .send(buf);
  }

  /** Office, or the adviser of that section. */
  async function assertAdviserOrOffice(user: AuthUser, sectionId: number) {
    if (isOffice(user)) return;
    const sec = await db.section.findUnique({ where: { id: sectionId }, select: { adviserId: true } });
    if (!sec || sec.adviserId !== user.id) throw forbidden('Only the class adviser can print this.');
  }

  function wantsDraft(req: FastifyRequest): boolean {
    return (req.query as { draft?: string }).draft === '1';
  }

  // ------------------------------------------------------------ SF9 report card

  app.get('/reports/sf9', async (req, reply) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    const enrollmentId = z.coerce.number().int().positive().parse(q.enrollmentId);
    const term = termSchema.parse(Number(q.term ?? 1));
    const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId }, include: { schoolYear: true, learner: true } });
    if (!enrollment) throw notFound('Enrollment');

    let visibility: Visibility = 'approved';
    if (isFamily(user)) {
      if (enrollment.learnerId !== user.learnerId) throw notFound('Enrollment');
      visibility = 'released';
    } else {
      await assertAdviserOrOffice(user, enrollment.sectionId);
      if (wantsDraft(req)) visibility = 'all';
    }

    const [card, school] = await Promise.all([buildCard(db, enrollmentId, term, visibility), schoolInfo()]);
    const doc = newDoc(`SF9 - ${formatLearnerName(card.learner)}`);
    drawSf9(doc, card, school, { draft: visibility === 'all', schoolYearStart: enrollment.schoolYear.startDate, newPage: false });
    await audit(db, req, 'SF9_PRINTED', 'Enrollment', enrollmentId, { term, visibility });
    return sendPdf(reply, doc, `SF9_${enrollment.learner.lastName}_${enrollment.learner.lrn}_T${term}`);
  });

  /** Every report card of a section in one file, ready to print. */
  app.get('/reports/sf9-section', async (req, reply) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    const sectionId = z.coerce.number().int().positive().parse(q.sectionId);
    const term = termSchema.parse(Number(q.term ?? 1));
    await assertAdviserOrOffice(user, sectionId);
    const section = await db.section.findUnique({ where: { id: sectionId }, include: { schoolYear: true } });
    if (!section) throw notFound('Section');
    const visibility: Visibility = wantsDraft(req) ? 'all' : 'approved';
    const enrollments = await db.enrollment.findMany({ where: { sectionId, status: { in: ['ENROLLED', 'LATE_ENROLLEE'] } }, select: { id: true } });
    if (!enrollments.length) throw badRequest('This section has no enrolled learners.');
    const [cards, school] = await Promise.all([buildCards(db, enrollments.map((e) => e.id), term, visibility), schoolInfo()]);
    const doc = newDoc(`SF9 - Grade ${section.gradeLevel} ${section.name}`);
    cards.forEach((card, i) =>
      drawSf9(doc, card, school, { draft: visibility === 'all', schoolYearStart: section.schoolYear.startDate, newPage: i > 0 }),
    );
    await audit(db, req, 'SF9_SECTION_PRINTED', 'Section', sectionId, { term, visibility, count: cards.length });
    return sendPdf(reply, doc, `SF9_Grade${section.gradeLevel}_${section.name}_T${term}`);
  });

  // ------------------------------------------------------------ SF10 permanent record

  app.get('/reports/sf10', { preHandler: office }, async (req, reply) => {
    const learnerId = z.coerce.number().int().positive().parse((req.query as { learnerId?: string }).learnerId);
    const learner = await db.learner.findUnique({
      where: { id: learnerId },
      include: { enrollments: { include: { schoolYear: true } }, externalRecords: true },
    });
    if (!learner) throw notFound('Learner');
    const school = await schoolInfo();

    const blocks: Array<Sf10Block & { sortKey: string }> = [];
    for (const e of learner.enrollments) {
      for (const term of TERMS) {
        const card = await buildCard(db, e.id, term, 'approved');
        if (!card.subjects.some((s) => s.grade != null)) continue;
        blocks.push({ ...blockFromCard(card, school), sortKey: `${e.schoolYear.name}-${term}` });
      }
    }
    for (const r of learner.externalRecords) {
      blocks.push({
        school: r.schoolName,
        schoolId: r.schoolId ?? '',
        schoolYear: r.schoolYear,
        period: r.period,
        gradeLevel: r.gradeLevel,
        strand: r.strandName ?? '',
        section: r.sectionName ?? '',
        subjects: (JSON.parse(r.subjects) as Array<{ type: string; subject: string; q1: number | null; q2: number | null; final: number | null; remarks: string }>).map((s) => ({
          type: s.type,
          subject: s.subject,
          grade: s.final ?? s.q2 ?? s.q1,
          action: s.remarks,
        })),
        generalAverage: r.generalAverage,
        remedial: [],
        sortKey: `${r.schoolYear}-${r.period}`,
      });
    }
    blocks.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const doc = newDoc(`SF10 - ${formatLearnerName(learner)}`);
    drawSf10(
      doc,
      {
        lrn: learner.lrn,
        lastName: learner.lastName,
        firstName: learner.firstName,
        middleName: learner.middleName,
        extName: learner.extName,
        sex: learner.sex,
        birthDate: learner.birthDate.toISOString().slice(0, 10),
        birthPlace: learner.birthPlace,
      },
      blocks,
      school,
    );
    await audit(db, req, 'SF10_PRINTED', 'Learner', learnerId);
    return sendPdf(reply, doc, `SF10_${learner.lastName}_${learner.lrn}`);
  });

  // ------------------------------------------------------------ class record (Excel)

  app.get('/reports/class-record', async (req, reply) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    const classId = z.coerce.number().int().positive().parse(q.classId);
    if (isFamily(user)) throw forbidden();
    const cls = await loadClass(db, classId);
    if (user.role === 'TEACHER' && cls.teacherId !== user.id) throw forbidden('This is not your class.');
    const [data, state, school] = await Promise.all([loadRecordData(db, cls), classState(db, cls), schoolInfo()]);
    const buf = await classRecordXlsx(
      {
        school: school.name,
        schoolYear: cls.schoolYear.name,
        subject: cls.subject.name,
        section: `Grade ${cls.section.gradeLevel} - ${cls.section.name}`,
        strand: cls.section.strand.code,
        teacher: cls.teacher?.fullName ?? '',
        term: cls.term,
        status: state.status,
      },
      data,
    );
    await audit(db, req, 'CLASS_RECORD_EXPORTED', 'ClassAssignment', classId, { term: cls.term });
    return sendXlsx(reply, buf, `ClassRecord_${cls.subject.code}_${cls.section.gradeLevel}-${cls.section.name}_T${cls.term}`);
  });

  // ------------------------------------------------------------ section summary (Excel)

  app.get('/reports/section-summary', async (req, reply) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    const sectionId = z.coerce.number().int().positive().parse(q.sectionId);
    const term = termSchema.parse(Number(q.term ?? 1));
    await assertAdviserOrOffice(user, sectionId);
    const section = await db.section.findUnique({ where: { id: sectionId }, include: { strand: true, adviser: true, schoolYear: true } });
    if (!section) throw notFound('Section');
    const visibility: Visibility = wantsDraft(req) ? 'all' : 'approved';
    const enrollments = await db.enrollment.findMany({ where: { sectionId }, select: { id: true } });
    const [cards, school] = await Promise.all([buildCards(db, enrollments.map((e) => e.id), term, visibility), schoolInfo()]);
    const buf = await sectionSummaryXlsx({
      school: school.name,
      schoolYear: section.schoolYear.name,
      section: `Grade ${section.gradeLevel} - ${section.name}`,
      strand: section.strand.code,
      adviser: section.adviser?.fullName ?? '',
      term,
      passing: school.passingGrade,
      subjects: (cards[0]?.subjects ?? []).map((s) => ({ subjectId: s.subjectId, name: s.name })),
      learners: cards.map((c) => ({
        ...c.learner,
        grades: Object.fromEntries(c.subjects.map((s) => [s.subjectId, s.grade])),
        generalAverage: c.generalAverage,
        remark: c.complete ? (c.generalAverage! >= school.passingGrade ? 'PASSED' : 'FAILED') : 'INCOMPLETE',
        honors: c.honors,
      })),
    });
    await audit(db, req, 'SUMMARY_EXPORTED', 'Section', sectionId, { term, visibility });
    return sendXlsx(reply, buf, `Summary_Grade${section.gradeLevel}_${section.name}_T${term}`);
  });

  // ------------------------------------------------------------ master list (Excel)

  app.get('/reports/masterlist', async (req, reply) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    const sectionId = z.coerce.number().int().positive().parse(q.sectionId);
    await assertAdviserOrOffice(user, sectionId);
    const section = await db.section.findUnique({ where: { id: sectionId }, include: { strand: true, schoolYear: true, adviser: true } });
    if (!section) throw notFound('Section');
    const school = await schoolInfo();
    const enrollments = await db.enrollment.findMany({ where: { sectionId }, include: { learner: true } });
    const rows = enrollments
      .map((e) => ({
        lrn: e.learner.lrn,
        lastName: e.learner.lastName,
        firstName: e.learner.firstName,
        middleName: e.learner.middleName,
        extName: e.learner.extName,
        sex: e.learner.sex,
        birthDate: e.learner.birthDate.toISOString().slice(0, 10),
        age: ageOn(e.learner.birthDate.toISOString().slice(0, 10), section.schoolYear.startDate),
        address: e.learner.address ?? '',
        guardian: [e.learner.guardianName, e.learner.guardianRelation && `(${e.learner.guardianRelation})`].filter(Boolean).join(' '),
        contact: e.learner.guardianContact ?? '',
        status: e.status === 'ENROLLED' ? 'Enrolled' : e.status === 'LATE_ENROLLEE' ? 'Late enrollee' : e.status === 'TRANSFERRED_OUT' ? 'Transferred out' : 'Dropped out',
      }))
      .sort(compareLearners);
    const buf = await masterlistXlsx(
      `${school.name}  -  Master list`,
      `Grade ${section.gradeLevel} - ${section.name} (${section.strand.code})   SY ${section.schoolYear.name}   Adviser: ${section.adviser?.fullName ?? '-'}`,
      rows,
    );
    await audit(db, req, 'MASTERLIST_EXPORTED', 'Section', sectionId);
    return sendXlsx(reply, buf, `Masterlist_Grade${section.gradeLevel}_${section.name}`);
  });

  // ------------------------------------------------------------ honors

  app.get('/reports/honors', { preHandler: office }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const term = termSchema.parse(Number(q.term ?? 1));
    const year = q.schoolYearId
      ? await db.schoolYear.findUnique({ where: { id: Number(q.schoolYearId) } })
      : await db.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw notFound('School year');
    const enrollments = await db.enrollment.findMany({
      where: {
        schoolYearId: year.id,
        status: { in: ['ENROLLED', 'LATE_ENROLLEE'] },
        ...(q.gradeLevel ? { section: { gradeLevel: Number(q.gradeLevel) } } : {}),
      },
      select: { id: true },
    });
    const cards = await buildCards(db, enrollments.map((e) => e.id), term, 'approved');
    const rows: HonorsRow[] = cards
      .filter((c) => c.honors && c.generalAverage != null)
      .map((c) => ({
        grade: c.section.gradeLevel,
        section: c.section.name,
        ...c.learner,
        generalAverage: c.generalAverage!,
        honors: c.honors as HonorsLevel,
      }))
      .sort((a, b) => a.grade - b.grade || b.generalAverage - a.generalAverage || a.lastName.localeCompare(b.lastName));

    if (q.format === 'xlsx') {
      const school = await schoolInfo();
      const buf = await honorsXlsx(`${school.name}  -  Honor roll, SY ${year.name}, ${termLabel(term)}`, rows);
      return sendXlsx(reply, buf, `Honors_${year.name}_T${term}`);
    }
    return { schoolYear: year.name, term, count: rows.length, rows };
  });
}
