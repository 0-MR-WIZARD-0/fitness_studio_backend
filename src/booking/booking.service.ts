import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PromoService } from '../promo/promo.service';
import { courseGroups } from './course';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { RentService } from '../rent/rent.module';
import { DocumentsService } from '../documents/documents.module';
import { PaymentsService } from '../payments/payments.module';
import type { SessionAdmin } from '../auth/auth.service';
import { assertOwnItem } from '../auth/guards';
import {
  AnnouncementBookingDto,
  CartBookingDto,
  CreateSlotDto,
  CreateWeekdaySlotsDto,
  RemoveSlotDto,
  SingleBookingDto,
  UpdateSlotDto,
} from './dto';

const MS_DAY = 86400000;

type BookingTarget = { slotId: number } | { announcementId: number };
type Client = {
  id: number | null;
  name: string;
  phone: string;
  email: string | null;
};
const ACTIVE_BOOKINGS = { status: { not: 'CANCELLED' as const } };

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PromoService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly rent: RentService,
    private readonly documents: DocumentsService,
    private readonly payments: PaymentsService,
  ) {}

  private async client(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Войдите в личный кабинет');
    return user;
  }

  private guest(dto: { name?: string; phone?: string }) {
    const name = dto.name?.trim();
    const phone = dto.phone?.trim();
    if (!name) throw new BadRequestException('Укажите ФИО');
    if (!phone) throw new BadRequestException('Укажите телефон');
    return { id: null as number | null, name, phone, email: null };
  }

  private samePerson(
    client: Client,
    row: {
      userId: number | null;
      name: string;
      phone: string;
      email: string | null;
    },
  ) {
    const text = (value?: string | null) =>
      (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const digits = (value?: string | null) =>
      (value ?? '').replace(/\D/g, '').slice(-10);
    return (
      (client.id !== null && row.userId === client.id) ||
      (!!digits(client.phone) && digits(row.phone) === digits(client.phone)) ||
      (!!text(client.email) && text(row.email) === text(client.email)) ||
      (!!text(client.name) && text(row.name) === text(client.name))
    );
  }

  private async ensureNotBooked(
    tx: Prisma.TransactionClient,
    where: BookingTarget,
    client: Client,
    what: string,
  ) {
    const existing = await tx.booking.findMany({
      where: { ...where, ...ACTIVE_BOOKINGS },
      select: { userId: true, name: true, phone: true, email: true },
    });
    if (existing.some((b) => this.samePerson(client, b)))
      throw new ConflictException(`Вы уже записаны на ${what}`);
  }

  private async resumeUnpaid(where: BookingTarget, client: Client) {
    const waiting = await this.prisma.booking.findMany({
      where: { ...where, ...ACTIVE_BOOKINGS, price: { gt: 0 } },
      select: {
        id: true,
        status: true,
        price: true,
        paymentId: true,
        userId: true,
        name: true,
        phone: true,
        email: true,
      },
    });
    for (const row of waiting) {
      if (row.status !== 'PENDING' || !row.paymentId) continue;
      if (!this.samePerson(client, row)) continue;
      const resumed = await this.payments.resume(row.id);
      if (resumed.state === 'pending' && resumed.url)
        return { bookingId: row.id, url: resumed.url, price: row.price };
    }
    return null;
  }

  async availableSlots(formatId?: number) {
    return this.mapAvailable({
      isDiagnostic: false,
      ...(formatId ? { formatId } : {}),
    });
  }

  async diagnosticSlots() {
    return this.mapAvailable({ isDiagnostic: true });
  }

  private async prices() {
    const s = await this.prisma.siteSettings.findUnique({ where: { id: 1 } });
    return {
      single: s?.pricePerSession ?? 5000,
      threshold: Math.max(1, s?.courseThreshold ?? 3),
    };
  }

  private async mapAvailable(where: Record<string, unknown>) {
    const { single } = await this.prices();
    const slots = await this.prisma.slot.findMany({
      where: { startsAt: { gte: new Date() }, ...where },
      orderBy: { startsAt: 'asc' },
      include: {
        format: true,
        trainer: true,
        hall: true,
        _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
      },
    });
    return slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      durationMin: s.durationMin,
      capacity: s.capacity,
      formatId: s.formatId,
      isDiagnostic: s.isDiagnostic,
      formatName: s.format?.name ?? null,
      trainerId: s.trainerId,
      trainerName: s.trainer?.name ?? null,
      hallId: s.hallId,
      hallName: s.hall?.title ?? null,
      pricePerSession: s.isDiagnostic ? 0 : single,
      taken: s._count.bookings,
      remaining: Math.max(0, s.capacity - s._count.bookings),
    }));
  }

  allSlots() {
    return this.prisma.slot.findMany({
      orderBy: { startsAt: 'asc' },
      include: {
        format: true,
        trainer: true,
        hall: true,
        bookings: { where: ACTIVE_BOOKINGS },
        _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
      },
    });
  }

  async createSlot(dto: CreateSlotDto, admin: SessionAdmin) {
    if (!dto.isDiagnostic && !dto.formatId)
      throw new BadRequestException('Для занятия нужен формат');
    const format = dto.formatId ? await this.ensureFormat(dto.formatId) : null;
    if (dto.trainerId) await this.ensureTrainer(dto.trainerId);
    const hall = await this.ensureHall(dto.hallId);

    const startsAt = new Date(dto.startsAt);
    const durationMin =
      dto.durationMin ?? (dto.isDiagnostic ? 30 : (format?.durationMin ?? 60));
    await this.ensureNotRented(startsAt, durationMin, hall.id);
    await this.ensureTrainerFree(dto.trainerId ?? null, startsAt, durationMin);

    const slot = await this.prisma.slot.create({
      data: {
        formatId: dto.isDiagnostic ? null : dto.formatId,
        trainerId: dto.trainerId ?? null,
        hallId: hall.id,
        createdById: admin.id,
        startsAt,
        durationMin,
        capacity: dto.capacity ?? 7,
        isDiagnostic: dto.isDiagnostic ?? false,
      },
    });
    await this.rent.syncDay(startsAt);
    return slot;
  }

  async createWeekdaySlots(dto: CreateWeekdaySlotsDto, admin: SessionAdmin) {
    if (!dto.isDiagnostic && !dto.formatId)
      throw new BadRequestException('Для занятия нужен формат');
    const format = dto.formatId ? await this.ensureFormat(dto.formatId) : null;
    if (dto.trainerId) await this.ensureTrainer(dto.trainerId);
    const hall = await this.ensureHall(dto.hallId);
    const durationMin =
      dto.durationMin ?? (dto.isDiagnostic ? 30 : (format?.durationMin ?? 60));
    const [h, m] = dto.time.split(':').map(Number);
    const start = dto.fromDate ? new Date(dto.fromDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const data: {
      formatId: number | null;
      trainerId: number | null;
      hallId: number;
      createdById: number;
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
        hallId: hall.id,
        createdById: admin.id,
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
      const endsAt = new Date(
        item.startsAt.getTime() + item.durationMin * 60000,
      );
      const rented = await this.rent.findBlockingRental(
        item.startsAt,
        endsAt,
        undefined,
        item.hallId,
      );
      const busy = await this.trainerBusy(
        item.trainerId,
        item.startsAt,
        item.durationMin,
      );
      if (busy || rented) skipped += 1;
      else free.push(item);
    }
    if (!free.length)
      throw new ConflictException(
        'Во все выбранные дни это время занято — тренером или арендой студии',
      );

    await this.prisma.slot.createMany({ data: free });
    for (const day of new Set(free.map((i) => i.startsAt.toDateString())))
      await this.rent.syncDay(new Date(day));
    return { created: free.length, skipped };
  }

  async updateSlot(id: number, dto: UpdateSlotDto, admin: SessionAdmin) {
    const slot = await this.getSlot(id);
    assertOwnItem(admin, slot, 'занятия');
    if (dto.trainerId) await this.ensureTrainer(dto.trainerId);

    const startsAt = new Date(dto.startsAt);
    const isReschedule = startsAt.getTime() !== slot.startsAt.getTime();

    if (isReschedule) {
      if (!dto.notified)
        throw new BadRequestException(
          'Подтвердите, что клиенты уведомлены о переносе',
        );
      if (!(await this.auth.checkPassword(admin.id, dto.password ?? '')))
        throw new UnauthorizedException('Неверный пароль');
    }

    const trainerId =
      dto.trainerId !== undefined ? dto.trainerId : slot.trainerId;
    await this.ensureNotRented(startsAt, slot.durationMin, slot.hallId);
    await this.ensureTrainerFree(trainerId, startsAt, slot.durationMin, id);

    const updated = await this.prisma.slot.update({
      where: { id },
      data: {
        startsAt,
        ...(dto.trainerId !== undefined ? { trainerId: dto.trainerId } : {}),
      },
    });

    if (isReschedule) {
      await this.rent.syncDay(slot.startsAt);
      await this.rent.syncDay(startsAt);
    }
    return updated;
  }

  async removeSlot(id: number, dto: RemoveSlotDto, admin: SessionAdmin) {
    const slot = await this.prisma.slot.findUnique({
      where: { id },
      include: {
        _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
      },
    });
    if (!slot) throw new NotFoundException('Слот не найден');
    assertOwnItem(admin, slot, 'занятия');

    if (slot._count.bookings > 0) {
      if (!dto.notified)
        throw new BadRequestException(
          'Подтвердите, что клиенты уведомлены об отмене занятия',
        );
      if (!(await this.auth.checkPassword(admin.id, dto.password ?? '')))
        throw new UnauthorizedException('Неверный пароль');

      const paid = await this.prisma.booking.findMany({
        where: { slotId: id, ...ACTIVE_BOOKINGS },
        select: { id: true },
      });
      await this.prisma.booking.updateMany({
        where: { slotId: id },
        data: { status: 'CANCELLED' },
      });
      for (const b of paid) await this.payments.refund(b.id);
    }

    await this.prisma.slot.delete({ where: { id } });
    await this.rent.syncDay(slot.startsAt);
    return { ok: true, cancelled: slot._count.bookings };
  }

  async bookSingle(dto: SingleBookingDto, userId: number | null) {
    const user = userId ? await this.client(userId) : null;
    await this.documents.ensureAccepted(dto.documentIds);
    if (dto.promoCode && !user)
      throw new UnauthorizedException(
        'Промокод работает в личном кабинете — войдите',
      );
    const { single } = await this.prices();
    const waiting = this.known(user, dto);
    if (waiting) {
      const hit = await this.resumeUnpaid({ slotId: dto.slotId }, waiting);
      if (hit) return this.resumedPayment(hit);
    }
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
        include: {
          format: true,
          _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
        },
      });
      if (!slot) throw new NotFoundException('Слот не найден');
      if (!user && !slot.isDiagnostic)
        throw new UnauthorizedException(
          'Записаться на занятие можно из личного кабинета — войдите',
        );
      if (slot.startsAt.getTime() < Date.now())
        throw new BadRequestException('Слот уже прошёл');
      if (slot._count.bookings >= slot.capacity)
        throw new ConflictException('Свободных мест нет');

      const base = slot.isDiagnostic ? 0 : single;
      const free = slot.isDiagnostic || !!promo;
      const price = free ? 0 : base;

      if (promo) {
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { isUsed: true, usedAt: new Date() },
        });
      }

      const client = user ?? this.guest(dto);
      await this.ensureNotBooked(
        tx,
        { slotId: slot.id },
        client,
        slot.isDiagnostic ? 'эту диагностику' : 'это занятие',
      );
      const booking = await tx.booking.create({
        data: {
          userId: client.id,
          slotId: slot.id,
          formatId: slot.formatId,
          name: client.name,
          phone: client.phone,
          email: client.email,
          isDiagnostic: slot.isDiagnostic,
          price,
          isFree: free,
          promoCodeId: promo?.id,
        },
        include: { slot: { include: { format: true } } },
      });
      return { booking, free, price };
    });

    const slot = result.booking.slot;
    return this.payment(
      result.booking,
      result.free,
      result.price,
      slot?.isDiagnostic ? 'Диагностика' : (slot?.format?.name ?? 'Занятие'),
    );
  }

  async bookCart(dto: CartBookingDto, userId: number) {
    const user = await this.client(userId);
    await this.documents.ensureAccepted(dto.documentIds);
    const ids = [...new Set(dto.slotIds)];
    for (const slotId of ids) {
      const hit = await this.resumeUnpaid({ slotId }, user);
      if (hit)
        return {
          isCourse: false,
          courses: 0,
          total: hit.price,
          giftCodes: [],
          payment: { status: 'tinkoff', redirectUrl: hit.url },
        };
    }
    const { single, threshold } = await this.prices();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const slots = await tx.slot.findMany({
        where: { id: { in: ids }, isDiagnostic: false },
        include: {
          format: true,
          _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
        },
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
        await this.ensureNotBooked(
          tx,
          { slotId: s.id },
          user,
          `занятие ${s.startsAt.toLocaleString('ru-RU')}`,
        );
      }

      const { groups, countedIds } = courseGroups(slots, threshold);
      const groupIdBySlot = new Map<number, string>();
      for (const group of groups) {
        const groupId = randomUUID();
        for (const s of group) groupIdBySlot.set(s.id, groupId);
      }

      let total = 0;
      const bookingIds: number[] = [];
      for (const s of slots) {
        const price = single;
        total += price;
        const created = await tx.booking.create({
          data: {
            userId: user.id,
            slotId: s.id,
            formatId: s.formatId,
            name: user.name,
            phone: user.phone,
            email: user.email,
            isCourse: countedIds.has(s.id),
            courseGroupId: groupIdBySlot.get(s.id) ?? null,
            price,
          },
        });
        bookingIds.push(created.id);
      }
      return {
        courses: groups.length,
        groupIds: [...new Set(groupIdBySlot.values())],
        total,
        bookingIds,
      };
    });

    const giftCodes: string[] = [];
    for (const groupId of outcome.groupIds) {
      const gift = await this.promo.createGift({
        userId: user.id,
        courseGroupId: groupId,
        name: user.name,
        phone: user.phone,
        email: user.email,
      });
      giftCodes.push(gift.code);
      await this.mail.sendGiftCode(user.email, gift.code);
      await this.prisma.courseFreeze.create({
        data: {
          userId: user.id,
          courseGroupId: groupId,
          expiresAt: new Date(Date.now() + 30 * MS_DAY),
        },
      });
    }

    const [first, ...rest] = outcome.bookingIds;
    const paid = await this.payment(
      { id: first, name: user.name, phone: user.phone, email: user.email },
      outcome.total <= 0,
      outcome.total,
      `Занятия в студии, ${outcome.bookingIds.length} шт.`,
      rest,
    );

    return {
      isCourse: outcome.courses > 0,
      courses: outcome.courses,
      total: outcome.total,
      giftCodes,
      payment: paid.payment,
    };
  }

  async bookAnnouncement(dto: AnnouncementBookingDto, userId: number | null) {
    const user = userId ? await this.client(userId) : null;
    await this.documents.ensureAccepted(dto.documentIds);
    if (dto.promoCode && !user)
      throw new UnauthorizedException(
        'Промокод работает в личном кабинете — войдите',
      );
    const waiting = this.known(user, dto);
    if (waiting) {
      const hit = await this.resumeUnpaid(
        { announcementId: dto.announcementId },
        waiting,
      );
      if (hit) return this.resumedPayment(hit);
    }
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
        include: {
          _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
        },
      });
      if (!a) throw new NotFoundException('Анонс не найден');
      if (!user && !a.isFree)
        throw new UnauthorizedException(
          'Записаться на платный анонс можно из личного кабинета — войдите',
        );
      if (a._count.bookings >= a.capacity)
        throw new ConflictException('Мест нет');

      const free = a.isFree || !!promo;
      const price = free ? 0 : a.price;
      if (promo)
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { isUsed: true, usedAt: new Date() },
        });

      const client = user ?? this.guest(dto);
      await this.ensureNotBooked(
        tx,
        { announcementId: a.id },
        client,
        'данное занятие',
      );
      const booking = await tx.booking.create({
        data: {
          userId: client.id,
          announcementId: a.id,
          name: client.name,
          phone: client.phone,
          email: client.email,
          price,
          isFree: free,
          promoCodeId: promo?.id,
        },
      });
      return { booking, free, price, title: a.title };
    });

    return this.payment(
      result.booking,
      result.free,
      result.price,
      result.title,
    );
  }

  async moveClientBooking(
    bookingId: number,
    slotId: number,
    admin: SessionAdmin,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { slot: true },
    });
    if (!booking) throw new NotFoundException('Запись не найдена');
    if (!booking.slotId || !booking.slot)
      throw new BadRequestException('Эту запись перенести нельзя');
    assertOwnItem(admin, booking.slot, 'занятия');

    const target = await this.prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
      },
    });
    if (!target) throw new NotFoundException('Занятие не найдено');
    assertOwnItem(admin, target, 'занятия');
    if (target._count.bookings >= target.capacity)
      throw new ConflictException('На это занятие мест нет');
    if (target.id !== booking.slotId)
      await this.ensureNotBooked(
        this.prisma,
        { slotId: target.id },
        {
          id: booking.userId,
          name: booking.name,
          phone: booking.phone,
          email: booking.email,
        },
        'это занятие',
      );

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { slotId: target.id, status: 'PENDING' },
    });
  }

  listBookings() {
    return this.prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        slot: true,
        format: true,
        announcement: true,
        rentalSlot: { include: { service: { select: { title: true } } } },
        service: true,
        promoCode: true,
        user: { select: { id: true, email: true } },
      },
    });
  }

  // кто записывается: вошедший клиент или гость, если он назвался
  private known(user: Client | null, dto: { name?: string; phone?: string }) {
    if (user) return user;
    return dto.name?.trim() && dto.phone?.trim() ? this.guest(dto) : null;
  }

  private resumedPayment(hit: {
    bookingId: number;
    url: string;
    price: number;
  }) {
    return {
      bookingId: hit.bookingId,
      free: false,
      total: hit.price,
      payment: { status: 'tinkoff', redirectUrl: hit.url },
    };
  }

  private async payment(
    booking: {
      id: number;
      name: string;
      phone: string;
      email: string | null;
    },
    free: boolean,
    total: number,
    title: string,
    alsoBookings: number[] = [],
  ) {
    if (free || total <= 0)
      return {
        bookingId: booking.id,
        free: true,
        total: 0,
        payment: { status: 'free', redirectUrl: null },
      };
    const payment = await this.payments.start(
      { ...booking, price: total, title },
      alsoBookings,
    );
    return { bookingId: booking.id, free: false, total, payment };
  }

  private async ensureFormat(id: number) {
    const f = await this.prisma.format.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Формат не найден');
    return f;
  }

  private async ensureHall(hallId?: number | null) {
    if (!hallId) {
      const halls = await this.prisma.hall.count({ where: { isActive: true } });
      throw new BadRequestException(
        halls ? 'Выберите зал' : 'Сначала добавьте зал в разделе «Залы»',
      );
    }
    const hall = await this.prisma.hall.findUnique({ where: { id: hallId } });
    if (!hall || !hall.isActive) throw new NotFoundException('Зал не найден');
    return hall;
  }

  private async ensureTrainer(id: number) {
    const t = await this.prisma.trainer.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Тренер не найден');
    return t;
  }

  private async ensureNotRented(
    startsAt: Date,
    durationMin: number,
    hallId: number | null = null,
  ) {
    const endsAt = new Date(startsAt.getTime() + durationMin * 60000);
    const rental = await this.rent.findBlockingRental(
      startsAt,
      endsAt,
      undefined,
      hallId,
    );
    if (rental) {
      const when = rental.startsAt.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      throw new ConflictException(
        `На это время студия сдана в аренду (${when}) — занятие поставить нельзя`,
      );
    }
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
