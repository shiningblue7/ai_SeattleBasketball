async function main() {
  const { PrismaClient } = await import("@prisma/client");

  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
  const dryRun = process.env.DRY_RUN === "1";

  if (!sourceUrl) {
    throw new Error("SOURCE_DATABASE_URL is required");
  }

  if (!targetUrl) {
    throw new Error("TARGET_DATABASE_URL or DATABASE_URL is required");
  }

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient({ datasourceUrl: targetUrl });

  let scanned = 0;
  let skippedNoEmail = 0;
  let skippedIgnored = 0;
  let created = 0;
  let updated = 0;

  try {
    const pageSize = 250;
    let cursor = null;

    const columnRows = await source.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User'"
    );
    const columnSet = new Set(columnRows.map((r) => r.column_name));

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
    ].filter((c) => columnSet.has(c));

    if (!selectable.includes("id") || !selectable.includes("email")) {
      throw new Error(
        `Source DB is missing required columns on User: ${[
          !selectable.includes("id") ? "id" : null,
          !selectable.includes("email") ? "email" : null,
        ]
          .filter(Boolean)
          .join(", ")}`
      );
    }

    const selectSql = selectable.map((c) => `"${c}"`).join(", ");

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = cursor
        ? await source.$queryRawUnsafe(
            `SELECT ${selectSql} FROM "User" WHERE "id" > $1 ORDER BY "id" ASC LIMIT $2`,
            cursor,
            pageSize
          )
        : await source.$queryRawUnsafe(
            `SELECT ${selectSql} FROM "User" ORDER BY "id" ASC LIMIT $1`,
            pageSize
          );

      if (rows.length === 0) break;

      for (const u of rows) {
        scanned += 1;

        const email = u.email?.toLowerCase?.().trim?.() ?? null;
        if (!email) {
          skippedNoEmail += 1;
          continue;
        }

        if (email === "rstefanus@gmail.com" || email === "kevinkaryadi@gmail.com") {
          skippedIgnored += 1;
          continue;
        }

        const subject =
          typeof u.subject === "string" ? u.subject : u.subject?.toString?.();
        const mustResetPassword =
          typeof subject === "string" && subject.toLowerCase().includes("auth0");

        const passwordHash = mustResetPassword ? null : (u.passwordHash ?? null);

        const existing = await target.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (dryRun) {
          if (existing) updated += 1;
          else created += 1;
          continue;
        }

        await target.user.upsert({
          where: { email },
          update: {
            name: u.name,
            image: u.image ?? null,
            emailVerified: u.emailVerified ?? null,
            passwordHash,
            mustResetPassword,
            roles: u.roles,
            member: Boolean(u.member),
          },
          create: {
            email,
            name: u.name,
            image: u.image ?? null,
            emailVerified: u.emailVerified ?? null,
            passwordHash,
            mustResetPassword,
            roles: u.roles,
            member: Boolean(u.member),
          },
          select: { id: true },
        });

        if (existing) updated += 1;
        else created += 1;
      }

      cursor = rows[rows.length - 1].id;
    }
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }

  // Summary
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned,
        skippedNoEmail,
        skippedIgnored,
        created,
        updated,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
