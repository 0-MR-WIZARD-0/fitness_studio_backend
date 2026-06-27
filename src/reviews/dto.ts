import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MediaType, ReviewStatus } from '../generated/prisma/enums';

export class CreateReviewDto {
  @IsString() @IsNotEmpty({ message: 'Укажите имя' }) authorName: string;
  @IsString() @IsNotEmpty({ message: 'Напишите текст отзыва' }) text: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsEnum(MediaType) mediaType?: MediaType;
}

export class ModerateReviewDto {
  @IsEnum(ReviewStatus) status: ReviewStatus;
}
