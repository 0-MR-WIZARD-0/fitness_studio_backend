-- автогенерация слотов только в основном зале + ссылка на бронирование
ALTER TABLE "Hall" ADD COLUMN "isMain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Hall" ADD COLUMN "bookingUrl" TEXT NOT NULL DEFAULT '';

-- первый заведённый зал становится основным
UPDATE "Hall" SET "isMain" = true
WHERE "id" = (SELECT "id" FROM "Hall" ORDER BY "order" ASC, "id" ASC LIMIT 1);
