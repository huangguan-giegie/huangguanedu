-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER', 'FAMILY');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('SMALL_CLASS', 'ONE_ON_ONE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'FULL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'ABSENT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('MATH', 'ENGLISH');

-- CreateEnum
CREATE TYPE "WrongQuestionStatus" AS ENUM ('PROCESSING', 'PENDING_STUDENT_CONFIRMATION', 'PUBLISHED', 'NEEDS_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FeedbackValue" AS ENUM ('ACCURATE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RawImageReviewStatus" AS ENUM ('NORMAL', 'AWAITING_REVIEW', 'REVIEWED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('CORRECT', 'INCORRECT', 'PARTIAL');

-- CreateEnum
CREATE TYPE "SummaryType" AS ENUM ('WEEKLY', 'MONTHLY', 'SEMESTER');

-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'REVIEWED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FamilyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "familyAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarPath" TEXT,
    "university" TEXT,
    "major" TEXT,
    "degree" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherStudentAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "TeacherStudentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "GuardianConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CourseType" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "periodText" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEntitlement" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "usedHours" INTEGER NOT NULL DEFAULT 0,
    "remainingHours" INTEGER NOT NULL DEFAULT 0,
    "monthlyOneOnOneHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSlot" (
    "id" TEXT NOT NULL,
    "type" "CourseType" NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL DEFAULT '712 社区',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "entitlementId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "lockedHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeupCredit" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MakeupCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawQuestionImage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "wrongQuestionId" TEXT,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewStatus" "RawImageReviewStatus" NOT NULL DEFAULT 'NORMAL',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawQuestionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrongQuestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "status" "WrongQuestionStatus" NOT NULL DEFAULT 'PROCESSING',
    "recognizedQuestion" TEXT,
    "questionType" TEXT,
    "correctSteps" JSONB,
    "thinkingHint" TEXT,
    "finalAnswer" TEXT,
    "errorCauses" JSONB,
    "knowledgePoints" JSONB,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'UNKNOWN',
    "aiConfidence" DOUBLE PRECISION,
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
    "studentConfirmedAt" TIMESTAMP(3),
    "feedbackValue" "FeedbackValue",
    "mastered" BOOLEAN,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WrongQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrongQuestionOccurrence" (
    "id" TEXT NOT NULL,
    "wrongQuestionId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "WrongQuestionOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrongQuestionKnowledgePoint" (
    "id" TEXT NOT NULL,
    "wrongQuestionId" TEXT NOT NULL,
    "knowledgePoint" TEXT NOT NULL,

    CONSTRAINT "WrongQuestionKnowledgePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAnswerAttempt" (
    "id" TEXT NOT NULL,
    "wrongQuestionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "result" "AttemptResult" NOT NULL DEFAULT 'INCORRECT',
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAnswerAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "wrongQuestionId" TEXT NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSummary" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "SummaryType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SummaryStatus" NOT NULL DEFAULT 'DRAFT',
    "stats" JSONB,
    "aiSuggestions" JSONB,
    "aiError" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "needsRetry" BOOLEAN NOT NULL DEFAULT false,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "isTeacherReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSet" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summaryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "practiceSetId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "StudentEntitlement_studentId_planId_key" ON "StudentEntitlement"("studentId", "planId");

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
CREATE INDEX "LearningSummary_studentId_status_idx" ON "LearningSummary"("studentId", "status");

-- CreateIndex
CREATE INDEX "LearningSummary_type_periodStart_periodEnd_idx" ON "LearningSummary"("type", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "LearningSummary_needsRetry_idx" ON "LearningSummary"("needsRetry");

-- CreateIndex
CREATE UNIQUE INDEX "LearningSummary_studentId_type_periodStart_periodEnd_key" ON "LearningSummary"("studentId", "type", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "AcademicTerm_isActive_startDate_idx" ON "AcademicTerm"("isActive", "startDate");

-- CreateIndex
CREATE INDEX "PracticeSet_studentId_idx" ON "PracticeSet"("studentId");

-- CreateIndex
CREATE INDEX "PracticeSet_summaryId_idx" ON "PracticeSet"("summaryId");

-- CreateIndex
CREATE INDEX "PracticeQuestion_practiceSetId_idx" ON "PracticeQuestion"("practiceSetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAccount" ADD CONSTRAINT "FamilyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_familyAccountId_fkey" FOREIGN KEY ("familyAccountId") REFERENCES "FamilyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudentAssignment" ADD CONSTRAINT "TeacherStudentAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherStudentAssignment" ADD CONSTRAINT "TeacherStudentAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianConsent" ADD CONSTRAINT "GuardianConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PackagePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSlot" ADD CONSTRAINT "CourseSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "StudentEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupCredit" ADD CONSTRAINT "MakeupCredit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeupCredit" ADD CONSTRAINT "MakeupCredit_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawQuestionImage" ADD CONSTRAINT "RawQuestionImage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawQuestionImage" ADD CONSTRAINT "RawQuestionImage_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongQuestion" ADD CONSTRAINT "WrongQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongQuestionOccurrence" ADD CONSTRAINT "WrongQuestionOccurrence_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongQuestionKnowledgePoint" ADD CONSTRAINT "WrongQuestionKnowledgePoint_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswerAttempt" ADD CONSTRAINT "StudentAnswerAttempt_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_wrongQuestionId_fkey" FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSummary" ADD CONSTRAINT "LearningSummary_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSummary" ADD CONSTRAINT "LearningSummary_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSet" ADD CONSTRAINT "PracticeSet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSet" ADD CONSTRAINT "PracticeSet_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "LearningSummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_practiceSetId_fkey" FOREIGN KEY ("practiceSetId") REFERENCES "PracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
