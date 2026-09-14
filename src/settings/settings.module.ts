import { Module } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, normalize } from 'path';
import { randomBytes } from 'crypto';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';
import { RentModule, RentService } from '../rent/rent.module';

const AGREEMENT_FOLDER = 'Пользовательское соглашение';
const AGREEMENT_DIR = join('./uploads', AGREEMENT_FOLDER);

class UpdateSettingsDto {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsInt() @Min(1) courseThreshold?: number;
  @IsOptional() @IsInt() @Min(0) pricePerSession?: number;
  @IsOptional() @IsInt() @Min(0) priceCourse?: number;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() maxUrl?: string;
  @IsOptional() @IsInt() @Min(0) rentPricePerHour?: number;
  @IsOptional() @IsString() rentDayStart?: string;
  @IsOptional() @IsString() rentDayEnd?: string;
  @IsOptional() @IsInt() @Min(0) rentBufferMin?: number;
  @IsOptional() @IsInt() @Min(0) bookingEditHours?: number;
  @IsOptional() @IsInt() @Min(0) courseCancelHours?: number;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) mapLat?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) mapLng?: number | null;
}

@Injectable()
class SettingsService {
  private readonly log = new Logger('Settings');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rent: RentService,
  ) {}

  get() {
    return this.prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  }

  private async geocode(address: string) {
    const query = address.trim();
    if (!query) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
        query,
      )}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'fitstudio.website/1.0 (studio map pin)' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const found = (await res.json()) as { lat?: string; lon?: string }[];
      const lat = Number(found?.[0]?.lat);
      const lng = Number(found?.[0]?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      this.log.warn(`Не удалось определить координаты для «${query}»`);
      return null;
    }
  }

  async update(dto: UpdateSettingsDto) {
    const before = await this.get();
    const data = { ...dto };
    const movedPoint =
      (dto.mapLat !== undefined && dto.mapLat !== before.mapLat) ||
      (dto.mapLng !== undefined && dto.mapLng !== before.mapLng);
    if (!movedPoint && dto.address && dto.address !== before.address) {
      const point = await this.geocode(dto.address);
      if (point) {
        data.mapLat = point.lat;
        data.mapLng = point.lng;
      }
    }

    const saved = await this.prisma.siteSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    const touchesRent =
      dto.rentPricePerHour !== undefined ||
      dto.rentDayStart !== undefined ||
      dto.rentDayEnd !== undefined ||
      dto.rentBufferMin !== undefined;
    if (touchesRent) await this.rent.syncRange();
    return saved;
  }

  setAgreement(url: string) {
    return this.prisma.siteSettings.upsert({
      where: { id: 1 },
      update: { userAgreementUrl: url },
      create: { id: 1, userAgreementUrl: url },
    });
  }

  private removeFile(url: string) {
    if (!url) return;
    const rel = url.replace(/^\/uploads\//, '');
    const target = normalize(join('./uploads', decodeURIComponent(rel)));
    if (target.startsWith(normalize('./uploads')) && existsSync(target)) {
      unlinkSync(target);
    }
  }

  async replaceAgreement(filename: string) {
    const current = await this.get();
    this.removeFile(current.userAgreementUrl);
    const url = `/uploads/${encodeURIComponent(AGREEMENT_FOLDER)}/${filename}`;
    return this.setAgreement(url);
  }

  async clearAgreement() {
    const current = await this.get();
    this.removeFile(current.userAgreementUrl);
    return this.setAgreement('');
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

  @UseGuards(AuthenticatedGuard)
  @Post('agreement')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(AGREEMENT_DIR)) {
            mkdirSync(AGREEMENT_DIR, { recursive: true });
          }
          cb(null, AGREEMENT_DIR);
        },
        filename: (_req, _file, cb) => {
          cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}.pdf`);
        },
      }),
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = file.mimetype === 'application/pdf';
        cb(
          ok ? null : new BadRequestException('Можно загрузить только PDF'),
          ok,
        );
      },
    }),
  )
  uploadAgreement(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не передан');
    return this.settings.replaceAgreement(file.filename);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('agreement')
  deleteAgreement() {
    return this.settings.clearAgreement();
  }
}

@Module({
  imports: [RentModule],
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
