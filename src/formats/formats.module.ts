import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormatsService } from './formats.service';
import { FormatsController } from './formats.controller';

@Module({
  imports: [AuthModule],
  providers: [FormatsService],
  controllers: [FormatsController],
})
export class FormatsModule {}
