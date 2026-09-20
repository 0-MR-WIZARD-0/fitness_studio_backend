import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard, TrainerAllowed } from '../auth/guards';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ModerateReviewDto } from './dto';
import { ReviewStatus } from '../generated/prisma/enums';
import { IdPipe } from '../common/id.pipe';
import { RateLimit } from '../common/rate-limit.guard';

@TrainerAllowed()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  approved() {
    return this.reviews.listApproved();
  }

  @UseGuards(RateLimit(1, 24 * 60 * 60_000, 'Отзыв можно оставить раз в сутки'))
  @Post()
  submit(@Body() dto: CreateReviewDto) {
    return this.reviews.submit(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/all')
  all(@Query('status') status?: ReviewStatus) {
    return this.reviews.listAll(status);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id/status')
  moderate(@Param('id', IdPipe) id: number, @Body() dto: ModerateReviewDto) {
    return this.reviews.moderate(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number) {
    return this.reviews.remove(id);
  }
}
