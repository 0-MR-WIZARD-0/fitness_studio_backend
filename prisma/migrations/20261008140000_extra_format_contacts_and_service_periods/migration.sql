-- Дополнительный формат может идти без расписания: записи на него нет,
-- вместо кнопки клиент получает комментарий и способ связаться
ALTER TABLE "Format" ADD COLUMN "inSchedule" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Format" ADD COLUMN "contactUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Format" ADD COLUMN "scheduleNote" TEXT NOT NULL DEFAULT '';

-- У дополнительной услуги может быть несколько сроков с разной ценой.
-- NULL означает «такого срока нет» — клиенту он не показывается.
ALTER TABLE "Service" ADD COLUMN "priceDay" INTEGER;
ALTER TABLE "Service" ADD COLUMN "priceWeek" INTEGER;
ALTER TABLE "Service" ADD COLUMN "priceMonth" INTEGER;
ALTER TABLE "Service" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;

-- услуги, которые уже были бесплатными, помечаем явно
UPDATE "Service" SET "isFree" = true WHERE "price" = 0;

-- какой срок услуги выбрал клиент при записи
ALTER TABLE "Booking" ADD COLUMN "servicePeriod" TEXT;
