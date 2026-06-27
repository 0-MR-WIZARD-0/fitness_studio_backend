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
import { FormatsService } from './formats.service';
import { UpsertFormatDto } from './dto';

@Controller('formats')
export class FormatsController {
  constructor(private readonly formats: FormatsService) {}

  @Get()
  list() {
    return this.formats.listPublic();
  }

  @Get('slug/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.formats.getBySlug(slug);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/all')
  all() {
    return this.formats.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/:id')
  byId(@Param('id', ParseIntPipe) id: number) {
    return this.formats.getById(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertFormatDto) {
    return this.formats.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertFormatDto) {
    return this.formats.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.formats.remove(id);
  }
}
