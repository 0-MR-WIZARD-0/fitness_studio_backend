-- Платёж в эквайринге привязывается к записи: номер, статус и время оплаты
ALTER TABLE "Booking" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "Booking" ADD COLUMN "paymentUrl" TEXT;
ALTER TABLE "Booking" ADD COLUMN "paidAt" TIMESTAMP(3);
CREATE INDEX "Booking_paymentId_idx" ON "Booking"("paymentId");
