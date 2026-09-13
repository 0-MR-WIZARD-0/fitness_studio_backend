import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { PromoModule } from '../promo/promo.module';
import { AuthModule } from '../auth/auth.module';
import { RentModule } from '../rent/rent.module';
import { AccountModule } from '../account/account.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PromoModule, AuthModule, RentModule, AccountModule, DocumentsModule],
  providers: [BookingService],
  controllers: [BookingController],
})
export class BookingModule {}
