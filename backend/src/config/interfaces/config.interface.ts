import type { ConfigService } from '@nestjs/config';
import type { Env } from '../env.validation.js';

/** The configuration service, typed with the validated environment. */
export type AppConfigService = ConfigService<Env, true>;

/** The settings the logger is built from. */
export type LoggerEnv = Pick<Env, 'NODE_ENV' | 'LOG_LEVEL' | 'LOG_PRETTY'>;
