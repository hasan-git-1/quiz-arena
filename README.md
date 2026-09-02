# QuizArena

QuizArena is a real-time classroom quiz platform. Teachers create and host quizzes, students join with a six-digit game PIN, and live game state, answers, scoring, and leaderboards are synchronized over WebSockets.

## Features

- Teacher signup and login with bcrypt password hashing and JWT sessions
- Quiz authoring with descriptions, ordered questions, images, answer options, time limits, and points
- Hosted games with collision-resistant six-digit PINs and QR-code join links
- Student lobby and nickname validation
- Public student entry at `/` with no account required; teacher signup and login are available at `/teacher/signup` and `/teacher/login`
- Real-time game phases, answer collection, answer reveals, scoring, streaks, leaderboards, and final podiums
- Redis-backed live game state with PostgreSQL persistence for application data
- Shared TypeScript event and API contracts in a workspace package
- Vite progressive web app build for the browser client

## Architecture

```text
                           +----------------------+
                           |      React + Vite    |
                           |  Teacher and student  |
                           +----------+-----------+
                                      |
                         REST API + Socket.IO
                                      |
                           +----------v-----------+
                           |   Express server     |
                           | Auth, quizzes, games |
                           +-----+------------+---+
                                 |            |
                    durable data |            | live state/events
                                 |            |
                         +-------v--+     +---v-----+
                         |PostgreSQL|     |  Redis  |
                         | Prisma   |     |  TTL    |
                         +----------+     +---------+
```

The repository is an npm workspaces monorepo orchestrated by Turborepo:

- `apps/web`: React 18, TypeScript, Vite, Socket.IO client, and PWA support.
- `apps/server`: Node.js, Express, Socket.IO, Zod validation, Prisma, PostgreSQL, Redis, bcrypt, and JWT.
- `packages/shared-types`: shared TypeScript models and Socket.IO event contracts.
- `apps/server/prisma`: database schema and migrations.

During a hosted game, PostgreSQL stores the durable game record while Redis stores the validated, expiring live state. The server's `GameStateManager` serializes state transitions and publishes typed events to connected teacher and student clients.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop with Compose, or accessible PostgreSQL and Redis instances

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local Compose environment file. Copy `.env.example` to `.env` and replace the placeholder with a local-only value. This file is ignored by Git.

3. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d
   ```

4. Create `apps/server/.env` from `apps/server/.env.example`. Set `DATABASE_URL` to use the same local PostgreSQL password, keep `REDIS_URL` pointed at the local Redis instance, and replace `JWT_SECRET` with a long random local value. Keep `WEB_APP_URL` at `http://localhost:5173` for local development.

5. Create `apps/web/.env` from `apps/web/.env.example`.

6. Generate Prisma Client and apply migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

7. Start both applications:

   ```bash
   npm run dev
   ```

The web app is served at `http://localhost:5173`. The API and Socket.IO server listen at `http://localhost:3001`; its health endpoint is `http://localhost:3001/api/health`.

## Environment variables

### Server (`apps/server/.env`)

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP and Socket.IO listening port. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string for live game state. |
| `JWT_SECRET` | Private signing key for teacher and student sessions. Use a long random value. |
| `WEB_APP_URL` | Public web origin allowed by CORS and used in QR-code join URLs. |

### Web (`apps/web/.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Public base URL for the REST API. |
| `VITE_SOCKET_URL` | Public URL for the Socket.IO server. |

Only the `VITE_*` values are bundled into the browser. Never place database URLs, JWT secrets, passwords, admin credentials, or private service tokens in the web environment.

## Useful commands

```bash
npm run typecheck    # Type-check every workspace
npm run build        # Build shared types, server, and web app
npm run build:server # Build the server and shared types for API hosting
npm start            # Start the built server
npm run db:generate  # Generate Prisma Client
npm run db:migrate   # Apply committed migrations
npm run dev          # Run workspace development servers
```

## Production deployment outline

The web client and realtime API are separate deployable services. A typical deployment uses Vercel for `apps/web` and Render or another Node-capable host for `apps/server`, with managed PostgreSQL and Redis services.

The repository includes provider configuration for the recommended split deployment:

- `render.yaml` defines the Node web service, server-only build, Prisma migration release step, health check, and secret variable names.
- `vercel.json` defines the Vite build output and rewrites browser routes such as `/join` to the SPA entry point.

For a Render backend and Vercel frontend:

- Create the Render service from this repository, or use the included `render.yaml` blueprint. Keep the repository root as the service root so npm workspaces and `packages/shared-types` are available.
- Render uses `npm ci && npm run db:generate && npm run db:migrate:deploy && npm run build:server`, starts with `npm start`, and checks `/api/health`. The migration runs during the build because the free Render plan does not provide a pre-deploy command.
- Create the Vercel project from this repository with the repository root as its project root so `vercel.json` can select `apps/web` output. Alternatively set the equivalent commands manually.
- Set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `WEB_APP_URL`, and `PORT` as server-side platform environment variables.
- Set `VITE_API_URL` and `VITE_SOCKET_URL` as web build environment variables before building.
- Run `npm run db:migrate` in the server release/deploy step before starting the server.
- Configure the web origin exactly in `WEB_APP_URL`; Socket.IO and REST CORS are intentionally restricted to that origin.
- Use TLS URLs (`https://` and `wss://` via the platform) and managed database/Redis credentials.
- Add health-check monitoring for `/api/health` and retain secrets only in the hosting provider's secret store.

The exact provider settings depend on the selected services and should be configured in their dashboards rather than committed to this repository.

## Security notes

- Real `.env` files are ignored and must never be committed.
- `.env.example` files contain placeholders only.
- Passwords are hashed with bcrypt; password hashes are never returned by the API.
- Request payloads and persisted live state are validated with Zod.
- Teacher quiz and game routes require JWT authentication and enforce teacher ownership.
- Production secrets, database credentials, and platform access tokens belong in deployment secret stores, not source control.

## License

No open-source license has been selected yet. Add a license before accepting external contributions or redistributing the project.