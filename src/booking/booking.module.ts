import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [PromoModule],
  providers: [BookingService],
  controllers: [BookingController],
})
export class BookingModule {}
