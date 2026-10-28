import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { VerifiedAccountGuard } from './verified-account.guard';

describe('Service access account policy', () => {
  function context(user?: {
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  }) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as ExecutionContext;
  }
  it('allows an active account without verified contact details', () => {
    expect(
      new VerifiedAccountGuard().canActivate(
        context({
          status: 'ACTIVE',
          emailVerified: false,
          phoneVerified: false,
        }),
      ),
    ).toBe(true);
  });
  it.each(['PENDING', 'SUSPENDED', 'DELETED'])(
    'blocks an unavailable %s account even with verified contacts',
    (status) => {
      expect(() =>
        new VerifiedAccountGuard().canActivate(
          context({ status, emailVerified: true, phoneVerified: true }),
        ),
      ).toThrow(ForbiddenException);
    },
  );
  it('blocks a missing account', () => {
    expect(() => new VerifiedAccountGuard().canActivate(context())).toThrow(
      ForbiddenException,
    );
  });
});
