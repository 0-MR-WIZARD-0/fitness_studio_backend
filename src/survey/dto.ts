import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { RiskLevel } from '../generated/prisma/enums';

export class ConditionRuleDto {
  @IsInt() formatId: number;
  @IsEnum(RiskLevel) risk: RiskLevel;
  @IsOptional() @IsString() note?: string;
}

export class UpsertConditionDto {
  @IsString() name: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionRuleDto)
  rules?: ConditionRuleDto[];
}

export class ImportConditionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpsertConditionDto)
  items: UpsertConditionDto[];
}
