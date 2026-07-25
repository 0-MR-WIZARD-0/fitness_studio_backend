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
  ],
})
export class AppModule {}
