-- Дополнительную услугу можно продавать по предварительному согласованию:
-- оплатить сразу нельзя, клиент получает телефон студии и ссылку для связи.
-- Занятие по такой услуге администратор потом ставит в расписание обычным
-- образом, и оттуда клиент уже оплачивает как всегда.
ALTER TABLE "Service" ADD COLUMN "byAgreement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Service" ADD COLUMN "contactUrl" TEXT NOT NULL DEFAULT '';
