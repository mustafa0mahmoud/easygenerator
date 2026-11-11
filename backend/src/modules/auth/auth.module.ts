import { Module } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env.validation.js';
import { PasswordResetCodeMail } from '../mail/mails/password-reset-code.mail.js';
import { VerificationCodeMail } from '../mail/mails/verification-code.mail.js';
import { UsersModule } from '../users/users.module.js';
import { ACCESS_TOKEN } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CodeDeliveryService } from './one-time-codes/code-delivery.service.js';
import { OneTimeCodesRepository } from './one-time-codes/one-time-codes.repository.js';
import { OneTimeCodesService } from './one-time-codes/one-time-codes.service.js';
import {
  OneTimeCode,
  OneTimeCodeSchema,
} from './one-time-codes/schemas/one-time-code.schema.js';
import { PasswordResetService } from './password-reset/password-reset.service.js';
import { AuthCookies } from './sessions/auth-cookies.js';
import { RefreshTokensRepository } from './sessions/refresh-tokens.repository.js';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './sessions/schemas/refresh-token.schema.js';
import { SessionsService } from './sessions/sessions.service.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: OneTimeCode.name, schema: OneTimeCodeSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          algorithm: ACCESS_TOKEN.ALGORITHM,
          issuer: ACCESS_TOKEN.ISSUER,
          audience: ACCESS_TOKEN.AUDIENCE,
          expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
        },
        // Pinning the algorithm stops a token signed with "none" or another
        // algorithm from being accepted.
        verifyOptions: {
          algorithms: [ACCESS_TOKEN.ALGORITHM],
          issuer: ACCESS_TOKEN.ISSUER,
          audience: ACCESS_TOKEN.AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    OneTimeCodesService,
    OneTimeCodesRepository,
    CodeDeliveryService,
    SessionsService,
    RefreshTokensRepository,
    AuthCookies,
    VerificationCodeMail,
    PasswordResetCodeMail,
    {
      provide: PasswordHasher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new PasswordHasher({
          logN: config.get('PASSWORD_HASH_LOG_N', { infer: true }),
        }),
    },
  ],
  // The global access-token guard, registered in AppModule, needs these two.
  exports: [SessionsService, AuthCookies],
})
export class AuthModule {}
