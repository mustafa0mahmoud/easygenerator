import { Injectable } from '@nestjs/common';
import { html, type Mailable, type MailContent } from '@nestjs/mail';
import type { CodeMailData } from '../interfaces/mail.interface.js';

/**
 * The email carrying a sign-up verification code.
 * `name` is user input: the `html` tag escapes every interpolated value.
 */
@Injectable()
export class VerificationCodeMail implements Mailable<CodeMailData> {
  render({ name, code, expiresInMinutes }: CodeMailData): MailContent {
    return {
      subject: 'Your verification code',
      html: html`
        <p>Hi ${name},</p>
        <p>Use this code to verify your email address:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">
          ${code}
        </p>
        <p>The code expires in ${expiresInMinutes} minutes.</p>
        <p>If you did not create an account, you can ignore this email.</p>
      `,
      text: [
        `Hi ${name},`,
        '',
        `Your verification code is: ${code}`,
        `It expires in ${expiresInMinutes} minutes.`,
        '',
        'If you did not create an account, you can ignore this email.',
      ].join('\n'),
    };
  }
}
