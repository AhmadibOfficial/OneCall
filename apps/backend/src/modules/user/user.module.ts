import { PrivacyController } from './controllers/privacy.controller';
import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infrastructure/database/prisma/prisma.module';
import { IdModule } from '@/common/id';

import { UserController } from './controllers/user.controller';
import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';

@Module({
  imports: [PrismaModule, IdModule],
  controllers: [UserController, PrivacyController],
  providers: [UserRepository, UserService],
  exports: [UserService],
})
export class UserModule {}
