-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "rentalSlotId" INTEGER;

-- CreateTable
CREATE TABLE "RentalSlot" (
    "id" SERIAL NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalSlot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_rentalSlotId_fkey" FOREIGN KEY ("rentalSlotId") REFERENCES "RentalSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

