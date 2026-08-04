import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ForWhomItemDto {
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsInt() order?: number;
}

export class MechanismDto {
  @IsOptional() @IsInt() number?: number;
  @IsString() title: string;
  @IsArray() @IsString({ each: true }) bullets: string[];
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsInt() order?: number;
}

export class UpsertFormatDto {
  @IsString() slug: string;
  @IsString() name: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) miniResults?: string[];
  @IsOptional() @IsString() previewImageUrl?: string | null;
  @IsOptional() @IsString() heroImageUrl?: string | null;
  @IsOptional() @IsInt() pricePerSession?: number;
  @IsOptional() @IsInt() @Min(5) durationMin?: number;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ForWhomItemDto)
  forWhom?: ForWhomItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MechanismDto)
  mechanisms?: MechanismDto[];
}
