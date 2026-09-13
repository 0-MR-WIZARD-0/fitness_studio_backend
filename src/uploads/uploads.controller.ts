import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join, normalize } from 'path';
import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { IsString } from 'class-validator';
import { AuthenticatedGuard } from '../auth/guards';
import { RateLimit } from '../common/rate-limit.guard';

const UPLOAD_ROOT = './uploads';
const FOLDERS = [
  'hero',
  'faq',
  'steps',
  'formats',
  'mechanisms',
  'announcements',
  'reviews',
  'trainers',
  'studio',
  'misc',
];

function safeFolder(folder?: string): string {
  return folder && FOLDERS.includes(folder) ? folder : 'misc';
}

class DeleteDto {
  @IsString() url: string;
}

function folderFor(req: Request): string {
  const isAdmin = req.isAuthenticated?.() ?? false;
  return isAdmin ? safeFolder(req.query.folder as string | undefined) : 'reviews';
}

@Controller('uploads')
export class UploadsController {
  @UseGuards(RateLimit(10, 10 * 60_000, 'Слишком много загрузок'))
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: Request, _file, cb) => {
          const folder = folderFor(req);
          const dir = join(UPLOAD_ROOT, folder);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = randomBytes(8).toString('hex');
          cb(null, `${Date.now()}-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /^(image\/|video\/)/.test(file.mimetype);
        cb(
          ok ? null : new BadRequestException('Только изображения или видео'),
          ok,
        );
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): { url: string; mediaType: 'IMAGE' | 'VIDEO' } {
    if (!file) throw new BadRequestException('Файл не передан');
    return {
      url: `/uploads/${folderFor(req)}/${file.filename}`,
      mediaType: file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
    };
  }

  @UseGuards(AuthenticatedGuard)
  @Delete()
  remove(@Body() dto: DeleteDto): { ok: true } {
    const rel = dto.url.replace(/^\/uploads\//, '');
    const target = normalize(join(UPLOAD_ROOT, rel));
    if (!target.startsWith(normalize(UPLOAD_ROOT))) {
      throw new BadRequestException('Недопустимый путь');
    }
    if (existsSync(target)) unlinkSync(target);
    return { ok: true };
  }
}
