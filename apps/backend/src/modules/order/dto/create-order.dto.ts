import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NIGERIA_STATES } from '@/modules/services/nigeria';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  serviceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address?: string;

  @IsOptional() @IsIn(NIGERIA_STATES) state?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60) city?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  pickupAddress?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  destinationAddress?: string;
  @IsOptional() @IsISO8601({ strict: true }) scheduledAt?: string;
  @IsOptional() @IsIn(['economy', 'comfort']) vehicleType?: string;
}
