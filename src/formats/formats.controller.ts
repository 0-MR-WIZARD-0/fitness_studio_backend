import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString } from 'class-validator';
import {
  AuthenticatedGuard,
  TrainerAllowed,
  currentAdmin,
} from '../auth/guards';
import { FormatsService } from './formats.service';
import { UpsertFormatDto } from './dto';
import { IdPipe } from '../common/id.pipe';

class RemoveFormatDto {
  @IsString() password: string;
}

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
  @TrainerAllowed()
  @Get('admin/all')
  all() {
    return this.formats.listAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/:id')
  byId(@Param('id', IdPipe) id: number) {
    return this.formats.getById(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  create(@Body() dto: UpsertFormatDto) {
    return this.formats.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpsertFormatDto) {
    return this.formats.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(
    @Param('id', IdPipe) id: number,
    @Body() dto: RemoveFormatDto,
    @Req() req: Request,
  ) {
    return this.formats.remove(id, currentAdmin(req).id, dto.password);
  }
}
