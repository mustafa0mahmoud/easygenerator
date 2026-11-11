import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Test files share one database, so they run one after another.
    fileParallelism: false,
    // End-to-end tests run against a real MongoDB on a dedicated database.
    env: {
      NODE_ENV: 'test',
      MONGODB_URI:
        process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/easygenerator_test',
      OTP_SECRET: 'e2e-only-otp-secret-0000000000000000000000',
      JWT_ACCESS_SECRET: 'e2e-only-jwt-secret-0000000000000000000000',
      // Production value, so the tests assert the real cookie attributes.
      COOKIE_SECURE: 'true',
      // Cheapest scrypt cost: the hashing strength is not what these tests check.
      PASSWORD_HASH_LOG_N: '10',
      // Lets each test act as a different client through X-Forwarded-For, so
      // the real per-IP rate limits stay active without tests tripping them.
      TRUST_PROXY_HOPS: '1',
      MAIL_DRIVER: 'console',
    },
  },
});
