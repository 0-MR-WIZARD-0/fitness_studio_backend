/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Body,
  CanActivate,
  ConflictException,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import * as bcrypt from 'bcrypt';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit } from '../common/rate-limit.guard';
import { IdPipe } from '../common/id.pipe';

const CANCELLED = 'CANCELLED';
const ACTIVE_BOOKINGS = { status: { not: CANCELLED } } as const;

const PASSWORD_RE =
  /^(?=.*[a-zа-яё])(?=.*[A-ZА-ЯЁ])(?=.*\d)(?=.*[^A-Za-zА-Яа-яЁё0-9\s]).{8,}$/;

class RegisterDto {
  @IsEmail({}, { message: 'Укажите корректный email' }) email: string;
  @IsString()
  @MinLength(8, { message: 'Пароль не короче 8 символов' })
  @Matches(PASSWORD_RE, {
    message:
      'Пароль: 8+ символов, заглавная и строчная буквы, цифра и специальный символ',
  })
  password: string;
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
  @IsString() @IsNotEmpty({ message: 'Укажите телефон' }) phone: string;
}

class LoginDto {
  @IsEmail({}, { message: 'Укажите корректный email' }) email: string;
  @IsString() @IsNotEmpty({ message: 'Введите пароль' }) password: string;
}

class ProfileDto {
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
  @IsString() @IsNotEmpty({ message: 'Укажите телефон' }) phone: string;
}

class CancelCourseDto {
  @IsString() @IsNotEmpty({ message: 'Курс не указан' }) courseGroupId: string;
}

class MoveBookingDto {
  @IsOptional() @IsInt() slotId?: number;
  @IsOptional() @IsInt() rentalSlotId?: number;
}

@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.session?.userId) return true;
    throw new UnauthorizedException('Войдите в личный кабинет');
  }
}

export function optionalUserId(req: Request): number | null {
  return req.session?.userId ?? null;
}

export function currentUserId(req: Request): number {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException('Войдите в личный кабинет');
  return id;
}

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  private publicUser(user: {
    id: number;
    email: string;
    name: string;
    phone: string;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists)
      throw new ConflictException('Такой email уже зарегистрирован — войдите');

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        name: dto.name.trim(),
        phone: dto.phone.trim(),
      },
    });
    await this.prisma.booking.updateMany({
      where: { email, userId: null },
      data: { userId: user.id },
    });
    await this.prisma.promoCode.updateMany({
      where: { email, userId: null },
      data: { userId: user.id },
    });
    return this.publicUser(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Неверный email или пароль');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверный email или пароль');
    return this.publicUser(user);
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Войдите в личный кабинет');
    return this.publicUser(user);
  }

  async updateProfile(userId: number, dto: ProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name.trim(), phone: dto.phone.trim() },
    });
    return this.publicUser(user);
  }

  private async limits() {
    const s = await this.prisma.siteSettings.findUnique({ where: { id: 1 } });
    return {
      editHours: Math.max(0, s?.bookingEditHours ?? 4),
      courseHours: Math.max(0, s?.courseCancelHours ?? 12),
    };
  }

  private async editHours() {
    return (await this.limits()).editHours;
  }

  private freeFreeze(userId: number, courseGroupId: string) {
    return this.prisma.courseFreeze.findFirst({
      where: {
        userId,
        courseGroupId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { id: 'asc' },
    });
  }

  private async giftOf(userId: number, courseGroupId: string) {
    const promo = await this.prisma.promoCode.findFirst({
      where: { userId, courseGroupId },
    });
    if (!promo) return { promo: null, booking: null };
    const booking = await this.prisma.booking.findFirst({
      where: { promoCodeId: promo.id, status: { not: CANCELLED } },
      include: { slot: true },
    });
    return { promo, booking };
  }

  private async cancelWarning(booking: {
    courseGroupId: string | null;
    userId: number | null;
    promoCodeId: number | null;
  }) {
    if (!booking.courseGroupId || !booking.userId) return null;
    const { promo, booking: giftBooking } = await this.giftOf(
      booking.userId,
      booking.courseGroupId,
    );
    if (!promo) return 'Занятие входит в курс — курс перестанет быть полным.';
    if (giftBooking)
      return `Занятие входит в курс. Вместе с ним отменится занятие по подарочному промокоду ${promo.code}.`;
    return `Занятие входит в курс. Подарочный промокод ${promo.code} сгорит.`;
  }

  private startOf(booking: {
    slot: { startsAt: Date } | null;
    announcement: { startsAt: Date } | null;
    rentalSlot: { startsAt: Date } | null;
  }) {
    return (
      booking.slot?.startsAt ??
      booking.announcement?.startsAt ??
      booking.rentalSlot?.startsAt ??
      null
    );
  }

  async bookings(userId: number) {
    const items = await this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        slot: { include: { format: true, trainer: true } },
        format: true,
        announcement: { include: { trainer: true } },
        rentalSlot: { include: { service: { select: { title: true } } } },
        service: { select: { title: true, durationMin: true } },
        promoCode: { select: { code: true } },
      },
    });

    const { editHours: hours, courseHours } = await this.limits();
    const limit = Date.now() + hours * 3600000;
    const freezes = await this.prisma.courseFreeze.findMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    const frozenGroups = new Set(freezes.map((f) => f.courseGroupId));

    return Promise.all(
      items.map(async (b) => {
        const startsAt = this.startOf(b);
        const kind = b.serviceId
          ? 'SERVICE'
          : b.rentalSlotId
            ? 'RENT'
            : b.announcementId
              ? 'ANNOUNCEMENT'
              : b.isDiagnostic
                ? 'DIAGNOSTIC'
                : 'LESSON';
        const editable =
          b.status !== CANCELLED &&
          (kind === 'SERVICE' || (!!startsAt && startsAt.getTime() > limit));
        return {
          id: b.id,
          kind,
          title:
            b.service?.title ??
            (b.rentalSlot
              ? (b.rentalSlot.service?.title ?? 'Аренда студии')
              : (b.announcement?.title ??
                b.slot?.format?.name ??
                b.format?.name ??
                (b.isDiagnostic ? 'Диагностика' : 'Занятие'))),
          startsAt,
          endsAt: b.rentalSlot?.endsAt ?? null,
          durationMin:
            b.slot?.durationMin ??
            b.announcement?.durationMin ??
            (b.rentalSlot
              ? Math.round(
                  (b.rentalSlot.endsAt.getTime() -
                    b.rentalSlot.startsAt.getTime()) /
                    60000,
                )
              : null),
          trainerName:
            b.slot?.trainer?.name ?? b.announcement?.trainer?.name ?? null,
          formatId: b.slot?.formatId ?? b.formatId,
          slotId: b.slotId,
          rentalSlotId: b.rentalSlotId,
          price: b.price,
          isFree: b.isFree,
          isCourse: b.isCourse,
          status: b.status,
          promoCode: b.promoCode?.code ?? null,
        canMove: editable && kind === 'LESSON',
          canCancel: editable,
          canFreeze:
            editable &&
            kind === 'LESSON' &&
            !!b.courseGroupId &&
            frozenGroups.has(b.courseGroupId),
          courseGroupId: b.courseGroupId,
          cancelWarning: editable ? await this.cancelWarning(b) : null,
          editHours: hours,
          courseHours,
          createdAt: b.createdAt,
        };
      }),
    );
  }

  async courses(userId: number) {
    const { courseHours } = await this.limits();
    const bookings = await this.prisma.booking.findMany({
      where: {
        userId,
        courseGroupId: { not: null },
        status: { not: CANCELLED },
      },
      include: { slot: true, format: true },
      orderBy: { id: 'asc' },
    });

    const groups = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const key = b.courseGroupId as string;
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }

    const result = [];
    for (const [courseGroupId, list] of groups) {
      const starts = list
        .map((b) => b.slot?.startsAt)
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime());
      const firstAt = starts[0] ?? null;
      const { promo, booking: giftBooking } = await this.giftOf(
        userId,
        courseGroupId,
      );
      const freeze = await this.freeFreeze(userId, courseGroupId);
      result.push({
        courseGroupId,
        lessons: list.length,
        firstAt,
        total: list.reduce((sum, b) => sum + b.price, 0),
        canCancel:
          !!firstAt && firstAt.getTime() - Date.now() > courseHours * 3600000,
        courseHours,
        giftCode: promo && !promo.isUsed ? promo.code : null,
        giftUsedAt: giftBooking?.slot?.startsAt ?? null,
        freezeExpiresAt: freeze?.expiresAt ?? null,
      });
    }
    return result;
  }

  promos(userId: number) {
    return this.prisma.promoCode.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async own(userId: number, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: true,
        announcement: true,
        rentalSlot: true,
        service: true,
      },
    });
    if (!booking || booking.userId !== userId)
      throw new NotFoundException('Запись не найдена');
    if (booking.status === CANCELLED)
      throw new BadRequestException('Запись уже отменена');
    return booking;
  }

  private async ensureInTime(startsAt: Date | null) {
    const hours = await this.editHours();
    if (!startsAt) throw new BadRequestException('У записи нет времени');
    if (startsAt.getTime() - Date.now() < hours * 3600000)
      throw new BadRequestException(
        `Менять запись можно не позднее чем за ${hours} ч до начала — свяжитесь со студией`,
      );
  }

  async cancel(userId: number, bookingId: number) {
    const booking = await this.own(userId, bookingId);
    if (!booking.serviceId) await this.ensureInTime(this.startOf(booking));

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: CANCELLED },
    });

    let gift: string | null = null;
    if (booking.courseGroupId) {
      const { promo, booking: giftBooking } = await this.giftOf(
        userId,
        booking.courseGroupId,
      );
      if (promo) {
        if (giftBooking)
          await this.prisma.booking.update({
            where: { id: giftBooking.id },
            data: { status: CANCELLED },
          });
        await this.prisma.promoCode.delete({ where: { id: promo.id } });
        gift = promo.code;
      }
    }
    return { ok: true, burnedGift: gift };
  }

  async cancelCourse(userId: number, courseGroupId: string) {
    const { courseHours } = await this.limits();
    const bookings = await this.prisma.booking.findMany({
      where: { userId, courseGroupId, status: { not: CANCELLED } },
      include: { slot: true },
    });
    if (!bookings.length) throw new NotFoundException('Курс не найден');

    const starts = bookings
      .map((b) => b.slot?.startsAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());
    const firstAt = starts[0];
    if (!firstAt || firstAt.getTime() - Date.now() < courseHours * 3600000)
      throw new BadRequestException(
        `Отказаться от курса можно не позднее чем за ${courseHours} ч до первого занятия — свяжитесь со студией`,
      );

    const { promo, booking: giftBooking } = await this.giftOf(
      userId,
      courseGroupId,
    );
    if (giftBooking)
      await this.prisma.booking.update({
        where: { id: giftBooking.id },
        data: { status: CANCELLED },
      });
    if (promo) await this.prisma.promoCode.delete({ where: { id: promo.id } });

    await this.prisma.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) } },
      data: { status: CANCELLED },
    });
    await this.prisma.courseFreeze.deleteMany({
      where: { userId, courseGroupId, usedAt: null },
    });

    return {
      ok: true,
      cancelled: bookings.length + (giftBooking ? 1 : 0),
      burnedGift: promo?.code ?? null,
    };
  }

  async freeze(userId: number, bookingId: number) {
    const booking = await this.own(userId, bookingId);
    if (!booking.courseGroupId)
      throw new BadRequestException('Заморозка работает только для курса');
    await this.ensureInTime(this.startOf(booking));

    const freeze = await this.freeFreeze(userId, booking.courseGroupId);
    if (!freeze)
      throw new BadRequestException(
        'Свободной заморозки нет — она уже использована или истекла',
      );

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: CANCELLED },
    });
    await this.prisma.courseFreeze.update({
      where: { id: freeze.id },
      data: { usedAt: new Date(), bookingId },
    });
    return { ok: true };
  }

  async freezes(userId: number) {
    const items = await this.prisma.courseFreeze.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
    });
    return items.map((f) => ({
      id: f.id,
      courseGroupId: f.courseGroupId,
      expiresAt: f.expiresAt,
      usedAt: f.usedAt,
      isExpired: !f.usedAt && f.expiresAt.getTime() < Date.now(),
    }));
  }

  async move(userId: number, bookingId: number, dto: MoveBookingDto) {
    const booking = await this.own(userId, bookingId);
    await this.ensureInTime(this.startOf(booking));

    if (booking.rentalSlotId)
      throw new BadRequestException(
        'Бронь зала переносить нельзя — отмените её и выберите другое время',
      );

    if (!booking.slotId)
      throw new BadRequestException(
        'Эту запись перенести нельзя — обратитесь в студию',
      );
    if (!dto.slotId) throw new BadRequestException('Выберите новое занятие');

    const target = await this.prisma.slot.findUnique({
      where: { id: dto.slotId },
      include: {
        _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
      },
    });
    if (!target) throw new NotFoundException('Занятие не найдено');
    if (target.startsAt.getTime() < Date.now())
      throw new BadRequestException('Это занятие уже прошло');
    if (target._count.bookings >= target.capacity)
      throw new ConflictException('На это занятие мест нет');
    if (target.isDiagnostic !== booking.isDiagnostic)
      throw new BadRequestException(
        'Переносить можно только на занятие того же типа',
      );
    if (!booking.isDiagnostic && target.formatId !== booking.slot?.formatId)
      throw new BadRequestException(
        'Переносить можно только на занятие того же формата',
      );

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { slotId: target.id },
    });
  }
}

@Controller('account')
class AccountController {
  constructor(private readonly account: AccountService) {}

  @UseGuards(RateLimit(5, 60 * 60_000, 'Слишком много регистраций'))
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const user = await this.account.register(dto);
    req.session.userId = user.id;
    return { user };
  }

  @UseGuards(RateLimit(10, 5 * 60_000, 'Слишком много попыток входа'))
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const user = await this.account.login(dto);
    req.session.userId = user.id;
    return { user };
  }

  @Post('logout')
  logout(@Req() req: Request) {
    delete req.session.userId;
    return { ok: true };
  }

  @UseGuards(UserGuard)
  @Get('me')
  me(@Req() req: Request) {
    return this.account.me(currentUserId(req)).then((user) => ({ user }));
  }

  @UseGuards(UserGuard)
  @Put('profile')
  updateProfile(@Body() dto: ProfileDto, @Req() req: Request) {
    return this.account
      .updateProfile(currentUserId(req), dto)
      .then((user) => ({ user }));
  }

  @UseGuards(UserGuard)
  @Get('bookings')
  bookings(@Req() req: Request) {
    return this.account.bookings(currentUserId(req));
  }

  @UseGuards(UserGuard)
  @Get('promo')
  promos(@Req() req: Request) {
    return this.account.promos(currentUserId(req));
  }

  @UseGuards(UserGuard)
  @Get('courses')
  courses(@Req() req: Request) {
    return this.account.courses(currentUserId(req));
  }

  @UseGuards(UserGuard)
  @Get('freezes')
  freezes(@Req() req: Request) {
    return this.account.freezes(currentUserId(req));
  }

  @UseGuards(UserGuard)
  @Post('courses/cancel')
  cancelCourse(@Body() dto: CancelCourseDto, @Req() req: Request) {
    return this.account.cancelCourse(currentUserId(req), dto.courseGroupId);
  }

  @UseGuards(UserGuard)
  @Post('bookings/:id/freeze')
  freeze(@Param('id', IdPipe) id: number, @Req() req: Request) {
    return this.account.freeze(currentUserId(req), id);
  }

  @UseGuards(UserGuard)
  @Post('bookings/:id/cancel')
  cancel(@Param('id', IdPipe) id: number, @Req() req: Request) {
    return this.account.cancel(currentUserId(req), id);
  }

  @UseGuards(UserGuard)
  @Post('bookings/:id/move')
  move(
    @Param('id', IdPipe) id: number,
    @Body() dto: MoveBookingDto,
    @Req() req: Request,
  ) {
    return this.account.move(currentUserId(req), id, dto);
  }
}

@Module({
  providers: [AccountService, UserGuard],
  controllers: [AccountController],
  exports: [AccountService, UserGuard],
})
export class AccountModule {}
