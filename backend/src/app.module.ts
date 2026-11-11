import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { validateEnv } from './config/env.validation.js';
import type { AppConfigService } from './config/interfaces/config.interface.js';
import { buildLoggerOptions } from './config/logger.config.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AccessTokenGuard } from './modules/auth/guards/access-token.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { AppMailModule } from './modules/mail/mail.module.js';

const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5000;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Root .env is shared with Docker Compose; the first existing file wins.
      envFilePath: ['.env', '../.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) =>
        buildLoggerOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
          LOG_PRETTY: config.get('LOG_PRETTY', { infer: true }),
        }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: seconds(config.get('THROTTLE_TTL_SECONDS', { infer: true })),
          limit: config.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    AppMailModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Global guards run in this order: rate limit first, so unauthenticated
    // floods are cut off before any token is verified.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every route requires a valid access token unless marked @Public().
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
