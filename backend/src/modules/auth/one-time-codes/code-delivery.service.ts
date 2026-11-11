import { Injectable, Logger } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { summarizeMailError } from '../../mail/mail-error.util.js';
import { PasswordResetCodeMail } from '../../mail/mails/password-reset-code.mail.js';
import { VerificationCodeMail } from '../../mail/mails/verification-code.mail.js';
import type { UserRecord } from '../../users/interfaces/user.interface.js';
import { ONE_TIME_CODE } from '../auth.constants.js';
import type { Delivery } from './interfaces/code-delivery.interface.js';
import type { OneTimeCodePurpose } from './schemas/one-time-code.schema.js';

const MS_PER_MINUTE = 60_000;

/** The email that carries each kind of code, and how its delivery is logged. */
const DELIVERIES: Record<OneTimeCodePurpose, Delivery> = {
  email_verification: {
    mail: VerificationCodeMail,
    logName: 'verification_email',
    description: 'Verification email',
  },
  password_reset: {
    mail: PasswordResetCodeMail,
    logName: 'password_reset_email',
    description: 'Password reset email',
  },
};

/**
 * Emails a one-time code to its owner, for every purpose a code can have.
 * Adding a new kind of code means adding one entry to `DELIVERIES`.
 */
@Injectable()
export class CodeDeliveryService {
  private readonly logger = new Logger(CodeDeliveryService.name);

  constructor(private readonly mailer: Mailer) {}

  /**
   * Starts the send and returns immediately. The HTTP response must not wait
   * for the mail provider: its latency would reveal which requests triggered
   * an email, and its outage would fail the request. The mailer retries
   * transient failures itself; if delivery still fails the outcome is logged
   * and the user asks for a new code.
   *
   * Log lines carry the user id and the provider's status, never the code or
   * the address.
   */
  deliverInBackground(
    purpose: OneTimeCodePurpose,
    user: UserRecord,
    code: string,
  ): void {
    const { mail, logName, description } = DELIVERIES[purpose];

    this.logger.debug(
      { step: `${logName}.queued`, userId: user.id },
      `${description} handed to the mailer`,
    );

    this.mailer
      .send(mail, {
        to: { name: user.name, address: user.email },
        data: {
          name: user.name,
          code,
          expiresInMinutes: ONE_TIME_CODE.TTL_MS / MS_PER_MINUTE,
        },
      })
      .then((result) => {
        this.logger.log(
          {
            event: `${logName}_sent`,
            userId: user.id,
            attempts: result.attempts,
          },
          `${description} sent`,
        );
      })
      .catch((error: unknown) => {
        this.logger.error(
          {
            event: `${logName}_failed`,
            userId: user.id,
            ...summarizeMailError(error),
          },
          `${description} could not be sent`,
        );
      });
  }
}
