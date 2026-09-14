import { Module } from '@nestjs/common';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';
import { RentModule, RentService } from '../rent/rent.module';
import { IdPipe } from '../common/id.pipe';

const ACTIVE_BOOKINGS = { status: { not: 'CANCELLED' as const } };
const WITH_COUNT = {
  trainer: true,
  _count: { select: { bookings: { where: ACTIVE_BOOKINGS } } },
} as const;

class UpsertAnnouncementDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() startsAt: string;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsInt() trainerId?: number | null;
  @IsOptional() @IsInt() capacity?: number;
  @IsOptional() @IsInt() price?: number;
  @IsOptional() @IsBoolean() isFree?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rent: RentService,
  ) {}

  private withTrainer<
    T extends {
      trainer?: { name: string } | null;
      trainerId: number | null;
      capacity: number;
      _count: { bookings: number };
    },
  >(item: T) {
    const { trainer, _count, ...rest } = item;
    return {
      ...rest,
      trainerName: trainer?.name ?? null,
      taken: _count.bookings,
      remaining: Math.max(0, item.capacity - _count.bookings),
    };
  }

  async listPublic() {
    const items = await this.prisma.announcement.findMany({
      where: { isActive: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: WITH_COUNT,
    });
    return items.map((a) => this.withTrainer(a));
  }

  async listAll() {
    const items = await this.prisma.announcement.findMany({
      orderBy: { startsAt: 'asc' },
      include: WITH_COUNT,
    });
    return items.map((a) => this.withTrainer(a));
  }

  private data(dto: UpsertAnnouncementDto) {
    return {
      title: dto.title,
      description: dto.description,
      startsAt: new Date(dto.startsAt),
      durationMin: dto.durationMin,
      trainerId: dto.trainerId ?? null,
      capacity: dto.capacity,
      price: dto.price,
      isFree: dto.isFree,
      isActive: dto.isActive,
    };
  }

  private async ensureNotRented(dto: UpsertAnnouncementDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + (dto.durationMin ?? 60) * 60000,
    );
    const rental = await this.rent.findBlockingRental(startsAt, endsAt);
    if (rental) {
      const when = rental.startsAt.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      throw new ConflictException(
        `На это время студия сдана в аренду (${when}) — анонс поставить нельзя`,
      );
    }
  }

  async create(dto: UpsertAnnouncementDto) {
    await this.ensureNotRented(dto);
    const item = await this.prisma.announcement.create({
      data: this.data(dto),
    });
    await this.rent.syncDay(item.startsAt);
    return item;
  }

  async update(id: number, dto: UpsertAnnouncementDto) {
    const before = await this.prisma.announcement.findUnique({ where: { id } });
    await this.ensureNotRented(dto);
    const item = await this.prisma.announcement.update({
      where: { id },
      data: this.data(dto),
    });
    if (before) await this.rent.syncDay(before.startsAt);
    await this.rent.syncDay(item.startsAt);
    return item;
  }

  async remove(id: number) {
    const item = await this.prisma.announcement.findUnique({ where: { id } });
    await this.prisma.announcement.delete({ where: { id } });
    if (item) await this.rent.syncDay(item.startsAt);
    return { ok: true };
  }

  @Cron('0 0 * * *')
  async cleanupExpired() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const res = await this.prisma.announcement.deleteMany({
      where: { startsAt: { lt: startOfToday } },
    });
    if (res.count)
      new Logger('Announcements').log(
        `Удалено прошедших анонсов: ${res.count}`,
      );
  }
}

@Controller('announcements')
class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Get()
  publicList() {
    return this.svc.listPublic();
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin')
  all() {
    return this.svc.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertAnnouncementDto) {
    return this.svc.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpsertAnnouncementDto) {
    return this.svc.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number) {
    return this.svc.remove(id);
  }
}

@Module({
  imports: [RentModule],
  providers: [AnnouncementsService],
  controllers: [AnnouncementsController],
})
export class AnnouncementsModule {}
