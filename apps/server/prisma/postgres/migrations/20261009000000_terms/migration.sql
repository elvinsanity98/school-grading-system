-- Terms: a school year has three terms and each subject gets one grade per term
-- (this replaces two semesters of two quarters each).
--
-- Kept: users, learners, enrollments, sections, strands, subjects, the curriculum, class records (a
-- semester 1 or 2 class becomes term 1 or 2), grading periods (quarters 1 to 3 become terms 1 to 3) and
-- records from previous schools.
-- Cleared: grade data entered under the old system (assessment items, scores, quarterly grades,
-- approval status, remedial marks, observed values, reopen requests). Teachers enter it again per term.

-- Clear grade data
DELETE FROM "Score";
DELETE FROM "AssessmentItem";
DELETE FROM "ReopenRequest";
DELETE FROM "Remedial";
DELETE FROM "ObservedValue";
DELETE FROM "GradingPeriod" WHERE "quarter" > 3;

-- Grading periods: quarters 1 to 3 become terms 1 to 3 (status and release kept)
DROP INDEX "GradingPeriod_schoolYearId_quarter_key";
ALTER TABLE "GradingPeriod" RENAME COLUMN "quarter" TO "term";
CREATE UNIQUE INDEX "GradingPeriod_schoolYearId_term_key" ON "GradingPeriod"("schoolYearId", "term");

-- Curriculum and classes: semester 1 and 2 become term 1 and 2
DROP INDEX "CurriculumSubject_gradeLevel_semester_idx";
ALTER TABLE "CurriculumSubject" RENAME COLUMN "semester" TO "term";
CREATE INDEX "CurriculumSubject_gradeLevel_term_idx" ON "CurriculumSubject"("gradeLevel", "term");

DROP INDEX "ClassAssignment_sectionId_subjectId_semester_key";
ALTER TABLE "ClassAssignment" RENAME COLUMN "semester" TO "term";
CREATE UNIQUE INDEX "ClassAssignment_sectionId_subjectId_term_key" ON "ClassAssignment"("sectionId", "subjectId", "term");

-- Previous-school records keep their own wording
ALTER TABLE "ExternalRecord" ADD COLUMN "period" TEXT;
UPDATE "ExternalRecord" SET "period" = CASE "semester" WHEN 1 THEN '1st Semester' ELSE '2nd Semester' END;
ALTER TABLE "ExternalRecord" ALTER COLUMN "period" SET NOT NULL;
ALTER TABLE "ExternalRecord" DROP COLUMN "semester";

-- Tables that held only per-quarter grade data (emptied above)
DROP INDEX "AssessmentItem_classId_quarter_idx";
ALTER TABLE "AssessmentItem" DROP COLUMN "quarter";
CREATE INDEX "AssessmentItem_classId_idx" ON "AssessmentItem"("classId");

ALTER TABLE "ReopenRequest" DROP COLUMN "quarter";

DROP INDEX "ObservedValue_enrollmentId_quarter_valueKey_key";
ALTER TABLE "ObservedValue" DROP COLUMN "quarter";
ALTER TABLE "ObservedValue" ADD COLUMN "term" INTEGER NOT NULL;
CREATE UNIQUE INDEX "ObservedValue_enrollmentId_term_valueKey_key" ON "ObservedValue"("enrollmentId", "term", "valueKey");

DROP INDEX "Remedial_enrollmentId_subjectId_semester_key";
ALTER TABLE "Remedial" DROP COLUMN "semester";
ALTER TABLE "Remedial" ADD COLUMN "term" INTEGER NOT NULL;
CREATE UNIQUE INDEX "Remedial_enrollmentId_subjectId_term_key" ON "Remedial"("enrollmentId", "subjectId", "term");

-- Quarterly grades and per-quarter approvals become one row per class and per learner and class
DROP TABLE "ClassQuarter";
DROP TABLE "QuarterlyGrade";

CREATE TABLE "ClassWorkflow" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "note" TEXT,

    CONSTRAINT "ClassWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TermGrade" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "initialGrade" DOUBLE PRECISION,
    "termGrade" INTEGER,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermGrade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassWorkflow_classId_key" ON "ClassWorkflow"("classId");
CREATE INDEX "TermGrade_enrollmentId_term_idx" ON "TermGrade"("enrollmentId", "term");
CREATE INDEX "TermGrade_subjectId_idx" ON "TermGrade"("subjectId");
CREATE UNIQUE INDEX "TermGrade_classId_enrollmentId_key" ON "TermGrade"("classId", "enrollmentId");

ALTER TABLE "ClassWorkflow" ADD CONSTRAINT "ClassWorkflow_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TermGrade" ADD CONSTRAINT "TermGrade_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TermGrade" ADD CONSTRAINT "TermGrade_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New tables are closed to Supabase's public web API like every other table (see lock_down_data_api).
-- Default privileges already withhold access from anon and authenticated; row-level security must be turned on.
ALTER TABLE "ClassWorkflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TermGrade" ENABLE ROW LEVEL SECURITY;
