import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewStatus } from '../generated/prisma/enums';
import { CreateReviewDto, ModerateReviewDto } from './dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  listApproved() {
    return this.prisma.review.findMany({
      where: { status: ReviewStatus.APPROVED },
      orderBy: { createdAt: 'desc' },
    });
  }

  submit(dto: CreateReviewDto) {
    return this.prisma.review.create({
      data: { ...dto, status: ReviewStatus.PENDING },
    });
  }

  listAll(status?: ReviewStatus) {
    return this.prisma.review.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async moderate(id: number, dto: ModerateReviewDto) {
    await this.ensure(id);
    return this.prisma.review.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async remove(id: number) {
    await this.ensure(id);
    await this.prisma.review.delete({ where: { id } });
    return { ok: true };
  }

  private async ensure(id: number) {
    const found = await this.prisma.review.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Отзыв не найден');
  }
}
