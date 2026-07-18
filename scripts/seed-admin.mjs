// Seed the Super Admin tenant into Postgres.
// Run once: node scripts/seed-admin.mjs
// Usage: node scripts/seed-admin.mjs [password]
// Default password: admin123 (change immediately after first login)

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hashSync } from 'bcryptjs';

// Load environment variables from .env.local
config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 10,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = process.argv[2] ?? 'admin123';
  const passwordHash = hashSync(password, 10);

  const existing = await prisma.tenant.findUnique({ where: { username: 'admin' } });
  if (existing) {
    console.log('⚠️  Admin tenant already exists. Updating password hash only.');
    await prisma.tenant.update({
      where: { username: 'admin' },
      data: { passwordHash },
    });
    console.log('✅ Admin password updated.');
    return;
  }

  await prisma.tenant.create({
    data: {
      id: 'admin',
      clientName: 'Voicerely Super Admin',
      username: 'admin',
      passwordHash,
      allowedMinutes: 0,
      usedMinutes: 0,
      perMinuteRate: 0,
      status: 'active',
      isAdmin: true,
    },
  });
  console.log('✅ Super Admin tenant seeded. Username: admin, Password:', password);
  console.log('⚠️  Change this password immediately after your first login.');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());