-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "employeeNo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "learnerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "division" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "principalName" TEXT NOT NULL DEFAULT '',
    "principalTitle" TEXT NOT NULL DEFAULT 'School Head',
    "registrarName" TEXT NOT NULL DEFAULT '',
    "logo" TEXT,
    "passingGrade" INTEGER NOT NULL DEFAULT 75,
    "honorsWith" INTEGER NOT NULL DEFAULT 90,
    "honorsHigh" INTEGER NOT NULL DEFAULT 95,
    "honorsHighest" INTEGER NOT NULL DEFAULT 98,
    "honorsMinSubject" INTEGER NOT NULL DEFAULT 85,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingPeriod" (
    "id" SERIAL NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "released" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GradingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDays" (
    "id" SERIAL NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "SchoolDays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strand" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Strand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightProfile" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ww" DOUBLE PRECISION NOT NULL,
    "pt" DOUBLE PRECISION NOT NULL,
    "qa" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WeightProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isImmersion" BOOLEAN NOT NULL DEFAULT false,
    "weightProfileId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumSubject" (
    "id" SERIAL NOT NULL,
    "strandId" INTEGER,
    "gradeLevel" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CurriculumSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Learner" (
    "id" SERIAL NOT NULL,
    "lrn" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "extName" TEXT,
    "sex" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "birthPlace" TEXT,
    "address" TEXT,
    "religion" TEXT,
    "motherTongue" TEXT,
    "ipGroup" TEXT,
    "guardianName" TEXT,
    "guardianRelation" TEXT,
    "guardianContact" TEXT,
    "previousSchool" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Learner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "strandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "adviserId" INTEGER,
    "room" TEXT,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" SERIAL NOT NULL,
    "learnerId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "dateEnrolled" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalRecord" (
    "id" SERIAL NOT NULL,
    "learnerId" INTEGER NOT NULL,
    "schoolName" TEXT NOT NULL,
    "schoolId" TEXT,
    "schoolYear" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "strandName" TEXT,
    "sectionName" TEXT,
    "generalAverage" INTEGER,
    "subjects" TEXT NOT NULL,

    CONSTRAINT "ExternalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassAssignment" (
    "id" SERIAL NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "teacherId" INTEGER,

    CONSTRAINT "ClassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassQuarter" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "note" TEXT,

    CONSTRAINT "ClassQuarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentItem" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "component" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hps" DOUBLE PRECISION NOT NULL,
    "dateGiven" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "excused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterlyGrade" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "initialGrade" DOUBLE PRECISION,
    "quarterlyGrade" INTEGER,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarterlyGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReopenRequest" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" INTEGER NOT NULL,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReopenRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "daysPresent" INTEGER NOT NULL,
    "timesTardy" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservedValue" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "valueKey" TEXT NOT NULL,
    "marking" TEXT NOT NULL,

    CONSTRAINT "ObservedValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remedial" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "mark" INTEGER NOT NULL,

    CONSTRAINT "Remedial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_learnerId_idx" ON "User"("learnerId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_name_key" ON "SchoolYear"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GradingPeriod_schoolYearId_quarter_key" ON "GradingPeriod"("schoolYearId", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDays_schoolYearId_year_month_key" ON "SchoolDays"("schoolYearId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Strand_code_key" ON "Strand"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WeightProfile_code_key" ON "WeightProfile"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");

-- CreateIndex
CREATE INDEX "CurriculumSubject_gradeLevel_semester_idx" ON "CurriculumSubject"("gradeLevel", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "Learner_lrn_key" ON "Learner"("lrn");

-- CreateIndex
CREATE INDEX "Learner_lastName_firstName_idx" ON "Learner"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Section_schoolYearId_gradeLevel_strandId_name_key" ON "Section"("schoolYearId", "gradeLevel", "strandId", "name");

-- CreateIndex
CREATE INDEX "Enrollment_sectionId_idx" ON "Enrollment"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_learnerId_schoolYearId_key" ON "Enrollment"("learnerId", "schoolYearId");

-- CreateIndex
CREATE INDEX "ClassAssignment_teacherId_idx" ON "ClassAssignment"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassAssignment_sectionId_subjectId_semester_key" ON "ClassAssignment"("sectionId", "subjectId", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "ClassQuarter_classId_quarter_key" ON "ClassQuarter"("classId", "quarter");

-- CreateIndex
CREATE INDEX "AssessmentItem_classId_quarter_idx" ON "AssessmentItem"("classId", "quarter");

-- CreateIndex
CREATE INDEX "Score_enrollmentId_idx" ON "Score"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_itemId_enrollmentId_key" ON "Score"("itemId", "enrollmentId");

-- CreateIndex
CREATE INDEX "QuarterlyGrade_enrollmentId_semester_idx" ON "QuarterlyGrade"("enrollmentId", "semester");

-- CreateIndex
CREATE INDEX "QuarterlyGrade_subjectId_idx" ON "QuarterlyGrade"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyGrade_classId_enrollmentId_quarter_key" ON "QuarterlyGrade"("classId", "enrollmentId", "quarter");

-- CreateIndex
CREATE INDEX "ReopenRequest_status_idx" ON "ReopenRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_enrollmentId_year_month_key" ON "Attendance"("enrollmentId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ObservedValue_enrollmentId_quarter_valueKey_key" ON "ObservedValue"("enrollmentId", "quarter", "valueKey");

-- CreateIndex
CREATE UNIQUE INDEX "Remedial_enrollmentId_subjectId_semester_key" ON "Remedial"("enrollmentId", "subjectId", "semester");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingPeriod" ADD CONSTRAINT "GradingPeriod_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDays" ADD CONSTRAINT "SchoolDays_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_weightProfileId_fkey" FOREIGN KEY ("weightProfileId") REFERENCES "WeightProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_adviserId_fkey" FOREIGN KEY ("adviserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalRecord" ADD CONSTRAINT "ExternalRecord_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAssignment" ADD CONSTRAINT "ClassAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAssignment" ADD CONSTRAINT "ClassAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAssignment" ADD CONSTRAINT "ClassAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAssignment" ADD CONSTRAINT "ClassAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassQuarter" ADD CONSTRAINT "ClassQuarter_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AssessmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyGrade" ADD CONSTRAINT "QuarterlyGrade_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterlyGrade" ADD CONSTRAINT "QuarterlyGrade_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReopenRequest" ADD CONSTRAINT "ReopenRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservedValue" ADD CONSTRAINT "ObservedValue_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remedial" ADD CONSTRAINT "Remedial_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remedial" ADD CONSTRAINT "Remedial_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
