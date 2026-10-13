import {
  IsEmail,
  MaxLength,
} from 'class-validator';

export class EmailVerificationRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
