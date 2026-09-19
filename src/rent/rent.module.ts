import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';
import {
  AccountModule,
  UserGuard,
  currentUserId,
} from '../account/account.module';
import {
  DocumentsModule,
  DocumentsService,
} from '../documents/documents.module';
import { IdPipe } from '../common/id.pipe';

class UpsertRentalSlotDto {
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() serviceId?: number | null;
  @IsOptional() @IsInt() hallId?: number | null;
}

class UpsertPhotoDto {
  @IsString() url: string;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsInt() order?: number;
}

class BookRentalDto {
  @IsInt() rentalSlotId: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) documentIds?: number[];
}

class SyncRentDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsInt() @Min(1) days?: number;
}

const ACTIVE_BOOKINGS = { status: { not: 'CANCELLED' as const } };

const MS_MIN = 60000;
const MS_DAY = 86400000;
const SLOT_MIN = 60;
const GRID_MIN = 30;
const SYNC_DAYS = 60;

type Interval = { from: number; to: number };

function parseTime(value: string | undefined, fallback: number) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return fallback;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : fallback;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class RentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  private map(slot: {
    id: number;
    startsAt: Date;
    endsAt: Date;
    price: number;
    comment: string;
    isActive: boolean;
    isAuto: boolean;
    serviceId: number | null;
    service?: { title: string } | null;
    hallId: number | null;
    hall?: { title: string } | null;
    bookings?: { id: number }[];
  }) {
    return {
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      durationMin: Math.round(
        (slot.endsAt.getTime() - slot.startsAt.getTime()) / 60000,
      ),
      price: slot.price,
      comment: slot.comment,
      isActive: slot.isActive,
      isAuto: slot.isAuto,
      serviceId: slot.serviceId,
      serviceTitle: slot.service?.title ?? 'Аренда студии',
      hallId: slot.hallId,
      hallTitle: slot.hall?.title ?? null,
      isBooked: (slot.bookings?.length ?? 0) > 0,
    };
  }

  private async config() {
    const s = await this.prisma.siteSettings.findUnique({ where: { id: 1 } });
    return {
      startMin: parseTime(s?.rentDayStart, 9 * 60),
      endMin: parseTime(s?.rentDayEnd, 17 * 60 + 30),
      bufferMin: Math.max(0, s?.rentBufferMin ?? 30),
      price: Math.max(0, s?.rentPricePerHour ?? 3000),
    };
  }

  async listPublic() {
    const slots = await this.prisma.rentalSlot.findMany({
      where: { isActive: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: {
        service: { select: { title: true } },
        hall: { select: { title: true } },
        bookings: { where: ACTIVE_BOOKINGS, select: { id: true } },
      },
    });
    return slots.map((s) => this.map(s));
  }

  async listAll() {
    const slots = await this.prisma.rentalSlot.findMany({
      orderBy: { startsAt: 'asc' },
      include: {
        service: { select: { title: true } },
        hall: { select: { title: true } },
        bookings: {
          where: ACTIVE_BOOKINGS,
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });
    return slots.map((s) => ({
      ...this.map(s),
      bookings: s.bookings,
    }));
  }

  async findLessonOverlap(
    startsAt: Date,
    endsAt: Date,
    bufferMin?: number,
    hallId?: number | null,
  ) {
    const buffer = bufferMin ?? (await this.config()).bufferMin;
    const from = startsAt.getTime();
    const to = endsAt.getTime();
    const since = new Date(from - MS_DAY);
    const until = new Date(to + MS_DAY);

    const [lessons, announcements] = await Promise.all([
      this.prisma.slot.findMany({
        where: {
          startsAt: { gte: since, lte: until },
          ...(hallId ? { OR: [{ hallId: null }, { hallId }] } : {}),
        },
        include: { format: true },
      }),
      this.prisma.announcement.findMany({
        where: { isActive: true, startsAt: { gte: since, lte: until } },
      }),
    ]);

    const busy = [
      ...lessons.map((s) => ({
        startsAt: s.startsAt,
        durationMin: s.durationMin,
        name: s.format ? s.format.name : 'диагностика',
      })),
      ...announcements.map((a) => ({
        startsAt: a.startsAt,
        durationMin: a.durationMin,
        name: a.title,
      })),
    ];

    return (
      busy.find((s) => {
        const bStart = s.startsAt.getTime() - buffer * MS_MIN;
        const bEnd = s.startsAt.getTime() + (s.durationMin + buffer) * MS_MIN;
        return bStart < to && from < bEnd;
      }) ?? null
    );
  }

  private async bufferFor(hallId?: number | null) {
    if (hallId) {
      const hall = await this.prisma.hall.findUnique({ where: { id: hallId } });
      if (hall) return Math.max(0, hall.bufferMin);
    }
    return (await this.config()).bufferMin;
  }

  async findBlockingRental(
    startsAt: Date,
    endsAt: Date,
    exceptId?: number,
    hallId?: number | null,
  ) {
    const bufferMin = await this.bufferFor(hallId);
    const from = startsAt.getTime() - bufferMin * MS_MIN;
    const to = endsAt.getTime() + bufferMin * MS_MIN;

    const slots = await this.prisma.rentalSlot.findMany({
      where: {
        startsAt: { gte: new Date(from - MS_DAY), lte: new Date(to + MS_DAY) },
        ...(exceptId ? { id: { not: exceptId } } : {}),
        ...(hallId ? { OR: [{ hallId: null }, { hallId }] } : {}),
      },
      include: {
        hall: { select: { title: true } },
        bookings: { where: ACTIVE_BOOKINGS, select: { id: true } },
      },
    });

    return (
      slots.find(
        (s) =>
          (s.bookings.length > 0 || (!s.isAuto && s.isActive)) &&
          s.startsAt.getTime() < to &&
          from < s.endsAt.getTime(),
      ) ?? null
    );
  }

  private when(date: Date) {
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private async ensureFree(
    startsAt: Date,
    endsAt: Date,
    exceptId?: number,
    hallId?: number | null,
  ) {
    if (endsAt.getTime() <= startsAt.getTime())
      throw new BadRequestException('Время окончания должно быть позже начала');

    const bufferMin = await this.bufferFor(hallId);
    const lesson = await this.findLessonOverlap(
      startsAt,
      endsAt,
      bufferMin,
      hallId,
    );
    if (lesson)
      throw new ConflictException(
        `В это время стоит занятие (${this.when(lesson.startsAt)}, ${
          lesson.name
        }). Между занятием и арендой нужно ${bufferMin} мин`,
      );

    const rental = await this.findBlockingRental(
      startsAt,
      endsAt,
      exceptId,
      hallId,
    );
    if (rental)
      throw new ConflictException(
        `Аренда на это время уже есть (${this.when(rental.startsAt)}${
          rental.hall ? `, ${rental.hall.title}` : ''
        })`,
      );
  }

  async syncDay(day: Date) {
    const dayStart = startOfDay(day);
    if (dayStart.getTime() < startOfDay(new Date()).getTime())
      return { created: 0, removed: 0 };

    const halls = await this.prisma.hall.findMany({
      where: { isActive: true, autoSchedule: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    let created = 0;
    let removed = 0;
    for (const hall of halls) {
      const res = await this.syncHallDay(dayStart, hall);
      created += res.created;
      removed += res.removed;
    }
    return { created, removed };
  }

  private async syncHallDay(
    dayStart: Date,
    hall: {
      id: number;
      priceSingle: number;
      dayStart: string;
      dayEnd: string;
      bufferMin: number;
    } | null,
  ) {
    const hallId = hall?.id ?? null;
    const dayEnd = new Date(dayStart.getTime() + MS_DAY);
    const since = new Date(dayStart.getTime() - MS_DAY);
    const base = await this.config();
    const cfg = hall
      ? {
          startMin: parseTime(hall.dayStart, base.startMin),
          endMin: parseTime(hall.dayEnd, base.endMin),
          bufferMin: Math.max(0, hall.bufferMin),
          price: base.price,
        }
      : base;
    const price = hall?.priceSingle || base.price;

    const [lessons, announcements, rentals] = await Promise.all([
      this.prisma.slot.findMany({
        where: {
          startsAt: { gte: since, lt: dayEnd },
          ...(hallId ? { OR: [{ hallId: null }, { hallId }] } : {}),
        },
      }),
      this.prisma.announcement.findMany({
        where: { isActive: true, startsAt: { gte: since, lt: dayEnd } },
      }),
      this.prisma.rentalSlot.findMany({
        where: {
          startsAt: { gte: since, lt: dayEnd },
          ...(hallId ? { OR: [{ hallId: null }, { hallId }] } : {}),
        },
        include: { bookings: { where: ACTIVE_BOOKINGS, select: { id: true } } },
      }),
    ]);

    const lessonBusy: Interval[] = [...lessons, ...announcements].map((s) => ({
      from: s.startsAt.getTime() - cfg.bufferMin * MS_MIN,
      to: s.startsAt.getTime() + (s.durationMin + cfg.bufferMin) * MS_MIN,
    }));

    const todays = rentals.filter(
      (r) => r.startsAt.getTime() >= dayStart.getTime(),
    );
    const startsToday = (d: Date) => d.getTime() >= dayStart.getTime();

    if (
      ![...lessons, ...announcements].some((s) => startsToday(s.startsAt)) &&
      !todays.length
    )
      return { created: 0, removed: 0 };

    const rebuildable = todays.filter(
      (r) => r.isAuto && !r.bookings.length && r.hallId === hallId,
    );
    const fixed = rentals.filter((r) => !rebuildable.includes(r));
    const closed = rebuildable.filter(
      (r) =>
        !r.isActive &&
        !lessonBusy.some(
          (b) => b.from < r.endsAt.getTime() && r.startsAt.getTime() < b.to,
        ),
    );

    const busy: Interval[] = [
      ...lessonBusy,
      ...[...fixed, ...closed].map((r) => ({
        from: r.startsAt.getTime(),
        to: r.endsAt.getTime(),
      })),
    ];

    const windowStart = dayStart.getTime() + cfg.startMin * MS_MIN;
    const windowEnd = dayStart.getTime() + cfg.endMin * MS_MIN;
    const notBefore = Date.now() + 30 * MS_MIN;
    const align = (ms: number) =>
      windowStart +
      Math.ceil((ms - windowStart) / (GRID_MIN * MS_MIN)) * GRID_MIN * MS_MIN;

    const wanted: Interval[] = [];
    let cursor = align(Math.max(windowStart, notBefore));
    while (cursor + SLOT_MIN * MS_MIN <= windowEnd) {
      const to = cursor + SLOT_MIN * MS_MIN;
      const hit = busy.find((b) => b.from < to && cursor < b.to);
      if (hit) {
        cursor = align(hit.to);
        continue;
      }
      wanted.push({ from: cursor, to });
      cursor = to;
    }

    const keep = new Set<number>();
    const missing = wanted.filter((w) => {
      const same = rebuildable.find(
        (r) =>
          r.isActive &&
          r.startsAt.getTime() === w.from &&
          r.endsAt.getTime() === w.to,
      );
      if (same) keep.add(same.id);
      return !same;
    });
    const obsolete = rebuildable.filter(
      (r) => !keep.has(r.id) && !closed.includes(r),
    );

    if (obsolete.length)
      await this.prisma.rentalSlot.deleteMany({
        where: { id: { in: obsolete.map((r) => r.id) } },
      });
    if (missing.length)
      await this.prisma.rentalSlot.createMany({
        data: missing.map((w) => ({
          startsAt: new Date(w.from),
          endsAt: new Date(w.to),
          price,
          isAuto: true,
          hallId,
        })),
      });
    if (keep.size)
      await this.prisma.rentalSlot.updateMany({
        where: { id: { in: [...keep] }, price: { not: price } },
        data: { price },
      });

    return { created: missing.length, removed: obsolete.length };
  }

  async syncRange(from?: Date, days = SYNC_DAYS) {
    const start = startOfDay(from ?? new Date());
    let created = 0;
    let removed = 0;

    const auto = await this.prisma.hall.findMany({
      where: { isActive: true, autoSchedule: true },
      select: { id: true },
    });
    const stale = await this.prisma.rentalSlot.deleteMany({
      where: {
        isAuto: true,
        startsAt: { gte: start },
        bookings: { none: ACTIVE_BOOKINGS },
        OR: [{ hallId: null }, { hallId: { notIn: auto.map((h) => h.id) } }],
      },
    });
    removed += stale.count;
    for (let i = 0; i < days; i += 1) {
      const res = await this.syncDay(new Date(start.getTime() + i * MS_DAY));
      created += res.created;
      removed += res.removed;
    }
    return { created, removed };
  }

  async create(dto: UpsertRentalSlotDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    await this.ensureFree(startsAt, endsAt, undefined, dto.hallId ?? null);

    const slot = await this.prisma.rentalSlot.create({
      data: {
        startsAt,
        endsAt,
        price: dto.price ?? 0,
        comment: dto.comment ?? '',
        isActive: dto.isActive ?? true,
        isAuto: false,
        serviceId: dto.serviceId ?? null,
        hallId: dto.hallId ?? null,
      },
      include: {
        service: { select: { title: true } },
        hall: { select: { title: true } },
        bookings: { where: ACTIVE_BOOKINGS, select: { id: true } },
      },
    });
    await this.syncDay(startsAt);
    return this.map(slot);
  }

  async update(id: number, dto: UpsertRentalSlotDto) {
    const before = await this.ensure(id);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    await this.ensureFree(
      startsAt,
      endsAt,
      id,
      dto.hallId !== undefined ? dto.hallId : before.hallId,
    );

    const slot = await this.prisma.rentalSlot.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        price: dto.price,
        comment: dto.comment,
        isActive: dto.isActive,
        ...(dto.serviceId !== undefined
          ? { serviceId: dto.serviceId ?? null }
          : {}),
        ...(dto.hallId !== undefined ? { hallId: dto.hallId ?? null } : {}),
      },
      include: {
        service: { select: { title: true } },
        hall: { select: { title: true } },
        bookings: { where: ACTIVE_BOOKINGS, select: { id: true } },
      },
    });
    await this.syncDay(before.startsAt);
    if (
      startOfDay(startsAt).getTime() !== startOfDay(before.startsAt).getTime()
    )
      await this.syncDay(startsAt);
    return this.map(slot);
  }

  async remove(id: number) {
    const slot = await this.ensure(id);
    if (slot.isAuto) {
      await this.prisma.rentalSlot.update({
        where: { id },
        data: { isActive: false },
      });
      return { ok: true, closed: true };
    }
    await this.prisma.rentalSlot.delete({ where: { id } });
    await this.syncDay(slot.startsAt);
    return { ok: true, closed: false };
  }

  async book(dto: BookRentalDto, userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Войдите в личный кабинет');
    await this.documents.ensureAccepted(dto.documentIds);

    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.rentalSlot.findUnique({
        where: { id: dto.rentalSlotId },
        include: { bookings: { where: ACTIVE_BOOKINGS, select: { id: true } } },
      });
      if (!slot) throw new NotFoundException('Слот аренды не найден');
      if (!slot.isActive)
        throw new BadRequestException('Этот слот сейчас недоступен');
      if (slot.startsAt.getTime() < Date.now())
        throw new BadRequestException('Это время уже прошло');
      if (slot.bookings.length)
        throw new ConflictException('Студия на это время уже занята');

      const booking = await tx.booking.create({
        data: {
          userId: user.id,
          rentalSlotId: slot.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          price: slot.price,
          isFree: slot.price === 0,
        },
      });

      return {
        bookingId: booking.id,
        total: slot.price,
        payment:
          slot.price > 0
            ? {
                status: 'mock',
                redirectUrl: `/payment/mock?total=${slot.price}`,
              }
            : { status: 'free', redirectUrl: null },
      };
    });
  }

  photos() {
    return this.prisma.studioPhoto.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  addPhoto(dto: UpsertPhotoDto) {
    return this.prisma.studioPhoto.create({
      data: {
        url: dto.url,
        caption: dto.caption ?? '',
        order: dto.order ?? 0,
      },
    });
  }

  async updatePhoto(id: number, dto: UpsertPhotoDto) {
    return this.prisma.studioPhoto.update({
      where: { id },
      data: { url: dto.url, caption: dto.caption, order: dto.order },
    });
  }

  async removePhoto(id: number) {
    await this.prisma.studioPhoto.delete({ where: { id } });
    return { ok: true };
  }

  private async ensure(id: number) {
    const found = await this.prisma.rentalSlot.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Слот аренды не найден');
    return found;
  }

  @Cron('15 0 * * *')
  async cleanupPast() {
    const log = new Logger('Rent');
    const startOfToday = startOfDay(new Date());
    const res = await this.prisma.rentalSlot.deleteMany({
      where: { startsAt: { lt: startOfToday } },
    });
    if (res.count) log.log(`Удалено прошедших слотов аренды: ${res.count}`);

    const sync = await this.syncRange();
    if (sync.created || sync.removed)
      log.log(
        `Авто-слоты аренды: добавлено ${sync.created}, убрано ${sync.removed}`,
      );
  }
}

@Controller('rent')
class RentController {
  constructor(private readonly rent: RentService) {}

  @Get('slots')
  listPublic() {
    return this.rent.listPublic();
  }

  @UseGuards(UserGuard)
  @Post('book')
  book(@Body() dto: BookRentalDto, @Req() req: Request) {
    return this.rent.book(dto, currentUserId(req));
  }

  @Get('photos')
  photos() {
    return this.rent.photos();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('photos')
  addPhoto(@Body() dto: UpsertPhotoDto) {
    return this.rent.addPhoto(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('photos/:id')
  updatePhoto(@Param('id', IdPipe) id: number, @Body() dto: UpsertPhotoDto) {
    return this.rent.updatePhoto(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('photos/:id')
  removePhoto(@Param('id', IdPipe) id: number) {
    return this.rent.removePhoto(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/slots')
  listAll() {
    return this.rent.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('slots')
  create(@Body() dto: UpsertRentalSlotDto) {
    return this.rent.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('sync')
  sync(@Body() dto: SyncRentDto) {
    return this.rent.syncRange(
      dto.from ? new Date(dto.from) : undefined,
      dto.days,
    );
  }

  @UseGuards(AuthenticatedGuard)
  @Put('slots/:id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpsertRentalSlotDto) {
    return this.rent.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('slots/:id')
  remove(@Param('id', IdPipe) id: number) {
    return this.rent.remove(id);
  }
}

@Module({
  imports: [AccountModule, DocumentsModule],
  providers: [RentService],
  controllers: [RentController],
  exports: [RentService],
})
export class RentModule {}
