-- Persist canonical, server-validated diagram parameters for practice questions.
ALTER TABLE "PracticeQuestion" ADD COLUMN "diagram" JSONB;
