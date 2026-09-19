-- Услуги больше не записываются по времени: почасовое расписание есть только у залов
UPDATE "Service" SET "durationMin" = NULL;

-- Будущие свободные часы, привязанные к услугам, больше не нужны.
-- Уже занятые клиентами часы остаются, чтобы не потерять записи.
DELETE FROM "RentalSlot" r
WHERE r."serviceId" IS NOT NULL
  AND r."startsAt" >= now()
  AND NOT EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b."rentalSlotId" = r."id" AND b."status" <> 'CANCELLED'
  );
