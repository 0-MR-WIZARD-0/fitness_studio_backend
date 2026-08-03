import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForWhomItemDto, MechanismDto, UpsertFormatDto } from './dto';

@Injectable()
export class FormatsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.format.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  listAll() {
    return this.prisma.format.findMany({ orderBy: { order: 'asc' } });
  }

  async getBySlug(slug: string) {
    const format = await this.prisma.format.findUnique({
      where: { slug },
      include: {
        forWhom: { orderBy: { order: 'asc' } },
        mechanisms: { orderBy: { order: 'asc' } },
      },
    });
    if (!format) throw new NotFoundException('Формат не найден');
    return format;
  }

  async getById(id: number) {
    const format = await this.prisma.format.findUnique({
      where: { id },
      include: {
        forWhom: { orderBy: { order: 'asc' } },
        mechanisms: { orderBy: { order: 'asc' } },
      },
    });
    if (!format) throw new NotFoundException('Формат не найден');
    return format;
  }

  async create(dto: UpsertFormatDto) {
    await this.ensureSlugFree(dto.slug);
    return this.prisma.format.create({
      data: {
        ...this.scalars(dto),
        forWhom: { create: this.forWhomCreate(dto.forWhom) },
        mechanisms: { create: this.mechanismsCreate(dto.mechanisms) },
      },
      include: { forWhom: true, mechanisms: true },
    });
  }

  async update(id: number, dto: UpsertFormatDto) {
    await this.getById(id);
    if (dto.slug) await this.ensureSlugFree(dto.slug, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.forWhom) {
        await tx.forWhomItem.deleteMany({ where: { formatId: id } });
      }
      if (dto.mechanisms) {
        await tx.howItWorksStep.deleteMany({ where: { formatId: id } });
      }
      return tx.format.update({
        where: { id },
        data: {
          ...this.scalars(dto),
          ...(dto.forWhom
            ? { forWhom: { create: this.forWhomCreate(dto.forWhom) } }
            : {}),
          ...(dto.mechanisms
            ? { mechanisms: { create: this.mechanismsCreate(dto.mechanisms) } }
            : {}),
        },
        include: { forWhom: true, mechanisms: true },
      });
    });
  }

  async remove(id: number) {
    await this.getById(id);
    await this.prisma.format.delete({ where: { id } });
    return { ok: true };
  }

  private scalars(dto: UpsertFormatDto) {
    return {
      slug: dto.slug,
      name: dto.name,
      subtitle: dto.subtitle,
      miniResults: dto.miniResults,
      previewImageUrl: dto.previewImageUrl,
      heroImageUrl: dto.heroImageUrl,
      pricePerSession: dto.pricePerSession,
      priceCourse: dto.priceCourse,
      durationMin: dto.durationMin,
      order: dto.order,
      isActive: dto.isActive,
    };
  }

  private forWhomCreate(items?: ForWhomItemDto[]) {
    return (items ?? []).map((it, i) => ({
      title: it.title,
      description: it.description,
      order: it.order ?? i + 1,
    }));
  }

  private mechanismsCreate(items?: MechanismDto[]) {
    return (items ?? []).map((it, i) => ({
      number: it.number ?? i + 1,
      title: it.title,
      bullets: it.bullets,
      imageUrl: it.imageUrl,
      order: it.order ?? i + 1,
    }));
  }

  private async ensureSlugFree(slug: string, exceptId?: number) {
    const existing = await this.prisma.format.findUnique({ where: { slug } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Формат с таким slug уже существует');
    }
  }
}
