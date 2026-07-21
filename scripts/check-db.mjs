#!/usr/bin/env node
/**
 * Database Health Check Script
 * 
 * Verifies database connectivity and schema readiness.
 * Exits with code 0 on success, non-zero on failure.
 * 
 * Usage: node scripts/check-db.mjs
 *        npm run db:check
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Load environment variables from .env.local
config({ path: '.env.local' });

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET');
console.log('DIRECT_URL:', process.env.DIRECT_URL ? 'SET (hidden)' : 'NOT SET');

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 10,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkDatabase() {
  console.log('🔍 Checking database connectivity...');
  
  try {
    // Test basic connectivity
    await prisma.$connect();
    console.log('✅ Database connection established');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as health_check`;
    console.log('✅ Query test passed:', result);
    
    // Check if Tenant table exists and has expected columns
    const tenantCount = await prisma.tenant.count();
    console.log(`✅ Tenant table accessible (${tenantCount} tenants)`);
    
    // Check for billing cycle columns
    const tenant = await prisma.tenant.findFirst({
      select: {
        id: true,
        clientName: true,
        billingCycleStart: true,
        billingCycleEnd: true,
        passwordHash: true,
        passwordSetupTokenHash: true,
        passwordSetupExpiresAt: true,
      }
    });
    
    if (tenant) {
      console.log('✅ Tenant schema verified (billingCycleStart, billingCycleEnd, passwordHash, passwordSetupTokenHash, passwordSetupExpiresAt present)');
      console.log(`   Sample tenant: ${tenant.clientName} (${tenant.id})`);
      console.log(`   billingCycleStart: ${tenant.billingCycleStart}`);
      console.log(`   billingCycleEnd: ${tenant.billingCycleEnd}`);
      console.log(`   passwordHash: ${tenant.passwordHash ? '[SET]' : '[NOT SET]'}`);
      console.log(`   passwordSetupTokenHash: ${tenant.passwordSetupTokenHash ? '[SET]' : '[NOT SET]'}`);
      console.log(`   passwordSetupExpiresAt: ${tenant.passwordSetupExpiresAt}`);
    } else {
      console.log('⚠️  No tenants found in database (schema exists but empty)');
    }
    
    // Check for CallLog table
    const callLogCount = await prisma.callLog.count();
    console.log(`✅ CallLog table accessible (${callLogCount} records)`);
    
     // Check for AuditLog table
     const auditLogCount = await prisma.auditLog.count();
     console.log(`✅ AuditLog table accessible (${auditLogCount} records)`);
     
     // Check tenant Retell API keys and agent IDs
     const tenants = await prisma.tenant.findMany({
       where: { isAdmin: false },
       include: { retellApiKey: true }
     });
     console.log(`\n📋 Client Tenants (${tenants.length}):`);
     for (const t of tenants) {
       const hasKey = !!t.retellApiKey?.encrypted;
       const keyPrefix = t.retellApiKey?.encrypted?.substring(0, 20) + '...';
       console.log(`   - ${t.clientName} (${t.id})`);
       console.log(`     agentIds: ${JSON.stringify(t.agentIds)}`);
       console.log(`     hasRetellKey: ${hasKey}`);
       if (hasKey) console.log(`     retellKeyPrefix: ${keyPrefix}`);
     }
     
     console.log('\n✅ All database health checks passed!');
     return true;
     
   } catch (error) {
     console.error('❌ Database health check failed:', error.message);
     return false;
   } finally {
     await prisma.$disconnect();
   }
 }

 const success = await checkDatabase();
 process.exit(success ? 0 : 1);
