import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PromoService } from '../promo/promo.service';
import { courseIds } from './course';
import { MailService } from '../mail/mail.service';
import {
  AnnouncementBookingDto,
  CartBookingDto,
  CreateSlotDto,
  CreateWeekdaySlotsDto,
  SingleBookingDto,
  UpdateSlotDto,
} from './dto';

const MS_DAY = 86400000;

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PromoService,
    private readonly mail: MailService,
  ) {}

  async availableSlots(formatId?: number) {
    return this.mapAvailable({
      isDiagnostic: false,
      ...(formatId ? { formatId } : {}),
    });
  }

  async diagnosticSlots() {
    return this.mapAvailable({ isDiagnostic: true });
  }

  private async mapAvailable(where: Record<string, unknown>) {
    const threshold = await this.courseThreshold();
    const slots = await this.prisma.slot.findMany({
      where: { startsAt: { gte: new Date() }, ...where },
      orderBy: { startsAt: 'asc' },
      include: {
        format: true,
        trainer: true,
        _count: { select: { bookings: true } },
      },
    });
    return slots
      .map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        durationMin: s.durationMin,
        capacity: s.capacity,
        formatId: s.formatId,
        isDiagnostic: s.isDiagnostic,
        formatName: s.format?.name ?? null,
        trainerId: s.trainerId,
        trainerName: s.trainer?.name ?? null,
        pricePerSession: s.format?.pricePerSession ?? 0,
        coursePerSession: s.format
          ? Math.round(s.format.priceCourse / threshold)
          : 0,
        taken: s._count.bookings,
        remaining: s.capacity - s._count.bookings,
      }))
      .filter((s) => s.remaining > 0);
  }

  private async courseThreshold(): Promise<number> {
    const s = await this.prisma.siteSettings.findUnique({ where: { id: 1 } });
    return Math.max(1, s?.courseThreshold ?? 3);
  }

  allSlots() {
    return this.prisma.slot.findMany({
      orderBy: { startsAt: 'asc' },
      include: {
        format: true,
        trainer: true,
        bookings: true,
        _count: { select: { bookings: true } },
      },
    });
  }

  async createSlot(dto: CreateSlotDto) {
    if (!dto.isDiagnostic && !dto.formatId)
      throw new BadRequestException('Для занятия нужен формат');
    const format = dto.formatId ? await this.ensureFormat(dto.formatId) : null;
    if (dto.trainerId) await this.ensureTrainer(dto.trainerId);

    const startsAt = new Date(dto.startsAt);
    const durationMin =
      dto.durationMin ?? (dto.isDiagnostic ? 30 : (format?.durationMin ?? 60));
    await this.ensureTrainerFree(dto.trainerId ?? null, startsAt, durationMin);

    return this.prisma.slot.create({
      data: {
        formatId: dto.isDiagnostic ? null : dto.formatId,
        trainerId: dto.trainerId ?? null,
        startsAt,
        durationMin,
        capacity: dto.capacity ?? 7,
        isDiagnostic: dto.isDiagnostic ?? false,
      },
    });
  }

  async createWeekdaySlots(dto: CreateWeekdaySlotsDto) {
    if (!dto.isDiagnostic && !dto.formatId)
      throw new BadRequestException('Для занятия нужен формат');
    const format = dto.formatId ? await this.ensureFormat(dto.formatId) : null;
    if (dto.trainerId) await this.ensureTrainer(dto.trainerId);
    const durationMin =
      dto.durationMin ?? (dto.isDiagnostic ? 30 : (format?.durationMin ?? 60));
    const [h, m] = dto.time.split(':').map(Number);
    const start = dto.fromDate ? new Date(dto.fromDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const data: {
      formatId: number | null;
      trainerId: number | null;
      startsAt: Date;
      durationMin: number;
      capacity: number;
      isDiagnostic: boolean;
    }[] = [];
    for (let i = 0; i < dto.weeks * 7; i++) {
      const d = new Date(start.getTime() + i * MS_DAY);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      d.setHours(h, m, 0, 0);
      if (d.getTime() < Date.now()) continue;
      data.push({
        formatId: dto.isDiagnostic ? null : (dto.formatId as number),
        trainerId: dto.trainerId ?? null,
        startsAt: new Date(d),
        durationMin,
        capacity: dto.capacity ?? 7,
        isDiagnostic: dto.isDiagnostic ?? false,
      });
    }
    if (!data.length) return { created: 0 };

    let skipped = 0;
    const free: typeof data = [];
    for (const item of data) {
      const busy = await this.trainerBusy(
        item.trainerId,
        item.startsAt,
        item.durationMin,
      );
      if (busy) skipped += 1;
      else free.push(item);
    }
    if (!free.length)
      throw new ConflictException(
        'У этого тренера уже занято время во все выбранные дни',
      );

    await this.prisma.slot.createMany({ data: free });
    return { created: free.length, skipped };
  }

  async updateSlot(id: number, dto: UpdateSlotDto) {
    const slot = await this.getSlot(id);
    if (dto.trainerId) await this.ensureTrainer(dto.trainerId);

    const startsAt = new Date(dto.startsAt);
    const trainerId =
      dto.trainerId !== undefined ? dto.trainerId : slot.trainerId;
    await this.ensureTrainerFree(trainerId, startsAt, slot.durationMin, id);

    return this.prisma.slot.update({
      where: { id },
      data: {
        startsAt,
        ...(dto.trainerId !== undefined ? { trainerId: dto.trainerId } : {}),
      },
    });
  }

  async removeSlot(id: number) {
    await this.getSlot(id);
    await this.prisma.slot.delete({ where: { id } });
    return { ok: true };
  }

  async bookSingle(dto: SingleBookingDto) {
    const promo = dto.promoCode
      ? await this.promo.validate(dto.promoCode)
      : null;
    if (dto.promoCode && !promo)
      throw new BadRequestException(
        'Промокод недействителен или уже использован',
      );

    const result = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.slot.findUnique({
        where: { id: dto.slotId },
        include: { format: true, _count: { select: { bookings: true } } },
      });
      if (!slot) throw new NotFoundException('Слот не найден');
      if (slot.startsAt.getTime() < Date.now())
        throw new BadRequestException('Слот уже прошёл');
      if (slot._count.bookings >= slot.capacity)
        throw new ConflictException('Свободных мест нет');

      const base = slot.isDiagnostic ? 0 : (slot.format?.pricePerSession ?? 0);
      const free = slot.isDiagnostic || !!promo;
      const price = free ? 0 : base;

      if (promo) {
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { isUsed: true, usedAt: new Date() },
        });
      }

      const booking = await tx.booking.create({
        data: {
          slotId: slot.id,
          formatId: slot.formatId,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          isDiagnostic: slot.isDiagnostic,
          price,
          isFree: free,
          promoCodeId: promo?.id,
        },
        include: { slot: true },
      });
      return { booking, free, price };
    });

    return this.payment(result.booking.id, result.free, result.price);
  }

  async bookCart(dto: CartBookingDto) {
    const ids = [...new Set(dto.slotIds)];
    const settings = await this.prisma.siteSettings.findUnique({
      where: { id: 1 },
    });
    const threshold = settings?.courseThreshold ?? 3;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const slots = await tx.slot.findMany({
        where: { id: { in: ids }, isDiagnostic: false },
        include: { format: true, _count: { select: { bookings: true } } },
      });
      if (slots.length !== ids.length)
        throw new NotFoundException('Некоторые занятия не найдены');

      for (const s of slots) {
        if (s.startsAt.getTime() < Date.now())
          throw new BadRequestException('Одно из занятий уже прошло');
        if (s._count.bookings >= s.capacity)
          throw new ConflictException(
            `На занятие ${s.startsAt.toLocaleString('ru-RU')} нет мест`,
          );
      }

      const inCourse = courseIds(slots, threshold);
      const isCourse = inCourse.size > 0;
      const courseGroupId = isCourse ? randomUUID() : null;

      let total = 0;
      for (const s of slots) {
        const fmt = s.format;
        const counted = inCourse.has(s.id);
        const price = counted
          ? Math.round((fmt?.priceCourse ?? 0) / threshold)
          : (fmt?.pricePerSession ?? 0);
        total += price;
        await tx.booking.create({
          data: {
            slotId: s.id,
            formatId: s.formatId,
            name: dto.name,
            phone: dto.phone,
            email: dto.email,
            isCourse: counted,
            courseGroupId: counted ? courseGroupId : null,
            price,
          },
        });
      }
      return { isCourse, total, courseGroupId };
    });

    let giftCode: string | null = null;
    if (outcome.isCourse) {
      const gift = await this.promo.createGift({
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
      });
      giftCode = gift.code;
      await this.mail.sendGiftCode(dto.email, gift.code);
    }

    return {
      isCourse: outcome.isCourse,
      total: outcome.total,
      giftCode,
      payment: {
        status: 'mock',
        redirectUrl: `/payment/mock?total=${outcome.total}`,
      },
    };
  }

  async bookAnnouncement(dto: AnnouncementBookingDto) {
    const promo = dto.promoCode
      ? await this.promo.validate(dto.promoCode)
      : null;
    if (dto.promoCode && !promo)
      throw new BadRequestException(
        'Промокод недействителен или уже использован',
      );

    const result = await this.prisma.$transaction(async (tx) => {
      const a = await tx.announcement.findUnique({
        where: { id: dto.announcementId },
        include: { _count: { select: { bookings: true } } },
      });
      if (!a) throw new NotFoundException('Анонс не найден');
      if (a._count.bookings >= a.capacity)
        throw new ConflictException('Мест нет');

      const free = a.isFree || !!promo;
      const price = free ? 0 : a.price;
      if (promo)
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { isUsed: true, usedAt: new Date() },
        });

      const booking = await tx.booking.create({
        data: {
          announcementId: a.id,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          price,
          isFree: free,
          promoCodeId: promo?.id,
        },
      });
      return { booking, free, price };
    });

    return this.payment(result.booking.id, result.free, result.price);
  }

  listBookings() {
    return this.prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        slot: true,
        format: true,
        announcement: true,
        promoCode: true,
      },
    });
  }

  private payment(bookingId: number, free: boolean, total: number) {
    return {
      bookingId,
      free,
      total,
      payment: free
        ? { status: 'free', redirectUrl: null }
        : {
            status: 'mock',
            redirectUrl: `/payment/mock?bookingId=${bookingId}`,
          },
    };
  }

  private async ensureFormat(id: number) {
    const f = await this.prisma.format.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Формат не найден');
    return f;
  }

  private async ensureTrainer(id: number) {
    const t = await this.prisma.trainer.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Тренер не найден');
    return t;
  }

  private async trainerBusy(
    trainerId: number | null,
    startsAt: Date,
    durationMin: number,
    exceptSlotId?: number,
  ) {
    if (!trainerId) return null;
    const endsAt = new Date(startsAt.getTime() + durationMin * 60000);
    const dayStart = new Date(startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + MS_DAY);

    const sameDay = await this.prisma.slot.findMany({
      where: {
        trainerId,
        startsAt: { gte: dayStart, lt: dayEnd },
        ...(exceptSlotId ? { id: { not: exceptSlotId } } : {}),
      },
    });

    return (
      sameDay.find((s) => {
        const sEnd = new Date(s.startsAt.getTime() + s.durationMin * 60000);
        return s.startsAt < endsAt && startsAt < sEnd;
      }) ?? null
    );
  }

  private async ensureTrainerFree(
    trainerId: number | null,
    startsAt: Date,
    durationMin: number,
    exceptSlotId?: number,
  ) {
    const busy = await this.trainerBusy(
      trainerId,
      startsAt,
      durationMin,
      exceptSlotId,
    );
    if (busy) {
      const time = busy.startsAt.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      throw new ConflictException(
        `У этого тренера уже есть занятие в это время (${time}, ${busy.durationMin} мин)`,
      );
    }
  }

  @Cron('10 0 * * *')
  async cleanupPastSlots() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const res = await this.prisma.slot.deleteMany({
      where: { startsAt: { lt: startOfToday } },
    });
    if (res.count)
      new Logger('Booking').log(`Удалено прошедших занятий: ${res.count}`);
  }

  private async getSlot(id: number) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Слот не найден');
    return s;
  }
}
