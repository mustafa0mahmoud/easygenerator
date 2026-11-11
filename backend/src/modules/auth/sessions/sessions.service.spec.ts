import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { Env } from '../../../config/env.validation.js';
import { ACCESS_TOKEN } from '../auth.constants.js';
import type { NewRefreshToken } from './interfaces/session.interface.js';
import type { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { SessionsService } from './sessions.service.js';

const USER = '656f6e652d74696d652d636f';
const SECRET = 'unit-test-jwt-secret-with-at-least-32-chars';
const START = new Date('2026-01-01T10:00:00.000Z');
const REFRESH_DAYS = 7;
const ACCESS_TTL_SECONDS = 900;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** In-memory stand-in with the same contract as the MongoDB repository. */
class FakeRefreshTokensRepository {
  readonly rows = new Map<string, NewRefreshToken>();

  create(token: NewRefreshToken): Promise<void> {
    this.rows.set(token.tokenHash, token);
    return Promise.resolve();
  }

  consume(tokenHash: string, now: Date): Promise<string | null> {
    const row = this.rows.get(tokenHash);
    if (!row || row.expiresAt <= now) return Promise.resolve(null);
    this.rows.delete(tokenHash);
    return Promise.resolve(row.userId);
  }

  deleteByHash(tokenHash: string): Promise<boolean> {
    return Promise.resolve(this.rows.delete(tokenHash));
  }

  deleteAllForUser(userId: string): Promise<number> {
    let count = 0;
    for (const [hash, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(hash);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

function jwtService(secret = SECRET, overrides: object = {}): JwtService {
  return new JwtService({
    secret,
    signOptions: {
      algorithm: ACCESS_TOKEN.ALGORITHM,
      issuer: ACCESS_TOKEN.ISSUER,
      audience: ACCESS_TOKEN.AUDIENCE,
      expiresIn: ACCESS_TTL_SECONDS,
      ...overrides,
    },
    verifyOptions: {
      algorithms: [ACCESS_TOKEN.ALGORITHM],
      issuer: ACCESS_TOKEN.ISSUER,
      audience: ACCESS_TOKEN.AUDIENCE,
    },
  });
}

function createService() {
  const repository = new FakeRefreshTokensRepository();
  const config = { get: () => REFRESH_DAYS } as unknown as ConfigService<
    Env,
    true
  >;
  const service = new SessionsService(
    repository as unknown as RefreshTokensRepository,
    jwtService(),
    config,
  );
  return { service, repository };
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('SessionsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('issue', () => {
    it('returns an access token for the user and an opaque refresh token', async () => {
      const { service } = createService();

      const tokens = await service.issue(USER);

      expect(await service.verifyAccessToken(tokens.accessToken)).toBe(USER);
      expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('stores only the hash of the refresh token, with its expiry', async () => {
      const { service, repository } = createService();

      const { refreshToken } = await service.issue(USER);

      const [stored] = [...repository.rows.values()];
      expect(stored.tokenHash).toBe(sha256(refreshToken));
      expect(JSON.stringify(stored)).not.toContain(refreshToken);
      expect(stored.expiresAt.getTime() - START.getTime()).toBe(
        REFRESH_DAYS * MS_PER_DAY,
      );
    });

    it('issues a different refresh token every time', async () => {
      const { service } = createService();

      const first = await service.issue(USER);
      const second = await service.issue(USER);

      expect(first.refreshToken).not.toBe(second.refreshToken);
    });
  });

  describe('rotate', () => {
    it('exchanges a live token for a new pair and destroys the old one', async () => {
      const { service, repository } = createService();
      const original = await service.issue(USER);

      const rotated = await service.rotate(original.refreshToken);

      expect(rotated?.userId).toBe(USER);
      expect(rotated?.tokens.refreshToken).not.toBe(original.refreshToken);
      expect(repository.rows.has(sha256(original.refreshToken))).toBe(false);
      expect(repository.rows.size).toBe(1);
    });

    it('refuses a token that was already used', async () => {
      const { service } = createService();
      const { refreshToken } = await service.issue(USER);
      await service.rotate(refreshToken);

      expect(await service.rotate(refreshToken)).toBeNull();
    });

    it('refuses an expired token', async () => {
      const { service } = createService();
      const { refreshToken } = await service.issue(USER);

      vi.setSystemTime(new Date(START.getTime() + REFRESH_DAYS * MS_PER_DAY));

      expect(await service.rotate(refreshToken)).toBeNull();
    });

    it('refuses a well-formed token it never issued', async () => {
      const { service } = createService();

      expect(await service.rotate('A'.repeat(43))).toBeNull();
    });

    it.each([
      ['undefined', undefined],
      ['an empty string', ''],
      ['a token of the wrong length', 'short'],
      ['a token with illegal characters', `${'A'.repeat(42)}$`],
      ['an object, as a crafted cookie can produce', { $ne: null }],
      ['an array', ['A'.repeat(43)]],
    ])('refuses %s without querying the database', async (_label, value) => {
      const { service, repository } = createService();
      const consume = vi.spyOn(repository, 'consume');

      expect(await service.rotate(value)).toBeNull();
      expect(consume).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('ends the session the token belongs to', async () => {
      const { service } = createService();
      const { refreshToken } = await service.issue(USER);

      expect(await service.revoke(refreshToken)).toBe(true);
      expect(await service.rotate(refreshToken)).toBeNull();
    });

    it('reports false for an unknown or malformed token instead of failing', async () => {
      const { service } = createService();

      expect(await service.revoke('A'.repeat(43))).toBe(false);
      expect(await service.revoke(undefined)).toBe(false);
      expect(await service.revoke({ $ne: null })).toBe(false);
    });
  });

  describe('revokeAllForUser', () => {
    it('ends every session of that user and leaves other users alone', async () => {
      const { service } = createService();
      const other = '616e6f746865722d75736572';
      const first = await service.issue(USER);
      const second = await service.issue(USER);
      const theirs = await service.issue(other);

      expect(await service.revokeAllForUser(USER)).toBe(2);

      expect(await service.rotate(first.refreshToken)).toBeNull();
      expect(await service.rotate(second.refreshToken)).toBeNull();
      expect((await service.rotate(theirs.refreshToken))?.userId).toBe(other);
    });
  });

  describe('verifyAccessToken', () => {
    it('refuses an expired token', async () => {
      const { service } = createService();
      const { accessToken } = await service.issue(USER);

      vi.setSystemTime(
        new Date(START.getTime() + (ACCESS_TTL_SECONDS + 1) * 1000),
      );

      expect(await service.verifyAccessToken(accessToken)).toBeNull();
    });

    it('accepts a token one second before it expires', async () => {
      const { service } = createService();
      const { accessToken } = await service.issue(USER);

      vi.setSystemTime(
        new Date(START.getTime() + (ACCESS_TTL_SECONDS - 1) * 1000),
      );

      expect(await service.verifyAccessToken(accessToken)).toBe(USER);
    });

    it('refuses a token signed with another secret', async () => {
      const { service } = createService();
      const forged = await jwtService(
        'another-secret-with-at-least-32-characters',
      ).signAsync({
        sub: USER,
      });

      expect(await service.verifyAccessToken(forged)).toBeNull();
    });

    it('refuses a token whose payload was changed', async () => {
      const { service } = createService();
      const { accessToken } = await service.issue(USER);
      const [header, , signature] = accessToken.split('.');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'someone-else' }),
      ).toString('base64url');

      expect(
        await service.verifyAccessToken(`${header}.${payload}.${signature}`),
      ).toBeNull();
    });

    it('refuses an unsigned token (alg: none)', async () => {
      const { service } = createService();
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
        sub: USER,
        iss: ACCESS_TOKEN.ISSUER,
        aud: ACCESS_TOKEN.AUDIENCE,
      })}.`;

      expect(await service.verifyAccessToken(unsigned)).toBeNull();
    });

    it('refuses a correctly signed token from another issuer or for another audience', async () => {
      const { service } = createService();
      const wrongIssuer = await jwtService(SECRET, {
        issuer: 'someone-else',
      }).signAsync({
        sub: USER,
      });
      const wrongAudience = await jwtService(SECRET, {
        audience: 'another-app',
      }).signAsync({
        sub: USER,
      });

      expect(await service.verifyAccessToken(wrongIssuer)).toBeNull();
      expect(await service.verifyAccessToken(wrongAudience)).toBeNull();
    });

    it('refuses a signed token without a subject', async () => {
      const { service } = createService();
      const noSubject = await jwtService().signAsync({ role: 'admin' });

      expect(await service.verifyAccessToken(noSubject)).toBeNull();
    });

    it.each([undefined, null, '', 'not-a-jwt', 42, { token: 'x' }])(
      'refuses the non-token value %j',
      async (value) => {
        const { service } = createService();

        expect(await service.verifyAccessToken(value)).toBeNull();
      },
    );
  });

  it('never writes a token to the logs', async () => {
    const lines: unknown[][] = [];
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(
      (...args: unknown[]) => {
        lines.push(args);
      },
    );
    const { service } = createService();

    const first = await service.issue(USER);
    const rotated = await service.rotate(first.refreshToken);
    await service.revoke(rotated?.tokens.refreshToken);

    const written = JSON.stringify(lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of [
      first.accessToken,
      first.refreshToken,
      rotated?.tokens.accessToken ?? '',
      rotated?.tokens.refreshToken ?? '',
      sha256(first.refreshToken),
    ]) {
      expect(written).not.toContain(secret);
    }
  });
});
