export type RegistrationUserResponse = {
  id: string;
  uid: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  createdAt: Date;
};

export type LoginUserResponse = {
  id: string;
  uid: string;
  email: string;
  status: string;
};

type RegistrationUserInput = {
  id: string;
  uid: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  createdAt: Date;
};

type LoginUserInput = {
  id: string;
  uid: string;
  email: string;
  status: string;
};

export function toRegistrationUserResponse(
  user: RegistrationUserInput,
): RegistrationUserResponse {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    status: user.status,
    createdAt: user.createdAt,
  };
}

export function toLoginUserResponse(
  user: LoginUserInput,
): LoginUserResponse {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    status: user.status,
  };
}
