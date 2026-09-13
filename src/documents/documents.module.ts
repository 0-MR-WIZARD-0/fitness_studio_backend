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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join, normalize } from 'path';
import { randomBytes } from 'crypto';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../auth/guards';
import { IdPipe } from '../common/id.pipe';

const DOCS_FOLDER = 'Документы студии';
const DOCS_DIR = join('./uploads', DOCS_FOLDER);
const ALLOWED = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/)/;

class UpsertDocumentDto {
  @IsString() @IsNotEmpty({ message: 'Укажите название документа' })
  title: string;
  @IsString() @IsNotEmpty({ message: 'Загрузите файл документа' })
  fileUrl: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.studioDocument.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  listAll() {
    return this.prisma.studioDocument.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  create(dto: UpsertDocumentDto) {
    return this.prisma.studioDocument.create({
      data: {
        title: dto.title.trim(),
        fileUrl: dto.fileUrl,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: number, dto: UpsertDocumentDto) {
    const current = await this.ensure(id);
    if (current.fileUrl !== dto.fileUrl) this.removeFile(current.fileUrl);
    return this.prisma.studioDocument.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        fileUrl: dto.fileUrl,
        order: dto.order,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: number) {
    const current = await this.ensure(id);
    this.removeFile(current.fileUrl);
    await this.prisma.studioDocument.delete({ where: { id } });
    return { ok: true };
  }

  async ensureAccepted(acceptedIds: number[] = []) {
    const required = await this.listPublic();
    if (!required.length) return;
    const accepted = new Set(acceptedIds);
    const missing = required.filter((d) => !accepted.has(d.id));
    if (missing.length)
      throw new BadRequestException(
        `Подтвердите ознакомление с документами: ${missing
          .map((d) => d.title)
          .join(', ')}`,
      );
  }

  private removeFile(url: string) {
    if (!url) return;
    const rel = url.replace(/^\/uploads\//, '');
    const target = normalize(join('./uploads', decodeURIComponent(rel)));
    if (target.startsWith(normalize('./uploads')) && existsSync(target))
      unlinkSync(target);
  }

  private async ensure(id: number) {
    const found = await this.prisma.studioDocument.findUnique({
      where: { id },
    });
    if (!found) throw new NotFoundException('Документ не найден');
    return found;
  }
}

@Controller('documents')
class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  publicList() {
    return this.docs.listPublic();
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin')
  all() {
    return this.docs.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });
          cb(null, DOCS_DIR);
        },
        filename: (_req, file, cb) => {
          cb(
            null,
            `${Date.now()}-${randomBytes(6).toString('hex')}${extname(
              file.originalname,
            )}`,
          );
        },
      }),
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ALLOWED.test(file.mimetype);
        cb(
          ok
            ? null
            : new BadRequestException('Можно загрузить PDF, DOC/DOCX или картинку'),
          ok,
        );
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не передан');
    return {
      url: `/uploads/${encodeURIComponent(DOCS_FOLDER)}/${file.filename}`,
    };
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertDocumentDto) {
    return this.docs.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpsertDocumentDto,
  ) {
    return this.docs.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number) {
    return this.docs.remove(id);
  }
}

@Module({
  providers: [DocumentsService],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
