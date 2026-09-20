import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HomeModule } from './home/home.module';
import { FormatsModule } from './formats/formats.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BookingModule } from './booking/booking.module';
import { SettingsModule } from './settings/settings.module';
import { UploadsModule } from './uploads/uploads.module';
import { PromoModule } from './promo/promo.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { MailModule } from './mail/mail.module';
import { SurveyModule } from './survey/survey.module';
import { TrainersModule } from './trainers/trainers.module';
import { RentModule } from './rent/rent.module';
import { AccountModule } from './account/account.module';
import { DocumentsModule } from './documents/documents.module';
import { ServicesModule } from './services/services.module';
import { HallsModule } from './halls/halls.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AuthModule,
    HomeModule,
    FormatsModule,
    ReviewsModule,
    BookingModule,
    SettingsModule,
    UploadsModule,
    PromoModule,
    AnnouncementsModule,
    MailModule,
    SurveyModule,
    TrainersModule,
    RentModule,
    AccountModule,
    DocumentsModule,
    ServicesModule,
    HallsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
