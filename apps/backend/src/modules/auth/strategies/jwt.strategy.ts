import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from '@/modules/user/services/user.service';
import { assertAccountAvailable } from '../account-policy';
type JwtPayload = {
  sub: string;
  uid: string;
  email: string;
  tokenVersion?: number;
};
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
      issuer: 'onecall',
      audience: 'onecall-mobile',
    });
  }
  async validate(payload: JwtPayload) {
    if (
      !payload.sub ||
      !Number.isSafeInteger(payload.tokenVersion) ||
      payload.tokenVersion! < 0
    )
      throw new UnauthorizedException('Invalid authentication token');
    let user;
    try {
      user = await this.userService.findAuthUserById(payload.sub);
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }
    assertAccountAvailable(user);
    if (!user || user.tokenVersion !== payload.tokenVersion)
      throw new UnauthorizedException('Invalid authentication token');
    return {
      tokenVersion: user.tokenVersion,
      id: user.id,
      uid: user.uid,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
  }
}
