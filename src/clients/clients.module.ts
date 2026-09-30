import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthenticatedGuard,
  TrainerAllowed,
  currentAdmin,
} from '../auth/guards';
import type { SessionAdmin } from '../auth/auth.service';
import {
  AccountModule,
  UserGuard,
  currentUserId,
} from '../account/account.module';
import { IdPipe } from '../common/id.pipe';
import {
  BIO_FIELDS,
  BODY_TYPES,
  GIRTH_FIELDS,
  ZONE_TABLES,
  derive,
} from './protocol';
import type { BodyType, Sex } from './protocol';

const SEX_VALUES = ['FEMALE', 'MALE'];
const BODY_TYPE_VALUES = BODY_TYPES.map((t) => t.value) as string[];

const NUMERIC_FIELDS = [
  'chestCm',
  'waistCm',
  'hipsCm',
  'armCm',
  'thighCm',
  'calfCm',
  'weightKg',
  'fatPct',
  'muscleKg',
  'visceralFat',
  'waterPct',
  'boneKg',
  'metabolicAge',
  'bmr',
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

const round1 = (value: number) => Math.round(value * 10) / 10;

const Measure = (label: string, max: number) =>
  applyDecorators(
    IsOptional(),
    IsNumber({}, { message: `${label}: введите число` }),
    Min(0, { message: `${label}: значение не может быть отрицательным` }),
    Max(max, { message: `${label}: слишком большое значение` }),
  );

class CardDto {
  @IsOptional()
  @IsIn(SEX_VALUES, { message: 'Укажите пол' })
  sex?: Sex | null;

  @IsOptional()
  @IsDateString({}, { message: 'Дата рождения указана неверно' })
  birthDate?: string | null;

  @IsOptional()
  @IsNumber({}, { message: 'Рост: введите число' })
  @Min(50, { message: 'Рост указан неверно' })
  @Max(260, { message: 'Рост указан неверно' })
  heightCm?: number | null;

  @IsOptional()
  @IsIn(BODY_TYPE_VALUES, { message: 'Укажите тип телосложения' })
  bodyType?: BodyType | null;

  @IsOptional() @IsString() note?: string;
}

class TestResultDto {
  @IsInt() testId: number;
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsBoolean() passed?: boolean | null;
}

class MeasurementDto {
  @IsOptional()
  @IsDateString({}, { message: 'Дата замера указана неверно' })
  takenAt?: string;

  @Measure('Обхват груди', 300) chestCm?: number | null;
  @Measure('Обхват талии', 300) waistCm?: number | null;
  @Measure('Обхват бёдер', 300) hipsCm?: number | null;
  @Measure('Обхват плеча', 200) armCm?: number | null;
  @Measure('Обхват бедра', 200) thighCm?: number | null;
  @Measure('Обхват голени', 200) calfCm?: number | null;

  @Measure('Вес', 500) weightKg?: number | null;
  @Measure('% жира', 100) fatPct?: number | null;
  @Measure('Мышечная масса', 300) muscleKg?: number | null;
  @Measure('Висцеральный жир', 100) visceralFat?: number | null;
  @Measure('% воды', 100) waterPct?: number | null;
  @Measure('Костная масса', 100) boneKg?: number | null;

  @IsOptional()
  @IsInt({ message: 'Метаболический возраст: введите целое число' })
  @Min(0)
  @Max(130)
  metabolicAge?: number | null;

  @IsOptional()
  @IsInt({ message: 'Базовый метаболизм: введите целое число' })
  @Min(0)
  @Max(20000)
  bmr?: number | null;

  @IsOptional() @IsString() strengths?: string;
  @IsOptional() @IsString() risks?: string;
  @IsOptional() @IsString() trainingAdvice?: string;
  @IsOptional() @IsString() nutritionAdvice?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Дата повторной диагностики указана неверно' })
  nextCheckAt?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestResultDto)
  tests?: TestResultDto[];
}

class UpsertTestDto {
  @IsString() @IsNotEmpty({ message: 'Укажите название теста' }) name: string;
  @IsOptional() @IsString() measures?: string;
  @IsOptional() @IsString() howTo?: string;
  @IsOptional() @IsString() norm?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async protocol() {
    return {
      girths: GIRTH_FIELDS,
      bio: BIO_FIELDS,
      bodyTypes: BODY_TYPES.map(({ value, label }) => ({ value, label })),
      zones: ZONE_TABLES,
      tests: await this.prisma.functionalTest.findMany({
        where: { isActive: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
    };
  }

  async list(query?: string) {
    const q = (query ?? '').trim();
    const users = await this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        card: {
          include: {
            _count: { select: { measurements: true } },
            measurements: {
              orderBy: { takenAt: 'desc' },
              take: 1,
              select: { takenAt: true },
            },
          },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      hasCard: !!u.card,
      measurements: u.card?._count.measurements ?? 0,
      lastAt: u.card?.measurements[0]?.takenAt ?? null,
    }));
  }

  async card(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) throw new NotFoundException('Клиент не найден');

    const card = await this.prisma.clientCard.findUnique({
      where: { userId },
      include: { updatedBy: { select: { username: true } } },
    });

    const rows = card
      ? await this.prisma.measurement.findMany({
          where: { cardId: card.id },
          orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
          include: {
            createdBy: { select: { id: true, username: true } },
            updatedBy: { select: { username: true } },
            tests: true,
          },
        })
      : [];

    const basics = {
      sex: card?.sex ?? null,
      birthDate: card?.birthDate ?? null,
      heightCm: card?.heightCm ?? null,
      bodyType: card?.bodyType ?? null,
    };

    const measurements = rows.map((m, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      const delta: Partial<Record<NumericField, number>> = {};
      if (prev) {
        for (const key of NUMERIC_FIELDS) {
          const now = m[key];
          const was = prev[key];
          if (now != null && was != null) delta[key] = round1(now - was);
        }
      }
      const editor = m.updatedBy?.username ?? null;
      return {
        ...m,
        author: m.createdBy?.username ?? null,
        editor: editor && editor !== m.createdBy?.username ? editor : null,
        derived: derive(basics, m),
        delta,
        prevAt: prev?.takenAt ?? null,
      };
    });

    return {
      user,
      card: card
        ? {
            id: card.id,
            sex: card.sex,
            birthDate: card.birthDate,
            heightCm: card.heightCm,
            bodyType: card.bodyType,
            note: card.note,
            updatedAt: card.updatedAt,
            updatedBy: card.updatedBy?.username ?? null,
          }
        : null,
      measurements: measurements.reverse(),
    };
  }

  async saveCard(userId: number, dto: CardDto, admin: SessionAdmin) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Клиент не найден');

    const data = {
      sex: dto.sex ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      heightCm: dto.heightCm ?? null,
      bodyType: dto.bodyType ?? null,
      note: dto.note?.trim() ?? '',
      updatedById: admin.id,
    };

    await this.prisma.clientCard.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.card(userId);
  }

  private async ensureCard(userId: number, admin: SessionAdmin) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Клиент не найден');
    return this.prisma.clientCard.upsert({
      where: { userId },
      create: { userId, updatedById: admin.id },
      update: {},
    });
  }

  private measurementData(dto: MeasurementDto) {
    const num = (v: number | null | undefined) => (v == null ? null : v);
    return {
      takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date(),
      chestCm: num(dto.chestCm),
      waistCm: num(dto.waistCm),
      hipsCm: num(dto.hipsCm),
      armCm: num(dto.armCm),
      thighCm: num(dto.thighCm),
      calfCm: num(dto.calfCm),
      weightKg: num(dto.weightKg),
      fatPct: num(dto.fatPct),
      muscleKg: num(dto.muscleKg),
      visceralFat: num(dto.visceralFat),
      waterPct: num(dto.waterPct),
      boneKg: num(dto.boneKg),
      metabolicAge: num(dto.metabolicAge),
      bmr: num(dto.bmr),
      strengths: dto.strengths?.trim() ?? '',
      risks: dto.risks?.trim() ?? '',
      trainingAdvice: dto.trainingAdvice?.trim() ?? '',
      nutritionAdvice: dto.nutritionAdvice?.trim() ?? '',
      nextCheckAt: dto.nextCheckAt ? new Date(dto.nextCheckAt) : null,
    };
  }

  private async saveTests(measurementId: number, tests?: TestResultDto[]) {
    if (!tests) return;
    const known = new Set(
      (await this.prisma.functionalTest.findMany({ select: { id: true } })).map(
        (t) => t.id,
      ),
    );
    const data = tests
      .filter((t) => known.has(t.testId))
      .filter((t) => (t.value ?? '').trim() !== '' || t.passed != null)
      .map((t) => ({
        measurementId,
        testId: t.testId,
        value: (t.value ?? '').trim(),
        passed: t.passed ?? null,
      }));

    await this.prisma.$transaction([
      this.prisma.measurementTest.deleteMany({ where: { measurementId } }),
      this.prisma.measurementTest.createMany({ data }),
    ]);
  }

  async addMeasurement(
    userId: number,
    dto: MeasurementDto,
    admin: SessionAdmin,
  ) {
    const card = await this.ensureCard(userId, admin);
    const created = await this.prisma.measurement.create({
      data: {
        cardId: card.id,
        createdById: admin.id,
        ...this.measurementData(dto),
      },
    });
    await this.saveTests(created.id, dto.tests);
    return this.card(userId);
  }

  async updateMeasurement(
    id: number,
    dto: MeasurementDto,
    admin: SessionAdmin,
  ) {
    const found = await this.ensure(id);
    await this.prisma.measurement.update({
      where: { id },
      data: { ...this.measurementData(dto), updatedById: admin.id },
    });
    await this.saveTests(id, dto.tests);
    return this.card(found.card.userId);
  }

  async removeMeasurement(id: number, admin: SessionAdmin) {
    const found = await this.ensure(id);
    if (admin.role !== 'OWNER' && found.createdById !== admin.id)
      throw new ForbiddenException(
        'Удалить замер может тот, кто его внёс, или главный администратор',
      );
    await this.prisma.measurement.delete({ where: { id } });
    return this.card(found.card.userId);
  }

  private async ensure(id: number) {
    const found = await this.prisma.measurement.findUnique({
      where: { id },
      include: { card: { select: { userId: true } } },
    });
    if (!found) throw new NotFoundException('Замер не найден');
    return found;
  }

  listTests() {
    return this.prisma.functionalTest.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  private testData(dto: UpsertTestDto) {
    return {
      name: dto.name.trim(),
      measures: dto.measures?.trim() ?? '',
      howTo: dto.howTo?.trim() ?? '',
      norm: dto.norm?.trim() ?? '',
      unit: dto.unit?.trim() ?? '',
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    };
  }

  createTest(dto: UpsertTestDto) {
    return this.prisma.functionalTest.create({ data: this.testData(dto) });
  }

  async updateTest(id: number, dto: UpsertTestDto) {
    await this.ensureTest(id);
    return this.prisma.functionalTest.update({
      where: { id },
      data: this.testData(dto),
    });
  }

  async removeTest(id: number) {
    await this.ensureTest(id);
    const used = await this.prisma.measurementTest.count({
      where: { testId: id },
    });
    if (used) {
      await this.prisma.functionalTest.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        ok: true,
        hidden: true,
        message: `Тест скрыт: он уже заполнен в ${used} замерах, история сохранена`,
      };
    }
    await this.prisma.functionalTest.delete({ where: { id } });
    return { ok: true, hidden: false };
  }

  private async ensureTest(id: number) {
    const found = await this.prisma.functionalTest.findUnique({
      where: { id },
    });
    if (!found) throw new NotFoundException('Тест не найден');
    return found;
  }
}

@TrainerAllowed()
@Controller('clients')
class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('protocol')
  protocol() {
    return this.clients.protocol();
  }

  @UseGuards(UserGuard)
  @Get('me')
  mine(@Req() req: Request) {
    return this.clients.card(currentUserId(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Get('tests')
  tests() {
    return this.clients.listTests();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('tests')
  createTest(@Body() dto: UpsertTestDto) {
    return this.clients.createTest(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('tests/:id')
  updateTest(@Param('id', IdPipe) id: number, @Body() dto: UpsertTestDto) {
    return this.clients.updateTest(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('tests/:id')
  removeTest(@Param('id', IdPipe) id: number) {
    return this.clients.removeTest(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin')
  list(@Query('q') q?: string) {
    return this.clients.list(q);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/:userId')
  card(@Param('userId', IdPipe) userId: number) {
    return this.clients.card(userId);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('admin/:userId/card')
  saveCard(
    @Param('userId', IdPipe) userId: number,
    @Body() dto: CardDto,
    @Req() req: Request,
  ) {
    return this.clients.saveCard(userId, dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Post('admin/:userId/measurements')
  addMeasurement(
    @Param('userId', IdPipe) userId: number,
    @Body() dto: MeasurementDto,
    @Req() req: Request,
  ) {
    return this.clients.addMeasurement(userId, dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Put('measurements/:id')
  updateMeasurement(
    @Param('id', IdPipe) id: number,
    @Body() dto: MeasurementDto,
    @Req() req: Request,
  ) {
    return this.clients.updateMeasurement(id, dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('measurements/:id')
  removeMeasurement(@Param('id', IdPipe) id: number, @Req() req: Request) {
    return this.clients.removeMeasurement(id, currentAdmin(req));
  }
}

@Module({
  imports: [AccountModule],
  providers: [ClientsService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}
