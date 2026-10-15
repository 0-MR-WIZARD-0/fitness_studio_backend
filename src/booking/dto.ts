import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSlotDto {
  @IsOptional() @IsInt() formatId?: number;
  @IsOptional() @IsInt() trainerId?: number | null;
  @IsOptional() @IsInt() hallId?: number | null;
  @IsDateString() startsAt: string;
  @IsOptional() @IsInt() durationMin?: number;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsBoolean() isDiagnostic?: boolean;
}

export class CreateWeekdaySlotsDto {
  @IsOptional() @IsInt() formatId?: number;
  @IsOptional() @IsInt() trainerId?: number | null;
  @IsOptional() @IsInt() hallId?: number | null;
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

export class MoveClientBookingDto {
  @IsInt() slotId: number;
}

export class RemoveSlotDto {
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsBoolean() notified?: boolean;
}

export class SingleBookingDto {
  @IsInt() slotId: number;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) documentIds?: number[];
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
}

export class CartServiceDto {
  @IsInt() serviceId: number;
  @IsOptional()
  @IsIn(['single', 'week', 'month'])
  period?: 'single' | 'week' | 'month';
}

export class CartBookingDto {
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) slotIds: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) documentIds?: number[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartServiceDto)
  services?: CartServiceDto[];
}

export class AnnouncementBookingDto {
  @IsInt() announcementId: number;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) documentIds?: number[];
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
}
