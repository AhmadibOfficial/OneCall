import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ReasonDto } from './operations.dto';
import { STAFF_ROLES } from './management.permissions';
export class ManagementQuery {
  @IsOptional() @IsString() @Length(0, 120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
}
export class StaffDto extends ReasonDto {
  @Matches(/^\d{10}$/) uid!: string;
  @IsIn(Object.keys(STAFF_ROLES)) role!: string;
  @IsBoolean() enabled!: boolean;
  @IsString() @Length(8, 128) password!: string;
}
export class CaseDto extends ReasonDto {
  @IsIn(['OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED']) status!: string;
  @IsIn(['NORMAL', 'HIGH', 'URGENT']) priority!: string;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() @Length(1, 2000) response?: string;
}
export class ScheduleDto extends ReasonDto {
  @IsISO8601() scheduledAt!: string;
}
export class CatalogueDto extends ReasonDto {
  @IsString() @Length(1, 500) description!: string;
  @IsBoolean() enabled!: boolean;
}

export class AvailabilityDto extends ReasonDto {
  @IsBoolean() available!: boolean;
}
