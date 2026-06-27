import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards';
import { HomeService } from './home.service';
import { UpdateHeroDto, UpsertFaqDto, UpsertStepDto } from './dto';

@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('hero')
  getHero() {
    return this.home.getHero();
  }

  @Get('faq')
  faqPublic() {
    return this.home.faqList(true);
  }

  @Get('steps')
  stepsPublic() {
    return this.home.stepList(true);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('hero')
  updateHero(@Body() dto: UpdateHeroDto) {
    return this.home.updateHero(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/faq')
  faqAll() {
    return this.home.faqList(false);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('faq')
  createFaq(@Body() dto: UpsertFaqDto) {
    return this.home.createFaq(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('faq/:id')
  updateFaq(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertFaqDto) {
    return this.home.updateFaq(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('faq/:id')
  removeFaq(@Param('id', ParseIntPipe) id: number) {
    return this.home.removeFaq(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/steps')
  stepsAll() {
    return this.home.stepList(false);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('steps')
  createStep(@Body() dto: UpsertStepDto) {
    return this.home.createStep(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('steps/:id')
  updateStep(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertStepDto,
  ) {
    return this.home.updateStep(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('steps/:id')
  removeStep(@Param('id', ParseIntPipe) id: number) {
    return this.home.removeStep(id);
  }
}
