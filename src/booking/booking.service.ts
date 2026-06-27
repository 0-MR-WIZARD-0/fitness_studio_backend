import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PromoService } from '../promo/promo.service';
import { MailService } from '../mail/mail.service';
import {
  AnnouncementBookingDto,
  CartBookingDto,
  CreateSlotDto,
  CreateWeekdaySlotsDto,
  SingleBookingDto,
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
        bookings: true,
        _count: { select: { bookings: true } },
      },
    });
  }

  async createSlot(dto: CreateSlotDto) {
    if (!dto.isDiagnostic && !dto.formatId)
      throw new BadRequestException('Для занятия нужен формат');
    if (dto.formatId) await this.ensureFormat(dto.formatId);
    return this.prisma.slot.create({
      data: {
        formatId: dto.isDiagnostic ? null : dto.formatId,
        startsAt: new Date(dto.startsAt),
        durationMin: dto.durationMin ?? 30,
        capacity: dto.capacity ?? 7,
        isDiagnostic: dto.isDiagnostic ?? false,
      },
    });
  }

  async createWeekdaySlots(dto: CreateWeekdaySlotsDto) {
    if (!dto.isDiagnostic && !dto.formatId)
      throw new BadRequestException('Для занятия нужен формат');
    if (dto.formatId) await this.ensureFormat(dto.formatId);
    const [h, m] = dto.time.split(':').map(Number);
    const start = dto.fromDate ? new Date(dto.fromDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const data: {
      formatId: number | null;
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
        startsAt: new Date(d),
        durationMin: dto.durationMin ?? 30,
        capacity: dto.capacity ?? 7,
        isDiagnostic: dto.isDiagnostic ?? false,
      });
    }
    if (!data.length) return { created: 0 };
    await this.prisma.slot.createMany({ data });
    return { created: data.length };
  }

  async updateSlot(id: number, startsAt: string) {
    await this.getSlot(id);
    return this.prisma.slot.update({
      where: { id },
      data: { startsAt: new Date(startsAt) },
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

      const times = slots.map((s) => s.startsAt.getTime());
      const span = Math.max(...times) - Math.min(...times);
      const isCourse = slots.length >= threshold && span <= 6 * MS_DAY;

      if (slots.length >= threshold && span > 6 * MS_DAY)
        throw new BadRequestException(
          'Для курса все занятия должны уместиться в 7 дней',
        );

      const courseGroupId = isCourse ? randomUUID() : null;
      let total = 0;
      for (const s of slots) {
        const fmt = s.format;
        const price = isCourse
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
            isCourse,
            courseGroupId,
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

  private async getSlot(id: number) {
    const s = await this.prisma.slot.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Слот не найден');
    return s;
  }
}
