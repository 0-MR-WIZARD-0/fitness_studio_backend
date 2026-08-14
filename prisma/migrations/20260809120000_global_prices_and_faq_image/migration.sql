-- Глобальные цены: обычная и «курсовая» за занятие
ALTER TABLE "SiteSettings" ADD COLUMN "pricePerSession" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "SiteSettings" ADD COLUMN "priceCourse" INTEGER NOT NULL DEFAULT 4000;

-- Одно фото на все табы «вопрос-ответ»
ALTER TABLE "HomeHero" ADD COLUMN "faqImageUrl" TEXT;

-- Цена больше не задаётся у каждого формата
ALTER TABLE "Format" DROP COLUMN "pricePerSession";
