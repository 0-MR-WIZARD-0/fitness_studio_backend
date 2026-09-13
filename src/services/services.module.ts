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
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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

class UpsertServiceDto {
  @IsString() @IsNotEmpty({ message: 'Укажите название услуги' })
  title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) durationMin?: number | null;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class OrderServiceDto {
  @IsInt() serviceId: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) documentIds?: number[];
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  private data(dto: UpsertServiceDto) {
    return {
      title: dto.title.trim(),
      description: dto.description ?? '',
      price: dto.price ?? 0,
      durationMin: dto.durationMin ? dto.durationMin : null,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    };
  }

  listPublic() {
    return this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  listAll() {
    return this.prisma.service.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  create(dto: UpsertServiceDto) {
    return this.prisma.service.create({ data: this.data(dto) });
  }

  async update(id: number, dto: UpsertServiceDto) {
    await this.ensure(id);
    return this.prisma.service.update({ where: { id }, data: this.data(dto) });
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.service.delete({ where: { id } });
    return { ok: true };
  }

  async order(dto: OrderServiceDto, userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Войдите в личный кабинет');
    await this.documents.ensureAccepted(dto.documentIds);

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service || !service.isActive)
      throw new NotFoundException('Услуга не найдена');
    if (service.durationMin)
      throw new BadRequestException(
        'Для этой услуги нужно выбрать время в расписании',
      );

    const booking = await this.prisma.booking.create({
      data: {
        userId: user.id,
        serviceId: service.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        price: service.price,
        isFree: service.price === 0,
      },
    });

    return {
      bookingId: booking.id,
      total: service.price,
      payment:
        service.price > 0
          ? {
              status: 'mock',
              redirectUrl: `/payment/mock?total=${service.price}`,
            }
          : { status: 'free', redirectUrl: null },
    };
  }

  private async ensure(id: number) {
    const found = await this.prisma.service.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Услуга не найдена');
    return found;
  }
}

@Controller('services')
class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  publicList() {
    return this.services.listPublic();
  }

  @UseGuards(UserGuard)
  @Post('order')
  order(@Body() dto: OrderServiceDto, @Req() req: Request) {
    return this.services.order(dto, currentUserId(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin')
  all() {
    return this.services.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertServiceDto) {
    return this.services.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpsertServiceDto) {
    return this.services.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number) {
    return this.services.remove(id);
  }
}

@Module({
  imports: [AccountModule, DocumentsModule],
  providers: [ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
