import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { NIGERIA_STATES, NIGERIA_SERVICES } from '@/modules/services/nigeria';
export class OperationsQuery {
  @IsOptional() @IsString() @Length(0, 120) q?: string;
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page: number =
    1;
}
export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}
export class ApprovalDto extends ReasonDto {
  @IsIn(NIGERIA_STATES) state!: string;
  @IsString() @Length(1, 60) city!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsIn(NIGERIA_SERVICES.map((s) => s.key), { each: true })
  services!: string[];
}
export class AssignmentDto extends ReasonDto {
  @IsUUID() providerId!: string;
}
