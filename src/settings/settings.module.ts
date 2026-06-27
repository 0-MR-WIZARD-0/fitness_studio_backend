import { Module } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  Injectable,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';

class UpdateSettingsDto {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsInt() @Min(1) courseThreshold?: number;
}

@Injectable()
class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  }

  update(dto: UpdateSettingsDto) {
    return this.prisma.siteSettings.upsert({
      where: { id: 1 },
      update: dto,
      create: { id: 1, ...dto },
    });
  }
}

@Controller('settings')
class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @UseGuards(AuthenticatedGuard)
  @Put()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}

@Module({
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
