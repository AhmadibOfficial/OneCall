export class UserResponseDto {
  id !: string;

  uid !: string;

  email !: string;

  phone !: string;

  firstName !: string;

  lastName !: string;

  avatarUrl? : string | null;

  emailVerified !: boolean;

  phoneVerified !: boolean;

  status !: string;

  createdAt !: Date;
}