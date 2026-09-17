-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FamilyAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_familyAccountId_fkey" FOREIGN KEY ("familyAccountId") REFERENCES "FamilyAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "avatarPath" TEXT,
    "university" TEXT,
    "major" TEXT,
    "degree" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherStudentAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME,
    CONSTRAINT "TeacherStudentAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherStudentAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuardianConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "consentedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "GuardianConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackagePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "periodText" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StudentEntitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "usedHours" INTEGER NOT NULL DEFAULT 0,
    "remainingHours" INTEGER NOT NULL DEFAULT 0,
    "monthlyOneOnOneHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentEntitlement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PackagePlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "location" TEXT NOT NULL DEFAULT '712 社区',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lockedHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MakeupCredit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MakeupCredit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MakeupCredit_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawQuestionImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "wrongQuestionId" TEXT,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RawQuestionImage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RawQuestionImage_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WrongQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "recognizedQuestion" TEXT,
    "questionType" TEXT,
    "correctSteps" JSONB,
    "thinkingHint" TEXT,
    "finalAnswer" TEXT,
    "errorCauses" JSONB,
    "knowledgePoints" JSONB,
    "difficulty" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "aiConfidence" REAL,
    "remedialPractice" JSONB,
    "errorType" TEXT,
    "studentWorkDetected" BOOLEAN,
    "studentWorkTranscription" TEXT,
    "studentApproach" TEXT,
    "firstErrorStep" TEXT,
    "misconception" TEXT,
    "whatStudentDidWell" TEXT,
    "teacherRevisedContent" JSONB,
    "teacherNote" TEXT,
    "needsTeacherReview" BOOLEAN NOT NULL DEFAULT false,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "isTeacherReviewed" BOOLEAN NOT NULL DEFAULT false,
    "studentConfirmedAt" DATETIME,
    "feedbackValue" TEXT,
    "mastered" BOOLEAN,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "WrongQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WrongQuestionOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrongQuestionId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "WrongQuestionOccurrence_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WrongQuestionKnowledgePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrongQuestionId" TEXT NOT NULL,
    "knowledgePoint" TEXT NOT NULL,
    CONSTRAINT "WrongQuestionKnowledgePoint_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentAnswerAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrongQuestionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'INCORRECT',
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentAnswerAttempt_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrongQuestionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lastError" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisJob_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stats" JSONB,
    "aiSuggestions" JSONB,
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthlyReportId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeSet_monthlyReportId_fkey" FOREIGN KEY ("monthlyReportId") REFERENCES "MonthlyReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceSetId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeQuestion_practiceSetId_fkey" FOREIGN KEY ("practiceSetId") REFERENCES "PracticeSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyAccount_userId_key" ON "FamilyAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_familyAccountId_key" ON "Student"("familyAccountId");

-- CreateIndex
CREATE INDEX "Student_name_idx" ON "Student"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE INDEX "TeacherProfile_university_idx" ON "TeacherProfile"("university");

-- CreateIndex
CREATE INDEX "TeacherStudentAssignment_studentId_idx" ON "TeacherStudentAssignment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherStudentAssignment_teacherId_studentId_key" ON "TeacherStudentAssignment"("teacherId", "studentId");

-- CreateIndex
CREATE INDEX "GuardianConsent_userId_idx" ON "GuardianConsent"("userId");

-- CreateIndex
CREATE INDEX "PackagePlan_type_idx" ON "PackagePlan"("type");

-- CreateIndex
CREATE INDEX "StudentEntitlement_studentId_idx" ON "StudentEntitlement"("studentId");

-- CreateIndex
CREATE INDEX "StudentEntitlement_planId_idx" ON "StudentEntitlement"("planId");

-- CreateIndex
CREATE INDEX "CourseSlot_date_idx" ON "CourseSlot"("date");

-- CreateIndex
CREATE INDEX "CourseSlot_teacherId_idx" ON "CourseSlot"("teacherId");

-- CreateIndex
CREATE INDEX "CourseSlot_subject_idx" ON "CourseSlot"("subject");

-- CreateIndex
CREATE INDEX "CourseSlot_type_idx" ON "CourseSlot"("type");

-- CreateIndex
CREATE INDEX "Booking_slotId_idx" ON "Booking"("slotId");

-- CreateIndex
CREATE INDEX "Booking_studentId_idx" ON "Booking"("studentId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_studentId_slotId_key" ON "Booking"("studentId", "slotId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_slotId_idx" ON "AttendanceRecord"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_slotId_key" ON "AttendanceRecord"("studentId", "slotId");

-- CreateIndex
CREATE INDEX "MakeupCredit_studentId_idx" ON "MakeupCredit"("studentId");

-- CreateIndex
CREATE INDEX "MakeupCredit_createdBy_idx" ON "MakeupCredit"("createdBy");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "RawQuestionImage_studentId_idx" ON "RawQuestionImage"("studentId");

-- CreateIndex
CREATE INDEX "RawQuestionImage_wrongQuestionId_idx" ON "RawQuestionImage"("wrongQuestionId");

-- CreateIndex
CREATE INDEX "RawQuestionImage_expiresAt_idx" ON "RawQuestionImage"("expiresAt");

-- CreateIndex
CREATE INDEX "RawQuestionImage_reviewStatus_idx" ON "RawQuestionImage"("reviewStatus");

-- CreateIndex
CREATE INDEX "WrongQuestion_studentId_idx" ON "WrongQuestion"("studentId");

-- CreateIndex
CREATE INDEX "WrongQuestion_subject_idx" ON "WrongQuestion"("subject");

-- CreateIndex
CREATE INDEX "WrongQuestion_status_idx" ON "WrongQuestion"("status");

-- CreateIndex
CREATE INDEX "WrongQuestion_deletedAt_idx" ON "WrongQuestion"("deletedAt");

-- CreateIndex
CREATE INDEX "WrongQuestion_isTeacherReviewed_idx" ON "WrongQuestion"("isTeacherReviewed");

-- CreateIndex
CREATE INDEX "WrongQuestionOccurrence_wrongQuestionId_idx" ON "WrongQuestionOccurrence"("wrongQuestionId");

-- CreateIndex
CREATE INDEX "WrongQuestionOccurrence_occurredAt_idx" ON "WrongQuestionOccurrence"("occurredAt");

-- CreateIndex
CREATE INDEX "WrongQuestionKnowledgePoint_knowledgePoint_idx" ON "WrongQuestionKnowledgePoint"("knowledgePoint");

-- CreateIndex
CREATE UNIQUE INDEX "WrongQuestionKnowledgePoint_wrongQuestionId_knowledgePoint_key" ON "WrongQuestionKnowledgePoint"("wrongQuestionId", "knowledgePoint");

-- CreateIndex
CREATE INDEX "StudentAnswerAttempt_wrongQuestionId_idx" ON "StudentAnswerAttempt"("wrongQuestionId");

-- CreateIndex
CREATE INDEX "StudentAnswerAttempt_attemptedAt_idx" ON "StudentAnswerAttempt"("attemptedAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_nextRunAt_idx" ON "AnalysisJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_wrongQuestionId_idx" ON "AnalysisJob"("wrongQuestionId");

-- CreateIndex
CREATE INDEX "MonthlyReport_studentId_status_idx" ON "MonthlyReport"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_studentId_month_key" ON "MonthlyReport"("studentId", "month");

-- CreateIndex
CREATE INDEX "PracticeSet_monthlyReportId_idx" ON "PracticeSet"("monthlyReportId");

-- CreateIndex
CREATE INDEX "PracticeQuestion_practiceSetId_idx" ON "PracticeQuestion"("practiceSetId");
