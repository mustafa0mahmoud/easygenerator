import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../../../common/decorators/public.decorator.js';
import type { AuthCookies } from '../sessions/auth-cookies.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { AccessTokenGuard } from './access-token.guard.js';

class ProtectedController {
  handler(): void {}
}

@Public()
class PublicController {
  handler(): void {}
}

class MixedController {
  @Public()
  open(): void {}

  closed(): void {}
}

function setup(verifiedUserId: string | null = 'user-1') {
  const sessions = {
    verifyAccessToken: vi
      .fn<SessionsService['verifyAccessToken']>()
      .mockResolvedValue(verifiedUserId),
  };
  const cookies = {
    readAccessToken: vi.fn(
      (request: { cookies?: Record<string, unknown> }) =>
        request.cookies?.access_token,
    ),
  };
  const guard = new AccessTokenGuard(
    new Reflector(),
    sessions as unknown as SessionsService,
    cookies as unknown as AuthCookies,
  );
  return { guard, sessions };
}

function contextFor(
  controller: new () => object,
  handlerName: string,
  request: Record<string, unknown> = {},
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () =>
      (controller.prototype as Record<string, unknown>)[handlerName],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  it('lets a request with a valid access token through and attaches the user', async () => {
    const { guard, sessions } = setup('user-1');
    const request = { cookies: { access_token: 'valid.jwt.token' } };

    const allowed = await guard.canActivate(
      contextFor(ProtectedController, 'handler', request),
    );

    expect(allowed).toBe(true);
    expect(sessions.verifyAccessToken).toHaveBeenCalledWith('valid.jwt.token');
    expect(request).toMatchObject({ user: { id: 'user-1' } });
  });

  it('rejects a request without the cookie', async () => {
    const { guard } = setup(null);

    await expect(
      guard.canActivate(
        contextFor(ProtectedController, 'handler', { cookies: {} }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request whose token does not verify, and attaches no user', async () => {
    const { guard } = setup(null);
    const request = { cookies: { access_token: 'expired-or-forged' } };

    await expect(
      guard.canActivate(contextFor(ProtectedController, 'handler', request)),
    ).rejects.toThrow('Authentication required.');
    expect(request).not.toHaveProperty('user');
  });

  it('ignores a token sent in the Authorization header', async () => {
    const { guard, sessions } = setup(null);
    const request = {
      headers: { authorization: 'Bearer valid.jwt.token' },
      cookies: {},
    };

    await expect(
      guard.canActivate(contextFor(ProtectedController, 'handler', request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.verifyAccessToken).toHaveBeenCalledWith(undefined);
  });

  it('protects a route by default: no decorator means authentication is required', async () => {
    const { guard } = setup(null);

    await expect(
      guard.canActivate(contextFor(MixedController, 'closed')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('opens a controller marked @Public() without checking any token', async () => {
    const { guard, sessions } = setup(null);

    expect(
      await guard.canActivate(contextFor(PublicController, 'handler')),
    ).toBe(true);
    expect(sessions.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('opens a single handler marked @Public() inside a protected controller', async () => {
    const { guard } = setup(null);

    expect(await guard.canActivate(contextFor(MixedController, 'open'))).toBe(
      true,
    );
  });
});
