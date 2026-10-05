-- 兼容首次部署及已执行部分字段升级的数据库。
-- AlterTable
ALTER TABLE "AnalysisJob" ADD COLUMN IF NOT EXISTS "modelOverride" TEXT;

-- AlterTable
ALTER TABLE "PracticeQuestion" ADD COLUMN IF NOT EXISTS "imagePath" TEXT;

-- CreateTable
CREATE TABLE "PracticeGenerationJob" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "difficulty" TEXT,
    "wrongQuestionIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "resultPracticeSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeGenerationJob_resultPracticeSetId_key" ON "PracticeGenerationJob"("resultPracticeSetId");

-- CreateIndex
CREATE INDEX "PracticeGenerationJob_status_createdAt_idx" ON "PracticeGenerationJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeGenerationJob_studentId_idx" ON "PracticeGenerationJob"("studentId");

-- CreateIndex
CREATE INDEX "PracticeGenerationJob_requestedById_createdAt_idx" ON "PracticeGenerationJob"("requestedById", "createdAt");

-- AddForeignKey
ALTER TABLE "PracticeGenerationJob" ADD CONSTRAINT "PracticeGenerationJob_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGenerationJob" ADD CONSTRAINT "PracticeGenerationJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGenerationJob" ADD CONSTRAINT "PracticeGenerationJob_resultPracticeSetId_fkey" FOREIGN KEY ("resultPracticeSetId") REFERENCES "PracticeSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
