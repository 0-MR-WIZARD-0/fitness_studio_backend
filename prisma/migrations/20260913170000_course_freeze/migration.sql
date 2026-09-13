-- подарок привязан к конкретному курсу
ALTER TABLE "PromoCode" ADD COLUMN "courseGroupId" TEXT;

-- за сколько часов до первого занятия можно отказаться от курса
ALTER TABLE "SiteSettings" ADD COLUMN "courseCancelHours" INTEGER NOT NULL DEFAULT 12;

-- заморозка занятия: по одной за каждый собранный курс
CREATE TABLE "CourseFreeze" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseGroupId" TEXT NOT NULL,
    "bookingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "CourseFreeze_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseFreeze_userId_idx" ON "CourseFreeze"("userId");

ALTER TABLE "CourseFreeze" ADD CONSTRAINT "CourseFreeze_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
