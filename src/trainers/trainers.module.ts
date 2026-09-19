import {
  BadRequestException,
  Body,
  ConflictException,
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
import * as bcrypt from 'bcrypt';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AuthService, SessionAdmin } from '../auth/auth.service';
import {
  AuthenticatedGuard,
  TrainerAllowed,
  currentAdmin,
} from '../auth/guards';
import { IdPipe } from '../common/id.pipe';
import {
  PASSWORD_RE,
  PASSWORD_RULE,
  USERNAME_RE,
  USERNAME_RULE,
} from '../common/password';

class UpsertTrainerDto {
  @IsString() name: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoUrl?: string | null;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateTrainerAccountDto {
  @Matches(USERNAME_RE, { message: USERNAME_RULE }) username: string;
  @Matches(PASSWORD_RE, { message: PASSWORD_RULE }) password: string;
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
}

class GrantAccessDto {
  @Matches(USERNAME_RE, { message: USERNAME_RULE }) username: string;
  @Matches(PASSWORD_RE, { message: PASSWORD_RULE }) password: string;
}

class ResetPasswordDto {
  @Matches(PASSWORD_RE, { message: PASSWORD_RULE }) password: string;
}

class ProfileDto {
  @IsBoolean() isTrainer: boolean;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoUrl?: string | null;
}

class CredentialsDto {
  @IsString()
  @IsNotEmpty({ message: 'Введите текущий пароль' })
  currentPassword: string;
  @IsOptional()
  @Matches(USERNAME_RE, { message: USERNAME_RULE })
  username?: string;
  @IsOptional()
  @Matches(PASSWORD_RE, { message: PASSWORD_RULE })
  newPassword?: string;
}

const ACCOUNT = { select: { id: true, username: true, role: true } } as const;

@Injectable()
class TrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  list(onlyActive = false) {
    return this.prisma.trainer.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  listWithAccounts() {
    return this.prisma.trainer.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      include: { admin: ACCOUNT },
    });
  }

  create(dto: UpsertTrainerDto) {
    return this.prisma.trainer.create({ data: dto });
  }

  async update(id: number, dto: UpsertTrainerDto) {
    await this.ensure(id);
    return this.prisma.trainer.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id },
      include: { admin: ACCOUNT },
    });
    if (!trainer) throw new NotFoundException('Тренер не найден');
    if (trainer.admin?.role === 'OWNER')
      throw new BadRequestException(
        'Это карточка главного администратора — снимите отметку «Тренер» в профиле',
      );
    await this.prisma.$transaction(async (tx) => {
      if (trainer.admin)
        await tx.admin.delete({ where: { id: trainer.admin.id } });
      await tx.trainer.delete({ where: { id } });
    });
    return { ok: true };
  }

  private async ensure(id: number) {
    const found = await this.prisma.trainer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Тренер не найден');
    return found;
  }

  private async ensureFreeUsername(username: string, exceptId?: number) {
    const taken = await this.prisma.admin.findUnique({ where: { username } });
    if (taken && taken.id !== exceptId)
      throw new ConflictException('Такой логин уже занят');
  }

  async createAccount(dto: CreateTrainerAccountDto) {
    await this.ensureFreeUsername(dto.username);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainer.create({
        data: { name: dto.name.trim() },
      });
      await tx.admin.create({
        data: {
          username: dto.username,
          passwordHash,
          role: 'TRAINER',
          trainerId: trainer.id,
        },
      });
      return tx.trainer.findUnique({
        where: { id: trainer.id },
        include: { admin: ACCOUNT },
      });
    });
  }

  async grantAccess(trainerId: number, dto: GrantAccessDto) {
    await this.ensure(trainerId);
    const linked = await this.prisma.admin.findUnique({ where: { trainerId } });
    if (linked) throw new ConflictException('У тренера уже есть вход');
    await this.ensureFreeUsername(dto.username);
    await this.prisma.admin.create({
      data: {
        username: dto.username,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'TRAINER',
        trainerId,
      },
    });
    return { ok: true };
  }

  async resetPassword(trainerId: number, dto: ResetPasswordDto) {
    const admin = await this.prisma.admin.findUnique({ where: { trainerId } });
    if (!admin || admin.role !== 'TRAINER')
      throw new NotFoundException('У тренера нет входа в админку');
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(dto.password, 10) },
    });
    await this.dropSessions(admin.id);
    return { ok: true };
  }

  async revokeAccess(trainerId: number) {
    const admin = await this.prisma.admin.findUnique({ where: { trainerId } });
    if (!admin || admin.role !== 'TRAINER')
      throw new NotFoundException('У тренера нет входа в админку');
    await this.prisma.admin.delete({ where: { id: admin.id } });
    await this.dropSessions(admin.id);
    return { ok: true };
  }

  private dropSessions(adminId: number) {
    return this.prisma.$executeRaw`
      DELETE FROM "session" WHERE sess->'passport'->>'user' = ${String(adminId)}
    `;
  }

  async profile(me: SessionAdmin) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: me.id },
      include: { trainer: true },
    });
    if (!admin) throw new UnauthorizedException('Требуется вход в админку');
    return {
      username: admin.username,
      role: admin.role,
      isTrainer: !!admin.trainer,
      trainer: admin.trainer,
    };
  }

  async updateProfile(me: SessionAdmin, dto: ProfileDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: me.id },
      include: { trainer: true },
    });
    if (!admin) throw new UnauthorizedException('Требуется вход в админку');

    const card = {
      role: dto.role?.trim() ?? '',
      description: dto.description?.trim() ?? '',
      photoUrl: dto.photoUrl ?? null,
    };

    if (!dto.isTrainer) {
      if (admin.role === 'TRAINER')
        throw new BadRequestException('Тренер не может снять эту отметку');
      if (admin.trainer) {
        await this.prisma.$transaction([
          this.prisma.admin.update({
            where: { id: admin.id },
            data: { trainerId: null },
          }),
          this.prisma.trainer.update({
            where: { id: admin.trainer.id },
            data: { isActive: false },
          }),
        ]);
      }
      return this.profile(me);
    }

    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Укажите ФИО');
    if (admin.trainer) {
      await this.prisma.trainer.update({
        where: { id: admin.trainer.id },
        data: { name, ...card, isActive: true },
      });
    } else {
      const trainer = await this.prisma.trainer.create({
        data: { name, ...card },
      });
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: { trainerId: trainer.id },
      });
    }
    return this.profile(me);
  }

  async updateCredentials(me: SessionAdmin, dto: CredentialsDto) {
    if (!(await this.auth.checkPassword(me.id, dto.currentPassword)))
      throw new BadRequestException('Текущий пароль неверный');
    if (!dto.username && !dto.newPassword)
      throw new BadRequestException('Укажите новый логин или новый пароль');

    if (dto.username) await this.ensureFreeUsername(dto.username, me.id);
    await this.prisma.admin.update({
      where: { id: me.id },
      data: {
        ...(dto.username ? { username: dto.username } : {}),
        ...(dto.newPassword
          ? { passwordHash: await bcrypt.hash(dto.newPassword, 10) }
          : {}),
      },
    });
    return this.profile(me);
  }
}

@Controller('trainers')
class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  @Get()
  listPublic() {
    return this.trainers.list(true);
  }

  @UseGuards(AuthenticatedGuard)
  @TrainerAllowed()
  @Get('admin')
  listAll() {
    return this.trainers.listWithAccounts();
  }

  @UseGuards(AuthenticatedGuard)
  @TrainerAllowed()
  @Get('profile')
  profile(@Req() req: Request) {
    return this.trainers.profile(currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @TrainerAllowed()
  @Put('profile')
  updateProfile(@Req() req: Request, @Body() dto: ProfileDto) {
    return this.trainers.updateProfile(currentAdmin(req), dto);
  }

  @UseGuards(AuthenticatedGuard)
  @TrainerAllowed()
  @Put('profile/credentials')
  updateCredentials(@Req() req: Request, @Body() dto: CredentialsDto) {
    return this.trainers.updateCredentials(currentAdmin(req), dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('accounts')
  createAccount(@Body() dto: CreateTrainerAccountDto) {
    return this.trainers.createAccount(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertTrainerDto) {
    return this.trainers.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Post(':id/account')
  grantAccess(@Param('id', IdPipe) id: number, @Body() dto: GrantAccessDto) {
    return this.trainers.grantAccess(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id/account/password')
  resetPassword(
    @Param('id', IdPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.trainers.resetPassword(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id/account')
  revokeAccess(@Param('id', IdPipe) id: number) {
    return this.trainers.revokeAccess(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpsertTrainerDto) {
    return this.trainers.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number) {
    return this.trainers.remove(id);
  }
}

@Module({
  imports: [AuthModule],
  providers: [TrainersService],
  controllers: [TrainersController],
})
export class TrainersModule {}
