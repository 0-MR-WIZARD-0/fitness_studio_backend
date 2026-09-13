-- авто-слоты аренды: признак автогенерации + настройки окна аренды
ALTER TABLE "RentalSlot" ADD COLUMN "isAuto" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SiteSettings" ADD COLUMN "rentPricePerHour" INTEGER NOT NULL DEFAULT 3000;
ALTER TABLE "SiteSettings" ADD COLUMN "rentDayStart" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "SiteSettings" ADD COLUMN "rentDayEnd" TEXT NOT NULL DEFAULT '17:30';
ALTER TABLE "SiteSettings" ADD COLUMN "rentBufferMin" INTEGER NOT NULL DEFAULT 30;
