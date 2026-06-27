import { Module } from '@nestjs/common';
import { FormatsService } from './formats.service';
import { FormatsController } from './formats.controller';

@Module({
  providers: [FormatsService],
  controllers: [FormatsController],
})
export class FormatsModule {}
