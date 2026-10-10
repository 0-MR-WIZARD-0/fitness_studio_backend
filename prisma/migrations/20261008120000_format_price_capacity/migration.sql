-- Цена занятия и количество мест переезжают из общих настроек в формат:
-- у каждого формата они свои. Количество занятий для курса остаётся общим.
ALTER TABLE "Format" ADD COLUMN "price" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Format" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 7;

-- inCourse: занятия формата засчитываются в курс. Форматы, где он снят,
-- в тройку для подарка не попадают.
ALTER TABLE "Format" ADD COLUMN "inCourse" BOOLEAN NOT NULL DEFAULT true;

-- переносим прежнюю общую цену в каждый формат, чтобы занятия не обнулились
UPDATE "Format"
SET "price" = COALESCE(
  (SELECT "pricePerSession" FROM "SiteSettings" WHERE "id" = 1),
  0
);

-- и прежнюю вместимость берём у уже созданных занятий этого формата
UPDATE "Format" f
SET "capacity" = s."capacity"
FROM (
  SELECT DISTINCT ON ("formatId") "formatId", "capacity"
  FROM "Slot"
  WHERE "formatId" IS NOT NULL
  ORDER BY "formatId", "startsAt" DESC
) s
WHERE s."formatId" = f."id";

ALTER TABLE "SiteSettings" DROP COLUMN "pricePerSession";
ALTER TABLE "SiteSettings" DROP COLUMN "priceCourse";
