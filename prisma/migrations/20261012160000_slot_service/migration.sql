-- Занятие в расписании может относиться к дополнительной услуге,
-- которую согласовали со студией: админ ставит слот, клиент записывается
-- и оплачивает его обычным порядком.
ALTER TABLE "Slot" ADD COLUMN "serviceId" INTEGER;
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
