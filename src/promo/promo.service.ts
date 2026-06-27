import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PromoKind } from '../generated/prisma/enums';

const PROMO_TTL_DAYS = 30;

@Injectable()
export class PromoService {
  constructor(private readonly prisma: PrismaService) {}

  private genCode(): string {
    const part = randomBytes(4)
      .toString('hex')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    return `TRIO-${part}`;
  }

  private defaultExpiry(): Date {
    const d = new Date();
    d.setDate(d.getDate() + PROMO_TTL_DAYS);
    return d;
  }

  async create() {
    for (let i = 0; i < 5; i++) {
      const code = this.genCode();
      const exists = await this.prisma.promoCode.findUnique({
        where: { code },
      });
      if (!exists)
        return this.prisma.promoCode.create({
          data: { code, expiresAt: this.defaultExpiry() },
        });
    }
    throw new Error('Не удалось сгенерировать промокод');
  }

  async createGift(data: { name: string; phone: string; email?: string }) {
    for (let i = 0; i < 5; i++) {
      const code = this.genCode();
      const exists = await this.prisma.promoCode.findUnique({
        where: { code },
      });
      if (!exists)
        return this.prisma.promoCode.create({
          data: {
            code,
            kind: PromoKind.GIFT,
            expiresAt: this.defaultExpiry(),
            ...data,
          },
        });
    }
    throw new Error('Не удалось сгенерировать промокод');
  }

  list() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updateExpiry(id: number, expiresAt: string) {
    await this.ensure(id);
    return this.prisma.promoCode.update({
      where: { id },
      data: { expiresAt: new Date(expiresAt) },
    });
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.promoCode.delete({ where: { id } });
    return { ok: true };
  }

  async validate(code: string) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.trim() },
    });
    if (!promo || promo.isUsed) return null;
    if (promo.expiresAt.getTime() < Date.now()) return null;
    return promo;
  }

  @Cron('5 0 * * *')
  async cleanupExpired() {
    const res = await this.prisma.promoCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (res.count)
      new Logger('Promo').log(`Удалено истёкших промокодов: ${res.count}`);
  }

  private async ensure(id: number) {
    const found = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Промокод не найден');
  }
}
