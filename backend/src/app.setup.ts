import { StandardSchemaValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';
import helmetImport from 'helmet';
import type { Env } from './config/env.validation.js';
import { ACCESS_TOKEN_COOKIE } from './modules/auth/sessions/auth-cookies.js';

// helmet ships separate ESM and CommonJS typings without a "types" export
// condition. Node always loads the ESM build here, where the default export
// is the middleware factory, but a type checker that picks the CommonJS
// typings (Vercel's build does) sees a module namespace and rejects the call.
// Stating the type once keeps both checkers in agreement; the security-header
// end-to-end tests cover the runtime behaviour this cast cannot.
const helmet = helmetImport as unknown as () => RequestHandler;

export const GLOBAL_PREFIX = 'api';
export const DEFAULT_API_VERSION = '1';
export const SWAGGER_PATH = `${GLOBAL_PREFIX}/docs`;

/**
 * HTTP-level configuration shared by the real server and the end-to-end
 * tests, so tests exercise the same prefix, versioning and middleware.
 */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Must come before any middleware. Session cookies are SameSite=Strict
  // already; this adds a server-side check that refuses state-changing
  // requests a browser reports as cross-origin.
  const trustedOrigins = config.get('CSRF_TRUSTED_ORIGINS', { infer: true });
  app.enableCsrfProtection(
    trustedOrigins.length > 0 ? { trustedOrigins } : undefined,
  );

  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });
  // Validates every parameter that declares a schema; strict schemas reject
  // unknown properties.
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }
}

function setupSwagger(app: NestExpressApplication): void {
  const documentConfig = new DocumentBuilder()
    .setTitle('Auth API')
    .setDescription(
      'Sign-up, email verification, sign-in, session renewal, sign-out and password reset.',
    )
    .setVersion('1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE)
    .build();

  SwaggerModule.setup(SWAGGER_PATH, app, () =>
    SwaggerModule.createDocument(app, documentConfig),
  );
}
