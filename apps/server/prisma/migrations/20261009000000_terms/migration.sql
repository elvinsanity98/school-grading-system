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

-- DropIndex
DROP INDEX "ClassQuarter_classId_quarter_key";

-- DropIndex
DROP INDEX "QuarterlyGrade_enrollmentId_semester_idx";

-- DropIndex
DROP INDEX "QuarterlyGrade_subjectId_idx";

-- DropIndex
DROP INDEX "QuarterlyGrade_classId_enrollmentId_quarter_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ClassQuarter";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "QuarterlyGrade";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ClassWorkflow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "submittedById" INTEGER,
    "reviewedAt" DATETIME,
    "reviewedById" INTEGER,
    "note" TEXT,
    CONSTRAINT "ClassWorkflow_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TermGrade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "initialGrade" REAL,
    "termGrade" INTEGER,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TermGrade_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TermGrade_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GradingPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolYearId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "released" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "GradingPeriod_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GradingPeriod" ("id", "released", "schoolYearId", "status", "term") SELECT "id", "released", "schoolYearId", "status", "quarter" FROM "GradingPeriod";
DROP TABLE "GradingPeriod";
ALTER TABLE "new_GradingPeriod" RENAME TO "GradingPeriod";
CREATE UNIQUE INDEX "GradingPeriod_schoolYearId_term_key" ON "GradingPeriod"("schoolYearId", "term");
CREATE TABLE "new_CurriculumSubject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "strandId" INTEGER,
    "gradeLevel" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CurriculumSubject_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CurriculumSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CurriculumSubject" ("gradeLevel", "id", "sortOrder", "strandId", "subjectId", "term") SELECT "gradeLevel", "id", "sortOrder", "strandId", "subjectId", "semester" FROM "CurriculumSubject";
DROP TABLE "CurriculumSubject";
ALTER TABLE "new_CurriculumSubject" RENAME TO "CurriculumSubject";
CREATE INDEX "CurriculumSubject_gradeLevel_term_idx" ON "CurriculumSubject"("gradeLevel", "term");
CREATE TABLE "new_ExternalRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "learnerId" INTEGER NOT NULL,
    "schoolName" TEXT NOT NULL,
    "schoolId" TEXT,
    "schoolYear" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "strandName" TEXT,
    "sectionName" TEXT,
    "generalAverage" INTEGER,
    "subjects" TEXT NOT NULL,
    CONSTRAINT "ExternalRecord_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExternalRecord" ("generalAverage", "gradeLevel", "id", "learnerId", "period", "schoolId", "schoolName", "schoolYear", "sectionName", "strandName", "subjects") SELECT "generalAverage", "gradeLevel", "id", "learnerId", CASE "semester" WHEN 1 THEN '1st Semester' ELSE '2nd Semester' END, "schoolId", "schoolName", "schoolYear", "sectionName", "strandName", "subjects" FROM "ExternalRecord";
DROP TABLE "ExternalRecord";
ALTER TABLE "new_ExternalRecord" RENAME TO "ExternalRecord";
CREATE TABLE "new_ClassAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolYearId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "teacherId" INTEGER,
    CONSTRAINT "ClassAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClassAssignment" ("id", "schoolYearId", "sectionId", "subjectId", "teacherId", "term") SELECT "id", "schoolYearId", "sectionId", "subjectId", "teacherId", "semester" FROM "ClassAssignment";
DROP TABLE "ClassAssignment";
ALTER TABLE "new_ClassAssignment" RENAME TO "ClassAssignment";
CREATE INDEX "ClassAssignment_teacherId_idx" ON "ClassAssignment"("teacherId");
CREATE UNIQUE INDEX "ClassAssignment_sectionId_subjectId_term_key" ON "ClassAssignment"("sectionId", "subjectId", "term");
CREATE TABLE "new_AssessmentItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "component" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hps" REAL NOT NULL,
    "dateGiven" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AssessmentItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentItem" ("classId", "component", "dateGiven", "hps", "id", "sortOrder", "title") SELECT "classId", "component", "dateGiven", "hps", "id", "sortOrder", "title" FROM "AssessmentItem";
DROP TABLE "AssessmentItem";
ALTER TABLE "new_AssessmentItem" RENAME TO "AssessmentItem";
CREATE INDEX "AssessmentItem_classId_idx" ON "AssessmentItem"("classId");
CREATE TABLE "new_ReopenRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" INTEGER NOT NULL,
    "decidedById" INTEGER,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReopenRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReopenRequest" ("classId", "createdAt", "decidedAt", "decidedById", "id", "reason", "requestedById", "status") SELECT "classId", "createdAt", "decidedAt", "decidedById", "id", "reason", "requestedById", "status" FROM "ReopenRequest";
DROP TABLE "ReopenRequest";
ALTER TABLE "new_ReopenRequest" RENAME TO "ReopenRequest";
CREATE INDEX "ReopenRequest_status_idx" ON "ReopenRequest"("status");
CREATE TABLE "new_ObservedValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enrollmentId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "valueKey" TEXT NOT NULL,
    "marking" TEXT NOT NULL,
    CONSTRAINT "ObservedValue_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ObservedValue" ("enrollmentId", "id", "marking", "valueKey") SELECT "enrollmentId", "id", "marking", "valueKey" FROM "ObservedValue";
DROP TABLE "ObservedValue";
ALTER TABLE "new_ObservedValue" RENAME TO "ObservedValue";
CREATE UNIQUE INDEX "ObservedValue_enrollmentId_term_valueKey_key" ON "ObservedValue"("enrollmentId", "term", "valueKey");
CREATE TABLE "new_Remedial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "dateFrom" DATETIME,
    "dateTo" DATETIME,
    "mark" INTEGER NOT NULL,
    CONSTRAINT "Remedial_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Remedial_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Remedial" ("dateFrom", "dateTo", "enrollmentId", "id", "mark", "subjectId") SELECT "dateFrom", "dateTo", "enrollmentId", "id", "mark", "subjectId" FROM "Remedial";
DROP TABLE "Remedial";
ALTER TABLE "new_Remedial" RENAME TO "Remedial";
CREATE UNIQUE INDEX "Remedial_enrollmentId_subjectId_term_key" ON "Remedial"("enrollmentId", "subjectId", "term");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ClassWorkflow_classId_key" ON "ClassWorkflow"("classId");

-- CreateIndex
CREATE INDEX "TermGrade_enrollmentId_term_idx" ON "TermGrade"("enrollmentId", "term");

-- CreateIndex
CREATE INDEX "TermGrade_subjectId_idx" ON "TermGrade"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "TermGrade_classId_enrollmentId_key" ON "TermGrade"("classId", "enrollmentId");
