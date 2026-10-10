-- Разовая цена и есть цена за один день, отдельный срок «за день» лишний
ALTER TABLE "Service" DROP COLUMN "priceDay";
UPDATE "Booking" SET "servicePeriod" = 'single' WHERE "servicePeriod" = 'day';
