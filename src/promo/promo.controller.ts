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
import { IsDateString, IsString } from 'class-validator';
import { AuthenticatedGuard } from '../auth/guards';
import { PromoService } from './promo.service';

class ValidateDto {
  @IsString() code: string;
}

class UpdateExpiryDto {
  @IsDateString() expiresAt: string;
}

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
  generate() {
    return this.promo.create();
  }

  @UseGuards(AuthenticatedGuard)
  @Put(':id/expiry')
  updateExpiry(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpiryDto,
  ) {
    return this.promo.updateExpiry(id, dto.expiresAt);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.promo.remove(id);
  }
}
