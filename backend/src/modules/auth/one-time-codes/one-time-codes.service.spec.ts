import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.validation.js';
import { ONE_TIME_CODE } from '../auth.constants.js';
import type {
  NewCode,
  StoredCode,
} from './interfaces/one-time-code.interface.js';
import type { OneTimeCodesRepository } from './one-time-codes.repository.js';
import { OneTimeCodesService } from './one-time-codes.service.js';
import type { OneTimeCodePurpose } from './schemas/one-time-code.schema.js';

const USER = '656f6e652d74696d652d636f';
const OTHER_USER = '616e6f746865722d75736572';
const PURPOSE: OneTimeCodePurpose = 'email_verification';
const START = new Date('2026-01-01T10:00:00.000Z');

/** In-memory stand-in with the same contract as the MongoDB repository. */
class FakeCodesRepository {
  readonly rows = new Map<string, StoredCode>();

  private key(userId: string, purpose: string): string {
    return `${userId}:${purpose}`;
  }

  replace(
    userId: string,
    purpose: OneTimeCodePurpose,
    code: NewCode,
  ): Promise<void> {
    this.rows.set(this.key(userId, purpose), { ...code, attempts: 0 });
    return Promise.resolve();
  }

  find(
    userId: string,
    purpose: OneTimeCodePurpose,
  ): Promise<StoredCode | null> {
    return Promise.resolve(this.rows.get(this.key(userId, purpose)) ?? null);
  }

  consumeAttempt(
    userId: string,
    purpose: OneTimeCodePurpose,
    now: Date,
    maxAttempts: number,
  ): Promise<StoredCode | null> {
    const row = this.rows.get(this.key(userId, purpose));
    if (!row || row.expiresAt <= now || row.attempts >= maxAttempts) {
      return Promise.resolve(null);
    }
    row.attempts += 1;
    return Promise.resolve({ ...row });
  }

  delete(userId: string, purpose: OneTimeCodePurpose): Promise<void> {
    this.rows.delete(this.key(userId, purpose));
    return Promise.resolve();
  }
}

function createService(secret = 'unit-test-secret-with-at-least-32-chars') {
  const repository = new FakeCodesRepository();
  const config = { get: () => secret } as unknown as ConfigService<Env, true>;
  const service = new OneTimeCodesService(
    repository as unknown as OneTimeCodesRepository,
    config,
  );
  return { service, repository };
}

function wrongCodeFor(code: string): string {
  return code === '000000' ? '000001' : '000000';
}

describe('OneTimeCodesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    // Keeps the step trace out of the test output.
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('issue', () => {
    it('returns a 6-digit code that expires in 5 minutes', async () => {
      const { service } = createService();

      const { code, expiresAt } = await service.issue(USER, PURPOSE);

      expect(code).toMatch(/^\d{6}$/);
      expect(expiresAt.getTime() - START.getTime()).toBe(5 * 60_000);
    });

    it('stores a hash, never the code itself', async () => {
      const { service, repository } = createService();

      const { code } = await service.issue(USER, PURPOSE);

      const stored = [...repository.rows.values()][0];
      expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(code);
    });

    it('invalidates the previous code when a new one is issued', async () => {
      const { service } = createService();
      const first = await service.issue(USER, PURPOSE);
      let second = await service.issue(USER, PURPOSE);
      while (second.code === first.code) {
        second = await service.issue(USER, PURPOSE);
      }

      expect(await service.verify(USER, PURPOSE, first.code)).toBe(false);
      expect(await service.verify(USER, PURPOSE, second.code)).toBe(true);
    });
  });

  describe('verify', () => {
    it('accepts the correct code exactly once', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      expect(await service.verify(USER, PURPOSE, code)).toBe(true);
      expect(await service.verify(USER, PURPOSE, code)).toBe(false);
    });

    it('rejects a wrong code and keeps the real one usable', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      expect(await service.verify(USER, PURPOSE, wrongCodeFor(code))).toBe(
        false,
      );
      expect(await service.verify(USER, PURPOSE, code)).toBe(true);
    });

    it('rejects when no code was issued', async () => {
      const { service } = createService();

      expect(await service.verify(USER, PURPOSE, '123456')).toBe(false);
    });

    it('rejects an expired code', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      vi.setSystemTime(new Date(START.getTime() + ONE_TIME_CODE.TTL_MS));

      expect(await service.verify(USER, PURPOSE, code)).toBe(false);
    });

    it('accepts a code one millisecond before it expires', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      vi.setSystemTime(new Date(START.getTime() + ONE_TIME_CODE.TTL_MS - 1));

      expect(await service.verify(USER, PURPOSE, code)).toBe(true);
    });

    it('destroys the code after 5 wrong attempts, so the right one no longer works', async () => {
      const { service, repository } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      for (
        let attempt = 0;
        attempt < ONE_TIME_CODE.MAX_ATTEMPTS;
        attempt += 1
      ) {
        expect(await service.verify(USER, PURPOSE, wrongCodeFor(code))).toBe(
          false,
        );
      }

      expect(await service.verify(USER, PURPOSE, code)).toBe(false);
      expect(repository.rows.size).toBe(0);
    });

    it('still accepts the correct code on the last allowed attempt', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      for (
        let attempt = 0;
        attempt < ONE_TIME_CODE.MAX_ATTEMPTS - 1;
        attempt += 1
      ) {
        await service.verify(USER, PURPOSE, wrongCodeFor(code));
      }

      expect(await service.verify(USER, PURPOSE, code)).toBe(true);
    });

    it('does not accept a code for a user who has none', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      expect(await service.verify(OTHER_USER, PURPOSE, code)).toBe(false);
    });

    it('does not accept a code for a different purpose', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, 'email_verification');

      expect(await service.verify(USER, 'password_reset', code)).toBe(false);
    });

    it('binds the stored hash to the user and the purpose', async () => {
      const { service, repository } = createService();
      vi.spyOn(
        service as unknown as { generate: () => string },
        'generate',
      ).mockReturnValue('123456');

      await service.issue(USER, 'email_verification');
      await service.issue(USER, 'password_reset');
      await service.issue(OTHER_USER, 'email_verification');

      const hashes = [...repository.rows.values()].map((row) => row.codeHash);
      expect(new Set(hashes).size).toBe(3);
    });

    it('produces a different hash under a different secret', async () => {
      const first = createService('first-secret-with-at-least-32-characters');
      const second = createService('second-secret-with-at-least-32-character');
      for (const { service } of [first, second]) {
        vi.spyOn(
          service as unknown as { generate: () => string },
          'generate',
        ).mockReturnValue('123456');
        await service.issue(USER, PURPOSE);
      }

      const [hashA] = [...first.repository.rows.values()].map(
        (row) => row.codeHash,
      );
      const [hashB] = [...second.repository.rows.values()].map(
        (row) => row.codeHash,
      );
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('debug trace', () => {
    it('logs each step without ever writing the code or its hash', async () => {
      const lines: unknown[][] = [];
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(
        (...args: unknown[]) => {
          lines.push(args);
        },
      );
      const { service, repository } = createService();

      const { code } = await service.issue(USER, PURPOSE);
      const { codeHash } = [...repository.rows.values()][0];
      await service.verify(USER, PURPOSE, wrongCodeFor(code));
      await service.verify(USER, PURPOSE, code);

      const steps = lines.map(
        ([payload]) => (payload as { step: string }).step,
      );
      expect(steps).toEqual([
        'code.issue.started',
        'code.issue.stored',
        'code.verify.started',
        'code.verify.compared',
        'code.verify.started',
        'code.verify.compared',
        'code.verify.destroyed',
      ]);
      const written = JSON.stringify(lines);
      expect(written).not.toContain(code);
      expect(written).not.toContain(wrongCodeFor(code));
      expect(written).not.toContain(codeHash);
    });
  });

  describe('isInCooldown', () => {
    it('is false when no code exists', async () => {
      const { service } = createService();

      expect(await service.isInCooldown(USER, PURPOSE)).toBe(false);
    });

    it('is true right after a code is issued and false once the cooldown passed', async () => {
      const { service } = createService();
      await service.issue(USER, PURPOSE);

      expect(await service.isInCooldown(USER, PURPOSE)).toBe(true);

      vi.setSystemTime(
        new Date(START.getTime() + ONE_TIME_CODE.RESEND_COOLDOWN_MS - 1),
      );
      expect(await service.isInCooldown(USER, PURPOSE)).toBe(true);

      vi.setSystemTime(
        new Date(START.getTime() + ONE_TIME_CODE.RESEND_COOLDOWN_MS),
      );
      expect(await service.isInCooldown(USER, PURPOSE)).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('removes the live code', async () => {
      const { service } = createService();
      const { code } = await service.issue(USER, PURPOSE);

      await service.invalidate(USER, PURPOSE);

      expect(await service.verify(USER, PURPOSE, code)).toBe(false);
    });
  });
});
