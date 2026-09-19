-- Роли админов: главный администратор и тренеры со своей карточкой
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'TRAINER');
ALTER TABLE "Admin" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'OWNER';
ALTER TABLE "Admin" ADD COLUMN "trainerId" INTEGER;
CREATE UNIQUE INDEX "Admin_trainerId_key" ON "Admin"("trainerId");
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Кто создал занятие, анонс, услугу и промокод: тренер меняет только своё
ALTER TABLE "Slot" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Service" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "Service" ADD CONSTRAINT "Service_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoCode" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Автогенерация аренды теперь у любого зала, а не у единственного основного
ALTER TABLE "Hall" ADD COLUMN "autoSchedule" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Hall" SET "autoSchedule" = "isMain";
ALTER TABLE "Hall" DROP COLUMN "isMain";

-- Занятие всегда проходит в зале: прежние «на всю студию» переносим в зал
-- с автогенерацией, чтобы они и дальше закрывали его часы аренды
UPDATE "Slot"
SET "hallId" = (
  SELECT "id" FROM "Hall" ORDER BY "autoSchedule" DESC, "order" ASC, "id" ASC LIMIT 1
)
WHERE "hallId" IS NULL;

-- Вопросы, шаги и форматы больше не скрываются переключателем
UPDATE "HomeFaq" SET "isActive" = true;
UPDATE "HomeStep" SET "isActive" = true;
UPDATE "Format" SET "isActive" = true;
