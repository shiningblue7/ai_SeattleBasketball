const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  console.log('Recent users:');
  users.forEach(u => {
    console.log(`${u.email} | ${u.name || 'no name'} | ${u.createdAt.toISOString().slice(0,10)}`);
  });

  const domains = {};
  users.forEach(u => {
    const domain = u.email.split('@')[1]?.toLowerCase();
    if (domain) domains[domain] = (domains[domain] || 0) + 1;
  });
  console.log('\nEmail domain counts:');
  Object.entries(domains).sort((a,b)=>b[1]-a[1]).forEach(([d,c]) => console.log(`${d}: ${c}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
