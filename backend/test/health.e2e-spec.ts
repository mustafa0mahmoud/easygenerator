import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Requires a reachable MongoDB (see MONGODB_URI in vitest.config.e2e.ts). */
describe('Application foundation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports the database as up', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      details: { mongodb: { status: 'up' } },
    });
  });

  it('attaches a server-generated request id to every response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'client-supplied-id');

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('sets security headers and hides the framework', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the uniform error body for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: expect.any(String),
      requestId: response.headers['x-request-id'],
      timestamp: expect.any(String),
      path: '/api/v1/does-not-exist',
    });
  });

  it('does not serve routes outside the versioned prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('serves the OpenAPI document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body.paths).toHaveProperty('/api/v1/health');
  });
});
