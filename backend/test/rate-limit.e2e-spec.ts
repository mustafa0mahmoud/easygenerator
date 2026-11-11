import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Public } from '../src/common/decorators/public.decorator.js';
import { setupApp } from '../src/app.setup.js';

// Configuration is read when AppModule is imported, so the low limit has to
// be in the environment before the imports above are evaluated.
const LIMIT = vi.hoisted(() => {
  const limit = 3;
  vi.stubEnv('THROTTLE_LIMIT', String(limit));
  return limit;
});

/** Stand-in for any feature controller: it declares no throttling of its own. */
@Public()
@Controller('probe')
class ProbeController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Proves the global rate limit is wired at application level, so every
 * controller added later is protected without opting in.
 */
describe('Global rate limit (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('rejects requests over the limit with the uniform 429 body', async () => {
    const server = app.getHttpServer();

    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await request(server).get('/api/v1/probe').expect(200);
    }

    const blocked = await request(server).get('/api/v1/probe').expect(429);

    expect(blocked.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      path: '/api/v1/probe',
    });
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('keeps the health endpoint reachable while a client is throttled', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
