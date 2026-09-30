-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "employeeNo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" DATETIME,
    "learnerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT
);

-- CreateTable
CREATE TABLE "School" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
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
    "honorsMinSubject" INTEGER NOT NULL DEFAULT 85
);

-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "GradingPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolYearId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "released" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "GradingPeriod_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolDays" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolYearId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    CONSTRAINT "SchoolDays_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Strand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "WeightProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ww" REAL NOT NULL,
    "pt" REAL NOT NULL,
    "qa" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isImmersion" BOOLEAN NOT NULL DEFAULT false,
    "weightProfileId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Subject_weightProfileId_fkey" FOREIGN KEY ("weightProfileId") REFERENCES "WeightProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CurriculumSubject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "strandId" INTEGER,
    "gradeLevel" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CurriculumSubject_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CurriculumSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Learner" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lrn" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "extName" TEXT,
    "sex" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Section" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolYearId" INTEGER NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "strandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "adviserId" INTEGER,
    "room" TEXT,
    CONSTRAINT "Section_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Section_adviserId_fkey" FOREIGN KEY ("adviserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "learnerId" INTEGER NOT NULL,
    "schoolYearId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "dateEnrolled" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    CONSTRAINT "Enrollment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "ExternalRecord_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolYearId" INTEGER NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "teacherId" INTEGER,
    CONSTRAINT "ClassAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassQuarter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "submittedById" INTEGER,
    "reviewedAt" DATETIME,
    "reviewedById" INTEGER,
    "note" TEXT,
    CONSTRAINT "ClassQuarter_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessmentItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "component" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hps" REAL NOT NULL,
    "dateGiven" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AssessmentItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "score" REAL,
    "excused" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Score_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AssessmentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Score_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuarterlyGrade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "initialGrade" REAL,
    "quarterlyGrade" INTEGER,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuarterlyGrade_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuarterlyGrade_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReopenRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" INTEGER NOT NULL,
    "decidedById" INTEGER,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReopenRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enrollmentId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "daysPresent" INTEGER NOT NULL,
    "timesTardy" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ObservedValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enrollmentId" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "valueKey" TEXT NOT NULL,
    "marking" TEXT NOT NULL,
    CONSTRAINT "ObservedValue_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Remedial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enrollmentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "dateFrom" DATETIME,
    "dateTo" DATETIME,
    "mark" INTEGER NOT NULL,
    CONSTRAINT "Remedial_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Remedial_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
