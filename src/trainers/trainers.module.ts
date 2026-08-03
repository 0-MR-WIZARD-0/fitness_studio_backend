import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';

class UpsertTrainerDto {
  @IsString() name: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoUrl?: string | null;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
class TrainersService {
  constructor(private readonly prisma: PrismaService) {}

  list(onlyActive = false) {
    return this.prisma.trainer.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
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
    await this.ensure(id);
    await this.prisma.trainer.delete({ where: { id } });
    return { ok: true };
  }

  private async ensure(id: number) {
    const found = await this.prisma.trainer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Тренер не найден');
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
  @Get('admin')
  listAll() {
    return this.trainers.list(false);
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertTrainerDto) {
    return this.trainers.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertTrainerDto) {
    return this.trainers.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.trainers.remove(id);
  }
}

@Module({
  providers: [TrainersService],
  controllers: [TrainersController],
})
export class TrainersModule {}
