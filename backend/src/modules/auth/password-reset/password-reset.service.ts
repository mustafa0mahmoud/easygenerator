import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { UsersRepository } from '../../users/users.repository.js';
import { AUTH_MESSAGES } from '../auth.constants.js';
import type { ForgotPasswordDto } from '../dto/forgot-password.dto.js';
import type { ResetPasswordDto } from '../dto/reset-password.dto.js';
import { CodeDeliveryService } from '../one-time-codes/code-delivery.service.js';
import { OneTimeCodesService } from '../one-time-codes/one-time-codes.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

const PASSWORD_RESET = 'password_reset';
const EMAIL_VERIFICATION = 'email_verification';

/**
 * Password recovery with an emailed code.
 *
 * The code proves control of the mailbox, which is exactly what email
 * verification proves, so a successful reset also verifies the address. It
 * is the way out for an owner whose address was registered by someone else:
 * the code reaches the owner, the password becomes theirs, and every existing
 * session is ended.
 *
 * Log lines never contain the email address, a password or a code.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly codes: OneTimeCodesService,
    private readonly passwordHasher: PasswordHasher,
    private readonly delivery: CodeDeliveryService,
    private readonly sessions: SessionsService,
  ) {}

  /** Returns nothing on every path: the caller always gets the same answer. */
  async request({ email }: ForgotPasswordDto): Promise<void> {
    this.logger.debug(
      { step: 'password_reset.request.started' },
      'Reset request started',
    );

    const user = await this.users.findByEmail(email);
    this.logger.debug(
      {
        step: 'password_reset.request.user_loaded',
        found: user !== null,
        userId: user?.id,
      },
      'Account lookup done',
    );
    if (!user) {
      return;
    }

    if (await this.codes.isInCooldown(user.id, PASSWORD_RESET)) {
      this.logger.warn(
        { event: 'password_reset_request_ignored_cooldown', userId: user.id },
        'Reset request ignored: a code was issued moments ago',
      );
      return;
    }

    const { code } = await this.codes.issue(user.id, PASSWORD_RESET);
    this.logger.log(
      { event: 'password_reset_requested', userId: user.id },
      'Password reset code issued',
    );
    this.delivery.deliverInBackground(PASSWORD_RESET, user, code);
  }

  async reset({ email, code, password }: ResetPasswordDto): Promise<void> {
    this.logger.debug(
      { step: 'password_reset.started' },
      'Password reset started',
    );

    const user = await this.users.findByEmail(email);
    this.logger.debug(
      {
        step: 'password_reset.user_loaded',
        found: user !== null,
        userId: user?.id,
      },
      'Account lookup done',
    );
    // One error for an unknown address and for a wrong, expired or used code.
    if (!user) {
      throw new BadRequestException(AUTH_MESSAGES.invalidResetCode);
    }

    // The code is checked before hashing, so wrong guesses stay cheap for the
    // server and expensive only for the guesser (5 attempts per code).
    const valid = await this.codes.verify(user.id, PASSWORD_RESET, code);
    if (!valid) {
      this.logger.warn(
        { event: 'password_reset_failed', userId: user.id },
        'Password reset failed: invalid code',
      );
      throw new BadRequestException(AUTH_MESSAGES.invalidResetCode);
    }

    const passwordHash = await this.passwordHasher.hash(password);
    await this.users.updatePasswordHash(user.id, passwordHash);
    this.logger.debug(
      { step: 'password_reset.password_updated', userId: user.id },
      'Password updated',
    );

    // Receiving the code proved ownership of the address.
    const emailVerified = await this.users.markEmailVerified(
      user.id,
      new Date(),
    );
    await this.codes.invalidate(user.id, EMAIL_VERIFICATION);

    const sessionsRevoked = await this.sessions.revokeAllForUser(user.id);

    this.logger.log(
      {
        event: 'password_reset',
        userId: user.id,
        sessionsRevoked,
        emailVerified,
      },
      'Password reset',
    );
  }
}
