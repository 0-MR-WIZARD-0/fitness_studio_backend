import { Module } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
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
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';

const AGREEMENT_FOLDER = 'Пользовательское соглашение';
const AGREEMENT_DIR = join('./uploads', AGREEMENT_FOLDER);

class UpdateSettingsDto {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsInt() @Min(1) courseThreshold?: number;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() maxUrl?: string;
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
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
