import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NIGERIA_STATES, SERVICE_NAMES } from '@/modules/services/nigeria';

export class AddressDto {
  @IsString() @IsNotEmpty() @MaxLength(60) label!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) addressLine1!: string;
  @IsOptional() @IsString() @MaxLength(120) landmark?: string;
  @IsOptional() @IsString() @MaxLength(80) lga?: string;
  @IsString() @IsNotEmpty() @MaxLength(60) city!: string;
  @IsIn(NIGERIA_STATES) state!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class ProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) lastName!: string;
}
export class FavoriteDto {
  @IsIn(SERVICE_NAMES) serviceName!: string;
}
export class ProviderApplicationDto {
  @IsString() @IsNotEmpty() @MaxLength(120) displayName!: string;
  @IsIn(NIGERIA_STATES) state!: string;
  @IsString() @IsNotEmpty() @MaxLength(60) city!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsIn(SERVICE_NAMES, { each: true })
  serviceNames!: string[];
  @IsOptional() @IsString() @MaxLength(160) vehicleDescription?: string;
}
export class QuoteDto {
  @IsString() @Matches(/^[1-9]\d{0,6}(?:\.\d{1,2})?$/) amount!: string;
}
export class QuoteAcceptanceDto {
  @IsUUID() quoteId!: string;
}
export class LocationDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10000)
  accuracy!: number;
}
export class MessageDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) text!: string;
}
export class IdempotencyDto {
  @IsString() @Matches(/^[A-Za-z0-9._:-]{8,128}$/) idempotencyKey!: string;
}
export class CheckoutDto extends IdempotencyDto {
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,6}(?:\.\d{1,2})?$/)
  amount?: string;
}

export class SupportDto {
  @IsString() @IsNotEmpty() @MaxLength(120) subject!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) message!: string;
}
