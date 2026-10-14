import { AppleLifecycleService } from './social/apple-lifecycle.service';
import { SocialBrowserService } from './social/social-browser.service';
import { SocialVerifier } from './social/social-verifier';
import { SocialService } from './social/social.service';
import { SocialController } from './social/social.controller';
import { SessionRepository } from './repositories/session.repository';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';
import { VerificationTokenRepository } from './repositories/verification-token.repository';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UserModule } from '@/modules/user/user.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m',
          issuer: 'onecall',
          audience: 'onecall-mobile',
          algorithm: 'HS256' as const,
        },
      }),
    }),
  ],
  controllers: [AuthController, SocialController],
  providers: [
    AuthService,
    SocialVerifier,
    SocialService,
    SocialBrowserService,
    AppleLifecycleService,
    JwtStrategy,
    SessionRepository,
    PasswordResetTokenRepository,
    VerificationTokenRepository,
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
