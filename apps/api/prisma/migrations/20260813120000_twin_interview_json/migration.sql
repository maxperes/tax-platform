-- Persist structured interview answers alongside Twin inventory

ALTER TABLE "TwinCase" ADD COLUMN "interviewJson" JSONB;
