import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import request, { type Response } from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/app.setup.js';
import { OneTimeCode } from '../../src/modules/auth/one-time-codes/schemas/one-time-code.schema.js';
import { RefreshToken } from '../../src/modules/auth/sessions/schemas/refresh-token.schema.js';
import { User } from '../../src/modules/users/schemas/user.schema.js';

export interface ParsedCookie {
  value: string;
  attributes: string[];
}

export type Cookies = Record<string, ParsedCookie>;

/** Indexes the Set-Cookie headers of a response by cookie name. */
export function setCookies(response: Response): Cookies {
  const header = response.headers['set-cookie'] as unknown as
    string[] | undefined;
  const cookies: Cookies = {};
  for (const line of header ?? []) {
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    cookies[pair.slice(0, separator)] = {
      value: pair.slice(separator + 1),
      attributes,
    };
  }
  return cookies;
}

/** The Cookie request header a browser would send back. */
export function cookieHeader(cookies: Cookies, ...names: string[]): string {
  return names.map((name) => `${name}=${cookies[name].value}`).join('; ');
}

const AUTH = '/api/v1/auth';
const ME = '/api/v1/users/me';

/**
 * The application exactly as it runs (real HTTP stack, real MongoDB), with
 * only email delivery replaced by an in-memory mailbox. Shared by the
 * end-to-end suites that need the whole auth flow.
 */
export async function createAuthApp(ipPrefix: string) {
  const mailbox = new InMemoryMailTransport();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailTransport)
    .useValue(mailbox)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();

  const users: Model<User> = app.get(getModelToken(User.name));
  const codes: Model<OneTimeCode> = app.get(getModelToken(OneTimeCode.name));
  const refreshTokens: Model<RefreshToken> = app.get(
    getModelToken(RefreshToken.name),
  );
  await Promise.all([users.init(), codes.init(), refreshTokens.init()]);

  let clientCounter = 0;
  let clientIp = `${ipPrefix}.0.1`;

  const clearDatabase = async (): Promise<void> => {
    await Promise.all([
      users.deleteMany({}),
      codes.deleteMany({}),
      refreshTokens.deleteMany({}),
    ]);
  };

  /** Empties the database and mailbox and switches to a fresh client address. */
  const reset = async (): Promise<void> => {
    await clearDatabase();
    mailbox.clear();
    clientCounter += 1;
    clientIp = `${ipPrefix}.${Math.floor(clientCounter / 250)}.${(clientCounter % 250) + 1}`;
  };

  const post = (path: string, body?: object) => {
    const pending = request(app.getHttpServer())
      .post(`${AUTH}${path}`)
      .set('X-Forwarded-For', clientIp);
    return body ? pending.send(body) : pending;
  };

  const getMe = () =>
    request(app.getHttpServer()).get(ME).set('X-Forwarded-For', clientIp);

  /** Waits for the nth email to an address and returns the 6-digit code in it. */
  const receivedCode = async (
    email: string,
    expectedMailCount = 1,
  ): Promise<string> => {
    const mails = await vi.waitFor(() => {
      const sent = mailbox.filter({ to: email });
      expect(sent).toHaveLength(expectedMailCount);
      return sent;
    });
    const match = /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? '');
    if (!match) throw new Error('The email does not contain a 6-digit code');
    return match[1];
  };

  const close = async (): Promise<void> => {
    await clearDatabase();
    await app.close();
  };

  return {
    app,
    mailbox,
    users,
    codes,
    refreshTokens,
    reset,
    post,
    getMe,
    receivedCode,
    close,
  };
}

export type AuthApp = Awaited<ReturnType<typeof createAuthApp>>;
