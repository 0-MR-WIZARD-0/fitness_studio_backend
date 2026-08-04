import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateSlotDto {
  @IsOptional() @IsInt() formatId?: number;
  @IsOptional() @IsInt() trainerId?: number | null;
  @IsDateString() startsAt: string;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsBoolean() isDiagnostic?: boolean;
}

export class CreateWeekdaySlotsDto {
  @IsOptional() @IsInt() formatId?: number;
  @IsOptional() @IsInt() trainerId?: number | null;
  @Matches(/^\d{2}:\d{2}$/, { message: 'Время в формате HH:MM' })
  time: string;
  @IsInt() @Min(1) weeks: number;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsBoolean() isDiagnostic?: boolean;
}

export class UpdateSlotDto {
  @IsDateString() startsAt: string;
  @IsOptional() @IsInt() trainerId?: number | null;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsBoolean() notified?: boolean;
}

export class SingleBookingDto {
  @IsInt() slotId: number;
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
  @IsString() @IsNotEmpty({ message: 'Укажите телефон' }) phone: string;
  @IsEmail({}, { message: 'Укажите корректный email' }) email: string;
  @IsOptional() @IsString() promoCode?: string;
}

export class CartBookingDto {
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) slotIds: number[];
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
  @IsString() @IsNotEmpty({ message: 'Укажите телефон' }) phone: string;
  @IsEmail({}, { message: 'Укажите корректный email' }) email: string;
}

export class AnnouncementBookingDto {
  @IsInt() announcementId: number;
  @IsString() @IsNotEmpty({ message: 'Укажите ФИО' }) name: string;
  @IsString() @IsNotEmpty({ message: 'Укажите телефон' }) phone: string;
  @IsEmail({}, { message: 'Укажите корректный email' }) email: string;
  @IsOptional() @IsString() promoCode?: string;
}
