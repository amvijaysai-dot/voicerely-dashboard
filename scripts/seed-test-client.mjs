// Seed a test client tenant into Postgres.
// Run: node scripts/seed-test-client.mjs [password]
// Default password: test123

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
  const password = process.argv[2] ?? 'test123';
  const passwordHash = hashSync(password, 10);

  const existing = await prisma.tenant.findUnique({ where: { username: 'test-client' } });
  if (existing) {
    console.log('⚠️  Test client tenant already exists. Updating password hash only.');
    await prisma.tenant.update({
      where: { username: 'test-client' },
      data: { passwordHash },
    });
    console.log('✅ Test client password updated.');
    return;
  }

  await prisma.tenant.create({
    data: {
      id: 'test-client',
      clientName: 'Test Client',
      username: 'test-client',
      passwordHash,
      allowedMinutes: 1000,
      usedMinutes: 0,
      perMinuteRate: 0.18,
      avgBookingValue: 210,
      status: 'active',
      isAdmin: false,
      email: 'test@voicerely.app',
    },
  });
  console.log('✅ Test client tenant seeded. Username: test-client, Password:', password);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());