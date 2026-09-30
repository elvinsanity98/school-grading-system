import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { isOffice, me, requireRole } from '../auth';
import { conflict, forbidden, notFound, parse } from '../errors';
import { createPeriods } from '../seed-data';
import { idParam, iso, zDate, zText } from '../util';

const LOGO_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

const schoolBody = z.object({
  name: zText(150),
  schoolId: z.string().trim().max(20).default(''),
  region: z.string().trim().max(80).default(''),
  division: z.string().trim().max(80).default(''),
  district: z.string().trim().max(80).default(''),
  address: z.string().trim().max(200).default(''),
  principalName: z.string().trim().max(100).default(''),
  principalTitle: z.string().trim().max(60).default('School Head'),
  registrarName: z.string().trim().max(100).default(''),
  passingGrade: z.number().int().min(50).max(100).default(75),
  honorsWith: z.number().int().min(50).max(100).default(90),
  honorsHigh: z.number().int().min(50).max(100).default(95),
  honorsHighest: z.number().int().min(50).max(100).default(98),
  honorsMinSubject: z.number().int().min(0).max(100).default(85),
  /** undefined = keep, null = remove */
  logo: z
    .string()
    .max(900_000, 'Logo is too large (limit about 600 KB).')
    .regex(LOGO_PATTERN, 'Logo must be a PNG or JPEG image')
    .nullable()
    .optional(),
});

const yearBody = z
  .object({ name: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Use the form 2026-2027'), startDate: zDate, endDate: zDate })
  .refine((v) => v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] });

const periodBody = z.object({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  released: z.boolean().optional(),
});

const daysBody = z.array(
  z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), days: z.number().int().min(0).max(31) }),
);

export default async function schoolRoutes(app: FastifyInstance) {
  const db = app.db;
  const admin = requireRole('ADMIN');
  const office = requireRole('ADMIN', 'REGISTRAR');

  app.put('/school', { preHandler: admin }, async (req) => {
    const body = parse(schoolBody, req.body);
    if (!(body.honorsWith <= body.honorsHigh && body.honorsHigh <= body.honorsHighest)) {
      throw conflict('Honors cut-offs must go up: With Honors, then With High Honors, then With Highest Honors.');
    }
    const { logo, ...rest } = body;
    const data = { ...rest, ...(logo === undefined ? {} : { logo }) };
    const school = await db.school.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    await audit(db, req, 'SCHOOL_UPDATED', 'School', 1);
    return school;
  });

  // ---- school years

  app.get('/school-years', async () => {
    const years = await db.schoolYear.findMany({ orderBy: { startDate: 'desc' }, include: { periods: true } });
    return years.map((y) => ({
      id: y.id,
      name: y.name,
      startDate: iso(y.startDate),
      endDate: iso(y.endDate),
      isCurrent: y.isCurrent,
      periods: y.periods.sort((a, b) => a.quarter - b.quarter),
    }));
  });

  app.post('/school-years', { preHandler: admin }, async (req, reply) => {
    const body = parse(yearBody, req.body);
    const first = (await db.schoolYear.count()) === 0;
    const year = await db.schoolYear.create({ data: { ...body, isCurrent: first } });
    await createPeriods(db, year.id);
    await audit(db, req, 'SCHOOL_YEAR_CREATED', 'SchoolYear', year.id, { name: year.name });
    reply.code(201);
    return { id: year.id };
  });

  app.put('/school-years/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    const body = parse(yearBody, req.body);
    await db.schoolYear.update({ where: { id }, data: body });
    await audit(db, req, 'SCHOOL_YEAR_UPDATED', 'SchoolYear', id);
    return { ok: true };
  });

  app.post('/school-years/:id/set-current', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    if (!(await db.schoolYear.findUnique({ where: { id } }))) throw notFound('School year');
    await db.$transaction([
      db.schoolYear.updateMany({ data: { isCurrent: false } }),
      db.schoolYear.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    await audit(db, req, 'SCHOOL_YEAR_CURRENT', 'SchoolYear', id);
    return { ok: true };
  });

  app.delete('/school-years/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    const used = await db.section.count({ where: { schoolYearId: id } });
    if (used) throw conflict('This school year already has sections. Delete them first.');
    await db.schoolYear.delete({ where: { id } });
    await audit(db, req, 'SCHOOL_YEAR_DELETED', 'SchoolYear', id);
    return { ok: true };
  });

  // ---- grading periods: open for encoding, release to learners

  app.put('/periods/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(periodBody, req.body);
    const user = me(req);
    if (body.released !== undefined && user.role !== 'ADMIN' && !isOffice(user)) throw forbidden();
    const period = await db.gradingPeriod.update({ where: { id }, data: body });
    await audit(db, req, 'PERIOD_UPDATED', 'GradingPeriod', id, { quarter: period.quarter, ...body });
    return period;
  });

  // ---- school days per month (for the attendance table on the report card)

  app.get('/school-years/:id/school-days', async (req) => {
    const id = idParam(req);
    return db.schoolDays.findMany({ where: { schoolYearId: id }, orderBy: [{ year: 'asc' }, { month: 'asc' }] });
  });

  app.put('/school-years/:id/school-days', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const rows = parse(daysBody, req.body);
    await db.$transaction(
      rows.map((r) =>
        db.schoolDays.upsert({
          where: { schoolYearId_year_month: { schoolYearId: id, year: r.year, month: r.month } },
          update: { days: r.days },
          create: { schoolYearId: id, ...r },
        }),
      ),
    );
    await audit(db, req, 'SCHOOL_DAYS_SET', 'SchoolYear', id, { months: rows.length });
    return { ok: true };
  });
}
