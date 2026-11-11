import type { ConfigService } from '@nestjs/config';
import type { Env } from '../env.validation.js';

export type AppConfigService = ConfigService<Env, true>;

export type LoggerEnv = Pick<Env, 'NODE_ENV' | 'LOG_LEVEL' | 'LOG_PRETTY'>;
