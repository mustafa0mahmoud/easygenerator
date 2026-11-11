import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface.js';
import { AUTH_MESSAGES } from '../auth.constants.js';
import { AuthCookies } from '../sessions/auth-cookies.js';
import { SessionsService } from '../sessions/sessions.service.js';

/**
 * Registered globally: every route requires a valid access token unless it is
 * marked `@Public()`. The token is read from its HttpOnly cookie; there is no
 * header fallback, so a token can only arrive the way the browser stores it.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cookies: AuthCookies,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = await this.sessions.verifyAccessToken(
      this.cookies.readAccessToken(request),
    );

    // One answer for a missing, expired or forged token.
    if (!userId) {
      throw new UnauthorizedException(AUTH_MESSAGES.authenticationRequired);
    }

    request.user = { id: userId };
    return true;
  }
}
