// One-time fix: detects and reports duplicate agentIds across tenants.
// Run: node scripts/fix-duplicate-agents.mjs
// In dry-run mode (default) it only reports. Pass --fix to remove duplicates.
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const isDryRun = !process.argv.includes('--fix');
const filePath = join(process.cwd(), 'data', 'tenants.json');

let tenants;
try {
  tenants = JSON.parse(readFileSync(filePath, 'utf8'));
} catch {
  console.log('No data/tenants.json found — nothing to fix.');
  process.exit(0);
}

const seen = new Map(); // agentId -> tenantId
let hasConflicts = false;

for (const tenant of tenants) {
  for (const agentId of (tenant.agentIds ?? [])) {
    if (seen.has(agentId)) {
      hasConflicts = true;
      console.warn(`⚠️  CONFLICT: agentId "${agentId}" on tenant "${tenant.id}" already claimed by "${seen.get(agentId)}"`);
      if (!isDryRun) {
        tenant.agentIds = tenant.agentIds.filter(id => id !== agentId);
        console.log(`   Removed from "${tenant.id}"`);
      }
    } else {
      seen.set(agentId, tenant.id);
    }
  }
}

if (!hasConflicts) {
  console.log('✅ No duplicate agentIds found.');
} else if (isDryRun) {
  console.log('\nRun with --fix to remove duplicates from the later-occurring tenant.');
} else {
  writeFileSync(filePath, JSON.stringify(tenants, null, 2));
  console.log('\n✅ data/tenants.json updated.');
}