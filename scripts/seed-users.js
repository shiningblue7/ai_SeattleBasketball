async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { hash } = await import("bcryptjs");

  const prisma = new PrismaClient();
  const basePassword = "password123";

  for (let i = 1; i <= 20; i += 1) {
    const email = `testuser${i}@example.com`;
    const name = `Test User ${i}`;
    const member = i <= 10;

    const passwordHash = await hash(basePassword, 12);

    await prisma.user.upsert({
      where: { email },
      update: {
        name,
        member,
        passwordHash,
      },
      create: {
        email,
        name,
        member,
        passwordHash,
      },
    });
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
