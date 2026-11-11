import type { Type } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { CodeMailData } from '../../../mail/interfaces/mail.interface.js';

export interface Delivery {
  mail: Type<Mailable<CodeMailData>>;
  logName: string;
  description: string;
}
