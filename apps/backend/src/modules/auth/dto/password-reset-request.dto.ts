import {
  IsEmail,
  MaxLength,
} from 'class-validator';

export class PasswordResetRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
