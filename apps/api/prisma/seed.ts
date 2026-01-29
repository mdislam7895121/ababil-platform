import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const existingTenant = await prisma.tenant.findFirst({
    where: { slug: 'demo-tenant' }
  });

  if (existingTenant) {
    console.log('Demo tenant already exists, updating user password...');
    
    const existingUser = await prisma.user.findFirst({
      where: { email: 'admin@example.com' }
    });
    
    if (existingUser) {
      const passwordHash = await bcrypt.hash('password123', 12);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash }
      });
      console.log('Updated password for admin@example.com');
    }
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

  const passwordHash = await bcrypt.hash('password123', 12);

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
