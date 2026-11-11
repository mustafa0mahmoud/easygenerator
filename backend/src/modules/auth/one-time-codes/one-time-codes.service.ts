import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../../config/env.validation.js';
import { ONE_TIME_CODE } from '../auth.constants.js';
import type { IssuedCode } from './interfaces/one-time-code.interface.js';
import { OneTimeCodesRepository } from './one-time-codes.repository.js';
import type { OneTimeCodePurpose } from './schemas/one-time-code.schema.js';

/**
 * Short numeric codes sent by email (verification now, password reset later).
 *
 * A 6-digit code has only a million values, so its safety comes from the
 * rules around it: a short lifetime, a hard cap on wrong guesses, one live
 * code at a time, and a keyed hash at rest.
 *
 * Debug lines trace each step; they never contain the code or its hash.
 */
@Injectable()
export class OneTimeCodesService {
  private readonly logger = new Logger(OneTimeCodesService.name);
  private readonly secret: string;

  constructor(
    private readonly codes: OneTimeCodesRepository,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('OTP_SECRET', { infer: true });
  }

  /** Creates a new code and invalidates any previous one for the same purpose. */
  async issue(
    userId: string,
    purpose: OneTimeCodePurpose,
  ): Promise<IssuedCode> {
    this.logger.debug(
      { step: 'code.issue.started', userId, purpose },
      'Issuing a code',
    );

    const code = this.generate();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ONE_TIME_CODE.TTL_MS);

    await this.codes.replace(userId, purpose, {
      codeHash: this.hash(userId, purpose, code),
      issuedAt,
      expiresAt,
    });

    this.logger.debug(
      { step: 'code.issue.stored', userId, purpose, expiresAt },
      'Code stored, previous one replaced',
    );
    return { code, expiresAt };
  }

  /**
   * True while a code was issued too recently to send another one. Limits how
   * many emails one address can be sent, independently of the caller's IP.
   */
  async isInCooldown(
    userId: string,
    purpose: OneTimeCodePurpose,
  ): Promise<boolean> {
    const current = await this.codes.find(userId, purpose);
    const inCooldown =
      current !== null &&
      Date.now() - current.issuedAt.getTime() <
        ONE_TIME_CODE.RESEND_COOLDOWN_MS;

    this.logger.debug(
      {
        step: 'code.cooldown.checked',
        userId,
        purpose,
        hasLiveCode: current !== null,
        inCooldown,
      },
      'Cooldown checked',
    );
    return inCooldown;
  }

  /**
   * Checks a submitted code. A correct code is consumed. Every call counts as
   * an attempt, and the code is destroyed once the attempts run out.
   */
  async verify(
    userId: string,
    purpose: OneTimeCodePurpose,
    code: string,
  ): Promise<boolean> {
    this.logger.debug(
      { step: 'code.verify.started', userId, purpose },
      'Verifying a code',
    );

    const stored = await this.codes.consumeAttempt(
      userId,
      purpose,
      new Date(),
      ONE_TIME_CODE.MAX_ATTEMPTS,
    );
    if (!stored) {
      this.logger.debug(
        { step: 'code.verify.no_live_code', userId, purpose },
        'No live code: none issued, expired, or attempts exhausted',
      );
      return false;
    }

    const matches = this.matches(
      this.hash(userId, purpose, code),
      stored.codeHash,
    );
    const exhausted = stored.attempts >= ONE_TIME_CODE.MAX_ATTEMPTS;
    this.logger.debug(
      {
        step: 'code.verify.compared',
        userId,
        purpose,
        matches,
        attempts: stored.attempts,
        maxAttempts: ONE_TIME_CODE.MAX_ATTEMPTS,
      },
      'Code compared',
    );

    if (matches || exhausted) {
      await this.codes.delete(userId, purpose);
      this.logger.debug(
        {
          step: 'code.verify.destroyed',
          userId,
          purpose,
          reason: matches ? 'used' : 'exhausted',
        },
        'Code destroyed',
      );
    }
    return matches;
  }

  async invalidate(userId: string, purpose: OneTimeCodePurpose): Promise<void> {
    await this.codes.delete(userId, purpose);
    this.logger.debug(
      { step: 'code.invalidated', userId, purpose },
      'Code invalidated',
    );
  }

  private generate(): string {
    const upperBound = 10 ** ONE_TIME_CODE.LENGTH;
    return randomInt(0, upperBound)
      .toString()
      .padStart(ONE_TIME_CODE.LENGTH, '0');
  }

  /**
   * HMAC rather than a plain hash: with only a million possible codes, an
   * unkeyed hash could be reversed instantly from a database dump. Binding the
   * user and purpose into the input stops a code being replayed elsewhere.
   */
  private hash(
    userId: string,
    purpose: OneTimeCodePurpose,
    code: string,
  ): string {
    return createHmac('sha256', this.secret)
      .update(`${purpose}:${userId}:${code}`)
      .digest('hex');
  }

  private matches(candidateHash: string, storedHash: string): boolean {
    const candidate = Buffer.from(candidateHash, 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
  }
}
