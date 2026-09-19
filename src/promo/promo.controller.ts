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
import { IsDateString, IsString } from 'class-validator';
import {
  AuthenticatedGuard,
  TrainerAllowed,
  currentAdmin,
} from '../auth/guards';
import { PromoService } from './promo.service';
import { IdPipe } from '../common/id.pipe';

class ValidateDto {
  @IsString() code: string;
}

class UpdateExpiryDto {
  @IsDateString() expiresAt: string;
}

@TrainerAllowed()
@Controller('promo')
export class PromoController {
  constructor(private readonly promo: PromoService) {}

  @Post('validate')
  async validate(@Body() dto: ValidateDto) {
    const promo = await this.promo.validate(dto.code);
    return promo ? { valid: true, kind: promo.kind } : { valid: false };
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin')
  list() {
    return this.promo.list();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('generate')
  generate(@Req() req: Request) {
    return this.promo.create(currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id/expiry')
  updateExpiry(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpdateExpiryDto,
    @Req() req: Request,
  ) {
    return this.promo.updateExpiry(id, dto.expiresAt, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', IdPipe) id: number, @Req() req: Request) {
    return this.promo.remove(id, currentAdmin(req));
  }
}
