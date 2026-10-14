import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class EmailVerificationConfirmDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  verificationToken!: string;
}
