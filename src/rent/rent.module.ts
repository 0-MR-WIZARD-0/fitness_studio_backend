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
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';

class UpsertRentalSlotDto {
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class BookRentalDto {
  @IsInt() rentalSlotId: number;
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
  @IsString() @IsNotEmpty({ message: 'Укажите телефон' }) phone: string;
  @IsEmail({}, { message: 'Укажите корректный email' }) email: string;
}

@Injectable()
export class RentService {
  constructor(private readonly prisma: PrismaService) {}

  private map(slot: {
    id: number;
    startsAt: Date;
    endsAt: Date;
    price: number;
    comment: string;
    isActive: boolean;
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
      isBooked: (slot.bookings?.length ?? 0) > 0,
    };
  }

  async listPublic() {
    const slots = await this.prisma.rentalSlot.findMany({
      where: { isActive: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: { bookings: { select: { id: true } } },
    });
    return slots.map((s) => this.map(s));
  }

  async listAll() {
    const slots = await this.prisma.rentalSlot.findMany({
      orderBy: { startsAt: 'asc' },
      include: {
        bookings: { select: { id: true, name: true, phone: true, email: true } },
      },
    });
    return slots.map((s) => ({
      ...this.map(s),
      bookings: s.bookings,
    }));
  }

  /** Занятие пересекается с арендой — и наоборот */
  async findLessonOverlap(startsAt: Date, endsAt: Date) {
    const dayStart = new Date(startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(endsAt);
    dayEnd.setHours(23, 59, 59, 999);

    const slots = await this.prisma.slot.findMany({
      where: { startsAt: { gte: dayStart, lte: dayEnd } },
      include: { format: true },
    });
    return (
      slots.find((s) => {
        const sEnd = new Date(s.startsAt.getTime() + s.durationMin * 60000);
        return s.startsAt < endsAt && startsAt < sEnd;
      }) ?? null
    );
  }

  async findRentalOverlap(
    startsAt: Date,
    endsAt: Date,
    exceptId?: number,
  ) {
    const dayStart = new Date(startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(endsAt);
    dayEnd.setHours(23, 59, 59, 999);

    const slots = await this.prisma.rentalSlot.findMany({
      where: {
        isActive: true,
        startsAt: { gte: dayStart, lte: dayEnd },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    return (
      slots.find((s) => s.startsAt < endsAt && startsAt < s.endsAt) ?? null
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

  private async ensureFree(startsAt: Date, endsAt: Date, exceptId?: number) {
    if (endsAt.getTime() <= startsAt.getTime())
      throw new BadRequestException('Время окончания должно быть позже начала');

    const lesson = await this.findLessonOverlap(startsAt, endsAt);
    if (lesson)
      throw new ConflictException(
        `В это время уже стоит занятие (${this.when(lesson.startsAt)}${
          lesson.format ? `, ${lesson.format.name}` : ', диагностика'
        }) — аренду поставить нельзя`,
      );

    const rental = await this.findRentalOverlap(startsAt, endsAt, exceptId);
    if (rental)
      throw new ConflictException(
        `Аренда на это время уже есть (${this.when(rental.startsAt)})`,
      );
  }

  async create(dto: UpsertRentalSlotDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    await this.ensureFree(startsAt, endsAt);

    const slot = await this.prisma.rentalSlot.create({
      data: {
        startsAt,
        endsAt,
        price: dto.price ?? 0,
        comment: dto.comment ?? '',
        isActive: dto.isActive ?? true,
      },
      include: { bookings: { select: { id: true } } },
    });
    return this.map(slot);
  }

  async update(id: number, dto: UpsertRentalSlotDto) {
    await this.ensure(id);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    await this.ensureFree(startsAt, endsAt, id);

    const slot = await this.prisma.rentalSlot.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        price: dto.price,
        comment: dto.comment,
        isActive: dto.isActive,
      },
      include: { bookings: { select: { id: true } } },
    });
    return this.map(slot);
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.rentalSlot.delete({ where: { id } });
    return { ok: true };
  }

  async book(dto: BookRentalDto) {
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.rentalSlot.findUnique({
        where: { id: dto.rentalSlotId },
        include: { bookings: { select: { id: true } } },
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
          rentalSlotId: slot.id,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          price: slot.price,
          isFree: slot.price === 0,
        },
      });

      return {
        bookingId: booking.id,
        total: slot.price,
        payment:
          slot.price > 0
            ? { status: 'mock', redirectUrl: `/payment/mock?total=${slot.price}` }
            : { status: 'free', redirectUrl: null },
      };
    });
  }

  private async ensure(id: number) {
    const found = await this.prisma.rentalSlot.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Слот аренды не найден');
  }

  @Cron('15 0 * * *')
  async cleanupPast() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const res = await this.prisma.rentalSlot.deleteMany({
      where: { startsAt: { lt: startOfToday } },
    });
    if (res.count)
      new Logger('Rent').log(`Удалено прошедших слотов аренды: ${res.count}`);
  }
}

@Controller('rent')
class RentController {
  constructor(private readonly rent: RentService) {}

  @Get('slots')
  listPublic() {
    return this.rent.listPublic();
  }

  @Post('book')
  book(@Body() dto: BookRentalDto) {
    return this.rent.book(dto);
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
  @Put('slots/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertRentalSlotDto,
  ) {
    return this.rent.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('slots/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rent.remove(id);
  }
}

@Module({
  providers: [RentService],
  controllers: [RentController],
  exports: [RentService],
})
export class RentModule {}
