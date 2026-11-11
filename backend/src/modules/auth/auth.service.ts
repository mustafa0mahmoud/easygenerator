import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import type {
  UserCredentials,
  UserRecord,
} from '../users/interfaces/user.interface.js';
import { UsersRepository } from '../users/users.repository.js';
import { AUTH_ERROR_CODES, AUTH_MESSAGES } from './auth.constants.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ResendVerificationDto } from './dto/resend-verification.dto.js';
import type { SignupDto } from './dto/signup.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import { CodeDeliveryService } from './one-time-codes/code-delivery.service.js';
import { OneTimeCodesService } from './one-time-codes/one-time-codes.service.js';
import type { SessionTokens } from './sessions/interfaces/session.interface.js';
import { SessionsService } from './sessions/sessions.service.js';

const EMAIL_VERIFICATION = 'email_verification';

/**
 * Sign-up, email verification and sign-in.
 *
 * Sign-up says plainly when an address is already registered: a clear answer
 * for the user was chosen over hiding which addresses have accounts. Resend
 * and verification still answer the same way on every path.
 *
 * Logs: outcomes (`event`) at info/warn/error, every step in between
 * (`step`) at debug. Lines carry the user id, never the email address, the
 * password or a code.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly codes: OneTimeCodesService,
    private readonly passwordHasher: PasswordHasher,
    private readonly delivery: CodeDeliveryService,
    private readonly sessions: SessionsService,
  ) {}

  async signUp({ email, name, password }: SignupDto): Promise<void> {
    this.logger.debug({ step: 'signup.started' }, 'Sign-up started');

    // Checked first so a taken address is refused without paying for a hash.
    const existing = await this.users.findByEmail(email);
    this.logger.debug(
      { step: 'signup.availability_checked', available: existing === null },
      'Address availability checked',
    );
    if (existing) {
      throw this.emailTaken(existing.id);
    }

    const passwordHash = await this.passwordHasher.hash(password);
    this.logger.debug({ step: 'signup.password_hashed' }, 'Password hashed');

    // The unique index has the last word: if another request registered the
    // address after the check above, this returns null instead of a duplicate.
    const created = await this.users.createUnverified({
      email,
      name,
      passwordHash,
    });
    this.logger.debug(
      { step: 'signup.create_attempted', created: created !== null },
      'User creation attempted',
    );
    if (!created) {
      throw this.emailTaken();
    }

    this.logger.log(
      { event: 'user_registered', userId: created.id },
      'User registered',
    );
    await this.sendVerificationCode(created);
    this.logger.debug(
      { step: 'signup.completed', userId: created.id },
      'Sign-up completed',
    );
  }

  async verifyEmail({ email, code }: VerifyEmailDto): Promise<void> {
    this.logger.debug(
      { step: 'verify_email.started' },
      'Email verification started',
    );

    const user = await this.users.findByEmail(email);
    this.logger.debug(
      {
        step: 'verify_email.user_loaded',
        found: user !== null,
        userId: user?.id,
        verified: Boolean(user?.emailVerifiedAt),
      },
      'Account lookup done',
    );

    // One error for every failure: unknown address, already verified, wrong,
    // expired or exhausted code.
    if (!user || user.emailVerifiedAt) {
      throw new BadRequestException(AUTH_MESSAGES.invalidCode);
    }

    const valid = await this.codes.verify(user.id, EMAIL_VERIFICATION, code);
    if (!valid) {
      this.logger.warn(
        { event: 'email_verification_failed', userId: user.id },
        'Email verification failed',
      );
      throw new BadRequestException(AUTH_MESSAGES.invalidCode);
    }

    const marked = await this.users.markEmailVerified(user.id, new Date());
    this.logger.debug(
      { step: 'verify_email.marked', userId: user.id, marked },
      'Account marked as verified',
    );
    this.logger.log(
      { event: 'email_verified', userId: user.id },
      'Email verified',
    );
  }

  async resendVerification({ email }: ResendVerificationDto): Promise<void> {
    this.logger.debug(
      { step: 'resend.started' },
      'Resend of verification code started',
    );

    const user = await this.users.findByEmail(email);
    this.logger.debug(
      {
        step: 'resend.user_loaded',
        found: user !== null,
        userId: user?.id,
        verified: Boolean(user?.emailVerifiedAt),
      },
      'Account lookup done',
    );

    if (!user || user.emailVerifiedAt) {
      return;
    }

    if (await this.codes.isInCooldown(user.id, EMAIL_VERIFICATION)) {
      this.logger.warn(
        { event: 'verification_resend_ignored_cooldown', userId: user.id },
        'Resend ignored: a code was issued moments ago',
      );
      return;
    }

    await this.sendVerificationCode(user);
    this.logger.debug(
      { step: 'resend.completed', userId: user.id },
      'Resend completed',
    );
  }

  async login({
    email,
    password,
  }: LoginDto): Promise<{ user: UserRecord; tokens: SessionTokens }> {
    this.logger.debug({ step: 'login.started' }, 'Sign-in started');

    const account = await this.users.findCredentialsByEmail(email);
    this.logger.debug(
      {
        step: 'login.account_loaded',
        found: account !== null,
        userId: account?.id,
      },
      'Account lookup done',
    );

    // Checked even when the address is unknown (against a dummy hash), so the
    // response takes the same time whether or not the account exists.
    const passwordMatches = await this.passwordHasher.verify(
      password,
      account?.passwordHash,
    );
    this.logger.debug(
      { step: 'login.password_checked', passwordMatches },
      'Password checked',
    );

    if (!account || !passwordMatches) {
      this.logger.warn(
        { event: 'login_failed', userId: account?.id },
        'Sign-in failed: invalid credentials',
      );
      throw new UnauthorizedException(AUTH_MESSAGES.invalidCredentials);
    }

    // Only reached with the correct password, so this message cannot be used
    // to probe which addresses are registered.
    if (!account.emailVerifiedAt) {
      this.logger.warn(
        { event: 'login_rejected_unverified', userId: account.id },
        'Sign-in rejected: email address is not verified',
      );
      throw new ForbiddenException({
        message: AUTH_MESSAGES.emailNotVerified,
        code: AUTH_ERROR_CODES.emailNotVerified,
      });
    }

    await this.upgradeHashIfNeeded(account, password);

    const tokens = await this.sessions.issue(account.id);
    this.logger.log(
      { event: 'login_succeeded', userId: account.id },
      'Sign-in succeeded',
    );

    const { passwordHash: _passwordHash, ...user } = account;
    return { user, tokens };
  }

  async refresh(refreshToken: unknown): Promise<SessionTokens> {
    this.logger.debug({ step: 'refresh.started' }, 'Session refresh started');

    const rotated = await this.sessions.rotate(refreshToken);
    if (!rotated) {
      this.logger.warn(
        { event: 'refresh_failed' },
        'Session refresh failed: no live token',
      );
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }

    // The account may have been removed since the token was issued.
    const user = await this.users.findById(rotated.userId);
    if (!user) {
      await this.sessions.revoke(rotated.tokens.refreshToken);
      this.logger.warn(
        { event: 'refresh_failed', userId: rotated.userId },
        'Session refresh failed: the account no longer exists',
      );
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }

    this.logger.log(
      { event: 'session_refreshed', userId: user.id },
      'Session refreshed',
    );
    return rotated.tokens;
  }

  async logout(refreshToken: unknown): Promise<void> {
    const revoked = await this.sessions.revoke(refreshToken);
    this.logger.log({ event: 'logout', revoked }, 'Signed out');
  }

  /**
   * If the stored hash was made with weaker parameters than configured today,
   * replace it now, while the plain password is available.
   */
  private async upgradeHashIfNeeded(
    account: UserCredentials,
    password: string,
  ): Promise<void> {
    if (!this.passwordHasher.needsRehash(account.passwordHash)) return;

    const passwordHash = await this.passwordHasher.hash(password);
    await this.users.updatePasswordHash(account.id, passwordHash);
    this.logger.log(
      { event: 'password_rehashed', userId: account.id },
      'Password hash upgraded to the current parameters',
    );
  }

  private emailTaken(userId?: string): ConflictException {
    this.logger.warn(
      { event: 'signup_rejected_email_taken', userId },
      'Sign-up rejected: the address is already registered',
    );
    return new ConflictException(AUTH_MESSAGES.emailTaken);
  }

  private async sendVerificationCode(user: UserRecord): Promise<void> {
    const { code } = await this.codes.issue(user.id, EMAIL_VERIFICATION);
    this.delivery.deliverInBackground(EMAIL_VERIFICATION, user, code);
  }
}
