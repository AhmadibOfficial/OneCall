import {
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';
export class SocialChallengeDto {
  @IsOptional() @IsBoolean() browser?: boolean;
  @IsIn(['google', 'apple']) provider!: 'google' | 'apple';
}
export class SocialExchangeDto extends SocialChallengeDto {
  @IsString() @MaxLength(160) challenge!: string;
  @IsString() @MaxLength(8192) @MinLength(20) idToken!: string;
  @IsOptional() @IsString() @MaxLength(4096) authorizationCode?: string;
}
export class SocialCompleteDto {
  @IsString() @MaxLength(8192) ticket!: string;
  @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @IsString() @Matches(/^\+234[789]\d{9}$/) phone!: string;
}

export class SocialUnlinkDto extends SocialChallengeDto {
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class SocialResultDto {
  @IsString() @MaxLength(160) challenge!: string;
}

export class AppleNotificationDto {
  @IsString() @MaxLength(8192) payload!: string;
}
