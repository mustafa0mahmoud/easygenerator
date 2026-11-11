import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../../config/env.validation.js';
import type { SessionTokens } from './interfaces/session.interface.js';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const ACCESS_COOKIE_PATH = '/api';
/**
 * The refresh token is only needed by the auth routes, so the browser is told
 * not to send it anywhere else.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The one place that knows how session cookies are written and cleared.
 * Clearing a cookie only works with the same path and flags it was set with,
 * which is why both live here.
 *
 * - `HttpOnly`: page scripts cannot read the tokens, so XSS cannot steal them.
 * - `SameSite=Strict`: the browser never attaches them to a cross-site request.
 * - `Secure`: HTTPS only (configurable for local HTTP, enforced in production).
 */
@Injectable()
export class AuthCookies {
  private readonly baseOptions: CookieOptions;
  private readonly accessMaxAgeMs: number;
  private readonly refreshMaxAgeMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.baseOptions = {
      httpOnly: true,
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
    };
    this.accessMaxAgeMs =
      config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * MS_PER_SECOND;
    this.refreshMaxAgeMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * MS_PER_DAY;
  }

  set(response: Response, { accessToken, refreshToken }: SessionTokens): void {
    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseOptions,
      path: ACCESS_COOKIE_PATH,
      maxAge: this.accessMaxAgeMs,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseOptions,
      path: REFRESH_COOKIE_PATH,
      maxAge: this.refreshMaxAgeMs,
    });
  }

  clear(response: Response): void {
    response.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...this.baseOptions,
      path: ACCESS_COOKIE_PATH,
    });
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseOptions,
      path: REFRESH_COOKIE_PATH,
    });
  }

  /** Raw cookie values: unvalidated, to be checked by the session service. */
  readAccessToken(request: Request): unknown {
    return (request.cookies as Record<string, unknown> | undefined)?.[
      ACCESS_TOKEN_COOKIE
    ];
  }

  readRefreshToken(request: Request): unknown {
    return (request.cookies as Record<string, unknown> | undefined)?.[
      REFRESH_TOKEN_COOKIE
    ];
  }
}
