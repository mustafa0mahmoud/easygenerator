import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../../config/env.validation.js';
import { AuthCookies } from './auth-cookies.js';

function createCookies(overrides: Partial<Env> = {}) {
  const values: Partial<Env> = {
    COOKIE_SECURE: true,
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 7,
    ...overrides,
  };
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new AuthCookies(config);
}

function createResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  return {
    response: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
}

const tokens = {
  accessToken: 'access.jwt.value',
  refreshToken: 'refresh-opaque-value',
};

describe('AuthCookies', () => {
  it('sets both tokens as HttpOnly, Secure, SameSite=Strict cookies', () => {
    const { response, cookie } = createResponse();

    createCookies().set(response, tokens);

    expect(cookie).toHaveBeenCalledWith('access_token', 'access.jwt.value', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api',
      maxAge: 900_000,
    });
    expect(cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-opaque-value',
      {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    );
  });

  it('scopes the refresh token to the auth routes only', () => {
    const { response, cookie } = createResponse();

    createCookies().set(response, tokens);

    const refreshOptions = cookie.mock.calls.find(
      ([name]) => name === 'refresh_token',
    )?.[2] as {
      path: string;
    };
    expect(refreshOptions.path).toBe('/api/v1/auth');
  });

  it('drops the Secure attribute only when configured for local HTTP', () => {
    const { response, cookie } = createResponse();

    createCookies({ COOKIE_SECURE: false }).set(response, tokens);

    for (const [, , options] of cookie.mock.calls) {
      expect(options).toMatchObject({
        secure: false,
        httpOnly: true,
        sameSite: 'strict',
      });
    }
  });

  it('clears each cookie with the same path and flags it was set with', () => {
    const { response, cookie, clearCookie } = createResponse();
    const cookies = createCookies();

    cookies.set(response, tokens);
    cookies.clear(response);

    for (const [name, , setOptions] of cookie.mock.calls) {
      const { maxAge: _maxAge, ...expected } = setOptions as Record<
        string,
        unknown
      >;
      expect(clearCookie).toHaveBeenCalledWith(name, expected);
    }
    expect(clearCookie).toHaveBeenCalledTimes(2);
  });

  it('reads the raw cookie values, and undefined when cookies are absent', () => {
    const cookies = createCookies();
    const request = {
      cookies: { access_token: 'a', refresh_token: 'r' },
    } as unknown as Request;

    expect(cookies.readAccessToken(request)).toBe('a');
    expect(cookies.readRefreshToken(request)).toBe('r');
    expect(cookies.readAccessToken({} as Request)).toBeUndefined();
    expect(
      cookies.readRefreshToken({ cookies: {} } as unknown as Request),
    ).toBeUndefined();
  });
});
