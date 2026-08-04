import { Module } from '@nestjs/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
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

class UpsertAnnouncementDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() startsAt: string;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsInt() capacity?: number;
  @IsOptional() @IsInt() price?: number;
  @IsOptional() @IsBoolean() isFree?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.announcement.findMany({
      where: { isActive: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
  }

  listAll() {
    return this.prisma.announcement.findMany({ orderBy: { startsAt: 'asc' } });
  }

  private data(dto: UpsertAnnouncementDto) {
    return {
      title: dto.title,
      description: dto.description,
      startsAt: new Date(dto.startsAt),
      durationMin: dto.durationMin,
      capacity: dto.capacity,
      price: dto.price,
      isFree: dto.isFree,
      isActive: dto.isActive,
    };
  }

  create(dto: UpsertAnnouncementDto) {
    return this.prisma.announcement.create({ data: this.data(dto) });
  }

  update(id: number, dto: UpsertAnnouncementDto) {
    return this.prisma.announcement.update({
      where: { id },
      data: this.data(dto),
    });
  }

  async remove(id: number) {
    await this.prisma.announcement.delete({ where: { id } });
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
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertAnnouncementDto,
  ) {
    return this.svc.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}

@Module({
  providers: [AnnouncementsService],
  controllers: [AnnouncementsController],
})
export class AnnouncementsModule {}
