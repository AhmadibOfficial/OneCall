import {
  IsEmail,
  IsMobilePhone,
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsMobilePhone()
  phone!: string;

  @IsString()
  @Length(8, 64)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  lastName!: string;
}
