# Deployment Runbook

This app is deployed as a Next.js + Prisma + Postgres stack, typically behind Caddy.

This document covers:

- Deploying a new app version
- Running Prisma migrations in production
- Importing users from an old database
- Wiping ONLY the users table safely in production

## Assumptions

- You deploy using Docker (multi-stage build) and run `migrate` jobs inside a container.
- Production Postgres is already provisioned and reachable via `DATABASE_URL`.
- You have a way to run one-off containers on the server (e.g. `docker compose run --rm migrate ...`).

## Environment variables

At minimum, production needs:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- OAuth provider vars (Google):
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Optional/operational:
  - `ROLES_ADMIN_EMAILS` (or whatever mechanism you use to mark admins)

Keep secrets out of git and avoid printing them in logs.

## Standard production deploy (no schema change)

1. Pull latest code / image on the server
2. Rebuild the app image
3. Restart the app container

If you run behind Caddy, ensure Caddy is still pointing to the correct upstream.

## Production deploy WITH schema change (Prisma migrations)

When schema changes exist, the safe order is:

1. **Run migrations** (one-off job)
2. **Rebuild / restart** the app

### 1) Run migrations

Run migrations using the migrate container/stage. The exact command depends on how your production compose file is set up. Typical pattern:

- `docker compose run --rm migrate npx prisma migrate deploy`

Notes:

- `migrate deploy` applies existing checked-in migrations.
- If you need Prisma Client generation in the migrate container (for scripts), ensure the image includes `npx prisma generate` during build.

### 2) Restart app

After migrations, rebuild/restart the app container.

If you do blue/green, ensure the new revision points at the migrated DB.

## Import users from old DB -> new DB

User import is done via the Node script:

- `scripts/migrate-users.js`

This script is designed to:

- Read from an old database via a separate connection string
- Upsert users into the current database by email

### Required env vars

- `DATABASE_URL` (target/current DB)
- `SOURCE_DATABASE_URL` (old DB)

### Run import inside migrate container

Typical pattern:

- `docker compose run --rm migrate node scripts/migrate-users.js`

If your script supports it, run a dry-run first (recommended) and review output.

## Wipe ONLY users table (production-safe)

This is dangerous. Only do this if you are certain.

### Why it’s tricky

- Users are referenced by signups and guest signups.
- If you delete users without handling related rows, you can break foreign keys.

### Safe approach options

#### Option A (recommended): wipe dependent rows first

1. Delete or truncate dependent tables that reference users (in the right order)
2. Delete users

The exact tables depend on your Prisma schema. Typical ones:

- `SignUp`
- `GuestSignUp`
- `Account` / `Session` / `VerificationToken` (NextAuth)

#### Option B: delete users with cascading FKs

Only if your DB foreign keys are configured with cascading deletes. Verify first.

### Suggested operational procedure

1. Put the site in maintenance mode (or stop the app) to prevent new writes.
2. Take a DB backup/snapshot.
3. Run the wipe using a one-off job container.
4. Restart the app.

### Example wipe command

Because schemas differ over time, implement the wipe as a script (preferred) or carefully executed SQL.

If you add a script, run it like:

- `docker compose run --rm migrate node scripts/wipe-users.js`

If you must do SQL, do it inside a trusted DB console after a backup.

## Troubleshooting

### Prisma Client type errors after deploy

- Ensure migrations have been applied
- Ensure `prisma generate` ran in the build stage(s) that need it

### OAuth redirect mismatch

- Confirm `NEXTAUTH_URL` matches the public URL (scheme + host)
- Confirm Google OAuth redirect URIs include the deployed callback URL

### Script fails due to missing node_modules

- Run scripts inside the container that has dependencies installed.
- Ensure the migrate container image includes `node_modules` and Prisma Client.
