-- залы студии с независимым расписанием аренды и своими тарифами
CREATE TABLE "Hall" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceSingle" INTEGER NOT NULL DEFAULT 0,
    "price4" INTEGER NOT NULL DEFAULT 0,
    "price8" INTEGER NOT NULL DEFAULT 0,
    "price12" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RentalSlot" ADD COLUMN "hallId" INTEGER;
ALTER TABLE "RentalSlot" ADD CONSTRAINT "RentalSlot_hallId_fkey"
    FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Slot" ADD COLUMN "hallId" INTEGER;
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_hallId_fkey"
    FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
