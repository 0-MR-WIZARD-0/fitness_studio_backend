-- своё окно аренды и перерыв у каждого зала
ALTER TABLE "Hall" ADD COLUMN "dayStart" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "Hall" ADD COLUMN "dayEnd" TEXT NOT NULL DEFAULT '17:30';
ALTER TABLE "Hall" ADD COLUMN "bufferMin" INTEGER NOT NULL DEFAULT 30;

-- существующим залам переносим общие настройки студии
UPDATE "Hall" SET
    "dayStart" = COALESCE((SELECT "rentDayStart" FROM "SiteSettings" WHERE "id" = 1), '09:00'),
    "dayEnd" = COALESCE((SELECT "rentDayEnd" FROM "SiteSettings" WHERE "id" = 1), '17:30'),
    "bufferMin" = COALESCE((SELECT "rentBufferMin" FROM "SiteSettings" WHERE "id" = 1), 30);

-- в студии всегда есть основной зал
INSERT INTO "Hall" (
    "title", "description", "priceSingle", "price4", "price8", "price12",
    "isMain", "bookingUrl", "dayStart", "dayEnd", "bufferMin",
    "order", "isActive", "updatedAt"
)
SELECT
    'Основной зал',
    '',
    COALESCE((SELECT "rentPricePerHour" FROM "SiteSettings" WHERE "id" = 1), 3000),
    0, 0, 0,
    true,
    '',
    COALESCE((SELECT "rentDayStart" FROM "SiteSettings" WHERE "id" = 1), '09:00'),
    COALESCE((SELECT "rentDayEnd" FROM "SiteSettings" WHERE "id" = 1), '17:30'),
    COALESCE((SELECT "rentBufferMin" FROM "SiteSettings" WHERE "id" = 1), 30),
    0, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Hall");
