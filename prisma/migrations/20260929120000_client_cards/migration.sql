-- Протокол функциональной диагностики: карточка клиента и история замеров
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE');
CREATE TYPE "BodyType" AS ENUM ('ASTHENIC', 'NORMOSTHENIC', 'HYPERSTHENIC');

-- Постоянные данные клиента: пол, дата рождения и рост нужны, чтобы посчитать
-- Т/Р, ИМТ и идеальный вес; тип телосложения даёт поправку в формуле Брока
CREATE TABLE "ClientCard" (
  "id"          SERIAL PRIMARY KEY,
  "userId"      INTEGER NOT NULL,
  "sex"         "Sex",
  "birthDate"   TIMESTAMP(3),
  "heightCm"    DOUBLE PRECISION,
  "bodyType"    "BodyType",
  "note"        TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "updatedById" INTEGER
);
CREATE UNIQUE INDEX "ClientCard_userId_key" ON "ClientCard"("userId");
ALTER TABLE "ClientCard" ADD CONSTRAINT "ClientCard_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientCard" ADD CONSTRAINT "ClientCard_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Один замер — один визит. Вычисляемое (ИМТ, Т/Б, Т/Р, идеальный вес) не храним
CREATE TABLE "Measurement" (
  "id"              SERIAL PRIMARY KEY,
  "cardId"          INTEGER NOT NULL,
  "takenAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "chestCm"         DOUBLE PRECISION,
  "waistCm"         DOUBLE PRECISION,
  "hipsCm"          DOUBLE PRECISION,
  "armCm"           DOUBLE PRECISION,
  "thighCm"         DOUBLE PRECISION,
  "calfCm"          DOUBLE PRECISION,
  "weightKg"        DOUBLE PRECISION,
  "fatPct"          DOUBLE PRECISION,
  "muscleKg"        DOUBLE PRECISION,
  "visceralFat"     DOUBLE PRECISION,
  "waterPct"        DOUBLE PRECISION,
  "boneKg"          DOUBLE PRECISION,
  "metabolicAge"    INTEGER,
  "bmr"             INTEGER,
  "strengths"       TEXT NOT NULL DEFAULT '',
  "risks"           TEXT NOT NULL DEFAULT '',
  "trainingAdvice"  TEXT NOT NULL DEFAULT '',
  "nutritionAdvice" TEXT NOT NULL DEFAULT '',
  "nextCheckAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "createdById"     INTEGER,
  "updatedById"     INTEGER
);
CREATE INDEX "Measurement_cardId_takenAt_idx" ON "Measurement"("cardId", "takenAt");
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "ClientCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Справочник функциональных тестов: их состав тренер меняет из админки
CREATE TABLE "FunctionalTest" (
  "id"        SERIAL PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "measures"  TEXT NOT NULL DEFAULT '',
  "howTo"     TEXT NOT NULL DEFAULT '',
  "norm"      TEXT NOT NULL DEFAULT '',
  "unit"      TEXT NOT NULL DEFAULT '',
  "order"     INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "MeasurementTest" (
  "id"            SERIAL PRIMARY KEY,
  "measurementId" INTEGER NOT NULL,
  "testId"        INTEGER NOT NULL,
  "value"         TEXT NOT NULL DEFAULT '',
  "passed"        BOOLEAN
);
CREATE UNIQUE INDEX "MeasurementTest_measurementId_testId_key"
  ON "MeasurementTest"("measurementId", "testId");
ALTER TABLE "MeasurementTest" ADD CONSTRAINT "MeasurementTest_measurementId_fkey"
  FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeasurementTest" ADD CONSTRAINT "MeasurementTest_testId_fkey"
  FOREIGN KEY ("testId") REFERENCES "FunctionalTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Восемь тестов из бумажного протокола
INSERT INTO "FunctionalTest" ("name", "measures", "howTo", "norm", "unit", "order", "updatedAt") VALUES
  ('Ромберг простой', 'Баланс, проприоцепция', 'Ноги вместе, глаза открыты 30 сек, затем закрыты 30 сек', '30–50 сек', 'сек', 1, CURRENT_TIMESTAMP),
  ('Ромберг усложнённый', 'Баланс, вестибулярный аппарат', 'Носок к пятке, глаза закрыты', '15–30 сек', 'сек', 2, CURRENT_TIMESTAMP),
  ('Стойка на одной ноге', 'Баланс, сила стопы', 'Одна нога, руки на поясе', '11 сек и больше', 'сек', 3, CURRENT_TIMESTAMP),
  ('Встать со стула (30 сек)', 'Сила ног', 'Руки скрещены, встать-сесть', '60+: 14–19 раз', 'раз', 4, CURRENT_TIMESTAMP),
  ('Наклон вперёд сидя', 'Гибкость', 'Ноги прямые, наклон', 'Пальцы до стоп', 'см', 5, CURRENT_TIMESTAMP),
  ('Почеши спину', 'Мобильность плеч', 'Соединить пальцы за спиной', '0 см', 'см', 6, CURRENT_TIMESTAMP),
  ('Осанка у стены', 'Изгибы позвоночника', 'Зазор у поясницы', '3–5 см', 'см', 7, CURRENT_TIMESTAMP),
  ('Гибкость подвздошно-поясничной', 'Укорочение сгибателей бедра', 'Лёжа на краю, нога свисает, колено второй ноги к груди', 'Нога на уровне лавки', '', 8, CURRENT_TIMESTAMP);
