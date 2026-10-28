import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { NIGERIA_STATES } from '../services/nigeria';
import { Transform } from 'class-transformer';

function Trim() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

export class ParcelAgentDto {
  @Trim() @IsString() @Length(3, 120) shopName!: string;
  @Trim() @IsString() @Length(5, 300) address!: string;
  @IsIn(NIGERIA_STATES) state!: string;
  @Trim() @IsString() @Length(2, 60) city!: string;
}

export class ParcelRouteDto {
  @IsUUID() destinationAgentId!: string;
  @IsInt() @Min(100) @Max(100_000_000) priceKobo!: number;
  @IsInt() @Min(100) @Max(50_000) maxWeightGrams!: number;
  @IsInt() @Min(1) @Max(336) estimatedHours!: number;
  @IsBoolean() homePickup!: boolean;
  @IsInt() @Min(0) @Max(10_000_000) homePickupFeeKobo!: number;
}

export class ParcelCreateDto {
  @IsUUID() routeId!: string;
  @IsUUID('4') clientReference!: string;
  @Trim() @IsString() @Length(2, 120) recipientName!: string;
  @Matches(/^(?:\+234|0)[789]\d{9}$/) recipientPhone!: string;
  @Trim() @IsString() @Length(5, 1000) description!: string;
  @IsIn(['GENERAL', 'TEXTILES', 'DOCUMENTS', 'DRY_GOODS', 'ELECTRONICS'])
  category!: string;
  @IsInt() @Min(100) @Max(50_000) weightGrams!: number;
  @IsIn(['SHOP_DROP_OFF', 'HOME_PICKUP']) pickupMode!: string;
  @ValidateIf(
    (v: ParcelCreateDto) =>
      v.pickupMode === 'HOME_PICKUP' || v.pickupAddress !== undefined,
  )
  @Trim()
  @IsString()
  @Length(5, 300)
  pickupAddress?: string;
  @Equals(true) permittedItemsConfirmed!: boolean;
  @Equals(true) quoteAccepted!: boolean;
  @IsInt() @Min(100) @Max(110_000_000) expectedPriceKobo!: number;
}

export class ParcelReasonDto {
  @Trim() @IsString() @Length(10, 500) reason!: string;
}

export class ParcelReviewDto extends ParcelReasonDto {
  @IsBoolean() approved!: boolean;
  @Trim() @IsString() @Length(3, 120) reviewReference!: string;
}

export class ParcelRouteReviewDto extends ParcelReasonDto {
  @IsBoolean() active!: boolean;
  @ValidateIf(
    (v: ParcelRouteReviewDto) => v.active || v.shopsConfirmed !== undefined,
  )
  @Equals(true)
  shopsConfirmed?: boolean;
  @ValidateIf(
    (v: ParcelRouteReviewDto) => v.active || v.pricingConfirmed !== undefined,
  )
  @Equals(true)
  pricingConfirmed?: boolean;
  @ValidateIf(
    (v: ParcelRouteReviewDto) => v.active || v.custodyConfirmed !== undefined,
  )
  @Equals(true)
  custodyConfirmed?: boolean;
  @ValidateIf(
    (v: ParcelRouteReviewDto) =>
      v.active || v.restrictionsConfirmed !== undefined,
  )
  @Equals(true)
  restrictionsConfirmed?: boolean;
}

export class ParcelCodeDto {
  @Matches(/^\d{6}$/) code!: string;
}

export class ParcelListQuery {
  @IsOptional() @IsIn(NIGERIA_STATES) state?: string;
  @Trim() @IsOptional() @IsString() @Length(2, 60) city?: string;
  @IsOptional() @IsIn(NIGERIA_STATES) destinationState?: string;
  @IsOptional() @IsUUID() before?: string;
}

export class ParcelMoveDto {
  @IsIn([
    'accept',
    'receive',
    'dispatch',
    'arrive',
    'return-dispatch',
    'return-arrive',
  ])
  action!: string;
  @Trim() @IsString() @Length(5, 500) note!: string;
}
