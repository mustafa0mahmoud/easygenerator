# Full Stack Auth Task

Sign-up and sign-in module: a NestJS + MongoDB API and a TypeScript front end.

The application has six screens: sign in, sign up, email verification,
forgot password, new password, and the page behind sign-in.

## Requirements

- Docker with Docker Compose. Nothing else needs to be installed.

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

| What              | Where                               |
| ----------------- | ----------------------------------- |
| Application       | http://localhost:8080               |
| API               | http://localhost:3000/api/v1        |
| Health check      | http://localhost:3000/api/v1/health |
| OpenAPI (Swagger) | http://localhost:3000/api/docs      |

The application and the API share one origin: nginx serves the pages and
forwards `/api` to the API, so the browser calls
`http://localhost:8080/api/v1`. Port 3000 is published for direct access with
curl and Swagger.

Stop and remove the containers with `docker compose down` (add `-v` to also
delete the database volume).

### Getting the verification code locally

With the default `MAIL_DRIVER=console` no email leaves your machine: the
message, including the 6-digit code, is printed in the API log. The same
applies to password reset codes.

```bash
docker compose logs backend | grep "code is"
```

To send real email instead, set `MAIL_DRIVER=brevo`, `BREVO_API_KEY` and a
`MAIL_FROM_ADDRESS` that is a verified sender in your Brevo account.

## API

All routes are under `/api/v1`. Full request and response schemas are in
Swagger.

| Method | Route                        | Purpose                                         |
| ------ | ---------------------------- | ----------------------------------------------- |
| POST   | `/auth/signup`               | Create an account and email a verification code |
| POST   | `/auth/verify-email`         | Verify the address with the emailed code        |
| POST   | `/auth/resend-verification`  | Send a new code                                 |
| POST   | `/auth/login`                | Sign in; sets the session cookies               |
| POST   | `/auth/refresh`              | Renew the session (rotates the refresh token)   |
| POST   | `/auth/logout`               | Sign out; revokes the session server-side       |
| POST   | `/auth/forgot-password`      | Email a password reset code                     |
| POST   | `/auth/reset-password`       | Set a new password with the emailed code        |
| GET    | `/users/me`                  | The signed-in user (protected)                  |
| GET    | `/health`                    | Liveness and database connectivity              |

Field rules (enforced by the API, whatever the client does):

- **email**: valid format, trimmed and lowercased, at most 254 characters.
- **name**: 3 to 100 characters after trimming.
- **password**: 8 to 128 characters, with at least one letter, one number and
  one special character (anything that is not a letter, digit or whitespace).
- Unknown properties are rejected.

A user is returned as `id`, `email`, `name` and `createdAt` (ISO 8601, UTC),
by sign-in and by `GET /users/me`. Nothing else about the account leaves the
API.

### Trying the session from the command line

Cookies are HttpOnly, so use a cookie jar:

```bash
curl -c jar.txt -X POST http://localhost:3000/api/v1/auth/login -H "content-type: application/json" -d '{"email":"you@example.com","password":"Passw0rd!"}'
curl -b jar.txt http://localhost:3000/api/v1/users/me
curl -b jar.txt -c jar.txt -X POST http://localhost:3000/api/v1/auth/refresh
curl -b jar.txt -c jar.txt -X POST http://localhost:3000/api/v1/auth/logout
```

## Run the API on the host (optional)

Requires Node.js 22+. MongoDB still runs in Docker.

```bash
cp .env.example .env
docker compose up -d mongo
cd backend
npm ci
npm run start:dev
```

## Run the front end on the host (optional)

With the API running (either way above):

```bash
cd frontend
npm ci
npm run dev
```

The dev server listens on http://localhost:5173 and forwards `/api` to
`http://localhost:3000` (override with the `DEV_API_TARGET` environment
variable).

## Configuration

All configuration comes from environment variables, documented in
[`.env.example`](.env.example). They are validated at startup: the API refuses
to boot when a variable is missing or malformed. `.env` is never committed.

In production the API additionally refuses to start with the console mail
driver (it would write verification codes to the logs), with the example
`OTP_SECRET` or `JWT_ACCESS_SECRET`, or with `COOKIE_SECURE=false`.

## Deployment

The hosted version runs on free tiers, with the same one-origin shape as
Docker Compose:

```
browser ──> Vercel (static web app)
              └─ /api/* ──> Render (API container) ──> MongoDB Atlas
```

- **Web app** — Vercel, project root `frontend/`.
  [`frontend/vercel.json`](frontend/vercel.json) does what nginx does in
  Compose: it forwards `/api` to the API, sends every other path to the
  single-page app, and sets the same security and cache headers. The browser
  only talks to the Vercel origin, so the session cookies stay first-party.
- **API** — Render, from [`render.yaml`](render.yaml) (a Blueprint), built
  from `backend/Dockerfile`. Secrets are entered in the Render dashboard and
  never committed: `MONGODB_URI`, `BREVO_API_KEY`, `MAIL_FROM_ADDRESS` and
  `CSRF_TRUSTED_ORIGINS` (the web app's origin). `OTP_SECRET` and
  `JWT_ACCESS_SECRET` are generated by Render.
- **Database** — MongoDB Atlas (free cluster).

Three things differ from local on purpose:

- `NODE_ENV=production`, so the API enforces `COOKIE_SECURE=true`, real
  secrets and a real mail driver before it starts.
- `TRUST_PROXY_HOPS=2`: Vercel's proxy and Render's.
- `PASSWORD_HASH_LOG_N=15` instead of 17. The free Render instance has
  512 MB of memory and scrypt at 2^17 takes about 128 MiB per hash; this is a
  limit of the free tier, not a recommendation.

## Logging and debugging

Logs are JSON lines. Every line written while handling a request carries that
request's id (`req.id`), which is also returned to the client in the
`x-request-id` header and in error bodies.

Two kinds of lines are written on purpose:

- **Events** (`event`, at info/warn/error): outcomes worth keeping, such as
  `user_registered`, `email_verified` or `email_verification_failed`.
- **Steps** (`step`, at debug): every stage inside an operation, for example
  `signup.started`, `signup.password_hashed`, `signup.create_attempted`,
  `code.issue.stored`, `signup.completed`. They are silent by default.

To see where a request stopped, set `LOG_LEVEL=debug` in `.env`, restart the
API and follow one request id:

```bash
docker compose up -d
docker compose logs -f backend | grep "<request id>"
```

Neither kind of line contains an email address, a password, a verification
code or a hash. Keep `LOG_LEVEL=info` in production: a sign-up writes 3 lines
at info and 10 at debug.

## Quality checks

Run from `backend/`:

```bash
npm run lint       # static analysis
npm test           # unit tests
npm run test:e2e   # end-to-end tests (needs MongoDB: docker compose up -d mongo)
npm run build      # production build
```

End-to-end tests use a real MongoDB (database `easygenerator_test`) and the
real HTTP stack; only email delivery is replaced by an in-memory mailbox.
`test/user-journey.e2e-spec.ts` walks one user through the whole flow, from
sign-up to password reset and sign-out.

Run from `frontend/`:

```bash
npm run format:check   # formatting
npm run lint           # static analysis
npm test               # unit and component tests
npm run build          # type check + production bundle
```

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to
`main` and on every pull request. For the API: clean install from the
lockfile, lint, build, unit tests, end-to-end tests against a MongoDB service
container and an audit of production dependencies. For the front end: clean
install, formatting, lint, type check and build, tests and the same audit.
Both Docker images are built as well.

## Project structure

```
backend/
  src/
    config/            environment validation, logger configuration
    common/            cross-cutting pieces (exception filter, decorators, Mongo helpers)
    modules/
      auth/            sign-up, email verification, sign-in
        dto/           request schemas and shared field rules (Zod)
        guards/        global access-token guard
        one-time-codes/  emailed codes: schema, interfaces, repository, service, delivery
        password-reset/  forgotten-password flow
        sessions/      tokens: issue, rotate, revoke; cookie settings
      users/           user schema, interfaces, repository, current-user endpoint
      mail/            mail setup, Brevo and console transports, mail classes
      health/          liveness + database connectivity
    app.module.ts      module wiring
    app.setup.ts       HTTP configuration shared by the server and e2e tests
    main.ts            entry point
  test/                end-to-end tests
frontend/
  src/
    features/          one folder per feature; each exposes an index.ts
      auth/            sign-in, sign-up, verification and password reset
        pages/         one file per screen, each its own chunk
        components/    code boxes, password checklist, resend countdown
        hooks/         session, countdown, pending-code storage
        schemas/       form rules (Zod), mirroring the API's
        services/      the auth API calls
      home/            the page behind sign-in
    components/ui/     shared presentational components
    routes/            route table, layout, error and not-found pages
    lib/http/          the API client and its error types
    lib/query/         server-state cache settings
    config/            application settings
  nginx/               static hosting, /api proxy, security headers (Docker)
  vercel.json          the same routing and headers for the hosted version
docker-compose.yml     MongoDB + API + front end
render.yaml            hosted API definition (Render Blueprint)
.github/workflows/     CI pipeline
```

Each module owns its schemas (the layout used by the NestJS docs). Other
modules reach the data through the owning module's repository, never through
the Mongoose model.

## Front-end decisions

- **Feature folders.** Code is grouped by feature, not by file type. Each
  feature exposes one `index.ts`; nothing outside reaches into its folders.
- **Route-level code splitting.** Every page is its own chunk, requested when
  its route is first matched. While a chunk downloads the current page stays
  on screen under a progress bar. A chunk that fails to load (for example
  after a new release) lands on an error page that offers a reload.
- **One API client** (`src/lib/http`), a thin layer over `fetch`:
  - `fetch` resolves for 4xx and 5xx, so every response is checked with
    `response.ok`; a failure is thrown as an `ApiError` carrying the status,
    the API's message(s), its machine-readable `code` and the request id.
    Error bodies that are not the API's JSON (a proxy's HTML page, an empty
    body) are handled without crashing.
  - Every request accepts an `AbortSignal` and has a timeout. A cancellation
    by the caller is passed through untouched and is never shown as an error;
    an unreachable or slow server is a `NetworkError`.
  - An expired access token (401) triggers one refresh shared by all requests
    waiting on it, since the refresh token is single-use; the request is then
    sent again once. Endpoints where 401 is the real answer (sign-in) opt out.
- **Server state** goes through TanStack Query, which passes its own abort
  signal to the client: a query that is replaced or unmounted cancels its
  request, so a slow old response cannot overwrite a newer one. 4xx answers
  are never retried, and mutations are never retried automatically.
- **The session lives on the server.** The cookies are HttpOnly, so the page
  cannot read them and stores no token anywhere. It asks `GET /users/me` who
  is signed in and caches the answer; route guards read that cache. The guards
  only decide what to show: the API refuses every protected request on its
  own. If the API cannot be reached, the page says so rather than treating
  the visitor as signed out.
- **Signed-in pages** share a bar with an account menu (Profile, Log out).
  The menu follows the menu-button pattern: arrow keys, Home and End move
  between the items, Escape closes it and returns focus to the button, and a
  press elsewhere closes it. The profile page shows what `GET /users/me`
  returned, read from the cached session, so it makes no request of its own.
- **Forms** validate with the same rules as the API (react-hook-form + Zod)
  for instant feedback; the API stays the authority. The submit button is
  disabled while a request is running, so a form cannot be sent twice. API
  messages for 4xx are shown as they are (they are written to reveal nothing);
  a 5xx or an unexpected error is replaced by a fixed sentence.
- **Codes.** The verification and reset screens remember only the email
  address and when the last code was sent, in `sessionStorage`: the screen
  survives a reload, the one-minute "Resend code" countdown does not restart,
  and nothing is left behind when the tab closes. The countdown is computed
  from the clock, not decremented, so a sleeping tab cannot make it drift.
- **Accessibility.** Every input has a label, errors are tied to their field
  and announced, the code boxes work with paste, Backspace and arrow keys,
  and animations are disabled for users who ask for reduced motion.
- **Same origin.** The pages and the API share an origin in development (Vite
  proxy) and in the container (nginx), which keeps the cookies first-party and
  removes CORS entirely.
- **nginx** sends a strict Content-Security-Policy (no inline scripts or
  styles) and the usual hardening headers, caches fingerprinted assets for a
  year, always revalidates the HTML, and runs as a non-root user.

## Security decisions

- **Passwords** are hashed with scrypt (OWASP parameters, N=2^17) through
  NestJS's `PasswordHasher`. The hash is never returned by a query unless
  selected explicitly.
- **Sign-up says when an address is taken.** A registered address, verified
  or not, is rejected with `409` and nothing about the existing account
  changes. This is a deliberate trade: a clear answer for the user, at the cost
  of letting a caller learn that an address has an account (rate limited to 5
  sign-ups per minute per IP). Resend and verification still answer the same
  way on every path, and the verification email is sent after the response.
- **Verification codes** are 6 digits from a CSPRNG, valid for 5 minutes,
  destroyed after 5 wrong attempts (counted atomically), replaced when a new
  one is issued, and stored only as an HMAC keyed with `OTP_SECRET` and bound
  to the user and purpose.
- **Email bombing.** Besides per-IP rate limits, one address can be sent at
  most one code per minute, whatever IP asks.
- **Unverified accounts are kept as they are.** A later sign-up cannot
  replace their name or password; the owner signs in and verifies, or resets
  the password.
- **Sessions** are two tokens, both in `HttpOnly`, `SameSite=Strict`,
  `Secure` cookies, so page scripts cannot read them and the browser does not
  attach them to cross-site requests. Tokens never appear in a response body.
  - The **access token** is a JWT (HS256) valid for 15 minutes, verified
    without a database call. Algorithm, issuer and audience are pinned.
  - The **refresh token** is 256 random bits, stored only as a SHA-256 hash,
    valid for 7 days and **single-use**: exchanging it deletes it in the same
    database operation, so two concurrent requests cannot both succeed. Its
    cookie is scoped to `/api/v1/auth`.
  - **Sign-out is real**: it deletes the refresh token server-side.
- **Default-deny.** A global guard requires a valid access token on every
  route; public routes opt out explicitly with `@Public()`. A new endpoint is
  protected unless someone decides otherwise.
- **Sign-in does not reveal accounts.** A wrong password and an unknown
  address get the same error after the same hashing work (a dummy hash is
  checked for unknown addresses). "Email not verified" is only said after the
  correct password.
- **Password reset** uses the same kind of emailed code (5 minutes, 5
  attempts, one live code, HMAC at rest, bound to its purpose so a
  verification code cannot reset a password and vice versa). The request
  always answers the same way. A successful reset ends every session of the
  account and marks the address as verified, since receiving the code proves
  ownership. It does not sign the user in. A weak new password is rejected
  before the code is checked, so it does not cost an attempt.
- **CSRF**: `SameSite=Strict` cookies plus NestJS's built-in check, which
  refuses state-changing requests the browser reports as cross-origin
  (`Sec-Fetch-Site` / `Origin`).
- **Rate limits**: a global default plus stricter per-route limits on every
  auth endpoint.
- **Input**: strict schemas reject unknown properties; values are typed
  strings before they reach a query.
- **Logs** carry a request id, an event name and the user id. Email
  addresses, passwords, codes, cookies and request bodies are never logged
  (the console mail driver is the deliberate, development-only exception).
- **Errors** have one shape; internal details never reach the client.
- Security headers (Helmet), a non-root container user, secrets only through
  the environment.

## Known limits

- **The hosted API sleeps when idle** (Render's free tier). The first request
  after a quiet period can take up to a minute; the web app reports it as a
  timeout and the next attempt succeeds.
- **The hosted API can also be reached directly**, without going through
  Vercel. Protection does not depend on the proxy (cookies, CSRF check and
  rate limits are enforced by the API itself), but a direct caller sits one
  proxy closer than `TRUST_PROXY_HOPS` assumes and could present a forged
  address to the rate limiter. A paid setup would keep the API on a private
  network.
- **Checked by hand in Chromium-based browsers only**, at desktop and phone
  sizes, with keyboard-only use and a review of the accessibility tree.
  Firefox, Safari, a physical phone and an actual screen reader were not
  tested.

- **Address squatting.** Someone can register another person's address with
  a password of their own. They cannot verify it, but the real owner then gets
  "already registered" on sign-up. Password reset is the way out: the code goes
  to the owner, who sets a new password; that verifies the account and revokes
  every session (covered by an end-to-end test). The owner must reset rather
  than only verify, otherwise the squatter's password would stay valid.
- **No "your password was changed" notification email.** It would tell the
  owner about a reset they did not make; left out to limit scope.
- **An access token outlives sign-out by up to 15 minutes.** It is verified
  without the database, so it cannot be recalled; the short lifetime is the
  mitigation. The refresh token is revoked immediately.
- **No refresh-token reuse detection.** A stolen refresh token used before
  the owner's next refresh wins the session; the owner is signed out and
  signs in again, but the thief's session is not revoked automatically.
  Tracking token families would close this.
- **Sign-in is rate limited per IP, not per account.** A distributed guessing
  attack on one account is slowed only by the hash cost. Per-account lockout
  was left out on purpose: done naively it lets anyone lock a victim out.
- **Two tabs refreshing at once**: one succeeds, the other gets 401. The API
  does not clear cookies on a failed refresh, so the client can simply retry
  the original request with the cookies the first tab received.
- **Email is sent in-process**, after the response. If the process dies at
  that moment the email is lost and the user requests a new code. A queue or
  outbox is the production answer.
- **Indexes are created by the application at startup** (Mongoose
  `autoIndex`): the unique email index and the expiry indexes. Convenient
  here; a larger deployment would create them in a migration step and turn
  `autoIndex` off.
- **Rate-limit counters are in memory**: correct for one instance. Several
  instances need a shared store such as Redis.
- **Unknown routes are not rate limited** by the application (guards run on
  matched routes only); that belongs to the platform in front of it.
- `@nestjs/mail` and `@nestjs/authentication` are official NestJS packages but
  very recent (pre-1.0). Only the mailer and the standalone password hasher
  are used, both behind small providers that are easy to replace.
- Swagger is public and can be turned off with `SWAGGER_ENABLED=false`.
