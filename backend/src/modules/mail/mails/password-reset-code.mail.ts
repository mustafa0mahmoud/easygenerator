import { Injectable } from '@nestjs/common';
import { html, type Mailable, type MailContent } from '@nestjs/mail';
import type { CodeMailData } from '../interfaces/mail.interface.js';

/**
 * The email carrying a password reset code.
 * `name` is user input: the `html` tag escapes every interpolated value.
 */
@Injectable()
export class PasswordResetCodeMail implements Mailable<CodeMailData> {
  render({ name, code, expiresInMinutes }: CodeMailData): MailContent {
    return {
      subject: 'Your password reset code',
      html: html`
        <p>Hi ${name},</p>
        <p>Use this code to choose a new password:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">
          ${code}
        </p>
        <p>The code expires in ${expiresInMinutes} minutes.</p>
        <p>
          If you did not ask to reset your password, ignore this email: your
          password stays as it is.
        </p>
      `,
      text: [
        `Hi ${name},`,
        '',
        `Your password reset code is: ${code}`,
        `It expires in ${expiresInMinutes} minutes.`,
        '',
        'If you did not ask to reset your password, ignore this email: your password stays as it is.',
      ].join('\n'),
    };
  }
}
