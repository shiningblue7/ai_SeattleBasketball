# SeattleBasketball (Next.js + Prisma + Postgres)

This repo runs a Next.js app backed by Postgres (via Prisma). It supports:

- Local dev via `npm run dev`
- Docker Compose for local Postgres + one-off migrations
- A production-style deployment on a Unix server via Docker Compose, with Caddy in front

This README is intentionally operational: it’s meant to be the “I forgot how to run this” guide.

## Prerequisites

- Node.js 20
- Docker + Docker Compose

## Environment variables

Create a local `.env` file (not committed) based on `.env.example`.

Minimum required for local dev:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- OAuth provider secrets (Google/GitHub/Discord as configured)

Local example:

```bash
DATABASE_URL=postgresql://seattlebasketball:change_me@localhost:5432/seattlebasketball?schema=public
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Local development

There are 2 common workflows. Pick one.

### Option A (recommended): run Next.js locally + Postgres via Docker

1) Start Postgres:

```bash
docker compose up -d db
```

2) Run Prisma migrations against the local DB:

```bash
docker compose run --rm migrate npx prisma migrate deploy
```

3) Run the app locally:

```bash
npm install
npm run dev
```

Then open:

- http://localhost:3000

This is the easiest “fast iteration” setup.

### Option B: run Caddy locally (Docker) as a reverse proxy

This is useful if you want:

- HTTPS locally (Caddy `tls internal`)
- A stable domain/host entry

There are 2 Caddy configs in this repo:

- `Caddyfile` (reverse proxies to the Docker service `app:3000`)
- `Caddyfile.dev` (reverse proxies to `host.docker.internal:3000`, i.e. a Next dev server running on your host)

#### B1) Use Caddy with host Next dev server (Mac)

1) Start Postgres (Docker):

```bash
docker compose up -d db
```

2) Run the app on the host:

```bash
npm run dev
```

3) Start only the Caddy container using `Caddyfile.dev`:

```bash
docker run --rm -d \
  --name seattlebasketball-caddy-dev \
  -p 80:80 -p 443:443 \
  -v "$PWD/Caddyfile.dev:/etc/caddy/Caddyfile:ro" \
  -v seattlebasketball_caddy_data:/data \
  -v seattlebasketball_caddy_config:/config \
  caddy:2-alpine
```

Then open:

- https://localhost

Notes:

- `host.docker.internal` works on macOS Docker Desktop.
- On Linux, you may need to replace it with your host IP or Docker gateway.

#### B2) Full Docker stack (app + db + caddy)

If you want everything containerized:

```bash
docker compose up -d --build
```

Then open:

- https://localhost

In this mode, Caddy uses `Caddyfile` and proxies to the `app` service in Docker.

## Common local commands

- Check container status:

```bash
docker compose ps
```

- View logs:

```bash
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 db
docker compose logs -f --tail=200 caddy
```

- Re-run migrations:

```bash
docker compose run --rm migrate npx prisma migrate deploy
```

## Production deployment (Unix server)

The server deployment uses Docker Compose and a multi-stage Dockerfile.

Key files:

- `docker-compose.yml` (app + db + migrate + caddy)
- `docker-compose.prod.yml` (overrides Caddy to use `Caddyfile.prod`)
- `Caddyfile.prod` (reverse proxy for a real domain)

There’s also a detailed runbook in `DEPLOY.md`.

### One-time server setup

1) Install Docker + Docker Compose on the server.
2) Put your `.env` file on the server (same directory as `docker-compose.yml`).
3) Ensure your `.env` includes:

- `DATABASE_URL` (either points to the compose `db` service, or to an external Postgres)
- `NEXTAUTH_URL` (must be the public URL, e.g. `https://yourdomain.com`)
- `NEXTAUTH_SECRET`
- OAuth provider creds
- `CADDY_DOMAIN` (domain Caddy should serve)
- `CADDY_EMAIL` (optional but recommended for Let’s Encrypt)

### Standard deploy (no schema change)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Deploy WITH schema changes (Prisma migrations)

Recommended order:

1) Run migrations:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate npx prisma migrate deploy
```

2) Rebuild/restart app:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Useful production troubleshooting

- What’s running?

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

- App logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200 app
```

- Caddy logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200 caddy
```

- If `next build` fails during `docker compose ... --build`, the error is almost always:
  - TypeScript compilation error
  - Prisma client mismatch (`prisma generate` not run, or migrations not applied)

## Scripts

- Import users from old DB:

```bash
docker compose run --rm migrate node scripts/migrate-users.js
```

See `DEPLOY.md` for safe procedures and environment requirements.
