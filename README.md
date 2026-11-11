# Full Stack Auth Task

A sign-up and sign-in module: a NestJS + MongoDB API and a React + TypeScript
front end.

How AI assistance was used is described in [AI.md](AI.md).

## Live demo

| What              | Where                                         |
| ----------------- | --------------------------------------------- |
| Application       | https://easygenerator-web.vercel.app          |
| OpenAPI (Swagger) | https://easygenerator-web.vercel.app/api/docs |

Create an account with a real email address: a 6-digit verification code is
sent to it. The first request after a quiet period can take a few seconds
while the API container starts.

## What is in it

- **Screens:** sign in, sign up, email verification, forgot password, new
  password, and behind sign-in a welcome page and a profile page.
- **Front end:** React 19, TypeScript, Vite, Tailwind CSS, React Router,
  TanStack Query, react-hook-form with Zod.
- **API:** NestJS, MongoDB with Mongoose, Zod validation, structured logs,
  Swagger.
- **Sessions:** a 15-minute access token and a single-use refresh token, both
  in `HttpOnly`, `SameSite=Strict` cookies.
- **Email:** 6-digit codes for verification and password reset, valid for
  5 minutes.

## Run it locally

You need Docker with Docker Compose. Nothing else has to be installed.

1. Create the configuration file. The defaults work as they are.

   ```bash
   cp .env.example .env
   ```

2. Build and start MongoDB, the API and the front end.

   ```bash
   docker compose up --build
   ```

3. Open the application.

   | What              | Where                               |
   | ----------------- | ----------------------------------- |
   | Application       | http://localhost:8080               |
   | API               | http://localhost:3000/api/v1        |
   | Health check      | http://localhost:3000/api/v1/health |
   | OpenAPI (Swagger) | http://localhost:3000/api/docs      |

4. Sign up. Locally no email leaves your machine: the message, including the
   6-digit code, is printed in the API log. The same applies to password
   reset codes.

   ```bash
   docker compose logs backend | grep "code is"
   ```

Stop and remove the containers with `docker compose down` (add `-v` to also
delete the database volume).

The application and the API share one origin: nginx serves the pages and
forwards `/api` to the API, so the browser calls
`http://localhost:8080/api/v1`. Port 3000 is published for direct access with
curl and Swagger.

## Configuration

All configuration comes from environment variables. Copy
[`.env.example`](.env.example) to `.env`; every variable is described there.
`.env` is never committed.

| Variable                   | Default                | Purpose                                                                    |
| -------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`          | `development`, `production` or `test`                                      |
| `PORT`                     | `3000`                 | Port the API listens on                                                    |
| `MONGODB_URI`              | required               | Connection string, including the database name                             |
| `LOG_LEVEL`                | `info`                 | `debug` adds a line for every step of a request                            |
| `LOG_PRETTY`               | `false`                | Human-readable logs instead of JSON lines (development only)               |
| `TRUST_PROXY_HOPS`         | `0`                    | Reverse proxies in front of the API, so rate limits see the real client IP |
| `THROTTLE_TTL_SECONDS`     | `60`                   | Window of the global rate limit                                            |
| `THROTTLE_LIMIT`           | `100`                  | Requests allowed per window and IP                                         |
| `SWAGGER_ENABLED`          | `true`                 | Serve the OpenAPI UI at `/api/docs`                                        |
| `MAIL_DRIVER`              | `console`              | `console` prints emails to the log; `brevo` sends them                     |
| `MAIL_FROM_NAME`           | `Auth Task`            | Sender name                                                                |
| `MAIL_FROM_ADDRESS`        | `no-reply@example.com` | Sender address; with Brevo it must be a verified sender                    |
| `BREVO_API_KEY`            | none                   | Required when `MAIL_DRIVER=brevo`                                          |
| `OTP_SECRET`               | required               | Keys the hash of emailed codes; at least 32 characters                     |
| `JWT_ACCESS_SECRET`        | required               | Signs access tokens; at least 32 characters                                |
| `ACCESS_TOKEN_TTL_SECONDS` | `900`                  | Access token lifetime (60 to 3600)                                         |
| `REFRESH_TOKEN_TTL_DAYS`   | `7`                    | Refresh token lifetime                                                     |
| `COOKIE_SECURE`            | `true`                 | `Secure` attribute on the session cookies; `false` only for local HTTP     |
| `CSRF_TRUSTED_ORIGINS`     | empty                  | Extra origins allowed to send state-changing requests, comma-separated     |
| `PASSWORD_HASH_LOG_N`      | `17`                   | scrypt cost (log2 N); 17 is the OWASP minimum                              |

The "Default" column is what the API uses when the variable is absent;
"required" means it refuses to start without it. `.env.example` provides a
local MongoDB address and development-only secrets, and sets a few variables
differently for local use (`LOG_PRETTY=true`, `COOKIE_SECURE=false`).

The variables are validated at startup: the API refuses to boot when one is
missing or malformed. In production it additionally refuses to start with the
console mail driver (it would write verification codes to the logs), with the
example `OTP_SECRET` or `JWT_ACCESS_SECRET`, or with `COOKIE_SECURE=false`.

To send real email locally, set `MAIL_DRIVER=brevo`, `BREVO_API_KEY` and a
`MAIL_FROM_ADDRESS` that is a verified sender in your Brevo account.

## API

All routes are under `/api/v1`. Full request and response schemas are in
Swagger.

| Method | Route                       | Purpose                                         |
| ------ | --------------------------- | ----------------------------------------------- |
| POST   | `/auth/signup`              | Create an account and email a verification code |
| POST   | `/auth/verify-email`        | Verify the address with the emailed code        |
| POST   | `/auth/resend-verification` | Send a new code                                 |
| POST   | `/auth/login`               | Sign in; sets the session cookies               |
| POST   | `/auth/refresh`             | Renew the session (rotates the refresh token)   |
| POST   | `/auth/logout`              | Sign out; revokes the session server-side       |
| POST   | `/auth/forgot-password`     | Email a password reset code                     |
| POST   | `/auth/reset-password`      | Set a new password with the emailed code        |
| GET    | `/users/me`                 | The signed-in user (protected)                  |
| GET    | `/health`                   | Liveness and database connectivity              |

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

## Run without Docker (optional)

Requires Node.js 22+. MongoDB still runs in Docker.

The API:

```bash
cp .env.example .env
docker compose up -d mongo
cd backend
npm ci
npm run start:dev
```

The front end, with the API running either way:

```bash
cd frontend
npm ci
npm run dev
```

The dev server listens on http://localhost:5173 and forwards `/api` to
`http://localhost:3000` (override with the `DEV_API_TARGET` environment
variable).

## Deployment

The live demo runs on free tiers, with the same one-origin shape as Docker
Compose:

```
browser ──> Vercel project "web" (static front end)
              └─ /api/* ──> Vercel project "api" (container) ──> MongoDB Atlas
```

- **Front end**: a Vercel project with root directory `frontend/`.
  [`frontend/vercel.json`](frontend/vercel.json) does what nginx does in
  Compose: it forwards `/api` to the API project, sends every other path to
  the single-page app, and sets the same security and cache headers. The
  browser only talks to one origin, so the session cookies stay first-party.
- **API**: a second Vercel project with root directory `backend/` and the
  **Container** framework preset. Vercel builds
  [`backend/Dockerfile`](backend/Dockerfile) and runs it, so the hosted API is
  the same image as in Compose and CI. It runs in Frankfurt, next to the
  database.
- **Database**: MongoDB Atlas, free cluster, also in Frankfurt.

Both projects redeploy on every push to `main`.

Environment variables set on the API project (values live only in the Vercel
dashboard, never in the repository):

| Variable               | Value                                          |
| ---------------------- | ---------------------------------------------- |
| `PORT`                 | `80`, the port Vercel routes to in a container |
| `MONGODB_URI`          | secret                                         |
| `OTP_SECRET`           | secret, random                                 |
| `JWT_ACCESS_SECRET`    | secret, random                                 |
| `MAIL_DRIVER`          | `brevo`                                        |
| `BREVO_API_KEY`        | secret                                         |
| `MAIL_FROM_ADDRESS`    | the verified sender                            |
| `COOKIE_SECURE`        | `true`                                         |
| `CSRF_TRUSTED_ORIGINS` | the front end's origin                         |
| `TRUST_PROXY_HOPS`     | `2`                                            |
| `LOG_PRETTY`           | `false`                                        |

`NODE_ENV=production` comes from the Dockerfile, so the API enforces
`COOKIE_SECURE=true`, real secrets and a real mail driver before it starts.
Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

To deploy your own copy: create the two Vercel projects from this repository
with the root directories above, set the variables on the API project, and
change the `/api` destination in `frontend/vercel.json` to your API project's
domain.

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
  Dockerfile           the API image (Compose, CI and the hosted version)
frontend/
  src/
    features/          one folder per feature; each exposes an index.ts
      auth/            sign-in, sign-up, verification and password reset
        pages/         one file per screen, each its own chunk
        components/    code boxes, password checklist, resend countdown
        hooks/         session, countdown, pending-code storage
        schemas/       form rules (Zod), mirroring the API's
        services/      the auth API calls
      home/            the pages behind sign-in
    components/ui/     shared presentational components
    routes/            route table, layout, error and not-found pages
    lib/http/          the API client and its error types
    lib/query/         server-state cache settings
    config/            application settings
  nginx/               static hosting, /api proxy, security headers (Docker)
  vercel.json          the same routing and headers for the hosted version
docker-compose.yml     MongoDB + API + front end
.github/workflows/     CI pipeline
```

Each module owns its schemas (the layout used by the NestJS docs). Other
modules reach the data through the owning module's repository, never through
the Mongoose model.

## 2. What was AI-assisted

Almost all of the code was written by the assistant. What I own is what it
was asked to build, the decisions behind it, and the review of every part
before it was committed.
| Area | Generated by AI | Decided or changed by me | How it was verified |
| --- | --- | --- | --- |
| API foundation | Config validation, logging, error filter, Dockerfile | Everything runs with one Docker command; schema layout taken from the NestJS docs, not the assistant's own | Unit tests, container run |
| Sign-up and verification | Endpoints, code storage, mail transports | Adding verification at all; a code instead of a link; 5-minute lifetime; a real free mail provider instead of console output only; "already registered" instead of a uniform answer | Tests, real email delivered |
| Sessions | Token issue, rotation, guard, cookies | Short access token plus refresh, chosen from the options discussed; hand-written sessions instead of a very new library; rate limits on every auth endpoint | Tests, cookie-jar run by hand |
| Password reset | Service, endpoints, mail | Adding it at all; one shared delivery function instead of two copies | End-to-end journey test, real email |
| Web app foundation | Fetch client, routing, build setup | Four requirements set before any code: feature folders, code splitting, request cancellation, explicit HTTP error handling | Tests, checked in the browser |
| Screens and design | Components, forms, animations | The whole look, iterated in a prototype before any React; the owl that watches the fields; the resend countdown | Browser at desktop and phone size |
| CI and deployment | Workflow, hosting configuration | Deploying at all and giving the reviewer a live link, proposed before the first line of code; nothing pushed until I had reviewed everything | Green run on GitHub, live site |
