import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { PromoModule } from '../promo/promo.module';
import { AuthModule } from '../auth/auth.module';
import { RentModule } from '../rent/rent.module';

@Module({
  imports: [PromoModule, AuthModule, RentModule],
  providers: [BookingService],
  controllers: [BookingController],
})
export class BookingModule {}
