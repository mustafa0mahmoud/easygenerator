import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../../config/env.validation.js';
import type {
  AccessTokenPayload,
  SessionTokens,
} from './interfaces/session.interface.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

const REFRESH_TOKEN_BYTES = 32;
/** 32 random bytes in base64url are always 43 characters. */
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Issues, rotates and revokes sessions.
 *
 * A session is two tokens with different jobs:
 * - the access token is a signed JWT the API can check on every request
 *   without touching the database, and is short-lived because it cannot be
 *   taken back once issued;
 * - the refresh token is a random value kept server-side (as a hash), so it
 *   can be revoked, and is replaced every time it is used.
 *
 * Tokens are never written to the logs.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly refreshTtlMs: number;

  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.refreshTtlMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * MS_PER_DAY;
  }

  async issue(userId: string): Promise<SessionTokens> {
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    await this.refreshTokens.create({
      userId,
      tokenHash: this.hash(refreshToken),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    const payload: AccessTokenPayload = { sub: userId };
    const accessToken = await this.jwt.signAsync(payload);

    this.logger.debug(
      { step: 'session.issued', userId },
      'Session tokens issued',
    );
    return { accessToken, refreshToken };
  }

  /**
   * Exchanges a refresh token for a new pair. The old token is destroyed in
   * the same database operation that reads it, so it works exactly once.
   * Returns `null` for anything that is not a live token.
   */
  async rotate(
    refreshToken: unknown,
  ): Promise<{ userId: string; tokens: SessionTokens } | null> {
    if (!this.isWellFormed(refreshToken)) {
      this.logger.debug(
        { step: 'session.rotate.malformed' },
        'Refresh token is malformed',
      );
      return null;
    }

    const userId = await this.refreshTokens.consume(
      this.hash(refreshToken),
      new Date(),
    );
    if (!userId) {
      this.logger.debug(
        { step: 'session.rotate.not_found' },
        'Refresh token unknown, expired or already used',
      );
      return null;
    }

    const tokens = await this.issue(userId);
    this.logger.debug(
      { step: 'session.rotated', userId },
      'Refresh token rotated',
    );
    return { userId, tokens };
  }

  async revoke(refreshToken: unknown): Promise<boolean> {
    if (!this.isWellFormed(refreshToken)) return false;

    const revoked = await this.refreshTokens.deleteByHash(
      this.hash(refreshToken),
    );
    this.logger.debug(
      { step: 'session.revoked', revoked },
      'Session revocation attempted',
    );
    return revoked;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const count = await this.refreshTokens.deleteAllForUser(userId);
    this.logger.debug(
      { step: 'session.all_revoked', userId, count },
      'All sessions revoked',
    );
    return count;
  }

  /**
   * Returns the user id an access token was issued for, or `null` when the
   * token is missing, malformed, expired, or not signed by this API. The
   * accepted algorithm, issuer and audience are fixed in the JWT module.
   */
  async verifyAccessToken(accessToken: unknown): Promise<string | null> {
    if (typeof accessToken !== 'string' || accessToken.length === 0)
      return null;

    try {
      const payload =
        await this.jwt.verifyAsync<Partial<AccessTokenPayload>>(accessToken);
      return typeof payload.sub === 'string' && payload.sub.length > 0
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Cookie values are attacker-controlled, and the cookie parser can turn a
   * crafted value into an object. Only an exactly-shaped string is accepted
   * before anything reaches the database.
   */
  private isWellFormed(refreshToken: unknown): refreshToken is string {
    return (
      typeof refreshToken === 'string' &&
      REFRESH_TOKEN_PATTERN.test(refreshToken)
    );
  }

  /**
   * A plain SHA-256 is enough here, unlike for the 6-digit codes: the token
   * has 256 bits of entropy, so its hash cannot be reversed by guessing.
   */
  private hash(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
