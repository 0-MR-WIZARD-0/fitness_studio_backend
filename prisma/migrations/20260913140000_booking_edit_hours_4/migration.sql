-- перенос и отмена записи — не позднее чем за 4 часа до начала
ALTER TABLE "SiteSettings" ALTER COLUMN "bookingEditHours" SET DEFAULT 4;
UPDATE "SiteSettings" SET "bookingEditHours" = 4 WHERE "bookingEditHours" = 12;
