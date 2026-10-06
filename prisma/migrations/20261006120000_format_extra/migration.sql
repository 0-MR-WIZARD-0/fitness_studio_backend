-- Форматы делятся на основные и дополнительные: на странице форматов это
-- две вкладки, а функционально они ничем не отличаются
ALTER TABLE "Format" ADD COLUMN "isExtra" BOOLEAN NOT NULL DEFAULT false;
