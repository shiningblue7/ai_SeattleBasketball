#!/usr/bin/env bash
set -euo pipefail

# Migrates users that exist in the old production DB but not in the new production DB.
# Default behavior is a dry run. Pass --run to actually create missing users.

OLD_DATABASE_URL="postgresql://postgres:A5eeGG364fABeBDg6eagfaA1Fe315aDF@roundhouse.proxy.rlwy.net:26238/railway"
NEW_DATABASE_URL="postgresql://neondb_owner:npg_pYTK8JD0IMQC@ep-hidden-sunset-aevpj172-pooler.c-2.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="dry-run"
SHOW_USERS="1"

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      MODE="dry-run"
      ;;
    --run)
      MODE="run"
      ;;
    --summary-only)
      SHOW_USERS="0"
      ;;
    --help|-h)
      cat <<'USAGE'
Usage:
  scripts/migrate-new-user.sh                 # dry run: list users missing in the new DB
  scripts/migrate-new-user.sh --dry-run       # same as default
  scripts/migrate-new-user.sh --summary-only  # dry run summary without listing users
  scripts/migrate-new-user.sh --run           # create only missing users in the new DB

Notes:
  - Existing target users are skipped, not updated.
  - Users without email are skipped.
  - rstefanus@gmail.com and kevinkaryadi@gmail.com are intentionally skipped.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Run scripts/migrate-new-user.sh --help for usage." >&2
      exit 2
      ;;
  esac
done

cd "$REPO_DIR"

export OLD_DATABASE_URL
export NEW_DATABASE_URL
export MODE
export SHOW_USERS

if [[ "$MODE" == "dry-run" ]]; then
  echo "Running dry run: old production DB -> new production DB"
else
  echo "Running migration: old production DB -> new production DB"
fi

node <<'NODE'
const { PrismaClient } = require("@prisma/client");

const oldDb = new PrismaClient({ datasourceUrl: process.env.OLD_DATABASE_URL });
const newDb = new PrismaClient({ datasourceUrl: process.env.NEW_DATABASE_URL });
const dryRun = process.env.MODE !== "run";
const showUsers = process.env.SHOW_USERS !== "0";
const ignoredEmails = new Set(["rstefanus@gmail.com", "kevinkaryadi@gmail.com"]);

function normalizeEmail(email) {
  return typeof email === "string" ? email.toLowerCase().trim() : null;
}

function toDate(value) {
  return value instanceof Date ? value : value ? new Date(value) : null;
}

async function main() {
  const columnRows = await oldDb.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User'"
  );
  const columnSet = new Set(columnRows.map((row) => row.column_name));
  const selectable = [
    "id",
    "email",
    "name",
    "image",
    "emailVerified",
    "passwordHash",
    "subject",
    "roles",
    "member",
    "createdAt",
  ].filter((column) => columnSet.has(column));

  if (!selectable.includes("id") || !selectable.includes("email")) {
    throw new Error("Old DB User table must have id and email columns");
  }

  const selectSql = selectable.map((column) => `"${column}"`).join(", ");
  const oldUsers = await oldDb.$queryRawUnsafe(
    `SELECT ${selectSql} FROM "User" ORDER BY "createdAt" DESC, "id" DESC`
  );

  let scanned = 0;
  let skippedNoEmail = 0;
  let skippedIgnored = 0;
  let skippedExists = 0;
  let created = 0;
  const missingUsers = [];

  for (const oldUser of oldUsers) {
    scanned += 1;
    const email = normalizeEmail(oldUser.email);

    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    if (ignoredEmails.has(email)) {
      skippedIgnored += 1;
      continue;
    }

    const existing = await newDb.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      skippedExists += 1;
      continue;
    }

    const subject =
      typeof oldUser.subject === "string" ? oldUser.subject : oldUser.subject?.toString?.();
    const mustResetPassword =
      typeof subject === "string" && subject.toLowerCase().includes("auth0");
    const passwordHash = mustResetPassword ? null : oldUser.passwordHash ?? null;

    const userData = {
      email,
      name: oldUser.name ?? null,
      image: oldUser.image ?? null,
      emailVerified: toDate(oldUser.emailVerified),
      passwordHash,
      mustResetPassword,
      roles: oldUser.roles ?? null,
      member: Boolean(oldUser.member),
    };

    missingUsers.push({
      oldId: oldUser.id,
      email,
      name: oldUser.name ?? null,
      member: Boolean(oldUser.member),
      roles: oldUser.roles ?? null,
      createdAt: oldUser.createdAt ?? null,
      mustResetPassword,
    });

    if (!dryRun) {
      await newDb.user.create({ data: userData, select: { id: true } });
    }

    created += 1;
  }

  const summary = {
    dryRun,
    scanned,
    skippedNoEmail,
    skippedIgnored,
    skippedExists,
    missingInNewDb: missingUsers.length,
    created: dryRun ? 0 : created,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (showUsers && missingUsers.length > 0) {
    console.log("\nUsers missing in new DB:");
    for (const user of missingUsers) {
      const createdAt = user.createdAt ? new Date(user.createdAt).toISOString() : "unknown date";
      console.log(
        `- oldId=${user.oldId} | ${user.name ?? "(no name)"} | ${user.email} | member=${user.member} | createdAt=${createdAt}`
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([oldDb.$disconnect(), newDb.$disconnect()]);
  });
NODE
