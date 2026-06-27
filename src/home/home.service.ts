import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateHeroDto, UpsertFaqDto, UpsertStepDto } from './dto';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHero() {
    const hero = await this.prisma.homeHero.findFirst({
      orderBy: { id: 'asc' },
    });
    return hero ?? this.prisma.homeHero.create({ data: {} });
  }

  async updateHero(dto: UpdateHeroDto) {
    const hero = await this.getHero();
    return this.prisma.homeHero.update({
      where: { id: hero.id },
      data: { ...dto, spheres: dto.spheres as object | undefined },
    });
  }

  faqList(onlyActive = false) {
    return this.prisma.homeFaq.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { order: 'asc' },
    });
  }

  createFaq(dto: UpsertFaqDto) {
    return this.prisma.homeFaq.create({ data: dto });
  }

  async updateFaq(id: number, dto: UpsertFaqDto) {
    await this.ensureFaq(id);
    return this.prisma.homeFaq.update({ where: { id }, data: dto });
  }

  async removeFaq(id: number) {
    await this.ensureFaq(id);
    await this.prisma.homeFaq.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureFaq(id: number) {
    const found = await this.prisma.homeFaq.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Вопрос не найден');
  }

  stepList(onlyActive = false) {
    return this.prisma.homeStep.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { order: 'asc' },
    });
  }

  createStep(dto: UpsertStepDto) {
    return this.prisma.homeStep.create({ data: dto });
  }

  async updateStep(id: number, dto: UpsertStepDto) {
    await this.ensureStep(id);
    return this.prisma.homeStep.update({ where: { id }, data: dto });
  }

  async removeStep(id: number) {
    await this.ensureStep(id);
    await this.prisma.homeStep.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureStep(id: number) {
    const found = await this.prisma.homeStep.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Шаг не найден');
  }
}
