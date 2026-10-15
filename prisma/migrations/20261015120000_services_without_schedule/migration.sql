-- Дополнительные услуги больше не ставятся в расписание и не согласуются:
-- запись по предварительному согласованию переехала в отдельные направления (Format).
ALTER TABLE "Slot" DROP CONSTRAINT IF EXISTS "Slot_serviceId_fkey";
ALTER TABLE "Slot" DROP COLUMN IF EXISTS "serviceId";

ALTER TABLE "Service" DROP COLUMN IF EXISTS "byAgreement";
ALTER TABLE "Service" DROP COLUMN IF EXISTS "contactUrl";
