import {
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
import {
  AuthenticatedGuard,
  TrainerAllowed,
  assertOwnItem,
  currentAdmin,
} from '../auth/guards';
import type { SessionAdmin } from '../auth/auth.service';
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
import { PaymentsModule, PaymentsService } from '../payments/payments.module';

class UpsertServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите название услуги' })
  title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
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
    private readonly payments: PaymentsService,
  ) {}

  private data(dto: UpsertServiceDto) {
    return {
      title: dto.title.trim(),
      description: dto.description ?? '',
      price: dto.price ?? 0,
      durationMin: null,
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

  create(dto: UpsertServiceDto, admin: SessionAdmin) {
    return this.prisma.service.create({
      data: { ...this.data(dto), createdById: admin.id },
    });
  }

  async update(id: number, dto: UpsertServiceDto, admin: SessionAdmin) {
    assertOwnItem(admin, await this.ensure(id), 'услуги');
    return this.prisma.service.update({ where: { id }, data: this.data(dto) });
  }

  async remove(id: number, admin: SessionAdmin) {
    assertOwnItem(admin, await this.ensure(id), 'услуги');
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

    const payment =
      service.price > 0
        ? await this.payments.start({
            id: booking.id,
            price: service.price,
            name: booking.name,
            phone: booking.phone,
            email: booking.email,
            title: service.title,
          })
        : { status: 'free', redirectUrl: null };

    return { bookingId: booking.id, total: service.price, payment };
  }

  private async ensure(id: number) {
    const found = await this.prisma.service.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Услуга не найдена');
    return found;
  }
}

@TrainerAllowed()
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
  create(@Body() dto: UpsertServiceDto, @Req() req: Request) {
    return this.services.create(dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpsertServiceDto,
    @Req() req: Request,
  ) {
    return this.services.update(id, dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number, @Req() req: Request) {
    return this.services.remove(id, currentAdmin(req));
  }
}

@Module({
  imports: [AccountModule, DocumentsModule, PaymentsModule],
  providers: [ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
