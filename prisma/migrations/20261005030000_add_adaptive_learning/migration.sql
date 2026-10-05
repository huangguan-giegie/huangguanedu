ALTER TABLE "PracticeSet"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'TARGETED';

ALTER TABLE "PracticeQuestion"
  ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "knowledgePoints" JSONB,
  ADD COLUMN "sourceWrongQuestionIds" JSONB,
  ADD COLUMN "gradingMode" TEXT NOT NULL DEFAULT 'AUTO';

CREATE TABLE "PracticeAttempt" (
  "id" TEXT NOT NULL,
  "practiceQuestionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "result" "AttemptResult" NOT NULL,
  "score" INTEGER NOT NULL,
  "feedback" TEXT,
  "gradingMethod" TEXT NOT NULL DEFAULT 'DETERMINISTIC',
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeMastery" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "subject" "Subject" NOT NULL,
  "knowledgePoint" TEXT NOT NULL,
  "masteryScore" INTEGER NOT NULL DEFAULT 35,
  "stability" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "lapseCount" INTEGER NOT NULL DEFAULT 0,
  "lastReviewedAt" TIMESTAMP(3),
  "nextReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeMastery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PracticeAttempt_practiceQuestionId_attemptedAt_idx"
  ON "PracticeAttempt"("practiceQuestionId", "attemptedAt");
CREATE INDEX "PracticeAttempt_studentId_attemptedAt_idx"
  ON "PracticeAttempt"("studentId", "attemptedAt");

CREATE UNIQUE INDEX "KnowledgeMastery_studentId_subject_knowledgePoint_key"
  ON "KnowledgeMastery"("studentId", "subject", "knowledgePoint");
CREATE INDEX "KnowledgeMastery_studentId_nextReviewAt_idx"
  ON "KnowledgeMastery"("studentId", "nextReviewAt");
CREATE INDEX "KnowledgeMastery_studentId_masteryScore_idx"
  ON "KnowledgeMastery"("studentId", "masteryScore");

ALTER TABLE "PracticeAttempt"
  ADD CONSTRAINT "PracticeAttempt_practiceQuestionId_fkey"
  FOREIGN KEY ("practiceQuestionId") REFERENCES "PracticeQuestion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeAttempt"
  ADD CONSTRAINT "PracticeAttempt_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeMastery"
  ADD CONSTRAINT "KnowledgeMastery_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
