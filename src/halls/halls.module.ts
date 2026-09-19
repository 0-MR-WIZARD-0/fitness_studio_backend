import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';
import { RentModule, RentService } from '../rent/rent.module';
import { IdPipe } from '../common/id.pipe';

class UpsertHallDto {
  @IsString() @IsNotEmpty({ message: 'Укажите название зала' }) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) priceSingle?: number;
  @IsOptional() @IsInt() @Min(0) price4?: number;
  @IsOptional() @IsInt() @Min(0) price8?: number;
  @IsOptional() @IsInt() @Min(0) price12?: number;
  @IsOptional() @IsBoolean() autoSchedule?: boolean;
  @IsOptional() @IsString() bookingUrl?: string;
  @IsOptional()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Время в формате ЧЧ:ММ' })
  dayStart?: string;
  @IsOptional()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Время в формате ЧЧ:ММ' })
  dayEnd?: string;
  @IsOptional() @IsInt() @Min(0) bufferMin?: number;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class HallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rent: RentService,
  ) {}

  private data(dto: UpsertHallDto) {
    const autoSchedule = dto.autoSchedule ?? false;
    return {
      title: dto.title.trim(),
      description: dto.description ?? '',
      priceSingle: dto.priceSingle ?? 0,
      price4: dto.price4 ?? 0,
      price8: dto.price8 ?? 0,
      price12: dto.price12 ?? 0,
      autoSchedule,
      bookingUrl: autoSchedule ? '' : (dto.bookingUrl?.trim() ?? ''),
      dayStart: dto.dayStart ?? '09:00',
      dayEnd: dto.dayEnd ?? '17:30',
      bufferMin: dto.bufferMin ?? 30,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    };
  }

  listPublic() {
    return this.prisma.hall.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  listAll() {
    return this.prisma.hall.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  async create(dto: UpsertHallDto) {
    const hall = await this.prisma.hall.create({ data: this.data(dto) });
    if (hall.autoSchedule) await this.rent.syncRange();
    return hall;
  }

  async update(id: number, dto: UpsertHallDto) {
    const before = await this.ensure(id);
    const hall = await this.prisma.hall.update({
      where: { id },
      data: this.data(dto),
    });
    const affectsSlots =
      hall.autoSchedule !== before.autoSchedule ||
      hall.isActive !== before.isActive ||
      hall.priceSingle !== before.priceSingle ||
      hall.dayStart !== before.dayStart ||
      hall.dayEnd !== before.dayEnd ||
      hall.bufferMin !== before.bufferMin;
    if (affectsSlots) await this.rent.syncRange();
    return hall;
  }

  async remove(id: number) {
    const before = await this.ensure(id);
    const lessons = await this.prisma.slot.count({
      where: { hallId: id, startsAt: { gte: new Date() } },
    });
    if (lessons)
      throw new BadRequestException(
        `В зале ${lessons} занятий в расписании — перенесите их в другой зал или удалите`,
      );
    await this.prisma.hall.delete({ where: { id } });
    if (before.autoSchedule) await this.rent.syncRange();
    return { ok: true };
  }

  private async ensure(id: number) {
    const found = await this.prisma.hall.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Зал не найден');
    return found;
  }
}

@Controller('halls')
class HallsController {
  constructor(private readonly halls: HallsService) {}

  @Get()
  publicList() {
    return this.halls.listPublic();
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin')
  all() {
    return this.halls.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertHallDto) {
    return this.halls.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpsertHallDto) {
    return this.halls.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number) {
    return this.halls.remove(id);
  }
}

@Module({
  imports: [RentModule],
  providers: [HallsService],
  controllers: [HallsController],
  exports: [HallsService],
})
export class HallsModule {}
