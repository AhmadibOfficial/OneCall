import { UserResponseDto } from '../dto/user-response.dto';

type UserResponseSource = {
  id: string;
  uid: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  createdAt: Date;
};

export class UserMapper {
  static toResponse(user: UserResponseSource): UserResponseDto {
    return {
      id: user.id,
      uid: user.uid,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
