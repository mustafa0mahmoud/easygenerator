import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ErrorResponseBody } from '../interfaces/error-response.interface.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createFilter() {
  const reply = vi.fn();
  const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
  return { filter: new AllExceptionsFilter(adapterHost), reply };
}

function createHost(request: Record<string, unknown>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;
}

function sentBody(reply: ReturnType<typeof vi.fn>): ErrorResponseBody {
  return reply.mock.calls[0][1] as ErrorResponseBody;
}

describe('AllExceptionsFilter', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the uniform error shape for an HTTP exception', () => {
    const { filter, reply } = createFilter();

    filter.catch(
      new NotFoundException('User not found'),
      createHost({ id: 'req-1', url: '/api/v1/users/me' }),
    );

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      HttpStatus.NOT_FOUND,
    );
    expect(sentBody(reply)).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
      requestId: 'req-1',
      timestamp: expect.any(String),
      path: '/api/v1/users/me',
    });
  });

  it('keeps the list of validation messages', () => {
    const { filter, reply } = createFilter();
    const messages = ['email must be an email', 'name is too short'];

    filter.catch(
      new BadRequestException(messages),
      createHost({ url: '/api/v1/auth/signup' }),
    );

    expect(sentBody(reply).message).toEqual(messages);
    expect(sentBody(reply).statusCode).toBe(400);
  });

  it('hides the details of an unexpected error and logs it', () => {
    const { filter, reply } = createFilter();
    const error = new Error('connect ECONNREFUSED mongodb://admin:pw@10.0.0.5');

    filter.catch(error, createHost({ id: 'req-2', url: '/api/v1/auth/login' }));

    const body = sentBody(reply);
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(errorLog).toHaveBeenCalledWith(error.message, error.stack);
  });

  it('handles a thrown value that is not an Error', () => {
    const { filter, reply } = createFilter();

    filter.catch('boom', createHost({ url: '/api/v1/health' }));

    expect(sentBody(reply).statusCode).toBe(500);
    expect(sentBody(reply).message).toBe('Internal server error');
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it('does not log client errors as server errors', () => {
    const { filter } = createFilter();

    filter.catch(
      new BadRequestException('bad input'),
      createHost({ url: '/x' }),
    );

    expect(errorLog).not.toHaveBeenCalled();
  });

  it('falls back to the status text when the exception body has no message', () => {
    const { filter, reply } = createFilter();
    const exception = new HttpException(
      { status: 'error', details: { db: 'down' } },
      503,
    );

    filter.catch(exception, createHost({ url: '/api/v1/health' }));

    expect(sentBody(reply).message).toBe('Service Unavailable');
    expect(JSON.stringify(sentBody(reply))).not.toContain('details');
  });

  it('passes through a machine-readable code supplied by the thrower', () => {
    const { filter, reply } = createFilter();
    const exception = new ForbiddenException({
      message: 'Email address is not verified.',
      code: 'email_not_verified',
    });

    filter.catch(exception, createHost({ url: '/api/v1/auth/login' }));

    expect(sentBody(reply)).toMatchObject({
      statusCode: 403,
      message: 'Email address is not verified.',
      code: 'email_not_verified',
    });
  });

  it('omits the code when none was supplied, and ignores a non-string one', () => {
    const { filter, reply } = createFilter();

    filter.catch(new NotFoundException(), createHost({ url: '/x' }));
    filter.catch(
      new ForbiddenException({ message: 'no', code: 42 }),
      createHost({ url: '/x' }),
    );

    expect(reply.mock.calls[0][1]).not.toHaveProperty(
      'code',
      expect.anything(),
    );
    expect((reply.mock.calls[1][1] as { code?: unknown }).code).toBeUndefined();
  });

  it('strips the query string from the reported path', () => {
    const { filter, reply } = createFilter();

    filter.catch(
      new NotFoundException(),
      createHost({ url: '/api/v1/x?email=a@b.c' }),
    );

    expect(sentBody(reply).path).toBe('/api/v1/x');
  });

  it('reports the original path, not the one rewritten by the router', () => {
    const { filter, reply } = createFilter();

    filter.catch(
      new NotFoundException(),
      createHost({ originalUrl: '/api/v1/nope?x=1', url: '/v1/nope?x=1' }),
    );

    expect(sentBody(reply).path).toBe('/api/v1/nope');
  });

  it('omits the request id when the request has none', () => {
    const { filter, reply } = createFilter();

    filter.catch(new NotFoundException(), createHost({ url: '/x' }));

    expect(sentBody(reply).requestId).toBeUndefined();
  });
});
