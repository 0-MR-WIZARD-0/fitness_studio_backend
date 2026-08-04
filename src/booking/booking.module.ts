import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { PromoModule } from '../promo/promo.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PromoModule, AuthModule],
  providers: [BookingService],
  controllers: [BookingController],
})
export class BookingModule {}
