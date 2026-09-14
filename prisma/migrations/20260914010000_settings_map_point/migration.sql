-- Координаты метки студии на карте: подставляются по адресу, админ может поправить
ALTER TABLE "SiteSettings" ADD COLUMN "mapLat" DOUBLE PRECISION;
ALTER TABLE "SiteSettings" ADD COLUMN "mapLng" DOUBLE PRECISION;
