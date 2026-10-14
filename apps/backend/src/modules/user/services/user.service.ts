import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IdService } from '@/common/id';

import { UserMapper } from '../mappers/user.mapper';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly idService: IdService,
  ) {}

  findAuthUserById(id: string) {
    return this.userRepository.findAuthUserById(id);
  }

  async findById(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user || user.deletedAt || user.status === 'SUSPENDED') {
      throw new NotFoundException('User not found');
    }

    return UserMapper.toResponse(user);
  }

  async findByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async findAuthUserByEmail(email: string) {
    return this.userRepository.findAuthUserByEmail(
      email.trim().toLowerCase(),
    );
  }

  async create(data: {
    email: string;
    phone: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    const existingEmail =
      await this.userRepository.findByEmail(data.email);

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const existingPhone =
      await this.userRepository.findByPhone(data.phone);

    if (existingPhone) {
      throw new ConflictException('Phone already exists');
    }

    return this.userRepository.create({
      ...data,
      uid: this.idService.generateUserUid(),
    });
  }

  async updateProfile(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
    },
  ) {
    await this.findById(id);

    return this.userRepository.update(id, data);
  }

  async deleteAccount(id: string) {
    await this.findById(id);

    return this.userRepository.softDelete(id);
  }
}