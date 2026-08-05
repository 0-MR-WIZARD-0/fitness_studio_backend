-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "trainerId" INTEGER;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
