import { PrismaClient } from '@prisma/client';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('Seeding database...');

  const existingTenant = await prisma.tenant.findFirst({
    where: { slug: 'demo-tenant' }
  });

  if (existingTenant) {
    console.log('Demo tenant already exists, skipping seed.');
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Demo Workspace',
      slug: 'demo-tenant',
      plan: 'pro',
      settings: {}
    }
  });

  console.log(`Created tenant: ${tenant.name} (${tenant.id})`);

  const passwordHash = await hashPassword('password123');

  const user = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      name: 'Demo Admin',
      passwordHash,
      status: 'active'
    }
  });

  console.log(`Created user: ${user.email} (${user.id})`);

  await prisma.membership.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner'
    }
  });

  console.log(`Created membership: ${user.email} is owner of ${tenant.name}`);

  console.log('');
  console.log('========================================');
  console.log('Seed completed successfully!');
  console.log('');
  console.log('Test Credentials:');
  console.log('  Email:    admin@example.com');
  console.log('  Password: password123');
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
