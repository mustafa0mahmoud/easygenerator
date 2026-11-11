import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailModule, type MailTransport } from '@nestjs/mail';
import type { Env } from '../../config/env.validation.js';
import { BrevoTransport } from './brevo.transport.js';
import { ConsoleMailTransport } from './console.transport.js';
import type { MailEnv } from './interfaces/mail.interface.js';

export function createMailTransport(env: MailEnv): MailTransport {
  switch (env.MAIL_DRIVER) {
    case 'brevo':
      if (!env.BREVO_API_KEY) {
        throw new Error(
          'BREVO_API_KEY is required when MAIL_DRIVER is "brevo"',
        );
      }
      return new BrevoTransport({ apiKey: env.BREVO_API_KEY });
    case 'console':
      return new ConsoleMailTransport();
  }
}

/**
 * Application-wide mail setup. Features inject `Mailer` and never know which
 * provider delivers the message; tests replace `MailTransport` with an
 * in-memory one.
 */
@Module({
  imports: [
    MailModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        transport: createMailTransport({
          MAIL_DRIVER: config.get('MAIL_DRIVER', { infer: true }),
          BREVO_API_KEY: config.get('BREVO_API_KEY', { infer: true }),
        }),
        from: {
          name: config.get('MAIL_FROM_NAME', { infer: true }),
          address: config.get('MAIL_FROM_ADDRESS', { infer: true }),
        },
      }),
    }),
  ],
})
export class AppMailModule {}
