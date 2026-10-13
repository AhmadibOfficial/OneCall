import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class PhoneVerificationConfirmDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  selector!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'Verification code must be 6 digits',
  })
  verificationCode!: string;
}
