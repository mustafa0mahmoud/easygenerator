import type { Type } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { CodeMailData } from '../../../mail/interfaces/mail.interface.js';

/** How one kind of code is emailed and how its delivery is logged. */
export interface Delivery {
  mail: Type<Mailable<CodeMailData>>;
  /** Prefix of the log event and step names, e.g. `verification_email_sent`. */
  logName: string;
  description: string;
}
