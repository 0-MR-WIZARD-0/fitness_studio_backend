import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateHeroDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() spheres?: unknown;
}

export class UpsertFaqDto {
  @IsString() question: string;
  @IsString() answer: string;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertStepDto {
  @IsOptional() @IsString() label?: string;
  @IsString() title: string;
  @IsString() description: string;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReorderDto {
  @IsArray() ids: number[];
}
