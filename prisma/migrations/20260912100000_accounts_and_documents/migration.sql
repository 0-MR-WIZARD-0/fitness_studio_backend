-- личные кабинеты клиентов
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- документы студии вместо одного пользовательского соглашения
CREATE TABLE "StudioDocument" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDocument_pkey" PRIMARY KEY ("id")
);

-- уже загруженное соглашение переносим в документы
INSERT INTO "StudioDocument" ("title", "fileUrl", "order", "isActive", "updatedAt")
SELECT 'Пользовательское соглашение', "userAgreementUrl", 0, true, CURRENT_TIMESTAMP
FROM "SiteSettings"
WHERE "userAgreementUrl" <> '';

ALTER TABLE "Booking" ADD COLUMN "userId" INTEGER;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromoCode" ADD COLUMN "userId" INTEGER;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SiteSettings" ADD COLUMN "bookingEditHours" INTEGER NOT NULL DEFAULT 12;
