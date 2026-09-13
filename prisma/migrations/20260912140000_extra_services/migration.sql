-- дополнительные услуги студии
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL DEFAULT 0,
    "durationMin" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- слот со временем принадлежит услуге; NULL — аренда студии
ALTER TABLE "RentalSlot" ADD COLUMN "serviceId" INTEGER;
ALTER TABLE "RentalSlot" ADD CONSTRAINT "RentalSlot_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- заявка на услугу без времени
ALTER TABLE "Booking" ADD COLUMN "serviceId" INTEGER;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
