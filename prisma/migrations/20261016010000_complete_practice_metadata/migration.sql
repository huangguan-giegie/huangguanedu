-- 兼容线上已有字段，同时为全新数据库补齐历史分支曾手工创建的元数据。
ALTER TABLE "PracticeSet"
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'TARGETED';

ALTER TABLE "PracticeQuestion"
  ADD COLUMN IF NOT EXISTS "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "knowledgePoints" JSONB,
  ADD COLUMN IF NOT EXISTS "sourceWrongQuestionIds" JSONB,
  ADD COLUMN IF NOT EXISTS "gradingMode" TEXT NOT NULL DEFAULT 'AUTO';
