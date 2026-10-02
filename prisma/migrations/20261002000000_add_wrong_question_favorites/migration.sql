CREATE TABLE "WrongQuestionFavorite" (
    "id" TEXT NOT NULL,
    "wrongQuestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WrongQuestionFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WrongQuestionFavorite_wrongQuestionId_userId_key"
    ON "WrongQuestionFavorite"("wrongQuestionId", "userId");
CREATE INDEX "WrongQuestionFavorite_userId_createdAt_idx"
    ON "WrongQuestionFavorite"("userId", "createdAt");
CREATE INDEX "WrongQuestionFavorite_wrongQuestionId_idx"
    ON "WrongQuestionFavorite"("wrongQuestionId");

ALTER TABLE "WrongQuestionFavorite"
    ADD CONSTRAINT "WrongQuestionFavorite_wrongQuestionId_fkey"
    FOREIGN KEY ("wrongQuestionId") REFERENCES "WrongQuestion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WrongQuestionFavorite"
    ADD CONSTRAINT "WrongQuestionFavorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
