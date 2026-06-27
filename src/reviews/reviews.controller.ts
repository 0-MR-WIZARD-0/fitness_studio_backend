import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ModerateReviewDto } from './dto';
import { ReviewStatus } from '../generated/prisma/enums';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  approved() {
    return this.reviews.listApproved();
  }

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
  moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviews.moderate(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.reviews.remove(id);
  }
}
