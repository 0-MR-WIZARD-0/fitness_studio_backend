import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConditionRuleDto,
  ImportConditionsDto,
  UpsertConditionDto,
} from './dto';

@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

  list(onlyActive = false) {
    return this.prisma.condition.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      include: { rules: true },
    });
  }

  create(dto: UpsertConditionDto) {
    return this.prisma.condition.create({
      data: {
        name: dto.name,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        rules: { create: this.rulesCreate(dto.rules) },
      },
      include: { rules: true },
    });
  }

  async update(id: number, dto: UpsertConditionDto) {
    await this.ensure(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.rules) {
        await tx.conditionRule.deleteMany({ where: { conditionId: id } });
      }
      return tx.condition.update({
        where: { id },
        data: {
          name: dto.name,
          order: dto.order,
          isActive: dto.isActive,
          ...(dto.rules ? { rules: { create: this.rulesCreate(dto.rules) } } : {}),
        },
        include: { rules: true },
      });
    });
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.condition.delete({ where: { id } });
    return { ok: true };
  }

  async importMany(dto: ImportConditionsDto) {
    let created = 0;
    let updated = 0;
    for (const [i, item] of dto.items.entries()) {
      const existing = await this.prisma.condition.findUnique({
        where: { name: item.name },
      });
      if (existing) {
        await this.update(existing.id, { ...item, order: item.order ?? i + 1 });
        updated += 1;
      } else {
        await this.create({ ...item, order: item.order ?? i + 1 });
        created += 1;
      }
    }
    return { created, updated };
  }

  private rulesCreate(rules?: ConditionRuleDto[]) {
    const byFormat = new Map<number, ConditionRuleDto>();
    for (const rule of rules ?? []) byFormat.set(rule.formatId, rule);
    return [...byFormat.values()].map((rule) => ({
      formatId: rule.formatId,
      risk: rule.risk,
      note: rule.note ?? '',
    }));
  }

  private async ensure(id: number) {
    const found = await this.prisma.condition.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Состояние не найдено');
  }
}
