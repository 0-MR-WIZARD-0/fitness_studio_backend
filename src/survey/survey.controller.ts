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
import { SurveyService } from './survey.service';
import { ImportConditionsDto, UpsertConditionDto } from './dto';

@Controller('survey')
export class SurveyController {
  constructor(private readonly survey: SurveyService) {}

  @Get('conditions')
  listPublic() {
    return this.survey.list(true);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/conditions')
  listAll() {
    return this.survey.list(false);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('conditions')
  create(@Body() dto: UpsertConditionDto) {
    return this.survey.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('conditions/import')
  import(@Body() dto: ImportConditionsDto) {
    return this.survey.importMany(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('conditions/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertConditionDto,
  ) {
    return this.survey.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('conditions/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.survey.remove(id);
  }
}
