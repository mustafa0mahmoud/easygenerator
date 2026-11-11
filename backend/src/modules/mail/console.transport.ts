import { Logger } from '@nestjs/common';
import {
  MailTransport,
  type MailMessage,
  type MailTransportResult,
} from '@nestjs/mail';

/**
 * Development transport: prints the email to the server log instead of sending
 * it, so the app runs with no mail provider and no credentials.
 *
 * The body contains verification codes, which is the point locally and the
 * reason the configuration refuses this driver when NODE_ENV is production.
 */
export class ConsoleMailTransport extends MailTransport {
  private readonly logger = new Logger(ConsoleMailTransport.name);

  send(message: MailMessage): Promise<MailTransportResult> {
    const recipients = message.to.map(({ address }) => address).join(', ');

    this.logger.log(
      `Email not sent (console mail driver)\nTo: ${recipients}\nSubject: ${message.subject}\n\n${message.text ?? ''}`,
    );

    return Promise.resolve({ accepted: message.envelope.to });
  }
}
